import { describe, expect, it, vi } from 'vitest';
import { HistoryBridge } from '../../src/history/bridge.js';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import type { HistoryRequest, HistoryState } from '../../src/history/types.js';

const state: HistoryState = {
  settings: { enabled: false, allowedApps: [], retentionDays: 7 }, permission: true,
  model: 'available', running: false, status: 'Pausiert', apps: [], total: 1,
  entries: [{ id: 'local', startedAt: 1, endedAt: 2, appId: 'example.notes', appName: 'Notes', title: 'Private note', text: 'LOCAL_ONLY_MARKER' }],
};
function backend() {
  return {
    state: vi.fn(async () => structuredClone(state)), configure: vi.fn(async () => {}),
    requestPermission: vi.fn(async () => {}), delete: vi.fn(async () => {}), clear: vi.fn(async () => {}),
    ask: vi.fn(async () => ({ question: 'Gestern?', answer: 'LOCAL_ONLY_MARKER', sources: [] })), dispose: vi.fn(),
  };
}

describe('Computerverlauf: separater lokaler UI-Kanal', () => {
  it('dispatches history requests without routing, storing or exporting a conversation', async () => {
    const chat = Object.create(ChatViewProvider.prototype) as any;
    const webview = {}; const log: unknown[] = [];
    chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'cloud' }]]);
    chat.conversations = new Map([['cloud', { log, turns: [] }]]);
    chat.computerHistoryBridge = { handle: vi.fn(async () => {}) };
    chat.orchestrator = { run: vi.fn() }; chat.persistNow = vi.fn();
    chat.toConversation = vi.fn(); chat.exokortex = { schreibe: vi.fn() };
    const requests: HistoryRequest[] = [
      { kind: 'computerHistory', action: 'state' },
      { kind: 'computerHistory', action: 'configure', settings: { enabled: false } },
      { kind: 'computerHistory', action: 'ask', question: 'LOCAL_ONLY_MARKER', requestId: 'one' },
      { kind: 'computerHistory', action: 'clear' },
    ];
    for (const request of requests) await chat.dispatchMessage(request, webview);
    expect(chat.computerHistoryBridge.handle).toHaveBeenCalledTimes(4);
    expect(log).toEqual([]);
    for (const spy of [chat.orchestrator.run, chat.persistNow, chat.toConversation, chat.exokortex.schreibe]) expect(spy).not.toHaveBeenCalled();
  });

  it('returns results exclusively to the subscribed settings surface', async () => {
    const service = backend(), post = vi.fn(), view = {}, other = {};
    const bridge = new HistoryBridge(service, post, () => true);
    await bridge.handle({ kind: 'computerHistory', action: 'state' }, view);
    await bridge.handle({ kind: 'computerHistory', action: 'ask', question: 'Gestern?', requestId: 'q' }, view);
    expect(post.mock.calls).toHaveLength(2);
    expect(post.mock.calls.every(([recipient]) => recipient === view && recipient !== other)).toBe(true);
    expect(post.mock.calls[1]![1]).toMatchObject({ kind: 'computerHistoryAnswer', requestId: 'q', result: { answer: 'LOCAL_ONLY_MARKER' } });
    bridge.dispose(); expect(service.dispose).toHaveBeenCalledOnce();
  });

  it('does not deliver a pending answer after the local page closes', async () => {
    const service = backend(), post = vi.fn(), view = {};
    let finish!: (value: { question: string; answer: string; sources: [] }) => void;
    service.ask.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const bridge = new HistoryBridge(service, post, () => true);
    const ask = bridge.handle({ kind: 'computerHistory', action: 'ask', question: 'Gestern?', requestId: 'q' }, view);
    await bridge.handle({ kind: 'computerHistory', action: 'unsubscribe' }, view);
    finish({ question: 'Gestern?', answer: 'LOCAL_ONLY_MARKER', sources: [] }); await ask;
    expect(post).not.toHaveBeenCalled(); bridge.dispose();
  });

  it('does not expose raw native errors or question text in general error messages', async () => {
    const service = backend(), post = vi.fn(), view = {};
    service.ask.mockRejectedValueOnce(new Error('helper stderr LOCAL_ONLY_MARKER'));
    const bridge = new HistoryBridge(service, post, () => true);
    await bridge.handle({ kind: 'computerHistory', action: 'ask', question: 'Frage', requestId: 'q' }, view);
    const response = post.mock.calls[0]![1];
    expect(response.result.error).toContain('kein Cloudmodell');
    expect(JSON.stringify(response)).not.toContain('LOCAL_ONLY_MARKER'); bridge.dispose();
  });
});
