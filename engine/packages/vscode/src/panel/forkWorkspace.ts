/** Isolated forks retain the current files without stashing or checking out the source. */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, lstat, readlink, symlink, chmod, rm, realpath, readdir, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { git as runGit } from '../util/exec.js';
import { isInside } from '../util/paths.js';

async function git(cwd: string, args: string[]): Promise<string> {
  return runGit(cwd, args, { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 });
}
const digest = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

async function safeParents(root: string, destination: string): Promise<void> {
  if (!isInside(root, destination)) throw new Error('Ungültiger Zielpfad im Abzweig.');
  let current = root;
  for (const part of relative(root, dirname(destination)).split(sep).filter(Boolean)) {
    current = join(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error(`Abzweig enthält einen verlinkten Zielordner: ${current}`); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

/** A copied absolute link must never point back into the original working tree. */
async function isolateLinks(source: string, target: string): Promise<void> {
  target = await realpath(target);
  const links: string[] = [];
  const visit = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (dir === target && entry.name === '.git') continue;
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) links.push(path);
      else if (entry.isDirectory()) await visit(path);
    }
  };
  await visit(target);
  for (const path of links) {
    const rel = relative(target, path), link = await readlink(path);
    const sourceDestination = resolve(dirname(join(source, rel)), link);
    if (!isAbsolute(link) && !isInside(source, sourceDestination)) throw new Error(`Externer symbolischer Link kann nicht isoliert werden: ${rel}`);
    let resolved: string;
    try { resolved = await realpath(sourceDestination); }
    catch { throw new Error(`Defekter symbolischer Link kann nicht isoliert werden: ${rel}`); }
    if (!isInside(source, resolved)) throw new Error(`Externer symbolischer Link kann nicht isoliert werden: ${rel}`);
    if (isAbsolute(link)) {
      const local = relative(dirname(path), join(target, relative(source, resolved))) || '.';
      await unlink(path);
      await symlink(local, path);
    }
  }
  // Some internal source targets may be ignored files, which were not copied.
  for (const path of links) {
    let resolved: string;
    try { resolved = await realpath(path); }
    catch { throw new Error(`Das Linkziel wurde nicht in den Abzweig kopiert: ${relative(target, path)}`); }
    if (!isInside(target, resolved)) throw new Error(`Link verlässt den isolierten Abzweig: ${relative(target, path)}`);
  }
}

export async function createForkWorkspace(cwd: string, storageDir: string): Promise<string> {
  const root = await realpath((await git(cwd, ['rev-parse', '--show-toplevel'])).trim());
  const source = await realpath(cwd);
  const subdir = relative(root, source);
  if (!isInside(root, source)) throw new Error('Projekt liegt außerhalb des Git-Arbeitsbaums.');
  // Submodules need their own worktree policy; an empty submodule is not a faithful copy.
  const modules = await git(root, ['ls-files', '--stage']);
  if (/^160000 /m.test(modules)) throw new Error('Projekte mit Git-Submodulen müssen vor dem Abzweigen separat kopiert werden.');
  const head = (await git(root, ['rev-parse', '--verify', 'HEAD'])).trim();
  const patch = await git(root, ['diff', '--binary', '--no-ext-diff', 'HEAD', '--']);
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort();
  await mkdir(storageDir, { recursive: true });
  const container = await mkdtemp(join(storageDir, 'fork-'));
  const target = join(container, 'workspace');
  let added = false;
  const fingerprints = new Map<string, string>();
  try {
    await git(root, ['worktree', 'add', '--detach', '--', target, head]);
    added = true;
    if (patch) {
      const patchFile = join(container, 'changes.patch');
      await writeFile(patchFile, patch, { flag: 'wx', mode: 0o600 });
      await git(target, ['apply', '--binary', '--whitespace=nowarn', '--', patchFile]);
      await rm(patchFile);
    }
    for (const name of untracked) {
      const path = resolve(root, name), rel = relative(root, path);
      if (!isInside(root, path)) throw new Error('Ungültiger Dateipfad im Projekt.');
      const info = await lstat(path), dest = join(target, rel);
      await safeParents(target, dest);
      await mkdir(dirname(dest), { recursive: true });
      if (info.isSymbolicLink()) {
        const link = await readlink(path);
        await symlink(link, dest);
        fingerprints.set(name, 'link:' + link);
      } else if (info.isFile()) {
        const content = await readFile(path);
        await writeFile(dest, content, { flag: 'wx', mode: info.mode & 0o777 });
        await chmod(dest, info.mode & 0o777);
        fingerprints.set(name, digest(content));
      } else throw new Error(`Nicht kopierbare Datei: ${name}`);
    }
    // An editor or another agent may have changed the source while we copied it.
    if ((await git(root, ['rev-parse', '--verify', 'HEAD'])).trim() !== head
      || await git(root, ['diff', '--binary', '--no-ext-diff', 'HEAD', '--']) !== patch
      || JSON.stringify((await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort()) !== JSON.stringify(untracked)) {
      throw new Error('Das Projekt wurde während des Kopierens geändert. Bitte erneut abzweigen.');
    }
    for (const [name, expected] of fingerprints) {
      const path = join(root, name), info = await lstat(path);
      const actual = info.isSymbolicLink() ? 'link:' + await readlink(path) : digest(await readFile(path));
      if (actual !== expected) throw new Error(`Während des Kopierens geändert: ${name}`);
    }
    await isolateLinks(root, target);
    return join(target, subdir);
  } catch (error) {
    if (added) await git(root, ['worktree', 'remove', '--force', '--', target]).catch(() => {});
    await rm(container, { recursive: true, force: true });
    throw error;
  }
}

/** Subfolders of one checkout share files; separate worktrees have separate roots. */
export async function workspaceRunKey(cwd: string): Promise<string> {
  const canonical = await realpath(cwd).catch(() => resolve(cwd));
  return git(canonical, ['rev-parse', '--show-toplevel']).then(root => root.trim(), () => canonical);
}
