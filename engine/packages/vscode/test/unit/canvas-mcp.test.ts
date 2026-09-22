import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CanvasBridge } from '../../src/canvas/canvasBridge.js';

const SCRIPT = join(__dirname, '../../dist/canvasServer.js');

/** Startet den MCP-Server wie eine CLI es täte und spricht JSON-RPC mit ihm. */
async function session(config: string) {
  const env = (JSON.parse(readFileSync(config, 'utf8')) as { mcpServers: { cortex_canvas: { env: Record<string, string> } } }).mcpServers.cortex_canvas.env;
  const child = spawn(process.execPath, [SCRIPT], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map<number, (v: any) => void>();
  let buf = '';
  child.stdout.on('data', d => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); waiting.get(m.id)?.(m); }
  });
  let id = 0;
  const rpc = (method: string, params: object = {}) => new Promise<any>(res => { const n = ++id; waiting.set(n, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); });
  return { rpc, close: () => child.kill() };
}

describe('Zeichenfläche als Werkzeug (MCP)', () => {
  it('gibt dem Modell ein Bild der Fläche und zeichnet auf Anfrage', async () => {
    const asked: Array<{ id: string; code?: string }> = [];
    const bridge = new CanvasBridge(SCRIPT, async (id, code) => { asked.push({ id, code }); return { png: 'data:image/png;base64,iVBORw0KGgo=', text: '- r1 rectangle "Frage"' }; });
    await bridge.start();
    const config = bridge.claudeConfig('chat-1')!;
    const { rpc, close } = await session(config);
    try {
      const init = await rpc('initialize', { protocolVersion: '2025-06-18' });
      expect(init.result.serverInfo.name).toBe('cortex_canvas');
      const tools = (await rpc('tools/list')).result.tools.map((t: any) => t.name);
      expect(tools).toEqual(['canvas_view', 'canvas_draw']);
      const view = (await rpc('tools/call', { name: 'canvas_view', arguments: {} })).result;
      expect(view.content[0]).toEqual({ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' });
      expect(view.content[1].text).toContain('r1 rectangle');
      await rpc('tools/call', { name: 'canvas_draw', arguments: { block: { layout: 'mindmap', root: { label: 'A' } } } });
      expect(asked).toEqual([{ id: 'chat-1', code: undefined }, { id: 'chat-1', code: '{"layout":"mindmap","root":{"label":"A"}}' }]);
    } finally { close(); bridge.dispose(); }
  });

  it('meldet einen Fehler, statt ein leeres Bild als Erfolg auszugeben', async () => {
    const bridge = new CanvasBridge(SCRIPT, async () => ({ text: '', error: 'Das Cortex-Fenster ist nicht offen.' }));
    await bridge.start();
    const { rpc, close } = await session(bridge.claudeConfig('chat-2')!);
    try {
      await rpc('initialize');
      const r = (await rpc('tools/call', { name: 'canvas_view', arguments: {} })).result;
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('nicht offen');
    } finally { close(); bridge.dispose(); }
  });
});
