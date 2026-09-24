import { useState } from 'preact/hooks';
import type { TaskMetric } from '@cortex/core';
import type { AccountStatusDto } from '../../../src/panel/protocol.js';
import { AccountsView } from '../../components/AccountsView.js';
import { BrandMark, PROVIDER_NAME } from '../../components/brandIcons.js';
import { limitLabel } from '../../components/AccountLimits.js';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useHost } from '../../hooks/useHostMessage.js';
import { useNative } from '../store.js';
import { Button, Card, Empty, Link, Page, PlainTabs, Row, Section, Toggle } from '../ui.js';

/* ── Nutzung und Abrechnung ────────────────────────────────────────────────── */

export function NutzungPage({ ctx }: { ctx: SettingsContext }) {
  const [poll, setPoll] = useNative('cortex.pollUsage', true);
  const [tab, setTab] = useState<'verfuegbar' | 'verlauf'>('verlauf');
  const data = useHost<{ metrics?: TaskMetric[] }>('analytics', { kind: 'getAnalytics' }, {});
  const providers = [...new Set(ctx.accounts.map(a => a.provider))];
  const limited = ctx.accounts.filter(a => (a.usage ?? []).some(u => Number.isFinite(u.utilizationPct)));
  const events = (data.metrics ?? []).filter(m => m.status === 'failover' || m.status === 'error').slice(-12).reverse();
  const cooling = ctx.accounts.filter(a => a.resetAt && a.resetAt > Date.now());
  return <Page title="Nutzung und Abrechnung" subtitle={<>Um Abos, Zahlungsmethoden und Rechnungen zu verwalten, öffne das Konto<br />beim jeweiligen Anbieter. Cortex rechnet nichts ab — es nutzt deine eigenen Abos.</>}>
    <Section title="Dein Tarif">
      <Card>
        {providers.map(p => {
          const list = ctx.accounts.filter(a => a.provider === p);
          return <Row key={p} icon={<span class={`cxs-brand ${p}`}><BrandMark provider={p} size={16} /></span>} title={`${PROVIDER_NAME[p] ?? p}`} sub={list.length === 1 ? `1 Konto · ${list[0]!.label}` : `${list.length} Konten · ${list.map(a => a.label).join(', ')}`}>
            <Button onClick={() => ctx.go({ id: 'konto', sub: [] })}>Konten ansehen</Button>
          </Row>;
        })}
        {!providers.length && <Row title="Noch kein Abo verbunden" sub="Verbinde Claude, ChatGPT oder Grok, um sie in Cortex zu nutzen"><Button kind="primary" onClick={() => ctx.go({ id: 'konto', sub: [] })}>Abo verbinden</Button></Row>}
      </Card>
    </Section>
    <Section title="Kontingente" subtitle={<>Die Anbieter melden ihre Limits selbst. Werte ohne Meldung erfindet Cortex nicht. <Link onClick={() => vscode.postMessage({ kind: 'refreshUsage' })}>Jetzt aktualisieren</Link></>}>
      <Card>
        <Row title="Nutzungskontingente regelmäßig aktualisieren" sub="Fragt die Limits im Hintergrund ab, damit diese Seite aktuell bleibt"><Toggle label="Kontingente aktualisieren" on={poll} onChange={setPoll} /></Row>
      </Card>
    </Section>
    {limited.map(account => <Section key={account.id} title={`${PROVIDER_NAME[account.provider] ?? account.provider} · ${account.label} Nutzungsgrenzen`}>
      <Card>
        {(account.usage ?? []).filter(u => Number.isFinite(u.utilizationPct)).map((u, i) => {
          const left = Math.max(0, Math.min(100, 100 - u.utilizationPct));
          return <Row key={`${u.label}${i}`} title={`${limitLabel(u.label)} Nutzungsgrenze`} sub={u.resetAt ? `Zurücksetzungen ${new Date(u.resetAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Zurücksetzung nicht gemeldet'}>
            <span class="cxs-meter"><i class={left <= 10 ? 'low' : ''} style={{ width: `${left}%` }} /></span>
            <span class="cxs-meter-label">{Number(left.toFixed(0)).toLocaleString('de-DE')} % übrig</span>
          </Row>;
        })}
      </Card>
    </Section>)}
    {ctx.accounts.length > 0 && !limited.length && <Section title="Nutzungsgrenzen"><Card><div class="cxs-card-empty">Keines deiner Konten meldet gerade Limits.</div></Card></Section>}
    <Section title="Zurücksetzungen der Nutzungslimits">
      <Card>
        <div class="cxs-card-tabs">
          <PlainTabs class="pill" value={tab} onChange={setTab} options={[{ value: 'verfuegbar', label: <>Verfügbar <b>{ctx.accounts.filter(a => a.available).length}</b></> }, { value: 'verlauf', label: 'Verlauf' }]} />
          <span class="cxs-dim">{tab === 'verlauf' ? 'Letzte Ereignisse' : 'Jetzt nutzbar'}</span>
        </div>
        {tab === 'verlauf' && !data.metrics && <div class="cxs-loading"><span class="cxs-spinner" /><span>Zurücksetzungen des Nutzungslimits werden geladen…</span></div>}
        {tab === 'verlauf' && data.metrics && events.map(m => <Row key={m.id} title={m.status === 'failover' ? 'Kontowechsel wegen Limit' : 'Lauf abgebrochen'} sub={`${PROVIDER_NAME[m.provider] ?? m.provider} · ${m.account}`}>
          <span class="cxs-when"><b>{new Date(m.timestamp).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</b><small>{new Date(m.timestamp).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</small></span>
        </Row>)}
        {tab === 'verlauf' && data.metrics && !events.length && <div class="cxs-card-empty">Keine Limits erreicht</div>}
        {tab === 'verfuegbar' && ctx.accounts.map(a => <Row key={a.id} title={a.label} sub={a.available ? 'Verfügbar' : a.resetAt ? `Wieder frei ${new Date(a.resetAt).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'Nicht verfügbar'}>
          <span class={`cxs-status ${a.available ? 'ok' : 'off'}`}><i />{a.available ? 'Bereit' : cooling.includes(a) ? 'Im Limit' : 'Getrennt'}</span>
        </Row>)}
      </Card>
    </Section>
    <Section title="Abo kündigen" subtitle={<>Deine Abos werden bei den Anbietern verwaltet. Kündige dort — ein <Link onClick={() => ctx.go({ id: 'konto', sub: [] })}>Konto zu trennen</Link> beendet in Cortex nur die Nutzung.</>} />
  </Page>;
}

/* ── Analysen ──────────────────────────────────────────────────────────────── */

const PALETTE = ['#8B96C9', '#D6A85C', '#88B99B', '#C58BB8', '#7FB7C9', '#9A9BA0'];

export function AnalysenPage() {
  const data = useHost<{ metrics?: TaskMetric[]; accounts?: AccountStatusDto[] }>('analytics', { kind: 'getAnalytics' }, {});
  const [range1, setRange1] = useState(7);
  const [by1, setBy1] = useState<'produkt' | 'modell'>('produkt');
  const [range2, setRange2] = useState(7);
  const [by2, setBy2] = useState<'modell' | 'oberflaeche'>('modell');
  const [range3, setRange3] = useState(7);
  const metrics = data.metrics;
  return <Page title="Analysen">
    <Section big title="Nutzungsverlauf" subtitle={<>Sieh dir an, wie deine Abos von Cortex-Aufgaben beansprucht wurden.<br />Gezählt werden Token aus Läufen; Gespräche außerhalb von Cortex sind nicht enthalten.</>} actions={<Range value={range1} onChange={setRange1} />}>
      <div class="cxs-chart-card">
        <div class="cxs-chart-head"><span>Tarifnutzung</span>{!metrics ? <span class="cxs-spinner" /> : <PlainTabs class="pill small" value={by1} onChange={setBy1} options={[{ value: 'produkt', label: 'Nach Anbieter' }, { value: 'modell', label: 'Nach Modell' }]} />}</div>
        {metrics && <Bars metrics={metrics} days={range1} key={by1} group={m => by1 === 'produkt' ? (PROVIDER_NAME[m.provider] ?? m.provider) : (m.model ?? m.provider)} value={m => (m.inputTokens ?? 0) + (m.outputTokens ?? 0)} />}
      </div>
      <p class="cxs-info"><Glyph name="info" size={14} />Nutzungsdaten stammen aus den Meldungen der Anbieter-Clients und können unvollständig sein</p>
    </Section>
    <Section big title="Produktaktivität" subtitle="Sieh dir an, wie deine Aktivität je nach Anbieter und Modell variiert" actions={<><Range value={range2} onChange={setRange2} /><PlainTabs value={by2} onChange={setBy2} options={[{ value: 'modell', label: 'Nach Modell' }, { value: 'oberflaeche', label: 'Nach Aufgabenart' }]} /></>}>
      <div class="cxs-chart-card">
        {!metrics ? <div class="cxs-chart-head"><span>Turns</span><span class="cxs-spinner" /></div> : <Lines title="Turns" metrics={metrics} days={range2} key={by2} group={m => by2 === 'modell' ? (m.model ?? m.provider) : (m.kind ?? 'Allgemein')} />}
      </div>
    </Section>
    <Section big title="Ergebnisse" subtitle="Sieh dir an, wie viele Läufe gelangen, wechselten oder abbrachen" actions={<Range value={range3} onChange={setRange3} />}>
      {!metrics ? <div class="cxs-chart-card loading"><span class="cxs-spinner" /></div> : <>
        <div class="cxs-chart-card"><Lines title="Kontowechsel" metrics={metrics.filter(m => m.status === 'failover')} days={range3} group={m => PROVIDER_NAME[m.failedFrom?.provider ?? m.provider] ?? m.provider} /></div>
        <div class="cxs-chart-card"><Lines title="Läufe nach Ausgang" metrics={metrics} days={range3} group={m => ({ success: 'Erfolgreich', error: 'Fehler', failover: 'Gewechselt' } as Record<string, string>)[m.status] ?? m.status} /></div>
      </>}
    </Section>
  </Page>;
}

function Range({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return <PlainTabs value={value} onChange={onChange} options={[7, 30].map(d => ({ value: d, label: <>{d} T</> }))} />;
}

function daysBack(days: number) {
  const out: Array<{ key: string; label: string; start: number }> = [];
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (days - 1));
  for (let i = 0; i < days; i++) { out.push({ key: d.toDateString(), label: d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }), start: d.getTime() }); d.setDate(d.getDate() + 1); }
  return out;
}

function niceMax(v: number) { if (v <= 3) return 3; const p = 10 ** Math.floor(Math.log10(v)); const n = Math.ceil(v / p); return (n <= 3 ? 3 : n <= 6 ? 6 : 9) * p; }

function Bars({ metrics, days, group, value }: { metrics: TaskMetric[]; days: number; group: (m: TaskMetric) => string; value: (m: TaskMetric) => number }) {
  const axis = daysBack(days);
  const since = axis[0]!.start;
  const recent = metrics.filter(m => m.timestamp >= since);
  const groups = [...new Set(recent.map(group))];
  const totals = axis.map(day => groups.map(g => recent.filter(m => group(m) === g && new Date(m.timestamp).toDateString() === day.key).reduce((s, m) => s + (value(m) || 1), 0)));
  const max = niceMax(Math.max(0, ...totals.map(t => t.reduce((a, b) => a + b, 0))));
  if (!recent.length) return <Empty>Keine Läufe in diesem Zeitraum</Empty>;
  return <div class="cxs-chart">
    <div class="cxs-chart-plot">
      <div class="cxs-chart-y">{[max, (max * 2) / 3, max / 3, 0].map(v => <span key={v}>{short(v)}</span>)}</div>
      <div class="cxs-bars" style={{ gridTemplateColumns: `repeat(${axis.length}, 1fr)` }}>
        {totals.map((stack, i) => <div class="cxs-bar" key={axis[i]!.key} title={`${axis[i]!.label}: ${short(stack.reduce((a, b) => a + b, 0))}`}>{stack.map((v, g) => v ? <i key={g} style={{ height: `${(v / max) * 100}%`, background: PALETTE[g % PALETTE.length] }} /> : null)}</div>)}
      </div>
    </div>
    <Axis axis={axis} />
    <Legend groups={groups} />
  </div>;
}

function Lines({ title, metrics, days, group }: { title: string; metrics: TaskMetric[]; days: number; group: (m: TaskMetric) => string }) {
  const axis = daysBack(days);
  const recent = metrics.filter(m => m.timestamp >= axis[0]!.start);
  const groups = [...new Set(recent.map(group))].slice(0, 6);
  const series = groups.map(g => axis.map(day => recent.filter(m => group(m) === g && new Date(m.timestamp).toDateString() === day.key).length));
  const max = niceMax(Math.max(0, ...series.flat()));
  const W = 680, H = 118;
  return <div class="cxs-chart">
    <div class="cxs-chart-title"><span>{title}</span><strong>{recent.length.toLocaleString('de-DE')}</strong></div>
    {!recent.length ? <Empty>Keine Läufe in diesem Zeitraum</Empty> : <>
      <div class="cxs-chart-plot">
        <div class="cxs-chart-y">{[max, (max * 2) / 3, max / 3, 0].map(v => <span key={v}>{short(v)}</span>)}</div>
        <svg class="cxs-lines" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {[0, 1, 2, 3].map(i => <line key={i} x1="0" x2={W} y1={(H / 3) * i} y2={(H / 3) * i} />)}
          {series.map((s, g) => <polyline key={g} fill="none" stroke={PALETTE[g % PALETTE.length]} stroke-width="1.5" vector-effect="non-scaling-stroke" points={s.map((v, i) => `${(i / Math.max(1, s.length - 1)) * W},${H - (v / max) * H}`).join(' ')} />)}
        </svg>
      </div>
      <Axis axis={axis} />
      <Legend groups={groups} />
    </>}
  </div>;
}

function Axis({ axis }: { axis: Array<{ label: string }> }) {
  const picks = [0, Math.floor((axis.length - 1) / 2), axis.length - 1];
  return <div class="cxs-chart-x">{picks.map(i => <span key={i}>{axis[i]!.label}</span>)}</div>;
}
function Legend({ groups }: { groups: string[] }) {
  return <div class="cxs-legend">{groups.map((g, i) => <span key={g}><i style={{ background: PALETTE[i % PALETTE.length] }} />{g}</span>)}</div>;
}
const short = (v: number) => v >= 1e6 ? `${Math.round(v / 1e5) / 10} Mio.` : v >= 1e3 ? `${Math.round(v / 100) / 10} Tsd.` : String(Math.round(v));

/* ── Konto ─────────────────────────────────────────────────────────────────── */

export function KontoPage({ ctx }: { ctx: SettingsContext }) {
  return <div class="cxs-embedded"><AccountsView accounts={ctx.accounts} /></div>;
}
