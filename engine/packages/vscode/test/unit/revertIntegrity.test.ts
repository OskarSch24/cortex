import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureBaseline, captureTurnEnd, planRevert, restoreRevertFile } from '../../src/panel/workspace.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-integrity-')); dirs.push(dir);
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  writeFileSync(join(dir, 'file.txt'), 'before'); git('add', '.'); git('commit', '-qm', 'initial');
  return dir;
}
describe('#43 undo integrity', () => {
  it('detects manual edits since the agent and rejects edits during confirmation', async () => {
    const dir = repo(), baseline = (await captureBaseline(dir))!;
    writeFileSync(join(dir, 'file.txt'), 'agent');
    await captureTurnEnd(dir, baseline, ['file.txt']);
    expect((await planRevert(dir, baseline, ['file.txt'])).conflicts).toEqual([]);
    writeFileSync(join(dir, 'file.txt'), 'manual');
    const plan = await planRevert(dir, baseline, ['file.txt']);
    expect(plan.conflicts).toEqual(['file.txt']);
    writeFileSync(join(dir, 'file.txt'), 'edited while dialog open');
    await expect(restoreRevertFile(dir, 'file.txt', plan.restore[0]!.content, plan.expected['file.txt']!)).rejects.toThrow('Rückfrage');
    expect(readFileSync(join(dir, 'file.txt'), 'utf8')).toBe('edited while dialog open');
  });
  it('never treats missing baseline objects as newly created files', async () => {
    const dir = repo(), baseline = (await captureBaseline(dir))!;
    baseline.commit = '0'.repeat(40);
    await expect(planRevert(dir, baseline, ['file.txt'])).rejects.toThrow();
    expect(readFileSync(join(dir, 'file.txt'), 'utf8')).toBe('before');
  });
  it('skips symlinks to files outside the project', async () => {
    const dir = repo(), outside = mkdtempSync(join(tmpdir(), 'cortex-outside-')); dirs.push(outside);
    writeFileSync(join(outside, 'keep.txt'), 'keep');
    const baseline = (await captureBaseline(dir))!;
    symlinkSync(outside, join(dir, 'escape'));
    expect((await planRevert(dir, baseline, ['escape/keep.txt'])).skipped).toEqual(['escape/keep.txt']);
    expect(readFileSync(join(outside, 'keep.txt'), 'utf8')).toBe('keep');
  });
  it('restores the same checked file descriptor and truncates old content', async () => {
    const dir = repo(), baseline = (await captureBaseline(dir))!;
    writeFileSync(join(dir, 'file.txt'), 'agent output that is longer');
    await captureTurnEnd(dir, baseline, ['file.txt']);
    const plan = await planRevert(dir, baseline, ['file.txt']);
    await restoreRevertFile(dir, 'file.txt', plan.restore[0]!.content, plan.expected['file.txt']!);
    expect(readFileSync(join(dir, 'file.txt'), 'utf8')).toBe('before');
  });
});
