import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { AccountProfile } from '@cortex/core';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { AccountStore } from '../../src/storage/accountStore.js';
import { TeamStore } from '../../src/teams/store.js';
import type { AgentTeam, TeamRun } from '../../src/teams/types.js';
import { resetVscodeStub } from './vscodeStub.js';

const temporary: string[] = [];
afterEach(() => {
  resetVscodeStub();
  temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true }));
});

function host() {
  const values = new Map<string, unknown>();
  const ctx = {
    globalState: {
      get: <T>(key: string, fallback: T): T => values.has(key) ? values.get(key) as T : fallback,
      update: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
    },
    secrets: { delete: vi.fn(async () => {}), store: vi.fn(async () => {}), get: vi.fn(async () => undefined) },
  };
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const first = { postMessage: vi.fn() }; const second = { postMessage: vi.fn() };
  chat.ctx = ctx; chat.accounts = new AccountStore(ctx as any);
  chat.surfaces = new Map([[first, { mode: 'agent', page: 'agents' }], [second, { mode: 'tab', page: 'agents' }]]);
  chat.safePost = vi.fn((webview, message) => webview.postMessage(structuredClone(message)));
  chat.quota = { snapshot: () => [] };
  chat.authHealth = new Map(); chat.identities = new Map();
  chat.adapters = new Map([['claude', { models: [{ id: 'model-a', label: 'Modell A' }] }]]);
  chat.imageOrder = () => []; chat.pushPinned = vi.fn(); chat.conversations = new Map();
  return { chat, first, second, values };
}

const account: AccountProfile = { id: 'new-account', provider: 'claude', label: 'neu', authMode: 'managed-home', verifiedAt: 1, hasSecret: false, priority: 0 };

it('broadcasts newly persisted accounts and their current model catalog to every open editor', async () => {
  const { chat, first, second } = host();
  chat.accounts.onDidChange(() => chat.pushAccounts());
  await chat.accounts.upsert(account);
  for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith({
    kind: 'accounts', accounts: [expect.objectContaining({ id: account.id, label: 'neu', available: true, models: [{ id: 'model-a', label: 'Modell A' }] })],
  });
  chat.adapters.get('claude').models = [{ id: 'model-b', label: 'Modell B' }];
  chat.pushAccounts();
  for (const view of [first, second]) expect(view.postMessage.mock.lastCall?.[0].accounts[0].models).toEqual([{ id: 'model-b', label: 'Modell B' }]);
});

it('propagates account rename, authentication loss, and removal instead of retaining stale selections', async () => {
  const { chat, first, second } = host();
  chat.accounts.onDidChange(() => chat.pushAccounts());
  await chat.accounts.upsert(account);
  await chat.accounts.upsert({ ...account, label: 'umbenannt' });
  for (const view of [first, second]) expect(view.postMessage.mock.lastCall?.[0].accounts).toMatchObject([{ id: account.id, label: 'umbenannt' }]);
  chat.authHealth.set(account.id, 'expired'); chat.pushAccounts();
  for (const view of [first, second]) expect(view.postMessage.mock.lastCall?.[0].accounts).toMatchObject([{ id: account.id, available: false, authState: 'expired' }]);
  await chat.accounts.remove(account.id);
  for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith({ kind: 'accounts', accounts: [] });
});

it('broadcasts project add, rename, missing folder, and removal after persistence', async () => {
  const { chat, first, second } = host();
  const path = mkdtempSync(join(tmpdir(), 'cortex-agent-project-')); temporary.push(path);
  await chat.writeProjects(() => [{ path, name: 'Neu' }]);
  for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith({ kind: 'projects', projects: [{ path, name: 'Neu', missing: false }] });
  await chat.writeProjects((projects: any[]) => projects.map(project => ({ ...project, name: 'Umbenannt' })));
  for (const view of [first, second]) expect(view.postMessage.mock.lastCall?.[0].projects).toEqual([{ path, name: 'Umbenannt', missing: false }]);
  rmSync(path, { recursive: true });
  await chat.writeProjects((projects: any[]) => projects);
  for (const view of [first, second]) expect(view.postMessage.mock.lastCall?.[0].projects).toEqual([{ path, name: 'Umbenannt', missing: true }]);
  await chat.writeProjects(() => []);
  for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith({ kind: 'projects', projects: [] });
});

it('refreshes the resource catalogs when returning to agents, before the stored profile state arrives', async () => {
  const { chat, first, second, values } = host();
  await chat.accounts.upsert(account);
  const path = mkdtempSync(join(tmpdir(), 'cortex-agent-reopen-')); temporary.push(path);
  values.set('cortex.projects', [{ path, name: 'Zwischenzeitlich hinzugefügt' }]);
  chat.startAutomations = vi.fn(async () => {});
  chat.pushTeams = vi.fn();
  await chat.dispatchMessage({ kind: 'getTeams' }, first);
  for (const view of [first, second]) {
    expect(view.postMessage).toHaveBeenCalledWith({ kind: 'accounts', accounts: [expect.objectContaining({ id: account.id, label: account.label })] });
    expect(view.postMessage).toHaveBeenCalledWith({ kind: 'projects', projects: [{ path, name: 'Zwischenzeitlich hinzugefügt', missing: false }] });
  }
  expect(chat.pushTeams).toHaveBeenCalledWith(first);
  expect(chat.safePost.mock.invocationCallOrder.at(-1)).toBeLessThan(chat.pushTeams.mock.invocationCallOrder[0]);
});

it('broadcasts foreign run progress on runtime refresh even when automation metadata stays unchanged', async () => {
  const { chat, first, second } = host();
  const directory = mkdtempSync(join(tmpdir(), 'cortex-agent-foreign-')); temporary.push(directory);
  chat.ctx.globalStorageUri = { fsPath: directory };
  chat.teamResources = () => ({ skills: [], servers: [] });
  const profile: AgentTeam = {
    id: 'foreign-profile', name: 'Gemeinsamer Agent', kind: 'agent', description: '', instructions: '', updatedAt: 1,
    agents: [{ id: 'worker', name: 'Recherche', role: '', instructions: '', target: { provider: 'claude', account: 'neu' }, permissionMode: 'safe', skillPaths: [], dependsOn: [] }],
  };
  chat.teams().save(profile, 0);
  try {
    await chat.startAutomations();
    const before = chat.automationRuntime.snapshot();
    first.postMessage.mockClear(); second.postMessage.mockClear();
    const foreign = new TeamStore(join(directory, 'agent-teams.json'));
    const run: TeamRun = { id: 'foreign-run', teamId: profile.id, teamName: profile.name, kind: 'agent', task: 'Prüfen', startedAt: Date.now(), status: 'running', jobs: [{ agentId: 'worker', agentName: 'Recherche', status: 'running' }] };
    foreign.beginRun(run);
    await chat.automationRuntime.tick();
    expect(chat.automationRuntime.snapshot()).toEqual(before);
    for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'teamsState', state: expect.objectContaining({ runs: [expect.objectContaining({ id: run.id, status: 'running' })] }) }));
    run.status = 'completed'; run.jobs[0]!.status = 'completed'; run.jobs[0]!.result = 'Fertig'; foreign.persist();
    await chat.automationRuntime.tick();
    for (const view of [first, second]) expect(view.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'teamsState', state: expect.objectContaining({ runs: [expect.objectContaining({ id: run.id, status: 'completed', jobs: [expect.objectContaining({ result: 'Fertig' })] })] }) }));
    first.postMessage.mockClear(); second.postMessage.mockClear();
    await chat.automationRuntime.tick();
    for (const view of [first, second]) expect(view.postMessage).not.toHaveBeenCalled();
  } finally { chat.automationRuntime?.dispose(); }
});
