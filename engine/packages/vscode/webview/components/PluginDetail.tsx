import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { PluginEntry } from '../../../core/src/plugins/catalog.js';
import { pluginFields, usesAgentLogin, usesLogin, type PluginState, type PluginStatus } from '../../../core/src/plugins/installed.js';
import { maskClientId, OAUTH_PROVIDERS, ownClientRedirect } from '../../../core/src/mcp/oauthClient.js';
import { CATEGORY_LABEL } from '../../../core/src/plugins/catalog.js';
import type { PluginLiveState, PluginScope } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { PluginMark } from './pluginIcons.js';

/**
 * Die Produktseite eines Plugins.
 *
 * Sie sagt drei Dinge auseinander, die auf Marktplatzseiten gern verschwimmen:
 * was der Eintrag *ist* (Beschreibung, Beispiele), was auf diesem Mac *wirklich
 * eingerichtet ist* (Server in mcp.json, Werte im Schlüsselbund, Skills auf der
 * Platte), und ob er *tatsächlich antwortet* — das letzte mit dem Beleg der
 * letzten Prüfung, nicht als bloßer grüner Haken.
 */
export function PluginDetail({
  entry,
  state,
  status,
  login,
  scope,
  busy,
  onBack,
  onInstall,
  onUninstall,
  onPrompt,
  onOpen,
  variants = [],
  shadowed = false,
}: {
  entry: PluginEntry;
  state: PluginState;
  status: PluginStatus;
  /** Alle Zugänge desselben Dienstes, dieser eingeschlossen. */
  variants?: Array<{ entry: PluginEntry; status: PluginStatus }>;
  /** Die Projektdatei überschreibt diesen Server aus der persönlichen. */
  shadowed?: boolean;
  login?: PluginLiveState['logins'][string];
  scope: PluginScope;
  busy: boolean;
  onBack: () => void;
  onInstall: (values?: Record<string, string>) => void;
  onUninstall: () => void;
  onPrompt: (text: string) => void;
  /** Einen anderen Zugang desselben Dienstes zeigen. */
  onOpen?: (id: string) => void;
}) {
  const target = entry.definition.url ?? [entry.definition.command, ...(entry.definition.args ?? [])].filter(Boolean).join(' ');
  const fields = pluginFields(entry);
  // Leer beginnt jede Produktseite, weil die Übersicht sie je Eintrag mit eigenem
  // `key` einhängt — ein Effekt, der nach dem Zeichnen leert, verschluckte
  // Zeichen, die schneller getippt wurden, als er lief.
  const [values, setValues] = useState<Record<string, string>>({});

  const filled = (env: string) => !!values[env]?.trim() || state.provided.includes(env);
  const complete = fields.every((f) => f.optional || filled(f.env));
  const typed = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
  const post = (msg: Parameters<typeof vscode.postMessage>[0]) => vscode.postMessage(msg);
  const oauth = usesLogin(entry) || usesAgentLogin(entry);
  const ownClient = entry.requires?.kind === 'oauth-client';

  const installLabel = oauth && !(ownClient && !state.client) ? 'Anmelden und installieren' : 'Plugin installieren';
  // Vor dem Eintragen wird angemeldet und geprüft — auch das gehört sichtbar auf die Seite.
  const connecting = !state.installed && (!!login || state.connection?.status === 'pruefe');

  return (
    <div class="cx-plugin-detail">
      <div class="cx-plugin-detail-top">
        <PluginMark icon={entry.icon} name={entry.name} size="lg" />
      </div>

      <div class="cx-plugin-detail-head">
        <div>
          <h1>{entry.name}</h1>
          <p>{entry.tagline}</p>
        </div>
        <div class="cx-plugin-actions">
          <button
            class="cx-icon"
            title="Serverdefinition kopieren"
            aria-label="Serverdefinition kopieren"
            onClick={() => post({ kind: 'copyPluginDefinition', id: entry.id })}
          >
            <Glyph name="link" size={15} />
          </button>
          {state.installed ? (
            <button disabled={busy} onClick={onUninstall}>
              <Glyph name="trash" size={14} />
              {busy ? 'Einen Moment …' : 'Entfernen'}
            </button>
          ) : (
            <button
              class="primary"
              disabled={busy || connecting || !complete}
              title={complete ? undefined : 'Erst die Pflichtfelder unten ausfüllen'}
              onClick={() => onInstall(Object.keys(typed).length ? typed : undefined)}
            >
              <Glyph name="plus" size={15} />
              {busy || connecting ? 'Einen Moment …' : installLabel}
            </button>
          )}
        </div>
      </div>

      {/* Ein Dienst, mehrere Zugänge — wie in Claude und Codex: die Wahl steht
          in der Karte, nicht als zweiter Katalogeintrag. Jeder Zugang zeigt,
          wie es um ihn steht, damit man sieht, welcher schon läuft. */}
      {variants.length > 1 && (
        <div class="cx-plugin-variants">
          <div class="cx-plugin-scope" role="tablist" aria-label="Zugang">
            {variants.map((variant) => (
              <button
                key={variant.entry.id}
                role="tab"
                aria-selected={variant.entry.id === entry.id}
                onClick={() => onOpen?.(variant.entry.id)}
              >
                {variant.status.kind === 'verbunden' && <i class="cx-plugin-dot ok" aria-hidden="true" />}
                {variant.status.kind === 'fehler' && <i class="cx-plugin-dot bad" aria-hidden="true" />}
                {variant.entry.variantLabel ?? variant.entry.name}
              </button>
            ))}
          </div>
          {entry.variantHint && <p>{entry.variantHint}</p>}
        </div>
      )}

      {(state.installed || connecting) && (
        <ConnectionPanel entry={entry} state={state} status={status} login={login} busy={busy} onUninstall={onUninstall} onOpen={onOpen} />
      )}

      {shadowed && (
        <p class="cx-plugin-empty">Die Projektdatei hat einen eigenen Eintrag „{entry.server}“ — der gilt vor deinem persönlichen.</p>
      )}

      {(state.needsOwnClient || state.client) && <ClientPanel entry={entry} state={state} busy={busy} />}

      {fields.length > 0 && (
        <Section title="Zugangsdaten">
          <form
            class="cx-plugin-fields"
            onSubmit={(e) => {
              e.preventDefault();
              if (!complete) return;
              if (state.installed) {
                post({ kind: 'setPluginValues', id: entry.id, values: typed });
                setValues({});
              } else {
                onInstall(typed);
              }
            }}
          >
            {fields.map((field) => {
              const stored = state.provided.includes(field.env);
              return (
                <label key={field.env} class="cx-plugin-field">
                  <span>
                    {field.label}
                    {field.optional && <em> · optional</em>}
                  </span>
                  <input
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    spellcheck={false}
                    name={field.env}
                    aria-label={field.label}
                    placeholder={stored ? 'Hinterlegt — leer lassen, um ihn zu behalten' : (field.placeholder ?? `${field.label} einfügen`)}
                    value={values[field.env] ?? ''}
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setValues((prev) => ({ ...prev, [field.env]: value }));
                    }}
                  />
                  <small>
                    <code>{field.env}</code>
                    {stored && (
                      <button
                        type="button"
                        class="cx-plugin-link"
                        onClick={() => post({ kind: 'setPluginValues', id: entry.id, values: { [field.env]: '' } })}
                      >
                        Löschen
                      </button>
                    )}
                  </small>
                </label>
              );
            })}
            <div class="cx-plugin-field-actions">
              {entry.requires?.url && (
                <button
                  type="button"
                  class="cx-plugin-link"
                  onClick={() => post({ kind: 'openExternal', url: entry.requires!.url! })}
                >
                  Wo bekomme ich das?
                  <Glyph name="arrow" size={12} />
                </button>
              )}
              <span class="cx-plugin-grow" />
              <button type="submit" class="cx-plugin-pill" disabled={busy || !complete || (state.installed && !Object.keys(typed).length)}>
                {state.installed ? 'Speichern und prüfen' : 'Speichern und installieren'}
              </button>
            </div>
            <p class="cx-plugin-empty">
              {entry.requires?.hint} Die Werte liegen im macOS-Schlüsselbund, nicht in mcp.json — Cortex setzt sie nur
              in die Profile der CLIs ein.
            </p>
          </form>
        </Section>
      )}

      {entry.prompts.length > 0 && (
        <div class="cx-plugin-banner">
          {entry.prompts.map((prompt) => (
            <button key={prompt} class="cx-plugin-prompt" onClick={() => onPrompt(prompt)}>
              <span>
                <em>{entry.name}</em>
                {prompt}
              </span>
              <span class="cx-icon" aria-hidden="true">
                <Glyph name="arrow" size={13} />
              </span>
            </button>
          ))}
        </div>
      )}

      <p class="cx-plugin-about">{entry.description}</p>

      {state.connection?.status === 'verbunden' && (state.connection.tools?.length ?? 0) > 0 && (
        <Section title="Werkzeuge" count={state.connection.tools!.length}>
          <ul class="cx-plugin-tools">
            {state.connection.tools!.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                {(tool.description || tool.title) && <span>{tool.description ?? tool.title}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="MCP-Server" count={1}>
        <div class="cx-plugin-row">
          <PluginMark icon={entry.icon} name={entry.name} />
          <span class="cx-plugin-text">
            <strong>{entry.server}</strong>
            <small title={target}>{target}</small>
          </span>
        </div>
        <p class="cx-plugin-empty">
          {state.installed
            ? `Steht in der ${scope === 'projekt' ? 'Projektdatei' : 'persönlichen'} mcp.json und wird in jedes Anbieterprofil gespiegelt.`
            : `„${installLabel}“ ${oauth ? 'meldet dich an, ' : ''}prüft, ob der Server antwortet — und schreibt erst dann genau diese Zeile in mcp.json.`}
        </p>
      </Section>

      {entry.skills && entry.skills.length > 0 && (
        <Section title="Skills" count={state.skills.length}>
          {entry.skills.map((name) => {
            const there = state.skills.includes(name);
            return (
              <div class="cx-plugin-row" key={name}>
                <PluginMark icon={entry.icon} name={name} />
                <span class="cx-plugin-text">
                  <strong>{name}</strong>
                  <small>{there ? 'Liegt auf dieser Platte.' : 'Auf diesem Mac nicht gefunden.'}</small>
                </span>
              </div>
            );
          })}
        </Section>
      )}

      {entry.requires?.kind === 'app' && state.appDetail && (
        <div class={`cx-plugin-note ${state.appReady ? 'ok' : ''}`} role="note">
          <Glyph name={state.appReady ? 'check' : 'shield'} size={15} />
          <p>{`${state.appDetail} ${entry.requires.hint}`}</p>
        </div>
      )}

      <Section title="Informationen">
        <dl class="cx-plugin-facts">
          <dt>Entwickler</dt>
          <dd>{entry.developer}</dd>
          <dt>Kategorie</dt>
          <dd>{CATEGORY_LABEL[entry.category]}</dd>
          {entry.version && (
            <>
              <dt>Version</dt>
              <dd>{entry.version}</dd>
            </>
          )}
          <dt>Anbindung</dt>
          <dd>
            {entry.definition.url ? 'Entfernter Server' : 'Lokal gestartet'}
            {ownClient ? ' · eigener OAuth-Client' : oauth ? ' · Anmeldung beim Anbieter' : fields.length ? ' · mit Zugangsdaten' : ''}
          </dd>
          {entry.website && (
            <>
              <dt>Website</dt>
              <dd>
                <a
                  href={entry.website}
                  onClick={(e) => {
                    e.preventDefault();
                    post({ kind: 'openExternal', url: entry.website! });
                  }}
                >
                  {entry.website.replace(/^https?:\/\//, '')}
                  <Glyph name="arrow" size={12} />
                </a>
              </dd>
            </>
          )}
        </dl>
      </Section>

      <button class="cx-plugin-more" onClick={onBack}>
        <Glyph name="back" size={14} />
        Zurück zur Übersicht
      </button>
    </div>
  );
}

/**
 * Der Zustand in einem Satz, mit dem, was sich daran tun lässt. Er steht oben,
 * weil er die Frage beantwortet, deretwegen man die Seite öffnet: geht es?
 */
const PROVIDER_NAME: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' };

function ConnectionPanel({
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
  const at = connection?.checkedAt ? time(connection.checkedAt) : undefined;

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
                    <strong>{PROVIDER_NAME[cli.provider] ?? cli.provider} · {cli.label}</strong>
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

/**
 * Der eigene OAuth-Client: als Datei — so wie Google sie herunterlädt — oder aus
 * zwei Feldern. Die Datei liest der Host; auf der Seite erscheint danach nur,
 * woran man den Client wiedererkennt, nie das Secret.
 */
function ClientPanel({ entry, state, busy }: { entry: PluginEntry; state: PluginState; busy: boolean }) {
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
    <Section title="OAuth-Client">
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
    </Section>
  );
}

const time = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ComponentChildren;
}) {
  return (
    <section class="cx-plugin-section">
      <div class="cx-plugin-section-head">
        <h2>{title}</h2>
        {count !== undefined && <b>{count}</b>}
      </div>
      <div>{children}</div>
    </section>
  );
}
