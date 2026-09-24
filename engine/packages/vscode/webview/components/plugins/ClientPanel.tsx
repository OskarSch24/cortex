import { useEffect, useState } from 'preact/hooks';
import type { PluginEntry } from '../../../../core/src/plugins/catalog.js';
import { type PluginState } from '../../../../core/src/plugins/installed.js';
import { maskClientId, OAUTH_PROVIDERS, ownClientRedirect } from '../../../../core/src/mcp/oauthClient.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';
import { PluginSection } from './PluginSection.js';

/**
 * Der eigene OAuth-Client: als Datei — so wie Google sie herunterlädt — oder aus
 * zwei Feldern. Die Datei liest der Host; auf der Seite erscheint danach nur,
 * woran man den Client wiedererkennt, nie das Secret.
 */
export function ClientPanel({ entry, state, busy }: { entry: PluginEntry; state: PluginState; busy: boolean }) {
  const post = (msg: Parameters<typeof vscode.postMessage>[0]) => vscode.postMessage(msg);
  const [replacing, setReplacing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hover, setHover] = useState(false);
  const provider = entry.requires?.client?.provider ? OAUTH_PROVIDERS[entry.requires.client.provider] : undefined;
  const consoleUrl = entry.requires?.url ?? provider?.console;
  const showForm = !state.client || replacing;

  // Aus dem Finder gezogen: die Workbench schickt nur den Pfad, gelesen wird im
  // Host. Wer eine Datei auf diese Seite zieht, meint den Client — auch wenn
  // schon einer hinterlegt ist; deshalb lauscht der Abschnitt, solange er steht.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const msg = event.data as { kind?: string; paths?: string[]; active?: boolean };
      if (msg?.kind === 'dropHover') setHover(!!msg.active);
      if (msg?.kind !== 'attachments' || !msg.paths?.length) return;
      setHover(false);
      const file = msg.paths.find((path) => /\.json$/i.test(path)) ?? msg.paths[0]!;
      post({ kind: 'pluginClientFile', id: entry.id, path: file });
      setReplacing(false);
    };
    // Ein abgebrochenes Ziehen meldet nie „vorbei“; eine Mausbewegung heißt: kein Ziehen mehr.
    const settle = () => setHover(false);
    window.addEventListener('message', listen);
    window.addEventListener('mousemove', settle, { passive: true });
    return () => {
      window.removeEventListener('message', listen);
      window.removeEventListener('mousemove', settle);
    };
  }, [entry.id]);

  return (
    <PluginSection wrap title="OAuth-Client">
      {state.client && (
        <div class="cx-plugin-client">
          <span class="cx-plugin-status-icon ok" aria-hidden="true">
            <Glyph name="check" size={13} />
          </span>
          <span class="cx-plugin-text">
            <strong>{maskClientId(state.client.clientId)}</strong>
            <small>
              {[
                state.client.fileName ? `aus ${state.client.fileName}` : 'von Hand eingetragen',
                state.client.projectId && `Projekt ${state.client.projectId}`,
                state.client.hasSecret ? 'mit Secret' : 'ohne Secret',
              ]
                .filter(Boolean)
                .join(' · ')}
            </small>
          </span>
          <button class="cx-plugin-link" onClick={() => setReplacing((v) => !v)}>
            {replacing ? 'Behalten' : 'Ersetzen'}
          </button>
          <button class="cx-plugin-link" disabled={busy} onClick={() => post({ kind: 'clearPluginClient', id: entry.id })}>
            Entfernen
          </button>
        </div>
      )}

      {showForm && (
        <>
          <button
            class={`cx-plugin-drop ${hover ? 'hover' : ''}`}
            disabled={busy}
            onClick={() => post({ kind: 'pickPluginClientFile', id: entry.id })}
          >
            <Glyph name="plus" size={15} />
            <span>
              <strong>JSON-Datei auswählen</strong>
              <small>oder hierher ziehen — etwa „client_secret_….json“ aus der {provider?.label ?? 'Anbieter'}-Konsole</small>
            </span>
          </button>

          <form
            class="cx-plugin-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (!clientId.trim()) return;
              post({ kind: 'setPluginClient', id: entry.id, clientId, clientSecret });
              setClientId('');
              setClientSecret('');
              setReplacing(false);
            }}
          >
            <p class="cx-plugin-or">oder von Hand</p>
            <label class="cx-plugin-field">
              <span>Client-ID</span>
              <input
                type="text"
                autoComplete="off"
                spellcheck={false}
                aria-label="Client-ID"
                placeholder={provider ? '….apps.googleusercontent.com' : 'Client-ID'}
                value={clientId}
                onInput={(e) => setClientId(e.currentTarget.value)}
              />
            </label>
            <label class="cx-plugin-field">
              <span>Client-Secret</span>
              <input
                type="password"
                autoComplete="off"
                spellcheck={false}
                aria-label="Client-Secret"
                placeholder="Client-Secret"
                value={clientSecret}
                onInput={(e) => setClientSecret(e.currentTarget.value)}
              />
            </label>
            <div class="cx-plugin-field-actions">
              <span class="cx-plugin-grow" />
              <button type="submit" class="cx-plugin-pill" disabled={busy || !clientId.trim()}>
                {state.installed ? 'Speichern und anmelden' : 'Speichern'}
              </button>
            </div>
          </form>
        </>
      )}

      <div class="cx-plugin-redirect">
        <span>Rückrufadresse</span>
        <code>{ownClientRedirect(entry.requires?.client?.redirectHost)}</code>
        <button class="cx-plugin-link" onClick={() => post({ kind: 'copyPluginRedirect', id: entry.id })}>
          <Glyph name="link" size={12} />
          Kopieren
        </button>
      </div>
      <p class="cx-plugin-empty">
        {entry.requires?.hint}{' '}
        {provider
          ? 'Bei einer Desktop-App erlaubt Google jede lokale Rückrufadresse — dort musst du nichts eintragen.'
          : 'Trage diese Rückrufadresse in der App beim Anbieter ein.'}{' '}
        Client und Anmeldung liegen im macOS-Schlüsselbund.
        {consoleUrl && (
          <>
            {' '}
            <button class="cx-plugin-link" onClick={() => post({ kind: 'openExternal', url: consoleUrl })}>
              Zur Konsole
              <Glyph name="arrow" size={12} />
            </button>
          </>
        )}
      </p>
    </PluginSection>
  );
}
