/** Arbeits-Widgets für den Betrieb: Tests, Kontingente, Server, Deploy, Prüfung, Scraping, Workflow. */
import {
  Actions, Card, Dot, Foot, Head, Meter, Pill, Spark, Spinner, StateMark, TEXT, TONE, WIcon, fmt, list, str, toneOf,
  type WidgetHost,
} from '../parts.js';
import { BRAND_COLOR, BrandMark } from '../../brandIcons.js';
import {
  workflowColumns, type DeployW, type QuotaW, type ScrapeRunW, type ServerW, type TestResultW, type VerificationW,
  type WorkflowW,
} from '../spec.js';

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
export function clip(text: string, width: number, size: number): string {
  const max = Math.max(4, Math.floor(width / (size * 0.5)));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
