import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { readFilePreview } from '../filePreview.js';
import type { HtmlPreviewServer } from '../htmlPreview.js';
import { collectDiff, expandHome, projectFile } from '../workspace.js';
import { xcodeTarget } from '../xcode.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/** Dateien und Dock: Änderungen, Vorschau, Öffnen — jeder Pfad aus der Webview geht noch einmal durch `projectFile`. */
export interface FilesHost extends PanelHost {
  readonly htmlPreview: HtmlPreviewServer;
  openTerminalDock(cwd?: string): void;
  pushWorkspace(webview: vscode.Webview, directory?: string): Promise<void>;
}

type FileKind = 'getDiff' | 'readFileBody' | 'previewFile' | 'fileAction' | 'openDiffFile' | 'inspectWorkspace' | 'openWorkspaceFile';

export const fileTable = {
  getDiff: async (_msg, { webview, surface }, host) => {
    const root = host.projectRoot(surface.conversationId);
    const id = surface.conversationId ?? '';
    try {
      host.post(webview, { kind: 'diff', conversationId: id, files: await collectDiff(root) });
    } catch (error) {
      host.post(webview, { kind: 'diff', conversationId: id, files: [], error: (error as Error).message });
    }
  },
  readFileBody: async (msg, { webview, surface }, host) => {
    // Der Inhalt einer gelesenen Datei, damit die Prüfansicht sie zeigen
    // kann, ohne dass der Nutzer den Editor öffnen muss. Gedeckelt: eine
    // 40-MB-Datei gehört nicht durch die Nachrichtenbrücke.
    const root = host.projectRoot(surface.conversationId);
    if (!root) { host.post(webview, { kind: 'fileBody', path: msg.path, error: 'Kein Projektordner.' }); return; }
    try {
      const file = await projectFile(root, msg.path);
      host.post(webview, { kind: 'fileBody', path: msg.path, ...await readFilePreview(file, msg.maxLines) });
    } catch (error) {
      host.post(webview, { kind: 'fileBody', path: msg.path, error: (error as Error).message });
    }
  },
  previewFile: async (msg, { webview, surface }, host) => {
    // Eine HTML-Datei zeigt das Dock als Seite. Sie geht nicht als Text
    // durch die Nachrichtenbrücke, sondern über den eigenen Server —
    // warum, steht in htmlPreview.ts.
    const root = host.projectRoot(surface.conversationId);
    if (!root) { host.post(webview, { kind: 'filePreview', path: msg.path, error: 'Kein Projektordner.' }); return; }
    try {
      host.post(webview, { kind: 'filePreview', path: msg.path, url: await host.htmlPreview.url(root, msg.path) });
    } catch (error) {
      host.post(webview, { kind: 'filePreview', path: msg.path, error: (error as Error).message });
    }
  },
  fileAction: async (msg, { surface }, host) => {
    // Der geteilte Knopf „Öffnen“ im Dock. Jeder Zweig verlässt Cortex —
    // deshalb steht der Pfad hier noch einmal durch `projectFile`, statt
    // dem zu vertrauen, was die Webview geschickt hat.
    const root = host.projectRoot(surface.conversationId);
    if (!root) return;
    let file: string;
    try { file = await projectFile(root, msg.path); } catch { return; }
    if (msg.action === 'default') {
      await vscode.env.openExternal(vscode.Uri.file(file));
    } else if (msg.action === 'reveal') {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file));
    } else if (msg.action === 'terminal') {
      host.openTerminalDock(dirname(file));
    } else if (msg.action === 'xcode') {
      // Das Projekt über der Datei, nicht die lose Datei: nur so baut Xcode sie auch.
      execFile('open', ['-a', 'Xcode', xcodeTarget(file, root)], (error) => {
        if (error) void vscode.window.showErrorMessage('Xcode ließ sich nicht öffnen. Liegt es unter Programme?');
      });
    } else {
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(join(homedir(), 'Downloads', basename(file))),
        saveLabel: 'Sichern',
      });
      if (target) await vscode.workspace.fs.copy(vscode.Uri.file(file), target, { overwrite: true });
    }
  },
  openDiffFile: async (msg, { surface }, host) => {
    const root = host.projectRoot(surface.conversationId);
    if (!root) return;
    const file = await projectFile(root, msg.path);
    await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
  },
  inspectWorkspace: async (msg, { webview }, host) => {
    await host.pushWorkspace(webview, msg.directory);
  },
  openWorkspaceFile: async (msg, { surface }, host) => {
    const root = host.projectRoot(surface.conversationId);
    const record = surface.conversationId ? host.conversations.get(surface.conversationId) : undefined;
    const path = expandHome(msg.path);
    const attached = record?.log.some(event => event.kind === 'userEcho' && event.attachments?.includes(msg.path));
    // Was der Agent in diesem Chat selbst gelesen oder geschrieben hat, geht
    // auch außerhalb des Projekts auf — etwa ein Bildschirmfoto unter /tmp.
    const touched = isAbsolute(path) && record?.log.some(event => event.kind === 'toolUse' && event.path === msg.path);
    const file = attached || touched ? path : root ? await projectFile(root, path) : undefined;
    if (file) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.Beside, preview: true });
  },
} satisfies DomainTable<FileKind, FilesHost>;
