import { useState } from 'preact/hooks';
import type { AgentLane, TranscriptItem } from '../../src/panel/transcript.js';
import { Glyph } from './CortexIcons.js';
import { Markdown } from './Markdown.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';
import { LiveDots, ToolStepRow } from './steps.js';

/**
 * Der Reiter „Subagenten“ im Dock, nach Codex.
 *
 * Oben die laufenden, darunter die fertigen — jeder Subagent eine Zeile mit
 * seinem Zeichen, seinem Namen und rechts, wann er fertig war. Ein Klick
 * wechselt im selben Reiter auf sein Protokoll; der Pfeil oben links führt
 * zurück. Codex schiebt dabei nichts, es wechselt hart — hier genauso.
 */

export interface DockAgent {
  lane: AgentLane;
  running: boolean;
  /** Wann die Antwort fertig war, die ihn gestartet hat. */
  at?: number;
}

/**
 * Alle Subagenten des Chats, neueste zuerst.
 *
 * Läuft ein Subagent noch, entscheidet der Lauf darüber, nicht seine letzte
 * Meldung: ohne laufende Antwort ist er nur noch dann aktiv, wenn er im
 * Hintergrund gestartet wurde und der Lauf nicht abgebrochen ist — dieselbe
 * Regel wie im Control Panel.
 */
export function collectAgents(items: TranscriptItem[]): DockAgent[] {
  const found = new Map<string, DockAgent>();
  for (const item of items) {
    if (item.kind !== 'assistant') continue;
    for (const segment of item.segments) {
      if (segment.kind !== 'agents') continue;
      for (const lane of segment.lanes) {
        const running = lane.status === 'running' && (!item.done || (!!lane.background && !item.stopped));
        found.set(lane.id, { lane, running, at: item.at });
      }
    }
  }
  return [...found.values()].reverse();
}

/**
 * Jedes Zeichen gehört fest zu einem Namen: dieselbe Rolle sieht in jedem
 * Chat gleich aus. Codex färbt sie bunt; Cortex bleibt bei Grau und
 * unterscheidet über die Form — Grün nur, solange einer läuft.
 */
const EMBLEMS = [
  <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4" />,
  <path d="M6 4h12l-4 8 4 8H6l4-8Z" />,
  <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /></>,
  <path d="M12 3c2 4 5 5 9 5-3 3-3 6-1 10-4-1-6 0-8 3-2-3-4-4-8-3 2-4 2-7-1-10 4 0 7-1 9-5Z" />,
  <><path d="M12 3 21 12 12 21 3 12Z" /><path d="M12 8v8M8 12h8" /></>,
  <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5v17" /></>,
  <path d="M12 2.5 14.6 9.4 21.5 12l-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6Z" />,
  <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9h6v6H9Z" /></>,
];

function emblemIndex(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % EMBLEMS.length;
}

function AgentEmblem({ name, running, size = 18 }: { name: string; running?: boolean; size?: number }) {
  return <svg class={`cx-agent-emblem ${running ? 'running' : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {EMBLEMS[emblemIndex(name)]}
  </svg>;
}

/** „vor 3 Tag(e)“ wie bei Codex — nur die gröbste passende Einheit. */
function relativeTime(at: number | undefined, now = Date.now()): string {
  if (!at) return '';
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  return `vor ${Math.round(hours / 24)} Tag(e)`;
}

/** Codex zeigt zehn und fasst den Rest in eine Zeile. */
const VISIBLE = 10;

function AgentRow({ agent, onOpen }: { agent: DockAgent; onOpen: () => void }) {
  return <button class="cx-agent-row" onClick={onOpen} title={agent.lane.prompt ?? agent.lane.label}>
    <AgentEmblem name={agent.lane.label} running={agent.running} />
    <span class="cx-agent-name">{agent.lane.label}</span>
    <span class="cx-agent-when">
      {agent.running
        ? <><span class="cx-agent-now">{agent.lane.activity ?? agent.lane.lastTool ?? 'arbeitet'}</span><LiveDots /></>
        : relativeTime(agent.at)}
    </span>
  </button>;
}

function AgentList({ agents, onOpen }: { agents: DockAgent[]; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const active = agents.filter(agent => agent.running);
  const done = agents.filter(agent => !agent.running);
  const shown = all ? done : done.slice(0, VISIBLE);
  return <div class="cx-agents">
    <section>
      <h3 class="cx-agents-heading"><Glyph name="bolt" size={12} />Aktiv · {active.length}</h3>
      {active.length
        ? active.map(agent => <AgentRow key={agent.lane.id} agent={agent} onOpen={() => onOpen(agent.lane.id)} />)
        : <p class="cx-agents-empty">Keine aktiven Subagenten</p>}
    </section>
    <section>
      <h3 class="cx-agents-heading"><Glyph name="check" size={12} />Fertig · {done.length}</h3>
      {done.length
        ? shown.map(agent => <AgentRow key={agent.lane.id} agent={agent} onOpen={() => onOpen(agent.lane.id)} />)
        : <p class="cx-agents-empty">Noch keiner fertig</p>}
      {done.length > VISIBLE && <button class="cx-agents-more" onClick={() => setAll(v => !v)}>
        <Glyph name={all ? 'chevronDown' : 'dots'} size={12} />
        {all ? 'Weniger anzeigen' : `${done.length - VISIBLE} weitere anzeigen`}
      </button>}
    </section>
  </div>;
}

const STATUS_WORD: Record<AgentLane['status'], string> = {
  running: 'läuft',
  completed: 'fertig',
  failed: 'fehlgeschlagen',
  cancelled: 'abgebrochen',
};

function AgentDetail({ agent, onBack }: { agent: DockAgent; onBack: () => void }) {
  const { lane } = agent;
  const status = lane.status === 'running' && !agent.running ? 'cancelled' : lane.status;
  const meta = [
    lane.durationMs !== undefined ? formatDuration(lane.durationMs) : undefined,
    lane.toolUses !== undefined ? `${lane.toolUses} Werkzeuge` : lane.steps.length ? `${lane.steps.length} Werkzeuge` : undefined,
    lane.tokens !== undefined ? `${formatTokens(lane.tokens)} Tokens` : undefined,
  ].filter(Boolean).join(' · ');
  return <div class="cx-agent-detail">
    <div class="cx-agent-detail-head">
      <button class="cx-icon" aria-label="Zurück zu den Subagenten" title="Zurück" onClick={onBack}><Glyph name="back" size={15} /></button>
      <AgentEmblem name={lane.label} running={agent.running} />
      <strong>{lane.label}</strong>
      <span class="cx-agent-detail-kind">{lane.agentKind ?? ''}</span>
    </div>
    <div class="cx-agent-detail-body">
      {lane.prompt && <div class="cx-agent-prompt"><Markdown text={lane.prompt} /></div>}
      {lane.steps.length > 0 && <div class="cx-agent-steps">
        {lane.steps.map((step, i) => <ToolStepRow key={i} step={step} />)}
      </div>}
      {agent.running && <p class="cx-agent-live"><LiveDots /><span>{lane.activity ?? lane.lastTool ?? 'arbeitet'}</span></p>}
      {lane.summary && <div class="cx-agent-report"><Markdown text={lane.summary} /></div>}
      <p class="cx-agent-meta">
        <Glyph name={status === 'completed' ? 'check' : status === 'running' ? 'bolt' : status === 'failed' ? 'warn' : 'stop'} size={12} />
        <span>{STATUS_WORD[status]}{meta ? ` · ${meta}` : ''}{agent.at && !agent.running ? ` · ${relativeTime(agent.at)}` : ''}</span>
      </p>
    </div>
  </div>;
}

export function AgentsView({ items, agentId, onAgent }: {
  items: TranscriptItem[];
  agentId?: string;
  onAgent: (id: string | undefined) => void;
}) {
  const agents = collectAgents(items);
  const open = agentId ? agents.find(agent => agent.lane.id === agentId) : undefined;
  if (open) return <AgentDetail agent={open} onBack={() => onAgent(undefined)} />;
  if (!agents.length) return <div class="cx-dock-empty">
    <Glyph name="user" size={26} />
    <strong>Keine Subagenten</strong>
    <span>Startet der Agent Helfer, stehen sie hier.</span>
  </div>;
  return <AgentList agents={agents} onOpen={onAgent} />;
}
