import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeContent, imageMediaType } from '@cortex/core';
import { imagePreviewData, saveImageData, stageImage } from '../../src/panel/imageAttachments.js';

// 1×1-PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

describe('Bild-Anhänge', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-anhang-'));

  it('kopiert ein Bild in die Ablage — das Original darf danach verschwinden', async () => {
    const src = join(dir, 'Bildschirmfoto 2026-09-18 um 17.05.12.png');
    writeFileSync(src, PNG);
    const staged = await stageImage(src, join(dir, 'ablage'));
    rmSync(src);
    expect(staged && existsSync(staged)).toBe(true);
    expect(staged).toContain('ablage');
  });

  it('meldet eine Datei, die nicht mehr da ist, statt still nichts zu schicken', async () => {
    expect(await stageImage(join(dir, 'weg.png'), join(dir, 'ablage'))).toBeUndefined();
  });

  it('lässt Nicht-Bilder, wo sie sind', async () => {
    const txt = join(dir, 'notiz.txt');
    writeFileSync(txt, 'x');
    expect(await stageImage(txt, join(dir, 'ablage'))).toBe(txt);
  });

  it('macht aus einem Bild ohne Datei (Zwischenablage) eine Datei', async () => {
    const path = await saveImageData(`data:image/png;base64,${PNG.toString('base64')}`, 'image.png', join(dir, 'ablage'));
    expect(path && statSync(path).size).toBe(PNG.length);
    expect(await saveImageData('kein bild', 'x.png', dir)).toBeUndefined();
  });

  it('überschreibt keine gleichnamigen gleichzeitig eingefügten Bilder', async () => {
    const paths = await Promise.all(Array.from({ length: 4 }, () => saveImageData(`data:image/png;base64,${PNG.toString('base64')}`, 'image.png', join(dir, 'parallel'))));
    expect(new Set(paths).size).toBe(4);
    expect(paths.every(path => path && statSync(path).size === PNG.length)).toBe(true);
  });

  it.runIf(process.platform === 'darwin')('wandelt, was Anbieter nicht annehmen (TIFF, HEIC), mit sips in JPEG', async () => {
    const png = join(dir, 'scan.png');
    writeFileSync(png, PNG);
    const tiff = join(dir, 'scan.tiff');
    execFileSync('/usr/bin/sips', ['-s', 'format', 'tiff', png, '--out', tiff], { stdio: 'ignore' });
    const staged = await stageImage(tiff, join(dir, 'ablage'));
    expect(staged?.endsWith('.jpg')).toBe(true);
    expect(imageMediaType(staged!)).toBe('image/jpeg');
  });

  it('erstellt SVG- und BMP-Vorschauen vor dem Senden und begrenzt die Größe', async () => {
    const svg = join(dir, 'diagram.svg');
    writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(await imagePreviewData(svg)).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(await imagePreviewData(svg, 2)).toBeUndefined();
    const bmp = join(dir, 'photo.bmp');
    writeFileSync(bmp, 'BM');
    expect(await imagePreviewData(bmp)).toMatch(/^data:image\/bmp;base64,/);
    expect(await imagePreviewData(join(dir, 'missing.heic'))).toBeUndefined();
  });
  it('liest nur reguläre Dateien und hält die Vorschaugrenze einschließlich des letzten Bytes ein', async () => {
    const exact = join(dir, 'bounded.png'); writeFileSync(exact, PNG);
    expect(await imagePreviewData(exact, PNG.length)).toMatch(/^data:image\/png;base64,/);
    expect(await imagePreviewData(exact, PNG.length - 1)).toBeUndefined();
    const folder = join(dir, 'folder.png'); mkdirSync(folder);
    expect(await imagePreviewData(folder)).toBeUndefined();
  });

  it.runIf(process.platform === 'darwin')('konvertiert Original-TIFF für die Vorschau ohne das Original zu ersetzen', async () => {
    const png = join(dir, 'preview-source.png'), tiff = join(dir, 'preview-source.tiff');
    writeFileSync(png, PNG);
    execFileSync('/usr/bin/sips', ['-s', 'format', 'tiff', png, '--out', tiff], { stdio: 'ignore' });
    const before = statSync(tiff).size;
    expect(await imagePreviewData(tiff)).toMatch(/^data:image\/jpeg;base64,/);
    expect(statSync(tiff).size).toBe(before);
  });

  it('schickt Bilder an Claude als Bild-Block vor dem Text', () => {
    const img = join(dir, 'a.png');
    writeFileSync(img, PNG);
    const content = claudeContent('Was siehst du?', [{ path: img, mediaType: imageMediaType(img)! }]) as Array<Record<string, unknown>>;
    expect(content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png' } });
    expect(content[1]).toEqual({ type: 'text', text: 'Was siehst du?' });
    expect(claudeContent('nur Text', undefined)).toBe('nur Text');
    expect(claudeContent('fehlt', [{ path: join(dir, 'weg.png'), mediaType: 'image/png' }])).toBe('fehlt');
  });
});
