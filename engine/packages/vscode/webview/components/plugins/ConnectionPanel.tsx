import type { PluginEntry } from '../../../../core/src/plugins/catalog.js';
import { usesAgentLogin, usesLogin, type PluginState, type PluginStatus } from '../../../../core/src/plugins/installed.js';
import type { PluginLiveState } from '../../../src/panel/protocol.js';
import { clockTime } from '../../format/time.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';

/** Die Anbieter-Clients, in die ein Plugin eingetragen wird — nicht die Chat-Anbieter aus brandIcons. */
const CLI_PROVIDER_NAME: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' };

/**
 * Der Zustand in einem Satz, mit dem, was sich daran tun lässt. Er steht oben,
 * weil er die Frage beantwortet, deretwegen man die Seite öffnet: geht es?
 */
export function ConnectionPanel({
  entry,
  state,
  status,
  login: liveLogin,
  busy,
  onUninstall,
  onOpen,
}: {
  entry: PluginEntry;
  state: PluginState;
  status: PluginStatus;
  login?: PluginLiveState['logins'][string];
  busy: boolean;
  onUninstall: () => void;
  onOpen?: (id: string) => void;
}) {
  const post = (msg: Parameters<typeof vscode.postMessage>[0]) => vscode.postMessage(msg);
  const oauth = usesLogin(entry) || usesAgentLogin(entry);
  const connection = state.connection;
  // Anmeldung über die CLIs: jedes Konto hat seine eigene Zeile. Eine Anmeldung,
  // die nur einem Konto gilt, steht in dieser Zeile, nicht im Kopf der Karte.
  const agents = usesAgentLogin(entry) && state.installed ? connection?.clis ?? [] : [];
  const accountLogin = agents.length && liveLogin?.account ? liveLogin : undefined;
  const login = accountLogin ? undefined : liveLogin;
  const at = connection?.checkedAt ? clockTime(connection.checkedAt) : undefined;

  let tone: 'ok' | 'bad' | 'wait' | 'todo' = 'todo';
  let title: string;
  let text: string | undefined;
  if (login) {
    tone = 'wait';
    title = login.step === 'browser' ? 'Anmeldung im Browser' : 'Anmeldung läuft';
    text = login.message;
  } else if (!state.installed) {
    tone = 'wait';
    title = 'Verbindung wird geprüft …';
    text = `Erst wenn ${entry.name} antwortet, trägt Cortex es in mcp.json ein.`;
  } else if (status.kind === 'verbunden') {
    tone = 'ok';
    title = `Verbunden · ${status.tools} ${status.tools === 1 ? 'Werkzeug' : 'Werkzeuge'}`;
    const server = connection?.server;
    text = [
      at && `Zuletzt geprüft um ${at}`,
      server?.name && `Server ${server.title ?? server.name}${server.version ? ` ${server.version}` : ''}`,
      'Neue Chats laden das Plugin beim nächsten Zug.',
    ]
      .filter(Boolean)
      .join(' · ');
  } else if (status.kind === 'ersetzt') {
    tone = 'ok';
    title = `Über ${status.via} verbunden · ${status.tools} ${status.tools === 1 ? 'Werkzeug' : 'Werkzeuge'}`;
    text = `Dieser Zugang ist zusätzlich eingetragen, aber nicht eingerichtet. Du brauchst ihn nur, wenn du ${entry.name} auch so nutzen willst — sonst kannst du ihn entfernen.`;
  } else if (status.kind === 'aus') {
    title = 'Ausgeschaltet';
    text = 'Steht weiter in mcp.json, Schlüssel und Anmeldung bleiben — nur geht der Server in kein Profil, bis du ihn einschaltest.';
  } else if (status.kind === 'ungeprueft') {
    title = 'Noch nicht geprüft';
    text =
      entry.requires?.kind === 'app'
        ? `${entry.name} fragt beim ersten Zugriff selbst nach. Deshalb prüft Cortex erst, wenn du es sagst — öffne ${entry.name} vorher.`
        : 'Cortex hat diesen Server noch nicht gestartet.';
  } else if (status.kind === 'pruefe') {
    tone = 'wait';
    title = 'Verbindung wird geprüft …';
    text = entry.definition.command === 'npx' ? 'Beim ersten Mal lädt npx das Paket herunter — das kann eine Minute dauern.' : undefined;
  } else if (status.kind === 'fehler') {
    tone = 'bad';
    title = 'Antwortet nicht';
    text = [status.message, at && `geprüft um ${at}`].filter(Boolean).join(' · ');
  } else if (status.kind === 'einrichtung') {
    title = status.label;
    text =
      status.reason === 'schluessel'
        ? 'Ohne die Werte unten startet der Server nicht.'
        : status.reason === 'client'
          ? `${entry.name} meldet dich mit einer eigenen App beim Anbieter an. Lege sie unten an — mit der JSON-Datei oder Client-ID und Secret.`
        : status.reason === 'app'
          ? (connection?.notice
            ? `Der Server antwortet, aber Xcode verweigert Aufrufe, bis du den Agenten freigibst: in Xcode ein Projekt öffnen und die Nachfrage bestätigen (Einstellungen › Intelligence).`
            : state.appDetail)
          : usesAgentLogin(entry)
            ? `${connection?.message ?? 'Noch nicht angemeldet.'} ${entry.requires?.hint ?? ''}`.trim()
          : state.oauth?.expired
            ? 'Die Anmeldung ist abgelaufen und ließ sich nicht auffrischen.'
            : connection?.status === 'anmeldung'
              ? `Der Anbieter hat den Zugang abgelehnt${at ? ` (${at})` : ''}.`
              : 'Der Anbieter verlangt eine Anmeldung. Sie öffnet sich in deinem Browser.';
  } else {
    title = 'Nicht installiert';
  }

  return (
    <div class={`cx-plugin-status ${tone}`} role="status">
      <span class="cx-plugin-status-icon" aria-hidden="true">
        {tone === 'wait' ? <i class="cx-plugin-spin" /> : <Glyph name={tone === 'ok' ? 'check' : tone === 'bad' ? 'close' : 'shield'} size={14} />}
      </span>
      <div class="cx-plugin-status-text">
        <strong>{title}</strong>
        {text && <p>{text}</p>}
        {!login && status.kind === 'fehler' && connection?.detail && <pre>{connection.detail}</pre>}
        {agents.length > 0 && (
          <ul class="cx-plugin-accounts" aria-label="Konten">
            {agents.map((cli) => {
              const running = accountLogin?.account === cli.account ? accountLogin : undefined;
              const grok = cli.provider === 'grok';
              const ok = cli.state === 'verbunden';
              return (
                <li key={`${cli.provider}:${cli.account ?? cli.label}`} class={running ? 'laeuft' : cli.state}>
                  <span class="cx-plugin-account-mark" aria-hidden="true">
                    {running ? <i class="cx-plugin-spin" /> : <Glyph name={ok ? 'check' : cli.state === 'eingetragen' ? 'link' : 'close'} size={12} />}
                  </span>
                  <div class="cx-plugin-account-text">
                    <strong>{CLI_PROVIDER_NAME[cli.provider] ?? cli.provider} · {cli.label}</strong>
                    <small title={running ? running.message : cli.detail}>{running ? running.message : cli.detail}</small>
                  </div>
                  <div class="cx-plugin-account-actions">
                    {running ? (
                      <>
                        {running.url && <button onClick={() => post({ kind: 'openExternal', url: running.url! })}>Browser erneut öffnen</button>}
                        {!grok && <button onClick={() => post({ kind: 'cancelPluginLogin', id: entry.id })}>Abbrechen</button>}
                      </>
                    ) : (
                      cli.account && (
                        <button
                          class={ok ? undefined : 'primary'}
                          disabled={busy || !!liveLogin}
                          title={grok ? 'Fragt Grok einmal kurz (ein Modellaufruf) — ruft nichts in Figma auf.' : undefined}
                          onClick={() => post({ kind: 'loginPlugin', id: entry.id, account: cli.account })}
                        >
                          {grok ? (ok ? 'Erneut prüfen' : 'Prüfen') : ok ? 'Neu verbinden' : 'Verbinden'}
                        </button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!agents.length && !login && status.kind === 'verbunden' && connection?.clis && connection.clis.length > 0 && (
          <ul class="cx-plugin-clis" aria-label="In den CLIs">
            {connection.clis.map((cli) => (
              <li key={`${cli.provider}:${cli.label}`} class={cli.state} title={cli.detail}>
                <Glyph name={cli.state === 'verbunden' ? 'check' : cli.state === 'eingetragen' ? 'link' : 'close'} size={11} />
                {cli.provider}:{cli.label}
                <small>{cli.state === 'verbunden' ? 'sieht ihn' : cli.state === 'eingetragen' ? 'eingetragen' : cli.state === 'fehlt' ? 'fehlt' : 'Fehler'}</small>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div class="cx-plugin-status-actions">
        {!state.installed && !login ? null : login ? (
          <>
            {login.url && (
              <button onClick={() => post({ kind: 'openExternal', url: login.url! })}>Browser erneut öffnen</button>
            )}
            <button onClick={() => post({ kind: 'cancelPluginLogin', id: entry.id })}>Abbrechen</button>
          </>
        ) : (
          <>
            {oauth && !agents.length && status.kind === 'einrichtung' && status.reason === 'anmeldung' && (
              <button class="primary" disabled={busy} onClick={() => post({ kind: 'loginPlugin', id: entry.id })}>
                {status.label}
              </button>
            )}
            {status.kind === 'ersetzt' && (
              <>
                <button disabled={busy} onClick={() => onOpen?.(status.viaId)}>
                  Zu „{status.via}“
                </button>
                <button disabled={busy} onClick={onUninstall}>
                  <Glyph name="trash" size={13} />
                  Zugang entfernen
                </button>
              </>
            )}
            {status.kind === 'ungeprueft' && (
              <button class="primary" disabled={busy} onClick={() => post({ kind: 'checkServer', server: entry.server })}>
                Jetzt prüfen
              </button>
            )}
            {(status.kind === 'verbunden' || status.kind === 'fehler') && (
              <button disabled={busy} onClick={() => post({ kind: 'checkServer', server: entry.server })}>
                <Glyph name="refresh" size={13} />
                Erneut prüfen
              </button>
            )}
            {(connection?.log || status.kind === 'fehler') && (
              <button disabled={busy} onClick={() => post({ kind: 'showPluginLog', server: entry.server })}>
                Protokoll
              </button>
            )}
            {status.kind === 'aus' ? (
              <button class="primary" disabled={busy} onClick={() => post({ kind: 'setPluginEnabled', server: entry.server, enabled: true })}>
                Einschalten
              </button>
            ) : (
              status.kind !== 'ersetzt' && (
                <button disabled={busy} onClick={() => post({ kind: 'setPluginEnabled', server: entry.server, enabled: false })}>
                  Ausschalten
                </button>
              )
            )}
            {oauth && state.oauth && !state.oauth.expired && (
              <button disabled={busy} onClick={() => post({ kind: 'logoutPlugin', id: entry.id })}>
                Abmelden
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
