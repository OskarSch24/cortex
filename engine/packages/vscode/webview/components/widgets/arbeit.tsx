/** Die zwanzig Arbeits-Widgets. Entwurf: docs/design/cortex-widgets (Seite „Arbeit“). */
import { useEffect, useState } from 'preact/hooks';
import {
  Actions, Card, Check, Dot, Foot, Head, Meter, Pill, Spark, Spinner, StateMark, TEXT, TONE, WIcon, fmt, list, str, toneOf,
  type WidgetHost,
} from './parts.js';
import { useWidgetState } from './state.js';
import { vscode } from '../../vscodeApi.js';
import {
  MAX_PARALLEL, MAX_PER_ACCOUNT, MAX_TEAM_AGENTS,
  type AgentTeam, type TeamJobStatus, type TeamRun, type TeamsState,
} from '../../../src/teams/types.js';
import { BRAND_COLOR, BrandMark } from '../brandIcons.js';
import {
  contrast, daysBetween, hours, wcagGrade, workflowColumns,
  type AgentRunW, type AgentSwarmW, type AudioTakesW, type DecisionW, type DeployW, type DesignDiffW, type GameTheoryW, type GraphNodeW,
  type JobsW, type KpisW, type PaletteW, type PlaceNamingW, type QueryResultW, type QuizW, type QuotaW, type ScrapeRunW,
  type ServerW, type TestResultW, type TimelineW, type Tone, type VerificationW, type WorkflowW,
} from './spec.js';


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
export function swarmGrade(count: number): { title: string; tone: Tone; cause: string; text: string } {
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

/** Profile und Läufe aus „Aktive Agenten“ — die Karte fragt sie selbst beim Host ab. */
function useTeamsState(): TeamsState | undefined {
  const [state, setState] = useState<TeamsState>();
  useEffect(() => {
    const receive = (event: MessageEvent<{ kind?: string; state?: TeamsState }>) => {
      if (event.data?.kind === 'teamsState' && event.data.state) setState(event.data.state);
    };
    window.addEventListener('message', receive);
    vscode.postMessage({ kind: 'getTeams' });
    return () => window.removeEventListener('message', receive);
  }, []);
  return state;
}

/** Der laufende Schwarm: eine Spur je Rolle, sonst nichts. */
function SwarmRun({ run }: { run: TeamRun }) {
  const jobs = list(run.jobs);
  const done = jobs.filter((job) => job.status === 'completed').length;
  const active = jobs.filter((job) => job.status === 'running').length;
  return (
    <Card label="Agenten-Schwarm">
      <Head mark="swarm" markTone={TONE.violet}
        title={`Agenten-Schwarm · ${jobs.length} ${jobs.length === 1 ? 'Rolle' : 'Rollen'}`}
        sub={`${done} fertig · ${active} ${active === 1 ? 'arbeitet' : 'arbeiten'} · ${Math.max(0, jobs.length - done - active)} wartet`}
        right={<button type="button" class="cx-w-btn" onClick={() => vscode.postMessage({ kind: 'stopTeam', runId: run.id })}>
          <WIcon name="close" size={12} width={2} />Alle stoppen
        </button>} />
      <div class="cx-w-segs">
        {jobs.map((job, i) => <i key={i} class={SWARM_STATE[job.status]} />)}
      </div>
      <div class="cx-w-rows sep pad4">
        {jobs.map((job, i) => (
          <div class="cx-w-row" key={i}>
            <StateMark state={SWARM_STATE[job.status]} />
            <span class={`cx-w-grow ${job.status === 'running' ? 'cx-w-v' : job.status === 'waiting' ? 'cx-w-dim' : ''}`}>{job.agentName}</span>
            <span class="cx-w-dim cx-w-small">{job.activity ?? job.error ?? SWARM_STATUS[job.status]}</span>
          </div>
        ))}
      </div>
      <Foot left={run.task} />
    </Card>
  );
}

export function AgentSwarm({ w, host }: { w: AgentSwarmW; host: WidgetHost }) {
  const proposed = list(w.agents);
  const [draft, setDraft, loaded] = useWidgetState(host, () => ({
    task: str(w.task),
    count: Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.round(Number(w.count) || proposed.length || 4))),
    agentIds: [] as string[],
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
  const run = teams?.runs.find((item) => item.teamId === swarmId);
  if (run?.status === 'running') return <SwarmRun run={run} />;

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

      <Foot left={w.note ?? `Automatisch besetzte Rollen arbeiten nur lesend — nur so laufen sie nebeneinander.`}
        right={run ? `Zuletzt: ${SWARM_STATUS[run.jobs.every((job) => job.status === 'completed') ? 'completed' : 'failed']}` : w.source} />
    </Card>
  );
}

/* ── Test-Ergebnis ──────────────────────────────────────────────────────── */

export function TestResult({ w, host }: { w: TestResultW; host: WidgetHost }) {
  const groups = list(w.groups);
  const passed = groups.reduce((n, g) => n + (Number(g.passed) || 0), 0);
  const total = groups.reduce((n, g) => n + (Number(g.total) || 0), 0);
  const failing = Math.max(0, total - passed);
  const failures = list(w.failures);
  const cells = [...groups.map((g) => ({ label: g.label, main: g.passed, rest: `/ ${g.total}` })), ...(w.duration ? [{ label: 'Dauer', main: w.duration, rest: '' }] : [])];
  return (
    <Card label={`Tests ${w.title}`}>
      <Head mark="terminal" title={w.title} sub={w.command ? <span class="cx-w-mono">{w.command}</span> : undefined} right={
        failing ? <Pill tone="neg">{failing} fehlgeschlagen</Pill> : <Pill tone="pos">Alle bestanden</Pill>
      } />
      <div class="cx-w-cells sep" style={{ gridTemplateColumns: `repeat(${Math.min(4, cells.length)}, minmax(0, 1fr))` }}>
        {cells.map((c, i) => <div class="cx-w-stat" key={i}><span class="cx-w-label">{c.label}</span><b class="cx-w-num">{c.main} <span>{c.rest}</span></b></div>)}
      </div>
      {total > 0 && (
        <div class="cx-w-ratio">
          <i style={{ flex: passed, background: TONE.pos }} />
          {failing > 0 && <i style={{ flex: Math.max(failing, total / 80), background: TONE.neg }} />}
        </div>
      )}
      {failures.length > 0 && (
        <div class="cx-w-sep cx-w-failures">
          {failures.slice(0, 4).map((f, i) => (
            <div key={i} class="cx-w-failure">
              <div class="cx-w-row"><StateMark state="failed" /><span class="cx-w-grow"><span class="cx-w-v">{f.name}</span>{f.file && <span class="cx-w-dim"> · {f.file}</span>}</span></div>
              {f.detail && (
                <pre class="cx-w-code">{str(f.detail).split('\n').slice(0, 12).map((line, j) => (
                  <span key={j} class={/^\s*-\s/.test(line) ? 'del' : /^\s*\+\s/.test(line) ? 'add' : ''}>{line}{'\n'}</span>
                ))}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Kontingente ────────────────────────────────────────────────────────── */

export function Quota({ w, host }: { w: QuotaW; host: WidgetHost }) {
  return (
    <Card label="Kontingente">
      <Head mark="gauge" title="Kontingente" sub={`${list(w.accounts).length} Konten`} />
      <div class="cx-w-rows sep">
        {list(w.accounts).map((a, i) => {
          const provider = str(a.provider).toLowerCase();
          const branded = provider in BRAND_COLOR;
          const known = typeof a.percent === 'number' && Number.isFinite(a.percent);
          const pct = known ? Math.max(0, Math.min(100, a.percent as number)) : 0;
          const color = pct >= 90 ? TONE.neg : pct >= 75 ? TONE.warn : TEXT;
          return (
            <div class="cx-w-row quota" key={i}>
              <span class="cx-w-tile sq">{branded ? <BrandMark provider={provider} size={16} /> : str(a.provider).slice(0, 1).toUpperCase()}</span>
              <span class="cx-w-grow cx-w-stack">
                <span class="cx-w-v cx-w-row-inline">{a.name}{a.bound && <Pill tone="info">An diese Aufgabe gebunden</Pill>}</span>
                {a.plan && <span class="cx-w-label">{a.plan}</span>}
              </span>
              {known ? <Meter percent={pct} color={color} width={200} /> : <span class="cx-w-meter unknown" style={{ width: 200 }} />}
              <span class="cx-w-quota-val">
                {known ? <><span class="cx-w-num" style={{ color }}>{Math.round(pct)} %</span>{a.reset && <span class="cx-w-label cx-w-num">Reset {a.reset}</span>}</> : <span class="cx-w-dim cx-w-small">Kein verlässlicher Wert</span>}
              </span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Server ─────────────────────────────────────────────────────────────── */

export function Server({ w, host }: { w: ServerW; host: WidgetHost }) {
  const containers = list(w.containers);
  // Ein Container mit Warnung und die Meldung dazu sind ein Problem, nicht zwei —
  // eine Meldung, die keinen kranken Container nennt (etwa Swap), ist ein eigenes.
  const sick = containers.filter((c) => c.state !== 'ok');
  const loose = list(w.alerts).filter((a) => (a.tone === 'warn' || a.tone === 'neg') && !sick.some((c) => str(a.text).includes(c.name)));
  const warn = sick.length + loose.length;
  const longest = Math.max(0, ...containers.map((c) => str(c.name).length));
  const columns = longest <= 12 ? 4 : longest <= 20 ? 3 : 2;
  const metrics = list(w.metrics).slice(0, 4);
  const down = containers.some((c) => c.state === 'down');
  return (
    <Card label={`Server ${w.name}`}>
      <Head mark="server" title={w.name} sub={w.subtitle ? <><Dot color={down ? TONE.neg : TONE.pos} />{w.subtitle}</> : undefined} right={
        warn ? <Pill tone={down || loose.some((a) => a.tone === 'neg') ? 'neg' : 'warn'}>{warn} {warn === 1 ? 'Warnung' : 'Warnungen'}</Pill> : <Pill tone="pos">Alles in Ordnung</Pill>
      } />
      {metrics.length > 0 && (
        <div class="cx-w-cells sep" style={{ gridTemplateColumns: `repeat(${metrics.length}, minmax(0, 1fr))` }}>
          {metrics.map((m, i) => (
            <div class="cx-w-stat" key={i}>
              <span class="cx-w-label">{m.label}</span>
              <span class="cx-w-row-inline between">
                <b class="cx-w-num">{fmt(m.value)}{m.unit && <span> {m.unit}</span>}</b>
                {list(m.series).length > 1 && <Spark values={m.series!} width={96} height={30} color={TEXT} stroke={1.3} />}
              </span>
              {typeof m.percent === 'number' && <Meter percent={m.percent} color={m.percent >= 90 ? TONE.neg : m.percent >= 75 ? TONE.warn : undefined} />}
            </div>
          ))}
        </div>
      )}
      {containers.length > 0 && (
        <div class="cx-w-sep cx-w-containers" style={{ '--cx-w-cols': columns } as preact.JSX.CSSProperties}>
          {containers.map((c, i) => (
            <span class={`cx-w-container ${c.state}`} key={i} title={c.note ? `${c.name}: ${c.note}` : c.name}>
              <Dot color={c.state === 'ok' ? TONE.pos : c.state === 'warn' ? TONE.warn : TONE.neg} />
              <span class="cx-w-mono cx-w-grow cx-w-ellipsis">{c.name}</span>
              {c.note && <span class="cx-w-num note">{c.note}</span>}
            </span>
          ))}
        </div>
      )}
      {list(w.alerts).length > 0 && (
        <div class="cx-w-rows sep">
          {list(w.alerts).map((a, i) => (
            <div class="cx-w-row tall" key={i}><WIcon name={a.tone === 'pos' ? 'shield' : 'alert'} size={16} color={TONE[toneOf(a.tone, 'warn')]} /><span class="cx-w-grow">{a.text}</span></div>
          ))}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Deploy ─────────────────────────────────────────────────────────────── */

export function Deploy({ w, host }: { w: DeployW; host: WidgetHost }) {
  const steps = list(w.steps);
  const running = steps.some((s) => s.state === 'now');
  const failed = steps.some((s) => s.state === 'failed');
  const lastDone = steps.reduce((n, s, i) => (s.state === 'done' ? i : n), -1);
  const pct = (i: number) => ((i + 0.5) / steps.length) * 100;
  return (
    <Card label={`Deploy ${w.title}`}>
      <Head mark="upload" title={w.title} sub={w.ref || w.message ? <>{w.ref && <span class="cx-w-mono">{w.ref}</span>}{w.ref && w.message ? ' · ' : ''}{w.message}</> : undefined} right={
        <Pill tone={failed ? 'neg' : running ? 'info' : 'pos'}>{running && <Spinner size={12} />}{w.elapsed ? <span class="cx-w-num">{w.elapsed}</span> : failed ? 'Fehlgeschlagen' : running ? 'Läuft' : 'Fertig'}</Pill>
      } />
      <div class="cx-w-sep cx-w-stepper" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {lastDone > 0 && <i class="cx-w-stepper-line" style={{ left: `${pct(0)}%`, width: `${pct(lastDone) - pct(0)}%` }} />}
        {lastDone >= 0 && lastDone < steps.length - 1 && <i class="cx-w-stepper-line dashed" style={{ left: `${pct(lastDone)}%`, width: `${pct(steps.length - 1) - pct(lastDone)}%` }} />}
        {steps.map((s, i) => (
          <div class="cx-w-stepper-step" key={i}>
            <span class={`cx-w-stepper-mark ${s.state}`}><StateMark state={s.state} size={s.state === 'now' ? 16 : 24} /></span>
            <span class={s.state === 'next' ? 'cx-w-dim' : 'cx-w-v'}>{s.label}</span>
            {s.duration && <span class="cx-w-label cx-w-num">{s.duration}</span>}
          </div>
        ))}
      </div>
      {w.log && <pre class="cx-w-code inset">{str(w.log).split('\n').slice(-6).join('\n')}</pre>}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Verifikation ───────────────────────────────────────────────────────── */

export function Verification({ w, host }: { w: VerificationW; host: WidgetHost }) {
  const rows = list(w.rows);
  const off = rows.filter((r) => r.state !== 'ok').length;
  return (
    <Card label={`Verifikation ${w.title}`}>
      <Head mark="shield" title={w.title} sub={w.subtitle} right={off ? <Pill tone={rows.some((r) => r.state === 'fail') ? 'neg' : 'warn'}>{off} {off === 1 ? 'Abweichung' : 'Abweichungen'}</Pill> : <Pill tone="pos">Überall bestätigt</Pill>} />
      <div class="cx-w-sep cx-w-table-wrap">
        <table class="cx-w-table">
          <thead><tr><th class="mark" /><th>Plattform</th><th>Beleg</th><th class="r">Erwartet</th><th class="r">Gefunden</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td class="mark"><StateMark state={r.state} /></td>
                <td class="v">{r.platform}</td>
                <td>{r.evidence}</td>
                <td class="r cx-w-num">{fmt(r.expected)}</td>
                <td class={`r cx-w-num ${r.state === 'ok' ? 'v' : r.state}`}>{fmt(r.found)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {w.finding && (
        <div class={`cx-w-callout ${toneOf(w.finding.tone, 'warn')}`}>
          <WIcon name="alert" size={16} color={TONE[toneOf(w.finding.tone, 'warn')]} />
          <span><span class="cx-w-v">{w.finding.title}</span> <span class="cx-w-muted">{w.finding.text}</span></span>
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Scrape-Lauf ────────────────────────────────────────────────────────── */

export function ScrapeRun({ w, host }: { w: ScrapeRunW; host: WidgetHost }) {
  const pct = w.total > 0 ? Math.min(100, (w.done / w.total) * 100) : 0;
  const stats = list(w.stats).slice(0, 4);
  return (
    <Card label={`Scrape-Lauf ${w.title}`}>
      <Head mark="download" title={w.title} sub={w.subtitle} right={pct >= 100 ? <Pill tone="pos">Fertig</Pill> : <Pill tone="info"><Spinner size={12} />{Math.round(pct)} %</Pill>} />
      <div class="cx-w-sep cx-w-progress">
        <div class="cx-w-row-inline between baseline">
          <span class="cx-w-num cx-w-big">{w.done.toLocaleString('de-DE')} <span class="cx-w-dim">/ {w.total.toLocaleString('de-DE')} {w.unit ?? ''}</span></span>
          {w.eta && <span class="cx-w-muted cx-w-small">{w.eta}</span>}
        </div>
        <Meter percent={pct} />
      </div>
      {stats.length > 0 && (
        <div class="cx-w-cells sep" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s, i) => <div class="cx-w-stat" key={i}><span class="cx-w-label">{s.label}</span><b class="cx-w-num" style={s.tone ? { color: TONE[toneOf(s.tone)] } : undefined}>{fmt(s.value)}</b></div>)}
        </div>
      )}
      {list(w.sample).length > 0 && (
        <div class="cx-w-sep">
          <div class="cx-w-label cx-w-sub">Zuletzt geholt</div>
          <div class="cx-w-rows">
            {list(w.sample).slice(0, 5).map((r, i) => (
              <div class="cx-w-row" key={i}><span class="cx-w-mono cx-w-v cx-w-sample-key">{r.key}</span><span class="cx-w-grow cx-w-ellipsis">{r.label}</span><span class="cx-w-num cx-w-v">{fmt(r.value)}</span></div>
            ))}
          </div>
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.dataset ? <span class="cx-w-mono">{w.dataset}</span> : w.source} right={w.dataset ? w.source : undefined} />
    </Card>
  );
}

/* ── Workflow ───────────────────────────────────────────────────────────── */

export function Workflow({ w, host }: { w: WorkflowW; host: WidgetHost }) {
  const nodes = list(w.nodes).slice(0, 12);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = list(w.edges).filter((e) => Array.isArray(e) && ids.has(e[0]) && ids.has(e[1]));
  const cols = workflowColumns(nodes, edges);
  const byCol = new Map<number, typeof nodes>();
  for (const n of nodes) byCol.set(cols.get(n.id) ?? 0, [...(byCol.get(cols.get(n.id) ?? 0) ?? []), n]);
  const colCount = Math.max(1, ...[...byCol.keys()].map((c) => c + 1));
  const rows = Math.max(1, ...[...byCol.values()].map((v) => v.length));
  const W = 706;
  const nw = Math.min(170, (W - (colCount - 1) * 12) / colCount);
  const nh = 50;
  const gapY = 18;
  const H = rows * nh + (rows - 1) * gapY + 16;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [c, list_] of byCol) {
    const x = colCount === 1 ? 0 : (c * (W - nw)) / (colCount - 1);
    const total = list_.length * nh + (list_.length - 1) * gapY;
    list_.forEach((n, i) => pos.set(n.id, { x, y: (H - total) / 2 + i * (nh + gapY) }));
  }
  const stroke = (state: string) => (state === 'done' ? TEXT : state === 'now' ? TONE.info : state === 'retry' ? TONE.warn : state === 'failed' ? TONE.neg : '#ffffff');
  const running = nodes.findIndex((n) => n.state === 'now');
  return (
    <Card label={`Workflow ${w.title}`}>
      <Head mark="flow" title={w.title} sub={w.subtitle} right={running >= 0 ? <Pill tone="info">Schritt {running + 1} von {nodes.length}</Pill> : nodes.some((n) => n.state === 'failed') ? <Pill tone="neg">Fehlgeschlagen</Pill> : undefined} />
      <div class="cx-w-sep cx-w-flow">
        <svg width="100%" viewBox={`-4 0 ${W + 8} ${H}`} role="img" aria-label={nodes.map((n) => `${n.label}: ${n.state}`).join(', ')}>
          {edges.map(([a, b], i) => {
            const pa = pos.get(a)!;
            const pb = pos.get(b)!;
            const target = nodes.find((n) => n.id === b)!;
            const sameCol = Math.abs(pa.x - pb.x) < 1;
            const d = sameCol
              ? `M${pa.x + nw / 2} ${pa.y + nh} C${pa.x + nw / 2} ${pa.y + nh + 14} ${pb.x + nw / 2} ${pb.y - 14} ${pb.x + nw / 2} ${pb.y}`
              : `M${pa.x + nw} ${pa.y + nh / 2} C${(pa.x + nw + pb.x) / 2} ${pa.y + nh / 2} ${(pa.x + nw + pb.x) / 2} ${pb.y + nh / 2} ${pb.x} ${pb.y + nh / 2}`;
            const s = target.state;
            return <path key={i} d={d} fill="none" stroke={stroke(s)} stroke-opacity={s === 'next' ? 0.14 : s === 'done' ? 0.5 : 0.8} stroke-width="1.5" stroke-dasharray={s === 'now' ? '4 4' : s === 'retry' ? '2 3' : undefined} />;
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const dot = n.state === 'done' ? TONE.pos : n.state === 'now' ? TONE.info : n.state === 'retry' ? TONE.warn : n.state === 'failed' ? TONE.neg : '#707277';
            return (
              <g key={n.id}>
                {n.state === 'now' && <rect x={p.x - 4} y={p.y - 4} width={nw + 8} height={nh + 8} rx="12" fill={TONE.info} fill-opacity=".1" />}
                <rect x={p.x} y={p.y} width={nw} height={nh} rx="9" fill="#1b1c1f" stroke={n.state === 'next' ? '#ffffff14' : n.state === 'done' ? '#ffffff24' : dot} stroke-opacity={n.state === 'retry' ? 0.4 : 1} stroke-width={n.state === 'now' ? 1.5 : 1} />
                <circle cx={p.x + 14} cy={p.y + 18} r="3" fill={dot} />
                <text x={p.x + 24} y={p.y + 22} fill={n.state === 'next' ? '#707277' : TEXT} font-size="12">{clip(n.label, nw - 30, 12)}</text>
                {n.detail && <text x={p.x + 24} y={p.y + 38} fill="#707277" font-size="11">{clip(n.detail, nw - 30, 11)}</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={<span class="cx-w-legend"><span><Dot color={TONE.pos} />fertig</span><span><Dot color={TONE.info} />läuft</span><span><Dot color={TONE.warn} />Wiederholung</span></span>} />
    </Card>
  );
}

/** Kürzt Text, der in einem SVG-Kasten keinen Umbruch bekommt. */
function clip(text: string, width: number, size: number): string {
  const max = Math.max(4, Math.floor(width / (size * 0.5)));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/* ── Abfrage ────────────────────────────────────────────────────────────── */

/**
 * Bezeichner für Menschen: `social_kanaele` → `social_kanäle`. Nur Schreibweise,
 * kein Umbenennen — `ae/oe/ue` wird Umlaut, außer wo es keiner ist (`aktuell`,
 * `neue`, `Queue`, `Israel`).
 */
export function umlaute(text: string): string {
  return text
    .replace(/(?<![aeiouq])ue(?!ll|nt|rt)/gi, (m) => (m[0] === 'U' ? 'Ü' : 'ü'))
    .replace(/(?<![aeiou])ae(?!l\b)/gi, (m) => (m[0] === 'A' ? 'Ä' : 'ä'))
    .replace(/(?<![aeiou])oe(?!t)/gi, (m) => (m[0] === 'O' ? 'Ö' : 'ö'));
}

const isIdent = (v: string) => /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(v);
const shown = (v: string) => (isIdent(v) ? umlaute(v) : v);

/** Eine Zelle, die eine Aufzählung ist (`a, b, c, d`), wird zu Marken — die ersten, dann „+n“. */
function ListCell({ items }: { items: string[] }) {
  const [all, setAll] = useState(false);
  const cut = all ? items : items.slice(0, 5);
  return (
    <div class="cx-w-chips">
      {cut.map((t, i) => <span key={i} class="cx-w-chip">{shown(t)}</span>)}
      {items.length > cut.length && <button type="button" class="cx-w-chip more" onClick={() => setAll(true)}>+{items.length - cut.length}</button>}
    </div>
  );
}

export function QueryResult({ w, host }: { w: QueryResultW; host: WidgetHost }) {
  const cols = list(w.columns);
  const rows = list(w.rows).filter(Array.isArray);
  const [filter, setFilter] = useState<string | undefined>();
  const [showQuery, setShowQuery] = useState(false);
  const numeric = cols.map((_, c) => rows.length > 0 && rows.every((r) => r[c] === null || r[c] === undefined || typeof r[c] === 'number' || /^[\d.,:\s%€$-]+$/.test(String(r[c]))));
  const listish = cols.map((_, c) => rows.filter((r) => typeof r[c] === 'string' && String(r[c]).split(',').length >= 4).length >= Math.max(1, rows.length / 2));
  // Gruppen aus dem ersten Wort der ersten Spalte (`social_…`, `suche…`) — nur wenn es wirklich mehrere gibt.
  const group = (r: (string | number | null)[]) => String(r[0] ?? '').split(/[_\s.]/)[0]!.toLowerCase();
  const groups = [...new Set(rows.map(group))].filter(Boolean);
  const grouped = groups.length >= 2 && groups.length <= 6 && groups.length < rows.length;
  const visible = grouped && filter ? rows.filter((r) => group(r) === filter) : rows;
  const cap = (g: string) => umlaute(g.charAt(0).toUpperCase() + g.slice(1));
  return (
    <Card label={`Abfrage ${w.title ?? ''}`}>
      <Head mark="database" title={w.title ?? 'Abfrage'} sub={w.subtitle ?? `${rows.length} ${rows.length === 1 ? 'Zeile' : 'Zeilen'}`} />
      {grouped && (
        <div class="cx-w-filters" role="tablist">
          <button type="button" role="tab" aria-selected={!filter} class={!filter ? 'on' : ''} onClick={() => setFilter(undefined)}>Alle {rows.length}</button>
          {groups.map((g) => <button type="button" role="tab" key={g} aria-selected={filter === g} class={filter === g ? 'on' : ''} onClick={() => setFilter(filter === g ? undefined : g)}>{cap(g)} {rows.filter((r) => group(r) === g).length}</button>)}
        </div>
      )}
      <div class="cx-w-sep cx-w-table-wrap soft">
        <table class="cx-w-table soft">
          <thead><tr>{cols.map((c, i) => <th key={i} class={numeric[i] ? 'r' : ''}>{c}</th>)}</tr></thead>
          <tbody>
            {visible.slice(0, 50).map((r, i) => (
              <tr key={i}>{cols.map((_, c) => {
                const v = r[c];
                const text = v === null || v === undefined ? undefined : String(v);
                return <td key={c} class={`${numeric[c] ? 'r cx-w-num' : ''} ${c === 0 ? 'v' : ''} ${listish[c] ? 'list' : ''}`}>
                  {text === undefined || text === '—' ? <span class="cx-w-dim">—</span> : listish[c] && text.includes(',') ? <ListCell items={text.split(',').map((t) => t.trim()).filter(Boolean)} /> : shown(text)}
                </td>;
              })}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {w.query && showQuery && <pre class="cx-w-code inset wrap">{w.query}</pre>}
      <Actions actions={w.actions} host={host} />
      <Foot
        left={w.source}
        right={<>{visible.length > 50 ? `50 von ${visible.length} Zeilen · ` : ''}{w.query && <button type="button" class="cx-w-linkbtn" onClick={() => setShowQuery((v) => !v)}>{showQuery ? 'Abfrage ausblenden' : 'Abfrage anzeigen'}</button>}</>}
      />
    </Card>
  );
}

/* ── Graph-Knoten ───────────────────────────────────────────────────────── */

export function GraphNode({ w, host }: { w: GraphNodeW; host: WidgetHost }) {
  const nbrs = list(w.neighbors).slice(0, 6);
  const cx = 150;
  const cy = 104;
  const initials = str(w.name).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const Facts = ({ items, tone }: { items: string[]; tone: string }) => (
    <div class="cx-w-facts-list">{items.map((t, i) => <span key={i}><Dot color={tone} /><span>{t}</span></span>)}</div>
  );
  return (
    <Card label={`Knoten ${w.name}`}>
      <Head mark={<span class="cx-w-initials">{initials}</span>} markTone={TONE.info} title={w.name} sub={`${w.kind}${nbrs.length ? ` · ${list(w.neighbors).length} Verbindungen` : ''}`} />
      <div class="cx-w-sep cx-w-node">
        {nbrs.length > 0 && (
          <svg class="cx-w-ego" width="300" height="210" viewBox="0 0 300 210" aria-hidden="true">
            {nbrs.map((_, i) => {
              const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / nbrs.length;
              return <path key={`e${i}`} d={`M${cx} ${cy}L${cx + 100 * Math.cos(a)} ${cy + 76 * Math.sin(a)}`} stroke="#ffffff26" />;
            })}
            {nbrs.map((n, i) => {
              const a = -Math.PI / 2 + ((i + 0.5) * 2 * Math.PI) / nbrs.length;
              const x = cx + 100 * Math.cos(a);
              const y = cy + 76 * Math.sin(a);
              return (
                <g key={`n${i}`}>
                  <circle cx={x} cy={y} r="6" fill="#101113" stroke={/person/i.test(n.kind ?? '') ? TONE.violet : '#999a9d'} stroke-width="1.5" />
                  <text x={Math.max(40, Math.min(260, x))} y={y < cy ? y - 12 : y + 20} text-anchor="middle" fill="#c9cacd" font-size="11">{clip(n.label, 130, 11)}</text>
                </g>
              );
            })}
            <circle cx={cx} cy={cy} r="20" fill={TONE.info} fill-opacity=".12" />
            <circle cx={cx} cy={cy} r="9" fill={TONE.info} />
          </svg>
        )}
        <div class="cx-w-grow cx-w-stack gap14">
          <div>
            <div class="cx-w-row-inline"><b class="cx-w-small-h">Belegt</b>{w.confirmedSource && <span class="cx-w-label">{w.confirmedSource}</span>}</div>
            {list(w.confirmed).length ? <Facts items={list(w.confirmed)} tone={TONE.pos} /> : <div class="cx-w-dim cx-w-small">Nichts belegt</div>}
          </div>
          <div>
            <div class="cx-w-row-inline"><b class="cx-w-small-h">Beobachtet</b>{w.observedSource && <span class="cx-w-label">{w.observedSource}</span>}</div>
            {list(w.observed).length ? <Facts items={list(w.observed)} tone="#707277" /> : <div class="cx-w-dim cx-w-small">Noch nichts beobachtet</div>}
          </div>
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.id ? <span class="cx-w-mono">{w.id}</span> : w.source} right={w.updated ? `Stand ${w.updated}` : undefined} />
    </Card>
  );
}

/* ── Entscheidung ───────────────────────────────────────────────────────── */

export function Decision({ w, host }: { w: DecisionW; host: WidgetHost }) {
  const today = new Date().toISOString().slice(0, 10);
  const span = daysBetween(w.decided, w.review);
  const left = daysBetween(today, w.review);
  const elapsed = Number.isFinite(span) && span > 0 ? Math.max(0, Math.min(1, (span - left) / span)) : 0;
  const fmt = (d: string) => {
    const t = Date.parse(`${d.slice(0, 10)}T12:00:00Z`);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : d;
  };
  const open = /offen|open/i.test(w.status);
  return (
    <Card label={`Entscheidung ${w.id}`}>
      <Head mark="scale" title={w.title} sub={<><span class="cx-w-mono">{w.id}</span>{w.project ? ` · ${w.project}` : ''}</>} right={<Pill tone={open ? 'warn' : 'pos'}>{w.status}</Pill>} />
      <div class="cx-w-sep cx-w-pad-top">
        <div class="cx-w-label">Entscheidung</div>
        <p class="cx-w-prose">{w.decision}</p>
      </div>
      {(list(w.rejected).length > 0 || w.wrongIf) && (
        <div class="cx-w-two">
          {list(w.rejected).length > 0 && (
            <div class="cx-w-box pad">
              <div class="cx-w-label">Verworfen</div>
              {list(w.rejected).map((r, i) => <span class="cx-w-row-inline cx-w-muted cx-w-rejected" key={i}><WIcon name="close" size={14} color="#707277" />{r}</span>)}
            </div>
          )}
          {w.wrongIf && <div class="cx-w-box pad"><div class="cx-w-label">Falsch, wenn …</div><div class="cx-w-muted cx-w-body">{w.wrongIf}</div></div>}
        </div>
      )}
      <div class="cx-w-review">
        <div class="cx-w-row-inline between">
          <span class="cx-w-label cx-w-num">Getroffen {fmt(w.decided)}</span>
          <span class="cx-w-small"><span class="cx-w-v">Überprüfung am {fmt(w.review)}</span>{Number.isFinite(left) && <span class="cx-w-dim cx-w-num"> · {left > 0 ? `in ${left} Tagen` : left === 0 ? 'heute' : `seit ${-left} Tagen fällig`}</span>}</span>
        </div>
        <span class="cx-w-review-track">
          <i class="fill" style={{ width: `${elapsed * 100}%`, background: left < 0 ? TONE.neg : TEXT }} />
          <i class="knob" style={{ left: `calc(${elapsed * 100}% - 5px)` }} />
          <i class="goal" />
        </span>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={typeof w.gaps === 'number' ? `${w.gaps} ${w.gaps === 1 ? 'Wissenslücke' : 'Wissenslücken'} notiert` : undefined} />
    </Card>
  );
}

/* ── Ort benennen ───────────────────────────────────────────────────────── */

export function PlaceNaming({ w, host }: { w: PlaceNamingW; host: WidgetHost }) {
  const [name, setName] = useState('');
  const pts = list(w.points).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const lat = pts.map((p) => p[0]);
  const lon = pts.map((p) => p[1]);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lat), Math.max(...lat), Math.min(...lon), Math.max(...lon)];
  const spanLat = maxLat - minLat || 0.001;
  const spanLon = maxLon - minLon || 0.001;
  const centre = pts.length ? [lat.reduce((a, b) => a + b, 0) / pts.length, lon.reduce((a, b) => a + b, 0) / pts.length] : undefined;
  const save = () => name.trim() && host.onPrompt?.(`Benenne die Ortsgruppe ${w.id} als „${name.trim()}“.`);
  return (
    <Card label={`Ort benennen ${w.id}`}>
      <Head mark="pin" title={`Ortsgruppe ${w.id}`} sub={<span class="cx-w-num">{w.count} Aufnahmen{w.span ? ` · ${w.span}` : ''}</span>} right={typeof w.remaining === 'number' ? <Pill>{w.remaining} unbenannt</Pill> : undefined} />
      <div class="cx-w-sep cx-w-place">
        {pts.length > 0 && (
          <svg class="cx-w-place-map" width="300" height="210" viewBox="0 0 300 210" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => <path key={`h${i}`} d={`M0 ${20 + i * 26}H300`} stroke="#ffffff08" />)}
            {Array.from({ length: 11 }, (_, i) => <path key={`v${i}`} d={`M${20 + i * 26} 0V210`} stroke="#ffffff08" />)}
            <circle cx="150" cy="104" r="58" fill={TONE.info} fill-opacity=".06" stroke={TONE.info} stroke-opacity=".35" stroke-dasharray="2 3" />
            {pts.slice(0, 400).map((p, i) => (
              <circle key={i} cx={150 + ((p[1] - (minLon + maxLon) / 2) / spanLon) * 100} cy={104 - ((p[0] - (minLat + maxLat) / 2) / spanLat) * 76} r="2.6" fill={TONE.info} fill-opacity=".85" />
            ))}
            {centre && <text x="12" y="198" fill="#707277" font-size="10.5">{centre[0]!.toFixed(2).replace('.', ',')}° N · {centre[1]!.toFixed(2).replace('.', ',')}° O</text>}
          </svg>
        )}
        {list(w.photos).length > 0 && (
          <div class="cx-w-photos">{list(w.photos).slice(0, 4).map((d, i) => <span key={i}><WIcon name="image" size={16} /><span class="cx-w-label cx-w-num">{d}</span></span>)}</div>
        )}
      </div>
      <div class="cx-w-place-form">
        {w.hint && <div class="cx-w-muted cx-w-small">{w.hint}</div>}
        <div class="cx-w-row-inline">
          <input class="cx-w-input" placeholder="Name für diesen Ort" aria-label="Name für diesen Ort" value={name} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button type="button" class="cx-w-btn primary" disabled={!name.trim()} onClick={save}>Übernehmen</button>
        </div>
        {list(w.suggestions).length > 0 && (
          <div class="cx-w-row-inline wrap"><span class="cx-w-label">Vorschläge</span>{list(w.suggestions).map((s) => <button type="button" key={s} class={`cx-w-chip ${name === s ? 'on' : ''}`} onClick={() => setName(s)}>{s}</button>)}</div>
        )}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source ?? 'Übernehmen legt den Auftrag ins Eingabefeld'} />
    </Card>
  );
}

/* ── Tageszeitleiste ────────────────────────────────────────────────────── */

export function Timeline({ w, host }: { w: TimelineW; host: WidgetHost }) {
  const lanes = list(w.lanes);
  const blocks = lanes.flatMap((l) => list(l.blocks));
  const t0 = Math.floor(w.startHour ?? Math.min(8, ...blocks.map((b) => hours(b.start)).filter(Number.isFinite)));
  const t1 = Math.ceil(w.endHour ?? Math.max(20, ...blocks.map((b) => hours(b.end)).filter(Number.isFinite)));
  const pct = (h: number) => ((Math.max(t0, Math.min(t1, h)) - t0) / (t1 - t0)) * 100;
  const color = (l: TimelineW['lanes'][number], i: number) => (l.tone ? TONE[toneOf(l.tone)] : i === 0 ? TEXT : [TONE.violet, TONE.info, TONE.pos, TONE.warn][(i - 1) % 4]!);
  const minutes = lanes.map((l) => list(l.blocks).reduce((n, b) => n + Math.max(0, hours(b.end) - hours(b.start)) * 60, 0));
  const sum = minutes.reduce((a, b) => a + b, 0);
  return (
    <Card label={`Zeitleiste ${w.title}`}>
      <Head mark="bars" title={w.title} sub={w.subtitle} />
      <div class="cx-w-sep cx-w-timeline">
        {sum > 0 && <div class="cx-w-stack-bar">{lanes.map((l, i) => minutes[i]! > 0 && <i key={i} style={{ flex: minutes[i], background: color(l, i) }} />)}</div>}
        <div class="cx-w-lanes">
          <div class="cx-w-lane-ticks">{Array.from({ length: Math.floor((t1 - t0) / 2) + 1 }, (_, k) => t0 + k * 2).map((h) => <i key={h} style={{ left: `${pct(h)}%` }} class={h % 4 === 0 ? 'strong' : ''} />)}</div>
          {lanes.map((l, i) => (
            <div class="cx-w-lane" key={i}>
              <span class="cx-w-lane-label"><Dot color={color(l, i)} /><span class="cx-w-v cx-w-grow cx-w-ellipsis">{l.label}</span>{l.total && <span class="cx-w-dim cx-w-num">{l.total}</span>}</span>
              <span class="cx-w-lane-track">
                {list(l.blocks).map((b, j) => {
                  const a = hours(b.start);
                  const z = hours(b.end);
                  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
                  const wide = z - a >= 2;
                  const c = color(l, i);
                  return (
                    <span key={j}>
                      <i class="cx-w-block" style={{ left: `${pct(a)}%`, width: `${pct(z) - pct(a)}%`, background: `${c}${c === TEXT ? '1c' : '24'}` }}>{wide && b.label && <span style={{ color: c }}>{b.label}</span>}</i>
                      {!wide && b.label && <span class="cx-w-block-label" style={{ left: `calc(${pct(z)}% + 8px)`, color: c }}>{b.label}</span>}
                    </span>
                  );
                })}
              </span>
            </div>
          ))}
          <div class="cx-w-lane-axis">{Array.from({ length: Math.floor((t1 - t0) / 4) + 1 }, (_, k) => t0 + k * 4).map((h) => <span key={h} class="cx-w-label cx-w-num" style={{ left: `${pct(h)}%` }}>{String(h).padStart(2, '0')}</span>)}</div>
        </div>
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Job-Treffer ────────────────────────────────────────────────────────── */

export function Jobs({ w, host }: { w: JobsW; host: WidgetHost }) {
  return (
    <Card label={`Stellen ${w.title}`}>
      <Head mark="briefcase" title={w.title} sub={w.subtitle} />
      <div class="cx-w-rows sep">
        {list(w.jobs).slice(0, 6).map((j, i) => {
          const s = Math.max(0, Math.min(100, Number(j.score) || 0));
          const c = s >= 85 ? TONE.pos : s >= 70 ? TONE.warn : '#999a9d';
          const r = 15;
          const circ = 2 * Math.PI * r;
          return (
            <div class="cx-w-row job" key={i}>
              <span class="cx-w-score">
                <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r={r} fill="none" stroke="#ffffff12" stroke-width="3" /><circle cx="20" cy="20" r={r} fill="none" stroke={c} stroke-width="3" stroke-linecap="round" stroke-dasharray={`${(circ * s) / 100} ${circ}`} transform="rotate(-90 20 20)" /></svg>
                <span class="cx-w-num">{Math.round(s)}</span>
              </span>
              <span class="cx-w-grow cx-w-stack">
                {j.url ? <button type="button" class="cx-w-link cx-w-job-title" onClick={() => host.onOpenUrl?.(j.url!)}>{j.title}</button> : <span class="cx-w-v cx-w-job-title">{j.title}</span>}
                <span class="cx-w-small">{[j.company, j.location].filter(Boolean).join(' · ')}</span>
                {list(j.tags).length > 0 && <span class="cx-w-row-inline wrap tags">{list(j.tags).map((t) => <Pill key={t}>{t}</Pill>)}</span>}
              </span>
              <span class="cx-w-stack end">{j.salary && <span class="cx-w-v cx-w-num">{j.salary}</span>}{j.source && <span class="cx-w-label">{j.source}</span>}</span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Design-Abgleich ────────────────────────────────────────────────────── */

export function DesignDiff({ w, host }: { w: DesignDiffW; host: WidgetHost }) {
  const diffs = list(w.diffs);
  const open = diffs.filter((d) => !d.fixed).length;
  const swatch = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? <i class="cx-w-swatch" style={{ background: c }} /> : null);
  return (
    <Card label={`Design-Abgleich ${w.title}`}>
      <Head mark="compare" title={w.title} sub={w.subtitle} right={open ? <Pill tone="warn">{open} von {diffs.length} offen</Pill> : <Pill tone="pos">Alles angeglichen</Pill>} />
      <div class="cx-w-rows sep">
        <div class="cx-w-row head"><span class="cx-w-diff-n" /><span class="cx-w-grow">Abweichung</span><span class="cx-w-diff-vals">Design → Code</span><span class="cx-w-diff-state" /></div>
        {diffs.map((d, i) => (
          <div class="cx-w-row tall" key={i}>
            <span class={`cx-w-diff-n ${d.fixed ? '' : 'open'}`}>{i + 1}</span>
            <span class={`cx-w-grow ${d.fixed ? '' : 'cx-w-v'}`}>{d.label}</span>
            <span class="cx-w-diff-vals cx-w-mono">{swatch(d.designColor)}<span class="cx-w-v">{d.design}</span><WIcon name="arrow" size={12} color="#707277" />{swatch(d.codeColor)}<span class="cx-w-v">{d.code}</span></span>
            <span class="cx-w-diff-state">{d.fixed ? <Pill tone="pos">Behoben</Pill> : <Pill tone="warn">Offen</Pill>}</span>
          </div>
        ))}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Farbpalette ────────────────────────────────────────────────────────── */

export function Palette({ w, host }: { w: PaletteW; host: WidgetHost }) {
  const bg = w.background && contrast(w.background, w.background) ? w.background : '#101113';
  const colors = list(w.colors).filter((c) => contrast(c.hex, bg) !== undefined);
  const weakest = colors.map((c) => ({ c, r: contrast(c.hex, bg)! })).filter((x) => x.r >= 1.5 && x.r < 4.5);
  return (
    <Card label={`Farbpalette ${w.title}`}>
      <Head mark="drop" title={w.title} sub={<>Kontrast gegen <span class="cx-w-mono">{bg.toUpperCase()}</span></>} />
      <div class="cx-w-sep cx-w-palette">
        {colors.map((c, i) => {
          const r = contrast(c.hex, bg)!;
          const surface = r < 1.5;
          const grade = wcagGrade(r);
          return (
            <div class="cx-w-swatch-cell" key={i}>
              <span class={`cx-w-swatch-big ${surface ? 'surface' : ''}`} style={{ background: c.hex }}>{!surface && <span style={{ color: bg }}>Aa</span>}</span>
              <span class="cx-w-mono cx-w-v cx-w-ellipsis">{c.name}</span>
              <span class="cx-w-mono cx-w-dim">{c.hex.toUpperCase()}</span>
              <span class="cx-w-row-inline">
                {surface ? <span class="cx-w-dim cx-w-small">—</span> : <span class="cx-w-num cx-w-small">{r.toFixed(1).replace('.', ',')} : 1</span>}
                <Pill tone={surface ? 'mute' : grade === 'AAA' || grade === 'AA' ? 'pos' : grade === 'AA groß' ? 'warn' : 'neg'}>{surface ? 'Fläche' : grade}</Pill>
              </span>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={weakest.length ? <span class="cx-w-row-inline"><WIcon name="alert" size={14} color={TONE.warn} /><span class="cx-w-muted">{weakest.map((x) => x.c.name).join(', ')} {weakest.length === 1 ? 'reicht' : 'reichen'} nur für große Schrift.</span></span> : w.source} right="WCAG 2.1" />
    </Card>
  );
}

/* ── Audio-Takes ────────────────────────────────────────────────────────── */

export function AudioTakes({ w, host }: { w: AudioTakesW; host: WidgetHost }) {
  const takes = list(w.takes);
  const [fav, setFav] = useState(() => takes.findIndex((t) => t.favorite));
  return (
    <Card label={`Audio ${w.title}`}>
      <Head mark="wave" title={w.title} sub={w.subtitle} />
      <div class="cx-w-rows sep">
        {takes.map((t, i) => {
          const peaks = list(t.peaks).filter((p) => typeof p === 'number');
          return (
            <div class="cx-w-row take" key={i}>
              <button type="button" class="cx-w-play" aria-label={`${t.label} öffnen`} disabled={!t.path} onClick={() => t.path && host.onOpenFile?.(t.path)}><WIcon name="play" size={14} /></button>
              <span class="cx-w-stack cx-w-take-name"><span class="cx-w-v">{t.label}</span>{t.note && <span class="cx-w-label">{t.note}</span>}</span>
              <span class="cx-w-grow cx-w-wave">
                {peaks.length > 1
                  ? peaks.slice(0, 96).map((p, j) => <i key={j} style={{ height: `${Math.max(12, Math.min(100, p * 100))}%` }} />)
                  : <i class="flat" />}
              </span>
              <span class="cx-w-num cx-w-dim cx-w-small">{t.duration}</span>
              <button type="button" class="cx-w-star" aria-label={`${t.label} markieren`} aria-pressed={fav === i} onClick={() => setFav(fav === i ? -1 : i)}>
                <WIcon name="star" size={16} color={fav === i ? TONE.warn : '#707277'} fill={fav === i ? TONE.warn : 'none'} />
              </button>
            </div>
          );
        })}
      </div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} right={fav >= 0 ? `Markiert: ${takes[fav]?.label}` : undefined} />
    </Card>
  );
}

/* ── Kennzahlen ─────────────────────────────────────────────────────────── */

export function Kpis({ w, host }: { w: KpisW; host: WidgetHost }) {
  const kpis = list(w.kpis).slice(0, 4);
  const funnel = list(w.funnel).filter((f) => typeof f.value === 'number' && f.value >= 0);
  const top = Math.max(1, ...funnel.map((f) => f.value));
  return (
    <Card label={`Kennzahlen ${w.title}`}>
      <Head mark="trend" title={w.title} sub={w.subtitle} />
      <div class="cx-w-cells sep" style={{ gridTemplateColumns: `repeat(${Math.max(1, kpis.length)}, minmax(0, 1fr))` }}>
        {kpis.map((k, i) => (
          <div class="cx-w-stat" key={i}>
            <span class="cx-w-label">{k.label}</span>
            <b class="cx-w-num">{fmt(k.value)}</b>
            {k.change !== undefined && k.change !== '' && <Pill tone={toneOf(k.tone, /^[-−]/.test(str(k.change)) ? 'neg' : /^\+/.test(str(k.change)) ? 'pos' : 'mute')}>{fmt(k.change)}</Pill>}
          </div>
        ))}
      </div>
      {funnel.length > 1 && (
        <div class="cx-w-sep cx-w-funnel">
          <div class="cx-w-row-inline between"><span class="cx-w-label">Trichter</span><span class="cx-w-label">Schritt-Quote</span></div>
          {funnel.map((f, i) => {
            const last = i === funnel.length - 1;
            const width = Math.max(3, (Math.log10(f.value + 1) / Math.log10(top + 1)) ** 3 * 100);
            const rate = i > 0 && funnel[i - 1]!.value > 0 ? (f.value / funnel[i - 1]!.value) * 100 : undefined;
            const c = last ? TONE.pos : TEXT;
            return (
              <div class="cx-w-funnel-row" key={i}>
                <span class={last ? 'cx-w-v' : 'cx-w-muted'}>{f.label}</span>
                <span class="cx-w-funnel-bar"><i style={{ width: `${width}%`, background: `${c}${last ? '33' : '1a'}` }} /><span class="cx-w-num" style={{ color: c }}>{f.value.toLocaleString('de-DE')}</span></span>
                <span class="cx-w-num cx-w-dim cx-w-small">{rate === undefined ? '' : `${rate.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`}</span>
              </div>
            );
          })}
        </div>
      )}
      <Actions actions={w.actions} host={host} />
      <Foot left={w.note ?? w.source} />
    </Card>
  );
}

/* ── Quiz ───────────────────────────────────────────────────────────────── */

export function Quiz({ w, host }: { w: QuizW; host: WidgetHost }) {
  const [picked, setPicked] = useState<number>();
  const options = list(w.options);
  const history = str(w.progress?.history).replace(/[^rw]/g, '');
  const answered = picked !== undefined;
  const right = picked === w.answer;
  const total = w.progress?.total ?? 0;
  const done = history.length + (answered ? 1 : 0);
  const correct = history.split('').filter((h) => h === 'r').length + (answered && right ? 1 : 0);
  return (
    <Card label={`Quiz ${w.topic}`}>
      <Head mark="cap" title={w.topic} sub={w.subtitle ?? (w.progress ? `Frage ${w.progress.current} von ${w.progress.total}` : undefined)} right={done > 0 ? <Pill tone={correct / done >= 0.6 ? 'pos' : 'warn'}><span class="cx-w-num">{correct} von {done} richtig</span></Pill> : undefined} />
      {total > 0 && (
        <div class="cx-w-segs">
          {Array.from({ length: Math.min(total, 40) }, (_, i) => {
            const h = i < history.length ? history[i] : i === history.length && answered ? (right ? 'r' : 'w') : '';
            return <i key={i} class={h === 'r' ? 'done' : h === 'w' ? 'failed' : 'next'} />;
          })}
        </div>
      )}
      <div class="cx-w-sep cx-w-quiz">
        <div class="cx-w-question">{w.question}</div>
        <div class="cx-w-options">
          {options.map((o, i) => {
            const state = !answered ? '' : i === w.answer ? 'right' : i === picked ? 'wrong' : 'rest';
            return (
              <button type="button" key={i} class={`cx-w-option ${state}`} disabled={answered} onClick={() => setPicked(i)}>
                <span class="key">{state === 'right' ? <WIcon name="check" size={13} color="#101113" width={2.6} /> : state === 'wrong' ? <WIcon name="close" size={12} color="#101113" width={2.6} /> : String.fromCharCode(65 + i)}</span>
                <span>{o}</span>
              </button>
            );
          })}
        </div>
        {answered && (
          <div class="cx-w-explain">
            <span class={right ? 'right' : 'wrong'}>{right ? 'Richtig.' : `Nicht ganz. Richtig ist ${String.fromCharCode(65 + w.answer)}.`}</span> {w.explanation && <span class="cx-w-muted">{w.explanation}</span>}
          </div>
        )}
      </div>
      <Actions actions={answered ? w.actions : undefined} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}

/* ── Spieltheorie ───────────────────────────────────────────────────────── */

export function GameTheory({ w, host }: { w: GameTheoryW; host: WidgetHost }) {
  const actors = list(w.actors).slice(0, 4);
  const spots = [[20, 30], [496, 30], [258, 150], [20, 150]] as const;
  const bw = 190;
  const bh = 58;
  const centre = (i: number) => [spots[i]![0] + bw / 2, spots[i]![1] + bh / 2] as const;
  const colorOf = (i: number) => (actors[i]?.tone ? TONE[toneOf(actors[i]!.tone)] : i === 0 ? TEXT : i === 1 ? TONE.info : TONE.warn);
  const rels = list(w.relations).filter((r) => r.from >= 0 && r.to >= 0 && r.from < actors.length && r.to < actors.length && r.from !== r.to);
  const pair = new Map<string, number>();
  const bal = w.balance ? Math.max(-1, Math.min(1, Number(w.balance.value) || 0)) : 0;
  return (
    <Card label={`Strategische Lage ${w.title}`}>
      <Head mark="people" title={w.title} sub={w.subtitle ?? `${actors.length} Beteiligte`} />
      <div class="cx-w-sep cx-w-game">
        <svg width="100%" viewBox={`0 0 706 ${actors.length > 2 ? 220 : 136}`} role="img" aria-label={actors.map((a) => `${a.name}: ${a.want}`).join('; ')}>
          <defs>
            <marker id="cx-w-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ffffff66" /></marker>
          </defs>
          {rels.map((r, i) => {
            const key = [Math.min(r.from, r.to), Math.max(r.from, r.to)].join('-');
            const n = pair.get(key) ?? 0;
            pair.set(key, n + 1);
            const [ax, ay] = centre(r.from);
            const [bx, by] = centre(r.to);
            const horizontal = Math.abs(ay - by) < 10;
            const bend = (n % 2 === 0 ? -1 : 1) * 16;
            const sx = horizontal ? (ax < bx ? ax + bw / 2 + 6 : ax - bw / 2 - 6) : ax;
            const sy = horizontal ? ay + bend : ay < by ? ay + bh / 2 + 4 : ay - bh / 2 - 4;
            const ex = horizontal ? (ax < bx ? bx - bw / 2 - 6 : bx + bw / 2 + 6) : bx + (ax < bx ? -bw / 4 : bw / 4);
            const ey = horizontal ? by + bend : ay < by ? by - bh / 2 - 6 : by + bh / 2 + 6;
            const mx = (sx + ex) / 2;
            const my = (sy + ey) / 2 + (horizontal ? bend * 1.2 : 0);
            return (
              <g key={i}>
                <path d={`M${sx} ${sy} Q${mx} ${my} ${ex} ${ey}`} fill="none" stroke={r.dashed ? TONE.warn : '#ffffff40'} stroke-opacity={r.dashed ? 0.7 : 1} stroke-width="1.5" stroke-dasharray={r.dashed ? '3 4' : undefined} marker-end="url(#cx-w-arrow)" />
                <text x={horizontal ? mx : mx + 14} y={my + (horizontal ? (bend < 0 ? -8 : 16) : 18)} text-anchor={horizontal ? 'middle' : 'start'} fill={r.dashed ? '#e3c285' : '#999a9d'} font-size="11.5">{clip(r.label, 220, 11.5)}</text>
              </g>
            );
          })}
          {actors.map((a, i) => {
            const [x, y] = spots[i]!;
            const c = colorOf(i);
            return (
              <g key={i}>
                <rect x={x} y={y} width={bw} height={bh} rx="10" fill="#1b1c1f" stroke={c} stroke-opacity={a.hidden === true ? 0.6 : 0.8} stroke-dasharray={a.hidden === true ? '4 4' : undefined} />
                <circle cx={x + 18} cy={y + 21} r="4" fill={c} />
                <text x={x + 30} y={y + 25} fill={TEXT} font-size="13" font-weight="500">{clip(a.name, bw - 40, 13)}</text>
                <text x={x + 14} y={y + 45} fill="#8f9094" font-size="11.5">{clip(a.want, bw - 24, 11.5)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {w.balance && (
        <div class="cx-w-balance">
          <div class="cx-w-row-inline between"><span class="cx-w-label">{w.balance.left}</span><span class="cx-w-label">{w.balance.right}</span></div>
          <span class="cx-w-balance-track">
            <i class="mid" />
            <i class="fill" style={{ left: bal >= 0 ? '50%' : `${50 + bal * 50}%`, width: `${Math.abs(bal) * 50}%` }} />
            <i class="knob" style={{ left: `calc(${50 + bal * 50}% - 6px)` }} />
          </span>
          {w.balance.note && <div class="cx-w-muted cx-w-small">{w.balance.note}</div>}
        </div>
      )}
      <div class="cx-w-advice"><WIcon name="spark" size={16} color={TEXT} /><span>{w.recommendation}</span></div>
      <Actions actions={w.actions} host={host} />
      <Foot left={w.source} />
    </Card>
  );
}
