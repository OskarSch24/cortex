import { describe, expect, it, vi } from 'vitest';
import { MessageQueue, type QueuedMessage } from '../../src/panel/messageQueue.js';
const message = (id: string): QueuedMessage => ({ id, text: id, tags: [], modes: { target: { provider: 'claude', account: 'private', model: 'sonnet' }, effort: 'high', attachments: ['/project/image.png'] } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

describe('persistent message queue', () => {
  it('serializes fast sends even while the first task is still preparing', async () => {
    const gate = deferred(), started: string[] = [];
    const queue = new MessageQueue(async (_id, m) => { started.push(m.id); if (m.id === 'a') await gate.promise; }, vi.fn(), vi.fn());
    queue.enqueue('chat', message('a')); queue.enqueue('chat', message('b')); queue.enqueue('chat', message('c'));
    expect(started).toEqual(['a']); expect(queue.items('chat').map(m => m.id)).toEqual(['b', 'c']);
    gate.resolve(); await flush(); expect(started).toEqual(['a', 'b', 'c']); expect(queue.items('chat')).toEqual([]);
  });
  it('edits and reorders only pending items while preserving attachments and model', async () => {
    const gate = deferred(), runs: QueuedMessage[] = [];
    const queue = new MessageQueue(async (_id, m) => { runs.push(m); if (m.id === 'a') await gate.promise; }, vi.fn(), vi.fn());
    for (const id of ['a','b','c','d']) queue.enqueue('chat', message(id));
    queue.edit('chat', 'c', 'Changed #ui', ['ui']); queue.move('chat', 'c', -1); queue.remove('chat', 'd');
    queue.edit('chat', 'a', 'Do not change active', []);
    gate.resolve(); await flush();
    expect(runs.map(m => m.text)).toEqual(['a','Changed #ui','b']);
    expect(runs[1]?.modes).toEqual(message('c').modes);
  });
  it('stop keeps pending items and resume does not start overlapping workers', async () => {
    const gate = deferred(), started: string[] = [];
    const queue = new MessageQueue(async (_id, m) => { started.push(m.id); if (m.id === 'a') await gate.promise; }, vi.fn(), vi.fn());
    queue.enqueue('chat', message('a')); queue.enqueue('chat', message('b')); queue.pause('chat');
    gate.resolve(); await flush(); expect(started).toEqual(['a']); expect(queue.items('chat')).toHaveLength(1);
    queue.resume('chat'); queue.resume('chat'); await flush(); expect(started).toEqual(['a','b']);
  });
  it('restores per-chat queues paused and does not execute on application startup', async () => {
    const run = vi.fn(async () => {}), queue = new MessageQueue(run, vi.fn(), vi.fn());
    queue.pause('one'); queue.enqueue('one', message('a')); queue.pause('two'); queue.enqueue('two', message('b'));
    const copy = new MessageQueue(run, vi.fn(), vi.fn()); copy.restore(JSON.parse(JSON.stringify(queue.snapshot())));
    await flush(); expect(run).not.toHaveBeenCalled(); expect(copy.isPaused('one')).toBe(true);
    expect(copy.pauseReason('one')).toBe('restored');
    copy.resume('one'); await flush(); expect(run).toHaveBeenCalledTimes(1); expect(copy.items('two')).toHaveLength(1);
  });
  it('pauses on dispatch failure without consuming later messages', async () => {
    const gate = deferred(), failed = vi.fn();
    const queue = new MessageQueue(async () => { await gate.promise; throw Error('preparation failed'); }, vi.fn(), failed);
    queue.enqueue('chat', message('a')); queue.enqueue('chat', message('b')); gate.resolve(); await flush();
    expect(failed).toHaveBeenCalledOnce(); expect(queue.isPaused('chat')).toBe(true); expect(queue.items('chat').map(m => m.id)).toEqual(['b']);
    expect(queue.pauseReason('chat')).toBe('error');
  });
  it('deleting one conversation never drains another conversation or its removed items', async () => {
    const gate = deferred(), run = vi.fn(async () => { await gate.promise; });
    const queue = new MessageQueue(run, vi.fn(), vi.fn());
    queue.enqueue('one', message('a')); queue.enqueue('one', message('b')); queue.pause('two'); queue.enqueue('two', message('c'));
    queue.delete('one'); gate.resolve(); await flush(); expect(run).toHaveBeenCalledOnce(); expect(queue.items('two')).toHaveLength(1);
  });
  it('#24 clear removes only pending work in the selected conversation', () => {
    const queue = new MessageQueue(vi.fn(), vi.fn(), vi.fn());
    queue.pause('one'); queue.pause('two');
    queue.enqueue('one', message('a')); queue.enqueue('two', message('b'));
    queue.clearPending('one');
    expect(queue.items('one')).toEqual([]); expect(queue.items('two')).toHaveLength(1);
  });
  it('#47 explicit stop prevents deferred project work automatically resuming', async () => {
    const run = vi.fn(async () => false as const), queue = new MessageQueue(run, vi.fn(), vi.fn());
    queue.enqueue('one', message('a')); await flush();
    expect(queue.pauseReason('one')).toBe('project');
    queue.pause('one', 'stopped'); queue.retryBlockedProjects(); await flush();
    expect(run).toHaveBeenCalledOnce(); expect(queue.items('one')).toHaveLength(1);
  });
});
