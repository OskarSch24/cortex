import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, readlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createForkWorkspace, workspaceRunKey } from '../../src/panel/forkWorkspace.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function repo() {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-fork-test-')); roots.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  await writeFile(join(dir, 'file.txt'), 'committed');
  git('add', '.'); git('commit', '-qm', 'initial');
  const storage = await mkdtemp(join(tmpdir(), 'cortex-fork-storage-')); roots.push(storage);
  return { dir, git, storage };
}
describe('isolated fork workspace', () => {
  it('copies staged, unstaged, binary and untracked content without changing the source index or stash', async () => {
    const { dir, git, storage } = await repo();
    await writeFile(join(dir, 'file.txt'), 'staged'); git('add', 'file.txt');
    await writeFile(join(dir, 'file.txt'), 'unstaged');
    await mkdir(join(dir, 'folder'));
    await writeFile(join(dir, 'folder', 'new.bin'), Buffer.from([0, 1, 255, 2]));
    const status = git('status', '--porcelain=v1'), index = git('diff', '--cached', '--binary');
    const fork = await createForkWorkspace(dir, storage);
    expect(await readFile(join(fork, 'file.txt'), 'utf8')).toBe('unstaged');
    expect(await readFile(join(fork, 'folder/new.bin'))).toEqual(Buffer.from([0, 1, 255, 2]));
    await writeFile(join(fork, 'file.txt'), 'fork edit');
    expect(await readFile(join(dir, 'file.txt'), 'utf8')).toBe('unstaged');
    expect(git('status', '--porcelain=v1')).toBe(status);
    expect(git('diff', '--cached', '--binary')).toBe(index);
    expect(git('stash', 'list')).toBe('');
  });
  it('keeps a selected subdirectory inside its isolated repository', async () => {
    const { dir, git, storage } = await repo();
    await mkdir(join(dir, 'sub')); await writeFile(join(dir, 'sub/a.txt'), 'a'); git('add', '.'); git('commit', '-qm', 'sub');
    const fork = await createForkWorkspace(join(dir, 'sub'), storage);
    expect(await readFile(join(fork, 'a.txt'), 'utf8')).toBe('a');
  });
  it('shares one lock key across subfolders but isolates separate worktrees', async () => {
    const { dir, git, storage } = await repo();
    await mkdir(join(dir, 'sub')); await writeFile(join(dir, 'sub/a.txt'), 'a'); git('add', '.'); git('commit', '-qm', 'sub');
    const fork = await createForkWorkspace(dir, storage);
    expect(await workspaceRunKey(join(dir, 'sub'))).toBe(await workspaceRunKey(dir));
    expect(await workspaceRunKey(fork)).not.toBe(await workspaceRunKey(dir));
  });
  it('remaps tracked absolute links and preserves untracked internal relative links', async () => {
    const { dir, git, storage } = await repo();
    await symlink(join(dir, 'file.txt'), join(dir, 'absolute.txt'));
    git('add', 'absolute.txt'); git('commit', '-qm', 'absolute link');
    await symlink('file.txt', join(dir, 'relative.txt'));
    const fork = await createForkWorkspace(dir, storage);
    expect(await readlink(join(fork, 'absolute.txt'))).toBe('file.txt');
    expect(await readlink(join(fork, 'relative.txt'))).toBe('file.txt');
    expect(await readlink(join(dir, 'absolute.txt'))).toBe(join(dir, 'file.txt'));
    await writeFile(join(fork, 'absolute.txt'), 'fork only');
    expect(await readFile(join(dir, 'file.txt'), 'utf8')).toBe('committed');
    expect(await readFile(join(fork, 'relative.txt'), 'utf8')).toBe('fork only');
  });
  it('rejects links escaping through a parent and cleans the partial worktree', async () => {
    const { dir, git, storage } = await repo();
    const outside = await mkdtemp(join(tmpdir(), 'cortex-fork-outside-')); roots.push(outside);
    await writeFile(join(outside, 'external.txt'), 'external');
    await symlink(outside, join(dir, 'outside'));
    git('add', 'outside'); git('commit', '-qm', 'external directory');
    await symlink('outside/external.txt', join(dir, 'indirect.txt'));
    await expect(createForkWorkspace(dir, storage)).rejects.toThrow(/Externer symbolischer Link/);
    expect(await readFile(join(outside, 'external.txt'), 'utf8')).toBe('external');
    expect(await readdir(storage)).toEqual([]);
    expect(git('worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
  });
  it('rejects broken internal links rather than promising an isolated copy', async () => {
    const { dir, storage } = await repo();
    await symlink('missing.txt', join(dir, 'broken.txt'));
    await expect(createForkWorkspace(dir, storage)).rejects.toThrow(/Defekter symbolischer Link/);
    expect(await readlink(join(dir, 'broken.txt'))).toBe('missing.txt');
  });
});
