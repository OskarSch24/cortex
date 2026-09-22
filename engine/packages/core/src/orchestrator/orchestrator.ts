import { supportedEffort } from '../models/catalog.js';
import { imageMediaType } from '../adapters/attachments.js';
import type { AdapterRegistry } from '../adapters/adapter.js';
import type { QuotaTracker } from '../quota/quotaTracker.js';
import {
  SessionStore,
  catchUpPrompt,
  embedHistory,
  handoffPrompt,
  resumeInterruptedPrompt,
} from '../session/sessionStore.js';
import { briefDelta, withBrief, type BriefSection } from '../context/brief.js';
import { route } from '../router/router.js';
import type { ConversationContext } from '../router/autoRoute.js';
import type { TaskMetric } from '../quota/metricsSchema.js';
import { expandSlashCommand, matchSlashCommand, type SlashCommand } from '../commands/slashCommands.js';
import { isUnknownModel } from '../adapters/limits.js';
import { scopedMcpUnsupportedMessage } from '../mcp/runPolicy.js';
import type { LiveRunHandle } from '../adapters/adapter.js';
import type { RulesFile } from '../rules/schema.js';
import type {
  AccountProfile,
  AdapterEvent,
  PermissionMode,
  ProviderId,
  ResolvedAccount,
  RunEvent,
  Target,
  TaskRequest,
} from '../types.js';
import { formatTarget, targetKey } from '../types.js';

/** Transient failures get a second and third chance on the same account. */
const RETRY_BACKOFF_MS = [1_000, 4_000];

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

export interface OrchestratorDeps {
  adapters: AdapterRegistry;
  quota: QuotaTracker;
  sessions: SessionStore;
  getRules: () => RulesFile;
  getAccounts: () => AccountProfile[];
  /** Injects secrets from the host secret store. */
  resolveAccount: (target: Target) => Promise<ResolvedAccount | undefined>;
  /** User-defined slash commands (.cortex/commands.json). */
  getCustomCommands?: () => SlashCommand[];
  /** 'auto' lets the router classify and choose; 'manual' follows the chain as written. */
  getRoutingMode?: () => 'auto' | 'manual';
  /** Past runs — calibrate capability and estimate burn. */
  getMetrics?: () => TaskMetric[];
  /** Where this conversation has run so far. */
  getConversationContext?: (conversationId: string) => ConversationContext | undefined;
  /** Plan heavy code-writing work before it edits. */
  getAutoPlan?: () => boolean;
  /**
   * Let the router size how hard each turn thinks. Off leaves every CLI on its
   * own default — an escape hatch for a CLI version that does not take the
   * setting, since a rejected flag would cost a run rather than save tokens.
   */
  getSizeReasoning?: () => boolean;
  /** Backoff between same-account retries; one entry per retry. */
  retryBackoffMs?: number[];

  // ── what the models are told ──────────────────────────────
  /**
   * Workspace context assembled by the host (open file, git state, conventions),
   * as sections rather than text: a resumed session is only sent the ones that
   * changed since it last heard from us.
   */
  getBrief?: (task: TaskRequest, provider: ProviderId) => BriefSection[];
  /** Standing instructions for a provider, plus the line ids they came from. */
  getProviderBrief?: (
    provider: ProviderId,
    permissionMode: PermissionMode,
  ) => { text: string; lineIds: string[] };
  /** Stop and ask the user before consequential actions. */
  getAskPermission?: () => boolean;
  /** Provider-specific args/env only the host can supply (Claude's MCP bridge). */
  getHostArgs?: (provider: ProviderId, task: TaskRequest) => { args: string[]; env: Record<string, string> } | undefined | Promise<{ args: string[]; env: Record<string, string> } | undefined>;
}

export class Orchestrator {
  constructor(private deps: OrchestratorDeps) {}

  async *run(
    task: TaskRequest,
    signal: AbortSignal,
    handle?: LiveRunHandle,
  ): AsyncGenerator<RunEvent> {
    const { adapters, quota, sessions } = this.deps;
    const { decision, cleanedPrompt } = route(
      task,
      this.deps.getRules(),
      this.deps.getAccounts(),
      quota,
      {
        mode: task.routingMode ?? this.deps.getRoutingMode?.() ?? 'auto',
        metrics: this.deps.getMetrics?.(),
        conversation: this.deps.getConversationContext?.(task.conversationId),
        autoPlan: this.deps.getAutoPlan?.() ?? true,
      },
    );
    yield { type: 'routing', decision };

    if (decision.chain.length === 0) {
      yield { type: 'chain-exhausted', tried: [] };
      return;
    }

    // The router may ask for heavy code-writing work to be planned first.
    const effectivePermission = decision.suggestPermission ?? task.permissionMode;
    const effort = task.effort ?? ((this.deps.getSizeReasoning?.() ?? true) ? decision.effort : undefined);

    const tried: Target[] = [];
    const history = sessions.getHistory(task.conversationId);
    // What a cut-off attempt already produced, so the next one continues it.
    let interrupted: { target: Target; partial: string } | undefined;
    // Slash prompts pass through raw to Claude (it runs its native command);
    // every other provider gets the equivalent plain-English template.
    const slash = matchSlashCommand(cleanedPrompt, this.deps.getCustomCommands?.() ?? []);

    for (let i = 0; i < decision.chain.length; i++) {
      if (signal.aborted) return;
      const target = decision.chain[i]!;
      const nextTarget = decision.chain[i + 1];

      const adapter = adapters.get(target.provider);
      if (!adapter) continue;
      // Never weaken a per-agent selection during routing or account failover.
      const mcpError = scopedMcpUnsupportedMessage(target.provider, task.mcpServers);
      if (mcpError) {
        yield { type: 'error', message: mcpError, retryable: false };
        return;
      }
      const account = await this.deps.resolveAccount(target);
      if (!account) continue;
      if (!quota.availability(account.id).available) continue;

      tried.push(target);
      let attempt = 0;
      let retries = 0;
      // The model this account is actually being asked for. It can fall back to
      // the CLI's own default once, when the pinned id turns out to be gone.
      let model = target.model;
      let downgraded = false;

      target: while (true) {
        attempt++;
        yield { type: 'attempt', target, attempt };

        const nativeSid = adapter.supportsNativeResume
          ? sessions.getNativeSession(task.conversationId, target, task.cwd)
          : undefined;
        // After going back in the chat, this session is continued from an
        // earlier turn — forked there, so it forgets what came later.
        const resumeAt = nativeSid
          ? sessions.forkPoint(task.conversationId, target, task.cwd)
          : undefined;
        const slashPrompt =
          slash && slash.cmd.kind === 'prompt' && !(target.provider === 'claude' && slash.cmd.claudeNative)
            ? expandSlashCommand(slash.cmd, slash.args)
            : cleanedPrompt;
        // A cut-off attempt is handed over rather than thrown away. Resuming the
        // same native session already has the text, so it only needs the nudge.
        let basePrompt = slashPrompt;
        if (task.permissionNotes?.length) {
          basePrompt = `Begründungen zu zuvor abgelehnten Aktionen:\n${task.permissionNotes.map(note => `- ${note}`).join('\n')}\n\n${basePrompt}`;
        }
        if (interrupted) {
          basePrompt =
            nativeSid && targetKey(interrupted.target) === targetKey(target)
              ? resumeInterruptedPrompt(basePrompt)
              : handoffPrompt(basePrompt, interrupted.partial, formatTarget(interrupted.target));
        }
        // Workspace context rides with the message; standing instructions go
        // through each CLI's own system-prompt channel.
        // The brief describes the run that is about to happen, not the one that
        // was requested: an auto-planned edit runs in plan mode, and telling it
        // to run the project's checks there would be an instruction it cannot
        // follow.
        const sections =
          this.deps.getBrief?.({ ...task, permissionMode: effectivePermission }, target.provider) ??
          [];
        // Only a live session remembers anything. Without a session id this
        // target is cold — a fresh account, a failover, a reloaded window — and
        // it has to hear the whole brief.
        const known = nativeSid
          ? sessions.taskBriefState(task.conversationId, target, task.cwd)
          : undefined;
        const fullBrief = briefDelta(undefined, sections);
        const brief = known ? briefDelta(known, sections) : fullBrief;
        // What this message looks like to a session that remembers nothing:
        // the whole brief, and the conversation it is missing.
        const coldMessage = embedHistory(history, withBrief(basePrompt, fullBrief.text));
        // A session that remembers is not therefore up to date: whatever other
        // models said in this chat since its last answer is news to it.
        const missed = nativeSid ? sessions.missedTurns(task.conversationId, target, task.cwd) : [];
        basePrompt = withBrief(catchUpPrompt(missed, basePrompt), brief.text);

        const providerBrief = this.deps.getProviderBrief?.(target.provider, effectivePermission);
        const systemBrief = providerBrief?.text;
        const restateBrief =
          !!systemBrief &&
          sessions.briefChanged(task.conversationId, target, task.cwd, systemBrief);
        if (systemBrief) {
          sessions.rememberBrief(task.conversationId, target, task.cwd, systemBrief);
          if (attempt === 1 && providerBrief!.lineIds.length > 0) {
            yield { type: 'brief', target, lineIds: providerBrief!.lineIds };
          }
        }
        const prompt =
          adapter.supportsNativeResume && (nativeSid || history.length === 0)
            ? basePrompt
            : coldMessage;
        // Only meaningful where a session was asked for: it is the answer to
        // "what if that session is gone", and adapters that cannot tell ignore it.
        const coldPrompt = nativeSid ? coldMessage : undefined;

        let limitEvent: (AdapterEvent & { type: 'limit' }) | undefined;
        let errorEvent: (AdapterEvent & { type: 'error' }) | undefined;
        let firstResultRecorded = false;
        let gotResult = false;
        let partial = '';
        // The CLI answered in a different session than the one we asked for —
        // whatever it used to know, it does not know now.
        let sessionReplaced = false;
        // How big this session's context turned out to be. Compared against the
        // last turn's, it is the only evidence we get that the CLI compacted.
        let contextTokens: number | undefined;

        for await (const ev of adapter.run(
          {
            prompt,
            coldPrompt,
            images: task.images?.flatMap(path => { const mediaType = imageMediaType(path); return mediaType ? [{ path, mediaType }] : []; }),
            cwd: task.cwd,
            idleTimeoutMs: task.idleTimeoutMs,
            mcpServers: task.mcpServers,
            model,
            resumeSessionId: nativeSid,
            resumeAt,
            permissionMode: effectivePermission,
            effort: supportedEffort(target.provider, model, effort),
            systemBrief,
            restateBrief,
            askPermission: task.askPermission ?? this.deps.getAskPermission?.() ?? false,
            hostArgs: await this.deps.getHostArgs?.(target.provider, task),
            handle,
          },
          account,
          signal,
        )) {
          if (signal.aborted) {
            // Adapters close their stream on cancellation. Drain that final
            // queue so a just-submitted denial reason reaches durable host
            // storage, but never process late work/results after Stop.
            if (ev.type === 'deferred-instruction') yield ev;
            continue;
          }
          if (ev.type === 'session') {
            // A fork answers in a new session by design; that one still
            // remembers everything up to the checkpoint.
            if (nativeSid && ev.sessionId !== nativeSid && !resumeAt) sessionReplaced = true;
            if (resumeAt) sessions.clearForkPoint(task.conversationId, target, task.cwd);
            sessions.setNativeSession(task.conversationId, target, task.cwd, ev.sessionId);
            yield ev;
          } else if (ev.type === 'limit') {
            limitEvent = ev;
            break;
          } else if (ev.type === 'error') {
            errorEvent = ev;
            break;
          } else if (ev.type === 'result') {
            // Injection-capable adapters may answer several turns per run;
            // keep consuming — the host tracks per-turn transcript state.
            gotResult = true;
            if (ev.usage?.inputTokens) contextTokens = ev.usage.inputTokens;
            if (!firstResultRecorded) {
              firstResultRecorded = true;
              sessions.appendTurn(task.conversationId, { role: 'user', text: cleanedPrompt });
              sessions.appendTurn(task.conversationId, {
                role: 'assistant',
                text: ev.text,
                by: formatTarget({ ...target, model: model ?? target.model }),
              });
            }
            yield ev;
          } else {
            if (ev.type === 'text-delta') partial += ev.text;
            yield ev;
          }
        }
        if (signal.aborted) return;
        if (gotResult) {
          // Read up to here — including turns injected while it ran.
          sessions.markSeen(task.conversationId, target, task.cwd);
          // The session has now read this brief, so the next turn owes it only
          // what changes. Committed here rather than at send time: a brief that
          // went into an attempt which hit a limit was never read by anyone.
          //
          // Unless the session we were answering in got replaced. An adapter
          // that noticed will have sent `coldPrompt` and this state would be
          // right — but one that could not tell has just answered with a brief
          // it never read, and the cheap way to be correct for both is to make
          // the next turn say everything again.
          if (sessionReplaced) {
            sessions.forgetTaskBrief(task.conversationId, target, task.cwd);
          } else {
            sessions.rememberTaskBrief(task.conversationId, target, task.cwd, brief.state, {
              sentFull: !known,
              contextTokens,
            });
          }
          // A later injected turn may still hit a limit/error — surface it,
          // but the run already produced answers so no failover.
          if (limitEvent) {
            quota.markLimitHit(account.id, {
              resetAt: limitEvent.resetAt,
              scope: limitEvent.scope,
              provider: target.provider,
            });
            yield limitEvent;
          } else if (errorEvent) {
            yield errorEvent;
          }
          return;
        }

        // Whatever the attempt managed to say is the starting point for the next one.
        if (partial.trim()) interrupted = { target, partial };

        if (limitEvent) {
          quota.markLimitHit(account.id, {
            resetAt: limitEvent.resetAt,
            scope: limitEvent.scope,
            provider: target.provider,
          });
          if (nextTarget) {
            yield {
              type: 'failover',
              from: target,
              to: nextTarget,
              reason: `${formatTarget(target)} hit its usage limit`,
              resetAt: limitEvent.resetAt,
            };
          } else {
            yield limitEvent;
          }
          break target;
        }

        if (errorEvent && resumeAt && sessions.forkPoint(task.conversationId, target, task.cwd)) {
          // The session could not be cut there — its file is gone, or the CLI
          // does not know the checkpoint. Start this account over from the
          // shortened history instead of failing the turn or moving elsewhere.
          sessions.dropSession(task.conversationId, target, task.cwd);
          attempt--;
          continue target;
        }

        if (errorEvent) {
          // A retired model id is not this account's fault, and every other
          // account would be asked for the same dead name. Drop to the CLI's own
          // default once and let the account finish the job.
          if (!downgraded && model && isUnknownModel(errorEvent.message)) {
            downgraded = true;
            yield { type: 'model-downgraded', from: model, to: `${target.provider} default` };
            model = undefined;
            // Not a new attempt at the same thing — the same attempt, with a
            // model the CLI will accept. Holding the counter also stops the
            // panel announcing a dropped connection that never happened.
            attempt--;
            continue target;
          }
          // A dropped stream or an overloaded upstream says nothing about this
          // account — retry it here instead of spending another provider's quota.
          const backoff = this.deps.retryBackoffMs ?? RETRY_BACKOFF_MS;
          if (errorEvent.retryable && retries < backoff.length) {
            retries++;
            await delay(backoff[retries - 1] ?? 0, signal);
            if (signal.aborted) return;
            continue target;
          }
          if (nextTarget) {
            yield {
              type: 'failover',
              from: target,
              to: nextTarget,
              reason: errorEvent.message,
            };
          } else {
            yield errorEvent;
          }
          break target;
        }

        // Stream ended without result/limit/error (e.g. aborted child).
        break target;
      }
    }

    yield { type: 'chain-exhausted', tried };
  }
}
