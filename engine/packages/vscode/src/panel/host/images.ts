import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, extname, join, relative } from 'node:path';
import { shortId } from '@cortex/core';
import { saveImageData } from '../imageAttachments.js';
import { archiveGeneratedImage } from '../imageArchive.js';
import { isGeneratedImage, isImageProvider, suggestedImageName } from '../images.js';
import { copyGeneratedImage, resizeGeneratedImage } from '../nativeImages.js';
import type { HostToWebview } from '../protocol.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/** Was Bilder und Anhänge vom Provider brauchen; die Wurzeln und Adressen bleiben dort, weil Tests sie ersetzen. */
export interface ImagesHost extends PanelHost {
  imageRoots(): string[];
  imageArchiveRoot(): string;
  /** Die Adresse, unter der eine Webview das Bild lädt; außerhalb der Wurzeln als Data-URI. */
  imageSrc(path: string): Promise<string | undefined>;
  /** Cortex' eigene Ablage für Bild-Anhänge (imageAttachments.ts). */
  attachmentDir(): string;
}

/** Anhänge, die im Eingabefeld ein Standbild statt einer Textzeile bekommen. */
const STILL_PREVIEW = /\.(mp4|mov|m4v|webm|mkv|avi|pdf)$/i;

/**
 * Ein Vorschaubild über QuickLook (`qlmanage -t`), dieselbe Quelle wie im
 * Finder — für Videos das Standbild, für PDFs die erste Seite. Liegt in einem
 * eigenen Wegwerfordner und geht als Data-URI an die Webview.
 */
export async function quickLookStill(path: string): Promise<string | undefined> {
  // Ohne Datei wartete qlmanage bis zur Zeitgrenze.
  if (!existsSync(path)) return undefined;
  const dir = join(tmpdir(), `cortex-still-${shortId()}`);
  try {
    await mkdir(dir, { recursive: true });
    await new Promise<void>((resolve, reject) => {
      execFile('/usr/bin/qlmanage', ['-t', '-s', '480', '-o', dir, path], { timeout: 8_000 }, error => (error ? reject(error) : resolve()));
    });
    const png = await readFile(join(dir, `${basename(path)}.png`));
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return undefined;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type ImageKind = 'setImageAccountOrder' | 'resizeImage' | 'imageAction' | 'saveAttachmentData' | 'attachmentFailed' | 'pickAttachments' | 'attachmentPreview';

/** Bilder im Chat und Anhänge im Eingabefeld. */
export const imageTable = {
  setImageAccountOrder: async (msg, _cx, host) => {
    if (!isImageProvider(msg.provider) || !Array.isArray(msg.accounts)) return;
    const known = new Set(host.accounts.all().filter(a => a.provider === msg.provider).map(a => a.label));
    const config = vscode.workspace.getConfiguration('cortex');
    const current = config.get<Record<string, string[]>>('imageAccountOrder', {});
    await config.update('imageAccountOrder', { ...current, [msg.provider]: msg.accounts.filter(l => typeof l === 'string' && known.has(l)) }, vscode.ConfigurationTarget.Global);
    host.pushAccounts();
  },
  resizeImage: async (msg, { surface }, host) => {
    const id = surface.conversationId;
    if (!id || !isGeneratedImage(msg.path, host.imageRoots()) || !existsSync(msg.path)) return;
    const rec = host.conversations.get(id);
    const original = rec?.log.find((event): event is Extract<HostToWebview, { kind: 'image' }> => event.kind === 'image' && event.path === msg.path);
    if (!original) return;
    try {
      const resized = await resizeGeneratedImage(msg.path, msg.width, msg.height);
      const path = await archiveGeneratedImage(resized, host.imageArchiveRoot(), id);
      const src = await host.imageSrc(path);
      if (!src || !host.conversations.has(id)) return;
      const messageId = shortId();
      const target = rec?.log.find(event => event.kind === 'routing' && event.messageId === original.messageId);
      const text = `Bildgröße auf ${msg.width} × ${msg.height} Pixel ändern.`;
      host.toConversation(id, { kind: 'userEcho', text, attachments: [msg.path], at: Date.now() });
      if (target?.kind === 'routing') host.toConversation(id, { ...target, messageId });
      host.toConversation(id, { kind: 'image', messageId, path, src, prompt: original.prompt, edited: true });
      host.toConversation(id, { kind: 'delta', messageId, text: `${msg.width} × ${msg.height} Pixel.` });
      host.toConversation(id, { kind: 'done', messageId, at: Date.now(), durationMs: 0, turn: false });
      await host.persistNow();
    } catch (error) {
      host.toConversation(id, { kind: 'notice', text: `Bildgröße konnte nicht geändert werden: ${error instanceof Error ? error.message : String(error)}` });
    }
  },
  imageAction: async (msg, { surface }, host) => {
    // Der Pfad kommt aus der Webview: nur Bilder aus den Ordnern der
    // Bildwerkzeuge verlassen sie in Richtung Finder oder Projekt.
    if (!isGeneratedImage(msg.path, host.imageRoots()) || !existsSync(msg.path)) return;
    const source = vscode.Uri.file(msg.path);
    if (msg.action === 'copy') {
      try { await copyGeneratedImage(msg.path); }
      catch (error) { void vscode.window.showErrorMessage(`Bild konnte nicht kopiert werden: ${error instanceof Error ? error.message : String(error)}`); }
    } else if (msg.action === 'reveal') {
      await vscode.commands.executeCommand('revealFileInOS', source);
    } else if (msg.action === 'open') {
      await vscode.env.openExternal(source);
    } else if (msg.action === 'saveAll') {
      const roots = host.imageRoots();
      const paths = [...new Set([msg.path, ...(msg.paths ?? [])])].filter(p => isGeneratedImage(p, roots) && existsSync(p));
      const root = host.projectRoot(surface.conversationId);
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        defaultUri: vscode.Uri.file(root ?? join(homedir(), 'Downloads')),
        openLabel: `${paths.length} Bilder hier speichern`,
      });
      const folder = picked?.[0];
      if (!folder) return;
      const base = suggestedImageName(msg.prompt, msg.path).replace(/\.[a-z]+$/i, '');
      let n = 0;
      for (const path of paths) {
        n++;
        let name = `${base}-${n}${extname(path).toLowerCase()}`;
        for (let k = 2; existsSync(join(folder.fsPath, name)); k++) name = `${base}-${n}-${k}${extname(path).toLowerCase()}`;
        await vscode.workspace.fs.copy(vscode.Uri.file(path), vscode.Uri.joinPath(folder, name), { overwrite: false });
      }
      void vscode.window.showInformationMessage(`${paths.length} Bilder gespeichert in ${root && !relative(root, folder.fsPath).startsWith('..') ? relative(root, folder.fsPath) || basename(root) : folder.fsPath}`);
    } else {
      const root = host.projectRoot(surface.conversationId);
      const name = suggestedImageName(msg.prompt, msg.path);
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(join(root ?? join(homedir(), 'Downloads'), name)),
        filters: { Bilder: [extname(msg.path).slice(1) || 'png'] },
        saveLabel: 'Speichern',
      });
      if (!target) return;
      await vscode.workspace.fs.copy(source, target, { overwrite: true });
      const shown = root && !relative(root, target.fsPath).startsWith('..') ? relative(root, target.fsPath) : target.fsPath;
      void vscode.window.showInformationMessage(`Bild gespeichert: ${shown}`);
    }
  },
  saveAttachmentData: async (msg, { webview }, host) => {
    // Ein Bild ohne Datei: aus der Zwischenablage oder aus macOS'
    // Screenshot-Vorschau gezogen. Es wird zur Datei in Cortex' Ablage.
    const path = typeof msg.dataUrl === 'string' ? await saveImageData(msg.dataUrl, String(msg.name ?? 'Bild.png'), host.attachmentDir()).catch(() => undefined) : undefined;
    host.output.appendLine(`[anhang] ${msg.name ?? 'Bild'} ohne Pfad → ${path ?? 'nicht gespeichert'}`);
    if (path) host.post(webview, { kind: 'attachments', paths: [path] });
    else void vscode.window.showWarningMessage('Das Bild konnte nicht übernommen werden (leer oder größer als 40 MB).');
  },
  attachmentFailed: (msg, _cx, host) => {
    host.output.appendLine(`[anhang] Ablegen ohne Ergebnis: ${msg.reason}`);
    void vscode.window.showWarningMessage(msg.reason === 'promise'
      ? 'Dieses Bildschirmfoto ist noch keine Datei. Warte, bis es auf dem Schreibtisch liegt, oder kopiere es (⌘C) und füge es mit ⌘V ein.'
      : 'Die abgelegte Datei konnte nicht übernommen werden.');
  },
  pickAttachments: async (_msg, { webview, surface }, host) => {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: true,
      openLabel: 'Attach',
      defaultUri: host.projectRoot(surface.conversationId) ? vscode.Uri.file(host.projectRoot(surface.conversationId)!) : undefined,
    });
    host.post(webview, {
      kind: 'attachments',
      paths: (picked ?? []).map((uri) => uri.fsPath),
    });
  },
  attachmentPreview: async (msg, { webview }, host) => {
    // Nur für die Vorschau im Eingabefeld. Sehr große Dateien bleiben
    // Textzeile, statt als Data-URI durch postMessage zu gehen.
    // Videos und PDFs bekommen ein Standbild von QuickLook, wie der Finder es zeigt.
    const size = await stat(msg.path).then(s => s.size, () => Infinity);
    const src = STILL_PREVIEW.test(msg.path)
      ? await quickLookStill(msg.path)
      : size <= 25 * 1024 * 1024 ? await host.imageSrc(msg.path) : undefined;
    host.post(webview, { kind: 'attachmentPreview', path: msg.path, src });
  },
} satisfies DomainTable<ImageKind, ImagesHost>;
