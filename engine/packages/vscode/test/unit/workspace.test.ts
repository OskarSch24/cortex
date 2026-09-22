import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { expandHome, inspectWorkspace, parseChanges, projectFile, projectRelative, collectDiff } from '../../src/panel/workspace.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cortex-project-')); roots.push(root);
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src', 'hello world.ts'), 'export const answer = 42');
  await mkdir(join(root, 'node_modules')); return root;
}
describe('project workspace isolation', () => {
  it('labels tracked and untracked binary changes without treating bytes as diff text', async () => {
    const root = await fixture();
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init'); await writeFile(join(root, 'tracked.bin'), Buffer.from([0, 1]));
    git('add', 'tracked.bin'); git('-c', 'user.name=Cortex Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    await writeFile(join(root, 'tracked.bin'), Buffer.from([0, 2])); await writeFile(join(root, 'new.bin'), Buffer.from([0, 3]));
    const files = await collectDiff(root);
    expect(files.find(file => file.path === 'tracked.bin')).toMatchObject({ binary: true });
    expect(files.find(file => file.path === 'new.bin')).toMatchObject({ binary: true, hunks: [] });
  });
  it('lists real project files and navigates folders without dependency noise', async () => {
    const root = await fixture();
    expect((await inspectWorkspace(root)).files.map(f => f.name)).toEqual(['src']);
    const nested = await inspectWorkspace(root, 'src');
    expect(nested.files[0]).toMatchObject({ name: 'hello world.ts', path: 'src/hello world.ts', directory: false });
  });
  it('blocks traversal and symlinks outside the selected project', async () => {
    const root = await fixture(); const other = await fixture();
    await symlink(join(other, 'src'), join(root, 'external'));
    await expect(projectFile(root, '../')).rejects.toThrow('außerhalb');
    await expect(projectFile(root, join(other, 'src'))).rejects.toThrow('außerhalb');
    await expect(projectFile(root, 'external/hello world.ts')).rejects.toThrow('außerhalb');
  });
  it('finds a "~/…" transcript path inside a decomposed project folder', () => {
    const home = '/Users/me';
    const root = '/Users/me/Persönliche Projekte/Demo'.normalize('NFD');
    expect(projectRelative('~/Persönliche Projekte/Demo/Mock/a.html'.normalize('NFC'), root, home)).toBe('Mock/a.html');
    expect(projectRelative('/Users/me/Persönliche Projekte/Demo/b.md', root, home)).toBe('b.md');
    expect(projectRelative('~/Desktop/notiz.md', root, home)).toBe('~/Desktop/notiz.md');
    expect(projectRelative('~/Persönliche Projekte/Demo2/x.md', root, home)).toBe('~/Persönliche Projekte/Demo2/x.md');
    expect(expandHome('~/Desktop/notiz.md', home)).toBe('/Users/me/Desktop/notiz.md');
    expect(expandHome('/tmp/a.png', home)).toBe('/tmp/a.png');
  });
  it('opens an absolute project path whose umlaut is composed differently', async () => {
    const root = await fixture();
    await mkdir(join(root, 'Persönliche'.normalize('NFD')));
    await writeFile(join(root, 'Persönliche'.normalize('NFD'), 'a.html'), '<p>x</p>');
    const file = await projectFile(root, join(root, 'Persönliche'.normalize('NFC'), 'a.html'));
    expect(file.normalize('NFC')).toMatch(/Persönliche\/a\.html$/);
  });
  it('preserves spaces, unicode and rename destinations in git status', () => {
    expect(parseChanges(' M src/hello world.ts\0R  neuer name.ts\0alter name.ts\0?? grüße.md\0')).toEqual([
      { status: 'M', path: 'src/hello world.ts' }, { status: 'R', path: 'neuer name.ts' }, { status: '??', path: 'grüße.md' },
    ]);
  });
});
