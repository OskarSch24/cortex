import type { ComponentChildren } from 'preact';
import type { PluginEntry } from '../../../../core/src/plugins/catalog.js';
import { PluginSection } from './PluginSection.js';
import { PluginMark } from '../pluginIcons.js';
import type { SectionId } from '../PluginsView.js';

/** Ein Abschnitt zeigt sechs Karten; der Rest wandert in die Kategorieseite. */
export function CatalogSection({ title, id, list, row, onMore }: {
  title: string;
  id: SectionId;
  list: PluginEntry[];
  row: (entry: PluginEntry) => ComponentChildren;
  onMore: (id: SectionId) => void;
}) {
  if (!list.length) return null;
  const shown = list.slice(0, 6);
  const rest = list.slice(6);
  return (
    <PluginSection title={title}>
      <div class="cx-plugin-grid">{shown.map(row)}</div>
      {rest.length > 0 && (
        <button class="cx-plugin-more" onClick={() => onMore(id)}>
          <span class="cx-plugin-stack">
            {rest.slice(0, 3).map((entry) => (
              <PluginMark key={entry.id} icon={entry.icon} name={entry.name} />
            ))}
          </span>
          Siehe {rest.slice(0, 2).map((e) => e.name).join(', ')} und weitere
        </button>
      )}
    </PluginSection>
  );
}
