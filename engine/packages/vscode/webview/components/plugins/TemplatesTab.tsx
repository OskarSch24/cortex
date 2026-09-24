import { vscode } from '../../vscodeApi.js';
import { PluginSection } from './PluginSection.js';
import { PluginMark } from '../pluginIcons.js';
import type { Templates } from './usePluginsHost.js';

/** Der Reiter „Vorlagen“: was in templates/ liegt, eingebaut und eigen. */
export function TemplatesTab({ templates }: { templates?: Templates }) {
  return (
    <>
      <div class="cx-plugins-head">
        <h1>Vorlagen</h1>
        <p>Bearbeitbare Dokumente, Präsentationen und Tabellen sowie deine eigenen Vorlagen.</p>
      </div>
      <PluginSection title="Vorhanden" actions={
          <button onClick={() => vscode.postMessage({ kind: 'editTemplates' })}>Ordner öffnen</button>
        }>
        <div class="cx-plugin-grid">
          {(templates?.items ?? []).map((item) => (
            <div class="cx-plugin-row" key={item.name}>
              <span class="cx-template-library-preview">{item.previewUrl ? <img src={item.previewUrl} alt="" /> : <PluginMark name={item.name} />}</span>
              <span class="cx-plugin-text">
                <strong>{item.name}</strong>
                <small>{item.artifactPath ? item.artifactPath.split('.').pop()?.toUpperCase() + ' · Bearbeitbare Vorlage' : item.body.trim().split('\n')[0]?.slice(0, 90)}</small>
              </span>
              <span class="cx-plugin-tag">{item.own ? 'eigen' : item.kind}</span>
            </div>
          ))}
        </div>
        {!templates?.items.length && (
          <p class="cx-plugin-empty">Noch keine Vorlagen. Dateien in templates/ erscheinen hier.</p>
        )}
      </PluginSection>
    </>
  );
}
