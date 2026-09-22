import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { FileDiffDto } from '../../src/panel/protocol.js';
import type { Segment, ToolStep } from '../../src/panel/transcript.js';
import { CopyButton } from './CopyButton.js';
import { fileName } from './steps.js';
import { submitsInput } from './composerInput.js';
import { appSetting, activityVerbosity, useNative, type ActivityVerbosity } from '../settings/store.js';
import { vscode } from '../vscodeApi.js';

/**
 * Der Chat im Aufbau der Codex-App.
 *
 * Eine Antwort ist kein Kasten, sondern Fließtext. Was der Agent dazwischen
 * getan hat, steht als graue Tätigkeitszeile im Text — einzeln, wenn es ein
 * Schritt war, als aufklappbarer Satz („Hat Dateien gelesen und hat einen
 * Befehl ausgeführt“), wenn es mehrere waren. Ist der Auftrag fertig, faltet
 * sich alles bis auf die Schlussantwort hinter „… lang gearbeitet ›“.
 */

/* ── Symbole ─────────────────────────────────────────────────────────── */

const PATHS: Record<string, string[]> = {
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  terminal: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'm7 11 2-2-2-2', 'M11 13h4'],
  search: ['M11 17a6 6 0 1 0 0-12a6 6 0 0 0 0 12z', 'm21 21-4.3-4.3'],
  folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
  pencil: ['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'm15 5 4 4'],
  images: ['M18 22H4a2 2 0 0 1-2-2V6', 'm22 13-1.3-1.3a2.4 2.4 0 0 0-3.4 0L12 17', 'M16 8a2 2 0 1 1-4 0a2 2 0 0 1 4 0', 'M8 2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'],
  globe: ['M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  agent: ['M12 8V4H8', 'M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z', 'M2 14h2', 'M20 14h2', 'M15 13v2', 'M9 13v2'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronUp: ['m18 15-6-6-6 6'],
  undo: ['M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  arrowUpRight: ['M7 7h10v10', 'M7 17 17 7'],
  diff: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M12 7v6', 'M9 10h6', 'M9 17h6'],
  code: ['m16 18 6-6-6-6', 'm8 6-6 6 6 6'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  text: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  rewind: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  branch: ['M6 3v12', 'M18 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M18 9a9 9 0 0 1-9 9'],
};

export function Icon({ name, size = 15, class: cls }: { name: string; size?: number; class?: string }) {
  return (
    <svg class={`cx-c-icon ${cls ?? ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {(PATHS[name] ?? []).map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/* ── Zeit ────────────────────────────────────────────────────────────── */

/** „11m 58s“ — wie Codex die Arbeitszeit eines Auftrags schreibt. */
export function formatWorked(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** „Heute, 16:36“ · „Gestern, …“ · „Dienstag, …“ innerhalb einer Woche · sonst „11. Sept., …“. */
export function formatStamp(at: number, now = Date.now()): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(date)) / 86_400_000);
  if (days === 0) return `Heute, ${time}`;
  if (days === 1) return `Gestern, ${time}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[date.getDay()]}, ${time}`;
  return `${date.getDate()}. ${MONTHS[date.getMonth()]}${date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`}, ${time}`;
}

/* ── Tätigkeitszeilen ────────────────────────────────────────────────── */

const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?)$/i;

export function stepIcon(step: ToolStep): string {
  switch (step.action) {
    case 'run': return 'terminal';
    case 'search': return 'search';
    case 'read': return step.path && IMAGE.test(step.path) ? 'images' : 'book';
    case 'write':
    case 'edit': return 'pencil';
    case 'fetch': return 'globe';
    case 'task': return 'agent';
    default: return 'wrench';
  }
}

/** Die grauen Zahlen hinter einem Dateinamen: `+68 -0`. */
function LineCounts({ step }: { step: ToolStep }) {
  if (step.added === undefined && step.removed === undefined) return null;
  return <span class="cx-c-counts">+{step.added ?? 0} -{step.removed ?? 0}</span>;
}

export interface ChatActions {
  /** Datei öffnen — rechts im Dock, als Reiter. */
  onOpenPath?: (path: string) => void;
  /** Adresse öffnen — im Cortex-Browser. */
  onOpenUrl?: (url: string) => void;
}

function FileLink({ path, actions }: { path: string; actions: ChatActions }) {
  return (
    <button type="button" class="cx-c-filelink" title={path} onClick={(e) => { e.stopPropagation(); actions.onOpenPath?.(path); }}>
      {fileName(path)}
    </button>
  );
}

const PROGRAMME: Array<[RegExp, string]> = [
  [/^python3?\s+-m\s+(pytest|unittest)\b/, 'Tests ausgeführt'],
  [/^python3?\b|^uv run\b|^\.venv\/bin\/python/, 'Python-Skript ausgeführt'],
  [/^(npx )?vitest\b|^pytest\b|^(npm|pnpm|yarn)( -C \S+)? (run )?test\b/, 'Tests ausgeführt'],
  [/^(npm|pnpm|yarn)( -C \S+)? (run )?build\b|^tsc\b|^node esbuild/, 'Projekt gebaut'],
  [/^(npm|pnpm|yarn)( -C \S+)? (install|add|ci)\b/, 'Pakete installiert'],
  [/^git (status|log|diff|show)\b/, 'Git-Stand angesehen'],
  [/^git (add|commit|push|pull|checkout|switch|merge|rebase|stash)\b/, 'Git-Befehl ausgeführt'],
  [/^(ls|find|tree|du)\b/, 'Ordner angesehen'],
  [/^(cat|head|tail|sed -n|less|wc)\b/, 'Datei angesehen'],
  [/^(grep|rg|ag)\b/, 'Im Code gesucht'],
  [/^(curl|wget)\b/, 'Adresse abgerufen'],
  [/^psql\b|^sqlite3\b/, 'Datenbank abgefragt'],
  [/^(ssh|scp|rsync)\b/, 'Auf dem Server gearbeitet'],
  [/^(mv|cp|mkdir|rm|ln|touch)\b/, 'Dateien verschoben oder angelegt'],
  [/^(bash|sh|zsh) /, 'Skript ausgeführt'],
  [/^(docker|colima|kubectl)\b/, 'Container gesteuert'],
];

/**
 * Ein Shell-Befehl als Satz: `cd "/…/Nordwind Engine" && python3 - <<'PY'` wird zu
 * „Python-Skript ausgeführt in Nordwind Engine“. Der Befehl selbst bleibt im
 * Tooltip und in der aufgeklappten Ansicht — wer ihn sucht, findet ihn.
 */
export function describeCommand(command: string): { was: string; wo?: string } {
  let rest = command.trim();
  let wo: string | undefined;
  const cd = /^cd\s+("([^"]+)"|'([^']+)'|(\S+))\s*(&&|;)\s*/.exec(rest);
  if (cd) {
    const dir = (cd[2] ?? cd[3] ?? cd[4] ?? '').replace(/\/+$/, '');
    wo = dir.split('/').pop() || dir;
    rest = rest.slice(cd[0].length);
  }
  rest = rest.replace(/^(\w+=\S+\s+)+/, '');
  const first = rest.split(/\s*(?:&&|\|\||;|\|)\s*/)[0] ?? rest;
  const treffer = PROGRAMME.find(([re]) => re.test(first));
  const programm = first.split(/\s+/)[0]?.split('/').pop();
  return { was: treffer ? treffer[1] : `Befehl ${programm ? `„${programm}“ ` : ''}ausgeführt`, wo };
}

/**
 * Wie ein Schritt als Zeile klingt. `alone` heißt: er steht für sich im Text,
 * nicht in einer aufgeklappten Gruppe — dann bekommt ein Befehl sein
 * „ausgeführt“, das in der Liste nur wiederholen würde, was das Symbol sagt.
 */
function stepText(step: ToolStep, actions: ChatActions, alone: boolean): ComponentChildren {
  const detail = step.detail?.trim() ?? '';
  switch (step.action) {
    case 'run': {
      const { was, wo } = describeCommand(detail || step.name);
      return <span title={detail || step.name}>{was}{wo && <> in <span class="cx-c-place">{wo}</span></>}</span>;
    }
    case 'search': {
      const quoted = /^"(.*)" in (.+)$/.exec(detail);
      if (quoted) return <>Nach <span class="cx-c-code">{quoted[1]}</span> in <span title={quoted[2]}>{fileName(quoted[2]!)}</span> gesucht</>;
      const bare = /^"(.*)"$/.exec(detail);
      if (bare) return <>Nach <span class="cx-c-code">{bare[1]}</span> gesucht</>;
      const glob = /^(.+) in (.+)$/.exec(detail);
      if (glob) return <>Dateien nach <span class="cx-c-code">{glob[1]}</span> in <span title={glob[2]}>{fileName(glob[2]!)}</span> gesucht</>;
      return detail ? <>Dateien nach <span class="cx-c-code">{detail}</span> gesucht</> : 'Dateien aufgelistet';
    }
    case 'read':
      if (step.path && IMAGE.test(step.path)) return 'Ein Bild angesehen';
      return step.path ? <>Gelesen <FileLink path={step.path} actions={actions} /></> : <>Gelesen {detail}</>;
    case 'write':
      return step.path
        ? <>Erstellt <FileLink path={step.path} actions={actions} /> <LineCounts step={step} /> <span class="cx-c-newdot" title="Neue Datei" /></>
        : <>Erstellt {detail}</>;
    case 'edit':
      if (detail.startsWith('deleted ')) return <>Gelöscht {detail.slice(8)}</>;
      return step.path ? <>Bearbeitet <FileLink path={step.path} actions={actions} /> <LineCounts step={step} /></> : <>Bearbeitet {detail}</>;
    case 'fetch':
      return /^https?:\/\//.test(detail)
        ? <>Geöffnet <button type="button" class="cx-c-filelink" onClick={(e) => { e.stopPropagation(); actions.onOpenUrl?.(detail); }}>{detail.replace(/^https?:\/\//, '')}</button></>
        : <>Im Web nach <span class="cx-c-code">{detail}</span> gesucht</>;
    case 'task':
      return <>Unteragent: {detail || step.name}</>;
    default:
      return <span title={step.name}>Werkzeug verwendet</span>;
  }
}

type Kind = 'other' | 'read' | 'edit' | 'fetch' | 'run' | 'task';
/** Suchen und Auflisten zählen wie bei Codex zum Lesen: beides ist Umsehen im Projekt. */
const kindOf = (step: ToolStep): Kind =>
  step.action === 'write' || step.action === 'edit' ? 'edit'
    : step.action === 'search' || step.action === 'read' ? 'read'
    : ((step.action ?? 'other') as Kind);
/** Die feste Reihenfolge der Codex-Sätze: erst Werkzeug, dann Lesen, Schreiben, Web, Befehle. */
const ORDER: Kind[] = ['other', 'read', 'edit', 'fetch', 'run', 'task'];

/** Der Satz, den eine Gruppe zusammengeklappt zeigt: „Tool geladen, hat Dateien gelesen und hat einen Befehl ausgeführt“. */
export function groupSentence(steps: ToolStep[]): string {
  const counts = new Map<Kind, number>();
  for (const step of steps) counts.set(kindOf(step), (counts.get(kindOf(step)) ?? 0) + 1);
  const phrases = ORDER.filter((kind) => counts.has(kind)).map((kind, i) => {
    const n = counts.get(kind)!;
    const lead = i === 0;
    const hat = lead ? 'Hat' : 'hat';
    switch (kind) {
      case 'other': return `${hat} ${n === 1 ? 'ein Werkzeug' : `${n} Werkzeuge`} verwendet`;
      case 'read': return `${hat} ${n === 1 ? 'eine Datei' : `${n} Dateien`} gelesen`;
      case 'edit': return lead ? `${n === 1 ? 'Datei' : `${n} Dateien`} bearbeitet` : `hat ${n === 1 ? 'eine Datei' : `${n} Dateien`} bearbeitet`;
      case 'fetch': return `${hat} ${n === 1 ? '' : `${n}-mal `}im Web gesucht`;
      case 'run': return `${hat} ${n === 1 ? 'einen Befehl' : `${n} Befehle`} ausgeführt`;
      case 'task': return `${hat} ${n === 1 ? 'einen Unteragenten' : `${n} Unteragenten`} beauftragt`;
    }
  });
  return phrases.length > 1 ? `${phrases.slice(0, -1).join(', ')} und ${phrases[phrases.length - 1]}` : phrases[0] ?? '';
}

/** Das Symbol einer Gruppe: das ihres ersten Teils im Satz. */
function groupIcon(steps: ToolStep[]): string {
  const first = ORDER.find((kind) => steps.some((s) => kindOf(s) === kind));
  return first === 'other' ? 'wrench' : first === 'read' ? 'book' : first === 'edit' ? 'pencil' : first === 'fetch' ? 'globe' : first === 'task' ? 'agent' : 'terminal';
}

/** Ein Schritt, der für sich im Text steht. Hat er einen Inhalt, klappt er auf. */
function StepLine({ step, actions, alone, verbosity }: { step: ToolStep; actions: ChatActions; alone: boolean; verbosity: ActivityVerbosity }) {
  const [open, setOpen] = useState<boolean>();
  const expanded = open ?? verbosity === 'detailed';
  useEffect(() => setOpen(undefined), [verbosity]);
  // Ein Befehl klappt immer auf: zugeklappt steht der Satz, aufgeklappt der Befehl selbst.
  const command = step.action === 'run' ? (step.detail?.trim() || step.name) : '';
  const raw = command ? '' : [...new Set([step.name, step.path, step.detail?.trim()].filter(Boolean))].join('\n');
  const expandable = Boolean(step.preview) || Boolean(command) || Boolean(raw);
  return (
    <div class={`cx-c-step ${alone ? 'alone' : 'inner'} ${expanded ? 'open' : ''}`}>
      <div
        class={`cx-c-line ${expandable ? 'expandable' : ''}`}
        role={expandable ? 'button' : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? expanded : undefined}
        onClick={() => expandable && setOpen(!expanded)}
        onKeyDown={(e) => { if (expandable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(!expanded); } }}
      >
        <Icon name={stepIcon(step)} />
        <span class="cx-c-line-text">{stepText(step, actions, alone)}</span>
        {expandable && <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={13} class="cx-c-chevron" />}
      </div>
      {expanded && command && <CommandView command={command} output={step.preview} />}
      {expanded && raw && <pre class="cx-c-preview cx-c-raw-detail">{raw}</pre>}
      {expanded && !command && step.preview && <Preview step={step} />}
    </div>
  );
}

function CommandView({ command, output }: { command: string; output?: string }) {
  const { wo } = describeCommand(command);
  return (
    <div class="cx-c-command">
      <div class="cx-c-command-head">
        <span>Terminal{wo ? ` · ${wo}` : ''}</span>
        <CopyButton text={command} label="Kopieren" />
      </div>
      <pre class="cx-c-command-body">{command}</pre>
      {output && <pre class="cx-c-command-out">{output}</pre>}
    </div>
  );
}

function Preview({ step }: { step: ToolStep }) {
  const lines = step.preview!.split('\n');
  return (
    <pre class="cx-c-preview">
      {step.action === 'edit'
        ? lines.map((line, i) => <div key={i} class={line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''}>{line || ' '}</div>)
        : step.preview}
    </pre>
  );
}

/** Mehrere Schritte hintereinander: ein Satz, der zu einer Liste aufklappt. */
export function ActivityGroup({ steps, actions }: { steps: ToolStep[]; actions: ChatActions }) {
  const [open, setOpen] = useState<boolean>();
  const [setting] = useNative('cortex.activityVerbosity', 'compact');
  const verbosity = activityVerbosity(setting);
  const expanded = open ?? verbosity === 'detailed';
  useEffect(() => setOpen(undefined), [verbosity]);
  if (verbosity === 'minimal') return <div class="cx-c-line cx-c-activity-minimal"><Icon name={groupIcon(steps)} /><span class="cx-c-line-text">{groupSentence(steps)}</span></div>;
  if (steps.length === 1) return <StepLine step={steps[0]!} actions={actions} alone verbosity={verbosity} />;
  return (
    <div class={`cx-c-group ${expanded ? 'open' : ''}`}>
      <div class="cx-c-line expandable" role="button" tabIndex={0} aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!expanded); } }}>
        <Icon name={groupIcon(steps)} />
        <span class="cx-c-line-text">{groupSentence(steps)}</span>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={13} class="cx-c-chevron" />
      </div>
      {expanded && <div class="cx-c-group-items">{steps.map((step, i) => <StepLine key={i} step={step} actions={actions} alone={false} verbosity={verbosity} />)}</div>}
    </div>
  );
}

/* ── Auftrag: gearbeitet, dann die Antwort ───────────────────────────── */

/**
 * Teilt einen fertigen Auftrag in Arbeit und Schlussantwort. Die Antwort ist
 * der Text nach dem letzten Schritt. Endet der Auftrag mit einem Schritt, ist
 * es der letzte Text überhaupt, und die Schritte danach zählen zur Arbeit —
 * ein Auftrag ohne sichtbare Antwort hätte sonst nichts, was stehen bleibt.
 */
export function splitTurn(segments: Segment[]): { work: Array<[Segment, number]>; final: Array<[Segment, number]> } {
  const indexed = segments.map((s, i) => [s, i] as [Segment, number]);
  let lastWork = -1;
  segments.forEach((s, i) => { if (s.kind !== 'text') lastWork = i; });
  if (lastWork < segments.length - 1) return { work: indexed.slice(0, lastWork + 1), final: indexed.slice(lastWork + 1) };
  let lastText = -1;
  segments.forEach((s, i) => { if (s.kind === 'text') lastText = i; });
  if (lastText === -1) return { work: indexed, final: [] };
  return { work: indexed.filter(([, i]) => i !== lastText), final: [indexed[lastText]!] };
}

/** „11m 58s lang gearbeitet ›“ — die Arbeit eines fertigen Auftrags, eingeklappt. */
export function WorkedFor({ ms, open, onToggle }: { ms?: number; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" class={`cx-c-worked ${open ? 'open' : ''}`} aria-expanded={open} onClick={onToggle}>
      <span>{ms !== undefined ? `${formatWorked(ms)} lang gearbeitet` : 'Zwischenschritte'}</span>
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
    </button>
  );
}

/* ── Deine Nachricht ─────────────────────────────────────────────────── */

/** Ab so vielen Zeilen wird deine Nachricht im Verlauf eingeklappt. */
export const USER_CLAMP_LINES = 17;

/**
 * Deine Nachricht als Blase rechts. Lange Nachrichten bleiben klein — nach
 * 17 Zeilen blendet der Text aus, darunter „Mehr anzeigen“. Zeit und Kopieren
 * erscheinen erst, wenn der Zeiger auf der Nachricht liegt.
 */
/** Vorschaubilder angehängter Bilder, geteilt über alle Nachrichten. */
const thumbCache = new Map<string, string | null>();
const thumbWaiters = new Set<() => void>();
let thumbListening = false;

function useThumbs(paths: string[]): Record<string, string | null> {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!thumbListening) {
      thumbListening = true;
      window.addEventListener('message', (event) => {
        const msg = event.data as { kind?: string; path?: string; src?: string };
        if (msg?.kind !== 'attachmentPreview' || !msg.path) return;
        thumbCache.set(msg.path, msg.src ?? null);
        thumbWaiters.forEach((wake) => wake());
      });
    }
    const wake = () => rerender((n) => n + 1);
    thumbWaiters.add(wake);
    for (const path of paths) {
      if (!IMAGE.test(path) || thumbCache.has(path)) continue;
      thumbCache.set(path, null);
      vscode.postMessage({ kind: 'attachmentPreview', path });
    }
    return () => { thumbWaiters.delete(wake); };
  }, [paths.join('\n')]);
  return Object.fromEntries(paths.map((path) => [path, thumbCache.get(path) ?? null]));
}

/** Trennt den angehängten Block „Attached files:“ vom eigentlichen Text. */
export function splitAttachedFiles(text: string): { text: string; paths: string[] } {
  const match = /\n*Attached files:\n((?:- .*(?:\n|$))+)\s*$/.exec(text);
  if (!match) return { text, paths: [] };
  return { text: text.slice(0, match.index), paths: match[1]!.split('\n').filter(Boolean).map((line) => line.slice(2).trim()) };
}

/**
 * Was sich mit einer eigenen Nachricht tun lässt. Alles davon kappt den Chat
 * vor ihr — auch den Kontext des Modells —, deshalb fehlt es, solange ein
 * Auftrag läuft.
 */
export interface UserMessageActions {
  /** Mit neuem Text neu senden; die Nachricht und alles danach fallen weg. */
  onEdit?: (text: string) => void;
  /** Hierher zurück: der Text liegt wieder im Eingabefeld. */
  onRewind?: () => void;
  /** Ein neuer Chat im Projekt mit dem Verlauf davor. */
  onFork?: () => void;
}

export function UserMessage({ text: rawText, at, attachments: given, actions, anchor, image, edit }: { text: string; at?: number; attachments?: string[]; actions: ChatActions; anchor?: string; image?: import('../../src/panel/imageOptions.js').ImageOptions; edit?: UserMessageActions }) {
  const split = splitAttachedFiles(rawText);
  const text = split.text;
  const keepWhole = /(^|\n)\s*(```|~~~)/.test(text);
  const attachments = given?.length ? given : split.paths;
  const thumbs = useThumbs(attachments);
  const body = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>();
  const editor = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = editor.current;
    if (draft === undefined || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 23 * 16 + 4)}px`;
  }, [draft]);
  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [draft !== undefined]);
  const submitEdit = () => {
    const next = draft?.trim();
    if (!next) return;
    setDraft(undefined);
    if (next !== text.trim()) edit?.onEdit?.(next);
  };
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2 || (expanded && el.scrollHeight > lineHeight(el) * USER_CLAMP_LINES + 2));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div class="cx-c-user" data-anchor={anchor}>
      {image && (
        <div class="cx-c-user-image" title="Bildauftrag">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.8" /><path d="m21 15-4.5-4.5L6 21" /></svg>
          {['Bild', image.ratio, image.count > 1 ? `${image.count} Bilder` : undefined].filter(Boolean).join(' · ')}
        </div>
      )}
      {attachments && attachments.length > 0 && (
        <div class="cx-c-user-files">
          {attachments.map((path) => thumbs[path] ? (
            <button key={path} type="button" class="cx-c-user-thumb" title={path} onClick={() => actions.onOpenPath?.(path)}>
              <img src={thumbs[path]!} alt={fileName(path)} />
            </button>
          ) : (
            <button key={path} type="button" class="cx-c-user-file" title={path} onClick={() => actions.onOpenPath?.(path)}>
              <Icon name={IMAGE.test(path) ? 'images' : 'text'} size={14} />{fileName(path)}
            </button>
          ))}
        </div>
      )}
      {draft !== undefined ? (
        <div class="cx-c-bubble cx-c-bubble-edit">
          <textarea
            ref={editor}
            class="cx-c-edit-input"
            value={draft}
            rows={1}
            aria-label="Nachricht bearbeiten"
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); setDraft(undefined); }
              else if (submitsInput(e, appSetting<string>('composer.senden', 'enter'))) { e.preventDefault(); submitEdit(); }
            }}
          />
          <div class="cx-c-edit-acts">
            <button type="button" class="cx-c-btn" onClick={() => setDraft(undefined)}>Abbrechen</button>
            <button type="button" class="cx-c-btn cx-c-btn-primary" disabled={!draft.trim() || draft.trim() === text.trim()} onClick={submitEdit}>Senden</button>
          </div>
        </div>
      ) : (
        <div class={`cx-c-bubble ${!keepWhole && overflows && !expanded ? 'clamped' : ''}`}>
          <div ref={body} class={`cx-c-bubble-text ${expanded || keepWhole ? '' : 'clamp'}`}>{text}</div>
          {!keepWhole && overflows && !expanded && <div class="cx-c-bubble-more">…</div>}
          {!keepWhole && overflows && (
            <button type="button" class="cx-c-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}<Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
            </button>
          )}
        </div>
      )}
      {draft === undefined && (
        <div class="cx-c-user-foot">
          {at && <span>{formatStamp(at)}</span>}
          {edit?.onRewind && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Hierher zurückgehen — Nachricht und alles danach entfernen, Kontext zurücksetzen" aria-label="Zu dieser Nachricht zurückgehen" onClick={edit.onRewind}>
              <Icon name="rewind" size={14} />
            </button>
          )}
          {edit?.onFork && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Abzweigen — neuer Chat im Projekt mit dem Verlauf bis hierher" aria-label="Ab hier abzweigen" onClick={edit.onFork}>
              <Icon name="branch" size={14} />
            </button>
          )}
          {edit?.onEdit && !image && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Bearbeiten und neu senden" aria-label="Nachricht bearbeiten" onClick={() => setDraft(text)}>
              <Icon name="pencil" size={14} />
            </button>
          )}
          <CopyButton icon text={text} label="Nachricht kopieren" className="cx-c-copy" />
        </div>
      )}
    </div>
  );
}

function lineHeight(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).lineHeight) || 23;
}

/** Die Zeile über einer Nachricht, die nach einer Pause kommt. */
export function DateDivider({ at }: { at: number }) {
  return <div class="cx-c-date">{formatStamp(at)}</div>;
}

/* ── Webvorschau ─────────────────────────────────────────────────────── */

const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s)\]>"'`]*/gi;

export function localUrls(text: string): string[] {
  const urls = [...text.matchAll(LOCAL_URL)].map(match => {
    const before = text[match.index! - 1];
    // Delimiters make the address unambiguous. Punctuation inside belongs to it.
    return before && '`<\"\'('.includes(before) ? match[0] : match[0].replace(/[.,;:!?]+$/, '');
  });
  return [...new Set(urls)].filter(value => {
    try { return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(new URL(value).hostname); } catch { return false; }
  });
}

/** Die erste lokale Adresse einer Antwort — das, was eine Webvorschau zeigen kann. */
export function localUrl(text: string): string | undefined {
  return localUrls(text)[0];
}

/** Die Karte unter einer Antwort, die eine laufende Website nennt. */
export function WebPreviewCard({ url, onOpenIn }: { url: string; onOpenIn: (app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  const pick = (app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => { setMenu(false); onOpenIn(app); };
  return (
    <div class="cx-c-card cx-c-web">
      <button type="button" class="cx-c-card-head" onClick={() => onOpenIn('cortex')} title={url}>
        <span class="cx-c-card-mark globe"><Icon name="globe" size={18} /></span>
        <span class="cx-c-card-title"><strong>Webvorschau</strong><small>{new URL(url).host}{new URL(url).pathname === '/' ? '' : new URL(url).pathname}</small></span>
      </button>
      <div class="cx-c-menu-anchor" ref={ref}>
        <button type="button" class="cx-c-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          Öffnen in<Icon name="chevronDown" size={13} />
        </button>
        {menu && (
          <div class="cx-c-menu" role="menu">
            <button role="menuitem" onClick={() => pick('cortex')}><Icon name="globe" size={14} />Cortex-Browser</button>
            <button role="menuitem" onClick={() => pick('chrome')}><Icon name="globe" size={14} />Google Chrome</button>
            <button role="menuitem" onClick={() => pick('safari')}><Icon name="globe" size={14} />Safari</button>
            <div class="cx-c-menu-rule" />
            <button role="menuitem" onClick={() => pick('copy')}><Icon name="link" size={14} />Link kopieren</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Änderungen eines Auftrags ───────────────────────────────────────── */

export interface TurnFile {
  path: string;
  added?: number;
  removed?: number;
}

/** Die Dateien, die ein Auftrag geschrieben hat, mit den Zeilen aus seinen eigenen Aufrufen. */
export function turnFiles(segments: Segment[]): TurnFile[] {
  const byPath = new Map<string, TurnFile>();
  for (const segment of segments) {
    if (segment.kind !== 'tools') continue;
    for (const step of segment.steps) {
      if ((step.action !== 'write' && step.action !== 'edit') || !step.path) continue;
      const file = byPath.get(step.path) ?? { path: step.path };
      if (step.added !== undefined) file.added = (file.added ?? 0) + step.added;
      if (step.removed !== undefined) file.removed = (file.removed ?? 0) + step.removed;
      byPath.set(step.path, file);
    }
  }
  return [...byPath.values()];
}

function Counts({ added, removed }: { added?: number; removed?: number }) {
  if (added === undefined && removed === undefined) return null;
  return <span class="cx-c-diffcounts"><b>+{added ?? 0}</b> <i>-{removed ?? 0}</i></span>;
}

function PathLabel({ path }: { path: string }) {
  const cut = path.lastIndexOf('/');
  return cut === -1 ? <b>{path}</b> : <><span>{path.slice(0, cut + 1)}</span><b>{path.slice(cut + 1)}</b></>;
}

/**
 * „3 Dateien bearbeitet“ unter einem Auftrag. Beim Überfahren einer Datei
 * schwebt ihr Diff darüber; Überprüfen öffnet die Prüfansicht, Rückgängig
 * setzt die Dateien dieses Auftrags auf den Stand davor (mit Rückfrage).
 */
export function TurnChanges({ files, diffs, reverted, revertReason, onReview, onRevert, onOpenPath }: {
  files: TurnFile[];
  diffs: FileDiffDto[];
  reverted?: boolean;
  revertReason?: string;
  onReview: () => void;
  onRevert: () => void;
  onOpenPath: (path: string) => void;
}) {
  const [hover, setHover] = useState<{ path: string; top: number }>();
  const [headHover, setHeadHover] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!files.length) return null;
  const git = new Map(diffs.map((d) => [d.path, d]));
  const stat = (f: TurnFile) => {
    const g = git.get(f.path);
    const known = f.added !== undefined || f.removed !== undefined;
    return known ? { added: f.added ?? 0, removed: f.removed ?? 0 } : g ? { added: g.added, removed: g.removed } : {};
  };
  const added = files.reduce((n, f) => n + (stat(f).added ?? 0), 0);
  const removed = files.reduce((n, f) => n + (stat(f).removed ?? 0), 0);
  const shown = hover ? git.get(hover.path) : undefined;
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(undefined), 120); };
  return (
    <div class={`cx-c-card cx-c-changes ${reverted ? 'reverted' : ''}`} ref={card}>
      <div class="cx-c-changes-head">
        <button type="button" class="cx-c-card-head" onClick={onReview} onMouseEnter={() => setHeadHover(true)} onMouseLeave={() => setHeadHover(false)}>
          <span class="cx-c-card-mark"><Icon name="diff" size={17} /></span>
          <span class="cx-c-card-title">
            <strong>{files.length} {files.length === 1 ? 'Datei' : 'Dateien'} bearbeitet</strong>
            {reverted ? <small>Rückgängig gemacht</small>
              : headHover || !(added || removed) ? <small>Änderungen prüfen <Icon name="arrowUpRight" size={12} /></small>
              : <small><Counts added={added} removed={removed} /></small>}
          </span>
        </button>
        {!reverted && <span title={revertReason}><button type="button" class="cx-c-textbtn" disabled={!!revertReason} aria-label={revertReason ? `Rückgängig nicht verfügbar: ${revertReason}` : 'Rückgängig machen'} onClick={onRevert}>Rückgängig machen<Icon name="undo" size={13} /></button></span>}
        <button type="button" class="cx-c-btn" onClick={onReview}>Überprüfen</button>
      </div>
      <div class="cx-c-changes-list">
        {files.map((f) => {
          const s = stat(f);
          return (
            <button key={f.path} type="button" class="cx-c-changes-row" title={f.path}
              onClick={() => onOpenPath(f.path)}
              onMouseEnter={(e) => {
                clearTimeout(timer.current);
                const row = e.currentTarget as HTMLElement;
                setHover({ path: f.path, top: row.offsetTop });
              }}
              onMouseLeave={leave}>
              <span class="cx-c-path"><PathLabel path={f.path} /></span>
              <Counts added={s.added} removed={s.removed} />
            </button>
          );
        })}
      </div>
      {hover && shown?.hunks && shown.hunks.length > 0 && (
        <div class="cx-c-diffpop" style={{ top: `${hover.top}px` }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>
          <div class="cx-c-diffpop-head"><span>{shown.path}</span><Counts added={shown.added} removed={shown.removed} /></div>
          <div class="cx-c-diffpop-body">
            {shown.hunks.flatMap((h) => h.lines).slice(0, 60).map((line, i) => (
              <div key={i} class={`cx-c-diffline ${line.kind}`}>
                <span class="n">{line.line ?? ''}</span>
                <span class="t">{line.text || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
