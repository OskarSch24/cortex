import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveGeneratedImage } from '../../src/panel/imageArchive.js';
import { imageRoots, isGeneratedImage } from '../../src/panel/images.js';

describe('durable chat image archive (#71)', () => {
  it('survives deletion of the entire provider profile and keeps chats separate', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cx-media-'));
    try {
      const profile = join(root, 'profiles'), media = join(root, 'bilder');
      await mkdir(profile); const source = join(profile, '1.png'); await writeFile(source, 'image bytes');
      const first = await archiveGeneratedImage(source, media, 'chat-1');
      const same = await archiveGeneratedImage(source, media, 'chat-1');
      const other = await archiveGeneratedImage(source, media, '../../chat-2');
      expect(first).toBe(same); expect(other).not.toBe(first);
      expect(isGeneratedImage(first, imageRoots([], [media]))).toBe(true);
      await rm(profile, { recursive: true });
      expect(await readFile(first, 'utf8')).toBe('image bytes');
      expect(await readFile(other, 'utf8')).toBe('image bytes');
      expect(await archiveGeneratedImage(first, media, 'chat-1')).toBe(first);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('does not overwrite a previous image if a provider reuses a file path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cx-media-'));
    try {
      const source = join(root, '1.png'), media = join(root, 'media');
      await writeFile(source, 'version 1'); const a = await archiveGeneratedImage(source, media, 'chat');
      await writeFile(source, 'version 2'); const b = await archiveGeneratedImage(source, media, 'chat');
      expect(a).not.toBe(b); expect(await readFile(a, 'utf8')).toBe('version 1'); expect(await readFile(b, 'utf8')).toBe('version 2');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
