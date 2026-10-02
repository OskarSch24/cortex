import { useRef, useState } from 'preact/hooks';
import type { TranscriptItem } from '../../src/panel/transcript.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { conversationImages, type WorkspaceImage } from './imageWorkspaceState.js';
import { useTeamsState } from '../hooks/useTeamsState.js';
import { MAX_TEAM_AGENTS, type TeamJob, type TeamRun, type UnitMergeState } from '../../src/teams/types.js';
import { mergeStage, mergeSummary, swarmShown, swarmTally } from './widgets/spec.js';

/**
 * `onOpen` ist derselbe Weg wie ein Dateilink im Verlauf: Projektdateien gehen
 * rechts im Dock auf, HTML dort als echte Seite; der Rest im Editor daneben.
 */
/** Ab hier wird eine Liste zusammengefaltet, damit die Abschnitte darunter sichtbar bleiben. */
const VISIBLE = 5;

/**
 * Die Schwärme dieses Chats. Ein Lauf kennt seinen Chat nicht; die Karte legt
 * ihn aber unter `swarm-<Chat>-<Karte>` an (widgets/arbeit/agents.tsx).
 * Beendete Läufe bleiben stehen, solange ihre Zusammenführung aussteht
 * (swarmShown); `seen` sind die schon gezeigten.
 */
export function chatSwarms(runs: TeamRun[] | undefined, conversationId: string | undefined, seen?: ReadonlySet<string>): TeamRun[] {
  if (!conversationId) return [];
  const prefix = `swarm-${conversationId}-`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);
  return (runs ?? []).filter(run => run.teamId.startsWith(prefix) && swarmShown(run, seen));
}

const JOB_GLYPH: Record<TeamJob['status'], string> = { running: 'bolt', waiting: 'clock', completed: 'check', failed: 'warn', blocked: 'warn', cancelled: 'stop' };
const JOB_LABEL: Record<TeamJob['status'], string> = { running: 'arbeitet', waiting: 'wartet', completed: 'fertig', failed: 'gescheitert', blocked: 'blockiert', cancelled: 'gestoppt' };

const MERGE_GLYPH: Record<UnitMergeState, string> = { waiting: 'clock', merging: 'refresh', merged: 'check', conflict: 'warn', 'checks-failed': 'warn', outside: 'warn', skipped: 'dots' };
const MERGE_LABEL: Record<UnitMergeState, string> = { waiting: 'eingereiht', merging: 'führt zusammen', merged: 'übernommen', conflict: 'Konflikt', 'checks-failed': 'Prüfung gescheitert', outside: 'außerhalb', skipped: 'ohne Änderung' };
/** Stände der Warteschlange, die im Pool eine eigene Zeile bekommen. */
const MERGE_ATTENTION = new Set<UnitMergeState>(['merging', 'conflict', 'checks-failed', 'outside']);

/** Was bei einer Rolle beim Überfahren steht: Stand, Verstoß, Branch, Zusammenführung, Versuch. */
function jobTitle(job: TeamJob): string {
  const outside = job.outside ?? [];
  const merge = job.merge && MERGE_LABEL[job.merge.state];
  return [
    job.agentName,
    job.activity ?? job.error ?? JOB_LABEL[job.status],
    outside.length && `Außerhalb seines Bereichs geändert: ${outside.slice(0, 12).join(', ')}${outside.length > 12 ? ` und ${outside.length - 12} weitere` : ''}`,
    job.branch && `Branch ${job.branch}`,
    merge && `Zusammenführung: ${merge}${job.merge?.detail ? ` — ${job.merge.detail}` : ''}`,
    (job.attempts ?? 0) > 1 && `Versuch ${job.attempts}`,
    job.conversationId && 'Chat öffnen',
  ].filter(Boolean).join(' · ');
}

export function ControlPanel({ items, onOpen, onCreate, onClose, onImage, onAgent, onSwarm, onChat, conversationId, fit = 1 }: { conversationId?: string; /** Öffnet „Aktive Agenten“, wo der Schwarm als Ganzes steht. */ onSwarm?: () => void; /** Öffnet den eigenen Chat einer Schwarm-Rolle. */ onChat?: (conversationId: string) => void; /** Anteil der vollen Breite, der neben dem Dock Platz hat (0–1): die Karte fährt zusammen, statt zu springen. */ fit?: number; items: TranscriptItem[]; onOpen: (path: string) => void; onCreate: () => void; onClose: () => void; onImage?: (image: WorkspaceImage) => void; /** Öffnet den Subagenten im Dock, wie Codex aus seiner Karte. */ onAgent?: (agentId: string) => void }) {
  const [allSources, setAllSources] = useState(false);
  const [allOutputs, setAllOutputs] = useState(false);
  const images = conversationImages(items);
  // Der Agenten-Schwarm läuft als Team neben dem Chat, nicht als Subagent im Verlauf.
  // Gezeigte Läufe merkt sich das Panel, damit „übernommen“ nach dem Klick stehen bleibt.
  const seenSwarms = useRef(new Set<string>());
  const swarms = chatSwarms(useTeamsState({ newestOnly: true })?.runs, conversationId, seenSwarms.current);
  for (const run of swarms) seenSwarms.current.add(run.id);
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
        const tally = swarmTally(jobs);
        // Ein Pool hat Hunderte Einheiten: gelistet wird nur, was gerade
        // arbeitet oder Aufmerksamkeit braucht, der Rest steht als Zahl darunter.
        const pool = jobs.length > MAX_TEAM_AGENTS;
        const shown = pool ? jobs.filter(job => job.status === 'running' || job.status === 'failed' || job.status === 'blocked' || job.outside?.length || (job.merge && MERGE_ATTENTION.has(job.merge.state))) : jobs;
        const live = run.status === 'running';
        // Die Merge-Warteschlange arbeitet über das Ende der Einheiten hinaus.
        const stage = mergeStage(run);
        const summary = mergeSummary(stage.tally) || (run.merge?.enabled ? 'wartet auf fertige Einheiten' : 'angehalten');
        const target = run.merge?.targetBranch ?? 'deinen Branch';
        const merge = (action: 'start' | 'adopt' | 'stop') => vscode.postMessage({ kind: 'swarmMerge', action, runId: run.id });
        return <div key={run.id} class="cx-control-group">
          <button class="cx-control-row" title={`Agenten-Schwarm · ${run.task}${tally.open ? ` · ${tally.open} warten` : ''}`} onClick={onSwarm}><Glyph name="swarm" size={17} /><span>{live ? `Schwarm · ${tally.running} von ${jobs.length} arbeiten` : `Schwarm · ${tally.done} von ${jobs.length} fertig`}</span>{(live || stage.pending) && <span class="cx-dot" />}</button>
          {shown.map(job => <button key={job.agentId} class={`cx-control-row cx-control-sub is-${job.status}${job.outside?.length ? ' is-outside' : ''}`} title={jobTitle(job)} disabled={!job.conversationId} onClick={() => job.conversationId && onChat?.(job.conversationId)}><Glyph name={job.outside?.length ? 'warn' : JOB_GLYPH[job.status]} size={15} /><span>{job.agentName}</span><small>{job.account && <span class="cx-control-account">{job.account} · </span>}{job.merge
            ? <span class={`cx-control-merge is-${job.merge.state}`} title={job.merge.detail ?? MERGE_LABEL[job.merge.state]}><Glyph name={MERGE_GLYPH[job.merge.state]} size={12} />{MERGE_LABEL[job.merge.state]}</span>
            : JOB_LABEL[job.status]}</small></button>)}
          {pool && <div class="cx-control-row cx-control-sub cx-control-rest"><Glyph name="queue" size={15} /><span>{tally.open} offen · {tally.done} fertig{tally.stopped ? ` · ${tally.stopped} gestoppt` : ''}</span></div>}
          {stage.data && <div class="cx-control-row cx-control-sub cx-control-merge-sum" title={[run.merge?.integrationBranch && `Zusammenführungs-Branch ${run.merge.integrationBranch}`, run.merge?.targetBranch && `Ziel ${run.merge.targetBranch}`, run.merge?.checks.length && `Prüfungen: ${run.merge.checks.join(', ')}`].filter(Boolean).join(' · ') || undefined}><Glyph name="branch" size={15} /><span>Zusammenführung: {summary}</span></div>}
          {run.merge?.adopted === 'ok' && <div class="cx-control-row cx-control-sub cx-control-merge-done"><Glyph name="check" size={15} /><span>In {target} übernommen</span></div>}
          {(stage.canStart || stage.canAdopt || stage.pending) && <div class="cx-control-merge-actions">
            {stage.canStart && <button class="cx-secondary" onClick={() => merge('start')}><Glyph name="branch" size={14} />Zusammenführen starten</button>}
            {stage.canAdopt && <button class="cx-primary" onClick={() => merge('adopt')}><Glyph name="check" size={14} />In {target} übernehmen</button>}
            {stage.pending && <button class="cx-ghost" onClick={() => merge('stop')}><Glyph name="stop" size={14} />Anhalten</button>}
          </div>}
          {run.merge?.adopted === 'failed' && <p class="cx-control-merge-warn"><Glyph name="warn" size={13} /><span>{run.merge.adoptDetail ?? 'Übernehmen ist gescheitert'}</span></p>}
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
