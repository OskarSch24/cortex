import { Glyph } from '../CortexIcons.js';
import { PluginSection } from './PluginSection.js';
import type { Plugins } from './usePluginsHost.js';

/** Wo die Definitionen angekommen sind — je Anbieterkonto, mit Fehlern. */
export function ProfilesSection({ accounts }: { accounts: Plugins['accounts'] }) {
  return (
    <PluginSection title="In diesen Profilen">
      <div class="cx-plugin-targets">
        {accounts.map((account) => (
          <span
            key={`${account.provider}:${account.label}`}
            class={account.error ? 'failed' : ''}
            title={account.error}
          >
            <Glyph name={account.error ? 'close' : 'check'} size={12} />
            {account.provider}:{account.label}
          </span>
        ))}
      </div>
      <p class="cx-plugin-empty">
        Eine Definition, die nur bei einem Anbieter ankommt, ist kein halber Erfolg.
      </p>
    </PluginSection>
  );
}
