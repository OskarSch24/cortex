import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, relative, isAbsolute } from 'node:path';

/** Provider profiles are disposable; conversation media is not. */
export async function archiveGeneratedImage(source: string, mediaRoot: string, conversationId: string): Promise<string> {
  const root = resolve(mediaRoot);
  const rel = relative(root, resolve(source));
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return source;
  const ext = extname(source).toLowerCase();
  if (!/^\.(png|jpe?g|webp|gif|bmp|svg)$/.test(ext)) throw new Error('Dieses Bildformat kann nicht im Chat gesichert werden.');
  const bytes = await readFile(source);
  const chat = createHash('sha256').update(conversationId).digest('hex').slice(0, 24);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const folder = join(root, chat);
  const destination = join(folder, `${digest}${ext}`);
  await mkdir(folder, { recursive: true });
  const temporary = join(folder, `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  return destination;
}
