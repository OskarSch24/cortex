import { open } from 'node:fs/promises';

export const MAX_PREVIEW_BYTES = 512 * 1024;

/** Read a bounded prefix; even a huge single-line JSON file stays cheap. */
export async function readFilePreview(path: string, maxLines = 400): Promise<{ text: string; truncated?: boolean }> {
  const file = await open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile()) throw new Error('Keine reguläre Datei.');
    const buffer = Buffer.alloc(Math.min(info.size, MAX_PREVIEW_BYTES + 1));
    let bytes = 0;
    while (bytes < buffer.length) {
      const read = await file.read(buffer, bytes, buffer.length - bytes, bytes);
      if (!read.bytesRead) break;
      bytes += read.bytesRead;
    }
    const cut = bytes > MAX_PREVIEW_BYTES;
    const prefix = buffer.subarray(0, Math.min(bytes, MAX_PREVIEW_BYTES));
    if (prefix.includes(0)) throw new Error('Binärdatei — Cortex zeigt sie nicht als Text.');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(prefix, { stream: cut }); }
    catch { throw new Error('Binärdatei oder unbekannte Textcodierung — bitte im Editor öffnen.'); }
    const limit = Math.min(Math.max(Math.trunc(maxLines) || 400, 1), 4000);
    const lines = text.split('\n', limit + 1);
    return { text: lines.slice(0, limit).join('\n'), truncated: cut || lines.length > limit || undefined };
  } finally { await file.close(); }
}
