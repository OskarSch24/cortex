import { useState } from 'preact/hooks';
import type { TranscriptItem } from '../../src/panel/transcript.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { conversationImages, type WorkspaceImage } from './imageWorkspaceState.js';
import { useTeamsState } from '../hooks/useTeamsState.js';
import type { TeamJob, TeamRun } from '../../src/teams/types.js';

/**
 * `onOpen` ist derselbe Weg wie ein Dateilink im Verlauf: Projektdateien gehen
 * rechts im Dock auf, HTML dort als echte Seite; der Rest im Editor daneben.
 */
/** Ab hier wird eine Liste zusammengefaltet, damit die Abschnitte darunter sichtbar bleiben. */
const VISIBLE = 5;

/**
 * Die Schwärme dieses Chats. Ein Lauf kennt seinen Chat nicht; die Karte legt
 * ihn aber unter `swarm-<Chat>-<Karte>` an (widgets/arbeit/agents.tsx).
 */
export function chatSwarms(runs: TeamRun[] | undefined, conversationId: string | undefined): TeamRun[] {
  if (!conversationId) return [];
  const prefix = `swarm-${conversationId}-`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  return (runs ?? []).filter(run => run.status === 'running' && run.teamId.startsWith(prefix));
}

const JOB_GLYPH: Record<TeamJob['status'], string> = { running: 'bolt', waiting: 'clock', completed: 'check', failed: 'warn', blocked: 'warn', cancelled: 'stop' };
const JOB_LABEL: Record<TeamJob['status'], string> = { running: 'arbeitet', waiting: 'wartet', completed: 'fertig', failed: 'gescheitert', blocked: 'blockiert', cancelled: 'gestoppt' };

export function ControlPanel({ items, onOpen, onCreate, onClose, onImage, onAgent, onSwarm, onChat, conversationId, fit = 1 }: { conversationId?: string; /** Öffnet „Aktive Agenten“, wo der Schwarm als Ganzes steht. */ onSwarm?: () => void; /** Öffnet den eigenen Chat einer Schwarm-Rolle. */ onChat?: (conversationId: string) => void; /** Anteil der vollen Breite, der neben dem Dock Platz hat (0–1): die Karte fährt zusammen, statt zu springen. */ fit?: number; items: TranscriptItem[]; onOpen: (path: string) => void; onCreate: () => void; onClose: () => void; onImage?: (image: WorkspaceImage) => void; /** Öffnet den Subagenten im Dock, wie Codex aus seiner Karte. */ onAgent?: (agentId: string) => void }) {
  const [allSources, setAllSources] = useState(false);
  const [allOutputs, setAllOutputs] = useState(false);
  const images = conversationImages(items);
  // Der Agenten-Schwarm läuft als Team neben dem Chat, nicht als Subagent im Verlauf.
  const swarms = chatSwarms(useTeamsState({ newestOnly: true })?.runs, conversationId);
  const outputs = new Set<string>();
  const sources = new Set<string>();
  const agents = new Map<string, { label: string; activity?: string }>();
  for (const item of items) {
    if (item.kind === 'user') for (const path of item.attachments ?? []) sources.add(path);
    if (item.kind !== 'assistant') continue;
    for (const segment of item.segments) {
      if (segment.kind === 'tools') for (const step of segment.steps) {
        if (step.path && (step.action === 'write' || step.action === 'edit')) outputs.add(step.path);
        if (step.path && step.action === 'read') sources.add(step.path);
      }
      if (segment.kind === 'agents') for (const lane of segment.lanes) {
        // Ein Hintergrund-Agent überlebt die Antwort, die ihn gestartet hat —
        // genau dafür wurde er im Hintergrund gestartet. Das Ende des Turns
        // darf ihn hier also nicht ausblenden. Ein abgebrochener Lauf reißt
        // seine Kinder dagegen mit: dann ist die Zeile eine Lüge.
        if (lane.background && lane.status === 'running' && !item.stopped) {
          agents.set(lane.id, { label: lane.label, activity: lane.activity });
        }
      }
    }
  }
  const fileRow = (path: string) => <button class="cx-control-row" title={path} onClick={() => onOpen(path)}><Glyph name="file" size={17} /><span>{path.split('/').pop()}</span></button>;
  /**
   * Eine lange Liste schiebt sonst die Abschnitte darunter aus dem Panel: das
   * Panel scrollt zwar, aber niemand sucht dort nach den Hintergrundprozessen.
   */
  const moreRow = (count: number, expanded: boolean, toggle: () => void) => count > VISIBLE
    ? <button class="cx-control-row cx-control-more" onClick={toggle}><Glyph name="link" size={17} /><span>{expanded ? 'Weniger anzeigen' : `Alle anzeigen (${count})`}</span></button>
    : null;
  const squeezed = fit <= 0;
  const running = agents.size + swarms.reduce((sum, run) => sum + (run.jobs ?? []).filter(job => job.status === 'running').length, 0);
  return <aside class={`cx-control-panel ${images.length ? 'has-images' : ''} ${fit < 1 ? 'fitting' : ''} ${squeezed ? 'squeezed' : ''}`} style={fit < 1 ? { '--cx-card-k': String(fit) } : undefined} aria-label="Chat-Control-Panel" aria-hidden={squeezed || undefined} inert={squeezed || undefined}>
    <div class="cx-control-heading"><span>Ausgaben</span><button class="cx-icon" title="Datei oder Website erstellen" aria-label="Datei oder Website erstellen" onClick={onCreate}><Glyph name="plus" size={20} /></button><button class="cx-icon cx-control-close" aria-label="Control Panel schließen" onClick={onClose}><Glyph name="close" size={15} /></button></div>
    {[...outputs].slice(0, allOutputs ? undefined : VISIBLE).map(fileRow)}
    {moreRow(outputs.size, allOutputs, () => setAllOutputs(!allOutputs))}
    {images.map(image => <button key={image.path} class="cx-control-row" onClick={() => onImage?.(image)}><img class="cx-control-image" src={image.src} alt="" /><span>Generiertes Bild</span></button>)}
    {!outputs.size && !images.length && <button class="cx-control-empty-action" onClick={onCreate}>Datei oder Website erstellen</button>}
    {(!images.length || agents.size > 0 || swarms.length > 0) && <section><div class="cx-control-heading"><span>Hintergrundprozesse</span>{running > 0 && <span class="cx-control-count" title={`${running} laufen gerade`}>{running}</span>}</div>
      {swarms.map(run => {
        const jobs = run.jobs ?? [];
        const busy = jobs.filter(job => job.status === 'running');
        const waiting = jobs.filter(job => job.status === 'waiting').length;
        return <div key={run.id} class="cx-control-group">
          <button class="cx-control-row" title={`Agenten-Schwarm · ${run.task}${waiting ? ` · ${waiting} warten` : ''}`} onClick={onSwarm}><Glyph name="swarm" size={17} /><span>Schwarm · {busy.length} von {jobs.length} arbeiten</span><span class="cx-dot" /></button>
          {jobs.map(job => <button key={job.agentId} class={`cx-control-row cx-control-sub is-${job.status}`} title={`${job.agentName} · ${job.activity ?? job.error ?? JOB_LABEL[job.status]}${job.conversationId ? ' · Chat öffnen' : ''}`} disabled={!job.conversationId} onClick={() => job.conversationId && onChat?.(job.conversationId)}><Glyph name={JOB_GLYPH[job.status]} size={15} /><span>{job.agentName}</span><small>{JOB_LABEL[job.status]}</small></button>)}
        </div>;
      })}
      {[...agents].map(([id, agent]) => <button key={id} class="cx-control-row" title={agent.activity} onClick={() => onAgent?.(id)}><Glyph name="terminal" size={17} /><span>{agent.label}</span><span class="cx-dot" /></button>)}
      {!agents.size && !swarms.length && <p class="cx-control-empty">Keine gemeldeten Hintergrundprozesse</p>}
    </section>}
    <section><div class="cx-control-heading"><span>Quellen</span><button class="cx-icon" title="Quellen hinzufügen" aria-label="Quellen hinzufügen" onClick={() => vscode.postMessage({ kind: 'pickAttachments' })}><Glyph name="plus" size={20} /></button></div>
      {[...sources].slice(0, allSources ? undefined : VISIBLE).map(fileRow)}
      {!sources.size && <p class="cx-control-empty">{images.length ? 'Dateien anhängen oder Apps verbinden' : 'Anhänge und gelesene Dateien erscheinen hier.'}</p>}
      {moreRow(sources.size, allSources, () => setAllSources(!allSources))}
    </section>
  </aside>;
}
