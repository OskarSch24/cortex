import { CLAUDE_MODELS, supportedEffort } from '../models/catalog.js';
import { claudeContent } from './attachments.js';
import { spawn } from 'node:child_process';
import type { LoginFlow, ProviderAdapter, RunRequest } from './adapter.js';
import { cliSetupError, spawnLines } from './spawn.js';
import { getNumber, getObject, getString, tryParseJson } from './ndjson.js';
import { claudeRateLimit, detectClaudeLimit, isTransientFailure } from './limits.js';
import { describeToolUse } from './toolDetail.js';
import { sameTasks, tasksFromTodoWrite } from './taskList.js';
import { buildChildEnv } from '../accounts/env.js';
import { createClaudeMcpConfig, withClaudeMcpSelection, type ScopedMcpConfig } from './scopedMcp.js';
import type {
  AdapterEvent,
  AgentStatus,
  Effort,
  PermissionMode,
  ResolvedAccount,
  Usage,
} from '../types.js';

const PERMISSION_ARGS: Record<PermissionMode, string[]> = {
  safe: ['--permission-mode', 'plan'],
  edits: ['--permission-mode', 'acceptEdits'],
  full: ['--dangerously-skip-permissions'],
};

/** Claude spawns subagents through this tool; the name has changed across versions. */
function isAgentTool(name: string): boolean {
  const tool = name.toLowerCase();
  return tool === 'task' || tool === 'agent';
}

/**
 * Claude's own words for how a task ended, mapped onto ours — undefined when
 * it has not ended. Agents are often launched asynchronously, and then the
 * parent's tool_result comes back at once with `async_launched`: treating that
 * as an ending closes the lane while the agent is still working, and the next
 * agent no longer overlaps it, so the fan-out stops looking parallel too.
 */
function agentStatus(raw: string | undefined): Exclude<AgentStatus, 'running'> | undefined {
  if (raw === 'completed' || raw === 'success') return 'completed';
  if (raw === 'cancelled' || raw === 'canceled' || raw === 'aborted' || raw === 'interrupted') {
    return 'cancelled';
  }
  if (raw === 'failed' || raw === 'error') return 'failed';
  return undefined;
}

/** A tool_result body is either a plain string or a list of content blocks. */
function resultText(content: unknown): string | undefined {
  if (typeof content === 'string') return content.trim() || undefined;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((block) => {
      const b = block as Record<string, unknown>;
      return b?.type === 'text' && typeof b.text === 'string' ? b.text : '';
    })
    .join('')
    .trim();
  return text || undefined;
}

/**
 * Claude's `input_tokens` counts only what was neither cached nor being written
 * to cache, which on a warm session is a rounding error next to what the model
 * actually read — a real turn reported `input_tokens: 2` against 18,726 read
 * from cache. The window it worked in is the sum, so that is what we report.
 */
export function claudeUsage(msg: Record<string, unknown>): Usage {
  const at = (...path: string[]): number => getNumber(msg, 'usage', ...path) ?? 0;
  const cacheRead = at('cache_read_input_tokens');
  const input = at('input_tokens') + at('cache_creation_input_tokens') + cacheRead;
  const output = at('output_tokens');
  const usage: Usage = {};
  if (input > 0) usage.inputTokens = input;
  if (output > 0) usage.outputTokens = output;
  if (cacheRead > 0) usage.cachedInputTokens = cacheRead;
  return usage;
}

export class ClaudeAdapter implements ProviderAdapter {
  readonly id = 'claude' as const;
  readonly displayName = 'Claude Code';
  readonly supportsNativeResume = true;
  readonly models = CLAUDE_MODELS;

  constructor(private cliPath = 'claude') {}

  buildEnv(account: ResolvedAccount, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return buildChildEnv(account, base);
  }

  async *run(
    req: RunRequest,
    account: ResolvedAccount,
    signal: AbortSignal,
  ): AsyncGenerator<AdapterEvent> {
    // stream-json input keeps stdin open, so additional user messages can be
    // injected into the RUNNING session (Claude answers them as extra turns).
    // Asking replaces the mode flag rather than joining it: plan would refuse
    // to act at all and bypassPermissions would never consult the prompt tool,
    // so ask mode leaves Claude on its default and lets the tool decide.
    const asking = req.askPermission === true && req.permissionMode !== 'safe' && req.permissionMode !== 'full';
    const hookAt = req.hostArgs?.args.indexOf('--permission-prompt-tool') ?? -1;
    if (asking && (hookAt < 0 || !req.hostArgs?.args[hookAt + 1])) {
      yield { type: 'error', message: 'Die Genehmigungsabfrage ist nicht verfügbar. Bitte erneut versuchen; der Auftrag wurde nicht gestartet.', retryable: false };
      return;
    }
    let args = [
      '-p',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      ...(asking ? [] : PERMISSION_ARGS[req.permissionMode]),
    ];
    if (req.model) args.push('--model', req.model);
    if (req.resumeSessionId) args.push('--resume', req.resumeSessionId);
    // Cut the transcript after that message and continue in a new session id,
    // so the conversation it came from keeps its later turns.
    if (req.resumeSessionId && req.resumeAt) args.push('--resume-session-at', req.resumeAt, '--fork-session');
    // Claude keeps its own system prompt and appends ours to it.
    if (req.systemBrief?.trim()) args.push('--append-system-prompt', req.systemBrief);
    // Claude cannot ask over stream-json — `--permission-mode manual` silently
    // degrades to `default` in headless mode. Its real hook is an MCP tool it
    // calls before acting, which the host supplies.
    if (asking) args.push(...req.hostArgs!.args);

    const effort = supportedEffort(this.id, req.model, req.effort);
    const env = {
      ...this.buildEnv(account, process.env),
      ...(effort ? { CLAUDE_CODE_EFFORT_LEVEL: effort } : {}),
      ...(req.hostArgs?.env ?? {}),
      ...(req.mcpServers !== undefined ? { ENABLE_CLAUDEAI_MCP_SERVERS: 'false' } : {}),
    };
    let scopedMcp: ScopedMcpConfig | undefined;
    if (req.mcpServers !== undefined) {
      try {
        scopedMcp = createClaudeMcpConfig(req.mcpServers);
        args = withClaudeMcpSelection(args, scopedMcp.path);
      } catch (error) {
        yield { type: 'error', message: error instanceof Error ? error.message : 'Die MCP-Auswahl konnte nicht eingerichtet werden.', retryable: false };
        return;
      }
    }
    let sawRateLimitRetry = false;
    let sawResult = false;
    let sessionEmitted = false;
    let stderrTail = '';
    let lastText = '';
    // The newest main-thread assistant message — the turn's checkpoint.
    let lastAssistantUuid: string | undefined;
    let lastTasks: ReturnType<typeof tasksFromTodoWrite> = [];
    // Subagents, keyed by the tool call that spawned them — several run at once,
    // so every later event has to find its own lane again.
    const agents = new Set<string>();
    const taskToTool = new Map<string, string>();
    const endStatus = new Map<string, string>();
    const ended = new Set<string>();

    let stdin: NodeJS.WritableStream | undefined;
    let pendingTurns = 0;
    const writeUser = (text: string, images?: RunRequest['images']): boolean => {
      if (!stdin || !(stdin as NodeJS.WriteStream).writable || (stdin as NodeJS.WriteStream).destroyed) return false;
      try {
        stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: claudeContent(text, images) } }) + '\n');
        pendingTurns++;
        return true;
      } catch (error) {
        (stdin as NodeJS.WriteStream).destroy(error instanceof Error ? error : new Error(String(error)));
        return false;
      }
    };
    if (req.handle) {
      req.handle.injectMode = 'turn';
      req.handle.inject = writeUser;
    }

    try { for await (const ev of spawnLines(this.cliPath, args, {
      cwd: req.cwd,
      env,
      signal,
      stdinPipe: true,
      onChild: (child) => {
        stdin = child.stdin ?? undefined;
        if (!writeUser(req.prompt, req.images)) throw new Error('Claude Code konnte die Nachricht nicht empfangen. Bitte erneut versuchen.');
      },
    })) {
      if (ev.kind === 'spawn-error') {
        yield { type: 'error', message: ev.message, retryable: false, ...(ev.missingCommand ? { recovery: 'install-claude' as const } : {}) };
        return;
      }
      if (ev.kind === 'exit') {
        if (!sawResult && ev.code !== 0) {
          const haystack = `${lastText}\n${stderrTail}`;
          const limit = sawRateLimitRetry
            ? (detectClaudeLimit(haystack) ?? { scope: 'unknown' as const, raw: haystack })
            : detectClaudeLimit(haystack);
          if (limit) {
            yield { type: 'limit', ...limit };
          } else {
            const raw = stderrTail.trim() || `claude exited with code ${ev.code}`;
            const missingCli = (ev.code === 127 && /not found|no such file|ENOENT/i.test(raw))
              || (raw.includes(this.cliPath) && /Cannot find module|MODULE_NOT_FOUND|no such file/i.test(raw));
            const message = missingCli ? cliSetupError(this.cliPath, raw) : raw;
            yield {
              type: 'error',
              message,
              retryable: isTransientFailure(`${message}\n${lastText}`),
              ...(message !== raw ? { recovery: 'install-claude' as const } : {}),
            };
          }
        }
        return;
      }
      if (ev.stream === 'stderr') {
        stderrTail = (stderrTail + '\n' + ev.line).slice(-4096);
        continue;
      }

      const msg = tryParseJson(ev.line);
      if (!msg) continue;
      const type = msg.type;

      if (type === 'system') {
        if (msg.subtype === 'init') {
          const sid = getString(msg, 'session_id');
          if (sid && !sessionEmitted) {
            sessionEmitted = true;
            yield { type: 'session', sessionId: sid };
          }
        } else if (msg.subtype === 'api_retry' && ['rate_limit', 'rate_limit_error'].includes(getString(msg, 'error') ?? getString(msg, 'error', 'type') ?? '')) {
          sawRateLimitRetry = true;
          yield { type: 'limit', ...(detectClaudeLimit(`${lastText}\n${stderrTail}`) ?? claudeRateLimit(getObject(msg, 'rate_limit_info') ?? msg, ev.line)) };
          return;
        } else if (msg.subtype === 'task_started') {
          // The lane already exists (its tool_use block opened it); this only
          // ties Claude's task id to it, since later patches carry nothing else.
          const toolUseId = getString(msg, 'tool_use_id');
          const taskId = getString(msg, 'task_id');
          if (toolUseId && taskId) taskToTool.set(taskId, toolUseId);
        } else if (msg.subtype === 'task_progress') {
          const id = getString(msg, 'tool_use_id');
          if (id && agents.has(id) && !ended.has(id)) {
            yield {
              type: 'agent-progress',
              id,
              activity: getString(msg, 'description'),
              lastTool: getString(msg, 'last_tool_name'),
              toolUses: getNumber(msg, 'usage', 'tool_uses'),
              tokens: getNumber(msg, 'usage', 'total_tokens'),
              durationMs: getNumber(msg, 'usage', 'duration_ms'),
            };
          }
        } else if (msg.subtype === 'task_updated') {
          // Carries the verdict but no summary; the notification right after
          // has both, so only the verdict is kept here.
          const taskId = getString(msg, 'task_id');
          const status = getString(msg, 'patch', 'status');
          const id = taskId ? taskToTool.get(taskId) : undefined;
          if (id && status) endStatus.set(id, status);
        } else if (msg.subtype === 'task_notification') {
          const id = getString(msg, 'tool_use_id');
          if (id && agents.has(id) && !ended.has(id)) {
            ended.add(id);
            yield {
              type: 'agent-end',
              id,
              status: agentStatus(getString(msg, 'status')) ?? agentStatus(endStatus.get(id)) ?? 'failed',
              summary: getString(msg, 'summary') ?? (!agentStatus(getString(msg, 'status') ?? endStatus.get(id)) ? 'Der Abschlussstatus des Agenten konnte nicht bestätigt werden.' : undefined),
              toolUses: getNumber(msg, 'usage', 'tool_uses'),
              tokens: getNumber(msg, 'usage', 'total_tokens'),
              durationMs: getNumber(msg, 'usage', 'duration_ms'),
            };
          }
        }
        continue;
      }

      // First-class limit signal (verified against claude 2.1.216 output):
      // {"type":"rate_limit_event","rate_limit_info":{"status":"rate_limited","resetsAt":...,"rateLimitType":"five_hour"}}
      if (type === 'rate_limit_event') {
        const status = getString(msg, 'rate_limit_info', 'status');
        if (status === 'rate_limited') {
          yield {
            type: 'limit',
            ...claudeRateLimit(getObject(msg, 'rate_limit_info') ?? {}, ev.line),
          };
          return;
        }
        continue;
      }

      if (type === 'stream_event') {
        // Skip subagent output; only the main thread streams to the transcript.
        if (msg.parent_tool_use_id) continue;
        const delta = getObject(msg, 'event', 'delta');
        if (delta && delta.type === 'text_delta' && typeof delta.text === 'string') {
          lastText = (lastText + delta.text).slice(-8192);
          yield { type: 'text-delta', text: delta.text };
        }
        continue;
      }

      if (type === 'assistant') {
        // Set on everything a subagent does — that is what tells its work apart
        // from the main thread's when several agents run at once.
        const parent = getString(msg, 'parent_tool_use_id');
        const uuid = getString(msg, 'uuid');
        if (uuid && !parent) lastAssistantUuid = uuid;
        const content = getObject(msg, 'message')?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === 'tool_use' && typeof b.name === 'string') {
              const toolId = typeof b.id === 'string' ? b.id : undefined;
              // Spawning an agent opens a lane instead of adding a timeline row.
              // Nested spawns stay rows inside their parent's lane: the panel
              // shows concurrency, and a nested lane would read as a sibling.
              if (isAgentTool(b.name) && toolId && !parent) {
                const input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<
                  string,
                  unknown
                >;
                const description = typeof input.description === 'string' ? input.description.trim() : '';
                agents.add(toolId);
                yield {
                  type: 'agent-start',
                  id: toolId,
                  label: description || b.name,
                  agentKind: typeof input.subagent_type === 'string' ? input.subagent_type : undefined,
                  prompt: typeof input.prompt === 'string' ? input.prompt : undefined,
                  background: input.run_in_background === true,
                };
                continue;
              }
              // A subagent's own checklist is not the conversation's plan.
              if (b.name === 'TodoWrite' && !parent) {
                const items = tasksFromTodoWrite(b.input);
                if (items.length > 0 && !sameTasks(items, lastTasks)) {
                  lastTasks = items;
                  yield { type: 'tasks', items };
                }
              }
              const info = describeToolUse(b.name, b.input, req.cwd);
              yield {
                type: 'tool-use',
                name: b.name,
                detail: info.detail,
                preview: info.preview,
                path: info.path,
                action: info.action,
                added: info.added,
                removed: info.removed,
                agentId: parent,
              };
            }
          }
        }
        continue;
      }

      // A foreground subagent comes back as a tool_result on the main thread —
      // the one end signal that is guaranteed, whatever else the CLI emitted.
      if (type === 'user' && !getString(msg, 'parent_tool_use_id')) {
        const content = getObject(msg, 'message')?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
            const id = b.tool_use_id;
            if (!agents.has(id) || ended.has(id)) continue;
            // Only a terminal result ends the lane; a launch acknowledgement
            // ("async_launched") means the agent is only just getting started.
            const status =
              b.is_error === true
                ? ('failed' as const)
                : agentStatus(getString(msg, 'tool_use_result', 'status') ?? endStatus.get(id));
            if (!status) continue;
            ended.add(id);
            yield {
              type: 'agent-end',
              id,
              status,
              summary: resultText(b.content),
              toolUses: getNumber(msg, 'tool_use_result', 'totalToolUseCount'),
              tokens: getNumber(msg, 'tool_use_result', 'totalTokens'),
              durationMs: getNumber(msg, 'tool_use_result', 'totalDurationMs'),
            };
          }
        }
        continue;
      }

      if (type === 'result') {
        sawResult = true;
        const text = getString(msg, 'result') ?? '';
        const isError = msg.is_error === true || String(msg.subtype ?? '').startsWith('error');
        const limit = detectClaudeLimit(text) ?? (sawRateLimitRetry && isError
          ? { scope: 'unknown' as const, raw: text }
          : undefined);
        if (isError && limit) {
          yield { type: 'limit', ...limit };
        } else if (isError) {
          const message = text || 'claude reported an error';
          yield { type: 'error', message, retryable: isTransientFailure(message) };
        } else {
          const sid = getString(msg, 'session_id');
          if (sid && !sessionEmitted) {
            sessionEmitted = true;
            yield { type: 'session', sessionId: sid };
          }
          yield {
            type: 'result',
            text,
            costUsd: getNumber(msg, 'total_cost_usd'),
            usage: claudeUsage(msg),
            checkpoint: lastAssistantUuid,
          };
        }
        // One result per turn: keep the session open while injected turns
        // are pending; close stdin when everything is answered.
        pendingTurns--;
        if (pendingTurns <= 0) {
          if (req.handle) req.handle.inject = undefined;
          stdin?.end();
        }
      }
    } } finally {
      if (req.handle) req.handle.inject = undefined;
      stdin = undefined;
      scopedMcp?.dispose();
    }
  }

  interactiveCommand(account: ResolvedAccount, model?: string) {
    const command = [this.cliPath];
    if (model) command.push('--model', model);
    return { command, env: this.buildEnv(account, process.env) };
  }

  loginFlow(profileDir: string): LoginFlow {
    return {
      terminalCommand: [this.cliPath, 'setup-token'],
      env: { CLAUDE_CONFIG_DIR: profileDir },
      // The printed token is captured from the terminal output automatically.
      watch: { kind: 'output-token', pattern: 'sk-ant-oat[A-Za-z0-9_-]{8,}' },
      postLoginSecretPrompt: 'oauth-token',
      instructions:
        'The terminal will run "claude setup-token": a browser opens — log in with the Claude account you want to add. ' +
        'If the CLI asks for an authorization code, paste it INTO THE TERMINAL. ' +
        'cortex detects the token automatically when it appears.',
      verify: async () => true,
    };
  }

  /** Login flow for managed-home accounts (full config dir, no token). */
  managedLoginFlow(profileDir: string): LoginFlow {
    const check = () =>
      new Promise<boolean>((resolve) => {
        const child = spawn(this.cliPath, ['auth', 'status'], {
          env: { ...process.env, CLAUDE_CONFIG_DIR: profileDir },
          stdio: 'ignore',
        });
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
      });
    return {
      terminalCommand: [this.cliPath, 'auth', 'login'],
      env: { CLAUDE_CONFIG_DIR: profileDir },
      watch: { kind: 'poll', check, intervalMs: 3000 },
      instructions:
        'The terminal will run "claude auth login": a browser opens — sign in with the Claude account you want to add. ' +
        'cortex detects the completed login automatically.',
      verify: check,
    };
  }
}
