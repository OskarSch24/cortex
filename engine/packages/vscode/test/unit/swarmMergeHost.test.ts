/**
 * Die Merge-Warteschlange vom Host aus (host/swarmMerge.ts), in einem echten
 * Git-Repo: fertige Einheiten gehen der Reihe nach auf den
 * Zusammenführungs-Branch, eine mit Konflikt bleibt draußen, ein Verstoß gegen
 * den eigenen Bereich wird nicht übernommen, und „übernehmen“ bringt das
 * Ergebnis in den Branch des Nutzers — ohne seine offenen Änderungen anzufassen.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SwarmMerge } from '../../src/panel/host/swarmMerge.js';
import { commitUnit, createUnitWorkspace } from '../../src/teams/unitWorkspace.js';
import type { AgentTeam, TeamRun } from '../../src/teams/types.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();
const temp = (prefix: string) => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir; };

async function unit(repo: string, storage: string, runId: string, id: string, files: Record<string, string>) {
  const ws = await createUnitWorkspace({ cwd: repo, storageDir: storage, runId, unitId: id });
  for (const [name, text] of Object.entries(files)) { mkdirSync(join(ws.path, name, '..'), { recursive: true }); writeFileSync(join(ws.path, name), text); }
  await commitUnit(ws, `Schwarm-Einheit ${id}`);
  return ws;
}

describe('Merge-Warteschlange im Host', () => {
  it('übernimmt fertige Einheiten, hält Konflikte und Bereichsverstöße draußen und übernimmt auf Kommando', async () => {
    const repo = temp('cortex-merge-host-');
    const storage = temp('cortex-merge-store-');
    git(repo, 'init', '-q', '-b', 'main');
    writeFileSync(join(repo, 'gemeinsam.txt'), 'start\n');
    writeFileSync(join(repo, 'notiz.txt'), 'offen\n');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'start');
    // Eine offene Änderung des Nutzers, die nichts mit den Einheiten zu tun hat.
    writeFileSync(join(repo, 'notiz.txt'), 'offen, noch nicht committet\n');

    const runId = 'run12345-abcd';
    const fr = await unit(repo, storage, runId, 'fr', { 'src/FR/a.py': 'fr\n' });
    const de = await unit(repo, storage, runId, 'de', { 'src/DE/a.py': 'de\n', 'gemeinsam.txt': 'de\n' });
    const it = await unit(repo, storage, runId, 'it', { 'gemeinsam.txt': 'it\n' });
    const es = await unit(repo, storage, runId, 'es', { 'src/ES/a.py': 'es\n', 'src/FR/fremd.py': 'x\n' });

    const team: AgentTeam = { id: 'swarm-chat1-karte', kind: 'team', name: 'Schwarm', description: '', instructions: '', projectPath: repo, isolation: 'worktree', pool: {}, updatedAt: 0,
      agents: ['fr', 'de', 'it', 'es'].map(id => ({ id, name: id.toUpperCase(), role: '', instructions: '', target: { provider: 'claude', account: 'x' }, permissionMode: 'full' as const, skillPaths: [], dependsOn: [] })) };
    const job = (id: string, ws: { branch: string; base: string; path: string }, extra = {}) => ({ agentId: id, agentName: id.toUpperCase(), status: 'completed' as const, branch: ws.branch, base: ws.base, worktree: ws.path, ...extra });
    const run: TeamRun = { id: runId, kind: 'team', teamId: team.id, teamName: team.name, task: 'x', status: 'completed', startedAt: 0,
      jobs: [job('fr', fr), job('de', de), job('it', it), job('es', es, { outside: ['src/FR/fremd.py'] })] };
    const store = { runs: [run], teams: [team], refresh() {}, updateMerge: (id: string, change: (run: TeamRun) => void) => { if (id === runId) change(run); } };
    const notices: string[] = [];
    const merge = new SwarmMerge({ teams: () => store as never, storageDir: storage, publish: vi.fn(), notice: (_id, text) => notices.push(text), defaultChecks: () => ['test -f gemeinsam.txt'] });

    await merge.start(runId);
    await vi.waitFor(() => expect(run.jobs.every(entry => entry.merge && entry.merge.state !== 'waiting' && entry.merge.state !== 'merging')).toBe(true), { timeout: 20_000 });
    expect(Object.fromEntries(run.jobs.map(entry => [entry.agentId, entry.merge!.state]))).toEqual({ fr: 'merged', de: 'merged', it: 'conflict', es: 'outside' });
    expect(run.merge).toMatchObject({ enabled: true, targetBranch: 'main', checks: ['test -f gemeinsam.txt'] });
    expect(notices.some(text => text.startsWith('IT nicht übernommen'))).toBe(true);
    // Übernommene Einheiten: Worktree weg; die mit Konflikt bleibt zum Nachsehen.
    await vi.waitFor(() => expect(existsSync(fr.path)).toBe(false));
    expect(existsSync(it.path)).toBe(true);
    // Der Branch des Nutzers ist noch unberührt.
    expect(existsSync(join(repo, 'src', 'FR', 'a.py'))).toBe(false);

    await merge.adopt(runId);
    expect(run.merge!.adopted).toBe('ok');
    expect(readFileSync(join(repo, 'src', 'FR', 'a.py'), 'utf8')).toBe('fr\n');
    expect(readFileSync(join(repo, 'gemeinsam.txt'), 'utf8')).toBe('de\n');
    expect(existsSync(join(repo, 'src', 'ES', 'a.py'))).toBe(false);
    // Die offene Änderung des Nutzers ist noch da.
    expect(readFileSync(join(repo, 'notiz.txt'), 'utf8')).toBe('offen, noch nicht committet\n');
    merge.dispose();
  }, 60_000);
});

describe('/merge-queue', () => {
  it('schaltet ein, nimmt einen Prüfbefehl, übernimmt und hält an — im Chat, der den Schwarm gestartet hat', async () => {
    const { ChatViewProvider } = await import('../../src/panel/chatViewProvider.js');
    const chat = Object.create(ChatViewProvider.prototype) as any;
    const fake = { latestRun: vi.fn(() => ({ id: 'run-1' })), start: vi.fn(async () => {}), adopt: vi.fn(async () => {}), stop: vi.fn() };
    chat.swarmMerge = fake;
    chat.toConversation = vi.fn();
    await chat.mergeQueueCommand('chat1', '');
    expect(fake.start).toHaveBeenLastCalledWith('run-1', undefined);
    await chat.mergeQueueCommand('chat1', 'npm test && python3 -m pytest');
    expect(fake.start).toHaveBeenLastCalledWith('run-1', ['npm test && python3 -m pytest']);
    await chat.mergeQueueCommand('chat1', 'übernehmen');
    expect(fake.adopt).toHaveBeenCalledWith('run-1');
    await chat.mergeQueueCommand('chat1', 'aus');
    expect(fake.stop).toHaveBeenCalledWith('run-1');
    fake.latestRun.mockReturnValueOnce(undefined as never);
    await chat.mergeQueueCommand('chat2', '');
    expect(chat.toConversation).toHaveBeenLastCalledWith('chat2', expect.objectContaining({ text: expect.stringContaining('keinen Schwarm') }));
    fake.adopt.mockRejectedValueOnce(new Error('Die Zusammenführung läuft noch'));
    await chat.mergeQueueCommand('chat1', 'übernehmen');
    expect(chat.toConversation).toHaveBeenLastCalledWith('chat1', expect.objectContaining({ text: 'Die Zusammenführung läuft noch' }));
  });
});
