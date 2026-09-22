import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { MAX_PREVIEW_BYTES, readFilePreview } from '../../src/panel/filePreview.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(body: string | Buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-preview-')); dirs.push(dir);
  const path = join(dir, 'data'); await writeFile(path, body); return path;
}
it('bounds a giant single line by bytes', async () => {
  const result = await readFilePreview(await fixture('x'.repeat(MAX_PREVIEW_BYTES * 3)), 4000);
  expect(result.text.length).toBe(MAX_PREVIEW_BYTES); expect(result.truncated).toBe(true);
});
it('does not split a UTF-8 character at the byte boundary', async () => {
  const result = await readFilePreview(await fixture('x'.repeat(MAX_PREVIEW_BYTES - 1) + '€end'));
  expect(result.text).not.toContain('�'); expect(result.text.endsWith('x')).toBe(true);
});
it('caps lines, keeps a small file unchanged and refuses binary', async () => {
  expect(await readFilePreview(await fixture('a\nb\nc'), 2)).toEqual({ text: 'a\nb', truncated: true });
  expect(await readFilePreview(await fixture('ä\nb'), 2)).toEqual({ text: 'ä\nb', truncated: undefined });
  await expect(readFilePreview(await fixture(Buffer.from([1, 0, 3])))).rejects.toThrow('Binärdatei');
});
