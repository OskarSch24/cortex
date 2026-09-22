import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { removeGeneratedImageBackground, resizeGeneratedImage } from '../../src/panel/nativeImages.js';
const helper = resolve('dist/cortex-image-tool');

describe('native image operations (#66–67)', () => {
  it.skipIf(process.platform !== 'darwin')('reports unsupported input clearly and preserves the original', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cx-format-'));
    try {
      const source = join(root, 'invalid.webp'); await writeFile(source, 'not an image');
      await expect(resizeGeneratedImage(source, 100, 100)).rejects.toThrow('WEBP-Datei');
      expect(await readFile(source, 'utf8')).toBe('not an image');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform !== 'darwin' || !existsSync(helper))('locally removes a real foreground background and produces an RGBA PNG', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cx-alpha-'));
    try {
      const source = join(root, 'original.jpg'); await copyFile(resolve('dev/bild-beispiel-1.jpg'), source);
      const original = await readFile(source);
      const output = await removeGeneratedImageBackground(source, helper);
      const result = await readFile(output);
      expect(result.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(result[25]).toBe(6);
      expect(await readFile(source)).toEqual(original);
      expect(output).not.toBe(source);
    } finally { await rm(root, { recursive: true, force: true }); }
  }, 100_000);
});
