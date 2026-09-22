import type { Segment, TranscriptItem } from '../../src/panel/transcript.js';
import type { PermissionDecision } from '../../../core/src/adapters/permission.js';
import { Markdown, type LinkHandler } from './Markdown.js';
import type { WidgetHost } from './widgets/Widget.js';
import { currentActivity } from './activity.js';
import type { FileDiffDto } from '../../src/panel/protocol.js';
import {
  ActivityGroup,
  DateDivider,
  TurnChanges,
  UserMessage,
  WebPreviewCard,
  WorkedFor,
  splitTurn,
  localUrls,
  turnFiles,
  type ChatActions,
} from './chat.js';
import { IconCortex } from './icons.js';
import { BRAND_COLOR, BrandMark, PROVIDER_NAME } from './brandIcons.js';
import { assistantText } from '../../src/panel/transcript.js';
import { AgentLanes } from './AgentLanes.js';
import { ImageCard, type ImageAction } from './ImageCard.js';
import type { GeneratedImage } from '../../src/panel/transcript.js';
import type { ImageOptions } from '../../src/panel/imageOptions.js';
import { CopyButton } from './CopyButton.js';
import { answerForClipboard } from './answerText.js';
import { SourceIcon, sourceKind } from './sourceIcons.js';
import { vscode } from '../vscodeApi.js';
import type { MemoryHitDto } from '../../src/panel/protocol.js';
import { useEffect, useState } from 'preact/hooks';
import { formatElapsed, useAutoOpen } from './steps.js';

// Keep the host clock across component remounts; never reconstruct sleep time from Date.now.
let activeElapsed = 0;
if (typeof window !== 'undefined') window.addEventListener('message', event => {
  if (event.data?.kind === 'runClock') activeElapsed = event.data.elapsedMs;
  else if (event.data?.kind === 'conversationReset') activeElapsed = 0;
});

/**
 * What the run is doing, and how long it has been doing it — once.
 *
 * The state was being drawn twice: a `thinking` row where the answer was going
 * to appear, and a pinned bar saying the same word again above the composer.
 * It belongs at the head of the reply being written, and it carries the clock
 * so nothing else has to. Which of thinking, writing or working it is doing is
 * the activity line's job one row below — this line only has to say that the
 * run is alive and how long you have been waiting.
 */
function RunState({ items, startedAt, segments, activity }: {
  items: TranscriptItem[];
  startedAt: number;
  /** Die laufende Antwort — ihr letzter Schritt sagt, was gerade geschieht. */
  segments?: Segment[];
  /** Was der Host vor dem Lauf meldet (Erinnerungen suchen). */
  activity?: string;
}) {
  const [elapsed, setElapsed] = useState(() => activeElapsed);
  useEffect(() => {
    const update = (event: MessageEvent) => { if (event.data?.kind === 'runClock') setElapsed(event.data.elapsedMs); };
    window.addEventListener('message', update);
    return () => window.removeEventListener('message', update);
  }, []);

  // A pending question outranks everything: nothing is running until it is
  // answered. Only one raised since the latest reply counts — an older one was
  // left behind by a run that already ended.
  let blocked = false;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === 'permission' && !item.answered) {
      blocked = true;
      break;
    }
    if (item?.kind === 'assistant') break;
  }

  return (
    // The transcript is a log, so this is the one place a screen reader is told
    // what is going on — state changes only, never the streamed text.
    <div class={`run-state ${blocked ? 'blocked' : ''}`} role="status">
      {blocked ? 'Wartet auf deine Antwort · ' : `${currentActivity(segments, activity)} · `}
      <span class="run-clock" title="Aktive Laufzeit ohne längere Ruhepausen">{formatElapsed(elapsed)}</span>
    </div>
  );
}

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

export interface TurnHandlers {
  /** Was der Host gerade vor dem Lauf tut; siehe activity.ts. */
  activity?: string;
  onRate?: (messageId: string, poor: boolean) => void;
  actions: ChatActions;
  onLink?: LinkHandler;
  diffs: FileDiffDto[];
  onReview?: () => void;
  onRevert?: (messageId: string, paths: string[]) => void;
  onOpenUrlIn?: (url: string, app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => void;
  onOpenCode?: (code: string, lang?: string) => void;
  onImageAction?: ImageActionHandler;
  widgets?: WidgetHost;
}

export type ImageActionHandler = (
  action: ImageAction,
  image: GeneratedImage,
  all: GeneratedImage[],
  options?: ImageOptions,
  target?: { provider: string; account: string },
) => void;

/**
 * Eine Antwort im Aufbau der Codex-App.
 *
 * Solange sie läuft, steht alles im Text, wie es geschieht: Absätze und
 * dazwischen die grauen Tätigkeitszeilen. Ist sie fertig, faltet sich die
 * Arbeit hinter „… lang gearbeitet ›“; stehen bleiben die Schlussantwort und
 * darunter die Karten — Webvorschau, geänderte Dateien.
 */
function AssistantTurn({ item, items, running, startedAt, handlers, children }: {
  item: Extract<TranscriptItem, { kind: 'assistant' }>;
  items: TranscriptItem[];
  running?: boolean;
  startedAt: number;
  handlers: TurnHandlers;
  children?: preact.ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const live = !item.done;
  const indexed = item.segments.map((seg, j) => [seg, j] as [Segment, number]);
  const { work, final } = live ? { work: indexed, final: [] as Array<[Segment, number]> } : splitTurn(item.segments);
  const lastText = item.segments.reduce((found, s, j) => (s.kind === 'text' ? j : found), -1);
  const segment = (seg: Segment, j: number) => {
    if (seg.kind === 'text') {
      return (
        <div key={j} class="cx-c-prose">
          <Markdown text={seg.text} onOpenCode={handlers.onOpenCode} onLink={handlers.onLink} widgets={handlers.widgets && { ...handlers.widgets, stateKey: `${item.messageId}/${j}` }} live={live} />
          {live && j === lastText && <span class="type-cursor" />}
        </div>
      );
    }
    if (seg.kind === 'tools') return <ActivityGroup key={j} steps={seg.steps} actions={handlers.actions} />;
    return <AgentLanes key={j} lanes={seg.lanes} live={live} />;
  };
  const answer = assistantText(item);
  const urls = item.done ? localUrls(answer) : [];
  const files = item.done ? turnFiles(item.segments) : [];
  const imagePending = live && running && indexed.some(([seg]) => seg.kind === 'tools' && seg.steps.some(step => /image[_-]?(gen|edit|generation)|bild.*(erstell|bearbeit)/i.test(step.name)));
  return (
    <div class={`tl tl-assistant cx-c-turn ${live ? 'tl-live' : ''}`}>
      {!live && work.length > 0 && (
        <>
          <WorkedFor ms={item.durationMs} open={open} onToggle={() => setOpen((v) => !v)} />
          <div class="cx-c-rule" />
          {open && <div class="cx-c-work">{work.map(([seg, j]) => segment(seg, j))}</div>}
        </>
      )}
      {(live ? work : final).map(([seg, j]) => segment(seg, j))}
      {live && running && startedAt > 0 && <RunState items={items} startedAt={startedAt} segments={item.segments} activity={handlers.activity} />}
      {item.stopped && <div class="assistant-stopped">⊘ {item.stoppedReason ?? 'stopped'}</div>}
      {!!item.images?.length && handlers.onImageAction && (
        <ImageCard
          images={item.images}
          options={item.imageOptions}
          provider={item.target?.provider}
          ratedPoor={item.ratedPoor}
          onRate={() => handlers.onRate?.(item.messageId, !item.ratedPoor)}
          onAction={(action, image, all) => handlers.onImageAction!(action, image, all, item.imageOptions, item.target ? { provider: item.target.provider, account: item.target.account } : undefined)}
        />
      )}
      {imagePending && !item.images?.length && <div class="cx-image-pending" role="status" aria-label="Bild wird erstellt"><span /></div>}
      {!item.images?.length && handlers.onOpenUrlIn && urls.map(url => <WebPreviewCard key={url} url={url} onOpenIn={(app) => handlers.onOpenUrlIn!(url, app)} />)}
      {files.length > 0 && handlers.onReview && (
        <TurnChanges
          files={files}
          diffs={handlers.diffs}
          reverted={item.reverted}
          revertReason={!item.canRevert ? item.revertReason ?? 'Kein gespeicherter Stand verfügbar. Rückgängig ist nur für gespeicherte Aufträge in Git-Projekten möglich.' : undefined}
          onReview={handlers.onReview}
          onRevert={() => handlers.onRevert?.(item.messageId, files.map((f) => f.path))}
          onOpenPath={(path) => handlers.actions.onOpenPath?.(path)}
        />
      )}
      {children}
    </div>
  );
}

/**
 * The model's checklist, closed. The summary carries what you actually need
 * mid-run — how far along it is and what it is on — and the rows themselves
 * are one click away for when you want them.
 */
function TaskGroup({ item }: { item: Extract<TranscriptItem, { kind: 'tasks' }> }) {
  const done = item.items.filter((t) => t.status === 'done').length;
  const active = item.items.find((t) => t.status === 'active');
  const { open, onSummaryClick } = useAutoOpen(false);
  return (
    <details class={`tl tl-tasks ${active ? 'tl-live' : ''} task-block`} open={open}>
      <summary class="task-summary" onClick={onSummaryClick}>
        <span class="task-label">tasks</span>
        <span class="task-count">
          {done}/{item.items.length}
        </span>
        <span class="task-bar">
          <span
            class="task-fill"
            style={{ width: `${(done / Math.max(item.items.length, 1)) * 100}%` }}
          />
        </span>
        {active && <span class="task-current">{active.text}</span>}
      </summary>
      <ol class="task-items">
        {item.items.map((task, j) => (
          <li key={j} class={`task-item ${task.status}`}>
            <span class="task-mark">
              {task.status === 'done' ? '✓' : task.status === 'active' ? '▸' : '○'}
            </span>
            <span class="task-text">{task.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

const KIND_GLYPH: Record<string, string> = {
  command: '❯',
  edit: '✎',
  read: '◇',
  network: '↓',
  other: '·',
};

/**
 * The model is stopped until this is answered, so it reads as a question with
 * buttons rather than a notice. "Always" is offered per kind of action, not
 * blanket — allowing `git status` should never allow `rm`.
 */
function PermissionCard({
  item,
  onDecide,
}: {
  item: Extract<TranscriptItem, { kind: 'permission' }>;
  onDecide?: (id: string, decision: PermissionDecision) => void;
}) {
  const { request } = item;
  const [denialReason, setDenialReason] = useState('');
  if (item.answered) {
    return (
      <div class={`tl tl-permission permission-block answered ${item.allowed ? 'allowed' : 'denied'}`}>
        <span class="permission-mark">{item.allowed ? '✓' : '✕'}</span>
        <span class="permission-title">{request.title}</span>
        <span class="permission-verdict">{item.allowed ? 'allowed' : 'denied'}</span>
      </div>
    );
  }
  return (
    // The model is blocked on this, so it must be announced, not just drawn.
    <div
      class="tl tl-permission pending permission-block"
      role="alertdialog"
      aria-label={request.title}
    >
      <div class="permission-head">
        <span class={`permission-kind ${request.kind}`}>{KIND_GLYPH[request.kind] ?? '·'}</span>
        <span class="permission-title">{request.title}</span>
        {item.target && (
          <span class="permission-by" style={{ color: BRAND_COLOR[item.target.provider] }}>
            {item.target.provider}:{item.target.account}
          </span>
        )}
      </div>
      {request.detail && <pre class="permission-detail">{request.detail}</pre>}
      <div class="permission-actions">
        <button class="perm-btn allow" onClick={() => onDecide?.(request.id, { outcome: 'allow' })}>
          Allow
        </button>
        <button
          class="perm-btn always"
          title="Erlaubt nur diese konkrete Aktion mit denselben Parametern für diesen Chat"
          onClick={() => onDecide?.(request.id, { outcome: 'allow-always' })}
        >
          Always
        </button>
        <input aria-label="Grund der Ablehnung (optional)" placeholder="Grund (optional)" value={denialReason} onInput={e => setDenialReason(e.currentTarget.value)} />
        <button class="perm-btn deny" onClick={() => onDecide?.(request.id, { outcome: 'deny', reason: denialReason.trim() || undefined })}>
          Deny
        </button>
      </div>
    </div>
  );
}

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
  if (items.length === 0) {
    const account = accounts.find(account => !account.reviewOnly && account.authState !== 'expired');
    const example = account ? `@${account.provider}:${account.label}` : undefined;
    return (
      <div class="transcript empty">
        <div class="empty-box">
          <div class="empty-logo">
            <IconCortex size={22} />
            <span>cortex</span>
          </div>
          {noAccounts ? (
            <>
              <div class="empty-line">
                Connect your AI subscriptions — multiple Claude accounts, Codex, Grok —
                and every task is routed to the best one.
              </div>
              <button class="run-btn send empty-cta" onClick={onAddAccount}>
                Add your first account
              </button>
            </>
          ) : (
            <>
              <div class="empty-line">Route every task to the best subscription you own.</div>
              <div class="empty-hints">
                <div>
                  {example ? <><code>{example}</code> Konto gezielt auswählen</> : 'Konto und Modell über die Auswahl unter der Eingabe wählen'}
                </div>
                <div>
                  <code>#tests</code> trigger tag rules
                </div>
                <div>
                  <code>/review</code> commands run on every model
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
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
                        {finished.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
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
        <div class="tl tl-assistant cx-c-turn tl-live"><RunState items={items} startedAt={clockStart} activity={activity} /></div>
      )}
    </div>
  );
}

/**
 * Welche Erinnerungen mit der Nachricht gingen. Zugeklappt ein kleiner Knopf,
 * aufgeklappt die Fundstellen mit Symbol, Auszug und ✕ zum Ausblenden.
 */
function MemoryChip({ bereiche, treffer }: { bereiche: string[]; treffer: MemoryHitDto[] }) {
  const [open, setOpen] = useState(false);
  const [weg, setWeg] = useState<string[]>([]);
  const sichtbar = treffer.filter((t) => !weg.includes(t.id));
  if (sichtbar.length === 0) return null;
  // Woher die Treffer wirklich kommen — nicht, wo gesucht wurde. Sonst stünde
  // hier ein Projekt, aus dem keine einzige Fundstelle stammt.
  void bereiche;
  const orte = [...new Set(sichtbar.map((t) => (t.quelle === 'chat' ? 'Frühere Chats' : t.ort?.split(' · ')[0] || 'Dokumente')))].join(', ');
  return (
    <div class={`tl cx-memory ${open ? 'open' : ''}`}>
      <button type="button" class="cx-memory-chip" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>
        {/* Ein Textfluss statt zweier Blöcke: wird der Chat schmal, bricht die
            Zeile wie Fließtext um und der Knopf wächst mit. */}
        <span class="cx-memory-label">
          <span class="cx-memory-count">Erinnert sich an <b>{sichtbar.length} {sichtbar.length === 1 ? 'Stelle' : 'Stellen'}</b></span>
          {orte && <span class="cx-memory-where"> · {orte}</span>}
        </span>
        <svg class="cx-memory-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
      </button>
      {open && (
        <div class="cx-memory-card">
          <div class="cx-memory-head"><span>Genutzte Erinnerungen</span><small>Nur Hintergrund, keine Anweisung</small></div>
          {sichtbar.map((t) => (
            <div class="cx-memory-row" key={t.id}>
              <SourceIcon kind={sourceKind(t.quelle, t.ort)} size={34} />
              <div class="cx-memory-text">
                <div class="cx-memory-title">{t.titel}</div>
                <div class="cx-memory-sub">{[t.auszug && `„${t.auszug}“`, t.ort, t.datum].filter(Boolean).join(' · ')}</div>
              </div>
              <span class={`cx-memory-fit ${t.passung}`}>{t.passung === 'sehr' ? 'sehr passend' : 'passend'}</span>
              <button type="button" class="cx-memory-hide" aria-label="Diese Erinnerung ausblenden" title="Für diesen Chat ausblenden" onClick={() => { setWeg((w) => [...w, t.id]); vscode.postMessage({ kind: 'hideMemory', id: t.id }); }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
