/**
 * Hält fest, wie die drei MCP-Server auf stdio antworten — der Genehmigungsserver
 * vor allem, weil er im Zweifel ablehnen muss. Gebaut wird aus den Quellen, nicht
 * aus dist/, damit der Test die aktuelle Fassung prüft.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { askLoopback, handleMcpMessage } from '../../src/mcp/stdioServer.js';

const SRC = join(__dirname, '..', '..', 'src');
let out: string;
const scripts: Record<'permission' | 'canvas' | 'websearch' | 'browser', string> = { permission: '', canvas: '', websearch: '', browser: '' };

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), 'cortex-mcp-'));
  const entries = { permission: 'permission/mcpServer.ts', canvas: 'canvas/canvasMcp.ts', websearch: 'websearch/websearchMcp.ts', browser: 'browser/browserMcp.ts' } as const;
  for (const [key, entry] of Object.entries(entries) as Array<[keyof typeof entries, string]>) {
    scripts[key] = join(out, `${key}.cjs`);
    await build({ entryPoints: [join(SRC, entry)], bundle: true, platform: 'node', format: 'cjs', target: 'node18', outfile: scripts[key], logLevel: 'silent' });
  }
}, 60_000);
afterAll(() => rmSync(out, { recursive: true, force: true }));

const children: ChildProcess[] = [];
const servers: Server[] = [];
afterEach(() => {
  for (const child of children.splice(0)) child.kill();
  for (const server of servers.splice(0)) server.close();
});

/** Ein Ersatz für Cortex auf 127.0.0.1: bekommt jede Anfrage als Zeile samt Socket. */
async function fakeHost(onRequest: (request: any, socket: Socket) => void): Promise<number> {
  const server = createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl >= 0) onRequest(JSON.parse(buffer.slice(0, nl)), socket);
    });
    socket.on('error', () => {});
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
}

/** Startet ein Server-Skript wie eine CLI und liest seine Antworten Zeile für Zeile. */
function session(script: string, env: Record<string, string>) {
  const child = spawn(process.execPath, [script], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  children.push(child);
  const lines: any[] = [];
  const waiters: Array<() => void> = [];
  let buffer = '';
  child.stdout!.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      lines.push(JSON.parse(buffer.slice(0, nl)));
      buffer = buffer.slice(nl + 1);
      waiters.splice(0).forEach((wake) => wake());
    }
  });
  const write = (message: unknown) => child.stdin!.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`);
  const next = async (): Promise<any> => {
    while (!lines.length) await new Promise<void>((resolve) => waiters.push(resolve));
    return lines.shift();
  };
  let id = 0;
  const rpc = async (method: string, params?: object) => {
    const n = ++id;
    write({ jsonrpc: '2.0', id: n, method, ...(params ? { params } : {}) });
    const answer = await next();
    expect(answer.id).toBe(n);
    return answer;
  };
  return { write, next, rpc };
}

const permissionEnv = (port: number) => ({ CORTEX_PERMISSION_PORT: String(port), CORTEX_PERMISSION_TOKEN: 'geheim' });
const decision = (answer: any) => JSON.parse(answer.result.content[0].text);

describe('Genehmigungsserver (stdio)', () => {
  it('nennt eine feste Protokollversion, kennt kein ping und antwortet auch ohne id', async () => {
    const { rpc, write, next } = session(scripts.permission, permissionEnv(1));
    const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
    expect(init).toEqual({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cortex', version: '1.0.0' } } });
    const list = await rpc('tools/list');
    expect(list.result.tools.map((t: any) => t.name)).toEqual(['approve']);
    expect(list.result.tools[0].inputSchema.required).toEqual(['tool_name', 'input']);
    expect(await rpc('ping')).toEqual({ jsonrpc: '2.0', id: 3, error: { code: -32601, message: 'unknown method ping' } });
    // Leerzeilen, Unlesbares, Benachrichtigungen und unbekannte Methoden ohne id: keine Antwort.
    write('');
    write('{kaputt');
    write({ jsonrpc: '2.0', method: 'notifications/initialized' });
    write({ jsonrpc: '2.0', method: 'gibtsnicht' });
    write({ jsonrpc: '2.0', id: 9, method: 'notifications/initialized' });
    // initialize ohne id wird trotzdem beantwortet — nur eben ohne id.
    write({ jsonrpc: '2.0', method: 'initialize' });
    expect(await next()).toEqual({ jsonrpc: '2.0', result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'cortex', version: '1.0.0' } } });
    expect(await rpc('tools/list')).toMatchObject({ id: 4 });
  });

  it('reicht die Frage mit Token weiter und gibt die Entscheidung zurück — ohne auf den Werkzeugnamen zu achten', async () => {
    const asked: any[] = [];
    const port = await fakeHost((request, socket) => {
      asked.push(request);
      socket.write(JSON.stringify(request.toolName === 'Bash' ? { allow: true } : { allow: false, message: 'nein' }) + '\n');
    });
    const { rpc } = session(scripts.permission, permissionEnv(port));
    const allowed = await rpc('tools/call', { name: 'approve', arguments: { tool_name: 'Bash', input: { command: 'ls' }, tool_use_id: 't1' } });
    expect(allowed.result.content).toHaveLength(1);
    expect(decision(allowed)).toEqual({ behavior: 'allow', updatedInput: { command: 'ls' } });
    const denied = await rpc('tools/call', { name: 'irgendwas', arguments: { tool_name: 'Write', input: {} } });
    expect(decision(denied)).toEqual({ behavior: 'deny', message: 'nein' });
    expect(asked).toEqual([
      { token: 'geheim', toolName: 'Bash', input: { command: 'ls' }, toolUseId: 't1' },
      { token: 'geheim', toolName: 'Write', input: {} },
    ]);
  });

  it('lehnt ab, wenn die Antwort nicht ausdrücklich zustimmt', async () => {
    const answers = ['{"allow":"yes"}', '{"allow":false}', 'null', '{kaputt'];
    const port = await fakeHost((_request, socket) => socket.write(answers.shift() + '\n'));
    const { rpc } = session(scripts.permission, permissionEnv(port));
    const call = async () => decision(await rpc('tools/call', { arguments: { tool_name: 'Bash', input: {} } }));
    expect(await call()).toEqual({ behavior: 'deny', message: 'denied by the user' });
    expect(await call()).toEqual({ behavior: 'deny', message: 'denied by the user' });
    expect(await call()).toEqual({ behavior: 'deny', message: 'malformed decision' });
    expect(await call()).toEqual({ behavior: 'deny', message: 'malformed decision' });
  });

  it('lehnt ab, wenn Cortex auflegt, fehlt oder nicht erreichbar ist', async () => {
    const port = await fakeHost((_request, socket) => socket.end());
    const closed = session(scripts.permission, permissionEnv(port));
    expect(decision(await closed.rpc('tools/call', { arguments: { tool_name: 'Bash', input: {} } }))).toEqual({ behavior: 'deny', message: 'connection closed' });

    const unset = session(scripts.permission, { CORTEX_PERMISSION_PORT: '', CORTEX_PERMISSION_TOKEN: '' });
    expect(decision(await unset.rpc('tools/call', { arguments: { tool_name: 'Bash', input: {} } }))).toEqual({ behavior: 'deny', message: 'cortex is not reachable' });

    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const freePort = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const gone = session(scripts.permission, permissionEnv(freePort));
    expect(decision(await gone.rpc('tools/call', { arguments: { tool_name: 'Bash', input: {} } }))).toEqual({ behavior: 'deny', message: 'cortex is not reachable' });
  });
});

describe('Bausteine des stdio-Servers', () => {
  const base = { name: 'probe', tools: [{ name: 't' }], call: async (name: string, args: Record<string, unknown>) => ({ name, args }), unknownMethod: (m?: string) => `? ${m}` };

  it('handleMcpMessage: requireId und ping steuern, was beantwortet wird', async () => {
    const sent: unknown[] = [];
    const send = (message: Record<string, unknown>) => { sent.push(message); };
    const strict = { ...base, ping: true, requireId: true };
    await handleMcpMessage(strict, { jsonrpc: '2.0', method: 'initialize' }, send);
    await handleMcpMessage(strict, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 't', arguments: { a: 1 } } }, send);
    await handleMcpMessage(strict, { jsonrpc: '2.0', id: 2, method: 'ping' }, send);
    const loose = { ...base, protocolVersion: '2024-11-05', ping: false, requireId: false };
    await handleMcpMessage(loose, { jsonrpc: '2.0', method: 'initialize', params: { protocolVersion: 'x' } }, send);
    await handleMcpMessage(loose, { jsonrpc: '2.0', method: 'notifications/initialized' }, send);
    await handleMcpMessage(loose, { jsonrpc: '2.0', id: 3, method: 'ping' }, send);
    await handleMcpMessage(loose, { jsonrpc: '2.0', method: 'ping' }, send);
    expect(sent).toEqual([
      { id: 1, result: { name: 't', args: { a: 1 } } },
      { id: 2, result: {} },
      { id: undefined, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'probe', version: '1.0.0' } } },
      { id: 3, error: { code: -32601, message: '? ping' } },
    ]);
  });

  it('askLoopback: ohne closed wartet es bis zum Zeitdeckel, mit closed nicht', async () => {
    const port = await fakeHost((_request, socket) => socket.end());
    const ask = { port, token: 't', payload: { q: 1 }, timeoutMs: 300, unreachable: 'weg', timedOut: 'zu spät', malformed: 'kaputt', read: (v: unknown) => String(v) };
    const started = Date.now();
    expect(await askLoopback(ask)).toBe('zu spät');
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    expect(await askLoopback({ ...ask, closed: 'aufgelegt' })).toBe('aufgelegt');
    expect(await askLoopback({ ...ask, token: '' })).toBe('weg');
  });
});

describe('Zeichenflächen- und Suchserver (stdio)', () => {
  for (const [key, name, portVar, tokenVar] of [
    ['canvas', 'cortex_canvas', 'CORTEX_CANVAS_PORT', 'CORTEX_CANVAS_TOKEN'],
    ['websearch', 'cortex_websearch', 'CORTEX_WEBSEARCH_PORT', 'CORTEX_WEBSEARCH_TOKEN'],
    ['browser', 'cortex_browser', 'CORTEX_BROWSER_PORT', 'CORTEX_BROWSER_TOKEN'],
  ] as const) {
    it(`${name}: übernimmt die Protokollversion, beantwortet ping und überhört alles ohne id`, async () => {
      const { rpc, write } = session(scripts[key], { [portVar]: '1', [tokenVar]: 't' });
      expect(await rpc('initialize', { protocolVersion: '2099-01-01' })).toEqual({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2099-01-01', capabilities: { tools: {} }, serverInfo: { name, version: '1.0.0' } } });
      expect((await rpc('initialize')).result.protocolVersion).toBe('2025-06-18');
      expect(await rpc('ping')).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
      write({ jsonrpc: '2.0', method: 'initialize' });
      write({ jsonrpc: '2.0', method: 'notifications/initialized' });
      write('{kaputt');
      expect(await rpc('gibtsnicht')).toEqual({ jsonrpc: '2.0', id: 4, error: { code: -32601, message: 'Unbekannte Methode gibtsnicht' } });
      expect(await rpc('notifications/initialized')).toEqual({ jsonrpc: '2.0', id: 5, error: { code: -32601, message: 'Unbekannte Methode notifications/initialized' } });
      expect(await rpc('tools/call', { name: 'fremd', arguments: {} })).toEqual({ jsonrpc: '2.0', id: 6, result: { isError: true, content: [{ type: 'text', text: 'Unbekanntes Werkzeug fremd' }] } });
    });
  }

  it('cortex_canvas: gibt Token und Block weiter und meldet Unerreichbarkeit', async () => {
    const asked: any[] = [];
    const port = await fakeHost((request, socket) => { asked.push(request); socket.write(JSON.stringify({ text: 'leer' }) + '\n'); });
    const { rpc } = session(scripts.canvas, { CORTEX_CANVAS_PORT: String(port), CORTEX_CANVAS_TOKEN: 't' });
    expect((await rpc('tools/call', { name: 'canvas_draw', arguments: { block: { a: 1 } } })).result).toEqual({ content: [{ type: 'text', text: 'leer' }] });
    expect(asked).toEqual([{ token: 't', code: '{"a":1}' }]);
    const unset = session(scripts.canvas, { CORTEX_CANVAS_PORT: '', CORTEX_CANVAS_TOKEN: '' });
    expect((await unset.rpc('tools/call', { name: 'canvas_view', arguments: {} })).result).toEqual({ isError: true, content: [{ type: 'text', text: 'Cortex ist nicht erreichbar.' }] });
  });

  it('cortex_websearch: gibt Anfrage und Anzahl weiter und liest Unlesbares als Fehler', async () => {
    const asked: any[] = [];
    const port = await fakeHost((request, socket) => { asked.push(request); socket.write(asked.length === 1 ? '{"text":"Treffer"}\n' : '{kaputt\n'); });
    const { rpc } = session(scripts.websearch, { CORTEX_WEBSEARCH_PORT: String(port), CORTEX_WEBSEARCH_TOKEN: 't' });
    expect((await rpc('tools/call', { name: 'web_search', arguments: { query: ' exa ', max_results: 3 } })).result).toEqual({ content: [{ type: 'text', text: 'Treffer' }] });
    expect((await rpc('tools/call', { name: 'web_search', arguments: { query: 'x' } })).result).toEqual({ isError: true, content: [{ type: 'text', text: 'Antwort von Cortex unlesbar.' }] });
    expect((await rpc('tools/call', { name: 'web_search', arguments: { query: '  ' } })).result).toEqual({ isError: true, content: [{ type: 'text', text: 'Die Suchanfrage fehlt.' }] });
    expect(asked).toEqual([{ token: 't', query: 'exa', maxResults: 3 }, { token: 't', query: 'x' }]);
  });

  it('cortex_browser: bietet die Tab-Werkzeuge an, reicht Werkzeug und Argumente weiter und liefert Bilder als JPEG', async () => {
    const asked: any[] = [];
    const port = await fakeHost((request, socket) => {
      asked.push(request);
      socket.write(JSON.stringify(request.tool === 'browser_screenshot' ? { text: 'Tab a1', image: 'QUJD' } : request.tool === 'browser_click' ? { text: '', error: 'Tab a1 gehört dem Nutzer' } : { text: 'Tab a1 geladen' }) + '\n');
    });
    const { rpc } = session(scripts.browser, { CORTEX_BROWSER_PORT: String(port), CORTEX_BROWSER_TOKEN: 't' });
    const names = (await rpc('tools/list')).result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(['browser_open', 'browser_read', 'browser_screenshot', 'browser_tabs', 'browser_click', 'browser_type', 'browser_eval', 'browser_show', 'browser_close']);
    expect((await rpc('tools/call', { name: 'browser_open', arguments: { url: 'example.com' } })).result).toEqual({ content: [{ type: 'text', text: 'Tab a1 geladen' }] });
    expect((await rpc('tools/call', { name: 'browser_screenshot', arguments: { tabId: 'a1' } })).result).toEqual({ content: [{ type: 'image', data: 'QUJD', mimeType: 'image/jpeg' }, { type: 'text', text: 'Tab a1' }] });
    expect((await rpc('tools/call', { name: 'browser_click', arguments: { tabId: 'a1', ref: 3 } })).result).toEqual({ isError: true, content: [{ type: 'text', text: 'Tab a1 gehört dem Nutzer' }] });
    expect(asked).toEqual([
      { token: 't', tool: 'browser_open', args: { url: 'example.com' } },
      { token: 't', tool: 'browser_screenshot', args: { tabId: 'a1' } },
      { token: 't', tool: 'browser_click', args: { tabId: 'a1', ref: 3 } },
    ]);
  });
});
