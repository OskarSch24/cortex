import type { TranscriptItem } from '../../src/panel/transcript.js';
import type { PermissionDecision } from '../../../core/src/adapters/permission.js';
import { Markdown } from './Markdown.js';
import type { FileDiffDto } from '../../src/panel/protocol.js';
import {
  DateDivider, UserMessage, type ChatActions,
} from './chat.js';
import { BrandMark, PROVIDER_NAME } from './brandIcons.js';
import { assistantText } from '../../src/panel/transcript.js';
import { CopyButton } from './CopyButton.js';
import { answerForClipboard } from './answerText.js';
import { vscode } from '../vscodeApi.js';
import { clockTime } from '../format/time.js';
import { emptyTranscript } from './transcript/EmptyTranscript.js';
import { MemoryChip } from './transcript/MemoryChip.js';
import { PermissionCard } from './transcript/PermissionCard.js';
import { RunState } from './transcript/RunState.js';
import { TaskGroup } from './transcript/TaskGroup.js';

import { AssistantTurn, type ImageActionHandler, type TurnHandlers } from './transcript/AssistantTurn.js';

export type { ImageActionHandler, TurnHandlers };

/** A verdict, not decoration: pressing it changes how the router scores that run. */
function ThumbDown({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M7 3h9.2a2 2 0 0 1 2 1.7l1 6A2 2 0 0 1 17.2 13H13l.8 4.2a2.4 2.4 0 0 1-4.5 1.5L7 13Z" />
      <path d="M3.5 3h3.4v10H3.5z" />
    </svg>
  );
}

/** Nach so langer Pause steht die Uhrzeit wieder über deiner Nachricht. */
const DATE_GAP = 3 * 60 * 60 * 1000;

/**
 * Wann der laufende Auftrag begann: deine erste Nachricht nach der letzten
 * fertigen Antwort. Nachgeschobene Nachrichten starten die Uhr nicht neu. Ohne
 * das zählte sie ab dem Moment, in dem diese Ansicht „läuft“ erfuhr — nach
 * einem Neuladen stand sie nach 20 Minuten Arbeit wieder bei 2 Minuten.
 */
export function runStart(items: TranscriptItem[]): number | undefined {
  let start: number | undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (item.kind === 'assistant' && (item.done || item.stopped)) break;
    if (item.kind === 'user' && item.at) start = item.at;
  }
  return start;
}

export function Transcript({
  items,
  conversationId,
  accounts = [],
  noAccounts,
  running,
  startedAt = 0,
  onAddAccount,
  onPermission,
  onRetry,
  onRate,
  onOpenFile,
  onOpenCode,
  onOpenUrl,
  onOpenUrlIn,
  diffs = [],
  onReview,
  onRevert,
  onImageAction,
  onPrompt,
  onExecutePrompt,
  canvas,
  activity,
  onEditMessage,
  onRewind,
  onFork,
}: {
  items: TranscriptItem[];
  conversationId?: string;
  accounts?: import('../../src/panel/protocol.js').AccountStatusDto[];
  noAccounts?: boolean;
  /** Whether the conversation is still running — an agent cannot outlive it. */
  running?: boolean;
  /** When the current run began, for the clock on the reply being written. */
  startedAt?: number;
  onAddAccount?: () => void;
  onPermission?: (id: string, decision: PermissionDecision) => void;
  onRetry?: () => void;
  /** The user's verdict on one answer — it reaches the router, not just the DOM. */
  onRate?: (messageId: string, poor: boolean) => void;
  onOpenFile?: (path: string) => void;
  /** Einen Codeblock im Panel rechts aufschlagen, statt ihn hier auszurollen. */
  onOpenCode?: (code: string, lang?: string) => void;
  /** Eine Adresse aus dem Verlauf im Cortex-Browser öffnen. */
  onOpenUrl?: (url: string) => void;
  onOpenUrlIn?: (url: string, app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => void;
  /** Der Diff des Projekts — Zahlen und Vorschau für die Änderungskarten. */
  diffs?: FileDiffDto[];
  onReview?: () => void;
  onRevert?: (messageId: string, paths: string[]) => void;
  onImageAction?: ImageActionHandler;
  /** Ein Widget legt einen Folgeauftrag ins Eingabefeld. */
  onPrompt?: (text: string) => void;
  onExecutePrompt?: (text: string) => void;
  /** Die Excalidraw-Fläche dieses Chats. */
  canvas?: import('../canvas/client.js').CanvasHost;
  /** Was der Host vor dem Lauf tut („Schaut im Exokortex nach Erinnerungen“). */
  activity?: string;
  /** Deine `index`-te Nachricht (0 = erste) mit neuem Text neu senden. */
  onEditMessage?: (index: number, text: string) => void;
  /** Vor deine `index`-te Nachricht zurückgehen. */
  onRewind?: (index: number) => void;
  /** Einen Chat mit dem Verlauf vor deiner `index`-ten Nachricht abzweigen. */
  onFork?: (index: number) => void;
}) {
  const actions: ChatActions = { onOpenPath: onOpenFile, onOpenUrl };
  const handlers: TurnHandlers = {
    onRate,
    actions,
    diffs,
    onReview,
    onRevert,
    onOpenUrlIn,
    onOpenCode,
    onImageAction,
    onLink: (href, kind) => (kind === 'web' ? onOpenUrl?.(href) : onOpenFile?.(href)),
    widgets: { conversationId, onPrompt, onExecutePrompt, onOpenUrl, onOpenFile, canvas },
    activity,
  };
  let lastUserAt = 0;
  let userIndex = -1;
  const clockStart = (running && runStart(items)) || startedAt;
  if (items.length === 0) return emptyTranscript({ accounts, noAccounts, onAddAccount });
  return (
    // A log rather than a live region: announcing every streamed token would
    // make a screen reader unusable. The work bar carries the live state.
    <div class="transcript" role="log" aria-label="Conversation" aria-busy={running === true}>
      {items.map((item, i) => {
        switch (item.kind) {
          case 'user': {
            // Die Uhrzeit steht über der ersten Nachricht und über jeder, die
            // nach einer längeren Pause kommt — nicht über jeder einzelnen.
            const divider = item.at !== undefined && (lastUserAt === 0 || item.at - lastUserAt > DATE_GAP);
            if (item.at !== undefined) lastUserAt = item.at;
            const index = ++userIndex;
            // Während ein Auftrag läuft, gäbe es nichts Festes, an das man zurückkehren könnte.
            const edit = running ? undefined : {
              onEdit: onEditMessage && ((text: string) => onEditMessage(index, text)),
              onRewind: onRewind && (() => onRewind(index)),
              onFork: onFork && (() => onFork(index)),
            };
            return (
              <div key={i} class="tl tl-user cx-c-user-row">
                <div class="sr-only">du</div>
                {divider && <DateDivider at={item.at!} />}
                <UserMessage text={item.text} at={item.at} attachments={item.attachments} image={item.image} actions={actions} anchor={`u${i}`} edit={edit} />
              </div>
            );
          }
          case 'assistant': {
            const provider = item.target?.provider;
            const answer = assistantText(item).trim();
            // Unter der Antwort steht, welches Modell sie geschrieben hat — sonst
            // nichts. Konto und Kosten gehören zur Abrechnung, nicht unter einen
            // Absatz; sie stehen unter „Limits & Konten“.
            const meta = [item.target?.model].filter((part): part is string => Boolean(part));
            const finished = item.at ? new Date(item.at) : undefined;
            return (
              <AssistantTurn key={item.messageId} item={item} items={items} running={running} startedAt={clockStart} handlers={handlers}>
                {item.done && !item.images?.length && (answer || meta.length > 0) && (
                  <div class="assistant-foot">
                    {answer && (
                      <CopyButton
                        icon
                        text={answerForClipboard(answer)}
                        label="Antwort kopieren"
                        className="answer-copy"
                      />
                    )}
                    {/* A verdict the router actually learns from: a run marked
                        poor stops counting as a clean run for that account. */}
                    <button
                      type="button"
                      class={`answer-action ${item.ratedPoor ? 'on' : ''}`}
                      title={item.ratedPoor ? 'Negative Bewertung gespeichert. Sie wird bei der künftigen Modellauswahl berücksichtigt. Klicken zum Zurücknehmen.' : 'Antwort war schlecht — bei der künftigen Modellauswahl berücksichtigen'}
                      aria-label="Antwort war schlecht"
                      aria-pressed={item.ratedPoor === true}
                      onClick={() => onRate?.(item.messageId, !item.ratedPoor)}
                    >
                      <ThumbDown filled={item.ratedPoor === true} />
                    </button>
                    {item.ratedPoor && <span class="answer-rating-status" role="status">Bewertung gespeichert · fließt in die Modellauswahl ein</span>}
                    {finished && (
                      <span class="answer-time">
                        {clockTime(finished)}
                      </span>
                    )}
                    {provider && (
                      <span title={PROVIDER_NAME[provider]} class="assistant-mark">
                        <BrandMark provider={provider} size={12} />
                      </span>
                    )}
                    {meta.length > 0 && (
                      <span
                        class="assistant-meta"
                        title={item.ruleId ? `Regel: ${item.ruleId}` : undefined}
                      >
                        {meta.join(' · ')}
                      </span>
                    )}
                  </div>
                )}
              </AssistantTurn>
            );
          }
          case 'tasks':
            return <TaskGroup key={i} item={item} />;
          case 'permission':
            return <PermissionCard key={i} item={item} onDecide={onPermission} />;
          case 'review':
            return (
              <details key={i} class="tl tl-review review-block">
                <summary class="review-summary">
                  <span class="review-badge">review</span>
                  <span class="review-by">{item.by}</span>
                  <span class="review-hint">found something worth checking</span>
                </summary>
                <div class="review-body">
                  <Markdown text={item.text} onOpenCode={onOpenCode} />
                </div>
              </details>
            );
          case 'failover':
            return (
              <div key={i} class="tl tl-failover failover-banner">
                ⚡ {item.text}
              </div>
            );
          case 'memories':
            return <MemoryChip key={i} bereiche={item.bereiche} treffer={item.treffer} />;
          case 'notice':
            return (
              <div key={i} class="tl tl-notice">
                <span>{item.text}</span>
              </div>
            );
          case 'error':
            return (
              <div key={i} class="tl tl-error msg-error" role="alert">
                <span class="msg-error-text">{item.text}</span>
                {item.recovery && item.messageId && <button onClick={() => vscode.postMessage({ kind: 'recoverProvider', action: item.recovery!, messageId: item.messageId! })}>{item.recovery === 'install-claude' ? 'Claude Code installieren' : 'Grok neu verbinden'}</button>}
                {/* Only the failure you are actually looking at is worth
                    offering to redo; older ones are history. */}
                {i === items.length - 1 && onRetry && !running && (
                  <button class="retry-btn" onClick={onRetry} title="Send your last message again">
                    ↻ Retry
                  </button>
                )}
              </div>
            );
        }
      })}
      {/* Noch keine Antwort, aber es läuft schon etwas (Erinnerungen suchen,
          Konto wählen): die Anzeige steht trotzdem, und sie sagt, was. */}
      {running && clockStart > 0 && !items.some(it => it.kind === 'assistant' && !it.done) && (
        <div class="tl tl-assistant cx-c-turn tl-live"><RunState items={items} activity={activity} /></div>
      )}
    </div>
  );
}
