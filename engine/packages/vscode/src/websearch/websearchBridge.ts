/**
 * Die Leitung zwischen dem Suchserver (websearchMcp.ts, von der CLI des
 * Agenten gestartet) und Cortex: ein Loopback-Socket, je Chat ein eigenes
 * Token. Der Schlüssel verlässt Cortex nie — die CLI und der Suchserver sehen
 * nur Port und Token, die Suche selbst führt Cortex aus.
 */
import type { WebSearchResult, WebSearchServer } from '@cortex/core';
import { LoopbackTokenServer, newSessionToken, nodeMcpServer } from '../mcp/loopbackBridge.js';

export type WebSearchRun = (conversationId: string, query: string, maxResults: number | undefined) => Promise<WebSearchResult[]>;

/** Die Treffer so, wie das Modell sie liest: nummeriert, URL in eigener Zeile. */
export function resultsForModel(query: string, results: WebSearchResult[]): string {
  if (!results.length) return `Keine Treffer für „${query}“.`;
  return results.map((result, index) => [
    `${index + 1}. ${result.title ?? result.url}`,
    `   ${result.url}`,
    ...(result.content ? [`   ${result.content.replace(/\s+/g, ' ').trim().slice(0, 600)}`] : []),
  ].join('\n')).join('\n\n');
}

export class WebSearchBridge extends LoopbackTokenServer {
  private readonly byConversation = new Map<string, string>();

  constructor(serverScript: string, private readonly search: WebSearchRun) {
    super(serverScript);
  }

  protected reply(conversationId: string, request: { query?: unknown; maxResults?: unknown }): { text: string; error?: string } | Promise<{ text: string }> {
    const query = typeof request.query === 'string' ? request.query.trim() : '';
    if (!query) return { text: '', error: 'Die Suchanfrage fehlt.' };
    return this.search(conversationId, query, typeof request.maxResults === 'number' ? request.maxResults : undefined)
      .then(results => ({ text: resultsForModel(query, results) }));
  }

  /** Wie die CLI den Suchserver für diesen Chat startet. */
  async serverFor(conversationId: string): Promise<WebSearchServer> {
    await this.start();
    if (!this.port) throw new Error('Die Exa-Suche konnte nicht gestartet werden.');
    let token = this.byConversation.get(conversationId);
    if (!token) {
      token = newSessionToken();
      this.tokens.set(token, conversationId);
      this.byConversation.set(conversationId, token);
    }
    return nodeMcpServer(this.serverScript, { CORTEX_WEBSEARCH_PORT: String(this.port), CORTEX_WEBSEARCH_TOKEN: token });
  }
}
