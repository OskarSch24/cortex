import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runAcp } from '../src/adapters/acp.js';
import { approvalSignature } from '../src/adapters/approvalSignature.js';
import type { JsonRpcOptions } from '../src/adapters/jsonRpc.js';
import type { AdapterEvent } from '../src/types.js';
import type { LiveRunHandle } from '../src/adapters/adapter.js';

const mock = vi.hoisted(() => ({ options: undefined as JsonRpcOptions | undefined, complete: undefined as ((value: object) => void) | undefined }));
vi.mock('../src/adapters/jsonRpc.js', async original => ({
  ...await original<typeof import('../src/adapters/jsonRpc.js')>(),
  JsonRpcProcess: class {
    constructor(_command: string, _args: string[], options: JsonRpcOptions) { mock.options = options; }
    start() { mock.options!.signal.addEventListener('abort', () => mock.options!.onExit?.(null), { once: true }); }
    notify() {} dispose() {}
    async request(method: string) {
      if (method === 'initialize') return { authMethods: [{ id: 'cached_token' }] }; // für Grok-Läufe
      if (method === 'session/new') return { sessionId: 'session' };
      if (method === 'session/prompt') return new Promise<object>(resolve => { mock.complete = resolve; });
      return {};
    }
  },
}));
beforeEach(() => { mock.options = undefined; mock.complete = undefined; });
const ready = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); expect(mock.complete).toBeDefined(); };
const request = (id: number, toolCall: object) => ({ id, method: 'session/request_permission', params: { toolCall: { toolCallId: `tool-${id}`, title: 'Edit file', kind: 'edit', locations: [{ path: 'a.txt' }], ...toolCall }, options: [{ kind: 'allow_once', optionId: 'once' }, { kind: 'allow_always', optionId: 'always' }, { kind: 'reject_once', optionId: 'deny' }] } });
const run = (handle: LiveRunHandle, signal: AbortSignal) => runAcp({ command: 'unused', args: [], env: process.env, req: { prompt: 'go', cwd: process.cwd(), permissionMode: 'edits', askPermission: true, handle }, signal, detectLimit: () => undefined });

describe('ACP exact approval memory and user feedback (#97–98)', () => {
  it('distinguishes complete content-only patches and never remembers an opaque action', async () => {
    const handle: LiveRunHandle = {}, permissions: AdapterEvent[] = [];
    const pending = (async () => { for await (const event of run(handle, new AbortController().signal)) if (event.type === 'permission') { permissions.push(event); handle.respondPermission!(event.request.id, { outcome: 'allow-always' }); } })();
    await ready();
    const diff = (newText: string) => ({ content: [{ type: 'diff', path: 'a.txt', oldText: 'before', newText }] });
    for (const [id, action] of [[1, diff('after')], [2, diff('after')], [3, diff('different')], [4, {}], [5, {}]] as const) {
      expect(await mock.options!.onServerRequest!(request(id, action))).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
    }
    mock.complete!({ stopReason: 'end_turn' }); await pending;
    expect(permissions.map(event => event.type === 'permission' && event.request.id)).toEqual(['1', '3', '4', '5']);
    expect(approvalSignature({ threadId: 'x', turnId: 'y', cwd: '/repo' }, '/repo')).toBe('');
    expect(approvalSignature({ rawInput: {}, kind: 'edit', locations: [{ path: 'a' }] }, '/repo')).toBe('');
  });

  it('captures only an explicit user reason and retains it on immediate Stop', async () => {
    const handle: LiveRunHandle = {}, controller = new AbortController(), events: AdapterEvent[] = [];
    const pending = (async () => { for await (const event of run(handle, controller.signal)) { events.push(event); if (event.type === 'permission') { handle.respondPermission!(event.request.id, { outcome: 'deny', reason: 'Keep existing content' }); controller.abort(); } } })();
    await ready();
    expect(await mock.options!.onServerRequest!(request(1, { rawInput: { command: 'write a.txt' } }))).toEqual({ outcome: { outcome: 'selected', optionId: 'deny' } });
    await pending;
    expect(events.filter(event => event.type === 'deferred-instruction')).toEqual([{ type: 'deferred-instruction', text: 'Keep existing content' }]);
  });
});

describe('Cortex-Suche (Exa Instant) bei Grok', () => {
  const searchCall = { title: 'cortex_websearch__web_search', kind: 'other', locations: [], rawInput: { variant: 'UseTool', tool_name: 'cortex_websearch__web_search', tool_input: { query: 'q' } } };
  const runGrok = (webSearch: object | undefined, signal: AbortSignal) => runAcp({ command: 'unused', args: [], env: process.env, configureGrokSession: true, req: { prompt: 'go', cwd: process.cwd(), permissionMode: 'safe', webSearch: webSearch as never }, signal, detectLimit: () => undefined });

  it('gibt nur das eingehängte Suchwerkzeug im Nur-lesen-Modus frei', async () => {
    const controller = new AbortController();
    const server = { command: 'node', args: ['s.js'], env: {} };
    const pending = (async () => { for await (const _ of runGrok({ mode: 'exa-instant', server }, controller.signal)) { /* leeren */ } })();
    await ready();
    expect(await mock.options!.onServerRequest!(request(1, searchCall))).toEqual({ outcome: { outcome: 'selected', optionId: 'once' } });
    // Ein anderes MCP-Werkzeug bleibt im Nur-lesen-Modus gesperrt.
    expect(await mock.options!.onServerRequest!(request(2, { ...searchCall, title: 'other__tool', rawInput: { tool_name: 'other__tool' } }))).toEqual({ outcome: { outcome: 'selected', optionId: 'deny' } });
    mock.complete!({ stopReason: 'end_turn' }); await pending;
  });

  it('gibt ohne Exa-Wahl nichts frei, auch wenn der Name passt', async () => {
    const controller = new AbortController();
    const pending = (async () => { for await (const _ of runGrok(undefined, controller.signal)) { /* leeren */ } })();
    await ready();
    expect(await mock.options!.onServerRequest!(request(1, searchCall))).toEqual({ outcome: { outcome: 'selected', optionId: 'deny' } });
    mock.complete!({ stopReason: 'end_turn' }); await pending;
  });
});
