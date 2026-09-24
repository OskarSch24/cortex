import { useMemo, useState } from 'preact/hooks';
import {
  CATEGORY_LABEL,
  PLUGIN_CATEGORIES,
  searchCatalog,
  type PluginCategory,
  type PluginEntry,
} from '../../../core/src/plugins/catalog.js';
import { needsAttention, serviceKey, type PluginStatus } from '../../../core/src/plugins/installed.js';
import { pluginOverview, statusHint } from './pluginOverview.js';
import type { PluginScopeState } from '../../src/panel/protocol.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { PluginSection } from './plugins/PluginSection.js';
import { CatalogSection } from './plugins/CatalogSection.js';
import { InstalledSection, type InstalledTile } from './plugins/InstalledSection.js';
import { PluginToast } from './plugins/PluginToast.js';
import { ProfilesSection } from './plugins/ProfilesSection.js';
import { TemplatesTab } from './plugins/TemplatesTab.js';
import { usePluginsHost } from './plugins/usePluginsHost.js';
import { CATALOG } from './pluginCatalog.js';
import { PluginDetail } from './PluginDetail.js';
import { PluginMark } from './pluginIcons.js';

/** Ein Abschnitt der Übersicht — entweder eine Kategorie oder eine Auswahl. */
export type SectionId = PluginCategory | 'featured' | 'popular' | 'fresh';

/**
 * Wo man innerhalb der Plugins steht. Der Zustand liegt bewusst *außen*, in
 * `AgentApp`: nur dort kann er in denselben Verlauf wie ein Seitenwechsel, und
 * nur dann führen die Pfeile oben links auch aus einer Produktseite zurück.
 */
export type PluginView =
  | { kind: 'overview' }
  | { kind: 'category'; id: SectionId }
  | { kind: 'detail'; id: string };

const SECTION_LABEL: Record<'featured' | 'popular' | 'fresh', string> = {
  featured: 'Wichtige Plugins',
  popular: 'Beliebt',
  fresh: 'Neu und bemerkenswert',
};


/**
 * Plugins: ein Katalog zum Entdecken über dem, was auf diesem Mac wirklich
 * eingerichtet ist.
 *
 * Der Aufbau folgt der vermessenen Codex-Referenz (728 px Spalte, zwei Spalten
 * à 344 px, 68 px Zeilenraster) — die Flächen kommen aus den Cortex-Tokens,
 * damit die Seite neben Konten und Einstellungen nicht fremd wirkt.
 *
 * Der Unterschied zum Vorbild ist inhaltlich: „Installiert“ ist hier keine
 * gemerkte Klickspur, sondern der Inhalt von `.cortex/mcp.json`. Deshalb bleibt
 * auch der Spiegelbericht je Konto stehen — eine Definition, die bei Claude
 * ankommt, aber bei Codex nicht, ist kein halber Erfolg.
 */
export function PluginsView({
  view,
  onView,
  onPrompt,
}: {
  view: PluginView;
  onView: (next: PluginView) => void;
  onPrompt?: (text: string) => void;
}) {
  const [tab, setTab] = useState<'plugins' | 'vorlagen'>('plugins');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<string>();
  const menuRef = useDismissiblePopup<HTMLDivElement>(menu !== undefined, () => setMenu(undefined));
  const { host, templates, scope, setScope, busy, setBusy, toast, setToast, syncing, setSyncing } = usePluginsHost();
  const { effective, servers, stateOf, variantsOf, statusOf, leadOf, cards, installedCards, ownServers: own, serverStatus } = pluginOverview(host);
  const active: PluginScopeState | undefined = host?.scopes.find((s) => s.id === scope) ?? host?.scopes[0];
  const loginOf = (entry: PluginEntry) => host?.logins?.[entry.server];
  // Oben steht, was installiert ist und trotzdem nicht arbeitet — nicht irgendwo
  // in seiner Kategorie, wo man es erst suchen müsste.
  const needsSetup = installedCards.filter((e) => needsAttention(statusOf(e)));

  // Server ohne Katalogeintrag: selbst geschrieben oder eingebaut. Sie bekommen
  // dieselben Zustände — nur ohne Produktseite.
  const builtIn = host?.builtIn;
  const ownServers = own.map((server) => ({
    ...server,
    open: server.builtIn ? () => vscode.postMessage({ kind: 'showDatabaseStudio' as const }) : undefined,
  }));

  /**
   * Eine Kachel je Dienst, dazu die eigenen Server — aber nur, was verbunden
   * ist oder war. Eine offene Einrichtung steht unten unter „Einrichtung
   * offen“, nicht hier: erst verbinden, dann erscheint das Zeichen oben. Ein
   * roter Punkt heißt, dass ein verbundenes Plugin nicht mehr antwortet.
   */
  const installedTiles: InstalledTile[] = [
    ...installedCards.filter((entry) => statusOf(entry).kind !== 'einrichtung').map((entry) => {
      const status = statusOf(entry);
      return {
        key: serviceKey(entry),
        icon: entry.icon,
        name: entry.name,
        hint: `${entry.name} — ${statusHint(status, stateOf(entry.id))}`,
        dot: needsAttention(status),
        open: () => open(entry.id),
      };
    }),
    ...ownServers.filter((server) => serverStatus(server.name).kind !== 'einrichtung').map((server) => {
      const status = serverStatus(server.name);
      return {
        key: server.name,
        icon: server.icon,
        name: server.title,
        hint: `${server.title} — ${statusHint(status)} · ${server.note}`,
        dot: needsAttention(status),
        open: () => document.getElementById(`cx-own-${server.name}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      };
    }),
  ];
  const hits = useMemo(() => (query.trim() ? cards(searchCatalog(CATALOG, query)) : []), [query]);

  const install = (entry: PluginEntry, values?: Record<string, string>) => {
    if (!scope) return;
    // Ein Dienst mit mehreren Zugängen, ein Plugin mit Werten oder eigenem
    // OAuth-Client: „+“ führt zur Produktseite, wo sich das wählen und eintragen
    // lässt — statt zu einem Eintrag, der gleich „Einrichtung abschließen“ sagt.
    const needs =
      variantsOf(entry).length > 1 ||
      (entry.requires?.kind === 'secret' && !values) ||
      (entry.requires?.kind === 'oauth-client' && !stateOf(entry.id).client);
    if (needs) {
      onView({ kind: 'detail', id: entry.id });
      setQuery('');
      return;
    }
    setBusy(entry.id);
    vscode.postMessage({ kind: 'installPlugin', id: entry.id, scope, ...(values ? { values } : {}) });
  };
  const uninstall = (entry: PluginEntry) => {
    const place = effective.origin[entry.server] ?? scope;
    if (!place) return;
    setBusy(entry.id);
    vscode.postMessage({ kind: 'uninstallPlugin', id: entry.id, scope: place });
  };
  const open = (id: string) => {
    onView({ kind: 'detail', id });
    setQuery('');
  };

  /** Der Zustand als Knopf oder Text rechts in einer Zeile. */
  const stateControl = (status: PluginStatus, actions: { check: () => void; enable: () => void; fix?: () => void; open?: (id: string) => void; login?: () => void }, hint: string) => {
    switch (status.kind) {
      case 'einrichtung':
        return (
          <button class="cx-plugin-pill" onClick={() => (status.reason === 'anmeldung' && actions.login ? actions.login() : actions.fix?.())}>
            {status.label}
          </button>
        );
      case 'pruefe':
        return (
          <span class="cx-plugin-state" role="status">
            <i class="cx-plugin-spin" aria-hidden="true" />
            Prüfe …
          </span>
        );
      case 'ungeprueft':
        return (
          <button class="cx-plugin-pill quiet" title="Noch nicht geprüft" onClick={actions.check}>
            Prüfen
          </button>
        );
      case 'aus':
        return (
          <button class="cx-plugin-state" title="In Cortex ausgeschaltet — geht in kein Profil" onClick={actions.enable}>
            Aus
          </button>
        );
      case 'ersetzt':
        return (
          <button class="cx-plugin-state" title={hint} onClick={() => actions.open?.(status.viaId)}>
            <i class="cx-plugin-dot ok" aria-hidden="true" />
            {status.label}
          </button>
        );
      case 'fehler':
        return (
          <button class="cx-plugin-state bad" title={status.message} onClick={actions.fix}>
            <i class="cx-plugin-dot bad" aria-hidden="true" />
            Fehler
          </button>
        );
      case 'verbunden':
        return (
          <span class="cx-plugin-state" title={hint}>
            <i class="cx-plugin-dot ok" aria-hidden="true" />
            Verbunden
          </span>
        );
      default:
        return null;
    }
  };

  const manageMenu = (key: string, label: string, items: Array<[string, () => void] | false>) => (
    <div class="cx-plugin-menu" ref={menu === key ? menuRef : undefined}>
      <button
        class="cx-icon"
        aria-label={`${label} verwalten`}
        aria-haspopup="menu"
        aria-expanded={menu === key}
        title="Verwalten"
        disabled={busy === key}
        onClick={() => setMenu(menu === key ? undefined : key)}
      >
        <span class="cx-plugin-dots">
          <Glyph name="more" size={16} />
        </span>
      </button>
      {menu === key && (
        <div class="cx-plugin-popup" role="menu">
          {items.filter((i): i is [string, () => void] => !!i).map(([text, run]) => (
            <button key={text} role="menuitem" onClick={() => { setMenu(undefined); run(); }}>
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const row = (shown: PluginEntry) => {
    const entry = leadOf(shown);
    const state = stateOf(entry.id);
    const status = statusOf(entry);
    const login = loginOf(entry);
    const log = host?.connections?.[entry.server]?.log;
    return (
      <div class="cx-plugin-row" key={serviceKey(entry)}>
        <button class="cx-plugin-open" onClick={() => open(entry.id)}>
          <PluginMark icon={entry.icon} name={entry.name} />
          <span class="cx-plugin-text">
            <strong>{entry.name}</strong>
            <small>{entry.tagline}</small>
          </span>
        </button>
        {status.kind === 'frei' && login ? (
          <button
            class="cx-plugin-pill live"
            title={login.message}
            onClick={() => vscode.postMessage({ kind: 'cancelPluginLogin', id: entry.id })}
          >
            <i class="cx-plugin-spin" aria-hidden="true" />
            Im Browser … Abbrechen
          </button>
        ) : status.kind === 'frei' && state.connection?.status === 'pruefe' ? (
          <span class="cx-plugin-state" role="status">
            <i class="cx-plugin-spin" aria-hidden="true" />
            Prüfe …
          </span>
        ) : status.kind === 'frei' ? (
          <button
            class="cx-icon"
            aria-label={`${entry.name} installieren`}
            title="Installieren"
            disabled={busy === entry.id}
            onClick={() => install(entry)}
          >
            <Glyph name="plus" size={16} />
          </button>
        ) : (
          <>
            {login ? (
              <button
                class="cx-plugin-pill live"
                title={login.message}
                onClick={() => vscode.postMessage({ kind: 'cancelPluginLogin', id: entry.id })}
              >
                <i class="cx-plugin-spin" aria-hidden="true" />
                Im Browser … Abbrechen
              </button>
            ) : (
              stateControl(
                status,
                {
                  check: () => vscode.postMessage({ kind: 'checkServer', server: entry.server }),
                  enable: () => vscode.postMessage({ kind: 'setPluginEnabled', server: entry.server, enabled: true }),
                  fix: () => open(entry.id),
                  open,
                  login: () => vscode.postMessage({ kind: 'loginPlugin', id: entry.id }),
                },
                statusHint(status, state),
              )
            )}
            {manageMenu(entry.id, entry.name, [
              ['Produktseite öffnen', () => open(entry.id)],
              status.kind !== 'einrichtung' && status.kind !== 'aus' && ['Verbindung prüfen', () => vscode.postMessage({ kind: 'checkServer', server: entry.server })],
              (!!log || status.kind === 'fehler') && ['Protokoll anzeigen', () => vscode.postMessage({ kind: 'showPluginLog', server: entry.server })],
              [status.kind === 'aus' ? 'Einschalten' : 'Ausschalten', () => vscode.postMessage({ kind: 'setPluginEnabled', server: entry.server, enabled: status.kind === 'aus' })],
              ['Serverdefinition kopieren', () => vscode.postMessage({ kind: 'copyPluginDefinition', id: entry.id })],
              ['Entfernen', () => uninstall(entry)],
            ])}
          </>
        )}
      </div>
    );
  };

  const ownRow = (server: (typeof ownServers)[number]) => {
    const status = serverStatus(server.name);
    const log = host?.connections?.[server.name]?.log;
    return (
      <div class="cx-plugin-row" key={server.name} id={`cx-own-${server.name}`}>
        <button class="cx-plugin-open" onClick={server.open ?? (() => vscode.postMessage({ kind: 'editConnectors' }))}>
          <PluginMark icon={server.icon} name={server.title} />
          <span class="cx-plugin-text">
            <strong>{server.title}</strong>
            <small title={server.target}>{server.note}</small>
          </span>
        </button>
        {stateControl(
          status,
          {
            check: () => vscode.postMessage({ kind: 'checkServer', server: server.name }),
            enable: () => vscode.postMessage({ kind: 'setPluginEnabled', server: server.name, enabled: true }),
            fix: () => vscode.postMessage({ kind: 'showPluginLog', server: server.name }),
          },
          statusHint(status),
        )}
        {manageMenu(server.name, server.title, [
          status.kind !== 'aus' && ['Verbindung prüfen', () => vscode.postMessage({ kind: 'checkServer', server: server.name })],
          (!!log || status.kind === 'fehler') && ['Protokoll anzeigen', () => vscode.postMessage({ kind: 'showPluginLog', server: server.name })],
          [status.kind === 'aus' ? 'Einschalten' : 'Ausschalten', () => vscode.postMessage({ kind: 'setPluginEnabled', server: server.name, enabled: status.kind === 'aus' })],
          ['mcp.json bearbeiten', () => vscode.postMessage({ kind: 'editConnectors' })],
        ])}
      </div>
    );
  };

  /** Ein Abschnitt zeigt sechs Karten; der Rest wandert in die Kategorieseite. */
  const section = (title: string, id: SectionId, entries: PluginEntry[]) => (
    <CatalogSection key={title} title={title} id={id} list={cards(entries)} row={row} onMore={(more) => onView({ kind: 'category', id: more })} />
  );

  const detail = view.kind === 'detail' ? CATALOG.find((e) => e.id === view.id) : undefined;
  const categoryEntries = (id: SectionId) =>
    cards(
      id === 'featured' || id === 'popular' || id === 'fresh'
        ? CATALOG.filter((e) => e[id])
        : CATALOG.filter((e) => e.category === id),
    );

  return (
    <section class="cx-plugins">
      {/* Kein eigener Balken am Fensterrand: die Werkzeug-Icons der Workbench
          liegen dort in der Titelleiste und würden sich überdecken. Kopf und
          Aktionen stehen deshalb in der Inhaltsspalte — wie bei Konten und
          Einstellungen. */}
      <div class="cx-plugins-scroll">
        {toast && <PluginToast toast={toast} onView={onView} onClose={() => setToast(undefined)} />}

        <div class="cx-plugins-col">
          <div class="cx-plugins-bar">
            <div class="cx-breadcrumb">
              {view.kind === 'overview' ? (
                <div class="cx-plugin-tabs" role="tablist" aria-label="Ansicht">
                  <button role="tab" aria-selected={tab === 'plugins'} onClick={() => setTab('plugins')}>
                    Plugins
                  </button>
                  <button role="tab" aria-selected={tab === 'vorlagen'} onClick={() => setTab('vorlagen')}>
                    Vorlagen
                  </button>
                </div>
              ) : (
                <>
                  <button class="cx-plugin-crumb" onClick={() => onView({ kind: 'overview' })}>
                    Plugins
                  </button>
                  <span class="cx-slash">
                    <Glyph name="chevron" size={11} />
                  </span>
                  <strong>
                    {view.kind === 'detail'
                      ? (detail?.name ?? 'Unbekannt')
                      : view.id in SECTION_LABEL
                        ? SECTION_LABEL[view.id as keyof typeof SECTION_LABEL]
                        : CATEGORY_LABEL[view.id as PluginCategory]}
                  </strong>
                </>
              )}
            </div>
            <div class="cx-top-actions">
              <button
                class="cx-editor-button"
                disabled={syncing || (!Object.keys(servers).length && !builtIn)}
                onClick={() => {
                  setSyncing(true);
                  vscode.postMessage({ kind: 'syncConnectors' });
                }}
              >
                <Glyph name="refresh" size={13} />
                {syncing ? 'Überträgt …' : 'In Profile übertragen'}
              </button>
            </div>
          </div>

          {view.kind === 'detail' && detail ? (
            <PluginDetail
              key={detail.id}
              entry={detail}
              state={stateOf(detail.id)}
              status={statusOf(detail)}
              variants={variantsOf(detail).map((v) => ({ entry: v, status: statusOf(v) }))}
              login={loginOf(detail)}
              scope={effective.origin[detail.server] ?? scope ?? 'persoenlich'}
              shadowed={effective.shadowed.includes(detail.server)}
              busy={busy === detail.id}
              onBack={() => onView({ kind: 'overview' })}
              onInstall={(values) => {
                setBusy(detail.id);
                if (scope) vscode.postMessage({ kind: 'installPlugin', id: detail.id, scope, ...(values ? { values } : {}) });
              }}
              onUninstall={() => uninstall(detail)}
              onPrompt={(text) => onPrompt?.(text)}
              onOpen={(id) => onView({ kind: 'detail', id })}
            />
          ) : view.kind === 'category' ? (
            <>
              <div class="cx-plugins-head">
                <h1>
                  {view.id in SECTION_LABEL
                    ? SECTION_LABEL[view.id as keyof typeof SECTION_LABEL]
                    : CATEGORY_LABEL[view.id as PluginCategory]}
                </h1>
                <p>{categoryEntries(view.id).length} Plugins</p>
              </div>
              <div class="cx-plugin-grid cx-plugin-grid-loose">{categoryEntries(view.id).map(row)}</div>
            </>
          ) : tab === 'vorlagen' ? (
            <TemplatesTab templates={templates} />
          ) : (
            <>
              <div class="cx-plugins-head">
                <h1>Plugins</h1>
                <p>Nutze Cortex in all deinen bevorzugten Werkzeugen.</p>
                <div class="cx-plugin-search">
                  <Glyph name="search" size={15} />
                  <input
                    aria-label="Plugins suchen"
                    placeholder="Plugins suchen"
                    value={query}
                    onInput={(e) => setQuery(e.currentTarget.value)}
                  />
                </div>
              </div>

              {query.trim() ? (
                <PluginSection title="Treffer">
                  <div class="cx-plugin-grid cx-plugin-grid-loose">{hits.map(row)}</div>
                  {!hits.length && <p class="cx-plugin-empty">Kein Plugin passt zu „{query}“.</p>}
                </PluginSection>
              ) : (
                <>
                  {/* Eine Reihe, keine Listen: was installiert ist, ist
                      installiert — ob es aus dem Katalog kommt, selbst in
                      mcp.json steht oder wie Vektor eingebaut ist.
                      Beschriftungen stehen nicht darunter, sondern im Tooltip;
                      so bleibt die Reihe so ruhig wie in der Vorlage. */}
                  <InstalledSection tiles={installedTiles} host={host} scope={scope} setScope={setScope} effective={effective} active={active} />

                  {/* Ein installiertes Plugin, dem der Schlüssel fehlt, arbeitet
                      nicht — es gehört nach oben und nicht irgendwo in seine
                      Kategorie, wo man es erst suchen müsste. */}
                  {ownServers.length > 0 && (
                    <PluginSection title="Eigene Server">
                      <div class="cx-plugin-grid">{ownServers.map(ownRow)}</div>
                    </PluginSection>
                  )}

                  {needsSetup.length > 0 && (
                    <PluginSection title="Einrichtung offen">
                      <div class="cx-plugin-grid">{needsSetup.map(row)}</div>
                    </PluginSection>
                  )}

                  {section('Wichtige Plugins', 'featured', CATALOG.filter((e) => e.featured))}
                  {section('Beliebt', 'popular', CATALOG.filter((e) => e.popular))}
                  {section('Neu und bemerkenswert', 'fresh', CATALOG.filter((e) => e.fresh))}
                  {PLUGIN_CATEGORIES.map((id) =>
                    section(CATEGORY_LABEL[id], id, CATALOG.filter((e) => e.category === id)),
                  )}

                  {host && host.accounts.length > 0 && (Object.keys(servers).length > 0 || !!builtIn) && (
                    <ProfilesSection accounts={host.accounts} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
