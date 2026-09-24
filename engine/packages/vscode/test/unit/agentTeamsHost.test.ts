import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import type { AgentTeam, TeamAgent } from '../../src/teams/types.js';

const temporary: string[] = [];
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));
const agent: TeamAgent = { id: 'writer', name: 'Autorin', role: 'Dokumentation', instructions: 'Schreibe sachlich.', target: { provider: 'claude', account: 'privat' }, permissionMode: 'edits', skillPaths: [], dependsOn: [] };
const team: AgentTeam = { id: 'editorial', name: 'Redaktion', description: '', instructions: 'Behalte die Quellen.', agents: [agent], updatedAt: 1 };
function host() {
  const directory = mkdtempSync(join(tmpdir(), 'cortex-team-host-')); temporary.push(directory);
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.ctx = { globalStorageUri: { fsPath: directory } };
  chat.accounts = { all: () => [{ id: 'claude-private', provider: 'claude', label: 'privat' }] };
  chat.quota = { availability: () => ({ available: true }) };
  chat.teamResources = () => ({ skills: [], servers: [] });
  chat.projectRuns = new Map(); chat.conversations = new Map(); chat.teamUpdates = new Map(); chat.tasks = new Map();
  chat.queues = { retryBlockedProjects: vi.fn() };
  chat.persistNow = vi.fn(); chat.sendConversations = vi.fn(); chat.toConversation = vi.fn();
  chat.runTask = vi.fn(async (id: string) => { const rec = chat.conversations.get(id); rec.turns.push({ role: 'assistant', text: 'Echtes Providerergebnis' }); rec.log.push({ kind: 'done', messageId: 'answer' }); });
  return { chat, directory };
}

it('creates an independent role conversation and delivers role, shared task, handoffs and chosen access', async () => {
  const { chat, directory } = host();
  const controller = new AbortController(); const update = vi.fn();
  const result = await chat.runTeamAgent(team, agent, 'Erstelle das Dokument', [{ agentId: 'research', agentName: 'Recherche', status: 'completed', result: 'Geprüfte Quelle' }], controller.signal, update);
  expect(result).toBe('Echtes Providerergebnis');
  const [id, prompt, tags, modes] = chat.runTask.mock.calls[0];
  expect(prompt).toContain('Schreibe sachlich.'); expect(prompt).toContain('Geprüfte Quelle'); expect(prompt).toContain('Erstelle das Dokument');
  expect(modes).toMatchObject({ target: agent.target, effort: 'high', permissionMode: 'edits', routingMode: 'manual' });
  const rec = chat.conversations.get(id);
  expect(rec.teamAgent).toEqual(agent); expect(rec.pinnedTarget).toEqual({ ...agent.target, model: 'claude-sonnet-5' });
  expect(modes.target).toEqual(rec.pinnedTarget);
  expect(prompt).toMatch(/^@claude:privat\/claude-sonnet-5 /);
  expect(agent.target.model).toBeUndefined();
  expect(rec.teamWorkspace).toBe(join(directory, 'team-workspaces', team.id));
  expect(chat.projectRuns.size).toBe(0); expect(chat.teamUpdates.size).toBe(0);
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ conversationId: id }));
});

it('creates a named standalone agent chat with the same real execution and access path', async () => {
  const { chat } = host();
  const solo: AgentTeam = { ...team, kind: 'agent', name: 'Meine Recherche' };
  const result = await chat.runTeamAgent(solo, agent, 'Prüfe die Quellen', [], new AbortController().signal, () => {});
  expect(result).toBe('Echtes Providerergebnis');
  const [id, prompt, , modes] = chat.runTask.mock.calls[0];
  expect(chat.conversations.get(id).title).toBe('Meine Recherche');
  expect(prompt).toContain('eigenständiger Cortex-Agent „Meine Recherche“');
  expect(prompt).not.toContain('anderen Teammitglieder');
  expect(modes).toMatchObject({ target: agent.target, permissionMode: 'edits' });
});

it('passes an explicit role reasoning level into the real task modes and freezes it in the conversation', async () => {
  const { chat } = host();
  const scoped: TeamAgent = { ...agent, effort: 'max' };
  await chat.runTeamAgent(team, scoped, 'Prüfe alles', [], new AbortController().signal, () => {});
  const [id, , , modes] = chat.runTask.mock.calls[0];
  expect(modes.effort).toBe('max');
  scoped.effort = 'low';
  expect(chat.conversations.get(id).teamAgent.effort).toBe('max');
  await expect(chat.runTeamAgent(team, { ...agent, effort: 'ultra' }, 'Auftrag', [], new AbortController().signal, () => {})).rejects.toThrow('Reasoning-Stärke');
  expect(chat.runTask).toHaveBeenCalledOnce();
});

it('keeps frozen reasoning for follow-ups and retry/resume while honoring explicit turn/model changes', async () => {
  const { chat, directory } = host();
  const saved: TeamAgent = { ...agent, effort: 'max', target: { ...agent.target, model: 'claude-opus-5-5' } };
  chat.conversations.set('followup', { id: 'followup', title: 'Agent', log: [], turns: [], teamAgent: saved, pinnedTarget: saved.target, teamWorkspace: directory });
  chat.workspaceContext = { forRoot: () => ({ editorContext: () => ({}), refresh: async () => {} }) };
  chat.projectFolders = () => []; chat.rules = { getCustomCommands: () => [] }; chat.panels = new Map();
  chat.conversationCwd = async () => directory; chat.verifier = { forRoot: () => ({ changedFiles: async () => [] }) };
  chat.runClocks = new Map(); chat.liveRuns = new Map(); chat.steeredRuns = new Set();
  chat.accountUsagePct = () => undefined; chat.erinnerung = { vorbereiten: async () => ({ neu: false }) };
  chat.canvasBelongs = () => false; chat.canvasViewForTurn = async () => undefined;
  chat.orchestrator = { run: vi.fn(async function* (_request: unknown) {}) };
  chat.queues.pause = vi.fn(); chat.preferences = { offerTopSuggestion: vi.fn() };
  chat.pushAccounts = vi.fn(); chat.persistSoon = vi.fn(); chat.output = { appendLine: vi.fn() };
  const run = (text: string, modes = {}) => (ChatViewProvider.prototype as any).runTask.call(chat, 'followup', text, [], modes);
  await run('Weiter');
  await run('@claude:privat/opus Nochmals');
  await run('Weiter mit weniger Reasoning', { effort: 'low' });
  await run('@codex:work/gpt-5.6-sol Mit neuem Modell');
  await run('@codex:work/gpt-6-astra Mit expliziter Stufe', { effort: 'ultra' });
  expect(chat.orchestrator.run.mock.calls.map(([request]: any[]) => request.effort)).toEqual(['max', 'max', 'low', 'low', 'ultra']);
  expect(chat.orchestrator.run.mock.calls[0][0].prompt).toMatch(/^@claude:privat\/claude-opus-5-5 /);
  expect(chat.orchestrator.run.mock.calls[3][0].prompt).toMatch(/^@codex:work\/gpt-5.6-sol /);
  expect(saved.effort).toBe('max');
  expect(chat.output.appendLine).not.toHaveBeenCalled();
  expect(chat.tasks.size).toBe(0); expect(chat.runClocks.size).toBe(0);
});

it('reads a selected real Markdown skill and rejects arbitrary non-catalog paths', async () => {
  const { chat, directory } = host(); const path = join(directory, 'SKILL.md');
  writeFileSync(path, '# Quellencheck\nÜberprüfe die Originalquelle.');
  chat.teamResources = () => ({ servers: [], skills: [{ name: 'Quellencheck', path }] });
  await chat.runTeamAgent(team, { ...agent, skillPaths: [path] }, 'Auftrag', [], new AbortController().signal, () => {});
  expect(chat.runTask.mock.calls[0][1]).toContain('# Quellencheck\nÜberprüfe die Originalquelle.');
  expect(chat.runTask.mock.calls[0][1]).toContain(path);
  await expect(chat.runTeamAgent(team, { ...agent, skillPaths: ['/private/unrelated.md'] }, 'Auftrag', [], new AbortController().signal, () => {})).rejects.toThrow('nicht mehr installiert');
  expect(chat.runTask).toHaveBeenCalledOnce();
});

it('rejects an unsupported MCP restriction before any provider run or conversation is created', async () => {
  const { chat } = host();
  const codex = { ...agent, target: { provider: 'codex', account: 'privat' }, mcpServers: [] };
  chat.accounts.all = () => [{ id: 'codex-private', provider: 'codex', label: 'privat' }];
  await expect(chat.runTeamAgent(team, codex, 'Auftrag', [], new AbortController().signal, () => {})).rejects.toThrow('keine begrenzte MCP-Auswahl');
  expect(chat.runTask).not.toHaveBeenCalled(); expect(chat.conversations.size).toBe(0);
});

it('does not turn a provider error or stopped chat into a successful handoff', async () => {
  const { chat } = host();
  chat.runTask.mockImplementationOnce(async (id: string) => chat.conversations.get(id).log.push({ kind: 'error', message: 'Kontolimit erreicht' }));
  await expect(chat.runTeamAgent(team, agent, 'Auftrag', [], new AbortController().signal, () => {})).rejects.toThrow('Kontolimit erreicht');
  expect(chat.projectRuns.size).toBe(0);
  chat.runTask.mockImplementationOnce(async (id: string) => chat.conversations.get(id).log.push({ kind: 'stopped' }));
  await expect(chat.runTeamAgent(team, agent, 'Auftrag', [], new AbortController().signal, () => {})).rejects.toThrow('angehalten');
  expect(chat.projectRuns.size).toBe(0);
});

it('propagates team Stop to the provider abort controller and releases the project lock', async () => {
  const { chat } = host(); const controller = new AbortController();
  let child: AbortController;
  chat.runTask.mockImplementation(async (id: string) => {
    child = new AbortController(); chat.tasks.set(id, child);
    controller.abort();
    expect(child.signal.aborted).toBe(true);
  });
  await expect(chat.runTeamAgent(team, agent, 'Auftrag', [], controller.signal, () => {})).rejects.toThrow('angehalten');
  expect(chat.projectRuns.size).toBe(0); expect(chat.teamUpdates.size).toBe(0);
});

it('preserves team MCP limits for fresh context compaction while keeping the helper read-only', async () => {
  const { chat, directory } = host();
  const run = vi.fn(async function* () { yield { type: 'result', text: 'Verdichteter Kontext' }; });
  chat.adapters = new Map([['claude', { run, supportsNativeResume: false }]]);
  chat.accounts.resolve = async () => ({ id: 'claude-private' });
  chat.output = { appendLine: vi.fn() };
  chat.teamMcpServers = vi.fn(() => ({}));
  const scoped = { ...agent, permissionMode: 'full', effort: 'xhigh', mcpServers: [] };
  const summary = await chat.askOffThread(agent.target, 'Fasse zusammen', new AbortController().signal, undefined, { cwd: directory, teamAgent: scoped });
  expect(summary).toBe('Verdichteter Kontext');
  expect(chat.teamMcpServers).toHaveBeenCalledWith(scoped);
  expect(run.mock.calls[0][0]).toMatchObject({ cwd: directory, model: 'claude-sonnet-5', effort: 'xhigh', permissionMode: 'safe', mcpServers: {} });
  expect(run.mock.calls[0][0].resumeSessionId).toBeUndefined();
});
