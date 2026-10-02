/**
 * Eigene Git-Worktrees für die Einheiten eines Schwarms (`isolation: 'worktree'`).
 *
 * Jede Einheit arbeitet auf einem eigenen Branch `schwarm/<Lauf>/<Einheit>` in
 * `<storageDir>/<Lauf>/<Einheit>/workspace`. Der Worktree startet mit dem Stand
 * des Projekts samt ungesicherter Änderungen und neuer Dateien (wie ein Abzweig,
 * siehe forkWorkspace.ts). Vom Git ignorierte Ordner wie `daten/` oder `.venv/`
 * werden nicht kopiert, sondern verlinkt: Importer schreiben so in die echten
 * Daten, und die Links landen nie in einem Commit.
 */
import { appendFile, lstat, mkdir, readdir, readFile, readlink, realpath, rm, rmdir, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { carrySnapshot, safeParents, snapshotSource } from '../panel/forkWorkspace.js';
import { git as runGit } from '../util/exec.js';
import { isInside } from '../util/paths.js';

export interface UnitWorkspaceOptions {
  /** Projektordner; darf ein Unterordner des Git-Arbeitsbaums sein. */
  cwd: string;
  storageDir: string;
  runId: string;
  unitId: string;
  /**
   * Zu verlinkende Pfade relativ zur Git-Wurzel. Ohne Angabe: jeder ignorierte
   * Ordner der obersten Ebene außer `.git`.
   */
  link?: string[];
  /**
   * Ungesicherte Änderungen und neue Dateien mitnehmen (Vorgabe). `false` startet
   * nur mit dem Commit von HEAD — so die Zusammenführung der Merge-Warteschlange.
   */
  carry?: boolean;
}

export interface UnitWorkspace {
  /** Git-Wurzel des Projekts (aufgelöst). */
  root: string;
  /** Der Projektordner innerhalb des Worktrees — dort arbeitet die Einheit. */
  path: string;
  branch: string;
  /** Commit, gegen den der eigene Diff der Einheit gemessen wird. */
  base: string;
  /** Verlinkte Pfade relativ zur Git-Wurzel. */
  linked: string[];
}

export interface UnitChanges {
  /** Geänderte Dateien seit `base`, relativ zur Git-Wurzel, sortiert. */
  changed: string[];
  /** Davon die, die zu keinem `owns`-Muster passen. */
  outside: string[];
}

/** Liegt neben `workspace` und weist den Ordner als Arbeitsordner einer Einheit aus. */
const MANIFEST = 'einheit.json';
const EXCLUDE_HEADER = '# Cortex-Schwarm: verlinkte Ordner in Einheiten-Worktrees';
const LIMITS = { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 };

interface Manifest { root: string; branch: string; base: string; linked: string[] }

function git(cwd: string, args: string[]): Promise<string> {
  return runGit(cwd, args, LIMITS);
}

/** `true` bei Exit-Code 0, `false` bei 1 (etwa „nichts gefunden“); alles andere wirft. */
async function gitTest(cwd: string, args: string[]): Promise<boolean> {
  try { await git(cwd, args); return true; }
  catch (error) { if ((error as { code?: unknown }).code === 1) return false; throw error; }
}

const split = (output: string) => output.split('\0').filter(Boolean);
const toPosix = (path: string) => path.split(sep).join('/');
const under = (path: string, dirs: string[]) => dirs.some(dir => path === dir || path.startsWith(dir + '/'));

function checkSegment(value: string, message: string): void {
  if (!value || value === '.' || value === '..' || /[/\\\0]/.test(value)) throw new Error(`${message}: ${JSON.stringify(value)}`);
}

/** Branch-tauglich: klein, nur a-z, 0-9 und Bindestrich. */
function slug(value: string, fallback: string, max: number): string {
  const text = value.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return text.slice(0, max).replace(/-+$/, '') || fallback;
}

/** Pfad auflösen, auch wenn sein Ende nicht mehr existiert (macOS: /var → /private/var). */
async function canonical(path: string): Promise<string> {
  const absolute = resolve(path);
  try { return await realpath(absolute); }
  catch {
    const parent = dirname(absolute);
    return parent === absolute ? absolute : join(await canonical(parent), basename(absolute));
  }
}

/** Welche der Pfade Git in `cwd` ignoriert (einzeln gefragt: `-z` gibt es nur mit `--stdin`). */
async function ignoredOf(cwd: string, paths: string[]): Promise<Set<string>> {
  const ignored = new Set<string>();
  for (const path of paths) if (await gitTest(cwd, ['check-ignore', '-q', '--', path])) ignored.add(path);
  return ignored;
}

async function hasTracked(root: string, rel: string): Promise<boolean> {
  return (await git(root, ['--literal-pathspecs', 'ls-files', '-z', '--', rel])) !== '';
}

/**
 * Ignorierte Ordner der obersten Ebene, die keine versionierte Datei enthalten.
 * Ausgenommen der, in dem der Worktree selbst liegt — sonst enthielte er sich.
 */
async function ignoredTopDirs(root: string, target: string): Promise<string[]> {
  const dirs: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '.git' || isInside(join(root, entry.name), target)) continue;
    if (entry.isDirectory()) dirs.push(entry.name);
    else if (entry.isSymbolicLink() && (await stat(join(root, entry.name)).catch(() => undefined))?.isDirectory()) dirs.push(entry.name);
  }
  const ignored = await ignoredOf(root, dirs);
  const result: string[] = [];
  for (const name of dirs.sort()) if (ignored.has(name) && !await hasTracked(root, name)) result.push(name);
  return result;
}

/** Ausdrücklich genannte Links: vorhanden, innerhalb der Wurzel, ignoriert, ohne versionierte Dateien. */
async function checkedLinks(root: string, link: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const raw of link) {
    const path = resolve(root, raw.replace(/\\/g, '/'));
    const rel = toPosix(relative(root, path));
    if (isAbsolute(raw) || !isInside(root, path, { allowSelf: false })) throw new Error(`Link-Pfad liegt nicht im Projekt: ${raw}`);
    if (rel.split('/')[0] === '.git') throw new Error(`Der Git-Ordner wird nie verlinkt: ${raw}`);
    try { await lstat(path); } catch { throw new Error(`Zu verlinkender Pfad fehlt: ${raw}`); }
    if (!result.includes(rel)) result.push(rel);
  }
  const ignored = await ignoredOf(root, result);
  const visible = result.filter(rel => !ignored.has(rel));
  if (visible.length) throw new Error(`Verlinkt werden nur von Git ignorierte Pfade: ${visible.join(', ')}`);
  for (const rel of result) if (await hasTracked(root, rel)) throw new Error(`Der Pfad enthält versionierte Dateien und kann nicht verlinkt werden: ${rel}`);
  return result;
}

/**
 * Git ignoriert einen Link nur, wenn ein Muster ihn ohne Schrägstrich trifft —
 * `daten/` gilt für echte Ordner, nicht für einen Link namens `daten`. Solche
 * Links trägt Cortex in `info/exclude` ein (geteilt mit dem Hauptarbeitsbaum,
 * wo derselbe Pfad ohnehin ignoriert ist).
 */
async function excludeLinks(target: string, rels: string[]): Promise<void> {
  const common = resolve(target, (await git(target, ['rev-parse', '--git-common-dir'])).trim());
  const file = join(common, 'info', 'exclude');
  const current = await readFile(file, 'utf8').catch(() => '');
  const lines = new Set(current.split(/\r?\n/));
  const add = rels.map(rel => '/' + rel.replace(/[\\*?[]/g, '\\$&')).filter(line => !lines.has(line));
  if (!add.length) return;
  await mkdir(dirname(file), { recursive: true });
  const prefix = (current && !current.endsWith('\n') ? '\n' : '') + (lines.has(EXCLUDE_HEADER) ? '' : EXCLUDE_HEADER + '\n');
  await appendFile(file, prefix + add.join('\n') + '\n');
}

async function linkIgnored(root: string, target: string, link: string[] | undefined, created: string[]): Promise<string[]> {
  const explicit = link !== undefined;
  const linked: string[] = [];
  for (const rel of explicit ? await checkedLinks(root, link) : await ignoredTopDirs(root, target)) {
    const dest = join(target, rel);
    await safeParents(target, dest);
    if (await lstat(dest).then(() => true, () => false)) {
      if (explicit) throw new Error(`Im Worktree existiert der Pfad schon: ${rel}`);
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await symlink(join(root, rel), dest);
    created.push(dest);
    linked.push(rel);
  }
  if (!linked.length) return linked;
  let ignored = await ignoredOf(target, linked);
  const visible = linked.filter(rel => !ignored.has(rel));
  if (visible.length) {
    await excludeLinks(target, visible);
    ignored = await ignoredOf(target, linked);
    const still = linked.filter(rel => !ignored.has(rel));
    if (still.length) throw new Error(`Verlinkte Pfade wären in Git sichtbar: ${still.join(', ')}`);
  }
  if (await git(target, ['--literal-pathspecs', 'status', '--porcelain', '-z', '--untracked-files=all', '--', ...linked])) {
    throw new Error('Git zeigt verlinkte Ordner im Worktree an; die Einheit wird nicht angelegt.');
  }
  return linked;
}

/** `-c`-Argumente für die Identität „Cortex“, soweit dem Projekt Name oder E-Mail fehlen. */
export async function fallbackIdentity(cwd: string): Promise<string[]> {
  const identity: string[] = [];
  for (const [key, fallback] of [['user.name', 'Cortex'], ['user.email', 'cortex@localhost']] as const) {
    const value = await git(cwd, ['config', '--get', key]).then(out => out.trim(), () => '');
    if (!value) identity.push('-c', `${key}=${fallback}`);
  }
  return identity;
}

/** Commit mit der Identität des Projekts; fehlt sie, als „Cortex“ — nur für diesen Commit. */
async function commitAll(top: string, message: string): Promise<string> {
  const identity = await fallbackIdentity(top);
  // Interne Zwischenstände: keine Hooks, keine Signatur-Abfrage, die im Hintergrund hängen bliebe.
  await git(top, [...identity, '-c', 'commit.gpgsign=false', 'commit', '--no-verify', '-q', '-m', message]);
  return (await git(top, ['rev-parse', '--verify', 'HEAD'])).trim();
}

/** Versucht `schwarm/…`, dann `…-2`, `…-3` — bis ein freier Name den Worktree bekommt. */
async function addUnitWorktree(root: string, target: string, name: string, head: string): Promise<string> {
  for (let n = 1; n <= 100; n++) {
    const branch = n === 1 ? name : `${name}-${n}`;
    if (await gitTest(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) continue;
    try {
      await git(root, ['worktree', 'add', '-q', '-b', branch, '--', target, head]);
      return branch;
    } catch (error) {
      // Eine gleichzeitig angelegte Einheit kann den Namen eben genommen haben.
      if (await gitTest(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])) continue;
      throw error;
    }
  }
  throw new Error(`Kein freier Branch-Name für ${name}.`);
}

async function readManifest(container: string): Promise<Manifest | undefined> {
  try {
    const value = JSON.parse(await readFile(join(container, MANIFEST), 'utf8')) as Partial<Manifest>;
    return typeof value.root === 'string' && Array.isArray(value.linked) ? value as Manifest : undefined;
  } catch { return undefined; }
}

async function worktreeTop(path: string): Promise<string> {
  try { return await realpath((await git(path, ['rev-parse', '--show-toplevel'])).trim()); }
  catch { throw new Error(`Kein Git-Worktree einer Einheit: ${path}`); }
}

export async function createUnitWorkspace(opts: UnitWorkspaceOptions): Promise<UnitWorkspace> {
  const { cwd, storageDir, runId, unitId } = opts;
  checkSegment(runId, 'Ungültige Lauf-Kennung für den Arbeitsordner');
  checkSegment(unitId, 'Ungültige Einheiten-Kennung für den Arbeitsordner');
  try { await git(cwd, ['rev-parse', '--show-toplevel']); }
  catch { throw new Error(`Kein Git-Projekt: ${cwd}. Eine Einheit mit eigenem Worktree braucht ein Git-Repository.`); }
  if (!await gitTest(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'])) {
    throw new Error('Das Projekt hat noch keinen Commit; ohne Ausgangsstand kann keine Einheit abzweigen.');
  }
  const snapshot = await snapshotSource(cwd);
  const { root } = snapshot;
  await mkdir(storageDir, { recursive: true });
  const runDir = join(await realpath(storageDir), runId);
  await mkdir(runDir, { recursive: true });
  const container = join(runDir, unitId);
  // Das Anlegen des Ordners ist der Anspruch auf die Einheit: ein zweiter Aufruf scheitert hier.
  try { await mkdir(container); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`Für die Einheit „${unitId}“ gibt es in diesem Lauf schon einen Arbeitsordner.`);
    throw error;
  }
  const target = join(container, 'workspace');
  const created: string[] = [];
  let branch: string | undefined;
  try {
    branch = await addUnitWorktree(root, target, `schwarm/${slug(runId.slice(0, 8), 'lauf', 8)}/${slug(unitId, 'einheit', 40)}`, snapshot.head);
    let base = snapshot.head;
    if (opts.carry !== false) await carrySnapshot(snapshot, target, container);
    if (opts.carry !== false && await git(target, ['status', '--porcelain', '-z', '--untracked-files=all'])) {
      await git(target, ['add', '-A']);
      base = await commitAll(target, 'Schwarm: Ausgangsstand');
    }
    const linked = await linkIgnored(root, target, opts.link, created);
    const manifest: Manifest = { root, branch, base, linked };
    await writeFile(join(container, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return { root, path: join(target, snapshot.subdir), branch, base, linked };
  } catch (error) {
    // Links zuerst: nichts, was danach gelöscht wird, darf noch auf echte Daten zeigen.
    for (const link of created) await unlink(link).catch(() => {});
    if (branch) {
      await git(root, ['worktree', 'remove', '--force', '--force', '--', target]).catch(() => {});
      await git(root, ['branch', '-D', '--', branch]).catch(() => {});
    }
    await rm(container, { recursive: true, force: true });
    throw error;
  }
}

/** Gehört `file` (relativ zur Git-Wurzel) zu einem der Muster (relativ zu `prefix`)? */
function owned(file: string, prefix: string, globs: string[][]): boolean {
  if (prefix) {
    if (!file.startsWith(prefix + '/')) return false;
    file = file.slice(prefix.length + 1);
  }
  const parts = file.split('/');
  // Ein Muster, das einen Ordner trifft, deckt alles darunter.
  return globs.some(glob => parts.some((_, i) => matchSegments(glob, 0, parts.slice(0, i + 1), 0)));
}

const segmentPatterns = new Map<string, RegExp>();
function segmentPattern(segment: string): RegExp {
  let pattern = segmentPatterns.get(segment);
  if (!pattern) {
    const source = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '[^/]*').replace(/\?/g, '[^/]');
    segmentPatterns.set(segment, pattern = new RegExp(`^${source}$`));
  }
  return pattern;
}

function matchSegments(glob: string[], gi: number, parts: string[], pi: number): boolean {
  if (gi === glob.length) return pi === parts.length;
  if (glob[gi] === '**') {
    for (let p = pi; p <= parts.length; p++) if (matchSegments(glob, gi + 1, parts, p)) return true;
    return false;
  }
  const segment = glob[gi], part = parts[pi];
  return segment !== undefined && part !== undefined && segmentPattern(segment).test(part) && matchSegments(glob, gi + 1, parts, pi + 1);
}

/** `./a//b/` → `['a', 'b']`; der Schrägstrich am Ende braucht keine Sonderregel (Ordner decken ab). */
function globSegments(glob: string): string[] {
  return glob.replace(/\\/g, '/').split('/').filter(part => part && part !== '.');
}

export async function unitChanges(workspace: { root?: string; path: string; base: string }, owns: string[] | undefined): Promise<UnitChanges> {
  const top = await worktreeTop(workspace.path);
  const linked = (await readManifest(dirname(top)))?.linked ?? [];
  const tracked = split(await git(top, ['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', workspace.base, '--']));
  const untracked = split(await git(top, ['ls-files', '--others', '--exclude-standard', '-z']));
  const changed = [...new Set([...tracked, ...untracked])].filter(file => !under(file, linked)).sort();
  const globs = (owns ?? []).map(globSegments).filter(glob => glob.length);
  if (!globs.length) return { changed, outside: [] };
  // `owns` gilt relativ zum Projektordner, der ein Unterordner der Wurzel sein kann.
  const prefix = toPosix(relative(top, await canonical(workspace.path)));
  return { changed, outside: changed.filter(file => !owned(file, prefix, globs)) };
}

/** Vorgemerkte Links, die in den Hauptarbeitsbaum zeigen — sie dürfen nie in einen Commit. */
async function stagedLinks(top: string): Promise<string[]> {
  const linked = (await readManifest(dirname(top)))?.linked ?? [];
  const common = resolve(top, (await git(top, ['rev-parse', '--git-common-dir'])).trim());
  const main = basename(common) === '.git' ? dirname(common) : undefined;
  const raw = split(await git(top, ['diff', '--cached', '--raw', '-z', '--no-renames']));
  const leaked: string[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const mode = raw[i]?.split(' ')[1], file = raw[i + 1] ?? '';
    if (under(file, linked)) { leaked.push(file); continue; }
    if (mode !== '120000' || !main) continue;
    const path = join(top, file);
    const destination = await readlink(path).then(link => resolve(dirname(path), link), () => undefined);
    if (destination && !isInside(top, destination) && isInside(main, destination)) leaked.push(file);
  }
  return leaked;
}

export async function commitUnit(workspace: { path: string }, message: string): Promise<string | undefined> {
  const top = await worktreeTop(workspace.path);
  await git(top, ['add', '-A']);
  if (await gitTest(top, ['diff', '--cached', '--quiet'])) return undefined;
  const leaked = await stagedLinks(top);
  if (leaked.length) {
    await git(top, ['reset', '-q']).catch(() => {});
    throw new Error(`Verlinkte Ordner dürfen nicht in einen Commit: ${leaked.join(', ')}`);
  }
  return commitAll(top, message.trim() || 'Schwarm: Arbeitsstand der Einheit');
}

async function worktreesOf(root: string): Promise<string[]> {
  const list = await git(root, ['worktree', 'list', '--porcelain']).catch(() => '');
  const trees = list.split('\n').filter(line => line.startsWith('worktree ')).map(line => line.slice('worktree '.length));
  return Promise.all(trees.slice(1).map(canonical));
}

/** Entfernt Links aus dem Worktree, bevor er gelöscht wird — gelöscht wird so nur der Link, nie sein Ziel. */
async function dropLinks(tree: string, linked: string[]): Promise<void> {
  const ignored = await git(tree, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']).then(split, () => []);
  for (const rel of new Set([...linked, ...ignored.map(entry => entry.replace(/\/$/, ''))])) {
    const path = join(tree, rel);
    if (!isInside(tree, path, { allowSelf: false })) continue;
    if ((await lstat(path).catch(() => undefined))?.isSymbolicLink()) await unlink(path);
  }
}

export async function removeUnitWorkspace(workspace: { root: string; path: string }): Promise<void> {
  const main = await canonical(workspace.root);
  const wanted = await canonical(workspace.path);
  const registered = (await worktreesOf(main)).find(tree => tree !== main && isInside(tree, wanted));
  let tree = registered;
  if (!tree) {
    // Schon ausgetragen: den Arbeitsordner über seinen Namen wiederfinden.
    for (let dir = wanted; dirname(dir) !== dir; dir = dirname(dir)) if (basename(dir) === 'workspace') { tree = dir; break; }
  }
  if (!tree || isInside(tree, main)) {
    await git(main, ['worktree', 'prune']).catch(() => {});
    return;
  }
  const container = dirname(tree);
  const manifest = await readManifest(container);
  if (!registered && (!manifest || await canonical(manifest.root) !== main)) return;
  if (await lstat(tree).then(() => true, () => false)) {
    await dropLinks(tree, manifest?.linked ?? []);
    if (registered) await git(main, ['worktree', 'remove', '--force', '--force', '--', tree]).catch(() => {});
    await rm(tree, { recursive: true, force: true });
  }
  await git(main, ['worktree', 'prune']).catch(() => {});
  if (manifest) await rm(container, { recursive: true, force: true });
  else await rmdir(container).catch(() => {});
}
