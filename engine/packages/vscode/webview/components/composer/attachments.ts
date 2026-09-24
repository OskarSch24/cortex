import { vscode } from '../../vscodeApi.js';

/** Angehängte Videos tragen auf ihrer Vorschau ein kleines Abspielzeichen. */
export const VIDEO_FILE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

/** Ein Bild ohne Dateipfad an den Host, der es in Cortex' Ablage schreibt (imageAttachments.ts). */
export function readAsAttachment(file: File): void {
  if (file.size > 40 * 1024 * 1024) { vscode.postMessage({ kind: 'attachmentFailed', reason: 'unreadable' }); return; }
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === 'string' && vscode.postMessage({ kind: 'saveAttachmentData', name: file.name || 'Eingefügtes Bild.png', dataUrl: reader.result });
  reader.onerror = () => vscode.postMessage({ kind: 'attachmentFailed', reason: 'unreadable' });
  reader.readAsDataURL(file);
}
