import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { TeamStore } from '../../src/teams/store.js';
import { TeamRunner } from '../../src/teams/runner.js';
import { teamProfileSignature, validateTeam, type AgentTeam } from '../../src/teams/types.js';
import { AutomationRuntime } from '../../src/automations/runtime.js';
import { workspaceRunKey } from '../../src/panel/forkWorkspace.js';

const temporary: string[] = [];
afterEach(() => { vi.clearAllMocks(); for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

const profile = (): AgentTeam => ({
  id: 'profile', kind: 'agent', name: 'Recherche', description: '', instructions: '', updatedAt: 1,
  agents: [{ id: 'research', name: 'Recherche', role: '', instructions: 'Prüfe die Quellen.', target: { provider: 'claude', account: 'Arbeit' }, permissionMode: 'safe', mcpServers: [], skillPaths: [], dependsOn: [] }],
  automation: { task: 'Berichte über neue Quellen.', schedule: { enabled: true, cron: '0 9 * * 1-5', timeZone: 'Europe/Berlin' }, webhook: { enabled: true } },
});

function host(team = profile()) {
  const directory = mkdtempSync(join(tmpdir(), 'cortex-automation-host-')); temporary.push(directory);
  const store = new TeamStore(join(directory, 'teams.json')); store.save(team, 0);
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.ctx = { globalStorageUri: { fsPath: directory } };
  chat.teamStore = store;
  const execute = vi.fn(async () => 'Quellen geprüft.');
  chat.teamRunner = new TeamRunner(store, execute, () => {});
  chat.accounts = { all: () => [{ id: 'work', provider: 'claude', label: 'Arbeit' }] };
  chat.authHealth = new Map(); chat.projectRuns = new Map();
  chat.quota = { availability: () => ({ available: true }) };
  chat.projects = () => [];
  chat.teamResources = () => ({ skills: [], servers: [] });
  chat.teamMcpServers = vi.fn(() => ({}));
  return { chat, store, execute, directory };
}

it('persists both trigger types, task and time zone without losing them across store refreshes', () => {
  const { store, directory } = host();
  const reloaded = new TeamStore(join(directory, 'teams.json'));
  expect(reloaded.teams[0]?.automation).toEqual(profile().automation);
  const revision = reloaded.revision;
  expect(() => reloaded.save({ ...profile(), automation: { ...profile().automation!, schedule: { enabled: true, cron: '99 9 * * *', timeZone: 'Europe/Berlin' } } }, revision)).toThrow('Cron');
  store.refresh(); expect(store.revision).toBe(revision);
  expect(store.teams[0]?.automation).toEqual(profile().automation);
});

it('rejects reserved profile and role identifiers before they reach UI records', () => {
  expect(() => validateTeam({ ...profile(), id: '__proto__' })).toThrow('Kennung');
  const team = profile(); team.agents[0]!.id = 'constructor';
  expect(() => validateTeam(team)).toThrow('Kennung');
});

it.each(['schedule', 'webhook'] as const)('uses the same saved agent executor and persists %s provenance', async kind => {
  const { chat, store, execute, directory } = host();
  const source = { kind, id: `${kind}:unique`, ...(kind === 'schedule' ? { scheduledAt: 1 } : {}) };
  const run = await chat.startTeam('profile', profile().automation!.task, source);
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0]?.slice(0, 3)).toEqual([store.teams[0], profile().agents[0], profile().automation!.task]);
  const reloaded = new TeamStore(join(directory, 'teams.json'));
  expect(reloaded.runs[0]?.source).toEqual(source);
  expect(reloaded.runs[0]?.kind).toBe('agent');
});

it.each(['manual', 'schedule', 'webhook'] as const)('passes different saved role reasoning levels into actual host task modes for %s starts', async kind => {
  const team = profile(); team.kind = 'team';
  team.agents[0]!.effort = 'low';
  team.agents.push({ ...structuredClone(team.agents[0]!), id: 'review', name: 'Prüfung', effort: 'ultra', target: { provider: 'codex', account: 'Codex', model: 'gpt-6-astra' }, dependsOn: ['research'] });
  const { chat, store } = host(team);
  chat.accounts = { all: () => [{ id: 'work', provider: 'claude', label: 'Arbeit' }, { id: 'codex', provider: 'codex', label: 'Codex' }] };
  chat.conversations = new Map(); chat.teamUpdates = new Map(); chat.tasks = new Map();
  chat.queues = { retryBlockedProjects: vi.fn() };
  chat.persistNow = vi.fn(); chat.sendConversations = vi.fn(); chat.toConversation = vi.fn();
  chat.runTask = vi.fn(async (id: string) => {
    const rec = chat.conversations.get(id);
    rec.turns.push({ role: 'assistant', text: 'Simuliertes Ergebnis' }); rec.log.push({ kind: 'done' });
  });
  chat.teamRunner = new TeamRunner(store, (...args) => chat.runTeamAgent(...args), () => {});
  const source = kind === 'manual' ? undefined : { kind, id: `${kind}:reasoning`, ...(kind === 'schedule' ? { scheduledAt: 1 } : {}) };
  const run = await chat.startTeam(team.id, 'Prüfe die Quellen', source);
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(chat.runTask.mock.calls.map((call: any[]) => call[3].effort)).toEqual(['low', 'ultra']);
  expect([...chat.conversations.values()].map((rec: any) => rec.teamAgent.effort)).toEqual(['low', 'ultra']);
  expect(run.source).toEqual(source);
});

it('rejects a disabled trigger but retains manual execution', async () => {
  const team = profile(); team.automation!.schedule!.enabled = false;
  const { chat, execute } = host(team);
  await expect(chat.startTeam(team.id, 'Automatisch', { kind: 'schedule', id: 'scheduled' })).rejects.toThrow('deaktiviert');
  expect(execute).not.toHaveBeenCalled();
  const run = await chat.startTeam(team.id, 'Manuell');
  await vi.waitFor(() => expect(run.status).toBe('completed'));
  expect(run.source).toBeUndefined();
});

it('rejects expired accounts, removed projects and unavailable skills before invoking an agent', async () => {
  const { chat, execute, store } = host();
  chat.authHealth.set('work', 'expired');
  await expect(chat.startTeam('profile', 'Auftrag')).rejects.toThrow('nicht verfügbar');
  chat.authHealth.clear();
  const team = structuredClone(store.teams[0]!); team.projectPath = '/missing/cortex-project';
  store.save(team, store.revision);
  await expect(chat.startTeam('profile', 'Auftrag', { kind: 'webhook', id: 'one' })).rejects.toThrow('Projektordner');
  delete team.projectPath; team.agents[0]!.skillPaths = ['/missing/SKILL.md']; store.save(team, store.revision);
  await expect(chat.startTeam('profile', 'Auftrag')).rejects.toThrow('Skill');
  expect(execute).not.toHaveBeenCalled();
});

it('skips automatic starts in busy projects and leaves the scheduled task intact', async () => {
  const { chat, execute, directory, store } = host();
  const key = await workspaceRunKey(join(directory, 'team-workspaces', 'profile'));
  chat.projectRuns.set(key, { writers: 1, readers: 0 });
  await expect(chat.startTeam('profile', 'Auftrag', { kind: 'schedule', id: 'one' })).rejects.toMatchObject({ code: 'AUTOMATION_SKIPPED' });
  expect(execute).not.toHaveBeenCalled();
  expect(store.teams[0]?.automation).toEqual(profile().automation);
});

it('does not execute a profile edited between validation and the runner acquiring its store snapshot', () => {
  const { chat, store, execute } = host();
  const previous = structuredClone(store.teams[0]!);
  store.save({ ...previous, name: 'Zwischenzeitlich geändert' }, store.revision);
  expect(() => chat.teamRunner.start('profile', 'Auftrag', undefined, previous)).toThrow('Startprüfung geändert');
  expect(execute).not.toHaveBeenCalled(); expect(store.runs).toHaveLength(0);
});

it('lets users pause future triggers during a running task without changing its frozen role', () => {
  const { store } = host();
  store.beginRun({ id: 'live', teamId: 'profile', teamName: 'Recherche', task: 'Laufender Auftrag', status: 'running', startedAt: Date.now(), jobs: [] });
  const paused = structuredClone(store.teams[0]!);
  paused.automation!.schedule!.enabled = false; paused.automation!.webhook!.enabled = false;
  store.save(paused, store.revision);
  expect(store.runs[0]?.status).toBe('running');
  expect(store.teams[0]?.automation?.schedule?.enabled).toBe(false);
  const roleChange = structuredClone(paused); roleChange.agents[0]!.instructions = 'Andere Rolle';
  expect(() => store.save(roleChange, store.revision)).toThrow('Beende den laufenden Auftrag');
});

it('cannot reactivate a trigger from an old draft even after receiving the newest global revision', () => {
  const { store, directory } = host();
  const draft = structuredClone(store.teams[0]!);
  const base = teamProfileSignature(draft);
  const other = new TeamStore(join(directory, 'teams.json'));
  const paused = structuredClone(other.teams[0]!); paused.automation!.schedule!.enabled = false;
  other.save(paused, other.revision);
  store.refresh();
  draft.description = 'Mein ungespeicherter Entwurf';
  expect(() => store.save(draft, store.revision, base)).toThrow('Dein Entwurf bleibt erhalten');
  expect(store.teams[0]?.automation?.schedule?.enabled).toBe(false);
  expect(store.teams[0]?.description).toBe('');
});

it('runs a due cron and an authenticated HTTP webhook through the real host/runner with simulated provider output', async () => {
  const { chat, store, directory, execute } = host();
  let now = Date.parse('2026-09-21T06:59:00Z');
  const runtime = new AutomationRuntime({ directory: join(directory, 'automations'), profiles: () => { store.refresh(); return store.teams; },
    start: (id, task, source) => chat.startTeam(id, task, source), changed: () => {}, now: () => now, port: 0, tickIntervalMs: 60000 });
  try {
    await runtime.start();
    now = Date.parse('2026-09-21T07:00:00Z'); await runtime.tick();
    await vi.waitFor(() => expect(store.runs[0]?.status).toBe('completed'));
    expect(store.runs[0]?.source?.kind).toBe('schedule');
    const credentials = runtime.webhookCredentials('profile');
    const call = () => fetch(credentials.url, { method: 'POST', headers: { Authorization: `Bearer ${credentials.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'source-event-42' }, body: JSON.stringify({ topic: 'Neue Quelle' }) });
    const response = await call(); expect(response.status).toBe(202); await response.json();
    await vi.waitFor(() => expect(store.runs[1]?.status).toBe('completed'));
    const duplicate = await call(); expect(duplicate.status).toBe(200); expect(await duplicate.json()).toMatchObject({ duplicate: true });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(store.runs[1]?.source?.kind).toBe('webhook');
    expect(store.runs[1]?.task).toContain('Neue Quelle');
    expect(store.runs[1]?.task).toContain(profile().automation!.task);
  } finally { runtime.dispose(); }
});

it('copies webhook credentials only on explicit user action without sending the token to a webview', async () => {
  const { chat } = host();
  const view = {};
  chat.surfaces = new Map([[view, { mode: 'agent' }]]);
  chat.safePost = vi.fn(); chat.startAutomations = vi.fn(async () => {});
  chat.automationRuntime = { tick: vi.fn(async () => {}), webhookCredentials: vi.fn(() => ({ url: 'http://127.0.0.1:47831/hooks/profile', token: 'local-secret' })) };
  await chat.dispatchMessage({ kind: 'copyTeamWebhook', teamId: 'profile' }, view);
  expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Authorization: Bearer local-secret'));
  expect(JSON.stringify(chat.safePost.mock.calls)).not.toContain('local-secret');
  expect(chat.safePost).toHaveBeenCalledWith(view, { kind: 'teamAutomationNotice', message: expect.stringContaining('kopiert') });
});
