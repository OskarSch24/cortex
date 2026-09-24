import * as vscode from 'vscode';
import type { Target } from '@cortex/core';
import { NATIVE_SETTINGS, validNativeSetting } from '../nativeSettings.js';
import { APP_SETTINGS_KEY, PINNED_KEY, defaultModel } from '../panelTypes.js';
import type { AccountStatusDto, HostToWebview } from '../protocol.js';
import type { DomainTable, PanelHost } from './dispatch.js';

export function modesMessage(): HostToWebview {
  const config = vscode.workspace.getConfiguration('cortex');
  return {
    kind: 'modes',
    permissionMode: config.get<string>('permissionMode', 'safe'),
    routingMode: config.get<'auto' | 'manual'>('routingMode', 'auto'),
    askPermission: config.get<boolean>('askPermission', false),
    pollUsage: config.get<boolean>('pollUsage', true),
  };
}

/** Jede offene Fläche bekommt die Modi neu — jede ihre eigene, frisch gelesene Nachricht. */
function pushModes(host: PanelHost): void {
  for (const [w] of host.surfaces) host.post(w, modesMessage());
}

/**
 * Einstellungen, Modi und das gewählte Modell.
 *
 * Schreibvorgänge laufen nacheinander (`settingsWrites`), und jede Antwort an
 * die Webview trägt eine fortlaufende Revision — so überholt eine späte
 * Bestätigung nie einen neueren Stand.
 */
export class SettingsHost {
  private settingsWrites: Promise<void> = Promise.resolve();
  private settingsRevision = 0;
  onPinnedChanged?: (target: Target | undefined) => void;

  constructor(readonly host: PanelHost) {}

  /** Werte der Einstellungsseiten ohne eigenen `cortex.*`-Schalter. */
  appSettings(): Record<string, unknown> {
    return this.host.ctx.globalState.get<Record<string, unknown>>(APP_SETTINGS_KEY, {});
  }

  /** Eine Änderung hinten an die Schlange — erst wenn die vorige durch ist, auch wenn sie scheiterte. */
  private serialized(write: () => Promise<void>): Promise<void> {
    this.settingsWrites = this.settingsWrites.then(write, write);
    return this.settingsWrites;
  }

  nextRevision(): number {
    return ++this.settingsRevision;
  }

  async storeAppSetting(key: string, value: unknown, requestId?: string): Promise<void> {
    const write = async () => {
      let error: string | undefined;
      try {
        if (!/^[a-zA-Z][\w.:/-]{0,160}$/.test(key)) throw new Error('Ungültiger Einstellungsschlüssel.');
        const next = { ...this.appSettings() };
        if (value === undefined || value === null) delete next[key];
        else {
          const encoded = JSON.stringify(value);
          if (encoded === undefined || encoded.length > 64_000) throw new Error('Einstellungswert ist zu groß.');
          next[key] = JSON.parse(encoded);
        }
        await this.host.ctx.globalState.update(APP_SETTINGS_KEY, next);
      } catch (failure) { error = String(failure); }
      const message: HostToWebview = { kind: 'appSettings', values: this.appSettings(), revision: ++this.settingsRevision, ack: requestId ? { key, requestId, error } : undefined };
      for (const [w] of this.host.surfaces) this.host.post(w, message);
      if (error) void vscode.window.showErrorMessage(error);
    };
    await this.serialized(write);
  }

  async setNativeSetting(key: string, value: unknown, requestId?: string): Promise<void> {
    const write = async () => {
      let error: string | undefined;
      try {
        if (!validNativeSetting(key, value)) throw new Error('Ungültiger Einstellungswert.');
        await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
      } catch (failure) { error = String(failure); }
      const ack = requestId ? { key, requestId, error } : undefined;
      for (const [w] of this.host.surfaces) this.pushNativeSettings(w, error, ack);
    };
    await this.serialized(write);
  }

  pushNativeSettings(webview: vscode.Webview, error?: string, ack?: { key: string; requestId: string; error?: string }): void {
    const config = vscode.workspace.getConfiguration();
    const values = Object.fromEntries(NATIVE_SETTINGS.map(setting => {
      const inspected = config.inspect(setting.key);
      return [setting.key, inspected?.globalValue ?? inspected?.defaultValue];
    }));
    this.host.post(webview, { kind: 'nativeSettings', values, error, revision: ++this.settingsRevision, ack });
  }

  pinnedTarget(id = this.host.visibleConversationId()): Target | undefined {
    const rec = id ? this.host.conversations.get(id) : undefined;
    return rec ? rec.pinnedTarget : this.host.ctx.globalState.get<Target>(PINNED_KEY);
  }

  /**
   * Was der Modellknopf zeigt und womit gesendet wird: die eigene Wahl, sonst
   * das neueste Opus auf dem ersten Claude-Konto, das gerade Aufträge annehmen kann. Die
   * Vorgabe wird nicht gespeichert — `pinnedTarget` bleibt leer, damit eine
   * zweite Meinung weiter nur dann entfällt, wenn wirklich jemand gewählt hat.
   * Eine Wahl ohne Modell auf einem Claude-Konto bekommt ebenfalls das neueste Opus.
   */
  shownTarget(id = this.host.visibleConversationId()): Target | undefined {
    const pinned = this.pinnedTarget(id);
    if (pinned?.model || (pinned && pinned.provider !== 'claude')) return pinned;
    const usable = (a: AccountStatusDto) => a.provider === 'claude' && !a.reviewOnly && a.authState !== 'expired';
    const claude = pinned
      ? this.host.accountDtos().find(a => usable(a) && a.label === pinned.account)
      : this.host.accountDtos().find(a => usable(a) && a.available) ?? this.host.accountDtos().find(usable);
    return claude ? { provider: 'claude', account: claude.label, model: defaultModel() } : pinned;
  }

  pinnedMessage(id = this.host.visibleConversationId()): HostToWebview {
    return { kind: 'pinnedTarget', target: this.shownTarget(id), standard: !this.pinnedTarget(id) };
  }

  async setPinnedTarget(target: Target | undefined, id = this.host.visibleConversationId()): Promise<void> {
    const rec = id ? this.host.conversations.get(id) : undefined;
    if (rec) { rec.pinnedTarget = target; this.host.persistSoon(); }
    else await this.host.ctx.globalState.update(PINNED_KEY, target);
    const shown = this.shownTarget(id);
    this.onPinnedChanged?.(shown);
    for (const [webview, surface] of this.host.surfaces) {
      if ((surface.mode === 'tab' || surface.mode === 'agent') && (!id || surface.conversationId === id)) {
        this.host.post(webview, this.pinnedMessage(id));
      }
    }
  }

  pushPinned(): void {
    for (const [webview, surface] of this.host.surfaces) {
      if (surface.mode === 'tab' || surface.mode === 'agent') this.host.post(webview, this.pinnedMessage(surface.conversationId));
    }
  }
}

type SettingsKind =
  | 'getNativeSettings' | 'setNativeSetting' | 'getAppSettings' | 'setAppSetting' | 'pickAppSettingFolder'
  | 'setSetting' | 'setAskPermission' | 'setModes' | 'setPinnedTarget';

export const settingsTable = {
  getNativeSettings: (_msg, { webview }, settings) => {
    settings.pushNativeSettings(webview);
  },
  setNativeSetting: async (msg, _cx, settings) => {
    await settings.setNativeSetting(msg.key, msg.value, msg.requestId);
  },
  getAppSettings: (_msg, { webview }, settings) => {
    settings.host.post(webview, { kind: 'appSettings', values: settings.appSettings(), revision: settings.nextRevision() });
  },
  setAppSetting: async (msg, _cx, settings) => {
    await settings.storeAppSetting(msg.key, msg.value, msg.requestId);
  },
  pickAppSettingFolder: async (msg, _cx, settings) => {
    const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Auswählen' });
    if (picked?.[0]) await settings.storeAppSetting(msg.key, picked[0].fsPath);
  },
  setSetting: async (msg, _cx, settings) => {
    await vscode.workspace
      .getConfiguration('cortex')
      .update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
    pushModes(settings.host);
  },
  setAskPermission: async (msg, _cx, settings) => {
    await vscode.workspace
      .getConfiguration('cortex')
      .update('askPermission', msg.ask, vscode.ConfigurationTarget.Global);
    // Every open surface reflects the switch, not just the one clicked.
    pushModes(settings.host);
  },
  setModes: async (msg, _cx, settings) => {
    const config = vscode.workspace.getConfiguration('cortex');
    if (msg.permissionMode) {
      await config.update('permissionMode', msg.permissionMode, vscode.ConfigurationTarget.Global);
    }
    if (msg.routingMode) {
      await config.update('routingMode', msg.routingMode, vscode.ConfigurationTarget.Global);
    }
    // Stufe und Nachfragen kommen aus einem Menüpunkt, also in einer
    // Nachricht. Als zwei Nachrichten meldete die erste den Stand zurück,
    // bevor die zweite gespeichert war — das Menü sprang auf den alten
    // Modus, und man musste zweimal wählen.
    if (msg.ask !== undefined) {
      await config.update('askPermission', msg.ask, vscode.ConfigurationTarget.Global);
      pushModes(settings.host);
    }
  },
  setPinnedTarget: async (msg, { surface }, settings) => {
    const next = msg.target
      ? {
          provider: msg.target.provider as Target['provider'],
          account: msg.target.account,
          model: msg.target.model,
        }
      : undefined;
    await settings.setPinnedTarget(next, surface.conversationId);
  },
} satisfies DomainTable<SettingsKind, SettingsHost>;
