import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSearchBridge, resultsForModel } from '../../src/websearch/websearchBridge.js';

const SCRIPT = join(__dirname, '..', '..', 'dist', 'websearchServer.js');
const bridges: WebSearchBridge[] = [];
afterEach(() => bridges.splice(0).forEach(bridge => bridge.dispose()));

/** Startet den Suchserver so, wie eine CLI es täte, und spricht MCP mit ihm. */
async function mcp(env: Record<string, string>, requests: Array<Record<string, unknown>>) {
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout! });
  const answers: Array<Record<string, unknown>> = [];
  const done = new Promise<void>(resolve => lines.on('line', line => {
    answers.push(JSON.parse(line));
    if (answers.length === requests.length) resolve();
  }));
  for (const request of requests) child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n');
  await done;
  child.kill();
  return answers;
}

describe.skipIf(!existsSync(SCRIPT))('Suchserver cortex_websearch', () => {
  it('reicht web_search über das Token an Cortex und gibt die Treffer zurück', async () => {
    const seen: Array<[string, string, number | undefined]> = [];
    const bridge = new WebSearchBridge(SCRIPT, async (conversationId, query, maxResults) => {
      seen.push([conversationId, query, maxResults]);
      return [{ url: 'https://a.de', title: 'A', content: 'Auszug  mit\nUmbruch' }];
    });
    bridges.push(bridge);
    const server = await bridge.serverFor('chat-1');
    expect(server.command).toBe(process.execPath);
    expect(await bridge.serverFor('chat-1')).toEqual(server); // ein Token je Chat
    const [init, list, call] = await mcp(server.env, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'web_search', arguments: { query: 'Röster Frankfurt', max_results: 5 } } },
    ]);
    expect((init!.result as { serverInfo: { name: string } }).serverInfo.name).toBe('cortex_websearch');
    expect((list!.result as { tools: Array<{ name: string; annotations: { readOnlyHint: boolean } }> }).tools.map(tool => [tool.name, tool.annotations.readOnlyHint])).toEqual([['web_search', true]]);
    expect(seen).toEqual([['chat-1', 'Röster Frankfurt', 5]]);
    expect(call!.result).toEqual({ content: [{ type: 'text', text: '1. A\n   https://a.de\n   Auszug mit Umbruch' }] });
  });

  it('weist fremde Tokens ab und meldet Suchfehler als Werkzeugfehler', async () => {
    const bridge = new WebSearchBridge(SCRIPT, async () => { throw new Error('kein Guthaben'); });
    bridges.push(bridge);
    const server = await bridge.serverFor('chat-2');
    const [failed] = await mcp(server.env, [{ id: 1, method: 'tools/call', params: { name: 'web_search', arguments: { query: 'x' } } }]);
    expect(failed!.result).toEqual({ isError: true, content: [{ type: 'text', text: 'kein Guthaben' }] });
    const [stranger] = await mcp({ ...server.env, CORTEX_WEBSEARCH_TOKEN: 'fremd' }, [{ id: 1, method: 'tools/call', params: { name: 'web_search', arguments: { query: 'x' } } }]);
    expect(stranger!.result).toEqual({ isError: true, content: [{ type: 'text', text: 'Cortex kennt diese Sitzung nicht.' }] });
  });
});

it('formatiert leere Treffer ehrlich', () => {
  expect(resultsForModel('q', [])).toBe('Keine Treffer für „q“.');
});
