import { useEffect, useRef, useState } from 'preact/hooks';
import type { OpenRouterModel } from '@cortex/core';
import type { AccountStatusDto, HostToWebview } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { BrandMark, PROVIDER_NAME } from './brandIcons.js';
import { LimitWindows } from './AccountLimits.js';
import { Glyph } from './CortexIcons.js';

const PROVIDERS = [
  { id: 'claude', name: 'Claude', description: 'Dein Claude-Konto', via: 'Anmeldung über Claude Code' },
  { id: 'codex', name: 'ChatGPT', description: 'Dein ChatGPT-Abo', via: 'Anmeldung über Codex' },
  { id: 'grok', name: 'Grok', description: 'Dein Grok-Konto', via: 'Anmeldung über Grok CLI' },
  { id: 'openrouter', name: 'OpenRouter', description: 'Hunderte Modelle mit deinem API-Schlüssel', via: 'API-Schlüssel' },
];
/** Anbieter ohne Anmeldung im Browser: verbunden wird mit einem API-Schlüssel. */
const API_KEY_PROVIDERS = new Set(['openrouter']);
type Progress = Extract<HostToWebview, { kind: 'connectionProgress' }>;
function accountStatus(account: AccountStatusDto) {
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
  const [apiKey, setApiKey] = useState('');
  const [replaceId, setReplaceId] = useState<string>();
  const [progress, setProgress] = useState<Progress>();
  const [busy, setBusy] = useState(false);
  const cancelPending = useRef(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const modalProviderRef = useRef(connectProvider);
  modalProviderRef.current = connectProvider;
  // OpenRouter bekommt nie selbst Aufgaben zugeteilt, ist aber ein Konto, das
  // man hier verbindet, sieht und im Modellmenü von Hand wählt.
  const visible = accounts.filter(a => !a.reviewOnly || API_KEY_PROVIDERS.has(a.provider));
  const keyMode = !!connectProvider && API_KEY_PROVIDERS.has(connectProvider);
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
    setConnectProvider(provider); setProgress(undefined); setBusy(false); setEmail(''); setApiKey(''); setReplaceId(undefined);
    setLabel(visible.some(a => a.provider === provider) ? 'geschäftlich' : 'privat');
  };
  const submit = () => {
    if (!connectProvider || !label.trim() || busy) return;
    cancelPending.current = false;
    setBusy(true); setProgress(undefined);
    if (keyMode) {
      if (!apiKey.trim()) { setBusy(false); return; }
      vscode.postMessage({ kind: 'addApiKeyAccount', provider: 'openrouter', label: label.trim(), key: apiKey.trim(), accountId: replaceId });
      setApiKey('');
      return;
    }
    vscode.postMessage({ kind: 'addAccount', provider: connectProvider, label: label.trim(), email: email.trim() || undefined });
  };
  const close = () => {
    if (busy && !progress?.attemptId) cancelPending.current = true;
    if (progress?.attemptId && busy) vscode.postMessage({ kind: 'respondToConnection', provider: progress.provider, attemptId: progress.attemptId, accept: false });
    setConnectProvider(undefined); setBusy(false); setApiKey(''); setReplaceId(undefined);
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
          {isExpanded && <div class="cx-account-detail"><div class="cx-account-detail-heading"><div><span class="cx-label">{account.authMode === 'api-key' ? 'API-SCHLÜSSEL' : 'ANBIETER-ANMELDUNG'}</span><p>{account.authMode === 'api-key' ? 'Dieses Konto nutzt separat abgerechneten API-Zugang.' : 'Eigene Anmeldung, getrennt von deinen anderen Konten.'}</p></div><div class="cx-inline-actions"><button class="cx-secondary" onClick={() => vscode.postMessage({ kind: 'renameAccount', id: account.id })}><Glyph name="edit" size={12} />Umbenennen</button>{API_KEY_PROVIDERS.has(account.provider)
  ? <button class="cx-secondary" onClick={() => { setConnectProvider(account.provider); setLabel(account.label); setApiKey(''); setReplaceId(account.id); setProgress(undefined); setBusy(false); }}><Glyph name="key" size={12} />Schlüssel ersetzen</button>
  : <button class="cx-secondary" onClick={() => { setConnectProvider(account.provider); setLabel(account.label); setEmail(''); setProgress(undefined); setBusy(true); vscode.postMessage({ kind: 'reconnectAccount', id: account.id }); }}>Erneut anmelden</button>}<button class="cx-icon cx-danger" aria-label={`Konto entfernen: ${account.label}`} onClick={() => vscode.postMessage({ kind: 'removeAccount', id: account.id })}><Glyph name="trash" size={14} /></button></div></div><div class="cx-account-detail-bottom"><span>{account.provider === 'openrouter' ? 'Antwortet nur, wenn du es im Modellmenü oder bei einem Agenten wählst — ohne Werkzeuge, ändert keine Dateien.' : `${account.models.length} verfügbare Modelle`}</span>{onUseAccount && account.provider !== 'openrouter' && <button class="cx-primary" disabled={!account.available || account.authState === 'expired'} onClick={() => onUseAccount(account)}>Für diese Aufgabe verwenden<Glyph name="arrow" size={13} /></button>}</div>{account.provider === 'openrouter' && <OpenRouterModels />}</div>}
        </article>;
      })}
      {!filtered.length && <div class="cx-accounts-empty"><div class="cx-empty-orbits"><Glyph name="link" size={25} /></div><h3>{visible.length ? 'Keine Konten für diesen Anbieter' : 'Hier kommen deine Konten zusammen.'}</h3><p>Verbinde dein erstes Abo. Weitere private oder geschäftliche Konten<br />kannst du jederzeit hinzufügen.</p><button class="cx-secondary" onClick={() => connect('claude')}><Glyph name="plus" size={13} />Erstes Konto verbinden</button></div>}
    </div>
    <div class="cx-connection-note"><Glyph name="link" size={16} /><p>Cortex erhebt kein zusätzliches KI-Abo. Die Nutzung erfolgt über die offiziellen Anbieter-Programme; verfügbare Modelle, Limits und Abrechnung bestimmt dein jeweiliger Anbieter.</p></div>
    {progress && !connectProvider && <div class={`cx-connection-feedback ${progress.state}`} role="status">{progress.message}</div>}
    {connectProvider && <div class="cx-modal-backdrop" onClick={close}><section class="cx-connect-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') close(); }}><div class="cx-dialog-header"><span class={`cx-brand-tile ${connectProvider}`}><BrandMark provider={connectProvider} size={24} /></span><button class="cx-icon" aria-label="Anmeldung schließen" onClick={close}><Glyph name="close" /></button></div><h2 id="connect-title">{replaceId ? 'Schlüssel ersetzen' : 'Konto verbinden'}</h2><p>{keyMode ? 'Dein eigener OpenRouter-Schlüssel, abgerechnet über dein OpenRouter-Guthaben.' : 'Ein eigener Platz für jedes deiner Abos.'}</p><form onSubmit={e => { e.preventDefault(); submit(); }}><label>Anbieter<select value={connectProvider} disabled={busy || !!replaceId} onChange={e => { setConnectProvider(e.currentTarget.value); setProgress(undefined); }}>{PROVIDERS.map(p => <option value={p.id}>{p.name}</option>)}</select></label><label>Kontoname<input ref={labelRef} value={label} maxLength={40} required disabled={busy || !!replaceId} placeholder="z. B. privat oder studio" onInput={e => setLabel(e.currentTarget.value)} /></label>{keyMode ? <><label>API-Schlüssel<input type="password" value={apiKey} required disabled={busy} autoComplete="off" spellcheck={false} placeholder="sk-or-v1-…" onInput={e => setApiKey(e.currentTarget.value)} /></label><div class="cx-login-explainer"><Glyph name="key" size={18} /><div><strong>Schlüssel bleibt auf diesem Mac</strong><span>Erstelle ihn unter <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>. Cortex prüft ihn einmal bei OpenRouter und legt ihn im Schlüsselbund ab — nicht in Einstellungen oder Dateien.</span></div></div></> : <><label>E-Mail des gewünschten Kontos <span class="cx-optional">optional</span><input type="email" value={email} disabled={busy} placeholder="name@firma.de" onInput={e => setEmail(e.currentTarget.value)} /></label><div class="cx-label-presets"><button type="button" disabled={busy} class={label === 'privat' ? 'active' : ''} onClick={() => setLabel('privat')}>Privat</button><button type="button" disabled={busy} class={label === 'geschäftlich' ? 'active' : ''} onClick={() => setLabel('geschäftlich')}>Geschäftlich</button></div><div class="cx-login-explainer"><Glyph name="globe" size={18} /><div><strong>Anmeldung im Browser</strong><span>Wähle beim Anbieter dein Konto. Anschließend zeigt Cortex die erkannte E-Mail zur Bestätigung. Mit einer E-Mail oben prüfen wir zusätzlich, ob sie übereinstimmt.</span></div></div></>}{progress && <div class={`cx-connection-feedback ${progress.state}`} role={progress.state === 'error' ? 'alert' : 'status'}>{progress.message}</div>}{progress?.url && progress.state === 'connecting' && <a class="cx-oauth-link" href={progress.url} target="_blank" rel="noreferrer"><Glyph name="globe" size={14} />Anmeldung im Browser öffnen</a>}{progress?.state === 'review' ? <div class="cx-identity-confirm"><div><Glyph name="check" size={18} /><strong>{progress.identity}</strong><span>Dieses Konto mit „{label}“ verbinden?</span></div><button type="button" class="cx-primary cx-full" onClick={() => confirm(true)}>Ja, dieses Konto verbinden<Glyph name="check" size={14} /></button><button type="button" class="cx-secondary cx-full" onClick={() => confirm(false)}>Anderes Konto auswählen</button></div> : progress?.state === 'connected' ? <button type="button" class="cx-primary cx-full" onClick={close}><Glyph name="check" size={15} />Fertig</button> : keyMode ? <button class="cx-primary cx-full" disabled={busy || !label.trim() || !apiKey.trim()}>{busy ? <><span class="cx-spinner" />Schlüssel wird geprüft …</> : <>Schlüssel prüfen und speichern<Glyph name="check" size={15} /></>}</button> : <button class="cx-primary cx-full" disabled={busy || !label.trim()}>{busy ? <><span class="cx-spinner" />Warte auf Browser-Anmeldung …</> : <>Beim Anbieter anmelden<Glyph name="arrow" size={15} /></>}</button>}{busy && !keyMode && <button type="button" class="cx-secondary cx-full" onClick={close}>Abbrechen</button>}</form></section></div>}
  </div>;
}

const usd = (v: number) => v < 1 ? v.toLocaleString('de-DE', { maximumFractionDigits: 3 }) : v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
function priceLabel(m?: OpenRouterModel): string {
  if (!m) return 'nicht mehr bei OpenRouter gelistet';
  if (m.free) return 'kostenlos';
  if (m.promptPerMillion === undefined || m.completionPerMillion === undefined) return m.id;
  return `${usd(m.promptPerMillion)} $ / ${usd(m.completionPerMillion)} $ je Mio. Token`;
}

/** Welche OpenRouter-Modelle im Modellmenü stehen — hinzufügen per Suche, entfernen per x. */
function OpenRouterModels() {
  const [data, setData] = useState<{ models: OpenRouterModel[]; favorites: string[]; defaultModel?: string }>();
  const [query, setQuery] = useState('');
  useEffect(() => {
    const onMessage = (e: MessageEvent<HostToWebview>) => { if (e.data.kind === 'openRouterCatalog') setData({ models: e.data.models, favorites: e.data.favorites, defaultModel: e.data.defaultModel }); };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ kind: 'getOpenRouterCatalog' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const models = data?.models ?? [];
  const favorites = data?.favorites ?? [];
  const byId = new Map(models.map(m => [m.id, m]));
  const defaultModel = data?.defaultModel;
  const save = (ids: string[]) => { setData({ models, favorites: ids, defaultModel }); vscode.postMessage({ kind: 'setOpenRouterFavorites', ids }); };
  const chooseDefault = (id: string) => { setData({ models, favorites, defaultModel: id || undefined }); vscode.postMessage({ kind: 'setOpenRouterDefault', id: id || undefined }); };
  const defaultChoices = defaultModel && !favorites.includes(defaultModel) ? [defaultModel, ...favorites] : favorites;
  const q = query.trim().toLowerCase();
  const hits = q ? models.filter(m => !favorites.includes(m.id) && (m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q))).slice(0, 8) : [];
  // Ohne geladene Liste lässt sich eine ID trotzdem von Hand eintragen.
  const manual = q.includes('/') && !byId.has(q) && !favorites.includes(q) ? query.trim() : undefined;
  const add = (id: string) => { save([...favorites, id]); setQuery(''); };
  return <div class="cx-or-models">
    <ul class="cx-or-list cx-or-default"><li><Glyph name="star" size={13} /><span><b>Standardmodell</b><small>Antwortet, wenn Chat oder Agent kein eigenes Modell nennen</small></span>
      <label class="cx-or-select"><span class="cx-visually-hidden">Standardmodell für OpenRouter</span><select value={defaultModel ?? ''} onChange={e => chooseDefault(e.currentTarget.value)}>
        <option value="">Kostenloses Modell (automatisch)</option>
        {defaultChoices.map(id => <option key={id} value={id}>{byId.get(id)?.label ?? id}</option>)}
      </select><Glyph name="chevronDown" size={12} /></label></li></ul>
    <div class="cx-or-head"><Glyph name="layers" size={13} /><span>Im Modellmenü</span><small>{favorites.length}</small></div>
    <ul class="cx-or-list">{favorites.map(id => {
      const m = byId.get(id);
      return <li key={id}><Glyph name={m?.free ? 'sparkle' : 'cube'} size={13} /><span><b>{m?.label ?? id}{id === defaultModel && <em class="cx-or-tag"><Glyph name="star" size={10} />Standard</em>}</b><small>{id} · {models.length ? priceLabel(m) : 'Preis wird geladen'}</small></span><button type="button" class="cx-icon" aria-label={`${m?.label ?? id} aus dem Modellmenü entfernen`} onClick={() => save(favorites.filter(f => f !== id))}><Glyph name="close" size={12} /></button></li>;
    })}</ul>
    <label class="cx-or-search"><Glyph name="search" size={13} /><input value={query} placeholder={models.length ? `In ${models.length} Modellen suchen …` : 'Modell-ID, z. B. openai/gpt-5.6-terra'} onInput={e => setQuery(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const first = hits[0]?.id ?? manual; if (first) add(first); } }} /></label>
    {(hits.length > 0 || manual) && <ul class="cx-or-list hits">
      {hits.map(m => <li key={m.id}><button type="button" onClick={() => add(m.id)}><Glyph name="plus" size={12} /><span><b>{m.label}</b><small>{m.id} · {priceLabel(m)}</small></span></button></li>)}
      {manual && !hits.length && <li><button type="button" onClick={() => add(manual)}><Glyph name="plus" size={12} /><span><b>{manual}</b><small>Von Hand hinzufügen</small></span></button></li>}
    </ul>}
    <p class="cx-or-note"><Glyph name="info" size={12} />Abgerechnet wird über dein OpenRouter-Guthaben. Die Zweitmeinung nutzt nur kostenlose Modelle.</p>
  </div>;
}
