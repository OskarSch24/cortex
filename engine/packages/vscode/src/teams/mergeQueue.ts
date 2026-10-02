/**
 * Merge-Warteschlange eines Schwarm-Laufs (`isolation: 'worktree'`).
 *
 * Fertige Einheiten werden der Reihe nach in einen eigenen Worktree auf
 * `schwarm/<Lauf>/zusammenfuehrung` übernommen — nur ihre eigenen Commits
 * (`base..branch`), nie der mitgebrachte Ausgangsstand. Nach jeder Einheit
 * laufen die Prüfungen; scheitert eine, wird die Einheit zurückgenommen. In den
 * Branch des Nutzers geht das Ergebnis erst mit `adoptIntegration`.
 *
 * Übernommen wird per Cherry-Pick ohne `-x`: die Branches der Einheiten werden
 * nach dem Lauf gelöscht, ein Verweis auf ihre Commits zeigte dann ins Leere.
 * `--keep-redundant-commits` hält den Cherry-Pick nie mit einer Rückfrage an;
 * bringt eine Einheit insgesamt nichts Neues, zählt sie als `skipped`.
 */
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { UnitMerge } from './types.js';
import { createUnitWorkspace, fallbackIdentity, removeUnitWorkspace } from './unitWorkspace.js';

const exec = promisify(execFile);

export interface Integration {
  /** Git-Wurzel des Projekts (Hauptarbeitsbaum). */
  root: string;
  /** Der Projektordner im Worktree der Zusammenführung — dort laufen die Prüfungen. */
  path: string;
  branch: string;
  /** Der Branch des Nutzers, von dem abgezweigt wurde und in den übernommen wird. */
  target: string;
  /** Commit von `target` beim Abzweigen. */
  base: string;
}

export interface MergeUnitRef { branch: string; base: string; name: string }
export interface MergeUnitOptions { signal?: AbortSignal; timeoutMs?: number }
export type AdoptResult = { ok: true; commit: string } | { ok: false; detail: string };

/** Ordner- und Kennungsname der Zusammenführung neben den Einheiten des Laufs. */
const INTEGRATION_ID = 'zusammenfuehrung';
/** Liegt neben `workspace` (und `einheit.json`) und weist den Ordner als Zusammenführung aus. */
const MARKER = 'zusammenfuehrung.json';
const LIMITS = { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 };
const CHECK_TIMEOUT = 20 * 60_000;
const TAIL_CHARS = 4000;

/**
 * git ohne Rückfragen: kein Editor, keine Passwortabfrage, keine Signatur und
 * keine Hooks — alles, was im Hintergrund hängen bliebe.
 */
async function git(cwd: string, args: string[]): Promise<string> {
  const env = { ...process.env, GIT_EDITOR: 'true', GIT_SEQUENCE_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no', GIT_TERMINAL_PROMPT: '0' };
  return (await exec('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8', ...LIMITS })).stdout;
}

/** `true` bei Exit-Code 0, `false` bei 1; alles andere wirft. */
async function gitTest(cwd: string, args: string[]): Promise<boolean> {
  try { await git(cwd, args); return true; }
  catch (error) { if ((error as { code?: unknown }).code === 1) return false; throw error; }
}

const split = (output: string) => output.split('\0').filter(Boolean);
const exists = (path: string) => lstat(path).then(() => true, () => false);
const head = async (cwd: string) => (await git(cwd, ['rev-parse', '--verify', 'HEAD'])).trim();
const stderrOf = (error: unknown) => String((error as { stderr?: unknown }).stderr ?? (error as Error).message ?? error).trim();
const hasBranch = (cwd: string, branch: string) => gitTest(cwd, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]);

/** Der ausgecheckte Branch — leer bei losgelöstem HEAD. */
async function currentBranch(cwd: string): Promise<string> {
  try { return (await git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD'])).trim(); }
  catch (error) { if ((error as { code?: unknown }).code === 1) return ''; throw error; }
}

function checkRef(value: string, what: string): void {
  if (!value || value.startsWith('-') || /[\s\0]/.test(value)) throw new Error(`Ungültige Angabe für ${what}: ${JSON.stringify(value)}`);
}

async function readIntegration(container: string, root: string): Promise<Integration | undefined> {
  let value: Partial<Integration>;
  try { value = JSON.parse(await readFile(join(container, MARKER), 'utf8')) as Partial<Integration>; }
  catch { return undefined; }
  const { path, branch, target, base } = value;
  if (typeof value.root !== 'string' || typeof path !== 'string' || typeof branch !== 'string' || typeof target !== 'string' || typeof base !== 'string') return undefined;
  if (await realpath(value.root).catch(() => '') !== root) return undefined;
  // Nur ein noch eingetragener Worktree auf dem eigenen Branch zählt.
  const top = await git(path, ['rev-parse', '--show-toplevel']).then(out => realpath(out.trim()), () => '');
  if (top !== join(container, 'workspace') || await currentBranch(path).catch(() => '') !== branch) return undefined;
  return { root, path, branch, target, base };
}

/**
 * Worktree der Zusammenführung: vom ausgecheckten Branch abgezweigt, ohne die
 * ungesicherten Änderungen des Nutzers — nur Commits von `target` und das, was
 * die Einheiten beitragen. Ignorierte Ordner wie `daten/` sind verlinkt wie bei
 * den Einheiten, damit die Prüfungen laufen. Ein zweiter Aufruf für denselben
 * Lauf liefert die vorhandene Zusammenführung.
 */
export async function createIntegration(opts: { cwd: string; storageDir: string; runId: string }): Promise<Integration> {
  const { cwd, storageDir, runId } = opts;
  if (!runId || runId === '.' || runId === '..' || /[/\\\0]/.test(runId)) throw new Error(`Ungültige Lauf-Kennung für die Zusammenführung: ${JSON.stringify(runId)}`);
  let root: string;
  try { root = await realpath((await git(cwd, ['rev-parse', '--show-toplevel'])).trim()); }
  catch { throw new Error(`Kein Git-Projekt: ${cwd}. Die Merge-Warteschlange braucht ein Git-Repository.`); }
  await mkdir(storageDir, { recursive: true });
  const container = join(await realpath(storageDir), runId, INTEGRATION_ID);
  const existing = await readIntegration(container, root);
  if (existing) return existing;
  if (await exists(container)) throw new Error(`Der Arbeitsordner der Zusammenführung ist unvollständig oder gehört zu einem anderen Projekt: ${container}`);
  const target = await currentBranch(root);
  if (!target) throw new Error('Im Projekt ist kein Branch ausgecheckt (losgelöster HEAD). Die Merge-Warteschlange braucht einen Branch, in den sie übernehmen kann.');
  const unit = await createUnitWorkspace({ cwd, storageDir, runId, unitId: INTEGRATION_ID, carry: false });
  const integration: Integration = { root: unit.root, path: unit.path, branch: unit.branch, target, base: unit.base };
  try {
    // Zwischen Branch-Abfrage und Abzweigen kann der Nutzer gewechselt oder committet haben.
    if ((await git(root, ['rev-parse', '--verify', `refs/heads/${target}`])).trim() !== unit.base) {
      throw new Error(`Der Branch „${target}“ hat sich beim Anlegen der Zusammenführung bewegt. Bitte erneut starten.`);
    }
    await writeFile(join(container, MARKER), JSON.stringify(integration, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    await removeUnitWorkspace(unit).catch(() => {});
    await git(root, ['branch', '-D', '--', unit.branch]).catch(() => {});
    throw error;
  }
  return integration;
}

/** Nimmt einen abgebrochenen Cherry-Pick zurück und stellt `before` wieder her; unversionierte Dateien bleiben. */
async function restore(cwd: string, before: string): Promise<void> {
  await git(cwd, ['cherry-pick', '--abort']).catch(() => git(cwd, ['cherry-pick', '--quit']).catch(() => {}));
  // Kein `git clean`: verlinkte Daten und Ausgaben der Prüfungen bleiben unangetastet.
  await git(cwd, ['reset', '--hard', '-q', before]);
}

type CheckResult = { ok: true } | { ok: false; reason: string; tail: string };

function duration(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`;
}

/** Beendet die ganze Prozessgruppe der Prüfung — auch Kindprozesse der Shell. */
function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid) try { process.kill(-pid, signal); } catch { /* schon beendet */ }
}

/** Eine Prüfung mit `/bin/sh -lc` im Worktree; behält das Ende der gemeinsamen Ausgabe. */
function runCheck(command: string, cwd: string, timeoutMs: number, signal: AbortSignal | undefined): Promise<CheckResult> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    let size = 0, stopped: string | undefined, settled = false;
    const keep = (chunk: Buffer) => {
      chunks.push(chunk); size += chunk.length;
      // Großzügig in Bytes (UTF-8), gekürzt wird am Ende in Zeichen.
      while (chunks.length > 1 && size - chunks[0]!.length > TAIL_CHARS * 4) size -= chunks.shift()!.length;
    };
    const tail = () => Buffer.concat(chunks).toString('utf8').slice(-TAIL_CHARS).replace(/^�+/, '').trim();
    const child = spawn('/bin/sh', ['-lc', command], { cwd, env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let hard: NodeJS.Timeout | undefined;
    const stop = (why: string) => {
      if (stopped || settled) return;
      stopped = why;
      killGroup(child.pid, 'SIGTERM');
      hard = setTimeout(() => killGroup(child.pid, 'SIGKILL'), 2000);
      hard.unref();
    };
    const timer = setTimeout(() => stop(`Zeitlimit von ${duration(timeoutMs)} überschritten`), timeoutMs);
    const onAbort = () => stop('abgebrochen');
    const finish = (result: CheckResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', error => finish({ ok: false, reason: `ließ sich nicht starten (${error.message})`, tail: tail() }));
    child.on('exit', (code, sig) => {
      // Übrig gebliebene Hintergrundprozesse der Prüfung gehen mit; ein Nachzügler,
      // der die Ausgabe offen hält, darf das Ergebnis nicht aufhalten.
      killGroup(child.pid, 'SIGTERM');
      if (hard && !stopped) clearTimeout(hard);
      const done = () => finish(stopped ? { ok: false, reason: stopped, tail: tail() }
        : code === 0 ? { ok: true }
        : { ok: false, reason: code === null ? `beendet durch ${sig}` : `exit ${code}`, tail: tail() });
      if (child.stdout.readableEnded && child.stderr.readableEnded) done();
      else {
        const grace = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); done(); }, 1000);
        child.on('close', () => { clearTimeout(grace); done(); });
      }
    });
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Übernimmt die eigenen Commits einer Einheit in die Zusammenführung und prüft
 * sie. Nur nacheinander aufrufen (dafür sorgt `MergeQueue`). Bei Konflikt oder
 * gescheiterter Prüfung steht der Worktree danach wieder auf dem Stand davor.
 */
export async function mergeUnit(integration: { path: string }, unit: MergeUnitRef, checks: string[], opts: MergeUnitOptions = {}): Promise<UnitMerge> {
  const cwd = integration.path;
  checkRef(unit.base, 'den Ausgangs-Commit'); checkRef(unit.branch, 'den Branch');
  const range = `${unit.base}..${unit.branch}`;
  const commits = (await git(cwd, ['rev-list', '--reverse', range])).split(/\s+/).filter(Boolean);
  if (!commits.length) return { state: 'skipped', detail: 'Nichts geändert.' };
  if (await git(cwd, ['rev-list', '--merges', '-n', '1', range]).then(out => out.trim())) {
    return { state: 'conflict', detail: 'Der Branch der Einheit enthält Merge-Commits; übernommen werden nur einfache Commits.' };
  }
  if (opts.signal?.aborted) return { state: 'checks-failed', detail: 'Abgebrochen.' };
  // Reste einer unterbrochenen Übernahme und von Prüfungen geänderte Dateien verwerfen.
  await git(cwd, ['cherry-pick', '--quit']).catch(() => {});
  await git(cwd, ['reset', '--hard', '-q', 'HEAD']);
  const before = await head(cwd);
  try {
    await git(cwd, [...await fallbackIdentity(cwd), '-c', 'core.hooksPath=/dev/null', 'cherry-pick', '--keep-redundant-commits', ...commits]);
  } catch (error) {
    const conflicted = await git(cwd, ['diff', '--name-only', '--diff-filter=U', '-z']).then(split, () => []);
    await restore(cwd, before);
    return { state: 'conflict', detail: conflicted.length ? `Konflikt in: ${conflicted.join(', ')}` : `Übernahme gescheitert: ${stderrOf(error)}` };
  }
  try {
    if (await gitTest(cwd, ['diff', '--quiet', before, 'HEAD', '--'])) {
      await git(cwd, ['reset', '--hard', '-q', before]);
      return { state: 'skipped', detail: 'Die Änderungen sind schon in der Zusammenführung.' };
    }
    for (const command of checks.map(check => check.trim()).filter(Boolean)) {
      const result = await runCheck(command, cwd, opts.timeoutMs ?? CHECK_TIMEOUT, opts.signal);
      if (!result.ok) {
        await git(cwd, ['reset', '--hard', '-q', before]);
        return { state: 'checks-failed', detail: `${command}: ${result.reason}${result.tail ? '\n' + result.tail : ''}` };
      }
    }
    // Von Prüfungen veränderte versionierte Dateien gehören nicht zum Stand.
    await git(cwd, ['reset', '--hard', '-q', 'HEAD']);
    return { state: 'merged', commit: await head(cwd), at: Date.now() };
  } catch (error) {
    await git(cwd, ['reset', '--hard', '-q', before]).catch(() => {});
    return { state: 'checks-failed', detail: `Prüfung gescheitert: ${stderrOf(error)}` };
  }
}

/**
 * Arbeitet fertige Einheiten der Reihe nach ab (FIFO, immer nur eine). Jede
 * meldet `waiting`, `merging` und ihr Ergebnis über `onChange`.
 */
export class MergeQueue {
  private readonly queue: MergeUnitRef[] = [];
  private busy = false;
  private stopped = false;
  private done: Promise<void> = Promise.resolve();
  private controller: AbortController | undefined;

  constructor(
    private readonly integration: { path: string },
    private readonly checks: string[],
    private readonly onChange: (unitName: string, merge: UnitMerge) => void,
  ) {}

  enqueue(unit: MergeUnitRef): void {
    if (this.stopped) return;
    this.queue.push(unit);
    this.emit(unit.name, { state: 'waiting' });
    this.pump();
  }

  /** Erfüllt sich, sobald nichts mehr wartet oder läuft. */
  idle(): Promise<void> {
    return this.busy ? this.done : Promise.resolve();
  }

  /**
   * Bricht die laufende Prüfung ab (die Einheit meldet noch ihr Ergebnis, damit
   * sie nicht auf `merging` stehen bleibt) und verwirft die wartenden ohne Meldung.
   */
  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.controller?.abort();
  }

  private emit(name: string, merge: UnitMerge): void {
    // Ein Fehler beim Melden darf die Warteschlange nicht anhalten.
    try { this.onChange(name, merge); } catch { /* ignoriert */ }
  }

  private pump(): void {
    if (this.busy) return;
    this.busy = true;
    this.done = (async () => {
      try {
        for (let unit = this.queue.shift(); unit && !this.stopped; unit = this.queue.shift()) await this.process(unit);
      } finally { this.busy = false; }
    })();
  }

  private async process(unit: MergeUnitRef): Promise<void> {
    const controller = this.controller = new AbortController();
    this.emit(unit.name, { state: 'merging' });
    let result: UnitMerge;
    try { result = await mergeUnit(this.integration, unit, this.checks, { signal: controller.signal }); }
    catch (error) { result = { state: 'conflict', detail: `Übernahme gescheitert: ${stderrOf(error)}` }; }
    finally { this.controller = undefined; }
    this.emit(unit.name, result);
  }
}

/** Welche Git-Operation im Arbeitsbaum gerade offen ist — die darf Cortex nicht stören. */
async function operationInProgress(root: string): Promise<string | undefined> {
  for (const [ref, name] of [['MERGE_HEAD', 'ein Merge'], ['CHERRY_PICK_HEAD', 'ein Cherry-Pick'], ['REVERT_HEAD', 'ein Revert']] as const) {
    if (await gitTest(root, ['rev-parse', '-q', '--verify', ref])) return name;
  }
  for (const dir of ['rebase-merge', 'rebase-apply']) {
    const path = (await git(root, ['rev-parse', '--path-format=absolute', '--git-path', dir])).trim();
    if (await exists(path)) return 'ein Rebase';
  }
  return undefined;
}

/** Konfliktdateien eines Probe-Merges ohne Arbeitsbaum; `undefined`, wenn Git das nicht kann (vor 2.38). */
async function probeConflicts(root: string, branch: string): Promise<string[] | undefined> {
  try { await git(root, ['merge-tree', '--write-tree', '--name-only', '--no-messages', '-z', 'HEAD', branch]); return []; }
  catch (error) {
    const { code, stdout } = error as { code?: unknown; stdout?: string };
    return code === 1 && stdout ? split(stdout).slice(1) : undefined;
  }
}

/**
 * Übernimmt die Zusammenführung per Merge-Commit in den Branch des Nutzers im
 * Hauptarbeitsbaum. Ungesicherte Änderungen des Nutzers bleiben, wie sie sind:
 * betrifft eine davon eine Datei des Schwarms, wird gar nicht erst gemergt.
 */
export async function adoptIntegration(opts: { root: string; integrationBranch: string; target: string }): Promise<AdoptResult> {
  const { root, integrationBranch, target } = opts;
  checkRef(integrationBranch, 'den Zusammenführungs-Branch');
  const current = await currentBranch(root);
  if (current !== target) {
    return { ok: false, detail: `Der Branch „${target}“ ist nicht mehr ausgecheckt${current ? ` (jetzt: „${current}“)` : ''}. Bitte zurückwechseln und erneut übernehmen.` };
  }
  if (!await hasBranch(root, integrationBranch)) return { ok: false, detail: `Der Zusammenführungs-Branch „${integrationBranch}“ fehlt.` };
  const busy = await operationInProgress(root);
  if (busy) return { ok: false, detail: `Im Projekt läuft gerade ${busy}. Bitte erst abschließen, dann übernehmen.` };
  if (await gitTest(root, ['merge-base', '--is-ancestor', integrationBranch, 'HEAD'])) return { ok: true, commit: await head(root) };
  const staged = split(await git(root, ['diff', '--cached', '--name-only', '-z', '--no-renames']));
  if (staged.length) return { ok: false, detail: `Im Projekt sind Änderungen vorgemerkt (git add): ${staged.join(', ')}. Bitte erst committen oder zurücknehmen, dann übernehmen.` };
  const incoming = split(await git(root, ['diff', '--name-only', '-z', '--no-renames', `HEAD...${integrationBranch}`, '--']));
  const local = new Set([
    ...split(await git(root, ['diff', '--name-only', '-z', '--no-renames', 'HEAD', '--'])),
    ...split(await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
  ]);
  const touched = incoming.filter(file => local.has(file));
  if (touched.length) {
    return { ok: false, detail: `Ungesicherte Änderungen im Projekt betreffen Dateien, die der Schwarm geändert hat: ${touched.join(', ')}. Bitte erst sichern oder beiseitelegen, dann übernehmen.` };
  }
  const probe = await probeConflicts(root, integrationBranch);
  if (probe?.length) return { ok: false, detail: `Konflikt mit „${target}“ in: ${probe.join(', ')}` };
  try {
    await git(root, [...await fallbackIdentity(root), 'merge', '--no-ff', '--no-edit', '--no-verify', '-m', `Schwarm übernommen: ${integrationBranch}`, integrationBranch]);
  } catch (error) {
    // Nur ohne Probe (altes Git) oder bei einem Wettlauf mit dem Nutzer landet man hier.
    const conflicted = await git(root, ['diff', '--name-only', '--diff-filter=U', '-z']).then(split, () => []);
    if (await gitTest(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).catch(() => false)) await git(root, ['merge', '--abort']).catch(() => {});
    if (conflicted.length) return { ok: false, detail: `Konflikt mit „${target}“ in: ${conflicted.join(', ')}` };
    const message = stderrOf(error);
    const blocked = message.split('\n').filter(line => line.startsWith('\t')).map(line => line.trim());
    return { ok: false, detail: blocked.length ? `Ungesicherte Änderungen würden überschrieben: ${blocked.join(', ')}. Bitte erst sichern, dann übernehmen.` : `Übernahme gescheitert: ${message}` };
  }
  return { ok: true, commit: await head(root) };
}

/**
 * Räumt den Worktree einer Einheit weg und löscht ihren Branch mit `-D`. Nur für
 * übernommene (oder leere) Einheiten aufrufen — ob die Commits in der
 * Zusammenführung stecken, prüft das nicht; `keepBranch` behält ihn (etwa bei
 * einem Konflikt, zum Nacharbeiten). Gelöscht werden nur `schwarm/…`-Branches.
 */
export async function cleanupUnit(unit: { root: string; path: string; branch: string }, opts: { keepBranch?: boolean } = {}): Promise<void> {
  await removeUnitWorkspace({ root: unit.root, path: unit.path });
  if (opts.keepBranch || !unit.branch.startsWith('schwarm/')) return;
  if (await hasBranch(unit.root, unit.branch)) await git(unit.root, ['branch', '-D', '--', unit.branch]);
}

/** Räumt den Worktree der Zusammenführung weg; ihr Branch bleibt. */
export async function cleanupIntegration(integration: { root: string; path: string }): Promise<void> {
  await removeUnitWorkspace({ root: integration.root, path: integration.path });
}
