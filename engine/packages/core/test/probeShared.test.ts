import { describe, expect, it } from 'vitest';
import { MAX_TOOL_PAGES, listTools, type ProbeResult } from '../src/mcp/probe/shared.js';
import { MCP_PROTOCOL_VERSION, isSseUrl } from '../src/mcp/transport.js';

const page = (names: string[], nextCursor?: string) => ({
  message: { id: 0, result: { tools: names.map((name) => ({ name })), ...(nextCursor ? { nextCursor } : {}) } },
});

describe('Werkzeugliste über Seiten', () => {
  it('folgt dem Cursor und zählt die Ids ab 2', async () => {
    const calls: Array<[number, string | undefined]> = [];
    const tools = await listTools(async (id, cursor) => {
      calls.push([id, cursor]);
      return id === 2 ? page(['a'], 'c1') : page(['b']);
    });
    expect(tools).toEqual([{ name: 'a', title: undefined, description: undefined }, { name: 'b', title: undefined, description: undefined }]);
    expect(calls).toEqual([[2, undefined], [3, 'c1']]);
  });

  it('hört nach MAX_TOOL_PAGES Seiten auf', async () => {
    let asked = 0;
    const tools = await listTools(async () => { asked++; return page(['x'], 'immer'); });
    expect(asked).toBe(MAX_TOOL_PAGES);
    expect(tools).toHaveLength(MAX_TOOL_PAGES);
  });

  it('gibt einen Fehlschlag oder eine Fehlerantwort weiter', async () => {
    const failure: ProbeResult = { ok: false, reason: 'network', message: 'weg' };
    expect(await listTools(async () => ({ failure }))).toBe(failure);
    const rpc = await listTools(async () => ({ message: { id: 2, error: { message: 'nein' } } }));
    expect(rpc).toMatchObject({ ok: false, reason: 'protocol', detail: 'nein' });
  });
});

describe('Transport', () => {
  it('erkennt SSE-URLs und nennt die Protokollversion', () => {
    expect(isSseUrl('https://x.test/sse')).toBe(true);
    expect(isSseUrl('https://x.test/mcp')).toBe(false);
    expect(isSseUrl('kein url')).toBe(false);
    expect(MCP_PROTOCOL_VERSION).toBe('2025-06-18');
  });
});
