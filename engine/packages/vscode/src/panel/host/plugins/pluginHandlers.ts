import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { clientFromFields, ownClientRedirect } from '@cortex/core';
import type { DomainTable } from '../dispatch.js';
import type { PluginSetup } from './pluginSetup.js';

type PluginKind =
  | 'getPlugins' | 'installPlugin' | 'uninstallPlugin' | 'setPluginValues' | 'checkServer' | 'setPluginEnabled'
  | 'showPluginLog' | 'checkPlugin' | 'loginPlugin' | 'cancelPluginLogin' | 'logoutPlugin' | 'setPluginClient'
  | 'pickPluginClientFile' | 'pluginClientFile' | 'clearPluginClient' | 'copyPluginRedirect' | 'copyPluginDefinition';

/** Die Knöpfe der Plugin-Seite. Der Bereich ist PluginSetup; seine Seite (`setup.panel`) hält Katalog und Zustand. */
export const pluginTable = {
  getPlugins: async (_msg, { webview }, setup) => {
    await setup.panel.pushPlugins(webview);
  },
  installPlugin: async (msg, { webview }, setup) => {
    await setup.changePlugin(webview, msg.id, msg.scope, true, msg.values);
  },
  uninstallPlugin: async (msg, { webview }, setup) => {
    await setup.changePlugin(webview, msg.id, msg.scope, false);
  },
  setPluginValues: async (msg, { webview }, setup) => {
    await setup.setPluginValues(webview, msg.id, msg.values);
  },
  checkServer: (msg, _cx, setup) => {
    void setup.panel.checkServer(msg.server, true);
  },
  setPluginEnabled: async (msg, _cx, setup) => {
    await setup.host.pluginSwitches.set(msg.server, msg.enabled);
    if (msg.enabled) void setup.panel.checkServer(msg.server, false);
  },
  showPluginLog: (msg, _cx, setup) => {
    const result = setup.host.pluginConnections.get(msg.server);
    const channel = setup.panel.pluginLogChannel ??= vscode.window.createOutputChannel('Cortex Plugins');
    channel.appendLine(`── ${msg.server} · ${result?.checkedAt ? new Date(result.checkedAt).toLocaleString('de-DE') : 'nie geprüft'} ──`);
    channel.appendLine(result?.message ? `Ergebnis: ${result.message}` : `Ergebnis: ${result?.status ?? 'kein'}`);
    if (result?.detail) channel.appendLine(result.detail);
    channel.appendLine(result?.log ? result.log : '(Der Server hat nichts auf stderr geschrieben.)');
    for (const cli of result?.clis ?? []) channel.appendLine(`${cli.provider}:${cli.label} → ${cli.state}${cli.detail ? ` — ${cli.detail}` : ''}`);
    channel.appendLine('');
    channel.show(true);
  },
  checkPlugin: (msg, _cx, setup) => {
    const entry = setup.panel.catalog().find(e => e.id === msg.id);
    if (entry) void setup.panel.checkPlugin(entry, true);
  },
  loginPlugin: async (msg, { webview }, setup) => {
    await setup.loginPlugin(webview, msg.id, msg.account);
  },
  cancelPluginLogin: (msg, _cx, setup) => {
    const entry = setup.panel.catalog().find(e => e.id === msg.id);
    if (entry) setup.panel.pluginLogins.get(entry.server)?.abort.abort();
  },
  logoutPlugin: async (msg, { webview }, setup) => {
    await setup.logoutPlugin(webview, msg.id);
  },
  setPluginClient: async (msg, { webview }, setup) => {
    await setup.storePluginClient(webview, msg.id, clientFromFields(msg.clientId, msg.clientSecret));
  },
  pickPluginClientFile: async (msg, { webview }, setup) => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { 'OAuth-Client (JSON)': ['json'] },
      defaultUri: vscode.Uri.file(join(homedir(), 'Desktop')),
      openLabel: 'Client-Datei verwenden',
    });
    if (picked?.[0]) await setup.readPluginClientFile(webview, msg.id, picked[0].fsPath);
  },
  pluginClientFile: async (msg, { webview }, setup) => {
    await setup.readPluginClientFile(webview, msg.id, msg.path);
  },
  clearPluginClient: async (msg, { webview }, setup) => {
    const entry = setup.panel.catalog().find(e => e.id === msg.id);
    if (!entry) return;
    await setup.host.pluginCredentials.clear(entry.server, 'client');
    setup.host.pluginConnections.forget(entry.server);
    setup.panel.resyncProfiles();
    setup.host.post(webview, { kind: 'pluginProgress', id: msg.id, ok: true, message: `OAuth-Client für ${entry.name} entfernt — samt Anmeldung.` });
  },
  copyPluginRedirect: async (msg, { webview }, setup) => {
    const redirect = ownClientRedirect(setup.panel.catalog().find(e => e.id === msg.id)?.requires?.client?.redirectHost);
    await vscode.env.clipboard.writeText(redirect);
    setup.host.post(webview, { kind: 'pluginProgress', id: msg.id, ok: true, message: `Rückrufadresse kopiert: ${redirect}` });
  },
  copyPluginDefinition: async (msg, { webview }, setup) => {
    const entry = setup.panel.catalog().find(e => e.id === msg.id);
    if (!entry) return;
    // Der teilbare Teil eines Plugins ist seine Definition, nicht ein Link
    // auf einen Marktplatz, den es nicht gibt.
    await vscode.env.clipboard.writeText(
      JSON.stringify({ servers: { [entry.server]: entry.definition } }, null, 2),
    );
    setup.host.post(webview, {
      kind: 'pluginProgress', id: entry.id, ok: true,
      message: `Serverdefinition für ${entry.name} kopiert.`,
    });
  },
} satisfies DomainTable<PluginKind, PluginSetup>;
