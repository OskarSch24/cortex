import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { TeamStore } from '../../src/teams/store.js';
import { TeamRunner, type TeamPoolAccount } from '../../src/teams/runner.js';
import { MAX_TEAM_AGENTS, validateTeam, type AgentTeam, type TeamAgent, type TeamPool } from '../../src/teams/types.js';

const temporary: string[] = [];
const unit = (id: string, dependsOn: string[] = []): TeamAgent => ({ id, name: id, role: 'Einheit', instructions: 'Arbeite deinen Teil ab.', target: { provider: 'claude', account: 'privat' }, permissionMode: 'safe', mcpServers: [], skillPaths: [], dependsOn });
const units = (count: number) => Array.from({ length: count }, (_, index) => unit(`u${index + 1}`));
const swarm = (agents: TeamAgent[], pool?: TeamPool): AgentTeam => ({ id: 'schwarm', name: 'Schwarm', description: '', instructions: '', updatedAt: 1, agents, ...(pool ? { pool } : {}) });
const store = (team: AgentTeam) => {
  const directory = mkdtempSync(join(tmpdir(), 'cortex-pool-')); temporary.push(directory);
  const data = new TeamStore(join(directory, 'teams.json'));
  data.save(team, 0);
  return data;
};
const two: TeamPoolAccount[] = [{ provider: 'claude', account: 'a' }, { provider: 'claude', account: 'b' }];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

/** Zählt laufende Einheiten je Konto und merkt sich die Höchststände. */
const meter = () => {
  const now = new Map<string, number>(), peak = new Map<string, number>();
  let total = 0, peakTotal = 0;
  return {
    enter(account: string) {
      now.set(account, (now.get(account) ?? 0) + 1); total++;
      peak.set(account, Math.max(peak.get(account) ?? 0, now.get(account)!)); peakTotal = Math.max(peakTotal, total);
    },
    leave(account: string) { now.set(account, now.get(account)! - 1); total--; },
    get peak() { return peak; }, get peakTotal() { return peakTotal; },
  };
};

it('runs as many units as the pool allows on the first account and completes all of them', async () => {
  const data = store(swarm(units(25), { concurrency: 12 }));
  const seats = meter();
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent) => {
    seats.enter(current.target.account);
    await new Promise(resolve => setTimeout(resolve, 2));
    seats.leave(current.target.account);
    return `Fertig: ${current.id}`;
  });
  const runner = new TeamRunner(data, execute, () => {}, () => two);
  const run = runner.start('schwarm', 'Auftrag');
  // Ein Konto begrenzt die Zahl seiner Sitzungen nicht: alle 12 laufen auf dem ersten.
  expect(run.jobs.filter(job => job.status === 'running')).toHaveLength(12);
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(execute).toHaveBeenCalledTimes(25);
  expect(seats.peakTotal).toBe(12);
  expect(seats.peak.get('a')).toBe(12);
  expect(run.jobs.every(job => job.status === 'completed' && job.attempts === 1 && job.account === 'a')).toBe(true);
});

it('respects the pool concurrency below the free seats', async () => {
  const data = store(swarm(units(8), { concurrency: 2 }));
  const seats = meter();
  const runner = new TeamRunner(data, async (_team, current) => {
    seats.enter('alle'); await new Promise(resolve => setTimeout(resolve, 1)); seats.leave('alle');
    return 'ok';
  }, () => {}, () => two);
  const run = runner.start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(seats.peakTotal).toBe(2);
});

it('chooses the account dynamically and retries a failed unit on the other account', async () => {
  const data = store(swarm([{ ...unit('u1'), effort: 'high' }], {}));
  const activities: Array<string | undefined> = [];
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent) => {
    if (execute.mock.calls.length === 1) throw new Error('Limit erreicht');
    return `Fertig auf ${current.target.account}`;
  });
  const runner = new TeamRunner(data, execute, () => activities.push(data.runs[0]?.jobs[0]?.activity), () => [{ provider: 'claude', account: 'a', model: 'claude-opus-4-1' }, { provider: 'claude', account: 'b' }]);
  const run = runner.start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(execute.mock.calls.map(call => call[1].target.account)).toEqual(['a', 'b']);
  // Das Konto bringt sein Modell mit; die Reasoning-Stärke der Rolle gilt dort nicht mehr.
  expect(execute.mock.calls[0]![1].target).toEqual({ provider: 'claude', account: 'a', model: 'claude-opus-4-1' });
  expect(execute.mock.calls[0]![1]).not.toHaveProperty('effort');
  expect(execute.mock.calls[1]![1]).toMatchObject({ target: { provider: 'claude', account: 'b' }, effort: 'high' });
  expect(activities).toContain('Wiederholung nach Fehler: Limit erreicht');
  expect(run.jobs[0]).toMatchObject({ status: 'completed', attempts: 2, account: 'b', result: 'Fertig auf b' });
  expect(run.jobs[0]?.error).toBeUndefined();
  expect(new TeamStore(join(temporary.at(-1)!, 'teams.json')).runs[0]?.jobs[0]).toMatchObject({ attempts: 2, account: 'b' });
});

it('fails a unit after its last attempt without taking the others down', async () => {
  const data = store(swarm(units(3), { maxAttempts: 1 }));
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent) => { if (current.id === 'u2') throw new Error('Kaputt'); return 'ok'; });
  const runner = new TeamRunner(data, execute, () => {}, () => two);
  const run = runner.start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('failed'));
  expect(execute).toHaveBeenCalledTimes(3);
  expect(run.jobs.map(job => job.status)).toEqual(['completed', 'failed', 'completed']);
  expect(run.jobs[1]).toMatchObject({ attempts: 1, error: 'Kaputt' });
});

it('asks for the usable accounts before every start and moves on when an account reaches its limit', async () => {
  const data = store(swarm(units(6), { concurrency: 3 }));
  let usable = two;
  const finish: Array<{ account: string; done: () => void }> = [];
  const execute = vi.fn((_team: AgentTeam, current: TeamAgent) => new Promise<string>(resolve => { finish.push({ account: current.target.account, done: () => resolve('ok') }); }));
  const runner = new TeamRunner(data, execute, () => {}, () => usable);
  const run = runner.start('schwarm', 'Auftrag');
  expect(execute.mock.calls.map(call => call[1].target.account)).toEqual(['a', 'a', 'a']);
  // Konto a hat sein Limit erreicht und steht nicht mehr in der Liste: die nächsten nehmen b.
  usable = [two[1]!];
  finish.slice(0, 3).forEach(entry => entry.done());
  await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(6));
  expect(execute.mock.calls.slice(3).map(call => call[1].target.account)).toEqual(['b', 'b', 'b']);
  finish.slice(3).forEach(entry => entry.done());
  await vi.waitFor(() => expect(run.status).toBe('completed'));
});

it('keeps each unit on its own account when the host offers none', async () => {
  const data = store(swarm(units(5), {}));
  const seats = meter();
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent) => {
    seats.enter(current.target.account); await new Promise(resolve => setTimeout(resolve, 1)); seats.leave(current.target.account);
    return 'ok';
  });
  const run = new TeamRunner(data, execute, () => {}, () => []).start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(seats.peak.get('privat')).toBe(5);
  expect(run.jobs.every(job => job.account === 'privat')).toBe(true);
});

it('keeps handoffs inside a pool', async () => {
  const data = store(swarm([unit('u1'), unit('u2', ['u1'])], {}));
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent, _task: string, upstream: Array<{ result?: string }>) => current.id === 'u1' ? 'Teil A' : `Weiter mit ${upstream[0]?.result}`);
  const run = new TeamRunner(data, execute, () => {}, () => two).start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(run.jobs[1]?.result).toBe('Weiter mit Teil A');
});

it('stops a pool without retrying or starting waiting units', async () => {
  const data = store(swarm(units(10), { concurrency: 4 }));
  const execute = vi.fn((_team: AgentTeam, _agent: TeamAgent, _task: string, _upstream: unknown, signal: AbortSignal) => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Gestoppt')), { once: true })));
  const runner = new TeamRunner(data, execute, () => {}, () => two);
  const run = runner.start('schwarm', 'Auftrag');
  runner.stop(run.id);
  await vi.waitFor(() => expect(run.status).toBe('cancelled'));
  expect(execute).toHaveBeenCalledTimes(4);
  expect(run.jobs.every(job => job.status === 'cancelled')).toBe(true);
});

it('leaves teams without a pool on their fixed accounts and runs a full swarm at once', async () => {
  const data = store(swarm(units(MAX_TEAM_AGENTS)));
  const accounts = vi.fn(() => two);
  const seats = meter();
  const execute = vi.fn(async (_team: AgentTeam, current: TeamAgent) => {
    seats.enter(current.target.account); await new Promise(resolve => setTimeout(resolve, 1)); seats.leave(current.target.account);
    return 'ok';
  });
  const run = new TeamRunner(data, execute, () => {}, accounts).start('schwarm', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(accounts).not.toHaveBeenCalled();
  expect(seats.peak.get('privat')).toBe(MAX_TEAM_AGENTS);
  expect(run.jobs.every(job => job.attempts === undefined && job.account === undefined)).toBe(true);
});

it('allows many units only in pool mode and validates pool settings and owned paths', () => {
  expect(validateTeam(swarm(units(30), {})).agents).toHaveLength(30);
  expect(() => validateTeam(swarm(units(30)))).toThrow(`1 bis ${MAX_TEAM_AGENTS} Agenten`);
  expect(() => validateTeam(swarm(units(501), {}))).toThrow('1 bis 500 Einheiten');
  expect(validateTeam({ ...swarm(units(1), { concurrency: 4, maxAttempts: 3 }), isolation: 'worktree' })).toMatchObject({ pool: { concurrency: 4, maxAttempts: 3 }, isolation: 'worktree' });
  expect(validateTeam({ ...swarm(units(1), {}), isolation: 'irgendwo' as never })).not.toHaveProperty('isolation');
  expect(validateTeam(swarm(units(1)))).not.toHaveProperty('pool');
  expect(validateTeam(swarm(units(1), { concurrency: 50 })).pool).toEqual({ concurrency: 50 });
  expect(() => validateTeam(swarm(units(1), { concurrency: 51 }))).toThrow('zugleich');
  expect(() => validateTeam(swarm(units(1), { concurrency: 1.5 }))).toThrow('zugleich');
  expect(() => validateTeam(swarm(units(1), { maxAttempts: 0 }))).toThrow('versucht');
  expect(() => validateTeam(swarm(units(1), { maxAttempts: 6 }))).toThrow('versucht');

  const owning = (owns: unknown) => validateTeam(swarm([{ ...unit('u1'), owns: owns as string[] }], {})).agents[0];
  expect(owning(['europa/importer/FR/**', '', 'europa/importer/FR/**', 'docs/fr.md'])?.owns).toEqual(['europa/importer/FR/**', 'docs/fr.md']);
  expect(validateTeam(swarm(units(1), {})).agents[0]).not.toHaveProperty('owns');
  expect(() => owning(['/etc/passwd'])).toThrow('relativ');
  expect(() => owning(['europa/../geheim'])).toThrow('relativ');
  expect(() => owning(['..'])).toThrow('relativ');
  expect(() => owning(['europa\\FR'])).toThrow('relativ');
  expect(() => owning(['x'.repeat(201)])).toThrow('zu lang');
  expect(() => owning([42])).toThrow('Pfad');
  expect(() => owning(Array.from({ length: 51 }, (_, index) => `teil${index}/**`))).toThrow('höchstens 50');
  expect(() => owning('europa/**')).toThrow('ungültig');
  // Ein Pool-Profil übersteht Speichern und Laden.
  const data = store({ ...swarm(units(25), { concurrency: 12 }), isolation: 'worktree' });
  const restored = new TeamStore(join(temporary.at(-1)!, 'teams.json'));
  expect(restored.teams[0]).toMatchObject({ pool: { concurrency: 12 }, isolation: 'worktree' });
  expect(restored.teams[0]?.agents).toHaveLength(25);
  expect(data.teams[0]?.agents).toHaveLength(25);
});
