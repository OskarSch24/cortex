import { useState } from 'preact/hooks';
import type { PluginEntry } from '../../../../core/src/plugins/catalog.js';
import { pluginFields, usesAgentLogin, usesLogin, type PluginState, type PluginStatus } from '../../../../core/src/plugins/installed.js';
import { CATEGORY_LABEL } from '../../../../core/src/plugins/catalog.js';
import type { PluginLiveState, PluginScope } from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';
import { PluginSection } from './PluginSection.js';
import { PluginMark } from '../pluginIcons.js';
import { ClientPanel } from './ClientPanel.js';
import { ConnectionPanel } from './ConnectionPanel.js';

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
        <PluginSection wrap title="Zugangsdaten">
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
        </PluginSection>
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
        <PluginSection wrap title="Werkzeuge" count={state.connection.tools!.length}>
          <ul class="cx-plugin-tools">
            {state.connection.tools!.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                {(tool.description || tool.title) && <span>{tool.description ?? tool.title}</span>}
              </li>
            ))}
          </ul>
        </PluginSection>
      )}

      <PluginSection wrap title="MCP-Server" count={1}>
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
      </PluginSection>

      {entry.skills && entry.skills.length > 0 && (
        <PluginSection wrap title="Skills" count={state.skills.length}>
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
        </PluginSection>
      )}

      {entry.requires?.kind === 'app' && state.appDetail && (
        <div class={`cx-plugin-note ${state.appReady ? 'ok' : ''}`} role="note">
          <Glyph name={state.appReady ? 'check' : 'shield'} size={15} />
          <p>{`${state.appDetail} ${entry.requires.hint}`}</p>
        </div>
      )}

      <PluginSection wrap title="Informationen">
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
      </PluginSection>

      <button class="cx-plugin-more" onClick={onBack}>
        <Glyph name="back" size={14} />
        Zurück zur Übersicht
      </button>
    </div>
  );
}
