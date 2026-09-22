import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JsonRpcOptions } from '../src/adapters/jsonRpc.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';
import type { LiveRunHandle, RunRequest } from '../src/adapters/adapter.js';
import { CodexAdapter } from '../src/adapters/codex.js';

const mock = vi.hoisted(() => ({ options: undefined as JsonRpcOptions | undefined, args: [] as string[], request: vi.fn(), dispose: vi.fn() }));
vi.mock('../src/adapters/jsonRpc.js', async original => ({
  ...await original<typeof import('../src/adapters/jsonRpc.js')>(),
  JsonRpcProcess: class {
    constructor(_command: string, args: string[], options: JsonRpcOptions) { mock.options = options; mock.args = args; }
    start() {} notify() {} dispose() { mock.dispose(); }
    request(method: string, params: unknown) { return mock.request(method, params); }
  },
}));
const account: ResolvedAccount = { id: 't', provider: 'codex', label: 't', authMode: 'managed-home', hasSecret: false, priority: 0 };
const collect = async (stream: AsyncIterable<AdapterEvent>) => { const events: AdapterEvent[] = []; for await (const event of stream) events.push(event); return events; };
const run = (over: Partial<RunRequest> = {}, a = account) => new CodexAdapter('unused-cli').run({ prompt: 'short followup', cwd: process.cwd(), permissionMode: 'edits', idleTimeoutMs: 100, ...over }, a, new AbortController().signal);
const notify = (method: string, params: Record<string, unknown>) => { mock.options!.onActivity?.(); mock.options!.onNotification({ method, params }); };
const ready = async () => {
  // Resolve mocked protocol promises without advancing the idle clock.
  for (let i = 0; i < 12; i++) await Promise.resolve();
  expect(mock.request).toHaveBeenCalledWith('turn/start', expect.anything());
};
beforeEach(() => {
  vi.useFakeTimers(); mock.dispose.mockClear(); mock.request.mockReset();
  mock.request.mockImplementation(async (method: string) => method === 'thread/start' || method === 'thread/resume' ? { thread: { id: 'thread' } } : method === 'turn/start' ? { turn: { id: 'turn' } } : {});
});
afterEach(() => { vi.useRealTimers(); });

describe('Codex runtime reliability (#54–59)', () => {
  it('times out a silent running turn, not merely its initial RPC', async () => {
    const pending = collect(run()); await ready();
    await vi.advanceTimersByTimeAsync(101);
    const events = await pending;
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('keine Aktivität') });
    expect(mock.dispose).toHaveBeenCalled();
  });
  it('keeps an active long turn alive and clears the timer on completion', async () => {
    const pending = collect(run()); await ready();
    for (let i = 0; i < 5; i++) { await vi.advanceTimersByTimeAsync(80); notify('item/agentMessage/delta', { delta: 'x' }); }
    notify('turn/completed', { turn: { id: 'turn', status: 'completed' } });
    expect((await pending).at(-1)).toMatchObject({ type: 'result', text: 'xxxxx' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('asks for a standard-mode escalation and suspends inactivity while the user answers', async () => {
    const handle: LiveRunHandle = {};
    const stream = run({ handle });
    expect((await stream.next()).value).toMatchObject({ type: 'session' }); await ready();
    const approval = Promise.resolve(mock.options!.onServerRequest!({ id: 42, method: 'item/commandExecution/requestApproval', params: { command: 'npm install' } }));
    expect((await stream.next()).value).toMatchObject({ type: 'permission', request: { kind: 'command' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.dispose).not.toHaveBeenCalled();
    handle.respondPermission!('42', { outcome: 'deny', reason: 'Use the cache' });
    expect(await approval).toEqual({ decision: 'denied' });
    notify('turn/completed', { turn: { status: 'completed' } });
    await collect(stream);
    expect(mock.request).toHaveBeenCalledWith('thread/start', expect.objectContaining({ approvalPolicy: 'on-request', sandbox: 'workspace-write' }));
  });
  it('refuses unknown approvals and cannot escalate safe mode', async () => {
    const pending = collect(run({ permissionMode: 'safe' })); await ready();
    expect(await mock.options!.onServerRequest!({ id: 1, method: 'new/unknown', params: {} })).toEqual({ decision: 'denied' });
    expect(await mock.options!.onServerRequest!({ id: 2, method: 'item/commandExecution/requestApproval', params: {} })).toEqual({ decision: 'denied' });
    notify('turn/completed', { turn: { status: 'completed' } }); await pending;
  });
  it('remembers an identical command across correlation ids but asks for changed arguments (#97)', async () => {
    const handle: LiveRunHandle = {}, stream = run({ handle });
    await stream.next(); await ready();
    const request = (id: number, command: string) => ({ id, method: 'item/commandExecution/requestApproval', params: { command, threadId: 'thread', turnId: `turn-${id}`, itemId: `item-${id}`, approvalId: `approval-${id}` } });
    const first = Promise.resolve(mock.options!.onServerRequest!(request(1, 'git status')));
    expect((await stream.next()).value).toMatchObject({ type: 'permission' });
    handle.respondPermission!('1', { outcome: 'allow-always' });
    expect(await first).toEqual({ decision: 'approved' });
    expect((await stream.next()).value).toMatchObject({ type: 'permission-resolved' });
    expect(await mock.options!.onServerRequest!(request(2, 'git status'))).toEqual({ decision: 'approved' });
    const changed = Promise.resolve(mock.options!.onServerRequest!(request(3, 'git reset --hard')));
    expect((await stream.next()).value).toMatchObject({ type: 'permission' });
    handle.respondPermission!('3', { outcome: 'deny' });
    expect(await changed).toEqual({ decision: 'denied' });
    notify('turn/completed', { turn: { status: 'completed' } }); await collect(stream);
  });
  it.each([true, false])('delivers denial feedback to the same turn after its denial response; accepted=%s (#98)', async accepted => {
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((method, params) => method === 'turn/steer' && !accepted ? Promise.reject(new Error('turn already ended')) : original(method, params));
    const handle: LiveRunHandle = {}, stream = run({ handle });
    await stream.next(); await ready();
    const request = { id: 43, method: 'item/commandExecution/requestApproval', params: { command: 'npm install' } };
    const approval = Promise.resolve(mock.options!.onServerRequest!(request));
    await stream.next();
    handle.respondPermission!('43', { outcome: 'deny', reason: 'Use only cached dependencies' });
    const denied = await approval;
    expect(denied).toEqual({ decision: 'denied' });
    expect(mock.request.mock.calls.some(call => call[0] === 'turn/steer')).toBe(false);
    mock.options!.onServerResponse!(request, denied);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(mock.request).toHaveBeenCalledWith('turn/steer', expect.objectContaining({ threadId: 'thread', expectedTurnId: 'turn', input: [{ type: 'text', text: expect.stringContaining('Use only cached dependencies') }] }));
    notify('turn/completed', { turn: { status: 'completed' } });
    const events = await collect(stream);
    expect(events.some(event => event.type === 'deferred-instruction')).toBe(!accepted);
    expect(mock.request.mock.calls.filter(call => call[0] === 'turn/start')).toHaveLength(1);
  });
  it('retains a user denial reason when the turn ends synchronously before the gate resumes (#98)', async () => {
    const handle: LiveRunHandle = {}, stream = run({ handle });
    await stream.next(); await ready();
    const request = { id: 44, method: 'item/commandExecution/requestApproval', params: { command: 'npm install' } };
    const approval = Promise.resolve(mock.options!.onServerRequest!(request));
    await stream.next();
    handle.respondPermission!('44', { outcome: 'deny', reason: 'Use the lockfile' });
    notify('turn/completed', { turn: { status: 'completed' } });
    expect(await approval).toEqual({ decision: 'denied' });
    const events = await collect(stream);
    expect(events.filter(event => event.type === 'deferred-instruction')).toEqual([{ type: 'deferred-instruction', text: 'Use the lockfile' }]);
    expect(mock.request.mock.calls.some(call => call[0] === 'turn/steer')).toBe(false);
  });
  it.each([['ultra', 'ultra'], ['minimal', 'medium']])('validates %s against current model capability', async (effort, expected) => {
    const pending = collect(run({ model: 'gpt-6-astra', effort: effort as RunRequest['effort'] })); await ready();
    expect(mock.args).toContain(`model_reasoning_effort=${expected}`);
    expect(mock.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ effort: expected }));
    notify('turn/completed', { turn: { status: 'completed' } }); await pending;
  });
  it('restores cold context with a notice only for a missing native session', async () => {
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((method, params) => method === 'thread/resume' ? Promise.reject(new Error('thread not found')) : original(method, params));
    const pending = collect(run({ resumeSessionId: 'gone', coldPrompt: 'full saved history' })); await ready();
    expect(mock.request).toHaveBeenCalledWith('turn/start', expect.objectContaining({ input: [{ type: 'text', text: 'full saved history' }] }));
    notify('turn/completed', { turn: { status: 'completed' } });
    expect((await pending).filter(event => event.type === 'notice')).toHaveLength(1);
  });
  it('does not hide an authentication failure by creating an empty thread', async () => {
    const original = mock.request.getMockImplementation()!;
    mock.request.mockImplementation((method, params) => method === 'thread/resume' ? Promise.reject(new Error('authentication failed')) : original(method, params));
    const events = await collect(run({ resumeSessionId: 'known' }));
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'authentication failed' });
    expect(mock.request.mock.calls.some(call => call[0] === 'thread/start')).toBe(false);
  });
  it('uses standard tools when an optional code-mode host is absent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cx-hostless-'));
    mkdirSync(join(root, 'plugins', '.plugin-appserver'), { recursive: true });
    try {
      const pending = collect(run({}, { ...account, homeDir: root })); await ready();
      expect(mock.args).toContain('features.code_mode_host=false');
      expect(mock.args).toContain('features.code_mode_only=false');
      notify('turn/completed', { turn: { status: 'completed' } }); await pending;
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
