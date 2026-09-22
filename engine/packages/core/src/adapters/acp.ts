import { EventQueue, JsonRpcProcess } from './jsonRpc.js';
import { readImageBase64 } from './attachments.js';
import { getNumber, getObject, getString } from './ndjson.js';
import { isTransientFailure } from './limits.js';
import { describeToolUse } from './toolDetail.js';
import { acpImageEvent } from './images.js';
import { sameTasks, tasksFromAcpPlan } from './taskList.js';
import { PermissionGate, acpPermissionKind } from './permission.js';
import { approvalSignature } from './approvalSignature.js';
import { supportedEffort } from '../models/catalog.js';
import type { AdapterEvent, LimitInfo, Usage } from '../types.js';
import type { RunRequest } from './adapter.js';
import { scopedMcpUnsupportedMessage } from '../mcp/runPolicy.js';

/**
 * Agent Client Protocol runner — the JSON-RPC dialect Grok CLI (`--acp`)
 * and Copilot CLI (`--acp`) both speak for editor integration. One open
 * session per run means a message sent mid-turn reaches the agent live
 * (verified against Copilot: the running turn is cancelled and the new
 * message is answered inside the same session, keeping its context).
 */

/**
 * Token usage off an ACP `session/prompt` response.
 *
 * The field is optional in the protocol and absent from the published schema
 * page, which is why it looked for a long time as though ACP simply did not
 * report usage. It does: Copilot's own bundle carries the shape
 * `{ inputTokens, outputTokens, cachedReadTokens, cachedWriteTokens,
 * thoughtTokens, totalTokens }` on the prompt response, camelCased. An agent
 * that sends nothing still costs nothing here — every field is read defensively
 * and the result is dropped when it is empty.
 *
 * One judgement call, because the protocol does not say: whether `inputTokens`
 * already contains the cached part. Both conventions exist in the wild, so
 * rather than picking one, the totals are used to tell them apart — if adding
 * the cache overshoots `totalTokens`, it was already included.
 */
export function acpUsage(raw: Record<string, unknown> | undefined): Usage | undefined {
  if (!raw) return undefined;
  const at = (key: string): number | undefined => getNumber(raw, key);
  const input = at('inputTokens');
  const output = at('outputTokens');
  const cachedRead = at('cachedReadTokens');
  const cachedWrite = at('cachedWriteTokens');
  const total = at('totalTokens');
  if (input === undefined && output === undefined) return undefined;

  const cached = (cachedRead ?? 0) + (cachedWrite ?? 0);
  let read = (input ?? 0) + cached;
  if (total !== undefined && read + (output ?? 0) > total) read = input ?? 0;

  const usage: Usage = {};
  if (read > 0) usage.inputTokens = read;
  if (output) usage.outputTokens = output;
  if (cachedRead) usage.cachedInputTokens = cachedRead;
  return Object.keys(usage).length > 0 ? usage : undefined;
}

export interface AcpOptions {
  configureGrokSession?: boolean;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  req: RunRequest;
  signal: AbortSignal;
  detectLimit: (text: string) => LimitInfo | undefined;
  /** Legacy fallback when the CLI does not understand ACP. */
  onUnsupported?: () => void;
}

/**
 * A method the agent does not implement (JSON-RPC -32601). Older CLIs answer
 * this to calls a newer protocol added; the bare message is "Method not found"
 * and never names the method, so it must never reach the user unexplained.
 */
function methodMissing(error: unknown): boolean {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === -32601 || /^method not found$/i.test((error as Error | undefined)?.message?.trim() ?? '');
}

/**
 * Längste Stille, die ein laufender Auftrag haben darf. Keine Obergrenze für
 * die Dauer: `JsonRpcProcess` stellt die Frist bei jeder Zeile des Agenten
 * neu. Ein Auftrag, der eine halbe Stunde lang Werkzeuge meldet, läuft weiter
 * — früher starb er genau dort, mitsamt allem, was er schon getan hatte.
 */
const PROMPT_IDLE_MS = 30 * 60_000;

export async function* runAcp(opts: AcpOptions): AsyncGenerator<AdapterEvent> {
  const { req, signal } = opts;
  const mcpError = scopedMcpUnsupportedMessage(opts.configureGrokSession ? 'grok' : 'copilot', req.mcpServers);
  if (mcpError) {
    yield { type: 'error', message: mcpError, retryable: false };
    return;
  }
  const events = new EventQueue<AdapterEvent>();

  let sessionId: string | undefined;
  let text = '';
  let finished = false;
  let authenticationFailed = false;
  const isAuthError = (message: string) => /\b401\b|unauthori[sz]ed|not authenticated|(?:token|credential|authentication)[^\n]{0,60}(?:expired|invalid)|expired[^\n]{0,40}(?:token|credential)/i.test(message);
  const failure = (message: string): AdapterEvent => opts.configureGrokSession && (authenticationFailed || isAuthError(message))
    ? { type: 'error', message: 'Die Grok-Sitzung ist abgelaufen oder konnte nicht bestätigt werden. Verbinde das betroffene Konto erneut.', retryable: false, recovery: 'reconnect-grok' }
    : { type: 'error', message, retryable: isTransientFailure(message) };
  let stderrTail = '';
  // A cancelled prompt settles AFTER the one that replaced it, so the run
  // ends only when every outstanding prompt has settled.
  let outstanding = 0;
  // Index into `text` where the current turn's output starts.
  let segStart = 0;

  let refusal = false;
  let lastTasks: ReturnType<typeof tasksFromAcpPlan> = [];
  /** Prompt je Bildaufruf — das Ergebnis kommt als eigenes Update ohne ihn. */
  const imagePrompts = new Map<string, string>();
  /** Reported by the agent when the turn settles, when it reports at all. */
  let usage: Usage | undefined;
  /**
   * While `session/load` runs, the agent replays the whole conversation as
   * `session/update` notifications — that is how ACP hands a client its history.
   * The transcript already shows it; passed on, the previous answer would
   * stream in again as the reply to the new message.
   */
  let replaying = false;
  /** Hat sich die CLI in diesem Lauf überhaupt je gemeldet? */
  let heardFrom = false;
  const pendingUserPermissions = new Set<string>();

  const gate = new PermissionGate({
    mode: req.permissionMode,
    ask: req.askPermission === true,
    emit: (request) => { pendingUserPermissions.add(request.id); events.push({ type: 'permission', request }); },
    resolved: (id, allowed) => { pendingUserPermissions.delete(id); events.push({ type: 'permission-resolved', id, allowed }); },
  });
  if (req.handle) req.handle.respondPermission = (id, decision) => {
    if (finished || !pendingUserPermissions.delete(id)) return;
    // Capture only a real user response, synchronously before a possible Stop.
    // Automatic safe-mode/closed-gate reasons are not user instructions.
    if (decision.outcome === 'deny' && decision.reason?.trim()) {
      events.push({ type: 'deferred-instruction', text: decision.reason.trim() });
      events.push({ type: 'notice', text: 'Die Aktion wurde abgelehnt. Deine Begründung wird mit der nächsten Nachricht an den Agenten übergeben.' });
    }
    gate.respond(id, decision);
  };

  /** One outstanding prompt settled; the last one ends the run. */
  const settle = (error?: Error) => {
    outstanding = Math.max(0, outstanding - 1);
    if (outstanding > 0 || finished) return;
    if (error) {
      finish(failure(error.message));
    } else if (refusal) {
      finish({ type: 'error', message: text || 'agent refused the request', retryable: false });
    } else {
      finish({ type: 'result', text: text.slice(segStart), usage });
    }
  };

  const finish = (event?: AdapterEvent) => {
    if (finished) return;
    finished = true;
    pendingUserPermissions.clear();
    gate.close();
    if (event) events.push(event);
    events.end();
    rpc.dispose();
  };

  const rpc = new JsonRpcProcess(opts.command, opts.args, {
    cwd: req.cwd,
    env: opts.env,
    signal,
    onActivity: () => { heardFrom = true; },
    onNotification: (n) => {
      if (n.method !== 'session/update' || replaying) return;
      const update = getObject(n.params, 'update');
      const kind = getString(update, 'sessionUpdate');
      switch (kind) {
        case 'agent_message_chunk': {
          const chunk = getString(update, 'content', 'text');
          // Cancellation notices are protocol noise, not model output.
          if (chunk && /^Info: Operation cancelled by user\.?$/i.test(chunk.trim())) break;
          if (chunk) {
            text += chunk;
            events.push({ type: 'text-delta', text: chunk });
          }
          break;
        }
        case 'tool_call_update': {
          const image = acpImageEvent(update, imagePrompts);
          if (image) events.push(image);
          break;
        }
        case 'tool_call': {
          const callId = getString(update, 'toolCallId');
          const imagePrompt = getString(update, 'rawInput', 'prompt');
          if (callId && imagePrompt && /^image_(gen|edit)$/.test(getString(update, 'title') ?? '')) {
            imagePrompts.set(callId, imagePrompt);
          }
          const title = getString(update, 'title') ?? getString(update, 'kind') ?? 'tool';
          const rawInput = getObject(update, 'rawInput') ?? {};
          const located = getString(update, 'locations', '0', 'path');
          const info = describeToolUse(
            getString(update, 'kind') ?? title,
            located ? { path: located, ...rawInput } : rawInput,
            req.cwd,
          );
          // ACP ships the real before/after for an edit; prefer it over ours.
          const diff = getObject(update, 'content', '0');
          const edited =
            getString(diff, 'type') === 'diff'
              ? describeToolUse(
                  'edit',
                  {
                    file_path: getString(diff, 'path') ?? located,
                    old_string: getString(diff, 'oldText') ?? '',
                    new_string: getString(diff, 'newText') ?? '',
                  },
                  req.cwd,
                )
              : undefined;
          const preview = edited ? edited.preview : info.preview;
          events.push({
            type: 'tool-use',
            name: title,
            detail: info.detail,
            preview,
            path: info.path,
            action: info.action,
            added: edited?.added ?? info.added,
            removed: edited?.removed ?? info.removed,
          });
          break;
        }
        case 'plan': {
          const items = tasksFromAcpPlan(update);
          if (items.length > 0 && !sameTasks(items, lastTasks)) {
            lastTasks = items;
            events.push({ type: 'tasks', items });
          }
          break;
        }
        default:
          break;
      }
    },
    onServerRequest: async (r) => {
      if (r.method === 'session/request_permission') {
        const options = (r.params.options as Array<{ optionId?: string; kind?: string }>) ?? [];
        const toolCall = getObject(r.params, 'toolCall') ?? {};
        const title = getString(toolCall, 'title') ?? 'perform an action';
        const decision = await gate.ask({
          id: `${r.id}`,
          kind: acpPermissionKind(getString(toolCall, 'kind')),
          title,
          detail:
            getString(toolCall, 'rawInput', 'command') ??
            getString(toolCall, 'rawInput', 'description'),
          path: getString(toolCall, 'locations', '0', 'path'),
          tool: title,
          signature: approvalSignature(toolCall, req.cwd),
        });

        // ACP wants one of the options the agent offered; map our answer onto
        // whichever of them means the same thing.
        const byKind = (kind: string) => options.find((o) => o.kind === kind);
        if (decision.outcome === 'deny') {
          const reject = byKind('reject_once');
          return reject?.optionId
            ? { outcome: { outcome: 'selected', optionId: reject.optionId } }
            : { outcome: { outcome: 'cancelled' } };
        }
        // Cortex remembers the exact approved action. A provider's
        // allow_always option may cover a whole tool/category instead.
        const chosen = byKind('allow_once');
        if (!chosen?.optionId) {
          events.push({ type: 'notice', text: 'Dieser Anbieter bietet für die Aktion keine einmalige Freigabe an. Die Aktion wurde nicht pauschal freigegeben.' });
          return { outcome: { outcome: 'cancelled' } };
        }
        return { outcome: { outcome: 'selected', optionId: chosen.optionId } };
      }
      // We advertise no client filesystem, so nothing else needs answering.
      return {};
    },
    onStderr: (line) => {
      if (line.trim()) stderrTail = (stderrTail + '\n' + line).slice(-4096);
    },
    onExit: () => {
      if (finished) return;
      const haystack = `${text}\n${stderrTail}`;
      const limit = opts.detectLimit(haystack);
      if (limit) finish({ type: 'limit', ...limit });
      else if (text) finish({ type: 'result', text });
      else {
        const message = stderrTail.trim() || `${opts.command} exited unexpectedly`;
        finish(failure(message));
      }
    },
    onSpawnError: (message) => finish({ type: 'error', message, retryable: false }),
  });

  rpc.start();

  void (async () => {
    try {
      const initialized = await rpc.request('initialize', {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
      });

      if (opts.configureGrokSession) {
        const methods = (initialized.authMethods ?? []) as Array<{ id: string }>;
        const methodId = methods.some(m => m.id === 'cached_token') ? 'cached_token'
          : opts.env.XAI_API_KEY && methods.some(m => m.id === 'xai.api_key') ? 'xai.api_key' : undefined;
        if (!methodId) { authenticationFailed = true; throw new Error('Grok ist nicht angemeldet. Bitte das Konto unter Verbindungen erneut verbinden.'); }
        try {
          await rpc.request('authenticate', { methodId, _meta: { headless: true } });
        } catch {
          // Never fall back to an OAuth method from a background run. The
          // explicit account reconnect action owns browser authentication.
          authenticationFailed = true;
          throw new Error('Die Grok-Anmeldung konnte nicht erneuert werden. Bitte das Konto unter Verbindungen erneut verbinden.');
        }
      }

      let created: Record<string, unknown> | undefined;
      // Whether the agent actually still has this conversation. A load that
      // fails silently becomes a brand-new session below, and everything we
      // only say to sessions that remember has to be said again.
      let resumed = false;
      if (req.resumeSessionId) {
        replaying = true;
        try {
          created = await rpc.request('session/load', {
            sessionId: req.resumeSessionId,
            cwd: req.cwd,
            mcpServers: [],
          });
          sessionId = req.resumeSessionId;
          resumed = true;
        } catch (error) {
          if (opts.configureGrokSession && isAuthError(error instanceof Error ? error.message : String(error))) throw error;
          created = undefined;
        } finally {
          replaying = false;
        }
      }
      if (!sessionId) {
        created = await rpc.request('session/new', { cwd: req.cwd, mcpServers: [] });
        sessionId = getString(created, 'sessionId');
      }
      if (!sessionId) throw new Error('ACP agent did not return a session id');
      if (opts.configureGrokSession && req.model) {
        try {
          await rpc.request('session/set_model', { sessionId, modelId: req.model });
        } catch (error) {
          // The model is not a nicety: running the agent's default instead
          // would answer with a model the user did not pick and bill it to the
          // one they did. Only the message is rewritten, so an outdated CLI
          // says so instead of the bare protocol text "Method not found".
          throw methodMissing(error)
            ? new Error(`Die installierte Grok-CLI ist zu alt: sie kennt die Modellwahl (session/set_model) nicht. Bitte \`${opts.command}\` aktualisieren.`)
            : error;
        }
      }
      // Grok takes the reasoning effort as a session config option, after the
      // model — each model has its own set of levels.
      const grokEffort = opts.configureGrokSession ? supportedEffort('grok', req.model, req.effort) : undefined;
      if (grokEffort) {
        try {
          await rpc.request('session/set_config_option', { sessionId, configId: 'reasoning_effort', value: grokEffort });
        } catch (error) {
          // Session config options arrived in Grok 1.0.30; older CLIs answer
          // -32601. The effort is a dial on a working session, so losing it
          // must not cost the whole turn — the agent then thinks at its own
          // default, and the run says so instead of failing.
          if (!methodMissing(error)) throw error;
          events.push({ type: 'notice', text: `Die installierte Grok-CLI kennt den Denk-Aufwand noch nicht — der Lauf denkt mit Groks Voreinstellung statt „${grokEffort}“. Ein Update von \`${opts.command}\` behebt das.` });
        }
      }
      events.push({ type: 'session', sessionId });

      // Live mid-run messaging: another session/prompt reaches the agent now.
      if (req.handle) {
        req.handle.injectMode = 'turn';
        req.handle.inject = (injected: string) => {
          if (finished || !sessionId) return false;
          // ACP agents cancel the running turn and answer the new message, so
          // close the interrupted turn with whatever it produced.
          events.push({ type: 'result', text: text.slice(segStart) });
          segStart = text.length;
          outstanding++;
          void rpc
            .request(
              'session/prompt',
              { sessionId, prompt: [{ type: 'text', text: injected }] },
              PROMPT_IDLE_MS,
            )
            .then((injectedResponse) => {
              usage = acpUsage(getObject(injectedResponse, 'usage')) ?? usage;
              settle();
            })
            .catch((e) => settle(e as Error));
          return true;
        };
      }

      // ACP has no system-prompt slot, so standing instructions ride on the
      // first prompt of a session — and again only when they changed. Asking
      // for a resume is not the same as getting one: a session that was
      // replaced under us has heard neither the instructions nor the context
      // the message was written to build on.
      const brief = req.systemBrief?.trim();
      const needsBrief = !!brief && (!resumed || req.restateBrief === true);
      const base = resumed ? req.prompt : (req.coldPrompt ?? req.prompt);
      const promptText = needsBrief
        ? `Standing instructions for this session — follow them for every turn, ` +
          `and do not acknowledge them:\n${brief}\n\n---\n\n${base}`
        : base;

      // Bilder nur, wenn der Agent sie angekündigt hat — sonst bleibt der Pfad im Text.
      const takesImages = !!(initialized as { agentCapabilities?: { promptCapabilities?: { image?: boolean } } }).agentCapabilities?.promptCapabilities?.image;
      const imageBlocks = takesImages
        ? (req.images ?? []).flatMap(img => { const data = readImageBase64(img.path); return data ? [{ type: 'image', mimeType: img.mediaType, data }] : []; })
        : [];
      outstanding++;
      const response = await rpc.request(
        'session/prompt',
        { sessionId, prompt: [{ type: 'text', text: promptText }, ...imageBlocks] },
        PROMPT_IDLE_MS,
      );
      refusal = getString(response, 'stopReason') === 'refusal';
      usage = acpUsage(getObject(response, 'usage')) ?? usage;
      settle();
    } catch (e) {
      const message = (e as Error).message;
      if (/unknown option|unexpected argument|unrecognized/i.test(message)) {
        opts.onUnsupported?.();
        finish({
          type: 'error',
          message: `${opts.command} does not support ACP — update the CLI`,
          retryable: false,
        });
        return;
      }
      const limit = opts.detectLimit(message);
      if (limit) { finish({ type: 'limit', ...limit }); return; }
      const event = failure(message);
      // Eine CLI, die sich in diesem Lauf nie gemeldet hat, ist ein
      // Infrastrukturfehler und keine Aussage über Konto oder Modell: derselbe
      // Zugang darf es noch einmal versuchen. Ist der Auftrag dagegen
      // mittendrin verstummt, hat er schon gearbeitet — das wird nicht
      // stillschweigend wiederholt.
      if (event.type === 'error' && !event.recovery && !heardFrom) event.retryable = true;
      finish(event);
    }
  })();

  try {
    for await (const event of events) yield event;
  } finally {
    if (req.handle) req.handle.inject = undefined;
    rpc.dispose();
  }
}
