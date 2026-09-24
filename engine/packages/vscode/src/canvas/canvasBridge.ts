/**
 * Die Leitung zwischen dem Zeichenflächen-MCP-Server (canvasMcp.ts, von der
 * CLI des Modells gestartet) und Cortex: ein Loopback-Socket, je Chat ein
 * eigenes Token. Das Modell kann damit die Fläche *ansehen* (canvas_view)
 * und einen Block zeichnen und das Ergebnis sofort sehen (canvas_draw) — in
 * derselben Antwort, statt blind zu zeichnen.
 */
import { LoopbackTokenServer, newSessionToken, nodeMcpServer, writeMcpConfig } from '../mcp/loopbackBridge.js';

export interface CanvasAnswerForModel { png?: string; text: string; error?: string }
export type CanvasAsk = (conversationId: string, code: string | undefined) => Promise<CanvasAnswerForModel>;

export class CanvasBridge extends LoopbackTokenServer {
  private readonly configs = new Map<string, string>();

  constructor(serverScript: string, private readonly ask: CanvasAsk) {
    super(serverScript);
  }

  protected reply(conversationId: string, request: { code?: unknown }): Promise<CanvasAnswerForModel> {
    return this.ask(conversationId, typeof request.code === 'string' && request.code.trim() ? request.code : undefined);
  }

  /** Eine MCP-Konfiguration für Claude (`--mcp-config`), je Chat einmal angelegt. */
  claudeConfig(conversationId: string): string | undefined {
    if (!this.listening || !this.port) return undefined;
    let path = this.configs.get(conversationId);
    if (!path) {
      const token = newSessionToken();
      this.tokens.set(token, conversationId);
      path = writeMcpConfig('cortex-canvas-', 'cortex_canvas', nodeMcpServer(this.serverScript, { CORTEX_CANVAS_PORT: String(this.port), CORTEX_CANVAS_TOKEN: token }));
      this.configs.set(conversationId, path);
    }
    return path;
  }
}
