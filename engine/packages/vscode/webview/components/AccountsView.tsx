import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountStatusDto, HostToWebview } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { BrandMark, PROVIDER_NAME } from './brandIcons.js';
import { LimitWindows } from './AccountLimits.js';
import { Glyph } from './CortexIcons.js';

const PROVIDERS = [
  { id: 'claude', name: 'Claude', description: 'Dein Claude-Konto', via: 'Anmeldung über Claude Code' },
  { id: 'codex', name: 'ChatGPT', description: 'Dein ChatGPT-Abo', via: 'Anmeldung über Codex' },
  { id: 'grok', name: 'Grok', description: 'Dein Grok-Konto', via: 'Anmeldung über Grok CLI' },
];
type Progress = Extract<HostToWebview, { kind: 'connectionProgress' }>;
export function accountStatus(account: AccountStatusDto) {
  if (account.authState === 'expired') return { kind: 'error', text: 'Anmeldung abgelaufen' };
  if (account.authState === 'unknown') return { kind: 'unknown', text: 'Anmeldung prüfen' };
  if (!account.available) return { kind: 'limited', text: 'Nicht verfügbar' };
  if (account.authState === 'ok') return { kind: 'ok', text: 'Verbunden' };
  return { kind: 'unknown', text: 'Anmeldung prüfen' };
}

export function AccountsView({ accounts, onUseAccount }: { accounts: AccountStatusDto[]; onUseAccount?: (account: AccountStatusDto) => void }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string>();
  const [connectProvider, setConnectProvider] = useState<string>();
  const [label, setLabel] = useState('privat');
  const [email, setEmail] = useState('');
  const [progress, setProgress] = useState<Progress>();
  const [busy, setBusy] = useState(false);
  const cancelPending = useRef(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const modalProviderRef = useRef(connectProvider);
  modalProviderRef.current = connectProvider;
  const visible = accounts.filter(a => !a.reviewOnly);
  const filtered = visible.filter(a => filter === 'all' || a.provider === filter);
  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => {
      if (e.data.kind === 'connectionProgress' && cancelPending.current && e.data.attemptId) {
        vscode.postMessage({ kind: 'respondToConnection', provider: e.data.provider, attemptId: e.data.attemptId, accept: false });
        cancelPending.current = false;
        return;
      }
      if (e.data.kind === 'connectionProgress' && (!modalProviderRef.current || e.data.provider === modalProviderRef.current)) { setProgress(e.data); setBusy(e.data.state === 'connecting' || e.data.state === 'review'); }
    };
    window.addEventListener('message', onMessage); return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(() => { if (connectProvider) labelRef.current?.focus(); }, [connectProvider]);
  const connect = (provider: string) => {
    setConnectProvider(provider); setProgress(undefined); setBusy(false); setEmail('');
    setLabel(visible.some(a => a.provider === provider) ? 'geschäftlich' : 'privat');
  };
  const submit = () => {
    if (!connectProvider || !label.trim() || busy) return;
    cancelPending.current = false;
    setBusy(true); setProgress(undefined);
    vscode.postMessage({ kind: 'addAccount', provider: connectProvider, label: label.trim(), email: email.trim() || undefined });
  };
  const close = () => {
    if (busy && !progress?.attemptId) cancelPending.current = true;
    if (progress?.attemptId && busy) vscode.postMessage({ kind: 'respondToConnection', provider: progress.provider, attemptId: progress.attemptId, accept: false });
    setConnectProvider(undefined); setBusy(false);
  };
  const confirm = (accept: boolean) => {
    if (!progress?.attemptId) return;
    vscode.postMessage({ kind: 'respondToConnection', provider: progress.provider, attemptId: progress.attemptId, accept });
    if (!accept) { setBusy(false); setProgress(undefined); }
  };
  return <div class="cx-connections">
    <div class="cx-page-heading"><div><div class="cx-eyebrow">DEINE KI, ZUSAMMENGEBRACHT</div><h1>Konten & Limits</h1><p>Verbinde deine privaten und geschäftlichen Konten.<br />Auch mehrere beim selben Anbieter — jedes mit eigener Anmeldung.</p></div><button class="cx-primary" onClick={() => connect('claude')}><Glyph name="plus" size={15} />Konto verbinden</button></div>
    <div class="cx-provider-grid">{PROVIDERS.map(provider => {
      const count = visible.filter(a => a.provider === provider.id).length;
      const verified = visible.some(a => a.provider === provider.id && a.authState === 'ok' && a.available);
      return <article class="cx-provider-card" key={provider.id}><div class="cx-provider-card-top"><span class={`cx-brand-tile ${provider.id}`}><BrandMark provider={provider.id} size={23} /></span><span class={`cx-provider-count ${verified ? 'bound' : ''}`}>{count ? `${count} ${count === 1 ? 'Konto' : 'Konten'}` : 'Nicht verbunden'}</span></div><h2>{provider.name}</h2><p>{provider.description}</p><button onClick={() => connect(provider.id)}><Glyph name="plus" size={13} />{count ? 'Weiteres Konto' : 'Verbinden'}<Glyph name="arrow" size={13} /></button></article>;
    })}</div>
    <div class="cx-account-section-heading"><div><h2>Deine Konten <span>{visible.length}</span></h2><p>Wähle in jeder Aufgabe, welches Konto und Modell sie übernimmt.</p></div><button class="cx-secondary" onClick={() => vscode.postMessage({ kind: 'refreshUsage' })}><Glyph name="refresh" size={13} />Aktualisieren</button></div>
    <div class="cx-account-filters" role="tablist" aria-label="Konten nach Anbieter filtern">{[{ id: 'all', name: 'Alle Konten' }, ...PROVIDERS.filter(p => visible.some(a => a.provider === p.id))].map(p => <button key={p.id} role="tab" aria-selected={filter === p.id} onClick={() => setFilter(p.id)}>{p.name}</button>)}</div>
    <div class="cx-accounts-table"><div class="cx-account-columns"><span>KONTO</span><span>STATUS</span><span>KONTINGENT</span><span /></div>
      {filtered.map(account => {
        const status = accountStatus(account);
        const isExpanded = expanded === account.id;
        return <article class={`cx-account-record ${isExpanded ? 'expanded' : ''}`} key={account.id}>
          <div class="cx-account-row"><button class="cx-account-identity" onClick={() => setExpanded(isExpanded ? undefined : account.id)} aria-expanded={isExpanded}><span class={`cx-brand-tile ${account.provider}`}><BrandMark provider={account.provider} size={19} /></span><span><strong>{account.label}<b>{PROVIDER_NAME[account.provider] ?? account.provider}</b></strong><small>{account.identity ?? 'Identität noch nicht gemeldet'}</small></span></button><span class={`cx-status ${status.kind}`}><span class="cx-dot" />{status.text}</span><div class="cx-account-quota"><LimitWindows account={account} /></div><button class={`cx-icon ${isExpanded ? 'cx-chevron-down' : ''}`} aria-label={`Kontodetails: ${account.label}`} onClick={() => setExpanded(isExpanded ? undefined : account.id)}><Glyph name="chevron" size={14} /></button></div>
          {isExpanded && <div class="cx-account-detail"><div class="cx-account-detail-heading"><div><span class="cx-label">{account.authMode === 'api-key' ? 'API-SCHLÜSSEL' : 'ANBIETER-ANMELDUNG'}</span><p>{account.authMode === 'api-key' ? 'Dieses Konto nutzt separat abgerechneten API-Zugang.' : 'Eigene Anmeldung, getrennt von deinen anderen Konten.'}</p></div><div class="cx-inline-actions"><button class="cx-secondary" onClick={() => vscode.postMessage({ kind: 'renameAccount', id: account.id })}><Glyph name="edit" size={12} />Umbenennen</button><button class="cx-secondary" onClick={() => { setConnectProvider(account.provider); setLabel(account.label); setEmail(''); setProgress(undefined); setBusy(true); vscode.postMessage({ kind: 'reconnectAccount', id: account.id }); }}>Erneut anmelden</button><button class="cx-icon cx-danger" aria-label={`Konto entfernen: ${account.label}`} onClick={() => vscode.postMessage({ kind: 'removeAccount', id: account.id })}><Glyph name="trash" size={14} /></button></div></div><div class="cx-account-detail-bottom"><span>{account.models.length} verfügbare Modelle</span>{onUseAccount && <button class="cx-primary" disabled={!account.available || account.authState === 'expired'} onClick={() => onUseAccount(account)}>Für diese Aufgabe verwenden<Glyph name="arrow" size={13} /></button>}</div></div>}
        </article>;
      })}
      {!filtered.length && <div class="cx-accounts-empty"><div class="cx-empty-orbits"><Glyph name="link" size={25} /></div><h3>{visible.length ? 'Keine Konten für diesen Anbieter' : 'Hier kommen deine Konten zusammen.'}</h3><p>Verbinde dein erstes Abo. Weitere private oder geschäftliche Konten<br />kannst du jederzeit hinzufügen.</p><button class="cx-secondary" onClick={() => connect('claude')}><Glyph name="plus" size={13} />Erstes Konto verbinden</button></div>}
    </div>
    <div class="cx-connection-note"><Glyph name="link" size={16} /><p>Cortex erhebt kein zusätzliches KI-Abo. Die Nutzung erfolgt über die offiziellen Anbieter-Programme; verfügbare Modelle, Limits und Abrechnung bestimmt dein jeweiliger Anbieter.</p></div>
    {progress && !connectProvider && <div class={`cx-connection-feedback ${progress.state}`} role="status">{progress.message}</div>}
    {connectProvider && <div class="cx-modal-backdrop" onClick={close}><section class="cx-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') close(); }}><div class="cx-dialog-header"><span class={`cx-brand-tile ${connectProvider}`}><BrandMark provider={connectProvider} size={24} /></span><button class="cx-icon" aria-label="Anmeldung schließen" onClick={close}><Glyph name="close" /></button></div><h2 id="connect-title">Konto verbinden</h2><p>Ein eigener Platz für jedes deiner Abos.</p><form onSubmit={e => { e.preventDefault(); submit(); }}><label>Anbieter<select value={connectProvider} disabled={busy} onChange={e => { setConnectProvider(e.currentTarget.value); setProgress(undefined); }}>{PROVIDERS.map(p => <option value={p.id}>{p.name}</option>)}</select></label><label>Kontoname<input ref={labelRef} value={label} maxLength={40} required disabled={busy} placeholder="z. B. privat oder studio" onInput={e => setLabel(e.currentTarget.value)} /></label><label>E-Mail des gewünschten Kontos <span class="cx-optional">optional</span><input type="email" value={email} disabled={busy} placeholder="name@firma.de" onInput={e => setEmail(e.currentTarget.value)} /></label><div class="cx-label-presets"><button type="button" disabled={busy} class={label === 'privat' ? 'active' : ''} onClick={() => setLabel('privat')}>Privat</button><button type="button" disabled={busy} class={label === 'geschäftlich' ? 'active' : ''} onClick={() => setLabel('geschäftlich')}>Geschäftlich</button></div><div class="cx-login-explainer"><Glyph name="globe" size={18} /><div><strong>Anmeldung im Browser</strong><span>Wähle beim Anbieter dein Konto. Anschließend zeigt Cortex die erkannte E-Mail zur Bestätigung. Mit einer E-Mail oben prüfen wir zusätzlich, ob sie übereinstimmt.</span></div></div>{progress && <div class={`cx-connection-feedback ${progress.state}`} role={progress.state === 'error' ? 'alert' : 'status'}>{progress.message}</div>}{progress?.url && progress.state === 'connecting' && <a class="cx-oauth-link" href={progress.url} target="_blank" rel="noreferrer"><Glyph name="globe" size={14} />Anmeldung im Browser öffnen</a>}{progress?.state === 'review' ? <div class="cx-identity-confirm"><div><Glyph name="check" size={18} /><strong>{progress.identity}</strong><span>Dieses Konto mit „{label}“ verbinden?</span></div><button type="button" class="cx-primary cx-full" onClick={() => confirm(true)}>Ja, dieses Konto verbinden<Glyph name="check" size={14} /></button><button type="button" class="cx-secondary cx-full" onClick={() => confirm(false)}>Anderes Konto auswählen</button></div> : progress?.state === 'connected' ? <button type="button" class="cx-primary cx-full" onClick={close}><Glyph name="check" size={15} />Fertig</button> : <button class="cx-primary cx-full" disabled={busy || !label.trim()}>{busy ? <><span class="cx-spinner" />Warte auf Browser-Anmeldung …</> : <>Beim Anbieter anmelden<Glyph name="arrow" size={15} /></>}</button>}{busy && <button type="button" class="cx-secondary cx-full" onClick={close}>Abbrechen</button>}</form></section></div>}
  </div>;
}
