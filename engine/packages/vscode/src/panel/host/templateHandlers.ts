import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HostToWebview } from '../protocol.js';
import { duplicateTemplate, readTemplateEntries, renameTemplate, type TemplateEntry } from '../templates.js';
import type { HandlerTable, PanelHost } from './dispatch.js';

/** Vorlagen: die mitgelieferten Office-Vorlagen und die eigenen unter ~/.cortex/templates. */

/** Real Office templates ship with their previews and instructions; personal text templates still work. */
function templateEntries(host: PanelHost, webview: vscode.Webview): TemplateEntry[] {
  return readTemplateEntries(
    join(host.ctx.extensionUri.fsPath, 'templates'),
    join(homedir(), '.cortex', 'templates'),
    path => webview.asWebviewUri(vscode.Uri.file(path)).toString(),
  );
}

function readTemplates(host: PanelHost, webview: vscode.Webview): Extract<HostToWebview, { kind: 'templates' }>['items'] {
  return templateEntries(host, webview).map(entry => entry.item);
}

export const templateHandlers: HandlerTable<'getTemplates' | 'templateAction' | 'editTemplates'> = {
  getTemplates: (_msg, { host, webview }) => {
    host.post(webview, { kind: 'templates', items: readTemplates(host, webview) });
  },
  templateAction: async (msg, { host, webview }) => {
    const own = join(homedir(), '.cortex', 'templates');
    const found = templateEntries(host, webview).find(entry => msg.id ? entry.item.id === msg.id : entry.item.name === msg.name);
    if (!found) return;
    try {
      if (msg.action === 'duplicate') {
        duplicateTemplate(found, own);
      } else if (!found.item.own) {
        void vscode.window.showInformationMessage('Mitgelieferte Vorlagen lassen sich nicht ändern — dupliziere sie zuerst.');
      } else if (msg.action === 'delete') {
        await vscode.workspace.fs.delete(vscode.Uri.file(found.source), { useTrash: true, recursive: !!found.package });
      } else {
        const name = await vscode.window.showInputBox({ prompt: 'Neuer Name der Vorlage', value: found.item.name });
        if (name?.trim()) renameTemplate(found, name.trim());
      }
    } catch (error) {
      void vscode.window.showErrorMessage(`Vorlage konnte nicht geändert werden: ${error instanceof Error ? error.message : String(error)}`);
    }
    host.post(webview, { kind: 'templates', items: readTemplates(host, webview) });
  },
  editTemplates: async () => {
    const dir = join(homedir(), '.cortex', 'templates');
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
  },
};
