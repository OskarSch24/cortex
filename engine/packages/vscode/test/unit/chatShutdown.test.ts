import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '@cortex/core';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { window, workspace } from './vscodeStub.js';

const hooks: Array<[object, string, PropertyDescriptor | undefined]> = [];
beforeEach(() => {
  vi.useFakeTimers();
  for (const [target, key] of [
    [workspace, 'onDidChangeConfiguration'], [workspace, 'onDidChangeWorkspaceFolders'], [window, 'onDidChangeWindowState'],
  ] as Array<[object, string]>) {
    hooks.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { configurable: true, value: vi.fn(() => ({ dispose: vi.fn() })) });
  }
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks();
  for (const [target, key, previous] of hooks.splice(0)) {
    if (previous) Object.defineProperty(target, key, previous);
    else Reflect.deleteProperty(target, key);
  }
});

describe('chat shutdown persistence', () => {
  it('cancels the live task before flushing and never touches a closed memento after the debounce interval', async () => {
    const values = new Map<string, unknown>();
    let storageClosed = false;
    const get = vi.fn((key: string, fallback: unknown) => {
      if (storageClosed) throw new Error('Synthetic memento is closed.');
      return values.has(key) ? values.get(key) : fallback;
    });
    const update = vi.fn(async (key: string, value: unknown) => {
      if (storageClosed) throw new Error('Synthetic memento is closed.');
      values.set(key, structuredClone(value));
    });
    const subscription = () => ({ dispose: vi.fn() });
    const ctx = {
      subscriptions: [] as Array<{ dispose(): void }>,
      globalState: { get, update }, workspaceState: { get, update },
      globalStorageUri: { fsPath: '/synthetic-unread-shutdown-storage' },
      extensionUri: { fsPath: '/synthetic-unread-extension' },
    };
    const output = { appendLine: vi.fn() };
    const chat = new ChatViewProvider(
      ctx as any, {} as any, new SessionStore(),
      { onDidChange: subscription } as any,
      { onDidChange: () => vi.fn() } as any, {} as any,
      { onDidChange: subscription } as any, { onDidChange: subscription } as any,
      {} as any, {} as any, {} as any, output as any,
      { setDeliveries: vi.fn(), setRequirements: vi.fn(), onDidChange: subscription } as any,
      { onDidChange: subscription } as any, { onDidChange: subscription } as any,
    ) as any;
    // Keep every effect within the synthetic memento; no real archive writes.
    chat.exokortex = { schreibe: vi.fn() };
    const controller = new AbortController();
    const conversation = { id: 'chat', title: 'Synthetic shutdown', createdAt: 1, updatedAt: 1, turns: [], log: [{ kind: 'delta', messageId: 'answer', text: 'Unfinished answer' }] };
    chat.conversations.set('chat', conversation);
    chat.tasks.set('chat', controller);
    chat.liveRuns.set('chat', { messageIds: ['answer'], turnIdx: 0, userTexts: [], modes: {}, handle: {} });
    chat.queues.restore({ chat: [{ id: 'queued', text: 'Retained next task', tags: [], modes: {} }] });
    chat.persistSoon();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    // The actual constructor subscriptions call real cancelAll(), whose queue
    // changes and stopped message normally request another debounced write.
    for (const disposable of ctx.subscriptions) disposable.dispose();
    await Promise.resolve(); await Promise.resolve();
    expect(controller.signal.aborted).toBe(true);
    expect(chat.tasks.size).toBe(0);
    const saved = values.get('cortex.conversations') as Array<{ log: unknown[] }>;
    expect(saved[0]?.log).toContainEqual({ kind: 'stopped', messageId: 'answer', reason: 'stopped' });
    expect(values.get('cortex.messageQueues')).toMatchObject({ chat: [{ id: 'queued', text: 'Retained next task' }] });

    const readsAfterFlush = get.mock.calls.length;
    const writesAfterFlush = update.mock.calls.length;
    storageClosed = true;
    // A final asynchronous queue notification must also be harmless.
    chat.queues.pause('chat');
    chat.persistSoon();
    await vi.advanceTimersByTimeAsync(1600);
    expect(get).toHaveBeenCalledTimes(readsAfterFlush);
    expect(update).toHaveBeenCalledTimes(writesAfterFlush);
    expect(output.appendLine).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
