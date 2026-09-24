import { CODEX_MODELS, supportedEffort } from '../models/catalog.js';
import { codexImageEvent } from './images.js';
import { accessSync, constants, existsSync, lstatSync, mkdirSync, statSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { LoginFlow, ProviderAdapter, RunRequest } from './adapter.js';
import { codexWebSearch } from './webSearch.js';
import { EventQueue, JsonRpcProcess, type RpcNotification } from './jsonRpc.js';
import { getNumber, getObject, getString } from './ndjson.js';
import { detectCodexLimit } from './limits.js';
import { describeToolUse, toolUseEvent } from './toolDetail.js';
import { taskListTracker, tasksFromCodexPlan } from './taskList.js';
import { codexApprovalKind } from './permission.js';
import { createRunGate, deferDenial } from './runGate.js';
import { approvalSignature } from './approvalSignature.js';
import { buildChildEnv } from '../accounts/env.js';
import { CODEX_IDLE_MS } from '../util/timeouts.js';
import { exitsZero } from '../util/process.js';
import {
  WEB_SEARCH_SETUP_FAILED,
  appendTail,
  exitOutcome,
  limitOrError,
  scopedMcpRefusal,
  setupFailure,
  usageOf,
} from './outcome.js';
import type { AdapterEvent, PermissionMode, ResolvedAccount, Usage } from '../types.js';

/** Wo Codex seinen Zustand hält, wenn CODEX_HOME nichts anderes sagt. */
function codexHome(env: NodeJS.ProcessEnv = {}): string {
  return env.CODEX_HOME ?? join(homedir(), '.codex');
}

/** Der Ordner des Werkzeug-Hosts innerhalb eines CODEX_HOME. */
const pluginHostDir = (home: string): string => join(home, 'plugins', '.plugin-appserver');

/**
 * Codex' Werkzeuge für Dateizugriff laufen in einem eigenen Prozess
 * (`codex-code-mode-host`), den die CLI einmal neben ihre Installation legt.
 *
 * Cortex gibt jedem Konto ein eigenes CODEX_HOME — richtig für Zugangsdaten,
 * falsch für diese Binärdateien: im frischen Profil fehlen sie, und jeder
 * Dateizugriff scheitert mit `No such file or directory`. Sie gehören zur
 * Installation, nicht zum Konto, also wird der gemeinsame Ordner verlinkt statt
 * 280 MB je Profil zu kopieren. Ein bereits vorhandener Eintrag bleibt unberührt.
 */
export function usableCodexPluginHost(directory: string): boolean {
  try { const path = join(directory, 'codex-code-mode-host'); accessSync(path, constants.X_OK); return statSync(path).isFile(); }
  catch { return false; }
}

export function shareCodexPluginHost(homeDir: string | undefined, shared = pluginHostDir(codexHome())): void {
  if (!homeDir) return;
  const target = pluginHostDir(homeDir);
  try {
    if (!usableCodexPluginHost(shared) || existsSync(target) || lstatSync(target, { throwIfNoEntry: false })) return;
    mkdirSync(join(homeDir, 'plugins'), { recursive: true });
    symlinkSync(shared, target);
  } catch {
    // Ohne Verknüpfung meldet die CLI den fehlenden Host selbst — das ist eine
    // ehrlichere Fehlermeldung als ein Abbruch beim Start.
  }
}

const SANDBOX: Record<PermissionMode, string> = {
  safe: 'read-only',
  edits: 'workspace-write',
  full: 'danger-full-access',
};

/**
 * Codex already counts the cache into `input_tokens` and breaks out the cached
 * part, so the input side needs no arithmetic. Its reasoning tokens are billed
 * and produced like output but reported separately, so they belong in the
 * output figure rather than nowhere.
 */
export function codexUsage(usage: Record<string, unknown> | undefined): Usage {
  const at = (key: string): number => getNumber(usage, key) ?? 0;
  const input = at('input_tokens');
  const cached = at('cached_input_tokens');
  const output = at('output_tokens') + at('reasoning_output_tokens');
  return usageOf(input, output, cached);
}

/** Item types worth showing in the tool timeline, mapped to display names. */
const TOOL_ITEM_NAMES: Record<string, string> = {
  commandExecution: 'Shell',
  fileChange: 'Edit',
  mcpToolCall: 'MCP',
  dynamicToolCall: 'Tool',
  webSearch: 'WebSearch',
  imageView: 'ViewImage',
  imageGeneration: 'ImageGen',
  subAgentActivity: 'Agent',
  collabAgentToolCall: 'Agent',
  contextCompaction: 'Compact',
};

/** Codex wraps API errors as JSON-escaped strings, sometimes twice — dig out the human message. */
export function unwrapErrorMessage(raw: string): string {
  const extract = (value: unknown, depth: number): string | undefined => {
    if (depth > 12) return undefined;
    if (typeof value === 'string') {
      const text = value.trim();
      try { const decoded: unknown = JSON.parse(text); if (decoded !== value) return extract(decoded, depth + 1) ?? text; } catch { /* plain text */ }
      const start = text.indexOf('{');
      if (start > 0 && text.endsWith('}')) {
        try { return extract(JSON.parse(text.slice(start)), depth + 1) ?? text; } catch { /* keep original */ }
      }
      return text || undefined;
    }
    if (value && typeof value === 'object') {
      const object = value as Record<string, unknown>;
      for (const key of ['error', 'message', 'detail', 'errors']) {
        const found = extract(object[key], depth + 1);
        if (found) return found;
      }
      if (Array.isArray(value)) return value.map(item => extract(item, depth + 1)).filter(Boolean).join('; ') || undefined;
    }
    return undefined;
  };
  return extract(raw, 0) ?? raw;
}

export function missingCodexSession(message: string): boolean {
  return /(?:thread|session|rollout)[^\n]{0,100}(?:not found|does not exist|missing|deleted|expired)|(?:not found|no such|missing|unknown)[^\n]{0,60}(?:thread|session|rollout)|no (?:thread|session|rollout)(?: file)? found/i.test(message);
}

/**
 * Codex over its app-server protocol (line-delimited JSON-RPC) — the same
 * transport its editor integrations use. Unlike `codex exec`, the thread
 * stays open, so `turn/steer` can push a message into the RUNNING turn and
 * the model reacts immediately.
 */
export class CodexAdapter implements ProviderAdapter {
  readonly id = 'codex' as const;
  readonly displayName = 'Codex CLI';
  readonly supportsNativeResume = true;
  readonly models = CODEX_MODELS;

  constructor(private cliPath = 'codex') {}

  buildEnv(account: ResolvedAccount, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    shareCodexPluginHost(account.homeDir);
    return buildChildEnv(account, base);
  }

  async *run(
    req: RunRequest,
    account: ResolvedAccount,
    signal: AbortSignal,
  ): AsyncGenerator<AdapterEvent> {
    const mcpRefusal = scopedMcpRefusal(this.id, req.mcpServers);
    if (mcpRefusal) {
      yield mcpRefusal;
      return;
    }
    let webSearch: { args: string[]; env: Record<string, string> };
    try {
      webSearch = codexWebSearch(req.webSearch);
    } catch (error) {
      yield setupFailure(error, WEB_SEARCH_SETUP_FAILED);
      return;
    }
    const events = new EventQueue<AdapterEvent>();
    const env = { ...this.buildEnv(account, process.env), ...webSearch.env };

    let threadId: string | undefined;
    let activeTurnId: string | undefined;
    let text = '';
    let finished = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingApprovals = 0;
    const idleMs = req.idleTimeoutMs && Number.isFinite(req.idleTimeoutMs) && req.idleTimeoutMs > 0 ? req.idleTimeoutMs : CODEX_IDLE_MS;
    const activity = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (finished || pendingApprovals) return;
      idleTimer = setTimeout(() => finish({ type: 'error', message: `Codex hat seit ${Math.round(idleMs / 1000)} Sekunden keine Aktivität gemeldet. Der Auftrag wurde angehalten; du kannst ihn erneut starten.`, retryable: false }), idleMs);
      idleTimer.unref?.();
    };
    let stderrTail = '';
    const trackTasks = taskListTracker();
    const openItems = new Map<string, string>();
    const deniedFeedback = new Map<string, { text: string; threadId?: string; turnId?: string }>();
    const deferFeedback = (id: string) => {
      const feedback = deniedFeedback.get(id);
      if (!feedback) return;
      deniedFeedback.delete(id);
      deferDenial(events, feedback.text);
    };

    const { gate, close: closeGate } = createRunGate({
      req,
      events,
      // Codex asks here only when it needs an escalation; edits mode must not
      // silently allow that escalation merely because per-action ask is off.
      ask: req.permissionMode === 'edits' || req.askPermission === true,
      finished: () => finished,
      onDenialReason: (id, reason) => deniedFeedback.set(id, { text: reason, threadId, turnId: activeTurnId }),
    });

    const finish = (event?: AdapterEvent) => {
      if (finished) return;
      finished = true;
      if (idleTimer) clearTimeout(idleTimer);
      closeGate();
      for (const id of deniedFeedback.keys()) deferFeedback(id);
      if (event) events.push(event);
      events.end();
      rpc.dispose();
    };

    const onNotification = (n: RpcNotification) => {
      switch (n.method) {
        case 'thread/started': {
          const id = getString(n.params, 'thread', 'id') ?? getString(n.params, 'threadId');
          if (id && !threadId) {
            threadId = id;
            events.push({ type: 'session', sessionId: id });
          }
          break;
        }
        case 'turn/started': {
          activeTurnId =
            getString(n.params, 'turn', 'id') ?? getString(n.params, 'turnId') ?? activeTurnId;
          break;
        }
        case 'item/agentMessage/delta': {
          const delta = getString(n.params, 'delta');
          if (delta) {
            text += delta;
            events.push({ type: 'text-delta', text: delta });
          }
          break;
        }
        case 'item/started': {
          const item = getObject(n.params, 'item');
          const type = getString(item, 'type');
          const itemId = getString(item, 'id');
          if (!type) break;
          const name = TOOL_ITEM_NAMES[type];
          if (name) {
            if (itemId) openItems.set(itemId, name);
            // Codex puts the arguments on the item itself; the shared describer
            // turns them into the same file/diff view every provider gets.
            const info = describeToolUse(
              getString(item, 'toolName') ?? name,
              { ...item, ...(getObject(item, 'arguments') ?? {}) },
              req.cwd,
            );
            events.push(toolUseEvent(name, info));
          }
          break;
        }
        case 'turn/plan/updated': {
          const tasks = trackTasks(tasksFromCodexPlan(n.params));
          if (tasks) events.push(tasks);
          break;
        }
        case 'item/completed': {
          const item = getObject(n.params, 'item');
          const itemId = getString(item, 'id');
          if (itemId) openItems.delete(itemId);
          const image = codexImageEvent(item, codexHome(env), threadId);
          if (image) events.push(image);
          break;
        }
        case 'turn/completed': {
          const turn = getObject(n.params, 'turn');
          const status = getString(turn, 'status');
          if (status === 'failed') {
            const message = unwrapErrorMessage(
              getString(turn, 'error', 'message') ?? 'codex turn failed',
            );
            finish(limitOrError(message, detectCodexLimit));
            break;
          }
          finish({ type: 'result', text, usage: codexUsage(getObject(turn, 'usage')), checkpoint: getString(turn, 'id') ?? activeTurnId });
          break;
        }
        case 'error': {
          // The app-server nests it (`params.error.message`); older builds sent it flat.
          const message = unwrapErrorMessage(getString(n.params, 'error', 'message') ?? getString(n.params, 'message') ?? 'codex error');
          finish(limitOrError(message, detectCodexLimit));
          break;
        }
        default:
          break;
      }
    };

    // Codex takes reasoning effort as a config key, and `-c` overrides it for
    // this process only — the user's own config.toml is left alone.
    const effort = supportedEffort(this.id, req.model, req.effort);
    const effortArgs = effort ? ['-c', `model_reasoning_effort=${effort}`] : [];
    // These are CLI feature config keys (verified with `codex features list`).
    // A standalone installation without the optional host keeps standard tools.
    const hostDir = pluginHostDir(codexHome(env));
    const hostArgs = usableCodexPluginHost(hostDir) ? [] : ['-c', 'features.code_mode_host=false', '-c', 'features.code_mode=false', '-c', 'features.code_mode_only=false'];

    const rpc = new JsonRpcProcess(this.cliPath, [...effortArgs, ...hostArgs, ...webSearch.args, 'app-server'], {
      cwd: req.cwd,
      env,
      signal,
      onNotification,
      onActivity: activity,
      // Codex asks before running commands and before applying patches. In
      // ask mode that question reaches the user; otherwise the permission
      // mode answers it, and a run never hangs on a dialog nobody sees.
      onServerRequest: async (r) => {
        const kind = codexApprovalKind(r.method);
        if (!kind) return { decision: 'denied' };
        if (req.permissionMode === 'safe' && kind !== 'read') return { decision: 'denied' };
        const detail =
          getString(r.params, 'command') ??
          getString(r.params, 'reason') ??
          getString(r.params, 'patch');
        pendingApprovals++;
        activity();
        try { const decision = await gate.ask({
          id: `${r.id}`,
          kind,
          title:
            kind === 'command'
              ? `run \`${(detail ?? 'a command').split('\n')[0]}\``
              : kind === 'edit'
                ? `apply changes to ${getString(r.params, 'path') ?? 'the workspace'}`
                : 'a permission change',
          detail,
          path: getString(r.params, 'path'),
          tool: r.method,
          signature: approvalSignature(r.params, req.cwd),
        });
        return { decision: decision.outcome === 'deny' ? 'denied' : 'approved' };
        } finally { pendingApprovals--; activity(); }
      },
      onServerResponse: (request) => {
        const id = String(request.id), feedback = deniedFeedback.get(id);
        if (!feedback) return;
        if (finished || !feedback.threadId || !feedback.turnId || feedback.threadId !== threadId || feedback.turnId !== activeTurnId) { deferFeedback(id); return; }
        // The denial was written first. This steers only the still-running,
        // expected turn; it never starts or replaces a user turn.
        void rpc.request('turn/steer', {
          threadId: feedback.threadId,
          expectedTurnId: feedback.turnId,
          input: [{ type: 'text', text: `Der Nutzer hat die Aktion abgelehnt. Seine Begründung:\n${feedback.text}\nBeachte diese Vorgabe bei deinen nächsten Schritten.` }],
        }).then(() => {
          if (!deniedFeedback.delete(id)) return;
          events.push({ type: 'notice', text: 'Die Aktion wurde abgelehnt. Deine Begründung wurde dem laufenden Agenten übergeben.' });
        }, () => deferFeedback(id));
      },
      onStderr: (line) => {
        if (!line.includes('models cache')) stderrTail = appendTail(stderrTail, line);
      },
      onExit: () => {
        if (!finished) finish(exitOutcome(text, stderrTail, detectCodexLimit, 'codex app-server exited unexpectedly'));
      },
      onSpawnError: (message) => finish({ type: 'error', message, retryable: false }),
    });

    const onAbort = () => finish();
    if (signal.aborted) { finish(); return; }
    signal.addEventListener('abort', onAbort, { once: true });
    rpc.start();
    activity();

    void (async () => {
      try {
        await rpc.request('initialize', {
          clientInfo: { name: 'cortex', version: '0.1.0' },
        });
        rpc.notify('initialized', {});

        const threadParams: Record<string, unknown> = {
          cwd: req.cwd,
          // 'never' would decide everything server-side and never reach us, so
          // ask mode has to opt in to being asked.
          approvalPolicy: req.permissionMode === 'edits' || req.askPermission ? 'on-request' : 'never',
          sandbox: SANDBOX[req.permissionMode],
        };
        if (req.model) threadParams.model = req.model;
        // developerInstructions adds to Codex's own base prompt; baseInstructions
        // would replace it, which would make it worse, not better.
        if (req.systemBrief?.trim()) threadParams.developerInstructions = req.systemBrief;

        let started: Record<string, unknown>;
        // A thread that could not be resumed is a thread that remembers
        // nothing, so the message written for it has to change too.
        let resumed = false;
        if (req.resumeSessionId) {
          try {
            // Going back to an earlier turn forks the thread through that turn;
            // the original thread keeps everything that came after.
            started = req.resumeAt
              ? await rpc.request('thread/fork', {
                  ...threadParams,
                  threadId: req.resumeSessionId,
                  lastTurnId: req.resumeAt,
                  excludeTurns: true,
                })
              : await rpc.request('thread/resume', {
                  ...threadParams,
                  threadId: req.resumeSessionId,
                });
            resumed = true;
          } catch (error) {
            if (!missingCodexSession(unwrapErrorMessage(error instanceof Error ? error.message : String(error)))) throw error;
            // Thread rolled off disk or belongs to another cwd — start fresh.
            events.push({ type: 'notice', text: 'Die vorherige Codex-Sitzung ist nicht mehr verfügbar. Der gespeicherte Gesprächskontext wird in einer neuen Sitzung wiederhergestellt.' });
            started = await rpc.request('thread/start', threadParams);
          }
        } else {
          started = await rpc.request('thread/start', threadParams);
        }
        const id = getString(started, 'thread', 'id') ?? getString(started, 'threadId');
        if (id && !threadId) {
          threadId = id;
          events.push({ type: 'session', sessionId: id });
        }
        if (!threadId) throw new Error('codex app-server did not return a thread id');

        const turn = await rpc.request('turn/start', {
          threadId,
          ...(req.model ? { model: req.model } : {}),
          ...(effort ? { effort } : {}),
          // Bilder als lokale Bilder, nicht nur als Pfad im Text (attachments.ts).
          input: [
            { type: 'text', text: resumed ? req.prompt : (req.coldPrompt ?? req.prompt) },
            ...(req.images ?? []).map(img => ({ type: 'localImage', path: img.path })),
          ],
        });
        activeTurnId = getString(turn, 'turn', 'id') ?? activeTurnId;

        // Live steering: a message sent while this turn runs reaches the model.
        if (req.handle) {
          // turn/steer folds the message into the running turn.
          req.handle.injectMode = 'inline';
          req.handle.inject = async (injected: string) => {
            if (finished || !threadId || !activeTurnId) return false;
            try {
              await rpc.request('turn/steer', {
                threadId,
                expectedTurnId: activeTurnId,
                input: [{ type: 'text', text: injected }],
              });
              return true;
            } catch { return false; }
          };
        }
      } catch (e) {
        finish(limitOrError(unwrapErrorMessage((e as Error).message), detectCodexLimit));
      }
    })();

    try {
      for await (const event of events) yield event;
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (idleTimer) clearTimeout(idleTimer);
      if (req.handle) req.handle.inject = undefined;
      rpc.dispose();
    }
  }

  interactiveCommand(account: ResolvedAccount, model?: string) {
    const command = [this.cliPath];
    if (model) command.push('-m', model);
    return { command, env: this.buildEnv(account, process.env) };
  }

  loginFlow(profileDir: string): LoginFlow {
    return {
      terminalCommand: [this.cliPath, 'login'],
      env: { CODEX_HOME: profileDir },
      watch: { kind: 'file', path: join(profileDir, 'auth.json') },
      instructions:
        'A browser window will open — sign in with the ChatGPT account you want to add. ' +
        'cortex detects the completed login automatically.',
      verify: () => exitsZero(this.cliPath, ['login', 'status'], { ...process.env, CODEX_HOME: profileDir }),
    };
  }
}
