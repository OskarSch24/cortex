import { describe, expect, it } from 'vitest';
import { mkdtemp, copyFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { imagePrompt, sanitizeImageOptions } from '../../src/panel/images.js';
import { resizeGeneratedImage, validImageSize } from '../../src/panel/nativeImages.js';
import { conversationImages, selectionRegion } from '../../webview/components/imageWorkspaceState.js';

describe('Bildbearbeitung: Referenz und Auswahl', () => {
  it('übersetzt eine rückwärts gezogene Auswahl unabhängig vom Zoom', () => {
    expect(selectionRegion({ x: .8, y: .75 }, { x: .2, y: .25 })).toEqual({ x: .2, y: .25, width: .6000000000000001, height: .5 });
    expect(selectionRegion({ x: -.1, y: .1 }, { x: 1.5, y: .9 })).toEqual({ x: 0, y: .1, width: 1, height: .8 });
  });
  it('verhindert ungezieltes Entfernen bei ungültigen Koordinaten', () => {
    expect(sanitizeImageOptions({ edit: { kind: 'remove' } })).toBeUndefined();
    expect(sanitizeImageOptions({ edit: { kind: 'remove', region: { x: 0, y: NaN, width: .5, height: .5 } } })).toBeUndefined();
    expect(sanitizeImageOptions({ edit: { kind: 'remove', region: { x: 1, y: 0, width: 1, height: 1 } } })).toBeUndefined();
    expect(sanitizeImageOptions({ edit: { kind: 'remove', region: { x: .8, y: .9, width: .7, height: .7 } } })?.edit?.region).toMatchObject({ x: .8, y: .9 });
  });
  it('übergibt Quelle, Koordinaten und Erhalt des Originals an beide Anbieter', () => {
    for (const provider of ['codex', 'grok'] as const) {
      const text = imagePrompt('Entferne die Vase.', { ratio: '3:2', count: 1, edit: { kind: 'remove', region: { x: .2, y: .1, width: .3, height: .4 } } }, provider, ['/bilder/original.png']);
      expect(text).toContain('`/bilder/original.png`');
      expect(text).toContain('x=20%, y=10%, Breite=30%, Höhe=40%');
      expect(text).toContain('überschreibe niemals das Original');
      expect(text).toContain('Außerhalb des Bereichs');
    }
  });
  it('fordert echte Transparenz und verwendet den Bildverlauf bei Folgeänderungen', () => {
    expect(imagePrompt('Freistellen', { ratio: '1:1', count: 1, edit: { kind: 'background' } }, 'codex', ['/a.png'])).toContain('transparentem Alphakanal');
    expect(imagePrompt('Hänge ihm einen Bogen um', { ratio: '1:1', count: 1 }, 'grok')).toContain('tatsächlichen Dateipfad');
  });
  it('behält Bilder aus mehreren Antworten mit Anbieter und Zeit in Reihenfolge', () => {
    const images = conversationImages([
      { kind: 'assistant', messageId: 'a', segments: [], done: true, at: 1, target: { provider: 'grok', account: 'privat' }, images: [{ path: '/1.png', src: 'one' }] },
      { kind: 'user', text: 'Heller' },
      { kind: 'assistant', messageId: 'b', segments: [], done: true, at: 2, images: [{ path: '/2.png', src: 'two', edited: true }] },
    ]);
    expect(images.map(i => i.path)).toEqual(['/1.png', '/2.png']);
    expect(images[0]).toMatchObject({ provider: 'grok', at: 1 });
    expect(images[1]).toMatchObject({ edited: true, at: 2 });
  });
});

describe('Lokale Bildgröße', () => {
  it('begrenzt Dateigröße und lehnt ungültige Maße ab', () => {
    for (const size of [[0, 20], [NaN, 20], [10.5, 20], [8193, 20], [8192, 8192]]) expect(validImageSize(size[0]!, size[1]!)).toBe(false);
    expect(validImageSize(1920, 1080)).toBe(true);
  });
  it.skipIf(process.platform !== 'darwin')('erzeugt exakt 317 × 191 Pixel und erhält die Quelldatei bytegenau', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'cx-image-resize-'));
    try {
      const source = join(folder, 'original.jpg');
      await copyFile(resolve('dev/bild-beispiel-1.jpg'), source);
      const before = await readFile(source);
      const output = await resizeGeneratedImage(source, 317, 191);
      const { stdout } = await promisify(execFile)('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', output]);
      expect(stdout).toContain('pixelWidth: 317');
      expect(stdout).toContain('pixelHeight: 191');
      expect(await readFile(source)).toEqual(before);
      expect(output).not.toBe(source);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
});
