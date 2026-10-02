import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, relative, isAbsolute } from 'node:path';

/** Provider profiles are disposable; conversation media is not. */
export async function archiveGeneratedImage(source: string, mediaRoot: string, conversationId: string): Promise<string> {
  if (!/^\.(png|jpe?g|webp|gif|bmp|svg)$/.test(extname(source).toLowerCase())) throw new Error('Dieses Bildformat kann nicht im Chat gesichert werden.');
  return archiveMedia(source, mediaRoot, conversationId);
}

/** A video a model made lands next to the chat's images, kept the same way. */
export async function archiveGeneratedVideo(source: string, mediaRoot: string, conversationId: string): Promise<string> {
  if (!/^\.(mp4|webm|mov)$/.test(extname(source).toLowerCase())) throw new Error('Dieses Videoformat kann nicht im Chat gesichert werden.');
  return archiveMedia(source, mediaRoot, conversationId);
}

async function archiveMedia(source: string, mediaRoot: string, conversationId: string): Promise<string> {
  const root = resolve(mediaRoot);
  const rel = relative(root, resolve(source));
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) return source;
  const ext = extname(source).toLowerCase();
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
