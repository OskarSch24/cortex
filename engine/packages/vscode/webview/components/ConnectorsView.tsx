import { useEffect, useState } from 'preact/hooks';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

type Connectors = Extract<HostToWebview, { kind: 'connectors' }>;

/**
 * Konnektoren sind MCP-Server: einmal beschrieben, in jedes Anbieterprofil
 * gespiegelt. Genau das war bisher unsichtbar — die Datei ließ sich öffnen,
 * aber niemand sah, ob eine Definition auch bei Claude, Codex und Grok ankommt.
 * Der Bericht je Konto ist deshalb der Kern dieser Ansicht, nicht die Liste.
 */
export function ConnectorsView() {
  const [state, setState] = useState<Connectors>();
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const listen = (event: MessageEvent<HostToWebview>) => {
      if (event.data?.kind === 'connectors') { setState(event.data); setSyncing(false); }
    };
    window.addEventListener('message', listen);
    vscode.postMessage({ kind: 'getConnectors' });
    return () => window.removeEventListener('message', listen);
  }, []);

  const sync = () => { setSyncing(true); vscode.postMessage({ kind: 'syncConnectors' }); };
  const servers = state?.servers ?? [];

  return (
    <section class="cx-connectors">
      <div class="cx-connectors-head">
        <div>
          <h2>Konnektoren</h2>
          <p>Einmal beschrieben, in jedes Anbieterprofil gespiegelt — Claude, Codex und Grok.</p>
        </div>
        <div class="cx-connectors-actions">
          <button class="cx-secondary" onClick={() => vscode.postMessage({ kind: 'editConnectors' })}>
            <Glyph name="edit" size={13} />{state?.path ? 'Bearbeiten' : 'Anlegen'}
          </button>
          <button class="cx-primary" disabled={!servers.length || syncing} onClick={sync}>
            <Glyph name="refresh" size={13} />{syncing ? 'Überträgt …' : 'In Profile übertragen'}
          </button>
        </div>
      </div>

      {state?.error && <p class="cx-connectors-error" role="alert">Datei nicht lesbar: {state.error}</p>}

      {!state?.path && !state?.error && (
        <p class="cx-connectors-empty">
          Noch keine Konnektoren. „Anlegen“ schreibt eine Vorlage mit erklärtem Format.
        </p>
      )}

      {servers.length > 0 && (
        <ul class="cx-connector-list">
          {servers.map(server => (
            <li key={server.name}>
              <Glyph name={server.remote ? 'globe' : 'terminal'} size={15} />
              <div>
                <strong>{server.name}</strong>
                <small title={server.target}>{server.target}</small>
              </div>
              <span class="cx-connector-kind">{server.remote ? 'entfernt' : 'lokal'}</span>
              {server.providers && <span class="cx-connector-scope">nur {server.providers.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}

      {state?.accounts && state.accounts.length > 0 && servers.length > 0 && (
        <div class="cx-connector-targets">
          {state.accounts.map(account => (
            <span key={`${account.provider}:${account.label}`} class={account.error ? 'failed' : ''} title={account.error}>
              <Glyph name={account.error ? 'close' : 'check'} size={12} />
              {account.provider}:{account.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
