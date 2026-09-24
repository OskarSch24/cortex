/**
 * Die Leitung zwischen dem Browser-MCP-Server (browserMcp.ts, von der CLI des
 * Modells gestartet) und dem eingebauten Browser: ein Loopback-Socket, je Chat
 * ein eigenes Token. Die Tabs selbst bedient die Desktop-App
 * (desktop/src/agentBrowser.ts) über den Befehl `_cortex.agentBrowser` — in
 * einem Host ohne eingebauten Browser gibt es ihn nicht, und die Werkzeuge
 * bleiben weg.
 */
import * as vscode from 'vscode';
import { LoopbackTokenServer, newSessionToken, nodeMcpServer, writeMcpConfig } from '../mcp/loopbackBridge.js';

export const BROWSER_COMMAND = '_cortex.agentBrowser';
export const BROWSER_SERVER_NAME = 'cortex_browser';

/** Lesen, ansehen, eigene Tabs öffnen und schließen — auch im Plan-Modus und ohne Rückfrage. */
export const BROWSER_READ_TOOLS = ['browser_open', 'browser_read', 'browser_screenshot', 'browser_tabs', 'browser_show', 'browser_close'] as const;
/** Handeln auf einer Seite: im Genehmigungsmodus fragt Cortex vorher, im Plan-Modus bleibt es aus. */
export const BROWSER_ACT_TOOLS = ['browser_click', 'browser_type', 'browser_eval'] as const;

export const claudeBrowserTool = (tool: string): string => `mcp__${BROWSER_SERVER_NAME}__${tool}`;

export interface BrowserAnswerForModel { text: string; image?: string; error?: string }

export class BrowserBridge extends LoopbackTokenServer {
  private readonly configs = new Map<string, string>();
  private present?: Promise<boolean>;
  private known = false;

  protected reply(conversationId: string, request: { tool?: unknown; args?: unknown }): Promise<BrowserAnswerForModel> {
    return Promise.resolve(vscode.commands.executeCommand<BrowserAnswerForModel>(BROWSER_COMMAND, conversationId, { tool: request.tool, args: request.args }))
      .then(answer => answer ?? { text: '', error: 'Der eingebaute Browser hat nicht geantwortet.' });
  }

  /** Hat dieser Host einen eingebauten Browser, den Agenten bedienen können? */
  available(): Promise<boolean> {
    this.present ??= Promise.resolve(vscode.commands.getCommands(true)).then(commands => (this.known = commands.includes(BROWSER_COMMAND)), () => false);
    return this.present;
  }

  /** Dasselbe ohne Warten, für den Brief; die erste Frage stößt die Prüfung an. */
  availableNow(): boolean {
    void this.available();
    return this.known;
  }

  /** Eine MCP-Konfiguration für Claude (`--mcp-config`), je Chat einmal angelegt. */
  claudeConfig(conversationId: string): string | undefined {
    if (!this.listening || !this.port) return undefined;
    let path = this.configs.get(conversationId);
    if (!path) {
      const token = newSessionToken();
      this.tokens.set(token, conversationId);
      path = writeMcpConfig('cortex-browser-', BROWSER_SERVER_NAME, nodeMcpServer(this.serverScript, { CORTEX_BROWSER_PORT: String(this.port), CORTEX_BROWSER_TOKEN: token }));
      this.configs.set(conversationId, path);
    }
    return path;
  }
}
