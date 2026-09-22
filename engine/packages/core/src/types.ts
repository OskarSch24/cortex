import type { ToolAction } from './adapters/toolDetail.js';
import type { TaskItem } from './adapters/taskList.js';
import type { PermissionRequest } from './adapters/permission.js';

export type ProviderId = 'claude' | 'codex' | 'copilot' | 'grok' | 'openrouter';

/**
 * Providers that may check work but never produce it.
 *
 * OpenRouter reaches open-weight models over plain HTTP: no tools, no sandbox,
 * no session. That is enough to read a diff and argue with it, and nowhere near
 * enough to write code — an account here would answer an edit request with
 * confident prose and touch nothing. Keeping them out of the authoring chain is
 * exactly what makes a free account safe to connect.
 */
export const REVIEW_ONLY_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>(['openrouter']);

/**
 * Providers whose own CLI can report subscription limits. The others have no
 * such endpoint, so an empty limit card for them is not a gap to fill — it is
 * a fact to state once, quietly, instead of a heading over nothing.
 */
export const PROVIDERS_WITH_LIMITS: ReadonlySet<ProviderId> = new Set<ProviderId>(['claude', 'codex']);

export function reportsLimits(provider: ProviderId): boolean {
  return PROVIDERS_WITH_LIMITS.has(provider);
}

/** True when this provider can only be a reviewer, never the author. */
export function isReviewOnly(provider: ProviderId): boolean {
  return REVIEW_ONLY_PROVIDERS.has(provider);
}

/**
 * managed-home: CLI owns its auth inside an isolated profile dir
 *   (CLAUDE_CONFIG_DIR / CODEX_HOME / COPILOT_HOME).
 * oauth-token: long-lived token stored in the host secret store
 *   (claude setup-token -> CLAUDE_CODE_OAUTH_TOKEN).
 * api-key: raw API key stored in the host secret store, fed to the CLI via env.
 */
export type AuthMode = 'managed-home' | 'oauth-token' | 'api-key';

export type PermissionMode = 'safe' | 'edits' | 'full';

/**
 * Model weight class. Lives here rather than in the router because it is also
 * how a finished run is recorded — capability is measured per tier, so that a
 * bad run on the cheap model is not held against the expensive one.
 */
export type Tier = 'light' | 'standard' | 'heavy';

/**
 * How much thinking a turn is worth.
 *
 * Reasoning tokens are billed as output — the most expensive thing a run can
 * produce — and every CLI here that exposes the knob exposes it differently
 * (Codex a config key, Claude a keyword in the prompt). The router picks one
 * value; each adapter spends it in its own currency, or ignores it when its CLI
 * has no such control.
 */
export type Effort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';

export interface AccountProfile {
  id: string;
  provider: ProviderId;
  label: string;
  authMode: AuthMode;
  homeDir?: string;
  hasSecret: boolean;
  priority: number;
  /** Public identity verified during an explicit provider login. No credentials. */
  identity?: string;
  verifiedAt?: number;
  disabled?: boolean;
}

export type ResolvedAccount = AccountProfile & { secret?: string };

export interface Target {
  provider: ProviderId;
  account: string;
  model?: string;
}

export interface TaskRequest {
  /** External MCPs for this run: undefined inherits provider config; {} disables them. */
  mcpServers?: Record<string, import('./mcp/mcpSync.js').McpServerDef>;
  /** Maximum provider silence, excluding user approval waits. */
  idleTimeoutMs?: number;
  effort?: Effort;
  conversationId: string;
  prompt: string;
  cwd: string;
  /** Reasons for earlier denied actions, delivered on the next regular turn. */
  permissionNotes?: string[];
  /** Project roots and editor selection frozen before asynchronous task setup. */
  workspaceFolders?: string[];
  editorSnapshot?: import('./context/brief.js').EditorContext;
  activeFile?: string;
  languageId?: string;
  tags?: string[];
  permissionMode: PermissionMode;
  /** Approval preference captured when this task starts. */
  askPermission?: boolean;
  /** A fixed account in the IDE must not silently fall back to another identity. */
  allowAccountFailover?: boolean;
  /**
   * Reihenfolge der Konten, wenn eine Erwähnung nur den Anbieter nennt
   * (`@grok`): diese Labels zuerst, in dieser Folge, dann nach Priorität.
   * Der Bildmodus legt so das größere Konto vor das kleinere.
   */
  accountOrder?: string[];
  /** Per-message override of the routing mode. */
  routingMode?: 'auto' | 'manual';
  /** Bild-Anhänge (absolute Pfade), die als Bild ans Modell gehen. */
  images?: string[];
}

/**
 * What a turn actually read and wrote.
 *
 * The providers do not agree on what "input tokens" means, and taking each at
 * face value understates Claude by orders of magnitude: it reports only the
 * tokens that were neither served from cache nor written to it, so a turn that
 * read 25k tokens of context reports 2. Codex reports the full figure with the
 * cached part broken out. The adapters normalize to the same meaning here.
 */
export interface Usage {
  /** Everything the model read this turn, cache included. */
  inputTokens?: number;
  /** Everything it wrote, including reasoning tokens where they are billed as output. */
  outputTokens?: number;
  /** The part of `inputTokens` that came from cache, when the provider says. */
  cachedInputTokens?: number;
}

export type LimitScope = 'session' | 'daily' | 'weekly' | 'credits' | 'unknown';

export interface LimitInfo {
  resetAt?: number;
  scope?: LimitScope;
  raw: string;
}

/** How a subagent ended, or that it has not. */
export type AgentStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** Everything a provider can tell us about a subagent while it works. */
export interface AgentProgress {
  /** What it is doing right now, in the provider's words. */
  activity?: string;
  lastTool?: string;
  toolUses?: number;
  tokens?: number;
  durationMs?: number;
}

export type AdapterEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'notice'; text: string }
  /** A user-supplied denial reason that this protocol cannot attach to its denial response. */
  | { type: 'deferred-instruction'; text: string }
  | { type: 'text-delta'; text: string }
  | {
      type: 'tool-use';
      name: string;
      /** One line, always visible: the file, command or query. */
      detail?: string;
      /** Body revealed when the step is expanded (a diff, file content, a command). */
      preview?: string;
      /** File the tool touched, workspace-relative when known. */
      path?: string;
      action?: ToolAction;
      /** Lines written and replaced, when the call carries them. */
      added?: number;
      removed?: number;
      /** Set when a subagent did this, not the main thread. */
      agentId?: string;
    }
  /**
   * A subagent was spawned. Several can be in flight at once — the panel shows
   * them as concurrent lanes, so `id` has to be stable for the agent's whole
   * life (it is the tool call that spawned it).
   */
  | {
      type: 'agent-start';
      id: string;
      /** What it was asked to do, in the model's own words. */
      label: string;
      /** The provider's name for the kind of agent ("Explore", "general-purpose"). */
      agentKind?: string;
      /** The full instruction it was given. */
      prompt?: string;
      /** The parent did not block on it. */
      background?: boolean;
    }
  | ({ type: 'agent-progress'; id: string } & AgentProgress)
  | ({
      type: 'agent-end';
      id: string;
      status: Exclude<AgentStatus, 'running'>;
      /** What it reported back to the parent. */
      summary?: string;
    } & AgentProgress)
  | { type: 'model-downgraded'; from: string; to: string }
  /**
   * Ein Bildwerkzeug des Anbieters (Codex `image_gen`, Grok `image_gen` /
   * `image_edit`) hat eine Datei geschrieben. `path` ist absolut und liegt im
   * Profil des Kontos, nicht im Projekt.
   */
  | { type: 'image'; path: string; prompt?: string; edited?: boolean }
  /** The model's own task list, however that provider expresses it. */
  | { type: 'tasks'; items: TaskItem[] }
  /** The model is waiting on the user before it acts. */
  | { type: 'permission'; request: PermissionRequest }
  /** That wait is over — the CLI moved on (answered, cancelled or timed out). */
  | { type: 'permission-resolved'; id: string; allowed: boolean }
  | {
      type: 'result';
      text: string;
      usage?: Usage;
      costUsd?: number;
      /**
       * Where this turn ends inside the provider's own session — Claude's last
       * assistant message uuid, Codex's turn id. A later run can fork the
       * session right here, which is what lets a chat go back to this point
       * with the model remembering exactly this much and nothing after it.
       */
      checkpoint?: string;
    }
  | ({ type: 'limit' } & LimitInfo)
  | { type: 'error'; message: string; retryable: boolean; recovery?: 'install-claude' | 'reconnect-grok' };

export interface RoutingDecision {
  chain: Target[];
  ruleId?: string;
  reason: string;
  skipped: Array<{ target: Target; reason: string }>;
  /** Present when the router classified the task itself (auto mode). */
  classification?: {
    kind: string;
    complexity: string;
    signals: string[];
  };
  /** The conversation moved to a heavier model because the work got harder. */
  escalated?: { from: string; to: string };
  /** Router asks for this turn to be planned before it edits. */
  suggestPermission?: PermissionMode;
  /** Expected share of the chosen account's window, in percentage points. */
  estimatedBurnPct?: number;
  /**
   * Weight class the router sized this turn at. Absent when the target came
   * from a mention, a rule or the manual chain — nobody sized anything then.
   */
  tier?: Tier;
  /** How much thinking this turn was sized for. Absent for the same reasons. */
  effort?: Effort;
  /** Context a failover would make the next account re-read, when measured. */
  moveTokens?: number;
}

export type RunEvent =
  /** Standing instructions this run carried, so outcomes can be attributed to them. */
  | { type: 'brief'; target: Target; lineIds: string[] }
  | { type: 'routing'; decision: RoutingDecision }
  | { type: 'attempt'; target: Target; attempt: number }
  | { type: 'failover'; from: Target; to: Target; reason: string; resetAt?: number }
  | { type: 'chain-exhausted'; tried: Target[] }
  | AdapterEvent;

export function targetKey(t: Target): string {
  return `${t.provider}:${t.account}`;
}

export function formatTarget(t: Target): string {
  return t.model ? `${t.provider}:${t.account}/${t.model}` : `${t.provider}:${t.account}`;
}
