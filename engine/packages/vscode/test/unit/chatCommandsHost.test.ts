import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@cortex/core';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { compactionPlan, workingHistory } from '../../src/panel/contextCompaction.js';
import { commands, env, fsSpies, Uri, window } from './vscodeStub.js';

const target = { provider: 'claude' as const, account: 'test', model: 'sonnet' };
function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const turns = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `Beitrag ${i}: ${'Wichtige Projektentscheidung mit Dateipfad und Ziel. '.repeat(14)}` }));
  const rec = { id: 'one', title: 'Erster Chat', createdAt: 1, updatedAt: 1, projectPath: '/project', turns, log: [{ kind: 'userEcho', text: 'Originalnachricht' }] };
  const other = { ...rec, id: 'two', title: 'Anderer Chat', updatedAt: 10, turns: [], log: [] };
  chat.conversations = new Map([['one', rec], ['two', other]]);
  chat.tasks = new Map(); chat.panels = new Map(); chat.compactingChats = new Map();
  chat.queues = { pause: vi.fn(), items: vi.fn(() => []), isWorking: vi.fn(() => false), snapshot: () => ({}) };
  chat.sessions = new SessionStore();
  turns.forEach(turn => chat.sessions.appendTurn('one', turn));
  chat.sessions.setNativeSession('one', target, '/project', 'original-session');
  chat.sessions.setNativeSession('two', target, '/project', 'other-session');
  chat.threadContext = new Map([['one', {}]]); chat.crowdedThreads = new Set(['one']);
  const webview = {};
  chat.agentPanel = { webview };
  chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'one' }]]);
  chat.visibleConversationId = vi.fn(() => 'two');
  chat.safePost = vi.fn(); chat.toConversation = vi.fn(); chat.persistNow = vi.fn(async () => {});
  chat.bindAgent = vi.fn(); chat.newConversation = vi.fn();
  chat.conversationCwd = vi.fn(async () => '/project'); chat.shownTarget = vi.fn(() => target);
  chat.askOffThread = vi.fn(async () => 'Ziel: Projekt fortsetzen. Dateien und bisherige Entscheidungen erhalten.');
  chat.output = { appendLine: vi.fn() };
  chat.ctx = { extension: { id: 'oskarschiermeister.cortex' }, globalState: { update: vi.fn(async () => {}) } };
  chat.exokortex = { schreibe: vi.fn() };
  return { chat, rec: rec as any, other: other as any, webview };
}
beforeEach(() => { vi.clearAllMocks(); window.showInformationMessage.mockResolvedValue(undefined); window.showWarningMessage.mockResolvedValue(undefined); });

describe('real chat commands from the requesting surface', () => {
  it.each(['openDocumentTemplates', 'openPresentationTemplates', 'openSpreadsheetTemplates'])('forwards %s to the same chat without a model call', async action => {
    const { chat } = host();
    await chat.performAction('one', action);
    expect(chat.toConversation).toHaveBeenCalledWith('one', { kind: 'slashAction', action }, { log: false });
    expect(chat.askOffThread).not.toHaveBeenCalled();
  });
  it('pins the requesting chat, sorts it first, and persists the flag', async () => {
    const { chat, rec, other, webview } = host();
    other.log = [{ kind: 'notice', text: 'newer' }];
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'pin' }, webview);
    expect(rec.pinned).toBe(true); expect(other.pinned).toBeUndefined();
    expect(chat.metas().map((c: any) => c.id)).toEqual(['one', 'two']);
    expect(chat.safePost).toHaveBeenCalledWith(webview, expect.objectContaining({ kind: 'conversations', list: expect.arrayContaining([expect.objectContaining({ id: 'one', pinned: true })]) }));
    await (ChatViewProvider.prototype as any).persistNow.call(chat);
    expect(chat.ctx.globalState.update).toHaveBeenCalledWith('cortex.conversations', expect.arrayContaining([expect.objectContaining({ id: 'one', pinned: true })]));
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'pin' }, webview);
    expect(rec.pinned).toBe(false);
  });
  it('archives and restores without losing history, exposing a separate archived list', async () => {
    const { chat, rec, webview } = host(); const before = structuredClone(rec.turns);
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'archive' }, webview);
    expect(rec.archived).toBe(true); expect(chat.queues.pause).toHaveBeenCalledWith('one');
    expect(chat.metas().some((c: any) => c.id === 'one')).toBe(false);
    expect(chat.safePost).toHaveBeenLastCalledWith(webview, expect.objectContaining({ archivedList: [expect.objectContaining({ id: 'one', archived: true })] }));
    expect(chat.bindAgent).not.toHaveBeenCalled(); // The other visible chat is untouched.
    await chat.dispatchMessage({ kind: 'restoreConversation', id: 'one' }, webview);
    expect(rec.archived).toBe(false); expect(rec.turns).toEqual(before);
    expect(chat.metas(true)).toEqual([]); expect(chat.persistNow).toHaveBeenCalledTimes(2);
  });
  it('keeps pinned and archived empty chats across persistence', async () => {
    const { chat, rec, other } = host(); rec.turns = []; rec.log = []; rec.pinned = true; other.archived = true;
    await (ChatViewProvider.prototype as any).persistNow.call(chat);
    const saved = chat.ctx.globalState.update.mock.calls.find(([key]: any[]) => key === 'cortex.conversations')[1];
    expect(saved.map((c: any) => c.id).sort()).toEqual(['one', 'two']);
  });
  it('exports the complete original chat and copies readable Markdown', async () => {
    const { chat, rec, webview } = host();
    rec.contextCompaction = { summary: 'Kurz', throughTurns: 4 };
    window.showSaveDialog.mockResolvedValueOnce(Uri.file('/tmp/cortex-export.json'));
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'export' }, webview);
    const data = JSON.parse(Buffer.from(fsSpies.writeFile.mock.calls[0]![1]).toString());
    expect(data.chat.id).toBe('one'); expect(data.verlauf).toHaveLength(8); expect(data.verlauf[0].text).toBe(rec.turns[0].text);
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'copy' }, webview);
    expect(env.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining(rec.turns[0].text.trim()));
  });
  it('forks into a separate chat while carrying its compact working context', async () => {
    const { chat, rec, webview } = host(); rec.pinned = true; rec.contextCompaction = { summary: 'Bewahrte Entscheidungen', throughTurns: 4 };
    window.showWarningMessage.mockResolvedValueOnce('Gemeinsamer Ordner');
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'fork' }, webview);
    const fork = [...chat.conversations.values()].find((c: any) => c.id !== 'one' && c.id !== 'two') as any;
    expect(fork.title).toBe('Erster Chat (Abzweig)'); expect(fork.turns).toEqual(rec.turns);
    expect(fork.pinned).toBeUndefined(); expect(fork.contextCompaction).toEqual(rec.contextCompaction);
    expect(chat.sessions.getHistory(fork.id)).toHaveLength(5);
    expect(chat.sessions.getNativeSession('one', target, '/project')).toBe('original-session');
  });
  it('opens feedback in the internal issue reporter with the Cortex identity', async () => {
    const { chat, webview } = host(); commands.getCommands.mockResolvedValueOnce(['workbench.action.openIssueReporter']);
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'feedback' }, webview);
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.openIssueReporter', { extensionId: 'oskarschiermeister.cortex' });
  });
});

describe('context compaction preserves the original transcript', () => {
  it('replaces only model history after a successful summary and survives a reconstructed session', async () => {
    const { chat, rec, webview } = host(); const before = structuredClone(rec);
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'compact' }, webview);
    expect(rec.turns).toEqual(before.turns); expect(rec.log).toEqual(before.log);
    expect(rec.contextCompaction.throughTurns).toBe(4);
    expect(chat.sessions.getHistory('one')).toEqual(workingHistory(rec.turns, rec.contextCompaction));
    expect(chat.sessions.getHistory('one')).toHaveLength(5);
    expect(chat.sessions.getNativeSession('one', target, '/project')).toBeUndefined();
    expect(chat.sessions.getNativeSession('two', target, '/project')).toBe('other-session');
    const restored = new SessionStore();
    workingHistory(rec.turns, JSON.parse(JSON.stringify(rec.contextCompaction))).forEach(turn => restored.appendTurn('one', turn));
    expect(restored.getHistory('one')).toEqual(chat.sessions.getHistory('one'));
    expect(chat.askOffThread).toHaveBeenCalledWith(target, expect.any(String), expect.any(AbortSignal), undefined, { cwd: '/project' });
  });
  it.each(['running', 'queued', 'failed', 'changed'])('preserves original sessions for %s work', async condition => {
    const { chat, rec, webview } = host(); const history = structuredClone(chat.sessions.getHistory('one'));
    if (condition === 'running') chat.tasks.set('one', new AbortController());
    if (condition === 'queued') chat.queues.items.mockReturnValue([{ id: 'pending' }]);
    if (condition === 'failed') chat.askOffThread.mockResolvedValue(undefined);
    if (condition === 'changed') chat.askOffThread.mockImplementation(async () => { rec.turns.push({ role: 'user', text: 'Neue Nachricht' }); return 'Zusammenfassung'; });
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'compact' }, webview);
    expect(rec.contextCompaction).toBeUndefined();
    expect(chat.sessions.getNativeSession('one', target, '/project')).toBe('original-session');
    expect(chat.sessions.getHistory('one')).toEqual(history);
  });
  it('rolls back model history and session identity if persistence fails', async () => {
    const { chat, rec, webview } = host(); const before = structuredClone(rec.turns);
    chat.persistNow.mockRejectedValueOnce(new Error('disk failure'));
    await chat.dispatchMessage({ kind: 'chatCommand', action: 'compact' }, webview);
    expect(rec.contextCompaction).toBeUndefined(); expect(rec.turns).toEqual(before);
    expect(chat.sessions.getHistory('one')).toEqual(before);
    expect(chat.sessions.getNativeSession('one', target, '/project')).toBe('original-session');
  });
  it.each([1, 3])('rewinds safely before original user message %s after compaction', async index => {
    const { chat, rec } = host();
    rec.contextCompaction = { summary: 'Entscheidungen', throughTurns: 4 };
    rec.log = Array.from({ length: 4 }, (_, n) => [{ kind: 'userEcho', text: rec.turns[n * 2].text }, { kind: 'done', messageId: `m${n}`, turn: true }]).flat();
    chat.erinnerung = { vergiss: vi.fn() };
    chat.surfaces = new Map();
    window.showWarningMessage.mockResolvedValueOnce('Zurückgehen');
    await chat.rewindConversation('one', index, 'rewind');
    expect(rec.turns).toHaveLength(index * 2);
    expect(rec.contextCompaction).toEqual(index === 1 ? undefined : { summary: 'Entscheidungen', throughTurns: 4 });
    expect(chat.sessions.getHistory('one')).toEqual(workingHistory(rec.turns, rec.contextCompaction));
  });
  it('aborts an in-progress summary when Cortex cancels all work', async () => {
    const { chat, rec, webview } = host(); let signal!: AbortSignal;
    chat.askOffThread.mockImplementation(async (_target: unknown, _prompt: unknown, runningSignal: AbortSignal) => {
      signal = runningSignal;
      await new Promise<void>(resolve => runningSignal.addEventListener('abort', () => resolve(), { once: true }));
      return undefined;
    });
    const pending = chat.dispatchMessage({ kind: 'chatCommand', action: 'compact' }, webview);
    await vi.waitFor(() => expect(signal).toBeDefined());
    chat.cancelAll(); await pending;
    expect(signal.aborted).toBe(true); expect(rec.contextCompaction).toBeUndefined();
    expect(chat.compactingChats.size).toBe(0);
  });
  it('summarizes the prior summary and only new older turns on repeated compaction', () => {
    const { rec } = host();
    const previous = { summary: 'Entscheidungen aus der ersten Runde', throughTurns: 2 };
    const plan = compactionPlan(rec.turns, previous)!;
    expect(plan.prompt).toContain(previous.summary); expect(plan.prompt).not.toContain('Beitrag 0:');
    expect(plan.prompt).toContain('Beitrag 2:'); expect(plan.prompt).not.toContain('Beitrag 4:');
    expect(workingHistory(rec.turns.slice(0, 1), previous)).toEqual(rec.turns.slice(0, 1));
  });
  it('uses a fresh read-only model call, even if another chat has an active native session', async () => {
    const { chat } = host(); const run = vi.fn(async function* () { yield { type: 'result', text: 'Summary' }; });
    chat.adapters = { get: () => ({ supportsNativeResume: true, run }) };
    chat.accounts = { resolve: async () => ({ id: 'account' }) };
    await (ChatViewProvider.prototype as any).askOffThread.call(chat, target, 'Summarize', new AbortController().signal, undefined, { cwd: '/correct-project' });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/correct-project', permissionMode: 'safe', resumeSessionId: undefined }), expect.any(Object), expect.any(AbortSignal));
  });
});
