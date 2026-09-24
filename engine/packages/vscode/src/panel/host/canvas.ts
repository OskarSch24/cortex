import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { asksForCanvas, canvasSections, shortId, touchesCanvas, CANVAS_LANG, type BriefSection, type SessionStore } from '@cortex/core';
import { saveImageData } from '../imageAttachments.js';
import { SAFE_ID } from '../panelTypes.js';
import type { WebviewToHost } from '../protocol.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was die Zeichenfläche vom Provider braucht. `canvasSeen` und `canvasSaved`
 * bleiben am Provider — Tests setzen und lesen sie dort.
 */
export interface CanvasPanelHost extends PanelHost {
  /** Excalidraw-Flächen, die gerade im Dock offen sind: Chat → ihr Inhalt als Text. */
  readonly canvasSeen: Map<string, string>;
  /** Beschreibung der gespeicherten Zeichnung eines Chats, `null` für keine. */
  readonly canvasSaved: Map<string, string | null>;
  readonly sessions: SessionStore;
  attachmentDir(): string;
}

/** Eine Datei je Chat im Speicher der Erweiterung; die Kennung wird nie ungeprüft ein Pfad. */
export function canvasFile(ctx: vscode.ExtensionContext, conversationId: string): string | undefined {
  if (!SAFE_ID.test(conversationId)) return undefined;
  return join(ctx.globalStorageUri.fsPath, 'canvas', `${conversationId}.json`);
}

/** Die Excalidraw-Fläche eines Chats: im Brief, für die Werkzeuge des Modells und in der Ablage. */
export class CanvasHost {
  constructor(readonly host: CanvasPanelHost) {}

  /**
   * Die Zeichenfläche im Brief: nur solange sie offen ist, oder wenn der
   * Auftrag mit `/excalidraw` beginnt — dann geht sie gerade erst auf.
   */
  canvasAbschnitte(conversationId: string, prompt: string): BriefSection[] {
    const seen = this.host.canvasSeen.get(conversationId);
    if (seen !== undefined) return canvasSections(seen, true);
    // Zu, aber mit Zeichnung: die Fläche gehört weiter zum Chat. Sonst baute
    // das Modell nach dem Schließen des Reiters (oder nach einem Neustart)
    // die nächste Ergänzung als HTML-Datei statt auf der Fläche.
    // Die Elementliste einer geschlossenen Fläche aber nur, wenn es um sie
    // geht — die Nachricht davon spricht oder die letzte Antwort gezeichnet hat.
    const saved = this.savedCanvasDescription(conversationId);
    if (saved !== undefined) {
      const lastAnswer = this.host.sessions.getHistory(conversationId).filter(t => t.role === 'assistant').at(-1)?.text ?? '';
      const onTopic = touchesCanvas(prompt) || lastAnswer.includes('```' + CANVAS_LANG);
      return canvasSections(saved, false, { noteOnly: !onTopic });
    }
    return asksForCanvas(prompt) ? canvasSections(undefined) : [];
  }

  /** Beschreibung der gespeicherten Zeichnung eines Chats, oder nichts, wenn er keine hat. */
  savedCanvasDescription(conversationId: string): string | undefined {
    if (!this.host.canvasSaved.has(conversationId)) {
      const file = canvasFile(this.host.ctx, conversationId);
      let description: string | null = null;
      try {
        const stored = JSON.parse(readFileSync(file!, 'utf8')) as { description?: string; scene?: string };
        if (typeof stored.description === 'string') description = stored.description;
        // Ältere Ablagen ohne Beschreibung: dass es eine Zeichnung gibt, zählt.
        else if (typeof stored.scene === 'string' && /"elements":\s*\[\s*\{/.test(stored.scene)) description = '(drawing saved before Cortex kept a description — ask the user to open the canvas if you need its details)';
      } catch { /* keine Zeichnung */ }
      this.host.canvasSaved.set(conversationId, description);
    }
    return this.host.canvasSaved.get(conversationId) ?? undefined;
  }

  /* ── Die Fläche für das Modell sichtbar ─────────────────────────────── */

  readonly canvasRequests = new Map<string, (answer: Extract<WebviewToHost, { kind: 'canvasAnswer' }>) => void>();
  /** Beschreibung der Fläche, deren Bild zuletzt mit einer Nachricht ging — unverändert geht es nicht noch einmal mit. */
  readonly canvasSentView = new Map<string, string>();

  /** Hat dieser Chat eine Zeichenfläche (offen oder gespeichert)? */
  canvasBelongs(conversationId: string): boolean {
    return this.host.canvasSeen.has(conversationId) || this.savedCanvasDescription(conversationId) !== undefined;
  }

  /**
   * Bild der Fläche, optional nachdem ein Block gezeichnet wurde — für die
   * Werkzeuge canvas_view / canvas_draw und für das Bild, das mit der
   * nächsten Nachricht geht. Die Webview zeichnet (offen im Dock oder im
   * Hintergrund); was im Hintergrund gezeichnet wurde, legt der Host ab.
   */
  async askCanvas(conversationId: string, code: string | undefined, timeoutMs = 60_000): Promise<{ png?: string; text: string; error?: string }> {
    const webview = this.host.agentPanel?.webview;
    if (!webview) return { text: '', error: 'Das Cortex-Fenster ist nicht offen — die Zeichenfläche kann gerade nicht gezeichnet werden.' };
    const file = canvasFile(this.host.ctx, conversationId);
    let scene: string | undefined;
    try { scene = file ? (JSON.parse(readFileSync(file, 'utf8')) as { scene?: string }).scene : undefined; } catch { /* noch keine */ }
    const reqId = shortId();
    const answer = await new Promise<Extract<WebviewToHost, { kind: 'canvasAnswer' }> | undefined>(resolve => {
      const timer = setTimeout(() => { this.canvasRequests.delete(reqId); resolve(undefined); }, timeoutMs);
      this.canvasRequests.set(reqId, a => { clearTimeout(timer); this.canvasRequests.delete(reqId); resolve(a); });
      this.host.post(webview, { kind: 'canvasRequest', reqId, conversationId, code, scene });
    });
    if (!answer) return { text: '', error: 'Die Zeichenfläche hat nicht rechtzeitig geantwortet.' };
    if (answer.error) return { text: answer.description, error: answer.error };
    if (answer.headless && code && answer.json && file && this.host.conversations.has(conversationId)) {
      await mkdir(dirname(file), { recursive: true });
      let applied: string[] = [];
      try { applied = (JSON.parse(readFileSync(file, 'utf8')) as { applied?: string[] }).applied ?? []; } catch { /* neu */ }
      await writeFile(file, JSON.stringify({ scene: answer.json, applied, description: answer.description }), 'utf8');
      this.host.canvasSaved.set(conversationId, answer.description.trim() ? answer.description : null);
    }
    if (this.host.canvasSeen.has(conversationId)) this.host.canvasSeen.set(conversationId, answer.description.slice(0, 20000));
    this.host.output.appendLine(`[zeichenflaeche] ${code ? 'gezeichnet' : 'angesehen'}${answer.headless ? ' (im Hintergrund)' : ''}, Bild ${answer.png ? `${Math.round(answer.png.length / 1024)} KB` : 'leer'}`);
    return { png: answer.png || undefined, text: answer.description };
  }

  /**
   * Das Bild der Fläche für die nächste Nachricht — nur, wenn der Chat eine
   * hat und sie sich seit dem letzten mitgeschickten Bild verändert hat.
   */
  async canvasViewForTurn(conversationId: string): Promise<string | undefined> {
    if (!this.canvasBelongs(conversationId)) return undefined;
    const view = await this.askCanvas(conversationId, undefined, 6000).catch(() => undefined);
    if (!view?.png || this.canvasSentView.get(conversationId) === view.text) return undefined;
    const path = await saveImageData(view.png, 'Zeichenflaeche.png', this.host.attachmentDir()).catch(() => undefined);
    if (path) this.canvasSentView.set(conversationId, view.text);
    return path;
  }

  async canvasMessage(webview: vscode.Webview, msg: Exclude<Extract<WebviewToHost, { kind: `canvas${string}` }>, { kind: 'canvasAnswer' }>): Promise<void> {
    const file = canvasFile(this.host.ctx, msg.conversationId);
    if (!file) return;
    switch (msg.kind) {
      case 'canvasLoad': {
        let stored: { scene?: string; applied?: string[] } = {};
        try { stored = JSON.parse(await readFile(file, 'utf8')) as typeof stored; } catch { /* noch keine Zeichnung */ }
        this.host.post(webview, { kind: 'canvasScene', conversationId: msg.conversationId, scene: typeof stored.scene === 'string' ? stored.scene : undefined, applied: Array.isArray(stored.applied) ? stored.applied.filter(k => typeof k === 'string') : [] });
        return;
      }
      case 'canvasVisible':
        if (msg.description === null) this.host.canvasSeen.delete(msg.conversationId);
        else this.host.canvasSeen.set(msg.conversationId, String(msg.description).slice(0, 20000));
        return;
      case 'canvasSave':
        // Erst der Text, dann die Platte: die nächste Nachricht soll den neuen
        // Stand sehen, auch wenn das Schreiben noch läuft.
        if (this.host.canvasSeen.has(msg.conversationId)) this.host.canvasSeen.set(msg.conversationId, String(msg.description ?? '').slice(0, 20000));
        if (!this.host.conversations.has(msg.conversationId) || typeof msg.scene !== 'string' || msg.scene.length > 30_000_000) return;
        await mkdir(dirname(file), { recursive: true });
        {
          const description = String(msg.description ?? '').slice(0, 20000);
          this.host.canvasSaved.set(msg.conversationId, description.trim() ? description : null);
          await writeFile(file, JSON.stringify({ scene: msg.scene, applied: (msg.applied ?? []).slice(-200), description }), 'utf8');
        }
        return;
      case 'canvasExport': {
        const title = (this.host.conversations.get(msg.conversationId)?.title || 'Zeichnung').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Zeichnung';
        const folder = this.host.projectRoot(msg.conversationId) ?? homedir();
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(join(folder, `${title}.${msg.format}`)),
          filters: msg.format === 'svg' ? { SVG: ['svg'] } : { Excalidraw: ['excalidraw'] },
          saveLabel: 'Sichern',
        });
        if (!target) return;
        await writeFile(target.fsPath, msg.content, 'utf8');
        void vscode.window.showInformationMessage(`Zeichnung gesichert: ${basename(target.fsPath)}`);
        return;
      }
    }
  }

  /** Die Zeichnung gehört zum Chat und geht mit ihm. */
  forget(conversationId: string): void {
    this.host.canvasSeen.delete(conversationId);
    this.host.canvasSaved.delete(conversationId);
    const canvas = canvasFile(this.host.ctx, conversationId);
    if (canvas) void rm(canvas, { force: true });
  }
}

type CanvasKind = 'canvasAnswer' | 'canvasLoad' | 'canvasSave' | 'canvasVisible' | 'canvasExport';

export const canvasTable = {
  canvasAnswer: (msg, _cx, canvas) => {
    canvas.canvasRequests.get(msg.reqId)?.(msg);
  },
  canvasLoad: (msg, { webview }, canvas) => canvas.canvasMessage(webview, msg),
  canvasSave: (msg, { webview }, canvas) => canvas.canvasMessage(webview, msg),
  canvasVisible: (msg, { webview }, canvas) => canvas.canvasMessage(webview, msg),
  canvasExport: (msg, { webview }, canvas) => canvas.canvasMessage(webview, msg),
} satisfies DomainTable<CanvasKind, CanvasHost>;
