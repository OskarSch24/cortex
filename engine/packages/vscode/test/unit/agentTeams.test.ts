import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { TeamStore } from '../../src/teams/store.js';
import { TeamRunner } from '../../src/teams/runner.js';
import { teamAgentEffort, teamAgentPrompt, validateTeam, type AgentTeam, type TeamAgent } from '../../src/teams/types.js';

const temporary: string[] = [];
const agent = (id: string, dependsOn: string[] = []): TeamAgent => ({ id, name: id, role: 'Analyse', instructions: '# Arbeitsweise\nBelege jede Aussage.', target: { provider: 'claude', account: 'privat' }, permissionMode: 'safe', mcpServers: [], skillPaths: [], dependsOn });
const team = (): AgentTeam => ({ id: 'team', name: 'Redaktion', description: 'Von Recherche zu Prüfung', instructions: 'Präzise arbeiten.', updatedAt: 1, agents: [agent('recherche'), agent('prüfung', ['recherche'])] });
// Agent identifiers are machine keys; names can contain arbitrary Unicode.
const valid = (): AgentTeam => ({ ...team(), agents: [agent('research'), { ...agent('review', ['research']), name: 'Prüfung' }] });
const store = () => { const directory = mkdtempSync(join(tmpdir(), 'cortex-teams-')); temporary.push(directory); return new TeamStore(join(directory, 'teams.json')); };
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

it('rejects dependency cycles, dangling handoffs, duplicate identities and unsupported authors', () => {
  expect(() => validateTeam({ ...valid(), agents: [agent('a', ['b']), agent('b', ['a'])] })).toThrow('Kreis');
  expect(() => validateTeam({ ...valid(), agents: [agent('a', ['missing'])] })).toThrow('fehlenden');
  expect(() => validateTeam({ ...valid(), agents: [agent('a'), agent('a')] })).toThrow('eindeutig');
  expect(() => validateTeam({ ...valid(), agents: [{ ...agent('a'), target: { provider: 'openrouter', account: 'reviewer' } }] })).toThrow('keine Teamaufträge');
});

it('persists roles, markdown, account identity and explicit empty MCP scope, but no credentials', () => {
  const data = store();
  data.save(valid(), 0);
  const path = join(temporary.at(-1)!, 'teams.json');
  const restored = new TeamStore(path);
  expect(restored.teams[0]?.agents[0]).toEqual(valid().agents[0]);
  expect(restored.teams[0]?.instructions).toBe('Präzise arbeiten.');
  expect(restored.teams[0]?.updatedAt).toBe(data.teams[0]?.updatedAt);
  expect(readFileSync(path, 'utf8')).not.toContain('secret');
  expect(() => data.save(valid(), 0)).toThrow('inzwischen');
});

it('persists independent reasoning levels for every role and keeps old profiles on model defaults', () => {
  const data = store();
  const profile = valid();
  profile.agents[0]!.effort = 'low';
  profile.agents[1]!.effort = 'max';
  data.save(profile, 0);
  const restored = new TeamStore(join(temporary.at(-1)!, 'teams.json'));
  expect(restored.teams[0]?.agents.map(role => role.effort)).toEqual(['low', 'max']);
  const legacy = validateTeam(valid());
  expect(legacy.agents[0]).not.toHaveProperty('effort');
  expect(teamAgentEffort(legacy.agents[0]!)).toBe('high');
  expect(teamAgentEffort({ target: { provider: 'codex', account: 'work', model: 'gpt-5.6-sol' } })).toBe('low');
  expect(teamAgentEffort({ target: { provider: 'codex', account: 'work' } })).toBe('medium');
  expect(teamAgentEffort({ target: { provider: 'copilot', account: 'work' } })).toBeUndefined();
});

it.each([
  ['claude', undefined, 'ultra'], ['claude', 'future-model', 'high'], ['grok', 'grok-4.5', 'xhigh'],
  ['copilot', undefined, 'high'], ['codex', undefined, 'minimal'], ['claude', undefined, 'invalid'],
  ['claude', undefined, 3], ['claude', undefined, null], ['claude', undefined, ['high']],
])('rejects unsupported reasoning without changing saved state: %s %s %s', (provider, model, effort) => {
  const data = store(); data.save(valid(), 0);
  const profile = valid();
  Object.assign(profile.agents[0]!, { target: { provider, account: 'work', ...(model ? { model } : {}) }, effort });
  expect(() => data.save(profile, data.revision)).toThrow('Reasoning-Stärke');
  expect(data.teams[0]?.agents[0]).not.toHaveProperty('effort');
});

it('accepts model aliases and every supported explicit level including provider defaults', () => {
  expect(teamAgentEffort({ target: { provider: 'claude', account: 'work', model: 'opus' }, effort: 'max' })).toBe('max');
  expect(teamAgentEffort({ target: { provider: 'codex', account: 'work' }, effort: 'ultra' })).toBe('ultra');
  expect(teamAgentEffort({ target: { provider: 'grok', account: 'work', model: 'grok-4.6' }, effort: 'xhigh' })).toBe('xhigh');
});

it('keeps standalone agents separate from legacy one-role teams through persistence', () => {
  const data = store();
  const single = validateTeam({ ...valid(), id: 'solo', kind: 'agent', name: 'Quellenprüfung', agents: [agent('research')] });
  data.save(single, 0);
  data.save({ ...valid(), agents: [agent('research')] }, data.revision);
  const restored = new TeamStore(join(temporary.at(-1)!, 'teams.json'));
  expect(restored.teams.find(team => team.id === 'solo')?.kind).toBe('agent');
  expect(restored.teams.find(team => team.id === 'team')?.kind).toBeUndefined();
  expect(() => validateTeam({ ...valid(), kind: 'agent' })).toThrow('genau eine Rolle');
  expect(() => validateTeam({ ...valid(), kind: 'bot' })).toThrow('Unbekannte Agentenart');
});

it('runs a standalone agent exactly once and retains its identity after profile deletion', async () => {
  const data = store();
  data.save({ ...valid(), kind: 'agent', agents: [agent('research')] }, 0);
  const execute = vi.fn(async (profile, current, task, upstream) => {
    const prompt = teamAgentPrompt(profile, current, task, upstream, []);
    expect(prompt).toContain('eigenständiger Cortex-Agent');
    expect(prompt).toContain('## Dein Auftrag');
    expect(prompt).not.toContain('anderen Teammitglieder');
    expect(upstream).toEqual([]);
    return 'Eigenständiges Ergebnis';
  });
  const runner = new TeamRunner(data, execute, () => {});
  const run = runner.start('team', 'Prüfe diese Quelle');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(execute).toHaveBeenCalledOnce();
  expect(run.jobs).toHaveLength(1);
  data.remove('team', data.revision);
  const restored = new TeamStore(join(temporary.at(-1)!, 'teams.json'));
  expect(restored.runs[0]).toMatchObject({ kind: 'agent', jobs: [{ result: 'Eigenständiges Ergebnis' }] });
});

it('rolls back failed saves and removals instead of presenting unsaved changes as current', () => {
  const data = store(); data.save(valid(), 0);
  const before = structuredClone(data.teams), revision = data.revision;
  const persist = vi.spyOn(data as any, 'write').mockImplementation(() => { throw new Error('Disk full'); });
  expect(() => data.save({ ...valid(), name: 'Unsaved' }, revision)).toThrow('Disk full');
  expect(data.teams).toEqual(before);
  expect(() => data.remove('team', revision)).toThrow('Disk full');
  expect(data.teams).toEqual(before);
  expect(data.revision).toBe(revision);
  persist.mockRestore();
});

it('does not leave a phantom running job when the initial write fails', () => {
  const data = store(); data.save(valid(), 0);
  const execute = vi.fn(async () => 'Must not run');
  const runner = new TeamRunner(data, execute, () => {});
  const persist = vi.spyOn(data as any, 'write').mockImplementation(() => { throw new Error('Disk full'); });
  expect(() => runner.start('team', 'Auftrag')).toThrow('Disk full');
  expect(data.runs).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
  persist.mockRestore();
  expect(() => data.remove('team', data.revision)).not.toThrow();
});

it('persists the role conversation link before the provider completes', async () => {
  const data = store(); data.save({ ...valid(), agents: [agent('research')] }, 0);
  let complete!: (text: string) => void;
  const runner = new TeamRunner(data, async (_team, _agent, _task, _upstream, _signal, update) => {
    update({ conversationId: 'role-chat', status: 'running' });
    return new Promise<string>(resolve => { complete = resolve; });
  }, () => {});
  const run = runner.start('team', 'Auftrag');
  const saved = JSON.parse(readFileSync(join(temporary.at(-1)!, 'teams.json'), 'utf8'));
  expect(saved.runs[0].jobs[0].conversationId).toBe('role-chat');
  expect(saved.runs[0].status).toBe('running');
  complete('Done');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
});

it('keeps unreadable stores intact instead of overwriting the user configuration', () => {
  const data = store();
  const path = join(temporary.at(-1)!, 'teams.json');
  writeFileSync(path, '{broken data');
  const damaged = new TeamStore(path);
  expect(damaged.error).toContain('nicht geladen');
  expect(() => damaged.save(valid(), 0)).toThrow();
  expect(readFileSync(path, 'utf8')).toBe('{broken data');
});

it('executes each role once and delivers only its declared completed upstream results', async () => {
  const data = store(); data.save(valid(), 0);
  const execute = vi.fn(async (_team, current, _task, upstream) => current.id === 'research' ? 'Evidence A' : `Checked ${upstream[0].result}`);
  const runner = new TeamRunner(data, execute, () => {});
  const run = runner.start('team', 'Prüfe das Produkt');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(execute.mock.calls.map(call => call[1].id)).toEqual(['research', 'review']);
  expect(execute.mock.calls[0][3]).toEqual([]);
  expect(run.jobs[1]?.result).toBe('Checked Evidence A');
  expect(new TeamStore(join(temporary.at(-1)!, 'teams.json')).runs[0]?.status).toBe('completed');
});

it('blocks dependent agents after a failed handoff while allowing independent work', async () => {
  const data = store(); data.save({ ...valid(), agents: [...valid().agents, agent('independent')] }, 0);
  const execute = vi.fn(async (_team, current) => { if (current.id === 'research') throw new Error('Anmeldung abgelaufen'); return 'Finished'; });
  const runner = new TeamRunner(data, execute, () => {});
  const run = runner.start('team', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('failed'));
  expect(run.jobs.map(job => job.status)).toEqual(['failed', 'blocked', 'completed']);
  expect(execute.mock.calls.map(call => call[1].id)).toEqual(['research', 'independent']);
});

it('cancels the active provider and never starts remaining agents', async () => {
  const data = store(); data.save(valid(), 0);
  const execute = vi.fn((_team, _agent, _task, _upstream, signal: AbortSignal) => new Promise<string>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Stopped')), { once: true })));
  const runner = new TeamRunner(data, execute, () => {});
  const run = runner.start('team', 'Auftrag');
  expect(() => runner.start('team', 'Doppelt')).toThrow('bereits');
  expect(() => data.remove('team', data.revision)).toThrow('zuerst');
  runner.stop(run.id);
  await vi.waitFor(() => expect(run.status).toBe('cancelled'));
  expect(execute).toHaveBeenCalledOnce();
  expect(run.jobs.map(job => job.status)).toEqual(['cancelled', 'cancelled']);
});

it('marks unfinished work interrupted on restart instead of claiming it is still running', () => {
  const data = store(); data.save(valid(), 0);
  const path = join(temporary.at(-1)!, 'teams.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  file.runs.push({ id: 'interrupted', teamId: 'team', teamName: 'Redaktion', task: 'Auftrag', status: 'running', startedAt: 1, jobs: [{ agentId: 'research', agentName: 'Recherche', status: 'running' }, { agentId: 'review', agentName: 'Prüfung', status: 'waiting' }] });
  writeFileSync(path, JSON.stringify(file));
  const restored = new TeamStore(path);
  expect(restored.runs[0]?.status).toBe('cancelled');
  expect(restored.runs[0]?.jobs.every(job => job.status === 'cancelled')).toBe(true);
});

it('uses persisted revisions so stale windows cannot overwrite each other’s teams', () => {
  const first = store(), path = join(temporary.at(-1)!, 'teams.json'), second = new TeamStore(path);
  first.save(valid(), 0);
  expect(() => second.save({ ...valid(), id: 'second-team' }, 0)).toThrow('inzwischen');
  second.refresh();
  second.save({ ...valid(), id: 'second-team' }, second.revision);
  first.refresh();
  expect(first.teams.map(team => team.id)).toEqual(['team', 'second-team']);
  expect(first.revision).toBe(second.revision);
});

it('keeps a live foreign run running, rejects duplicates and delivers Stop to its owner', async () => {
  const first = store(); first.save({ ...valid(), agents: [agent('research')] }, 0);
  let signal!: AbortSignal;
  const owner = new TeamRunner(first, async (_team, _agent, _task, _upstream, abort) => new Promise<string>((_resolve, reject) => {
    signal = abort; abort.addEventListener('abort', () => reject(new Error('Abgebrochen')), { once: true });
  }), () => {});
  const run = owner.start('team', 'Auftrag');
  const second = new TeamStore(join(temporary.at(-1)!, 'teams.json'));
  const other = new TeamRunner(second, vi.fn(async () => 'Must not run'), () => {});
  expect(second.runs[0]?.status).toBe('running');
  expect(first.ownsRun(run.id)).toBe(true); expect(second.ownsRun(run.id)).toBe(false);
  expect(() => other.start('team', 'Duplicate')).toThrow('bereits');
  expect(() => other.stop(run.id)).not.toThrow();
  expect(signal.aborted).toBe(false);
  expect(second.runs[0]).toMatchObject({ status: 'running', stopRequested: true });
  expect(() => second.remove('team', second.revision)).toThrow('zuerst');
  first.refresh(); owner.syncStops();
  expect(signal.aborted).toBe(true);
  await vi.waitFor(() => expect(run.status).toBe('cancelled'));
  second.refresh();
  expect(second.runs[0]).toMatchObject({ status: 'cancelled', stopRequested: true });
});

it('retains a foreign stop request when the owner persists stale progress before refreshing', async () => {
  const first = store(); first.save(valid(), 0);
  const path = join(temporary.at(-1)!, 'teams.json');
  const execute = vi.fn(async (_team, _agent, _task, _upstream, signal: AbortSignal) => new Promise<string>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('Abgebrochen')), { once: true });
  }));
  const owner = new TeamRunner(first, execute, () => {}), run = owner.start('team', 'Auftrag');
  const second = new TeamStore(path);
  second.requestStop(run.id);
  expect(run.stopRequested).toBeUndefined();
  run.jobs[0]!.activity = 'Neue Aktivität';
  first.persist();
  expect(first.runs[0]).toBe(run);
  expect(run.stopRequested).toBe(true);
  expect(JSON.parse(readFileSync(path, 'utf8')).runs[0]).toMatchObject({ status: 'running', stopRequested: true, jobs: [{ activity: 'Neue Aktivität' }, {}] });
  owner.syncStops();
  await vi.waitFor(() => expect(run.status).toBe('cancelled'));
  expect(execute).toHaveBeenCalledTimes(1);
  expect(run.jobs.map(job => job.status)).toEqual(['cancelled', 'cancelled']);
  first.persist(); second.refresh();
  expect(second.runs[0]?.stopRequested).toBe(true);
});

it('merges owned run updates without erasing foreign runs, new teams or live object references', async () => {
  const first = store(); first.save({ ...valid(), agents: [agent('research')] }, 0);
  first.save({ ...valid(), id: 'other', agents: [agent('research')] }, first.revision);
  const path = join(temporary.at(-1)!, 'teams.json'), second = new TeamStore(path);
  let finishFirst!: (text: string) => void, finishSecond!: (text: string) => void;
  const owner = new TeamRunner(first, async () => new Promise<string>(resolve => { finishFirst = resolve; }), () => {});
  const other = new TeamRunner(second, async () => new Promise<string>(resolve => { finishSecond = resolve; }), () => {});
  const a = owner.start('team', 'A'), b = other.start('other', 'B');
  second.save({ ...valid(), id: 'new-team' }, second.revision);
  a.jobs[0]!.activity = 'Locally active';
  first.refresh();
  expect(first.runs.find(run => run.id === a.id)).toBe(a);
  expect(a.jobs[0]!.activity).toBe('Locally active');
  finishFirst('A done'); await vi.waitFor(() => expect(a.status).toBe('completed'));
  second.refresh();
  expect(second.runs.find(run => run.id === b.id)).toBe(b);
  expect(second.teams.map(team => team.id)).toContain('new-team');
  expect(second.runs.find(run => run.id === a.id)?.jobs[0]?.result).toBe('A done');
  finishSecond('B done'); await vi.waitFor(() => expect(b.status).toBe('completed'));
  const saved = new TeamStore(path);
  expect(saved.runs.map(run => run.status)).toEqual(['completed', 'completed']);
  expect(saved.teams.map(team => team.id)).toEqual(['team', 'other', 'new-team']);
});

it('recovers only dead run owners and preserves completed handoffs and chat links', () => {
  const data = store(); data.save(valid(), 0);
  const path = join(temporary.at(-1)!, 'teams.json'), file = JSON.parse(readFileSync(path, 'utf8'));
  file.runs = [{ id: 'orphan', teamId: 'team', teamName: 'Redaktion', task: 'Auftrag', status: 'running', startedAt: 1, ownerPid: 987654321, ownerId: 'dead-host', jobs: [
    { agentId: 'research', agentName: 'Recherche', status: 'completed', result: 'Evidence', conversationId: 'done-chat' },
    { agentId: 'review', agentName: 'Prüfung', status: 'running', conversationId: 'active-chat' },
  ] }];
  writeFileSync(path, JSON.stringify(file));
  const originalKill = process.kill.bind(process);
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === 987654321) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    return originalKill(pid, signal);
  });
  try {
    const restored = new TeamStore(path);
    expect(restored.runs[0]?.status).toBe('cancelled');
    expect(restored.runs[0]?.jobs.map(job => job.status)).toEqual(['completed', 'cancelled']);
    expect(restored.runs[0]?.jobs.map(job => job.conversationId)).toEqual(['done-chat', 'active-chat']);
    expect(JSON.parse(readFileSync(path, 'utf8')).runs[0].status).toBe('cancelled');
  } finally { kill.mockRestore(); }
});

it('recovers a lock left by a dead process without ignoring a live lock', () => {
  const data = store(), path = join(temporary.at(-1)!, 'teams.json'), lock = path + '.lock';
  writeFileSync(lock, JSON.stringify({ pid: 987654321, instanceId: 'dead' }));
  const originalKill = process.kill.bind(process);
  const kill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
    if (pid === 987654321) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    return originalKill(pid, signal);
  });
  try { expect(() => data.save(valid(), 0)).not.toThrow(); }
  finally { kill.mockRestore(); }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, instanceId: 'other-live-window' }));
  expect(() => data.save({ ...valid(), name: 'Must not replace' }, data.revision)).toThrow('anderes Cortex-Fenster');
  expect(JSON.parse(readFileSync(path, 'utf8')).teams[0].name).toBe('Redaktion');
});

it('persists a failed terminal state after a transient write error and tolerates disposed views', async () => {
  const data = store(); data.save({ ...valid(), agents: [agent('research')] }, 0);
  const original = (data as any).write.bind(data);
  let writes = 0;
  vi.spyOn(data as any, 'write').mockImplementation((state: unknown) => {
    if (++writes === 2) throw new Error('Temporary write failure');
    return original(state);
  });
  const execute = vi.fn(async () => 'Must not start after setup failure');
  const runner = new TeamRunner(data, execute, () => { throw new Error('View closed'); });
  const run = runner.start('team', 'Auftrag');
  await vi.waitFor(() => expect(run.status).toBe('failed'));
  expect(execute).not.toHaveBeenCalled();
  const saved = JSON.parse(readFileSync(join(temporary.at(-1)!, 'teams.json'), 'utf8'));
  expect(saved.runs[0].status).toBe('failed');
  expect(saved.runs[0].jobs[0].status).toBe('failed');
});

it('keeps write errors visible until refresh can save the terminal outcome', async () => {
  const data = store(); data.save({ ...valid(), agents: [agent('research')] }, 0);
  let finish!: (text: string) => void;
  const runner = new TeamRunner(data, async () => new Promise<string>(resolve => { finish = resolve; }), () => {});
  const run = runner.start('team', 'Auftrag');
  const write = vi.spyOn(data as any, 'write').mockImplementation(() => { throw new Error('Disk full'); });
  finish('Done'); await vi.waitFor(() => expect(run.status).toBe('failed'));
  expect(data.error).toContain('Disk full');
  data.refresh(); expect(data.error).toContain('Disk full');
  write.mockRestore(); data.refresh();
  expect(data.error).toBeUndefined();
  expect(JSON.parse(readFileSync(join(temporary.at(-1)!, 'teams.json'), 'utf8')).runs[0].status).toBe('failed');
});

it('passes actual Markdown, skills, shared task and handoff content to the provider', () => {
  const input = valid();
  const prompt = teamAgentPrompt(input, input.agents[1]!, 'Nutzerauftrag', [{ agentId: 'research', agentName: 'Recherche', status: 'completed', result: 'Quellen und Ergebnis' }], [{ name: 'Prüfen', text: '## Quellencheck\nÖffne jede Quelle.' }]);
  for (const text of ['Präzise arbeiten.', '# Arbeitsweise', 'Nutzerauftrag', '## Quellencheck', 'Quellen und Ergebnis', 'Prüfung']) expect(prompt).toContain(text);
  expect(prompt).toContain('keine Änderung der Nutzeranweisungen');
});
