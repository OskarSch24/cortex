import { useEffect, useState } from 'preact/hooks';
import { ConnectorsView } from './ConnectorsView.js';
import { NativeSettings } from './NativeSettings.js';
import { vscode } from '../vscodeApi.js';

const PERMISSION_MODES: Array<{ id: string; label: string; hint: string }> = [
  { id: 'safe', label: 'Plan', hint: 'Liest und plant. Verändert keine Dateien.' },
  { id: 'edits', label: 'Agent', hint: 'Bearbeitet Dateien und führt Befehle im Projekt aus.' },
  { id: 'full', label: 'Autonom', hint: 'Arbeitet ohne Rückfragen mit umfassendem Zugriff.' },
];

const BROWSER_ACCESS: Array<{ id: string; label: string }> = [
  { id: 'nie', label: 'Nie — auch nicht auf Ansage' },
  { id: 'auf-ansage', label: 'Nur wenn ich es im Auftrag verlange' },
  { id: 'immer', label: 'Immer, wenn der Agent ihn braucht' },
];

/**
 * Wie weit ein Agent den Desktop-Browser benutzen darf.
 *
 * Nicht gemeint sind die eingebaute Vorschau, der Anbieter-Login und die
 * Oberflächentests — die laufen ohne Desktop-Browser und bleiben in jeder Stufe
 * erlaubt. Der Regeltext dazu steht in AGENTS.md.
 */
function BrowserAccess() {
  const [value, setValue] = useState<string>();
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.data?.kind === 'nativeSettings') setValue(String(event.data.values['cortex.browserAccess'] ?? 'auf-ansage'));
    };
    window.addEventListener('message', listen);
    vscode.postMessage({ kind: 'getNativeSettings' });
    return () => window.removeEventListener('message', listen);
  }, []);
  return (
    <label class="settings-select">
      <span>
        Desktop-Browser für Agenten
        <small>Vorschau, Anbieter-Login und Tests sind nicht betroffen.</small>
      </span>
      <select
        disabled={value === undefined}
        value={value ?? 'auf-ansage'}
        onChange={(e) => {
          const next = (e.target as HTMLSelectElement).value;
          setValue(next);
          vscode.postMessage({ kind: 'setNativeSetting', key: 'cortex.browserAccess', value: next });
        }}
      >
        {BROWSER_ACCESS.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

const ROUTING_MODES: Array<{ id: 'auto' | 'manual'; label: string; hint: string }> = [
  { id: 'auto', label: 'Auto', hint: 'Wählt passende Konten und Modelle aus deinen Abos.' },
  { id: 'manual', label: 'Manuell', hint: 'Folgt deinen Routing-Regeln und der festgelegten Reihenfolge.' },
];

export function SettingsView({
  permissionMode,
  routingMode,
  askPermission,
  pollUsage,
  onPermission,
  onRouting,
  onAsk,
}: {
  permissionMode: string;
  routingMode: 'auto' | 'manual';
  askPermission: boolean;
  pollUsage: boolean;
  onPermission: (id: string) => void;
  onRouting: (id: 'auto' | 'manual') => void;
  onAsk: (ask: boolean) => void;
}) {
  return (
    <div class="settings-page hangar">
      <div class="hangar-head">
        <div class="hangar-kicker">Einstellungen</div>
        <div class="hangar-title">Einstellungen</div>
        <div class="hangar-line">Konfiguriere deinen Editor, die Anwendung und deine KI-Agenten.</div>
      </div>

      <ConnectorsView />

      <NativeSettings />
      <h2 class="cx-agent-settings-heading">KI-Agenten</h2>
      <section class="settings-block">
        <div class="detail-section-title">Handlungsspielraum</div>
        <div class="settings-choices">
          {PERMISSION_MODES.map((mode) => (
            <button
              key={mode.id}
              class={`settings-choice ${permissionMode === mode.id ? 'on' : ''}`}
              onClick={() => onPermission(mode.id)}
            >
              <span class="settings-choice-name">{mode.label}</span>
              <span class="settings-choice-hint">{mode.hint}</span>
            </button>
          ))}
        </div>
        <BrowserAccess />
        <label class="settings-toggle">
          <input
            type="checkbox"
            checked={askPermission}
            disabled={permissionMode === 'full'}
            onChange={(e) => onAsk((e.target as HTMLInputElement).checked)}
          />
          <span>
            Vor einzelnen Schritten nachfragen
            {permissionMode === 'full' ? ' — im autonomen Modus deaktiviert' : ''}
          </span>
        </label>
      </section>

      <section class="settings-block">
        <div class="detail-section-title">Routing</div>
        <div class="settings-choices">
          {ROUTING_MODES.map((mode) => (
            <button
              key={mode.id}
              class={`settings-choice ${routingMode === mode.id ? 'on' : ''}`}
              onClick={() => onRouting(mode.id)}
            >
              <span class="settings-choice-name">{mode.label}</span>
              <span class="settings-choice-hint">{mode.hint}</span>
            </button>
          ))}
        </div>
      <button class="cx-secondary" onClick={() => vscode.postMessage({ kind: 'openRules' })}>Routing-Regeln bearbeiten</button>
      </section>

      <section class="settings-block">
        <div class="detail-section-title">App</div>

        <label class="settings-toggle">
          <input
            type="checkbox"
            checked={pollUsage}
            onChange={(e) =>
              vscode.postMessage({
                kind: 'setSetting',
                key: 'pollUsage',
                value: (e.target as HTMLInputElement).checked,
              })
            }
          />
          <span>Nutzungskontingente regelmäßig aktualisieren</span>
        </label>
      </section>
    </div>
  );
}
