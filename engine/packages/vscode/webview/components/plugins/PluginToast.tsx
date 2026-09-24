import type { HostToWebview } from '../../../src/panel/protocol.js';
import { Glyph } from '../CortexIcons.js';
import type { PluginView } from '../PluginsView.js';

type Progress = Extract<HostToWebview, { kind: 'pluginProgress' }>;

/** Die Meldung oben: erfolgreich, fehlgeschlagen, wahlweise mit Knopf zur Produktseite. */
export function PluginToast({ toast, onView, onClose }: { toast: Progress; onView: (next: PluginView) => void; onClose: () => void }) {
  return (
    <div class={`cx-plugin-toast ${toast.ok ? '' : 'bad'}`} role={toast.ok ? 'status' : 'alert'}>
      {/* Ein ✕ gibt es nur einmal: zum Schließen. Ein Fehler trägt das Warnzeichen. */}
      <span class="cx-plugin-toast-mark" aria-hidden="true">
        <Glyph name={toast.ok ? 'check' : 'warn'} size={15} />
      </span>
      <span class="cx-plugin-toast-text">{toast.message}</span>
      {toast.action && (
        <button
          class="cx-plugin-pill"
          onClick={() => {
            onView({ kind: 'detail', id: toast.action!.open });
            onClose();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button class="cx-icon" aria-label="Meldung schließen" onClick={() => onClose()}>
        <Glyph name="close" size={12} />
      </button>
    </div>
  );
}
