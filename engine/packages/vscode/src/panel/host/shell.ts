import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Surface } from '../panelTypes.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/** Hülle und Navigation: Seitenwechsel, Reiter, Einstellungen und alles, was Cortex nach außen öffnet. */

export interface ShellHost extends PanelHost {
  hydrate(webview: vscode.Webview, surface: Surface): void;
  pushTitlebarContext(): Thenable<unknown>;
  openAccountsTab(): void;
  openRulesTab(): void;
  openAnalyticsTab(): void;
}

/**
 * Diese Werkzeuge bedienen ausschließlich die Hauptfläche im Chatmodus.
 * Sichtbar statt aktiv: Browser und Terminal dürfen den Fokus übernehmen,
 * ohne dass dabei ihre Schließen-Schalter aus der Titelleiste verschwinden.
 */
export function titlebarContext(host: PanelHost): Thenable<unknown> {
  const panel = host.agentPanel;
  const chatVisible = Boolean(panel?.visible && host.surfaces.get(panel.webview)?.page === 'chat');
  return vscode.commands.executeCommand('setContext', 'cortex.chatToolsVisible', chatVisible);
}

export const shellTable = {
  pageChanged: async (msg, { webview, surface }, host) => {
    // Andere Webviews dürfen den Kontext der Hauptfläche nicht ändern.
    if (surface.mode !== 'agent' || webview !== host.agentPanel?.webview) return;
    if (!['chat', 'accounts', 'settings', 'plugins', 'exokortex', 'agents', 'automations'].includes(msg.page)) return;
    surface.page = msg.page;
    await host.pushTitlebarContext();
  },
  ready: (_msg, { webview, surface }, host) => {
    host.hydrate(webview, surface);
  },
  openAccounts: (_msg, _cx, host) => {
    host.openAccountsTab();
  },
  workbenchAction: async msg => {
    const commands = { split: 'workbench.action.splitEditor', close: 'workbench.action.closeActiveEditor', commands: 'workbench.action.showCommands' };
    const command = commands[msg.action];
    if (command) await vscode.commands.executeCommand(command);
  },
  openNativeSettings: async msg => {
    if (msg.query === '@extensions') await vscode.commands.executeCommand('workbench.view.extensions');
    else if (msg.query === '@keybindings') await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
    else if (msg.query === '@json') await vscode.commands.executeCommand('workbench.action.openSettingsJson');
    else await vscode.commands.executeCommand('workbench.action.openSettings', msg.query ?? '');
  },
  openLicenses: async (_msg, _cx, host) => {
    const license = vscode.Uri.joinPath(host.ctx.extensionUri, 'LICENSE');
    if (existsSync(license.fsPath)) await vscode.commands.executeCommand('vscode.open', license);
    else void vscode.window.showInformationMessage('Cortex steht unter der MIT-Lizenz. Die Hinweise zu gebündelten Abhängigkeiten liegen im Paket.');
  },
  detectImports: (_msg, { webview }, host) => {
    // Nur nachsehen, nichts lesen: ob der Ordner eines anderen Werkzeugs da ist.
    const candidates = [
      { id: 'claude-code', name: 'Claude Code', path: join(homedir(), '.claude') },
      { id: 'codex', name: 'Codex', path: join(homedir(), '.codex') },
      { id: 'cursor', name: 'Cursor', path: join(homedir(), '.cursor') },
      { id: 'grok', name: 'Grok', path: join(homedir(), '.grok') },
    ];
    host.post(webview, { kind: 'imports', found: candidates.filter(c => existsSync(c.path)) });
  },
  openKeybindings: async msg => {
    await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', msg.query ?? '');
  },
  openSettings: (_msg, _cx, host) => {
    if (host.agentPanel) {
      host.post(host.agentPanel.webview, { kind: 'showPage', page: 'settings' });
      host.reveal(host.agentPanel);
    }
  },
  openRules: (_msg, _cx, host) => {
    host.openRulesTab();
  },
  openAnalytics: (_msg, _cx, host) => {
    host.openAnalyticsTab();
  },
  openEditor: async () => {
    await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
    await vscode.commands.executeCommand('workbench.action.quickOpen');
  },
  openCode: async msg => {
    const aliases: Record<string, string> = { ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact', py: 'python', sh: 'shellscript', bash: 'shellscript', yml: 'yaml', md: 'markdown' };
    const requested = msg.language ? aliases[msg.language] ?? msg.language : 'plaintext';
    const language = (await vscode.languages.getLanguages()).includes(requested) ? requested : 'plaintext';
    const doc = await vscode.workspace.openTextDocument({ content: msg.text, language });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
  },
  showDatabaseStudio: async () => {
    await vscode.commands.executeCommand('cortex.databaseStudio.status');
  },
  openExternal: async msg => {
    // Nur http(s): eine Katalogangabe darf kein beliebiges Schema öffnen.
    if (/^https?:\/\//.test(msg.url)) await vscode.env.openExternal(vscode.Uri.parse(msg.url));
  },
  openUrlIn: async (msg, { webview }, host) => {
    if (!/^https?:\/\//.test(msg.url)) return;
    if (msg.app === 'cortex') { await host.dispatch({ kind: 'openBrowser', url: msg.url }, webview); return; }
    if (msg.app === 'default') { await vscode.env.openExternal(vscode.Uri.parse(msg.url)); return; }
    // Ein ausdrücklich gewählter Browser, auf Klick des Nutzers.
    const app = msg.app === 'chrome' ? 'Google Chrome' : 'Safari';
    spawn('open', ['-a', app, msg.url], { stdio: 'ignore', detached: true }).on('error', () => {
      void vscode.window.showWarningMessage(`${app} ließ sich nicht öffnen.`);
    }).unref();
  },
} satisfies DomainTable<ShellKind, ShellHost>;

type ShellKind =
  | 'pageChanged' | 'ready' | 'openAccounts' | 'workbenchAction' | 'openNativeSettings' | 'openLicenses'
  | 'detectImports' | 'openKeybindings' | 'openSettings' | 'openRules' | 'openAnalytics' | 'openEditor'
  | 'openCode' | 'showDatabaseStudio' | 'openExternal' | 'openUrlIn';
