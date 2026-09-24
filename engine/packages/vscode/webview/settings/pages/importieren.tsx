import { Glyph } from '../../components/CortexIcons.js';
import { PluginMark } from '../../components/pluginIcons.js';
import { CATALOG } from '../../components/pluginCatalog.js';
import { pluginStates } from '../../../../core/src/plugins/installed.js';
import { shortPath } from '../../format/path.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useHost } from '../../hooks/useHostMessage.js';
import { useApp } from '../store.js';
import { Button, Card, Page, Row, Section, Toggle } from '../ui.js';

/* ── Importieren ───────────────────────────────────────────────────────────── */

export function ImportierenPage({ ctx }: { ctx: SettingsContext }) {
  const [sync, setSync] = useApp('import.synchron', false);
  const imports = useHost<{ found?: Array<{ id: string; name: string; path: string }> }>('imports', { kind: 'detectImports' }, {});
  const plugins = useHost<{ scopes?: Array<{ servers: Record<string, never> }>; skills?: string[] }>('plugins', { kind: 'getPlugins' }, {});
  const servers = Object.assign({}, ...(plugins.scopes ?? []).map(s => s.servers));
  const states = plugins.scopes ? pluginStates(CATALOG, servers, new Set(plugins.skills ?? [])) : undefined;
  const open = CATALOG.filter(e => states?.get(e.id)?.needsSecret);
  const withoutProject = ctx.projects.filter(p => p.missing);
  return <Page title="Importieren" subtitle="Einstellungen, Projekte und Chats aus anderen KI-Apps in Cortex übernehmen">
    <Section title="Automatische Synchronisierung" big>
      <Card>
        <Row pending title="Importe synchron halten" sub={sync ? 'Synchronisierung aktiv. Deine Inhaltsauswahl ist gespeichert.' : 'Synchronisierung pausiert. Deine Inhaltsauswahl ist gespeichert.'}>
          <Toggle label="Importe synchron halten" on={sync} onChange={setSync} />
        </Row>
        <Row title="Zu synchronisierende Inhalte" sub="Nach dem ersten Import verfügbar"><Button disabled>Anpassen</Button></Row>
      </Card>
    </Section>
    <Section title="Aus einer anderen KI-App importieren" big subtitle={imports.found ? 'Erkanntes Setup, das zu Cortex hinzugefügt werden kann' : undefined}>
      <Card>
        {!imports.found && <Row title="Suche nach Importen" sub="Kompatible Setups, Projekte und letzte Chats werden gesucht"><span class="cxs-spinner" /></Row>}
        {imports.found?.map(item => <Row key={item.id} pending icon={<span class={`cxs-app-tile ${item.id}`}><Glyph name={item.id === 'claude-code' ? 'code' : item.id === 'codex' ? 'terminal' : 'cube'} size={18} /></span>} title={item.name} sub={shortPath(item.path)}>
          <Button disabled title="Der Import folgt noch.">Importieren</Button>
        </Row>)}
        {imports.found && !imports.found.length && <Row title="Keine andere KI-App gefunden" sub="Cortex hat unter ~/.claude, ~/.codex, ~/.cursor und ~/.grok nichts gefunden." />}
        {withoutProject.length > 0 && <div class="cxs-notice"><Glyph name="warn" size={14} /><div><strong>{withoutProject.length === 1 ? '1 Projekt kann nicht importiert werden' : `${withoutProject.length} Projekte können nicht importiert werden`}</strong><span>{withoutProject.map(p => p.name).join(', ')} {withoutProject.length === 1 ? 'hat' : 'haben'} keinen erreichbaren Ordner</span></div></div>}
      </Card>
    </Section>
    <Section title="Aufmerksamkeit erforderlich" big subtitle="Einrichtung von Elementen aus einem früheren Import abschließen">
      <Card class="cxs-attention">
        <div class="cxs-chip-row"><span class="cxs-chip">{states ? `Plugins (${open.length})` : 'Plugins'}</span></div>
        {!states && <div class="cxs-loading"><span class="cxs-spinner" /><span>Importierte Plugins werden geladen…</span></div>}
        {states && !open.length && <div class="cxs-loading"><span>Alle installierten Plugins sind eingerichtet.</span></div>}
        {open.map(entry => <div class="cxs-plugin-line" key={entry.id}>
          <PluginMark icon={entry.icon} name={entry.name} size="sm" />
          <div><strong>{entry.name}</strong><small>{entry.tagline}</small></div>
          <Button kind="outline" onClick={() => ctx.openPlugin(entry.id)}>Einrichten</Button>
        </div>)}
      </Card>
    </Section>
  </Page>;
}
