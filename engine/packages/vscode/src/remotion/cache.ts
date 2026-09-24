import { existsSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cortexHome } from '../paths.js';
import { runFile } from '../util/exec.js';
import { FILES, REMOTION_VERSION } from './projectFiles.js';

/** Der gemeinsame Paketvorrat — einmal installiert, danach nur noch geklont. */
function cacheFolder(): string {
  return join(cortexHome(), 'remotion', `cache-${REMOTION_VERSION}`);
}

let installing: Promise<void> | undefined;

/** Installiert den Vorrat, falls er fehlt. Gleichzeitige Aufrufe teilen sich eine Installation. */
export function ensureCache(log?: (line: string) => void): Promise<void> {
  const cache = cacheFolder();
  if (existsSync(join(cache, 'node_modules', '@remotion', 'cli', 'package.json'))) return Promise.resolve();
  installing ??= (async () => {
    const staging = `${cache}.tmp-${process.pid}`;
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    await writeFile(join(staging, 'package.json'), FILES['package.json']!);
    log?.(`Paketvorrat wird installiert (${REMOTION_VERSION}) …`);
    await runFile('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: staging, timeout: 10 * 60_000, env: { ...process.env, CI: '1' } });
    await rm(cache, { recursive: true, force: true });
    await rename(staging, cache);
    log?.('Paketvorrat bereit.');
  })().finally(() => { installing = undefined; });
  return installing;
}

/** node_modules aus dem Vorrat ins Projekt: auf APFS geklont (cp -c), sonst kopiert. */
export async function cloneModules(target: string): Promise<void> {
  const from = join(cacheFolder(), 'node_modules');
  const run = (args: string[]) => runFile('/bin/cp', args, { timeout: 5 * 60_000 });
  const staging = join(target, `.node_modules-${process.pid}`);
  await rm(staging, { recursive: true, force: true });
  try { await run(['-cR', from, staging]); } catch { await rm(staging, { recursive: true, force: true }); await run(['-R', from, staging]); }
  await rename(staging, join(target, 'node_modules'));
}

/** Eine Datei nach public/: auf APFS geklont, sonst kopiert. */
export async function cloneFile(from: string, to: string): Promise<void> {
  await runFile('/bin/cp', ['-c', from, to], { timeout: 60_000 }).catch(() => copyFile(from, to));
}
