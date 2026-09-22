/**
 * Die Leitung zwischen dem Zeichenflächen-MCP-Server (canvasMcp.ts, von der
 * CLI des Modells gestartet) und Cortex: ein Loopback-Socket, je Chat ein
 * eigenes Token. Das Modell kann damit die Fläche *ansehen* (canvas_view)
 * und einen Block zeichnen und das Ergebnis sofort sehen (canvas_draw) — in
 * derselben Antwort, statt blind zu zeichnen.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CanvasAnswerForModel { png?: string; text: string; error?: string }
export type CanvasAsk = (conversationId: string, code: string | undefined) => Promise<CanvasAnswerForModel>;

export class CanvasBridge {
  private server?: Server;
  private port = 0;
  private readonly tokens = new Map<string, string>();
  private readonly configs = new Map<string, string>();

  constructor(private readonly serverScript: string, private readonly ask: CanvasAsk) {}

  async start(): Promise<void> {
    if (this.server) return;
    const server = createServer(socket => {
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk.toString();
        const nl = buffer.indexOf('\n');
        if (nl < 0) return;
        const line = buffer.slice(0, nl);
        buffer = '';
        let request: { token?: string; code?: string } = {};
        try { request = JSON.parse(line); } catch { /* unten abgewiesen */ }
        const conversationId = request.token ? this.tokens.get(request.token) : undefined;
        if (!conversationId) { socket.end(JSON.stringify({ text: '', error: 'Cortex kennt diese Sitzung nicht.' }) + '\n'); return; }
        this.ask(conversationId, typeof request.code === 'string' && request.code.trim() ? request.code : undefined)
          .then(answer => socket.end(JSON.stringify(answer) + '\n'))
          .catch(e => socket.end(JSON.stringify({ text: '', error: (e as Error).message }) + '\n'));
      });
      socket.on('error', () => socket.destroy());
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    this.port = typeof address === 'object' && address ? address.port : 0;
    this.server = server;
  }

  /** Eine MCP-Konfiguration für Claude (`--mcp-config`), je Chat einmal angelegt. */
  claudeConfig(conversationId: string): string | undefined {
    if (!this.server || !this.port) return undefined;
    let path = this.configs.get(conversationId);
    if (!path) {
      const token = randomBytes(24).toString('hex');
      this.tokens.set(token, conversationId);
      path = join(mkdtempSync(join(tmpdir(), 'cortex-canvas-')), 'mcp.json');
      writeFileSync(path, JSON.stringify({ mcpServers: { cortex_canvas: {
        command: process.execPath, args: [this.serverScript],
        env: { CORTEX_CANVAS_PORT: String(this.port), CORTEX_CANVAS_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' },
      } } }), { mode: 0o600 });
      this.configs.set(conversationId, path);
    }
    return path;
  }

  dispose(): void {
    this.server?.close();
    this.server = undefined;
  }
}
