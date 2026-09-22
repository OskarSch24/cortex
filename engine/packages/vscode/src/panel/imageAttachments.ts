/**
 * Bild-Anhänge gehören Cortex, bevor sie ans Modell gehen.
 *
 * Ein Bildschirmfoto aus macOS' schwebender Vorschau liegt zunächst in einem
 * Zwischenordner (…/TemporaryItems/NSIRD_screencaptureui_…) und ist Sekunden
 * später fort; ein Bild aus einem fremden Ordner darf ein vorsichtiger Modus
 * gar nicht lesen. Deshalb wird jedes Bild in Cortex' eigenen Speicher kopiert
 * — und was die Anbieter nicht annehmen (HEIC, TIFF) oder zu groß ist, macht
 * macOS' `sips` zu einem JPEG von höchstens 2000 px.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, open, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';

export const IMAGE_FILE = /\.(png|jpe?g|gif|webp|heic|heif|tiff?|bmp)$/i;
const DIRECT = /\.(png|jpe?g|gif|webp)$/i;
/** Darüber wird verkleinert — Anthropic nimmt höchstens 5 MB, Base64 eingerechnet. */
const MAX_BYTES = 3_500_000;
/** Was die Webview als Inhalt schicken darf, wenn es keinen Pfad gibt. */
export const MAX_PASTED_BYTES = 40 * 1024 * 1024;

const safeName = (name: string) => basename(name).replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(-120) || 'Bild.png';

function sips(src: string, out: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '2000', src, '--out', out], { timeout: 20_000 }, err => resolve(!err));
  });
}

/** Enforce the limit on the same opened file even if a screenshot is replaced while reading. */
async function previewBytes(path: string, limit: number): Promise<Buffer | undefined> {
  if (!Number.isSafeInteger(limit) || limit < 1) return;
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit) return;
    const bytes = Buffer.alloc(Math.min(limit + 1, info.size + 1));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    // Growth after the initial stat is not a valid preview snapshot.
    if (offset > limit || offset > info.size) return;
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

/** Preview originals before sending too; conversion never changes the attachment. */
export async function imagePreviewData(path: string, maxBytes = 2 * 1024 * 1024): Promise<string | undefined> {
  const mime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.bmp': 'image/bmp' };
  let temporary: string | undefined;
  try {
    const info = await stat(path);
    if (!info.isFile()) return;
    const size = info.size;
    const ext = extname(path).toLowerCase();
    const type = mime[ext];
    if (type) {
      const bytes = size <= maxBytes ? await previewBytes(path, maxBytes) : undefined;
      return bytes ? `data:${type};base64,${bytes.toString('base64')}` : undefined;
    }
    if (!/\.(heic|heif|tiff?)$/.test(ext) || size > MAX_PASTED_BYTES) return;
    temporary = await mkdtemp(join(tmpdir(), 'cortex-preview-'));
    const converted = join(temporary, 'preview.jpg');
    if (!await sips(path, converted)) return;
    const bytes = await previewBytes(converted, maxBytes);
    return bytes ? `data:image/jpeg;base64,${bytes.toString('base64')}` : undefined;
  } catch { return; }
  finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}

/**
 * Legt ein Bild in `dir` ab und gibt den neuen Pfad zurück — oder nichts, wenn
 * die Datei nicht (mehr) da ist. Andere Dateien bleiben, wo sie sind.
 */
export async function stageImage(path: string, dir: string): Promise<string | undefined> {
  if (!IMAGE_FILE.test(path)) return path;
  const size = await stat(path).then(s => s.size, () => -1);
  if (size < 0) return undefined;
  await mkdir(dir, { recursive: true });
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const name = safeName(path);
  if (DIRECT.test(path) && size <= MAX_BYTES) {
    const target = join(dir, `${stamp}-${name}`);
    await copyFile(path, target);
    return target;
  }
  const target = join(dir, `${stamp}-${name.slice(0, name.length - extname(name).length)}.jpg`);
  if (await sips(path, target)) return target;
  // Ohne sips (oder wenn es scheitert): wenigstens die Kopie, der Pfad bleibt gültig.
  const copy = join(dir, `${stamp}-${name}`);
  await copyFile(path, copy);
  return copy;
}

/** Ein Bild ohne Datei (aus der Zwischenablage oder der Screenshot-Vorschau) als Datei ablegen. */
export async function saveImageData(dataUrl: string, name: string, dir: string): Promise<string | undefined> {
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return undefined;
  const bytes = Buffer.from(m[2]!, 'base64');
  if (!bytes.length || bytes.length > MAX_PASTED_BYTES) return undefined;
  const ext = m[1] === 'image/jpeg' ? '.jpg' : m[1] === 'image/png' ? '.png' : m[1] === 'image/gif' ? '.gif' : m[1] === 'image/webp' ? '.webp' : extname(name) || '.png';
  const base = safeName(name).replace(/\.[^.]+$/, '') || 'Bild';
  await mkdir(dir, { recursive: true });
  const raw = join(dir, `${randomUUID()}-${base}${ext}`);
  await writeFile(raw, bytes, { flag: 'wx' });
  if (DIRECT.test(raw) && bytes.length <= MAX_BYTES) return raw;
  return stageImage(raw, dir);
}
