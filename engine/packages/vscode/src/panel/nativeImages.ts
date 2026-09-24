import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const run = promisify(execFile);

/** Ein neuer PNG-Pfad im Ordner `cortex-edits` neben dem Bild; der Ordner entsteht bei Bedarf. */
async function editPath(source: string, prefix: string): Promise<string> {
  const folder = join(dirname(source), 'cortex-edits');
  await mkdir(folder, { recursive: true });
  return join(folder, `${prefix}${randomUUID()}.png`);
}

/** Lässt `write` eine neue Datei in `cortex-edits` anlegen; scheitert es, verschwindet der Rest, und `failure` sagt, warum. */
async function newEdit(source: string, write: (destination: string) => Promise<unknown>, failure: (error: unknown) => Error): Promise<string> {
  const destination = await editPath(source, '');
  try {
    await write(destination);
    return destination;
  } catch (error) {
    await rm(destination, { force: true });
    throw failure(error);
  }
}

export function validImageSize(width: number, height: number): boolean {
  return [width, height].every(n => Number.isInteger(n) && n >= 1 && n <= 8192) && width * height <= 32_000_000;
}

/** Lokale Pixeländerung, ohne Modellaufruf und ohne das Original anzufassen. */
export async function resizeGeneratedImage(source: string, width: number, height: number): Promise<string> {
  if (!validImageSize(width, height)) throw new Error('Wähle 1 bis 8192 Pixel je Kante und höchstens 32 Megapixel.');
  if (process.platform !== 'darwin') throw new Error('Die lokale Größenänderung ist auf macOS verfügbar.');
  return newEdit(source, destination => run('/usr/bin/sips', ['-s', 'format', 'png', '-z', String(height), String(width), source, '--out', destination], { timeout: 30_000 }), (error) => {
    const format = extname(source).slice(1).toUpperCase() || 'Bild';
    return new Error(`Diese macOS-Version konnte die ${format}-Datei nicht in PNG umwandeln und skalieren. Exportiere sie zuerst als PNG oder JPEG und versuche es erneut. Das Original bleibt unverändert.`, { cause: error });
  });
}

/** PNG-Daten in die Zwischenablage, nie bloß der Dateipfad. */
export async function copyGeneratedImage(source: string): Promise<void> {
  if (process.platform !== 'darwin') throw new Error('Das Kopieren von Bildern ist auf macOS verfügbar.');
  const png = await editPath(source, 'clipboard-');
  try {
    await run('/usr/bin/sips', ['-s', 'format', 'png', source, '--out', png], { timeout: 30_000 });
    await run('/usr/bin/osascript', ['-e', 'on run argv\nset the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)\nend run', png], { timeout: 10_000 });
  } finally {
    await rm(png, { force: true });
  }
}

/** Native foreground segmentation; never sends the image to a provider. */
export async function removeGeneratedImageBackground(source: string, helperPath: string, signal?: AbortSignal): Promise<string> {
  if (process.platform !== 'darwin') throw new Error('Lokales Freistellen ist auf macOS 14 oder neuer verfügbar.');
  return newEdit(source, destination => run(helperPath, ['remove-background', source, destination], { timeout: 90_000, maxBuffer: 1024 * 1024, signal }), (error) => {
    const failure = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
    return new Error(failure.code === 'ENOENT' ? 'Der lokale Bildhelfer fehlt. Bitte Cortex neu bauen oder aktualisieren.'
      : failure.killed ? 'Das lokale Freistellen dauerte zu lange. Bitte mit einem kleineren Bild erneut versuchen.'
        : failure.stderr?.trim() || 'Der Hintergrund konnte lokal nicht entfernt werden.', { cause: error });
  });
}
