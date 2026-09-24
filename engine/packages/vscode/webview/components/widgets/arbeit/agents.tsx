/** Arbeits-Widgets: Agenten-Lauf und Agenten-Schwarm. */
import { useEffect, useState } from 'preact/hooks';
import {
  Actions, Card, Check, Dot, Foot, Head, Pill, Spinner, StateMark, TONE, WIcon, list, str, type WidgetHost,
} from '../parts.js';
import { useTeamsState } from '../../../hooks/useTeamsState.js';
import { useWidgetState } from '../state.js';
import { vscode } from '../../../vscodeApi.js';
import {
  MAX_PARALLEL, MAX_PER_ACCOUNT, MAX_TEAM_AGENTS, type AgentTeam, type TeamJobStatus, type TeamRun,
} from '../../../../src/teams/types.js';
import {
  type AgentRunW, type AgentSwarmW, type Tone,
} from '../spec.js';

/* ── Agenten-Lauf ───────────────────────────────────────────────────────── */

export function AgentRun({ w, host }: { w: AgentRunW; host: WidgetHost }) {
  const steps = list(w.steps);
  const running = steps.some((s) => s.state === 'now');
  const failed = steps.some((s) => s.state === 'failed');
  return (
    <Card label={`Agentenlauf ${w.title}`}>
      <Head mark="spark" markTone={failed ? TONE.neg : running ? TONE.info : TONE.pos} title={w.title} sub={w.account} right={
        w.elapsed ? <Pill tone={failed ? 'neg' : running ? 'info' : 'pos'}>{running && <Spinner size={12} />}<span class="cx-w-num">{w.elapsed}</span></Pill> : undefined
      } />
      <div class="cx-w-segs">
        {steps.map((s, i) => <i key={i} class={s.state} />)}
      </div>
      <div class="cx-w-rows sep pad4">
        {steps.map((s, i) => (
          <div class="cx-w-row" key={i}>
            <StateMark state={s.state} />
            <span class={`cx-w-grow ${s.state === 'now' ? 'cx-w-v' : s.state === 'next' ? 'cx-w-dim' : ''}`}>
              {s.text}
              {(s.added !== undefined || s.removed !== undefined) && <> <span class="cx-w-add">+{s.added ?? 0}</span> <span class="cx-w-del">−{s.removed ?? 0}</span></>}
            </span>
            {s.duration && <span class="cx-w-num cx-w-dim cx-w-small">{s.duration}</span>}
          </div>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Agenten-Schwarm ────────────────────────────────────────────────────── */

/**
 * Was eine größere Besetzung kostet. Bewusst keine Prozentzahl — gemessen wird
 * nichts davon, benannt wird der Grund. Nur die letzte Stufe ist hart: ab
 * MAX_PARALLEL warten Rollen tatsächlich, statt zu laufen.
 */
function swarmGrade(count: number): { title: string; tone: Tone; cause: string; text: string } {
  if (count <= 3) return { title: 'keiner', tone: 'pos', cause: 'getrennte Teile',
    text: 'Jede Rolle arbeitet an ihrem eigenen Teil. Es gibt kaum etwas zusammenzuführen.' };
  if (count <= 5) return { title: 'gering', tone: 'warn', cause: 'Zusammenführung',
    text: 'Die Teilergebnisse müssen zusammengeführt werden. Plane eine Rolle dafür ein oder lies sie selbst zusammen.' };
  if (count <= 8) return { title: 'spürbar', tone: 'warn', cause: 'Überschneidung',
    text: 'Ab sechs Rollen greifen die Aufträge oft ineinander: doppelte Arbeit und widersprüchliche Ergebnisse.' };
  return { title: 'hoch', tone: 'neg', cause: 'Warteschlange',
    text: `Mehr Rollen als zugleich laufen können: ${MAX_PARALLEL} gleichzeitig, ${MAX_PER_ACCOUNT} je Konto. Der Rest wartet.` };
}

const SWARM_STATE: Record<TeamJobStatus, 'done' | 'now' | 'next' | 'failed'> = {
  completed: 'done', running: 'now', waiting: 'next', cancelled: 'next', failed: 'failed', blocked: 'failed',
};
const SWARM_STATUS: Record<TeamJobStatus, string> = {
  waiting: 'wartet', running: 'arbeitet', completed: 'fertig', failed: 'gescheitert', cancelled: 'gestoppt', blocked: 'blockiert',
};

/**
 * Der gestartete Schwarm im Chat: nur eine Zeile. Gearbeitet wird im
 * Hintergrund — die Rollen stehen in der Übersicht unter
 * „Hintergrundprozesse“, jede mit ihrem eigenen Chat in der Seitenleiste.
 */
function SwarmRun({ run }: { run: TeamRun }) {
  const jobs = list(run.jobs);
  const done = jobs.filter((job) => job.status === 'completed').length;
  const active = jobs.filter((job) => job.status === 'running').length;
  const failed = jobs.filter((job) => SWARM_STATE[job.status] === 'failed').length;
  const running = run.status === 'running';
  return (
    <Card label="Agenten-Schwarm">
      <Head mark="swarm" markTone={running ? TONE.violet : failed ? TONE.neg : TONE.pos}
        title={running ? `Agenten-Schwarm läuft · ${active} von ${jobs.length} arbeiten` : `Agenten-Schwarm ${failed ? 'beendet' : 'fertig'} · ${done} von ${jobs.length}`}
        sub={running
          ? `${done} fertig · ${Math.max(0, jobs.length - done - active)} warten · im Hintergrund, siehe Übersicht`
          : failed ? `${failed} ohne Ergebnis · die Rollen-Chats stehen in der Seitenleiste` : 'Die Ergebnisse stehen in den Rollen-Chats in der Seitenleiste'}
        right={running ? <button type="button" class="cx-w-btn" onClick={() => vscode.postMessage({ kind: 'stopTeam', runId: run.id })}>
          <WIcon name="close" size={12} width={2} />Alle stoppen
        </button> : undefined} />
    </Card>
  );
}

export function AgentSwarm({ w, host }: { w: AgentSwarmW; host: WidgetHost }) {
  const proposed = list(w.agents);
  const [draft, setDraft, loaded] = useWidgetState(host, () => ({
    task: str(w.task),
    count: Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.round(Number(w.count) || proposed.length || 4))),
    agentIds: [] as string[],
    started: false,
  }));
  const teams = useTeamsState();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  // Dieselbe Karte schreibt immer dasselbe Profil, statt bei jedem Start ein neues.
  const swarmId = `swarm-${host.conversationId ?? 'chat'}-${host.stateKey ?? 'karte'}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100);

  useEffect(() => {
    const receive = (event: MessageEvent<{ kind?: string; message?: string }>) => {
      if (event.data?.kind === 'teamError') setError(str(event.data.message));
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);

  const saved = (teams?.teams ?? []).filter((team) => team.kind === 'agent');
  const run = [...(teams?.runs ?? [])].reverse().find((item) => item.teamId === swarmId);

  // Hat der Nutzer den Start schon verlangt, startet die Karte selbst — genau einmal.
  useEffect(() => {
    if (w.start !== true || !loaded || !teams || draft.started || run || !draft.task.trim()) return;
    setDraft((before) => ({ ...before, started: true }));
    vscode.postMessage({ kind: 'startSwarm', swarmId, task: draft.task.trim(), count: Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.round(draft.count) || 1)), agentIds: draft.agentIds, proposed });
  }, [loaded, !!teams, draft.started, !!run]);

  if (run && (run.status === 'running' || draft.started || w.start === true)) return <SwarmRun run={run} />;
  if (w.start === true && !error && draft.task.trim() && !run) {
    return <Card label="Agenten-Schwarm"><Head mark="swarm" markTone={TONE.violet} title="Agenten-Schwarm startet …" sub={`${proposed.length || draft.count} Rollen im Hintergrund`} /></Card>;
  }

  const picked = draft.agentIds
    .map((id) => saved.find((team) => team.id === id))
    .filter((team): team is AgentTeam => !!team);
  const count = Math.min(MAX_TEAM_AGENTS, Math.max(1, picked.length, Math.round(draft.count) || 1));
  const grade = swarmGrade(count);
  const free = Math.max(0, count - picked.length);
  const ready = loaded && draft.task.trim().length > 0;

  const setCount = (next: number) => setDraft((before) => ({ ...before, count: Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.round(next) || 1)) }));
  // Mehr anhaken, als Plätze da sind, hebt die Anzahl mit an — bis zur Grenze.
  const toggle = (id: string) => setDraft((before) => {
    const agentIds = before.agentIds.includes(id)
      ? before.agentIds.filter((other) => other !== id)
      : [...before.agentIds, id].slice(0, MAX_TEAM_AGENTS);
    return { ...before, agentIds, count: Math.min(MAX_TEAM_AGENTS, Math.max(before.count, agentIds.length)) };
  });
  const start = () => {
    setError('');
    setDraft((before) => ({ ...before, started: true }));
    vscode.postMessage({ kind: 'startSwarm', swarmId, task: draft.task.trim(), count, agentIds: draft.agentIds, proposed });
  };

  return (
    <Card label="Agenten-Schwarm">
      <Head mark="swarm" markTone={TONE.violet} title="Agenten-Schwarm"
        sub={picked.length ? `${picked.length} gewählt · ${free} automatisch` : 'Besetzung automatisch'}
        right={<button type="button" class="cx-w-btn primary" disabled={!ready} onClick={start}>
          <WIcon name="play" size={12} fill="currentColor" />Starten
        </button>} />

      <div class="cx-w-sep cx-w-swarm">
        <label class="cx-w-label" for={`${swarmId}-task`}>{draft.task.trim() ? 'Auftrag für alle Rollen' : 'Was sollen die Agenten machen?'}</label>
        <textarea class="cx-w-area" id={`${swarmId}-task`} rows={2} value={draft.task}
          placeholder="Auftrag in einem Satz — er gilt für alle Rollen."
          onInput={(event) => setDraft((before) => ({ ...before, task: event.currentTarget.value }))} />
      </div>

      <div class="cx-w-sep cx-w-swarm">
        <div class="cx-w-swarm-row">
          <label class="cx-w-label" for={`${swarmId}-count`}>Anzahl</label>
          <div class="cx-w-counter">
            <button type="button" aria-label="Eine Rolle weniger" disabled={count <= Math.max(1, picked.length)} onClick={() => setCount(count - 1)}>−</button>
            <input id={`${swarmId}-count`} type="number" min={1} max={MAX_TEAM_AGENTS} value={count}
              onInput={(event) => setCount(Number(event.currentTarget.value))} />
            <button type="button" aria-label="Eine Rolle mehr" disabled={count >= MAX_TEAM_AGENTS} onClick={() => setCount(count + 1)}>+</button>
          </div>
          <span class="cx-w-label cx-w-grow">von {MAX_TEAM_AGENTS} · {MAX_PARALLEL} laufen gleichzeitig</span>
        </div>
        <div class="cx-w-segs cx-w-swarm-segs">
          {Array.from({ length: MAX_TEAM_AGENTS }, (_, i) => (
            <i key={i} class={i < count ? 'done' : 'next'}
              style={i < count && i >= picked.length ? { background: TONE[grade.tone] } : undefined} />
          ))}
        </div>
        <div class="cx-w-box pad cx-w-swarm-grade">
          <div class="cx-w-swarm-verdict">
            <Dot color={TONE[grade.tone]} />
            <span>Qualitätsverlust: {grade.title}</span>
            <Pill tone={grade.tone}>{grade.cause}</Pill>
          </div>
          <span class="cx-w-dim cx-w-small">{grade.text}</span>
        </div>
      </div>

      <div class="cx-w-sep cx-w-swarm">
        <div class="cx-w-swarm-row">
          <span class="cx-w-label cx-w-grow">Besetzung · {picked.length} fest, {free} automatisch</span>
          <button type="button" class="cx-w-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
            Agenten wählen<WIcon name="chevronDown" size={12} />
          </button>
        </div>
        {open && (
          <div class="cx-w-pick">
            {saved.length === 0
              ? <p class="cx-w-dim cx-w-small cx-w-pick-empty">Noch keine gespeicherten Agenten. Ohne Auswahl besetzt Cortex die Rollen aus dem Auftrag.</p>
              : saved.map((team) => (
                <button type="button" key={team.id} class="cx-w-opt" aria-pressed={draft.agentIds.includes(team.id)} onClick={() => toggle(team.id)}>
                  <Check on={draft.agentIds.includes(team.id)} />
                  <span class="cx-w-opt-name">
                    <b>{team.name}</b>
                    <span class="cx-w-dim cx-w-small">{team.agents[0]?.role || 'Ohne Rollenbeschreibung'}</span>
                  </span>
                </button>
              ))}
          </div>
        )}
        <div class="cx-w-rows cx-w-box">
          {Array.from({ length: count }, (_, slot) => {
            const agent = picked[slot];
            const suggestion = proposed[slot - picked.length];
            return (
              <div class="cx-w-row" key={slot}>
                <span class={`cx-w-ava${agent ? '' : ' auto'}`}>{agent ? agent.name.slice(0, 1) : ''}</span>
                <span class={`cx-w-grow ${agent ? 'cx-w-v' : ''}`}>{agent?.name ?? suggestion?.name ?? 'Automatisch passend'}</span>
                <span class="cx-w-dim cx-w-small">{agent?.agents[0]?.role || suggestion?.role || 'wird beim Start bestimmt'}</span>
              </div>
            );
          })}
        </div>
      </div>

      {error && <div class="cx-w-sep cx-w-swarm"><span style={{ color: TONE.neg }}>{error}</span></div>}

      <Foot left={w.note ?? 'Automatisch besetzte Rollen arbeiten mit deiner Werkzeugfreigabe nebeneinander im Projekt, je Konto drei zugleich.'}
        right={run ? `Zuletzt: ${SWARM_STATUS[run.jobs.every((job) => job.status === 'completed') ? 'completed' : 'failed']}` : w.source} />
    </Card>
  );
}
