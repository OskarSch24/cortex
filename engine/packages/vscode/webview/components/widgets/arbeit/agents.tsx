/** Arbeits-Widgets: Agenten-Lauf und Agenten-Schwarm. */
import { useEffect, useState } from 'preact/hooks';
import {
  Actions, Card, Check, Dot, Foot, Head, Pill, Spinner, StateMark, TONE, WIcon, list, str, type WidgetHost,
} from '../parts.js';
import { useTeamsState } from '../../../hooks/useTeamsState.js';
import { useWidgetState } from '../state.js';
import { vscode } from '../../../vscodeApi.js';
import {
  MAX_PARALLEL, MAX_TEAM_AGENTS, type AgentTeam, type TeamIsolation, type TeamJobStatus, type TeamRun,
} from '../../../../src/teams/types.js';
import {
  mergeTally, swarmPlan, swarmTally, type AgentRunW, type AgentSwarmW, type SwarmPlan, type Tone,
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

type Grade = { title: string; tone: Tone; cause: string; text: string };

/** Wo die Rollen arbeiten — gilt für Schwarm und Pool gleich. */
function isolationNote(isolation?: TeamIsolation): string {
  return isolation === 'shared'
    ? 'Alle arbeiten im selben Ordner.'
    : 'In einem Git-Projekt arbeitet jede in ihrem eigenen Worktree; zusammengeführt wird über die Merge-Warteschlange.';
}

/**
 * Was eine größere Besetzung an Qualität kosten kann. Gemessen wird nichts
 * davon, benannt wird der Grund: Rollen ohne eigenen Bereich (`owns`) können
 * dieselben Dateien bearbeiten oder dieselbe Arbeit doppelt machen — je mehr
 * es sind, desto eher. Wie viele zugleich laufen, ist eine andere Frage und
 * steht über dem Balken.
 */
function swarmGrade(count: number, loose: number, isolation?: TeamIsolation): Grade {
  const where = isolationNote(isolation);
  if (count <= 1) return { title: 'keiner', tone: 'pos', cause: 'eine Rolle', text: 'Eine Rolle arbeitet allein; es gibt nichts zusammenzuführen.' };
  if (!loose) return { title: 'gering', tone: 'pos', cause: 'getrennte Bereiche', text: `Jede Rolle ändert nur ihren eigenen Bereich. ${where}` };
  const text = `${loose === count ? 'Keine Rolle hat einen' : loose === 1 ? 'Eine Rolle hat keinen' : `${loose} Rollen haben keinen`} eigenen Bereich: sie können dieselben Dateien bearbeiten oder doppelt arbeiten. ${where}`;
  if (count <= 3) return { title: 'gering', tone: 'pos', cause: 'wenige Rollen', text };
  if (count <= 5) return { title: 'gering', tone: 'warn', cause: 'Zusammenführung', text: `Die Teilergebnisse müssen zusammengeführt werden. ${where}` };
  return { title: count <= 8 ? 'spürbar' : 'hoch', tone: count <= 8 ? 'warn' : 'neg', cause: 'Überschneidung', text };
}

/**
 * Im Pool entscheidet nicht die Zahl, sondern ob sich die Einheiten in die
 * Quere kommen: jede braucht ihren eigenen Bereich (`owns`). Die Warteschlange
 * ist hier gewollt und kein Verlust.
 */
function poolGrade(plan: SwarmPlan): Grade {
  const loose = plan.units.filter((unit) => !unit.owns?.length).length;
  const wait = `${Math.min(plan.concurrency, plan.units.length)} laufen zugleich auf dem Konto dieses Chats, die übrigen rücken nach. Erreicht es sein Limit, übernimmt das nächste Konto.`;
  if (!loose) return { title: 'gering', tone: 'pos', cause: 'getrennte Bereiche',
    text: `Jede Einheit ändert nur ihren eigenen Bereich. ${wait}` };
  return { title: 'spürbar', tone: 'warn', cause: 'Bereiche fehlen',
    text: `${loose === plan.units.length ? 'Keine Einheit hat einen' : loose === 1 ? 'Eine Einheit hat keinen' : `${loose} Einheiten haben keinen`} eigenen Bereich: was sie ändern, prüft Cortex nicht gegen die anderen. ${wait}` };
}

/** So viele Einheiten zeigt die Pool-Karte, der Rest steht als Zahl darunter. */
const POOL_PREVIEW = 8;

const SWARM_STATUS: Record<TeamJobStatus, string> = {
  waiting: 'wartet', running: 'arbeitet', completed: 'fertig', failed: 'gescheitert', cancelled: 'gestoppt', blocked: 'blockiert',
};

/**
 * Der gestartete Schwarm im Chat: nur eine Zeile. Gearbeitet wird im
 * Hintergrund — die Rollen stehen in der Übersicht unter
 * „Hintergrundprozesse“, jede mit ihrem eigenen Chat in der Seitenleiste.
 */
function SwarmRun({ run, pool }: { run: TeamRun; pool: boolean }) {
  const jobs = list(run.jobs);
  const { running: active, open, done, failed, outside } = swarmTally(jobs);
  const running = run.status === 'running';
  // Ein Pool hat Hunderte Einheiten: die Zahl je Stand statt „x von y“.
  const many = pool || jobs.length > MAX_TEAM_AGENTS;
  // Die Zusammenführung in einem Satzteil: was übernommen ist und was hakt.
  const merge = mergeTally(jobs);
  const failedChecks = merge['checks-failed'];
  const where = (outside ? ` · ${outside} außerhalb ihres Bereichs` : '')
    + (merge.merged ? ` · ${merge.merged} übernommen` : '')
    + (merge.conflict ? ` · ${merge.conflict} ${merge.conflict === 1 ? 'Konflikt' : 'Konflikte'}` : '')
    + (failedChecks ? ` · ${failedChecks} ${failedChecks === 1 ? 'Prüfung' : 'Prüfungen'} gescheitert` : '');
  return (
    <Card label="Agenten-Schwarm">
      <Head mark="swarm" markTone={running ? TONE.violet : failed ? TONE.neg : TONE.pos}
        title={!running ? `Agenten-Schwarm ${failed ? 'beendet' : 'fertig'} · ${done} von ${jobs.length}`
          : many ? `Schwarm läuft · ${active} arbeiten · ${open} offen · ${done} fertig${failed ? ` · ${failed} gescheitert` : ''}`
          : `Agenten-Schwarm läuft · ${active} von ${jobs.length} arbeiten`}
        sub={running
          ? `${many ? '' : `${done} fertig · ${Math.max(0, jobs.length - done - active)} warten · `}im Hintergrund, siehe Übersicht${where}`
          : failed ? `${failed} ohne Ergebnis${where} · die Rollen-Chats stehen in der Seitenleiste` : `Die Ergebnisse stehen in den Rollen-Chats in der Seitenleiste${where}`}
        right={running ? <button type="button" class="cx-w-btn" onClick={() => vscode.postMessage({ kind: 'stopTeam', runId: run.id })}>
          <WIcon name="close" size={12} width={2} />Alle stoppen
        </button> : undefined} />
    </Card>
  );
}

export function AgentSwarm({ w, host }: { w: AgentSwarmW; host: WidgetHost }) {
  const plan = swarmPlan(w);
  const proposed = plan.units;
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

  // Im Pool zählt jede Einheit, ohne gespeicherte Agenten: eine Einheit nimmt
  // beim Start das nächste Konto mit freiem Platz.
  const post = (count: number, agentIds: string[]) => vscode.postMessage({
    kind: 'startSwarm', swarmId, task: draft.task.trim(), count, agentIds, proposed,
    ...(plan.pool ? { pool: { concurrency: plan.concurrency } } : {}),
    ...(plan.isolation ? { isolation: plan.isolation } : {}),
  });

  // Hat der Nutzer den Start schon verlangt, startet die Karte selbst — genau einmal.
  useEffect(() => {
    if (w.start !== true || !loaded || !teams || draft.started || run || !draft.task.trim() || (plan.pool && !proposed.length)) return;
    setDraft((before) => ({ ...before, started: true }));
    if (plan.pool) post(proposed.length, []);
    else post(Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.round(draft.count) || 1)), draft.agentIds);
  }, [loaded, !!teams, draft.started, !!run]);

  if (run && (run.status === 'running' || draft.started || w.start === true)) return <SwarmRun run={run} pool={plan.pool} />;
  if (w.start === true && !error && draft.task.trim() && !run) {
    return <Card label="Agenten-Schwarm"><Head mark="swarm" markTone={TONE.violet} title="Agenten-Schwarm startet …"
      sub={plan.pool ? `${proposed.length} Einheiten im Hintergrund · ${Math.min(plan.concurrency, proposed.length)} zugleich` : `${proposed.length || draft.count} Rollen im Hintergrund`} /></Card>;
  }
  if (plan.pool) {
    return <SwarmPool w={w} plan={plan} swarmId={swarmId} task={draft.task} error={error} last={run}
      ready={loaded && draft.task.trim().length > 0 && proposed.length > 0}
      setTask={(task) => setDraft((before) => ({ ...before, task }))}
      start={() => { setError(''); setDraft((before) => ({ ...before, started: true })); post(proposed.length, []); }} />;
  }

  const picked = draft.agentIds
    .map((id) => saved.find((team) => team.id === id))
    .filter((team): team is AgentTeam => !!team);
  const count = Math.min(MAX_TEAM_AGENTS, Math.max(1, picked.length, Math.round(draft.count) || 1));
  // Ein Bereich pro Rolle: gespeicherte Agenten bringen ihren mit, automatische den des Vorschlags.
  const loose = Array.from({ length: count }, (_, slot) => picked[slot]?.agents[0]?.owns ?? proposed[slot - picked.length]?.owns)
    .filter((owns) => !owns?.length).length;
  const grade = swarmGrade(count, loose, plan.isolation);
  const parallel = Math.min(count, MAX_PARALLEL);
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
    post(count, draft.agentIds);
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
          <span class="cx-w-label cx-w-grow">
            von {MAX_TEAM_AGENTS} · {parallel < count ? `${parallel} laufen gleichzeitig, ${count - parallel} warten` : count === 1 ? 'läuft sofort' : 'alle laufen gleichzeitig'}
          </span>
        </div>
        <div class="cx-w-segs cx-w-swarm-segs">
          {Array.from({ length: MAX_TEAM_AGENTS }, (_, i) => (
            <i key={i} class={i < count ? 'done' : 'next'}
              style={i < count && i >= parallel ? { background: TONE.warn } : undefined} />
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

      <Foot left={w.note ?? 'Automatisch besetzte Rollen arbeiten mit deiner Werkzeugfreigabe auf dem Konto dieses Chats, bei Claude und Grok ohne externe MCP-Server.'}
        right={run ? `Zuletzt: ${SWARM_STATUS[run.jobs.every((job) => job.status === 'completed') ? 'completed' : 'failed']}` : w.source} />
    </Card>
  );
}

/**
 * Der Schwarm als Pool: die Einheiten stehen fest (vom Modell aus dem Auftrag
 * geschnitten), einstellen lässt sich nur der Auftrag. Gezeigt werden die
 * ersten Einheiten mit ihren Bereichen, der Rest als Zahl.
 */
function SwarmPool({ w, plan, swarmId, task, ready, error, last, setTask, start }: {
  w: AgentSwarmW; plan: SwarmPlan; swarmId: string; task: string; ready: boolean; error: string; last?: TeamRun;
  setTask: (task: string) => void; start: () => void;
}) {
  const count = plan.units.length;
  const parallel = Math.min(plan.concurrency, count);
  const grade = poolGrade(plan);
  const rest = count - POOL_PREVIEW;
  return (
    <Card label="Agenten-Schwarm">
      <Head mark="swarm" markTone={TONE.violet} title="Agenten-Schwarm"
        sub={`${count} Einheiten · ${parallel} zugleich`}
        right={<button type="button" class="cx-w-btn primary" disabled={!ready} onClick={start}>
          <WIcon name="play" size={12} fill="currentColor" />Starten
        </button>} />

      <div class="cx-w-sep cx-w-swarm">
        <label class="cx-w-label" for={`${swarmId}-task`}>{task.trim() ? 'Auftrag für alle Einheiten' : 'Was sollen die Agenten machen?'}</label>
        <textarea class="cx-w-area" id={`${swarmId}-task`} rows={2} value={task}
          placeholder="Auftrag in einem Satz — er gilt für alle Einheiten."
          onInput={(event) => setTask(event.currentTarget.value)} />
      </div>

      <div class="cx-w-sep cx-w-swarm">
        <div class="cx-w-swarm-row">
          <WIcon name={plan.isolation === 'worktree' ? 'flow' : 'package'} size={15} />
          <span class="cx-w-label cx-w-grow">
            {plan.isolation === 'worktree' ? 'Jede Einheit in ihrem eigenen Git-Worktree' : 'Alle Einheiten im selben Ordner'}
          </span>
        </div>
        <div class="cx-w-box pad cx-w-swarm-grade">
          <div class="cx-w-swarm-verdict">
            <Dot color={TONE[grade.tone]} />
            <span>Qualitätsverlust: {grade.title}</span>
            <Pill tone={grade.tone}>{grade.cause}</Pill>
          </div>
          <span class="cx-w-dim cx-w-small">{grade.text}</span>
        </div>
        <div class="cx-w-rows cx-w-box">
          {plan.units.slice(0, POOL_PREVIEW).map((unit, index) => (
            <div class="cx-w-row cx-w-pool-unit" key={index}>
              <span class="cx-w-ava auto" />
              <span class="cx-w-pool-name">
                <span class="cx-w-v">{unit.name || `Einheit ${index + 1}`}</span>
                {unit.owns?.length ? <span class="cx-w-mono cx-w-dim cx-w-pool-owns" title={unit.owns.join('\n')}>{unit.owns.join(' · ')}</span> : null}
              </span>
              {unit.role && <span class="cx-w-dim cx-w-small cx-w-pool-role">{unit.role}</span>}
            </div>
          ))}
          {rest > 0 && <div class="cx-w-row cx-w-pool-more"><WIcon name="plus" size={13} /><span class="cx-w-dim">{rest} weitere</span></div>}
        </div>
      </div>

      {error && <div class="cx-w-sep cx-w-swarm"><span style={{ color: TONE.neg }}>{error}</span></div>}

      <Foot left={w.note ?? 'Jede Einheit nimmt das nächste Konto mit freiem Platz; scheitert sie, versucht Cortex sie auf einem anderen erneut.'}
        right={last ? `Zuletzt: ${SWARM_STATUS[last.jobs.every((job) => job.status === 'completed') ? 'completed' : 'failed']}` : w.source} />
    </Card>
  );
}
