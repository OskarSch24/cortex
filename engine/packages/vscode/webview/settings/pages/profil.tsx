import { useState } from 'preact/hooks';
import type { TaskMetric } from '@cortex/core';
import type { AccountStatusDto } from '../../../src/panel/protocol.js';
import { Glyph } from '../../components/CortexIcons.js';
import { roundedDuration } from '../../format/duration.js';
import { compactTokens } from '../../format/tokens.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useHost } from '../../hooks/useHostMessage.js';
import { PlainTabs } from '../ui.js';

/* ── Profil ────────────────────────────────────────────────────────────────── */

type Analytics = { metrics?: TaskMetric[]; accounts?: AccountStatusDto[] };

export function ProfilPage({ ctx }: { ctx: SettingsContext }) {
  const data = useHost<Analytics>('analytics', { kind: 'getAnalytics' }, {});
  const [scale, setScale] = useState<'tag' | 'woche' | 'kumuliert'>('tag');
  const metrics = data.metrics ?? [];
  const identity = ctx.accounts.find(a => a.identity)?.identity;
  const name = identity?.split('@')[0] ?? 'Cortex';
  const initials = name.replace(/[^a-zA-ZÄÖÜäöü ]/g, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CX';
  const tokens = metrics.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
  const byDay = new Map<string, number>();
  for (const m of metrics) { const d = dayKey(m.timestamp); byDay.set(d, (byDay.get(d) ?? 0) + (m.inputTokens ?? 0) + (m.outputTokens ?? 0) || (byDay.get(d) ?? 0) + 1); }
  const peak = Math.max(0, ...byDay.values());
  const longest = metrics.reduce((max, m) => Math.max(max, m.durationMs ?? 0), 0);
  const { current, best } = streaks([...byDay.keys()]);
  const models = new Map<string, number>();
  for (const m of metrics) models.set(m.model ?? m.provider, (models.get(m.model ?? m.provider) ?? 0) + 1);
  const topModels = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const failover = metrics.filter(m => m.status === 'failover').length;
  const efforts = new Map<string, number>();
  for (const m of metrics) if (m.effort) efforts.set(m.effort, (efforts.get(m.effort) ?? 0) + 1);
  const topEffort = [...efforts.entries()].sort((a, b) => b[1] - a[1])[0];
  return <div class="cxs-profile">
    <div class="cxs-profile-bar">
      <span>Profil</span>
      <div>
        <button type="button" onClick={() => ctx.go({ id: 'konto', sub: [] })}><Glyph name="link" size={14} />Konten verwalten</button>
        <button type="button" onClick={() => vscode.postMessage({ kind: 'openAnalytics' })}><Glyph name="share" size={14} />Analysen öffnen</button>
        <button type="button" class="dim" disabled><Glyph name="lock" size={14} />Privat</button>
      </div>
    </div>
    <div class="cxs-profile-body">
      <div class="cxs-avatar">{initials}</div>
      <h1>{name}</h1>
      <p class="cxs-handle">{identity ? `@${name}` : 'Keine Anmeldung erkannt'}<span>·</span><b>{ctx.accounts.length === 1 ? '1 Konto' : `${ctx.accounts.length} Konten`}</b></p>
      <div class="cxs-stats">
        <div><strong>{compactTokens(tokens)}</strong><span>Token insgesamt</span></div>
        <div><strong>{compactTokens(peak)}</strong><span>Spitzenwert am Tag</span></div>
        <div><strong>{roundedDuration(longest)}</strong><span>Längster Lauf</span></div>
        <div><strong>{current === 1 ? '1 Tag' : `${current} Tage`}</strong><span>Aktuelle Serie</span></div>
        <div><strong>{best === 1 ? '1 Tag' : `${best} Tage`}</strong><span>Längste Serie</span></div>
      </div>
      <div class="cxs-heat-head"><strong>Tokennutzung</strong><PlainTabs value={scale} onChange={setScale} options={[{ value: 'tag', label: 'Täglich' }, { value: 'woche', label: 'Wöchentlich' }, { value: 'kumuliert', label: 'Kumuliert' }]} /></div>
      <Heatmap byDay={byDay} scale={scale} />
      <div class="cxs-insights">
        <div>
          <strong>Aktivitätseinblicke</strong>
          <p><span>Chats insgesamt</span><b>{ctx.conversations.length.toLocaleString('de-DE')}</b></p>
          <p><span>Läufe insgesamt</span><b>{metrics.length.toLocaleString('de-DE')}</b></p>
          <p><span>Meistgenutzter Denkaufwand</span><b>{topEffort ? `${effortLabel(topEffort[0])} · ${Math.round((topEffort[1] / metrics.length) * 100)} %` : '–'}</b></p>
          <p><span>Kontowechsel bei Limits</span><b>{failover.toLocaleString('de-DE')}</b></p>
          <p><span>Projekte</span><b>{ctx.projects.length.toLocaleString('de-DE')}</b></p>
        </div>
        <div>
          <strong>Meistgenutzte Modelle</strong>
          {topModels.map(([model, count]) => <p key={model}><span class="cxs-model"><Glyph name="bolt" size={13} />{model}</span><b>{count === 1 ? '1 Lauf' : `${count.toLocaleString('de-DE')} Läufe`}</b></p>)}
          {!topModels.length && <p><span class="cxs-dim">{data.metrics ? 'Noch keine Läufe aufgezeichnet' : 'Wird geladen …'}</span></p>}
        </div>
      </div>
    </div>
  </div>;
}

function Heatmap({ byDay, scale }: { byDay: Map<string, number>; scale: 'tag' | 'woche' | 'kumuliert' }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 7 * 52 - ((today.getDay() + 6) % 7));
  const days: Array<{ key: string; date: Date }> = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) days.push({ key: dayKey(d.getTime()), date: new Date(d) });
  let running = 0;
  const values = days.map(({ key }, i) => {
    if (scale === 'kumuliert') { running += byDay.get(key) ?? 0; return running; }
    if (scale === 'woche') { const w = Math.floor(i / 7) * 7; return days.slice(w, w + 7).reduce((s, d) => s + (byDay.get(d.key) ?? 0), 0); }
    return byDay.get(key) ?? 0;
  });
  const max = Math.max(1, ...values);
  const weeks = Math.ceil(days.length / 7);
  const months: Array<{ col: number; label: string }> = [];
  days.forEach((d, i) => { if (d.date.getDate() === 1) months.push({ col: Math.floor(i / 7), label: d.date.toLocaleString('de-DE', { month: 'short' }).replace('.', '') }); });
  return <div class="cxs-heat">
    <div class="cxs-heat-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
      {days.map((d, i) => { const v = values[i]!; const level = v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)); return <i key={d.key} class={`l${level}`} style={{ gridRow: ((d.date.getDay() + 6) % 7) + 1, gridColumn: Math.floor(i / 7) + 1 }} title={`${d.date.toLocaleDateString('de-DE')}: ${v.toLocaleString('de-DE')}`} />; })}
    </div>
    <div class="cxs-heat-months" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>{months.map(m => <span key={`${m.col}${m.label}`} style={{ gridColumn: m.col + 1 }}>{m.label}</span>)}</div>
  </div>;
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function streaks(keys: string[]): { current: number; best: number } {
  const set = new Set(keys);
  let best = 0, run = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 400);
  for (let i = 0; i <= 400; i++) { run = set.has(dayKey(d.getTime())) ? run + 1 : 0; best = Math.max(best, run); d.setDate(d.getDate() + 1); }
  let current = 0; const c = new Date(); c.setHours(0, 0, 0, 0);
  if (!set.has(dayKey(c.getTime()))) c.setDate(c.getDate() - 1);
  while (set.has(dayKey(c.getTime()))) { current++; c.setDate(c.getDate() - 1); }
  return { current, best };
}
const effortLabel = (e: string) => ({ minimal: 'Minimal', low: 'Gering', medium: 'Mittel', high: 'Hoch', xhigh: 'Sehr hoch', max: 'Max.' } as Record<string, string>)[e] ?? e;
