import { useRef, useState } from 'preact/hooks';
import type { AccountStatusDto } from '../../src/panel/protocol.js';
import { BrandMark, PROVIDER_NAME } from './brandIcons.js';
import { reportsLimits } from '../../../core/src/types.js';
import { CortexMark, Glyph } from './CortexIcons.js';
import { vscode } from '../vscodeApi.js';

export function limitLabel(label: string) {
  const labels: Record<string, string> = { '5h window': '5 Stunden', five_hour: '5 Stunden', weekly: 'Woche', seven_day: 'Woche', monthly: 'Monat' };
  return labels[label] ?? label;
}
export function LimitWindows({ account, compact = false }: { account: AccountStatusDto; compact?: boolean }) {
  const windows = (account.usage ?? []).filter(u => Number.isFinite(u.utilizationPct));
  return <div class={`cx-limit-windows ${compact ? 'compact' : ''}`}>{windows.length ? windows.map((u, i) => {
    const left = Math.max(0, Math.min(100, 100 - u.utilizationPct));
    return <div class="cx-limit-window" key={`${u.label}-${i}`}><div title={`${u.utilizationPct.toLocaleString('de-DE')}% verbraucht · ${Number(left.toFixed(2)).toLocaleString('de-DE')}% übrig`}><span>{limitLabel(u.label)}</span><strong>{Number(left.toFixed(2)).toLocaleString('de-DE')}% übrig</strong></div><div class="cx-quota-track"><i class={left <= 10 ? 'low' : ''} style={{ width: `${left}%` }} /></div>{!compact && <small>{u.utilizationPct.toLocaleString('de-DE')}% verbraucht · {u.resetAt ? `Reset ${new Date(u.resetAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Reset nicht gemeldet'}</small>}</div>;
  }) : <span class="cx-unknown-quota">Keine Limits vom Anbieter gemeldet</span>}</div>;
}
/**
 * Das Konto, das gerade arbeitet: das angeheftete, sonst das erste freie mit
 * gemeldeten Limits. Der Balken zeigt das knappste Fenster, als verbleibend.
 */
function currentUsage(accounts: AccountStatusDto[], current?: { provider: string; account: string }) {
  const account =
    accounts.find(a => current && a.provider === current.provider && a.label === current.account) ??
    accounts.find(a => a.available && (a.usage ?? []).some(u => Number.isFinite(u.utilizationPct)));
  if (!account) return undefined;
  const windows = (account.usage ?? []).filter(u => Number.isFinite(u.utilizationPct));
  const tight = windows.sort((x, y) => y.utilizationPct - x.utilizationPct)[0];
  const left = tight ? Math.max(0, Math.min(100, Math.round(100 - tight.utilizationPct))) : undefined;
  const reset = tight?.resetAt ? new Date(tight.resetAt).toLocaleString('de-DE', new Date(tight.resetAt).toDateString() === new Date().toDateString() ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : undefined;
  return { account, left, reset, window: tight ? limitLabel(tight.label) : undefined };
}

export function AccountLimits({ accounts, onOpen, current }: { accounts: AccountStatusDto[]; onOpen: () => void; current?: { provider: string; account: string } }) {
  const [hover, setHover] = useState(false);
  const lastRefresh = useRef(0);
  const available = accounts.filter(a => a.available && a.authState !== 'expired').length;
  const refresh = () => { if (Date.now() - lastRefresh.current > 180000) { lastRefresh.current = Date.now(); vscode.postMessage({ kind: 'refreshUsage' }); } };
  return <div class="cx-account-launcher" onMouseEnter={() => { setHover(true); refresh(); }} onMouseLeave={() => setHover(false)} onFocus={() => { setHover(true); refresh(); }} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHover(false); }} onKeyDown={e => { if (e.key === 'Escape') setHover(false); }}>
    <button class="cx-account-summary usage" aria-label="Konten und Limits" aria-describedby={hover ? 'account-limits-preview' : undefined} onClick={() => { setHover(false); refresh(); onOpen(); }}>
      {(() => {
        const u = currentUsage(accounts, current);
        if (!accounts.length) return <><div class="cx-provider-stack"><span><CortexMark size={18} /></span></div><span>Deine KI-Abos verbinden<small>Deine Anbieter. Deine Abos.</small></span></>;
        if (!u) return <><div class="cx-provider-stack">{[...new Set(accounts.map(a => a.provider))].slice(0, 3).map(provider => <span key={provider}><BrandMark provider={provider} size={15} /></span>)}</div><span>{accounts.length} {accounts.length === 1 ? 'Konto' : 'Konten'}<small>{available} verfügbar · Limits & Konten</small></span></>;
        return <div class="cx-usage">
          <div class="cx-usage-top"><BrandMark provider={u.account.provider} size={13} /><strong>{PROVIDER_NAME[u.account.provider] ?? u.account.provider} {u.account.label}</strong>{u.left !== undefined && <span class={u.left <= 10 ? 'low' : ''}>{u.left} % frei</span>}</div>
          {u.left !== undefined && <div class="cx-usage-track"><i class={u.left <= 10 ? 'low' : ''} style={{ width: `${u.left}%` }} /></div>}
          <small>{available} von {accounts.length} Konten verfügbar{u.reset ? ` · ${u.window ?? 'Limit'} neu um ${u.reset}` : ''}</small>
        </div>;
      })()}
      <Glyph name="chevron" size={12} />
    </button>
    {hover && <div class="cx-limits-preview" id="account-limits-preview" role="tooltip"><div class="cx-limits-heading">Deine Limits <small>Vom Anbieter gemeldet · alle Werte als verbleibend</small></div>{accounts.filter(a => reportsLimits(a.provider)).map(a => <section key={a.id}><div class="cx-limit-account"><BrandMark provider={a.provider} size={13} /><strong>{PROVIDER_NAME[a.provider] ?? a.provider}</strong><span>{a.label}</span></div><LimitWindows account={a} compact /></section>)}{/* Anbieter ohne Limit-Endpunkt bekommen keine leere Überschrift, sondern eine Zeile. */}
      {accounts.some(a => !reportsLimits(a.provider)) && <p class="cx-limits-silent">{[...new Set(accounts.filter(a => !reportsLimits(a.provider)).map(a => PROVIDER_NAME[a.provider] ?? a.provider))].join(', ')} meldet keine Limits.</p>}{!accounts.length && <p>Noch kein Konto verbunden.</p>}</div>}
  </div>;
}
