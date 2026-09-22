import { describe, expect, it, vi } from 'vitest';
import type { LiveRunHandle } from '../src/adapters/adapter.js';
import type { JsonRpcOptions } from '../src/adapters/jsonRpc.js';
import { CodexAdapter } from '../src/adapters/codex.js';

const rpc = vi.hoisted(() => ({ options: undefined as JsonRpcOptions | undefined, steer: vi.fn() }));
vi.mock('../src/adapters/jsonRpc.js', async importOriginal => ({
  ...await importOriginal<typeof import('../src/adapters/jsonRpc.js')>(),
  JsonRpcProcess: class {
    constructor(_command: string, _args: string[], options: JsonRpcOptions) { rpc.options = options; }
    start() {} notify() {} dispose() {}
    async request(method: string, params: unknown) {
      if (method === 'thread/start') return { thread: { id: 'thread' } };
      if (method === 'turn/start') return { turn: { id: 'turn' } };
      if (method === 'turn/steer') return rpc.steer(params);
      return {};
    }
  },
}));

describe('Codex live steering acknowledgement', () => {
  it.each([true, false])('reports provider acceptance as %s only after the RPC settles', async accepted => {
    const handle: LiveRunHandle = {};
    const stream = new CodexAdapter('unused-test-cli').run(
      { prompt: 'Original', cwd: '/tmp', permissionMode: 'safe', handle },
      { id: 'codex:test', provider: 'codex', label: 'Test', authMode: 'managed-home', hasSecret: false, priority: 0 },
      new AbortController().signal,
    );
    await stream.next();
    await vi.waitFor(() => expect(handle.inject).toBeTypeOf('function'));
    let resolve!: (value: object) => void, reject!: (error: Error) => void;
    rpc.steer.mockImplementation(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
    let settled = false;
    const pending = Promise.resolve(handle.inject!('Correction')).then(value => { settled = true; return value; });
    await Promise.resolve(); expect(settled).toBe(false);
    expect(rpc.steer).toHaveBeenCalledWith({ threadId: 'thread', expectedTurnId: 'turn', input: [{ type: 'text', text: 'Correction' }] });
    if (accepted) resolve({}); else reject(new Error('Turn already completed'));
    expect(await pending).toBe(accepted);
    rpc.options!.onNotification({ method: 'turn/completed', params: { turn: { id: 'turn', status: 'completed' } } });
    for await (const _event of stream) { /* drain */ }
    expect(handle.inject).toBeUndefined();
  });
});
