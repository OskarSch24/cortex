import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Segment, ToolStep } from '../../../src/panel/transcript.js';
import { activityVerbosity, useNative, type ActivityVerbosity } from '../../settings/store.js';
import { formatWorked } from '../../format/duration.js';
import { CopyButton } from '../CopyButton.js';
import { fileName } from '../steps.js';
import { Icon } from './Icon.js';

/* ── Tätigkeitszeilen ────────────────────────────────────────────────── */

export const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|bmp|tiff?)$/i;

function stepIcon(step: ToolStep): string {
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
 * Wie ein Schritt als Zeile klingt.
 */
function stepText(step: ToolStep, actions: ChatActions): ComponentChildren {
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
        <span class="cx-c-line-text">{stepText(step, actions)}</span>
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
