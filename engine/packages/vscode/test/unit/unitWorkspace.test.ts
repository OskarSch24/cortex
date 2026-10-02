import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitUnit, createUnitWorkspace, removeUnitWorkspace, unitChanges } from '../../src/teams/unitWorkspace.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

const gitIn = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const exists = (path: string) => lstat(path).then(() => true, () => false);

async function put(root: string, rel: string, content: string) {
  await mkdir(dirname(join(root, rel)), { recursive: true });
  await writeFile(join(root, rel), content);
}

/** Ein Datenprojekt wie das echte: Code versioniert, `daten/` und `.venv/` ignoriert. */
async function repo() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'cortex-unit-test-'))); roots.push(dir);
  const git = (...args: string[]) => gitIn(dir, ...args);
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  await put(dir, '.gitignore', 'daten/\n.venv/\n');
  await put(dir, 'README.md', 'Projekt\n');
  await put(dir, 'europa/importer/FR/run.py', 'print("fr")\n');
  await put(dir, 'europa/quellen/FR.yaml', 'fr: 1\n');
  git('add', '.'); git('commit', '-qm', 'initial');
  await put(dir, 'daten/eu/FR/fr.sqlite', 'fr-daten');
  await put(dir, '.venv/bin/python', '#!/bin/sh\n');
  const storage = await realpath(await mkdtemp(join(tmpdir(), 'cortex-unit-storage-'))); roots.push(storage);
  return { dir, git, storage };
}

describe('unit workspace', () => {
  it('creates a branch worktree with the carried state as base and links ignored folders', async () => {
    const { dir, git, storage } = await repo();
    const head = git('rev-parse', 'HEAD').trim();
    await put(dir, 'README.md', 'Projekt, geändert\n');
    await put(dir, 'notizen.txt', 'neu');
    const status = git('status', '--porcelain=v1');
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'AbCdEf12345678', unitId: 'FR Importer (Ü)' });
    expect(unit.root).toBe(dir);
    expect(unit.branch).toBe('schwarm/abcdef12/fr-importer-u');
    expect(unit.path).toBe(join(storage, 'AbCdEf12345678', 'FR Importer (Ü)', 'workspace'));
    expect(await readFile(join(unit.path, 'README.md'), 'utf8')).toBe('Projekt, geändert\n');
    expect(await readFile(join(unit.path, 'notizen.txt'), 'utf8')).toBe('neu');
    expect(await readFile(join(unit.path, 'europa/importer/FR/run.py'), 'utf8')).toBe('print("fr")\n');
    // Der Ausgangsstand ist ein eigener Commit auf dem Branch der Einheit.
    const wt = (...args: string[]) => gitIn(unit.path, ...args);
    expect(wt('rev-parse', 'HEAD').trim()).toBe(unit.base);
    expect(wt('log', '-1', '--format=%s%n%P', unit.base).trim()).toBe(`Schwarm: Ausgangsstand\n${head}`);
    expect(wt('rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(unit.branch);
    // Ignorierte Ordner sind verlinkt, `.git` nie; Git sieht die Links nicht.
    expect(unit.linked).toEqual(['.venv', 'daten']);
    expect(await readlink(join(unit.path, 'daten'))).toBe(join(dir, 'daten'));
    expect((await lstat(join(unit.path, '.git'))).isSymbolicLink()).toBe(false);
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    // `daten/` trifft nur echte Ordner; für den Link sorgt ein Eintrag in info/exclude.
    expect((await readFile(join(dir, '.git/info/exclude'), 'utf8')).split('\n')).toEqual(expect.arrayContaining(['/daten', '/.venv']));
    await writeFile(join(unit.path, 'daten/eu/FR/neu.sqlite'), 'geschrieben');
    expect(await readFile(join(dir, 'daten/eu/FR/neu.sqlite'), 'utf8')).toBe('geschrieben');
    expect(wt('status', '--porcelain', '--untracked-files=all')).toBe('');
    // Das Projekt selbst bleibt, wie es war.
    expect(git('status', '--porcelain=v1')).toBe(status);
    expect(git('rev-parse', 'HEAD').trim()).toBe(head);
  });

  it('uses HEAD as base when nothing is carried and dedupes the branch name', async () => {
    const { dir, git, storage } = await repo();
    const head = git('rev-parse', 'HEAD').trim();
    const first = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf1234-a', unitId: 'FR' });
    const second = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf1234-b', unitId: 'fr' });
    expect(first.base).toBe(head);
    expect(first.branch).toBe('schwarm/lauf1234/fr');
    expect(second.branch).toBe('schwarm/lauf1234/fr-2');
    await expect(createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf1234-a', unitId: 'FR' })).rejects.toThrow(/schon einen Arbeitsordner/);
    expect(await exists(first.path)).toBe(true);
  });

  it('starts from HEAD alone with carry: false but still links ignored folders', async () => {
    const { dir, git, storage } = await repo();
    const head = git('rev-parse', 'HEAD').trim();
    await put(dir, 'README.md', 'ungesichert\n');
    await put(dir, 'notizen.txt', 'neu');
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr', carry: false });
    expect(unit.base).toBe(head);
    expect(await readFile(join(unit.path, 'README.md'), 'utf8')).toBe('Projekt\n');
    expect(await exists(join(unit.path, 'notizen.txt'))).toBe(false);
    expect(unit.linked).toEqual(['.venv', 'daten']);
    expect(gitIn(unit.path, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('keeps the edits of two units apart', async () => {
    const { dir, storage } = await repo();
    const a = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'a' });
    const b = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'b' });
    await put(a.path, 'README.md', 'von a\n');
    await put(a.path, 'nur-a.txt', 'a');
    expect(await readFile(join(b.path, 'README.md'), 'utf8')).toBe('Projekt\n');
    expect(await exists(join(b.path, 'nur-a.txt'))).toBe(false);
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toBe('Projekt\n');
    expect(await commitUnit(a, 'a fertig')).toMatch(/^[0-9a-f]{40}$/);
    expect((await unitChanges(b, undefined)).changed).toEqual([]);
  });

  it('lists committed, uncommitted and untracked changes and flags those outside owns', async () => {
    const { dir, storage } = await repo();
    await put(dir, 'README.md', 'mitgebracht\n');
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr' });
    await put(unit.path, 'europa/importer/FR/run.py', 'print("neu")\n');
    await commitUnit(unit, 'FR-Importer');
    await put(unit.path, 'europa/quellen/FR.yaml', 'fr: 2\n');
    await put(unit.path, 'europa/importer/FR/hilfe/neu.py', 'x');
    await put(unit.path, 'europa/quellen/DE.yaml', 'de: 1\n');
    await put(unit.path, 'daten/eu/FR/zwei.sqlite', 'über den Link');
    await put(unit.path, 'daten/eu/DE/de.sqlite', 'über den Link');
    const changed = ['europa/importer/FR/hilfe/neu.py', 'europa/importer/FR/run.py', 'europa/quellen/DE.yaml', 'europa/quellen/FR.yaml'];
    expect(await unitChanges(unit, undefined)).toEqual({ changed, outside: [] });
    expect(await unitChanges(unit, [])).toEqual({ changed, outside: [] });
    const owns = ['europa/importer/FR/**', 'europa/quellen/FR.yaml', 'daten/eu/FR/'];
    expect((await unitChanges(unit, owns)).outside).toEqual(['europa/quellen/DE.yaml']);
    expect((await unitChanges(unit, ['europa/quellen/F?.yaml', 'europa/*/FR'])).outside).toEqual(['europa/quellen/DE.yaml']);
    expect((await unitChanges(unit, ['europa/*.py', 'europa/**/run.py'])).outside).toEqual(changed.filter(file => file !== 'europa/importer/FR/run.py'));
    expect((await unitChanges(unit, ['./europa/'])).outside).toEqual([]);
  });

  it('measures owns relative to a project subfolder', async () => {
    const { dir, storage } = await repo();
    const unit = await createUnitWorkspace({ cwd: join(dir, 'europa'), storageDir: storage, runId: 'lauf', unitId: 'fr' });
    expect(unit.path.endsWith(join('workspace', 'europa'))).toBe(true);
    await put(unit.path, 'importer/FR/run.py', 'neu');
    await put(unit.path, '../README.md', 'außerhalb');
    expect(await unitChanges(unit, ['importer/FR/**'])).toEqual({ changed: ['README.md', 'europa/importer/FR/run.py'], outside: ['README.md'] });
  });

  it('commits only real changes, never the links', async () => {
    const { dir, storage } = await repo();
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr' });
    const wt = (...args: string[]) => gitIn(unit.path, ...args);
    expect(await commitUnit(unit, 'nichts')).toBeUndefined();
    await put(unit.path, 'daten/eu/FR/neu.sqlite', 'nur Daten');
    expect(await commitUnit(unit, 'nur Daten')).toBeUndefined();
    await put(unit.path, 'europa/quellen/FR.yaml', 'fr: 3\n');
    const hash = await commitUnit(unit, 'Quelle FR');
    expect(hash).toBe(wt('rev-parse', 'HEAD').trim());
    expect(wt('log', '-1', '--format=%s|%an').trim()).toBe('Quelle FR|Test');
    expect(wt('ls-tree', '-r', '--name-only', 'HEAD').split('\n')).not.toContain('daten');
    expect(wt('ls-tree', '--name-only', 'HEAD').split('\n').filter(Boolean).sort()).toEqual(['.gitignore', 'README.md', 'europa']);
    // Ein nicht ignorierter Link in die echten Daten wird abgewiesen und nicht vorgemerkt.
    await symlink(join(dir, 'daten', 'eu'), join(unit.path, 'abkuerzung'));
    await expect(commitUnit(unit, 'Link')).rejects.toThrow(/Verlinkte Ordner/);
    expect(wt('diff', '--cached', '--name-only')).toBe('');
  });

  it('falls back to the Cortex identity only when the project has none', async () => {
    const { dir, git, storage } = await repo();
    git('config', 'user.name', '');
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr' });
    await put(unit.path, 'README.md', 'neu\n');
    await commitUnit(unit, 'ohne Namen');
    expect(gitIn(unit.path, 'log', '-1', '--format=%an|%ae').trim()).toBe('Cortex|test@example.com');
    expect(git('config', 'user.name').trim()).toBe('');
  });

  it('links exactly the given paths and rejects paths Git does not ignore', async () => {
    const { dir, git, storage } = await repo();
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr', link: ['daten/eu/FR/'] });
    expect(unit.linked).toEqual(['daten/eu/FR']);
    expect((await lstat(join(unit.path, 'daten/eu'))).isSymbolicLink()).toBe(false);
    expect(await readlink(join(unit.path, 'daten/eu/FR'))).toBe(join(dir, 'daten/eu/FR'));
    expect(await exists(join(unit.path, '.venv'))).toBe(false);
    expect(gitIn(unit.path, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    for (const link of [['europa'], ['.git'], ['../x'], ['fehlt']]) {
      await expect(createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'x', link })).rejects.toThrow(/ignorierte|Git-Ordner|nicht im Projekt|fehlt/);
    }
    expect(await readdir(join(storage, 'lauf'))).toEqual(['fr']);
    expect(git('branch', '--list', 'schwarm/*').split('\n').filter(Boolean).map(line => line.replace(/^[*+ ]+/, ''))).toEqual(['schwarm/lauf/fr']);
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(2);
  });

  it('removes the worktree but keeps the branch and the linked data', async () => {
    const { dir, git, storage } = await repo();
    const unit = await createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: 'fr' });
    await put(unit.path, 'daten/eu/FR/neu.sqlite', 'bleibt');
    await put(unit.path, 'europa/quellen/FR.yaml', 'fr: 4\n');
    await commitUnit(unit, 'FR');
    await removeUnitWorkspace(unit);
    expect(await exists(join(storage, 'lauf', 'fr'))).toBe(false);
    expect(await readFile(join(dir, 'daten/eu/FR/fr.sqlite'), 'utf8')).toBe('fr-daten');
    expect(await readFile(join(dir, 'daten/eu/FR/neu.sqlite'), 'utf8')).toBe('bleibt');
    expect(await readFile(join(dir, '.venv/bin/python'), 'utf8')).toBe('#!/bin/sh\n');
    expect(git('show', `${unit.branch}:europa/quellen/FR.yaml`)).toBe('fr: 4\n');
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    await expect(removeUnitWorkspace(unit)).resolves.toBeUndefined();
    await expect(removeUnitWorkspace({ root: dir, path: join(storage, 'lauf', 'nie') })).resolves.toBeUndefined();
    expect(await readFile(join(dir, 'README.md'), 'utf8')).toBe('Projekt\n');
  });

  it('rejects a folder outside Git with a German message and leaves nothing behind', async () => {
    const plain = await realpath(await mkdtemp(join(tmpdir(), 'cortex-unit-plain-'))); roots.push(plain);
    const storage = await realpath(await mkdtemp(join(tmpdir(), 'cortex-unit-storage-'))); roots.push(storage);
    await expect(createUnitWorkspace({ cwd: plain, storageDir: storage, runId: 'lauf', unitId: 'fr' })).rejects.toThrow(/Kein Git-Projekt/);
    expect(await readdir(storage)).toEqual([]);
    const { dir } = await repo();
    await expect(createUnitWorkspace({ cwd: dir, storageDir: storage, runId: 'lauf', unitId: '..' })).rejects.toThrow(/Ungültige Einheiten-Kennung/);
    expect(await readdir(storage)).toEqual([]);
  });
});
