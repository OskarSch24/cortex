import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { asksForVideo, remotionSections, touchesVideo, type BriefSection } from '@cortex/core';
import { RemotionStudio } from '../../remotion/remotionStudio.js';
import type { HtmlPreviewServer } from '../htmlPreview.js';
import { SAFE_ID, projectlessDir } from '../panelTypes.js';
import type { DomainTable, PanelHost } from './dispatch.js';

export interface RemotionPanelHost extends PanelHost {
  readonly htmlPreview: HtmlPreviewServer;
}

/** Das Video eines Chats: Remotion-Projekt im Videoordner, Studio als Live-Vorschau im Dock. */
export class RemotionHost {
  private studioInstance?: RemotionStudio;
  readonly views = new Map<string, vscode.Webview>();
  /** `/remotion`-Aufträge, deren Projekt gerade angelegt wird: der Lauf wartet darauf. */
  private readonly preparing = new Map<string, Promise<void>>();

  constructor(private readonly host: RemotionPanelHost) {}

  get studio(): RemotionStudio {
    return this.studioInstance ??= new RemotionStudio({
      extensionPath: this.host.ctx.extensionUri.fsPath,
      preview: this.host.htmlPreview,
      root: id => this.host.projectRoot(id) ?? (SAFE_ID.test(id) ? projectlessDir(this.host.ctx.globalStorageUri.fsPath, id) : undefined),
      post: (id, state) => {
        const view = this.views.get(id) ?? this.host.agentPanel?.webview;
        if (view) this.host.post(view, { kind: 'remotionState', conversationId: id, state });
      },
      log: line => this.host.output.appendLine(`[remotion] ${line}`),
    });
  }

  dispose(): void {
    this.studioInstance?.dispose();
  }

  /**
   * `/remotion`: das Projekt samt Material steht, bevor der Agent loslegt —
   * die Vorschau im Reiter zeigt es sofort, der Agent baut darauf auf.
   * Die Nachricht erscheint sofort; nur der Lauf wartet, bis das Projekt steht.
   */
  prepare(id: string, attachments: string[]): void {
    const pending = this.studio.prepare(id, attachments)
      .catch(error => { this.host.output.appendLine(`[remotion] Vorbereiten fehlgeschlagen: ${String(error)}`); return []; })
      .then(() => undefined);
    this.preparing.set(id, pending);
    void pending.finally(() => { if (this.preparing.get(id) === pending) this.preparing.delete(id); });
  }

  /** Das Projekt, auf das ein Lauf noch wartet — oder nichts. */
  pending(id: string): Promise<void> | undefined {
    return this.preparing.get(id);
  }

  /**
   * Das Video im Brief: wenn der Auftrag mit `/remotion` beginnt, der Reiter
   * „Video“ offen ist, oder der Chat schon ein Videoprojekt hat und die
   * Nachricht davon handelt.
   */
  brief(conversationId: string, prompt: string): BriefSection[] {
    const open = this.studioInstance?.isOpen(conversationId) ?? false;
    const exists = this.studio.hasProject(conversationId);
    if (!asksForVideo(prompt) && !open && !(exists && touchesVideo(prompt))) return [];
    const folder = this.studio.folder(conversationId);
    this.host.output.appendLine(`[remotion] Brief für ${conversationId}: ${folder ?? 'kein Ordner'} (Projekt ${exists ? 'da' : 'neu'}, Reiter ${open ? 'offen' : 'zu'})`);
    return folder ? remotionSections({ folder, exists, open, material: this.studio.material(conversationId) }) : [];
  }
}

export const remotionTable = {
  remotionWatch: (msg, { webview }, remotion) => {
    if (msg.open) remotion.views.set(msg.conversationId, webview);
    remotion.studio.watch(msg.conversationId, msg.open);
  },
  remotionAction: async (msg, _cx, remotion) => {
    if (msg.action === 'render' || msg.action === 'restart') { await remotion.studio.action(msg.conversationId, msg.action); return; }
    if (msg.action === 'reveal' && !msg.file) {
      const folder = remotion.studio.folder(msg.conversationId);
      if (folder && existsSync(folder)) await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folder));
      return;
    }
    // Jeder Weg hinaus nur mit einer Datei, die wirklich im Videoordner liegt.
    const file = msg.file ? remotion.studio.videoPath(msg.conversationId, msg.file) : undefined;
    if (!file) return;
    if (msg.action === 'open') await vscode.env.openExternal(vscode.Uri.file(file));
    else if (msg.action === 'reveal') await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file));
    else {
      const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(join(homedir(), 'Movies', basename(file))), saveLabel: 'Sichern' });
      if (target) await vscode.workspace.fs.copy(vscode.Uri.file(file), target, { overwrite: true });
    }
  },
} satisfies DomainTable<'remotionWatch' | 'remotionAction', RemotionHost>;
