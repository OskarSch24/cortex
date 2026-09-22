import { describe, expect, it, vi } from 'vitest';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { window } from './vscodeStub.js';

function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const log = [{ kind: 'userEcho', text: 'first' }, { kind: 'done', messageId: 'm1', turn: true }, { kind: 'userEcho', text: 'second' }, { kind: 'done', messageId: 'm2', turn: true }, { kind: 'userEcho', text: 'third' }];
  const rec = { id: 'one', log, turns: [{ role: 'user', text: 'first' }, { role: 'assistant', text: 'answer1' }, { role: 'user', text: 'second' }, { role: 'assistant', text: 'answer2' }] };
  chat.conversations = new Map([['one', rec]]); chat.tasks = new Map(); chat.queues = { isWorking: () => false };
  chat.sessions = { rewind: vi.fn() }; chat.erinnerung = { vergiss: vi.fn() };
  chat.threadContext = new Map(); chat.crowdedThreads = new Set(); chat.surfaces = new Map();
  chat.sendConversations = vi.fn(); chat.persistNow = vi.fn(); chat.toConversation = vi.fn();
  return { chat, rec, log };
}
describe('#45 editing earlier messages', () => {
  it('cancel preserves every message and the model context', async () => {
    const { chat, rec, log } = host();
    window.showWarningMessage.mockResolvedValueOnce(undefined);
    expect(await chat.rewindConversation('one', 1, 'edit')).toBeUndefined();
    expect(rec.log).toBe(log); expect(rec.turns).toHaveLength(4);
    expect(chat.sessions.rewind).not.toHaveBeenCalled();
  });
  it('confirmation trims messages and context at the same boundary', async () => {
    const { chat, rec } = host();
    window.showWarningMessage.mockResolvedValueOnce('Neu senden');
    expect(await chat.rewindConversation('one', 1, 'edit')).toMatchObject({ id: 'one', echo: { text: 'second' } });
    expect(rec.log).toHaveLength(2); expect(rec.turns).toHaveLength(2);
    expect(chat.sessions.rewind).toHaveBeenCalledWith('one', rec.turns, undefined);
  });
  it('a new task during confirmation prevents truncation', async () => {
    const { chat, rec, log } = host();
    window.showWarningMessage.mockImplementationOnce(async () => { chat.tasks.set('one', new AbortController()); return 'Neu senden'; });
    expect(await chat.rewindConversation('one', 1, 'edit')).toBeUndefined();
    expect(rec.log).toBe(log); expect(chat.sessions.rewind).not.toHaveBeenCalled();
  });
});

describe('#98 pending denial reasons in forks', () => {
  it('copies reasons so additions in either chat remain separate', async () => {
    const { chat, rec } = host();
    (rec as any).pendingPermissionNotes = ['Do not delete files'];
    chat.conversationCwd = vi.fn(async () => '/project');
    chat.agentPanel = {}; chat.bindAgent = vi.fn();
    window.showWarningMessage.mockResolvedValueOnce('Gemeinsamer Ordner');
    const id = await chat.branchConversation(rec, rec.log, rec.turns);
    const fork = chat.conversations.get(id);
    fork.pendingPermissionNotes.push('Explain commands first');
    expect((rec as any).pendingPermissionNotes).toEqual(['Do not delete files']);
    (rec as any).pendingPermissionNotes.push('Keep the original database');
    expect(fork.pendingPermissionNotes).toEqual(['Do not delete files', 'Explain commands first']);
  });
});
