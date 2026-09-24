import { readdir, realpath, stat, lstat, readFile, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, isAbsolute, relative, resolve, sep } from 'node:path';
import type { WorkspaceDto } from './protocol.js';
import { git as runGit, gitBuffer } from '../util/exec.js';
import { isInside } from '../util/paths.js';

const HIDDEN = new Set(['.git', 'node_modules', '.DS_Store', '.cache']);

/** Resolve both sides: a symlink must not turn a project file button into arbitrary file access. */
/** Der Verlauf kürzt den Home-Ordner zu `~`; auf der Platte heißt er anders. */
export function expandHome(path: string, home = homedir()): string {
  return path === '~' || path.startsWith('~/') ? home + path.slice(1) : path;
}

/**
 * Projektdateien stehen im Verlauf relativ zum Projekt — nur so findet das
 * Dock sie. Ältere Einträge tragen stattdessen `~/…`, weil der zerlegt (NFD)
 * gespeicherte Projektordner nicht zum zusammengesetzt (NFC) geschriebenen
 * Dateipfad passte. Hier wird das nachgeholt; alles andere bleibt, wie es war.
 */
export function projectRelative(path: string, root: string, home = homedir()): string {
  const full = expandHome(path, home).normalize('NFC');
  const base = root.normalize('NFC').replace(/\/+$/, '');
  return full.startsWith(`${base}/`) ? full.slice(base.length + 1) : path;
}

export async function projectFile(root: string, path = ''): Promise<string> {
  const base = await realpath(root);
  const target = await realpath(resolve(base, path));
  if (!isInside(base, target)) throw new Error('Datei liegt außerhalb des Projekts.');
  return target;
}

export function parseChanges(output: string): WorkspaceDto['changes'] {
  const entries = output.split('\0');
  const changes: WorkspaceDto['changes'] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry) continue;
    const status = entry.slice(0, 2).trim();
    changes.push({ path: entry.slice(3), status });
    // porcelain -z places the destination first and the rename source in the next field.
    if (/[RC]/.test(status)) i++;
  }
  return changes;
}

export async function inspectWorkspace(root?: string, directory = ''): Promise<WorkspaceDto> {
  const result: WorkspaceDto = { root, directory, files: [], changes: [] };
  if (!root) return result;
  try {
    const canonicalRoot = await realpath(root);
    const target = await projectFile(canonicalRoot, directory);
    const entries = await readdir(target, { withFileTypes: true });
    result.files = entries.filter(e => !HIDDEN.has(e.name) && !e.isSymbolicLink())
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .slice(0, 300).map(e => ({ name: e.name, path: relative(canonicalRoot, resolve(target, e.name)), directory: e.isDirectory() }));
    const git = async (args: string[]) => {
      try { return await runGit(root, args, { timeout: 3000, maxBuffer: 1024 * 1024 }); }
      catch { return ''; }
    };
    const [branch, status] = await Promise.all([git(['branch', '--show-current']), git(['status', '--porcelain=v1', '-z'])]);
    result.branch = branch.trim() || undefined;
    result.changes = parseChanges(status);
  } catch (e) { result.error = (e as Error).message; }
  return result;
}

/**
 * Die Änderungen des Projekts als Zeilen, nicht nur als Dateinamen.
 *
 * `--numstat` liefert je Datei die Zahl der zugefügten und entfernten Zeilen,
 * `--unified` den Inhalt. Beides wird in einem Aufruf geholt und hier zerlegt,
 * damit die Oberfläche die Übersicht zeigen kann, ohne für jede Datei erneut
 * git zu bemühen.
 *
 * Neue, noch nicht vorgemerkte Dateien kennt `git diff` nicht. Sie werden über
 * `--no-index` gegen /dev/null verglichen — sonst fehlten in der Übersicht
 * ausgerechnet die Dateien, die gerade entstanden sind.
 */
interface FileDiff {
  path: string;
  added: number;
  removed: number;
  /** Fehlt bei zu großen oder binären Dateien — dann bleibt es bei den Zahlen. */
  hunks?: DiffHunk[];
  binary?: boolean;
}

interface DiffHunk {
  /** Erste Zeilennummer der neuen Fassung in diesem Abschnitt. */
  start: number;
  lines: Array<{ kind: 'add' | 'del' | 'ctx'; text: string; line?: number }>;
}

const MAX_DIFF_LINES = 600;

export function parseUnifiedDiff(patch: string): Map<string, DiffHunk[]> {
  const byFile = new Map<string, DiffHunk[]>();
  let file: string | undefined;
  let hunks: DiffHunk[] = [];
  let hunk: DiffHunk | undefined;
  let newLine = 0;
  const flush = () => { if (file) byFile.set(file, hunks); };
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('diff --git')) {
      flush();
      const m = /b\/(.+)$/.exec(raw);
      file = m?.[1];
      hunks = []; hunk = undefined;
      continue;
    }
    if (raw.startsWith('Binary files')) { if (file) byFile.set(file, []); continue; }
    if (raw.startsWith('@@')) {
      const m = /@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
      newLine = m ? Number(m[1]) : 1;
      hunk = { start: newLine, lines: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk || raw.startsWith('index ') || raw.startsWith('--- ') || raw.startsWith('+++ ')) continue;
    if (hunk.lines.length >= MAX_DIFF_LINES) continue;
    if (raw.startsWith('+')) hunk.lines.push({ kind: 'add', text: raw.slice(1), line: newLine++ });
    else if (raw.startsWith('-')) hunk.lines.push({ kind: 'del', text: raw.slice(1) });
    else if (raw.startsWith(' ')) hunk.lines.push({ kind: 'ctx', text: raw.slice(1), line: newLine++ });
  }
  flush();
  return byFile;
}

export function parseNumstat(output: string): Array<{ path: string; added: number; removed: number; binary: boolean }> {
  return output.split('\n').filter(Boolean).map(line => {
    const [a, r, ...rest] = line.split('\t');
    const path = rest.join('\t');
    return { path, added: a === '-' ? 0 : Number(a) || 0, removed: r === '-' ? 0 : Number(r) || 0, binary: a === '-' };
  }).filter(entry => entry.path);
}

export async function collectDiff(root?: string): Promise<FileDiff[]> {
  if (!root) return [];
  const git = async (args: string[]) => {
    try { return await runGit(root, args, { timeout: 6000, maxBuffer: 8 * 1024 * 1024 }); }
    catch (error) {
      // git diff --no-index uses exit 1 for a valid difference.
      const result = error as { code?: number; stdout?: string };
      return args.includes('--no-index') && result.code === 1 ? result.stdout ?? '' : '';
    }
  };
  const [numstat, patch, untracked] = await Promise.all([
    git(['diff', 'HEAD', '--numstat']),
    git(['diff', 'HEAD', '--unified=3', '--no-color']),
    git(['ls-files', '--others', '--exclude-standard']),
  ]);
  const hunksByFile = parseUnifiedDiff(patch);
  const files: FileDiff[] = parseNumstat(numstat).map(entry => ({
    path: entry.path,
    added: entry.added,
    removed: entry.removed,
    binary: entry.binary || undefined,
    hunks: hunksByFile.get(entry.path),
  }));
  // Frisch angelegte Dateien: git diff kennt sie nicht, /dev/null schon.
  for (const path of untracked.split('\n').filter(Boolean).slice(0, 40)) {
    const solo = await git(['diff', '--no-index', '--unified=3', '--no-color', '/dev/null', path]);
    if (!solo) continue;
    const hunks = [...parseUnifiedDiff(solo).values()][0] ?? [];
    files.push({ path, added: hunks.reduce((n, h) => n + h.lines.filter(l => l.kind === 'add').length, 0), removed: 0, hunks, binary: /^Binary files /m.test(solo) || undefined });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function validProject(path: string) {
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory()) throw new Error('Bitte einen Projektordner wählen.');
  return { name: basename(canonical), path: canonical };
}

/**
 * Der Stand eines Projekts, bevor ein Auftrag losläuft — Grundlage für
 * „Rückgängig machen“ an der Änderungskarte.
 *
 * `git stash create` legt einen Commit des Arbeitsstands an, ohne irgendetwas
 * anzufassen: kein Stash-Eintrag, keine geänderte Datei. Ist nichts geändert,
 * gibt es nichts aus; dann ist HEAD der Stand. Unversionierte Dateien kennt
 * dieser Commit nicht — sie werden deshalb gemerkt, damit ein Zurücksetzen sie
 * nicht für neu hält und löscht.
 */
export interface Baseline {
  commit: string;
  root?: string;
  /** Fingerprints immediately after the agent finished; null means absent. */
  after?: Record<string, string | null>;
  /** Unversionierte Dateien zu Beginn, relativ zum Projektordner. */
  untracked: string[];
}

export async function captureBaseline(root: string): Promise<Baseline | undefined> {
  const git = async (args: string[]) => (await runGit(root, args, { timeout: 8000, maxBuffer: 16 * 1024 * 1024 })).trim();
  try {
    if ((await git(['rev-parse', '--is-inside-work-tree'])) !== 'true') return undefined;
    const commit = (await git(['stash', 'create'])) || (await git(['rev-parse', 'HEAD']));
    if (!commit) return undefined;
    const untracked = (await git(['ls-files', '--others', '--exclude-standard'])).split('\n').filter(Boolean);
    return { commit, untracked, root: await realpath(root) };
  } catch {
    return undefined;
  }
}

interface RevertPlan {
  /** Mit Inhalt aus dem gemerkten Stand. */
  restore: Array<{ path: string; content: Buffer }>;
  /** Erst in diesem Auftrag entstanden — gehen in den Papierkorb. */
  remove: string[];
  /** Nicht zurückzuholen: außerhalb des Projekts oder schon vorher unversioniert. */
  skipped: string[];
  conflicts: string[];
  expected: Record<string, string | null>;
}

/** Reject paths through symlinks, including a missing file beneath a symlinked directory. */
export async function safeRevertPath(root: string, path: string): Promise<string> {
  const base = await realpath(root);
  const target = resolve(base, path);
  const rel = relative(base, target);
  if (!isInside(base, target, { allowSelf: false })) throw new Error('Außerhalb des Projekts');
  let current = base;
  for (const part of rel.split(sep)) {
    current = resolve(current, part);
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error('Symbolischer Link'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return target;
}

export async function revertFingerprint(root: string, path: string): Promise<string | null> {
  const target = await safeRevertPath(root, path);
  try { return createHash('sha256').update(await readFile(target)).digest('hex'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}

export async function captureTurnEnd(root: string, baseline: Baseline, paths: string[]): Promise<void> {
  baseline.after = {};
  for (const raw of paths) {
    const rel = relative(root, resolve(root, expandHome(raw))).split(sep).join('/');
    try { baseline.after[rel] = await revertFingerprint(root, rel); } catch { /* unsafe or unreadable remains unavailable */ }
  }
}

/** Verify the same descriptor that will be overwritten; never follow a file symlink. */
export async function restoreRevertFile(root: string, path: string, content: Buffer, expected: string | null): Promise<void> {
  const target = await safeRevertPath(root, path);
  const file = await open(target, expected === null ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW : constants.O_RDWR | constants.O_NOFOLLOW);
  try {
    if (expected !== null && createHash('sha256').update(await file.readFile()).digest('hex') !== expected) throw new Error('Datei wurde während der Rückfrage verändert');
    await file.write(content, 0, content.length, 0);
    await file.truncate(content.length);
  } finally { await file.close(); }
}

/**
 * Was ein Zurücksetzen mit jeder Datei täte — noch ohne etwas zu schreiben.
 * Pfade kommen so, wie der Agent sie gemeldet hat: relativ, mit `~` oder
 * absolut. Alles außerhalb des Projektordners bleibt unangetastet.
 */
export async function planRevert(root: string, baseline: Baseline, paths: string[], home = process.env.HOME ?? ''): Promise<RevertPlan> {
  const plan: RevertPlan = { restore: [], remove: [], skipped: [], conflicts: [], expected: {} };
  if (baseline.root && baseline.root !== await realpath(root)) throw new Error('Der gespeicherte Stand gehört zu einem anderen Projektordner.');
  // A missing Git object is not evidence that a file was newly created.
  await runGit(root, ['cat-file', '-e', `${baseline.commit}^{commit}`], { timeout: 8000 });
  for (const raw of [...new Set(paths)]) {
    const absolute = raw.startsWith('~/') ? resolve(home, raw.slice(2)) : resolve(root, raw);
    const rel = relative(root, absolute);
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) { plan.skipped.push(raw); continue; }
    try { plan.expected[rel] = await revertFingerprint(root, rel); }
    catch { plan.skipped.push(raw); continue; }
    const after = baseline.after?.[rel.split(sep).join('/')];
    if (after === undefined || after !== plan.expected[rel]) plan.conflicts.push(rel);
    const entry = await runGit(root, ['ls-tree', '-z', baseline.commit, '--', rel], { timeout: 8000 });
    if (entry) {
      if (!/^100\d+ blob /.test(entry)) { plan.skipped.push(raw); continue; }
      const content = await gitBuffer(root, ['show', `${baseline.commit}:./${rel.split(sep).join('/')}`], { timeout: 8000, maxBuffer: 64 * 1024 * 1024 });
      plan.restore.push({ path: rel, content });
    } else {
      if (baseline.untracked.includes(rel.split(sep).join('/'))) plan.skipped.push(raw);
      else plan.remove.push(rel);
    }
  }
  return plan;
}
