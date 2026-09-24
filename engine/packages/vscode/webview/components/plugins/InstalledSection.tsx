import type { PluginScope, PluginScopeState } from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';
import { PluginSection } from './PluginSection.js';
import { PluginMark } from '../pluginIcons.js';
import type { pluginOverview } from '../pluginOverview.js';
import type { Plugins } from './usePluginsHost.js';

export interface InstalledTile { key: string; icon?: string; name: string; hint: string; dot?: 'gelb' | 'rot'; open: () => void }

/**
 * Eine Reihe, keine Listen: was installiert ist, ist installiert — ob es aus
 * dem Katalog kommt, selbst in mcp.json steht oder wie Vektor eingebaut ist.
 * Darunter, wohin „+“ schreibt, und was an den beiden Dateien auffällt.
 */
export function InstalledSection({ tiles, host, scope, setScope, effective, active }: {
  tiles: InstalledTile[];
  host?: Plugins;
  scope?: PluginScope;
  setScope: (scope: PluginScope) => void;
  effective: ReturnType<typeof pluginOverview>['effective'];
  active?: PluginScopeState;
}) {
  return (
    <PluginSection title="Installiert" actions={
        <button
          class="cx-icon"
          title="mcp.json bearbeiten"
          aria-label="mcp.json bearbeiten"
          onClick={() => vscode.postMessage({ kind: 'editConnectors' })}
        >
          <Glyph name="gear" size={15} />
        </button>
      }>
      <div class="cx-plugin-installed">
        {tiles.map((tile) => (
          <button key={tile.key} title={tile.hint} aria-label={tile.hint} onClick={tile.open}>
            <PluginMark icon={tile.icon} name={tile.name} size="sm" />
            {tile.dot && <i class={`cx-plugin-badge ${tile.dot}`} aria-hidden="true" />}
          </button>
        ))}
        {!tiles.length && (
          <p class="cx-plugin-empty">
            Noch nichts verbunden. Ein „+“ unten meldet ein Plugin an, prüft, ob es antwortet, und stellt es erst dann hierher.
          </p>
        )}
      </div>
      {host && (
        <div class="cx-plugin-scope" role="tablist" aria-label="Wohin neue Plugins geschrieben werden" title="Wohin „+“ ein neues Plugin schreibt — beide Dateien gelten zusammen">
          {host.scopes.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === scope}
              title={s.path}
              onClick={() => setScope(s.id)}
            >
              {s.id === 'projekt' ? 'Projekt' : 'Persönlich'}
              {s.exists ? '' : ' · noch keine Datei'}
            </button>
          ))}
        </div>
      )}
      {host?.scopes.filter((s) => s.error).map((s) => (
        <p class="cx-plugin-empty" role="alert" key={s.id}>
          {s.path} ist nicht lesbar: {s.error}
        </p>
      ))}
      {effective.shadowed.length > 0 && (
        <p class="cx-plugin-empty">
          Die Projektdatei überschreibt {effective.shadowed.join(', ')} aus deiner persönlichen mcp.json.
        </p>
      )}
      {active && !active.exists && (
        <p class="cx-plugin-empty">Neue Plugins landen in {active.path} — die Datei entsteht beim ersten „+“.</p>
      )}
    </PluginSection>
  );
}
