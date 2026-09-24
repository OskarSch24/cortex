/**
 * Die Host-Seite der kleinen MCP-Server (mcp/stdioServer.ts): ein Loopback-Socket
 * auf 127.0.0.1, je Chat ein eigenes Token, und die Angabe, wie die CLI den
 * Server startet. Das Token ist der Grund, warum kein anderer Prozess auf dem
 * Rechner für Cortex antworten kann.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Ein neues Sitzungstoken: 24 Zufallsbytes als Hex. */
export function newSessionToken(): string {
  return randomBytes(24).toString('hex');
}

export interface NodeMcpServer { command: string; args: string[]; env: Record<string, string> }

/** Ein Server-Skript, gestartet mit dem Node dieses Prozesses — auch aus Electron heraus. */
export function nodeMcpServer(serverScript: string, env: Record<string, string>): NodeMcpServer {
  return { command: process.execPath, args: [serverScript], env: { ...env, ELECTRON_RUN_AS_NODE: '1' } };
}

/**
 * Eine `--mcp-config`-Datei mit genau diesem Server, in einem eigenen
 * Temp-Ordner und nur für den Nutzer lesbar — das Token berührt nie den Arbeitsbereich.
 */
export function writeMcpConfig(prefix: string, name: string, server: NodeMcpServer): string {
  const path = join(mkdtempSync(join(tmpdir(), prefix)), 'mcp.json');
  writeFileSync(path, JSON.stringify({ mcpServers: { [name]: server } }), { mode: 0o600 });
  return path;
}

type Reply = object;

const isPromise = (value: unknown): value is Promise<Reply> => typeof (value as { then?: unknown } | null)?.then === 'function';

/**
 * Zeichenfläche und Websuche: eine Frage je Verbindung. Die erste Zeile ist
 * die Frage samt Token, die Antwort beendet die Verbindung. Ein unbekanntes
 * Token wird abgewiesen, ein Fehler der Antwort als `{ text: '', error }` gemeldet.
 */
export abstract class LoopbackTokenServer {
  private server?: Server;
  protected port = 0;
  /** Token → Chat. */
  protected readonly tokens = new Map<string, string>();

  constructor(protected readonly serverScript: string) {}

  /** Antwortet auf eine Frage aus einem bekannten Chat. Ein Ergebnis ohne Promise geht sofort hinaus. */
  protected abstract reply(conversationId: string, request: Record<string, unknown>): Reply | Promise<Reply>;

  protected get listening(): boolean {
    return !!this.server;
  }

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
        let request: { token?: string } = {};
        try { request = JSON.parse(line); } catch { /* unten abgewiesen */ }
        const conversationId = request.token ? this.tokens.get(request.token) : undefined;
        if (!conversationId) { socket.end(JSON.stringify({ text: '', error: 'Cortex kennt diese Sitzung nicht.' }) + '\n'); return; }
        const answer = this.reply(conversationId, request);
        if (!isPromise(answer)) { socket.end(JSON.stringify(answer) + '\n'); return; }
        answer
          .then(result => socket.end(JSON.stringify(result) + '\n'))
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

  dispose(): void {
    this.server?.close();
    this.server = undefined;
  }
}
