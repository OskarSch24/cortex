import * as vscode from 'vscode';
import { join } from 'node:path';
import { HistoryBridge } from '../../history/bridge.js';
import { ComputerHistoryService } from '../../history/service.js';
import type { HistorySettings } from '../../history/types.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Der lokale Computerverlauf. Die Brücke selbst bleibt Feld des Providers
 * (`computerHistoryBridge`): der Test setzt dort eine eigene ein.
 */
export interface HistoryHost extends PanelHost {
  computerHistoryBridge: HistoryBridge<vscode.Webview> | undefined;
  historyBridge(): HistoryBridge<vscode.Webview>;
}

/** Legt Dienst, Statusanzeige und Brücke an — genau einmal, beim ersten Bedarf. */
export function startHistoryBridge(host: HistoryHost): HistoryBridge<vscode.Webview> {
  const indicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
  indicator.name = 'Cortex Computerverlauf';
  indicator.command = 'cortex.pauseComputerHistory';
  let indicatorLive = true;
  let indicatorPending = false;
  const updateIndicator = async () => {
    if (!indicatorLive || indicatorPending) return;
    indicatorPending = true;
    try {
      const state = await service.state();
      if (!indicatorLive) return;
      if (!state.settings.enabled) { indicator.hide(); return; }
      indicator.text = state.running ? '$(record) Verlauf lokal' : '$(history) Verlauf wartet';
      indicator.tooltip = `${state.status} — Klicken, um die Erfassung zu pausieren.`;
      indicator.show();
    } catch { if (indicatorLive) indicator.hide(); }
    finally { indicatorPending = false; }
  };
  const service = new ComputerHistoryService({
    directory: join(host.ctx.globalStorageUri.fsPath, 'computer-history'),
    helperPath: join(host.ctx.extensionUri.fsPath, 'dist', 'history-tool'),
    secrets: host.ctx.secrets,
    loadSettings: () => host.ctx.globalState.get<HistorySettings>('cortex.computerHistory.v1'),
    saveSettings: settings => host.ctx.globalState.update('cortex.computerHistory.v1', settings),
    changed: () => { void host.computerHistoryBridge?.notify(); void updateIndicator(); },
  });
  host.ctx.subscriptions.push(
    { dispose: () => { indicatorLive = false; indicator.dispose(); } },
    vscode.commands.registerCommand('cortex.pauseComputerHistory', () => service.configure({ enabled: false })),
  );
  host.computerHistoryBridge = new HistoryBridge(service,
    (webview, message) => host.post(webview, message), webview => host.surfaces.has(webview));
  void service.start().then(async () => { await host.computerHistoryBridge?.notify(); await updateIndicator(); }).catch(() => {
    // No captured content or native-process diagnostics in the general output channel.
    host.output.appendLine('[computer-history] Lokaler Verlauf konnte nicht gestartet werden.');
  });
  return host.computerHistoryBridge;
}

export const historyTable = {
  computerHistory: async (msg, { webview }, host) => {
    await host.historyBridge().handle(msg, webview);
  },
} satisfies DomainTable<'computerHistory', HistoryHost>;
