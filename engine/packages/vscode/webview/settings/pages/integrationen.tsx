import { useEffect, useState } from 'preact/hooks';
import type { HostToWebview } from '../../../src/panel/protocol.js';
import { CortexMark, Glyph } from '../../components/CortexIcons.js';
import { PluginMark } from '../../components/pluginIcons.js';
import { CATALOG } from '../../components/pluginCatalog.js';
import type { PluginStatus } from '../../../../core/src/plugins/installed.js';
import { pluginOverview, statusHint } from '../../components/pluginOverview.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useHost, useHostMessage } from '../../hooks/useHostMessage.js';
import { useApp, useNative } from '../store.js';
import { Button, Card, Empty, Link, Page, Row, Search, Section, Select, Tabs, Toggle } from '../ui.js';

/* ── Computernutzung ───────────────────────────────────────────────────────── */

export function ComputernutzungPage() {
  const [any, setAny] = useApp('computer.beliebigeApp', false);
  const [locked, setLocked] = useApp('computer.gesperrt', false);
  const [browser, setBrowser] = useNative('cortex.browserAccess', 'auf-ansage');
  return <Page title="Computernutzung" subtitle="Lege fest, wie Cortex andere Anwendungen auf deinem Computer nutzt">
    <Section title="Steuerung">
      <Card>
        <Row pending icon={<span class="cxs-app-tile cursor"><Glyph name="cursorArrow" size={18} /></span>} title="Beliebige App" sub="Lass Cortex Apps auf deinem Computer steuern."><Toggle label="Beliebige App" on={any} onChange={setAny} /></Row>
        <Row icon={<span class="cxs-app-tile browser"><Glyph name="window" size={18} /></span>} title="Desktop-Browser" sub="Wie weit ein Agent deinen Desktop-Browser benutzen darf. Vorschau, Anbieter-Login und Tests sind nicht betroffen.">
          <Select label="Desktop-Browser" value={browser} onChange={setBrowser} options={[{ value: 'nie', label: 'Nie' }, { value: 'auf-ansage', label: 'Auf Ansage' }, { value: 'immer', label: 'Immer' }]} />
        </Row>
      </Card>
      <Card class="cxs-gap">
        <Row pending icon={<span class="cxs-app-tile lock"><Glyph name="lock" size={17} /></span>} title="Gesperrte Nutzung" sub={<>Cortex darf deinen Mac verwenden, wenn er gesperrt ist. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://support.apple.com/de-de/guide/mac-help/mh40596/mac' })}>Mehr erfahren</Link></>}><Toggle label="Gesperrte Nutzung" on={locked} onChange={setLocked} /></Row>
      </Card>
    </Section>
    <Section title="Immer erlaubte Apps">
      <Card><div class="cxs-card-empty">Noch keine</div></Card>
    </Section>
  </Page>;
}

export { ComputerverlaufPage } from './computerHistory.js';

/* ── Appshots ──────────────────────────────────────────────────────────────── */

export function AppshotsPage() {
  const [hotkey, setHotkey] = useApp('appshots.hotkey', 'beide-cmd');
  const [target, setTarget] = useApp('appshots.ziel', 'auto');
  const [sound, setSound] = useApp('appshots.sound', true);
  return <Page title="Appshots" preview>
    <div class="cxs-card cxs-info-card">
      <span class="cxs-app-tile appshot"><Glyph name="appshot" size={18} /></span>
      <div><strong>Appshot aufnehmen, um Cortex dein vorderstes Fenster zu zeigen</strong><span>Appshots enthalten Bild- und Textinhalte, einschließlich Text, der aus dem sichtbaren Bereich gescrollt wurde.</span></div>
    </div>
    <div class="cxs-split">
      <Card>
        <Row title="Tastenkürzel" sub="Beide ⌘-Tasten gleichzeitig drücken"><Select label="Appshot-Tastenkürzel" value={hotkey} onChange={setHotkey} options={[{ value: 'beide-cmd', label: '⌘ + ⌘' }, { value: 'beide-opt', label: '⌥ + ⌥' }, { value: 'aus', label: 'Aus' }]} /></Row>
        <Row title="Appshot-Ziel" sub={<>Wähle aus, wohin Appshots<br />gesendet werden, wenn<br />du den Hotkey verwendest</>}><Select label="Appshot-Ziel" value={target} onChange={setTarget} options={[{ value: 'auto', label: 'Automatisch' }, { value: 'neu', label: 'Neuer Chat' }, { value: 'aktiv', label: 'Aktiver Chat' }]} /></Row>
        <Row title="Soundeffekt abspielen"><Toggle label="Soundeffekt" on={sound} onChange={setSound} /></Row>
      </Card>
      <div class="cxs-appshot-art" aria-hidden="true">
        <div class="cxs-appshot-screen"><div class="cxs-appshot-window"><i /><i /><i /><b /><b /><b /><b /></div><span class="cxs-appshot-flash" /></div>
        <div class="cxs-appshot-keys">{Array.from({ length: 36 }, (_, i) => <i key={i} class={i === 30 || i === 33 ? 'cmd' : ''} />)}</div>
        <div class="cxs-appshot-chip"><CortexMark size={16} />An Cortex gesendet</div>
      </div>
    </div>
  </Page>;
}

/* ── Plugins ───────────────────────────────────────────────────────────────── */

type PluginsMsg = Partial<Extract<HostToWebview, { kind: 'plugins' }>>;
interface ConnectorsMsg { servers?: Array<{ name: string; title?: string; description?: string; icon?: string; target: string; connected?: boolean; builtIn?: boolean; remote: boolean }> }

/** Die Klasse des Zustandspunkts — grün nur für verbunden, Farbe nur bei Handlungsbedarf. */
const statusClass = (status: PluginStatus) =>
  status.kind === 'verbunden' || status.kind === 'ersetzt' ? 'ok' : status.kind === 'fehler' ? 'bad' : status.kind === 'einrichtung' ? 'warn' : 'off';

export function PluginsSettingsPage({ ctx }: { ctx: SettingsContext }) {
  // Dieselben Nachrichten wie die Plugin-Seite, samt Live-Stand: eine Prüfung
  // oder ein Schalter zeigt sich hier, ohne die Seite neu zu öffnen.
  const [plugins, setPlugins] = useState<PluginsMsg>({});
  useHostMessage('plugins', msg => setPlugins(msg));
  useHostMessage('pluginLive', msg => {
    const { kind: _kind, ...live } = msg;
    setPlugins(prev => ({ ...prev, ...live }));
  });
  useEffect(() => { vscode.postMessage({ kind: 'getPlugins' }); }, []);
  const connectors = useHost<ConnectorsMsg>('connectors', { kind: 'getConnectors' }, {});
  const [tab, setTab] = useState<'plugins' | 'apps' | 'mcps' | 'skills'>(ctx.sub[0] === 'mcps' ? 'mcps' : 'plugins');
  const [query, setQuery] = useState('');
  const [disabledSkills, setDisabledSkills] = useApp<string[]>('plugins.skillsAus', []);
  const overview = pluginOverview(plugins);
  const installed = overview.installedCards;
  const own = overview.ownServers;
  const servers = overview.servers;
  const apps = connectors.servers ?? [];
  const skills = plugins.skills ?? [];
  const q = query.trim().toLowerCase();
  const hit = (...parts: Array<string | undefined>) => !q || parts.join(' ').toLowerCase().includes(q);
  const placeholder = { plugins: 'Plugins suchen', apps: 'Apps suchen', mcps: 'MCP-Server durchsuchen', skills: 'Fähigkeiten suchen' }[tab];
  const loading = !plugins.scopes;
  const setEnabled = (server: string, enabled: boolean) => vscode.postMessage({ kind: 'setPluginEnabled', server, enabled });
  const statusOfServer = (name: string) => {
    const entry = CATALOG.find(e => e.server === name);
    return entry ? overview.statusOf(entry) : overview.serverStatus(name);
  };
  return <Page title="Plugins" subtitle="Plugins, Skills und MCPs verwalten" actions={<>
    <Button onClick={() => ctx.openPlugin()}>Verzeichnis durchsuchen</Button>
    <Button kind="primary" onClick={() => vscode.postMessage({ kind: 'editConnectors' })}>Hinzufügen <Glyph name="chevronDown" size={12} /></Button>
  </>}>
    <div class="cxs-tabbar">
      <Tabs value={tab} onChange={t => { setTab(t); setQuery(''); }} tabs={[
        { id: 'plugins', label: 'Plugins', count: installed.length + own.length },
        { id: 'apps', label: 'Apps', count: apps.length },
        { id: 'mcps', label: 'MCPs', count: Object.keys(servers).length + (plugins.builtIn ? 1 : 0) },
        { id: 'skills', label: 'Skills', count: skills.length },
      ]} />
      <Search value={query} onInput={setQuery} placeholder={placeholder} class="compact" />
    </div>
    {loading && <div class="cxs-loading"><span class="cxs-spinner" /><span>Plugins werden geladen …</span></div>}
    {!loading && tab === 'plugins' && <div class="cxs-plain-list">
      {installed.filter(e => hit(e.name, e.tagline)).map(e => {
        const status = overview.statusOf(e);
        return <div class="cxs-list-row clickable" key={e.id} onClick={() => ctx.openPlugin(e.id)}>
          <PluginMark icon={e.icon} name={e.name} />
          <div><strong>{e.name}</strong><small>{e.variantLabel ? `${e.variantLabel} · ` : ''}{e.tagline}</small></div>
          <span class={`cxs-status ${statusClass(status)}`} title={statusHint(status, overview.stateOf(e.id))}><i />{'label' in status ? status.label : 'Nicht installiert'}</span>
          <span onClick={event => event.stopPropagation()}>
            <Toggle label={`${e.name} ein- oder ausschalten`} on={status.kind !== 'aus'} onChange={on => setEnabled(e.server, on)} />
          </span>
        </div>;
      })}
      {own.filter(server => hit(server.title, server.target)).map(server => {
        const status = overview.serverStatus(server.name);
        return <div class="cxs-list-row" key={server.name}>
          <PluginMark icon={server.icon} name={server.title} />
          <div><strong>{server.title}</strong><small>{server.note}</small></div>
          <span class={`cxs-status ${statusClass(status)}`} title={statusHint(status)}><i />{'label' in status ? status.label : 'Nicht installiert'}</span>
          <Toggle label={`${server.title} ein- oder ausschalten`} on={status.kind !== 'aus'} onChange={on => setEnabled(server.name, on)} />
        </div>;
      })}
      {!installed.length && !own.length && <Empty action={<Button onClick={() => ctx.openPlugin()}>Verzeichnis durchsuchen</Button>}>Noch keine Plugins installiert</Empty>}
    </div>}
    {!loading && tab === 'apps' && <div class="cxs-plain-list">
      {apps.filter(a => hit(a.title, a.name, a.description)).map(a => <div class="cxs-list-row" key={a.name}>
        <PluginMark icon={a.icon} name={a.title ?? a.name} />
        <div><strong>{a.title ?? a.name}</strong><small>{a.description ?? a.target}</small></div>
        <span class={`cxs-status ${a.connected === false ? 'off' : 'ok'}`}><i />{a.builtIn ? (a.connected ? 'Verbunden' : 'Eingebaut') : a.remote ? 'Entfernt' : 'Lokal'}</span>
      </div>)}
      {!apps.length && <Empty>Keine Apps verbunden</Empty>}
    </div>}
    {!loading && tab === 'mcps' && <>
      <Section title="Server">
        <Card>
          {Object.entries(servers).filter(([name]) => hit(name)).map(([name]) => {
            const status = statusOfServer(name);
            return <Row key={name} title={name} sub={`${overview.effective.origin[name] === 'projekt' ? 'Projekt' : 'Persönlich'}${overview.effective.shadowed.includes(name) ? ' · überschreibt den persönlichen Eintrag' : ''} · ${statusHint(status)}`}>
              <button type="button" class="cxs-icon-button" aria-label={`${name} bearbeiten`} title="In mcp.json bearbeiten" onClick={() => vscode.postMessage({ kind: 'editConnectors' })}><Glyph name="gear" size={15} /></button>
              <Toggle label={`${name} ein- oder ausschalten`} on={status.kind !== 'aus'} onChange={on => setEnabled(name, on)} />
            </Row>;
          })}
          {!Object.keys(servers).length && <div class="cxs-card-empty">Keine Server in mcp.json</div>}
        </Card>
      </Section>
      {plugins.builtIn && <Section title="Eingebaut">
        <Card><Row title={plugins.builtIn.title} sub={`${plugins.builtIn.running ? `Läuft · ${plugins.builtIn.sessions === 1 ? '1 Quelle' : `${plugins.builtIn.sessions} Quellen`}` : 'Nicht gestartet'} · ${statusHint(overview.serverStatus(plugins.builtIn.name))}`}>
          <Toggle label={`${plugins.builtIn.title} ein- oder ausschalten`} on={overview.serverStatus(plugins.builtIn.name).kind !== 'aus'} onChange={on => setEnabled(plugins.builtIn!.name, on)} />
        </Row></Card>
      </Section>}
    </>}
    {!loading && tab === 'skills' && <div class="cxs-plain-list">
      {skills.filter(s => hit(s)).map(s => <div class="cxs-list-row" key={s}>
        <span class="cxs-skill-icon"><Glyph name="cube" size={16} /></span>
        <div><strong>{s}</strong><small>Skill-Ordner auf diesem Mac · Auswahl wird gespeichert und noch nicht an die Anbieter angewendet.</small></div>
        <span class="cxs-source">Persönlich</span>
        <span><i class="cxs-pending" title="Gespeichert – Cortex nutzt diesen Wert noch nicht." aria-label="noch ohne Wirkung" /><Toggle label={s} on={!disabledSkills.includes(s)} onChange={on => setDisabledSkills(on ? disabledSkills.filter(x => x !== s) : [...disabledSkills, s])} /></span>
      </div>)}
      {!skills.length && <Empty>Keine Skills gefunden</Empty>}
    </div>}
    <p class="cxs-footnote"><Link onClick={() => vscode.postMessage({ kind: 'syncConnectors' })}>In alle Anbieterprofile spiegeln</Link></p>
  </Page>;
}
