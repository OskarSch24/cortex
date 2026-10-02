import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adoptIntegration, cleanupIntegration, cleanupUnit, createIntegration, mergeUnit, MergeQueue } from '../../src/teams/mergeQueue.js';
import type { UnitMerge } from '../../src/teams/types.js';
import { commitUnit, createUnitWorkspace } from '../../src/teams/unitWorkspace.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const exists = (path: string) => lstat(path).then(() => true, () => false);

async function put(root: string, rel: string, content: string) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

/** Ein Datenprojekt wie das echte: Code versioniert auf `main`, `daten/` und `.venv/` ignoriert. */
async function repo() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cortex-merge-test-'))); roots.push(dir);
  const git = (...args: string[]) => gitIn(dir, ...args);
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  await put(dir, '.gitignore', 'daten/\n.venv/\n');
  await put(dir, 'README.md', 'Projekt\n');
  await put(dir, 'europa/quellen/FR.yaml', 'fr: 1\n');
  await put(dir, 'europa/quellen/DE.yaml', 'de: 1\n');
  git('add', '.'); git('commit', '-qm', 'initial');
  await put(dir, 'daten/eu/FR/fr.sqlite', 'fr-daten');
  const storage = await realpath(await mkdtemp(join(tmpdir(), 'cortex-merge-storage-'))); roots.push(storage);
  const unit = async (unitId: string, files: Record<string, string>) => {
    const workspace = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf1234', unitId });
    for (const [rel, content] of Object.entries(files)) await put(workspace.path, rel, content);
    if (Object.keys(files).length) await commitUnit(workspace, `Einheit ${unitId}`);
    return { ...workspace, name: unitId };
  };
  return { dir, git, storage, unit };
}

// Echte Git-Aufrufe in Reihe: großzügiger als die Vorgabe von 5 s.
describe('merge queue', { timeout: 30_000 }, () => {
  it('branches the integration from committed state only and takes just the unit’s own commits', async () => {
    const { dir, git, storage, unit } = await repo();
    await put(dir, 'README.md', 'ungesichert\n');
    const status = git('status', '--porcelain=v1');
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    expect(integration).toMatchObject({ root: dir, branch: 'schwarm/lauf1234/zusammenfuehrung', target: 'main', base: git('rev-parse', 'HEAD').trim() });
    expect(integration.path).toBe(join(storage, 'lauf1234', 'zusammenfuehrung', 'workspace'));
    expect(await readFile(join(integration.path, 'README.md'), 'utf8')).toBe('Projekt\n');
    const wt = (...args: string[]) => gitIn(integration.path, ...args);
    expect(wt('rev-parse', 'HEAD').trim()).toBe(integration.base);
    // Verlinkt wie bei den Einheiten, für Git unsichtbar.
    expect(await readlink(join(integration.path, 'daten'))).toBe(join(dir, 'daten'));
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    // Ein zweiter Aufruf liefert dieselbe Zusammenführung.
    expect(await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' })).toEqual(integration);

    const fr = await unit('fr', { 'europa/quellen/FR.yaml': 'fr: 2\n' });
    expect(await readFile(join(fr.path, 'README.md'), 'utf8')).toBe('ungesichert\n');
    const merge = await mergeUnit(integration, fr, []);
    expect(merge.state).toBe('merged');
    expect(merge.commit).toBe(wt('rev-parse', 'HEAD').trim());
    expect(wt('diff', '--name-only', integration.base, 'HEAD').trim()).toBe('europa/quellen/FR.yaml');
    expect(wt('log', '-1', '--format=%s|%an').trim()).toBe('Einheit fr|Test');
    expect(await readFile(join(integration.path, 'README.md'), 'utf8')).toBe('Projekt\n');
    expect(wt('ls-tree', '-r', '--name-only', 'HEAD').split('\n')).not.toContain('daten');
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    // Das Projekt selbst bleibt, wie es war.
    expect(git('status', '--porcelain=v1')).toBe(status);
    expect(git('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('main');
  });

  it('rejects a detached HEAD', async () => {
    const { dir, git, storage } = await repo();
    git('checkout', '-q', '--detach');
    await expect(createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' })).rejects.toThrow(/kein Branch ausgecheckt/);
    expect(git('branch', '--list', 'schwarm/*')).toBe('');
  });

  it('merges independent units, refuses a conflicting one and skips an empty one', async () => {
    const { dir, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const wt = (...args: string[]) => gitIn(integration.path, ...args);
    const a = await unit('a', { 'europa/quellen/FR.yaml': 'fr: a\n' });
    const b = await unit('b', { 'europa/quellen/DE.yaml': 'de: b\n', 'europa/quellen/NL.yaml': 'nl: b\n' });
    const c = await unit('c', { 'europa/quellen/FR.yaml': 'fr: c\n', 'europa/quellen/BE.yaml': 'be: c\n' });
    const d = await unit('d', {});
    expect((await mergeUnit(integration, a, [])).state).toBe('merged');
    expect((await mergeUnit(integration, b, [])).state).toBe('merged');
    const before = wt('rev-parse', 'HEAD').trim();
    expect(await mergeUnit(integration, c, [])).toEqual({ state: 'conflict', detail: 'Konflikt in: europa/quellen/FR.yaml' });
    expect(wt('rev-parse', 'HEAD').trim()).toBe(before);
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(await exists(join(integration.path, 'europa/quellen/BE.yaml'))).toBe(false);
    expect(await mergeUnit(integration, d, [])).toEqual({ state: 'skipped', detail: 'Nichts geändert.' });
    expect(wt('log', '--format=%s', `${integration.base}..HEAD`).trim().split('\n')).toEqual(['Einheit b', 'Einheit a']);
    expect(await readFile(join(integration.path, 'europa/quellen/NL.yaml'), 'utf8')).toBe('nl: b\n');
  });

  it('runs the checks and takes a failing unit back without touching linked data', async () => {
    const { dir, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const wt = (...args: string[]) => gitIn(integration.path, ...args);
    const a = await unit('a', { 'europa/x': 'x' });
    const b = await unit('b', { 'europa/y': 'y' });
    expect((await mergeUnit(integration, a, ['test -f europa/x', 'test "$CI" = 1'])).state).toBe('merged');
    const before = wt('rev-parse', 'HEAD').trim();
    const failing = 'echo daten > daten/eu/check.txt; echo kaputt; echo laut >&2; exit 3';
    const merge = await mergeUnit(integration, b, ['test -f europa/y', failing, 'echo nie > nie.txt']);
    expect(merge.state).toBe('checks-failed');
    expect(merge.detail).toBe(`${failing}: exit 3\nkaputt\nlaut`);
    expect(wt('rev-parse', 'HEAD').trim()).toBe(before);
    expect(await exists(join(integration.path, 'europa/y'))).toBe(false);
    expect(await exists(join(integration.path, 'nie.txt'))).toBe(false);
    // Die Daten hinter dem Link überstehen das Zurücksetzen.
    expect(await readFile(join(dir, 'daten/eu/FR/fr.sqlite'), 'utf8')).toBe('fr-daten');
    expect(await readFile(join(dir, 'daten/eu/check.txt'), 'utf8')).toBe('daten\n');
    expect((await lstat(join(integration.path, 'daten'))).isSymbolicLink()).toBe(true);
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    // Die Einheit bleibt übernehmbar, sobald die Prüfung besteht.
    expect((await mergeUnit(integration, b, ['test -f europa/y'])).state).toBe('merged');
  });

  it('times out a hanging check', async () => {
    const { dir, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const a = await unit('a', { 'europa/x': 'x' });
    const started = Date.now();
    const merge = await mergeUnit(integration, a, ['echo los; sleep 30'], { timeoutMs: 300 });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(merge).toEqual({ state: 'checks-failed', detail: 'echo los; sleep 30: Zeitlimit von 1 s überschritten\nlos' });
    expect(gitIn(integration.path, 'rev-parse', 'HEAD').trim()).toBe(integration.base);
  });

  it('processes the queue one unit at a time in order', async () => {
    const { dir, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const log = join(storage, 'pruefung.log');
    const events: string[] = [];
    const queue = new MergeQueue(integration, [`echo start >> '${log}'; sleep 0.2; echo ende >> '${log}'`], (name, merge: UnitMerge) => events.push(`${name}:${merge.state}`));
    const units = [await unit('a', { 'a.txt': 'a' }), await unit('b', { 'b.txt': 'b' }), await unit('c', { 'c.txt': 'c' })];
    await queue.idle();
    for (const u of units) queue.enqueue(u);
    // Die erste Einheit beginnt sofort, die übrigen warten.
    expect(events).toEqual(['a:waiting', 'a:merging', 'b:waiting', 'c:waiting']);
    await queue.idle();
    expect(events).toEqual(['a:waiting', 'a:merging', 'b:waiting', 'c:waiting', 'a:merged', 'b:merging', 'b:merged', 'c:merging', 'c:merged']);
    expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual(['start', 'ende', 'start', 'ende', 'start', 'ende']);
    expect(gitIn(integration.path, 'log', '--format=%s', `${integration.base}..HEAD`).trim().split('\n')).toEqual(['Einheit c', 'Einheit b', 'Einheit a']);
    // Nach dem Leerlauf nimmt die Warteschlange weitere Einheiten an.
    queue.enqueue(await unit('d', { 'd.txt': 'd' }));
    await queue.idle();
    expect(events.slice(-3)).toEqual(['d:waiting', 'd:merging', 'd:merged']);
  });

  it('stops a long check quickly and drops the waiting units', async () => {
    const { dir, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const events: [string, UnitMerge][] = [];
    const queue = new MergeQueue(integration, ['sleep 30'], (name, merge) => events.push([name, merge]));
    const a = await unit('a', { 'a.txt': 'a' }), b = await unit('b', { 'b.txt': 'b' });
    queue.enqueue(a); queue.enqueue(b);
    // Warten, bis die Prüfung läuft (der Cherry-Pick ist durch).
    for (let i = 0; i < 100 && !(await exists(join(integration.path, 'a.txt'))); i++) await new Promise(r => setTimeout(r, 20));
    await new Promise(r => setTimeout(r, 100));
    const started = Date.now();
    queue.stop();
    await queue.idle();
    expect(Date.now() - started).toBeLessThan(3000);
    expect(events.map(([name, merge]) => `${name}:${merge.state}`)).toEqual(['a:waiting', 'a:merging', 'b:waiting', 'a:checks-failed']);
    expect(events[3]![1].detail).toBe('sleep 30: abgebrochen');
    expect(gitIn(integration.path, 'rev-parse', 'HEAD').trim()).toBe(integration.base);
    queue.enqueue(b);
    expect(events).toHaveLength(4);
  });

  it('adopts the integration into the user’s branch with a merge commit', async () => {
    const { dir, git, storage, unit } = await repo();
    await put(dir, 'notizen.txt', 'eigene Notiz');
    await put(dir, 'europa/quellen/DE.yaml', 'de: ungesichert\n');
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    await mergeUnit(integration, await unit('a', { 'europa/quellen/FR.yaml': 'fr: a\n', 'neu.txt': 'neu' }), []);
    const status = git('status', '--porcelain=v1');
    const result = await adoptIntegration({ root: dir, integrationBranch: integration.branch, target: 'main' });
    expect(result).toEqual({ ok: true, commit: git('rev-parse', 'HEAD').trim() });
    expect(git('log', '-1', '--format=%s|%P').trim()).toBe(`Schwarm übernommen: ${integration.branch}|${integration.base} ${gitIn(integration.path, 'rev-parse', 'HEAD').trim()}`);
    expect(await readFile(join(dir, 'europa/quellen/FR.yaml'), 'utf8')).toBe('fr: a\n');
    expect(await readFile(join(dir, 'neu.txt'), 'utf8')).toBe('neu');
    // Ungesicherte Änderungen des Nutzers überstehen die Übernahme.
    expect(await readFile(join(dir, 'europa/quellen/DE.yaml'), 'utf8')).toBe('de: ungesichert\n');
    expect(git('status', '--porcelain=v1')).toBe(status);
    // Nochmal übernehmen ändert nichts.
    expect(await adoptIntegration({ root: dir, integrationBranch: integration.branch, target: 'main' })).toEqual(result);
  });

  it('refuses to adopt over uncommitted changes, on conflict and on another branch', async () => {
    const { dir, git, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    await mergeUnit(integration, await unit('a', { 'europa/quellen/FR.yaml': 'fr: a\n', 'neu.txt': 'neu' }), []);
    const adopt = () => adoptIntegration({ root: dir, integrationBranch: integration.branch, target: 'main' });
    const head = git('rev-parse', 'HEAD').trim();

    await put(dir, 'europa/quellen/FR.yaml', 'fr: ungesichert\n');
    await put(dir, 'neu.txt', 'eigene Datei');
    let status = git('status', '--porcelain=v1');
    let result = await adopt();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.detail).toMatch(/Ungesicherte Änderungen.*europa\/quellen\/FR\.yaml, neu\.txt/);
    expect(await readFile(join(dir, 'europa/quellen/FR.yaml'), 'utf8')).toBe('fr: ungesichert\n');
    expect(git('status', '--porcelain=v1')).toBe(status);
    expect(git('rev-parse', 'HEAD').trim()).toBe(head);

    git('add', 'europa/quellen/FR.yaml');
    result = await adopt();
    expect(!result.ok && result.detail).toMatch(/vorgemerkt \(git add\): europa\/quellen\/FR\.yaml/);

    // Der Nutzer committet dieselbe Zeile selbst: Konflikt, sauber abgebrochen.
    git('commit', '-qm', 'eigene Änderung'); await rm(join(dir, 'neu.txt'));
    const mine = git('rev-parse', 'HEAD').trim();
    status = git('status', '--porcelain=v1');
    result = await adopt();
    expect(result).toEqual({ ok: false, detail: 'Konflikt mit „main“ in: europa/quellen/FR.yaml' });
    expect(git('rev-parse', 'HEAD').trim()).toBe(mine);
    expect(git('status', '--porcelain=v1')).toBe(status);
    expect(() => git('rev-parse', '-q', '--verify', 'MERGE_HEAD')).toThrow();

    git('checkout', '-q', '-b', 'anderswo');
    result = await adopt();
    expect(!result.ok && result.detail).toMatch(/„main“ ist nicht mehr ausgecheckt \(jetzt: „anderswo“\)/);
  });

  it('does not disturb a merge the user has in progress', async () => {
    const { dir, git, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    await mergeUnit(integration, await unit('a', { 'neu.txt': 'neu' }), []);
    git('checkout', '-q', '-b', 'seitenzweig'); await put(dir, 'README.md', 'seite\n'); git('commit', '-qam', 'seite');
    git('checkout', '-q', 'main'); await put(dir, 'README.md', 'haupt\n'); git('commit', '-qam', 'haupt');
    expect(() => git('merge', '-q', 'seitenzweig')).toThrow();
    const status = git('status', '--porcelain=v1');
    const result = await adoptIntegration({ root: dir, integrationBranch: integration.branch, target: 'main' });
    expect(!result.ok && result.detail).toMatch(/läuft gerade ein Merge/);
    expect(git('status', '--porcelain=v1')).toBe(status);
    git('merge', '--abort');
  });

  it('cleans up unit and integration worktrees idempotently', async () => {
    const { dir, git, storage, unit } = await repo();
    const integration = await createIntegration({ cwd: dir, storageDir: storage, runId: 'lauf1234' });
    const a = await unit('a', { 'a.txt': 'a' }), b = await unit('b', { 'b.txt': 'b' });
    await mergeUnit(integration, a, []);
    await cleanupUnit(a);
    expect(await exists(join(storage, 'lauf1234', 'a'))).toBe(false);
    expect(git('branch', '--list', a.branch)).toBe('');
    await expect(cleanupUnit(a)).resolves.toBeUndefined();
    await cleanupUnit(b, { keepBranch: true });
    expect(await exists(join(storage, 'lauf1234', 'b'))).toBe(false);
    expect(git('branch', '--list', b.branch)).not.toBe('');
    await cleanupIntegration(integration);
    await expect(cleanupIntegration(integration)).resolves.toBeUndefined();
    expect(await exists(join(storage, 'lauf1234', 'zusammenfuehrung'))).toBe(false);
    expect(git('show', `${integration.branch}:a.txt`)).toBe('a');
    expect(await readFile(join(dir, 'daten/eu/FR/fr.sqlite'), 'utf8')).toBe('fr-daten');
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });
});
