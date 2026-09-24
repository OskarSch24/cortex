import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OpenRouterAdapter } from '../src/adapters/openrouter.js';
import {
  CLAUDE_WEB_SEARCH_TOOL,
  SEARCH_RELAY_MODEL,
  acpWebSearchServers,
  citationsFrom,
  claudeWebSearch,
  codexWebSearch,
  formatSources,
  grokWebSearchArgs,
  openRouterExaSearch,
  openRouterSearchTools,
  supportsWebSearchChoice,
  withExtraMcpConfig,
  type WebSearchSetup,
} from '../src/adapters/webSearch.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';

const server = { command: '/app/node', args: ['/app/dist/websearchServer.js'], env: { CORTEX_WEBSEARCH_PORT: '4711', CORTEX_WEBSEARCH_TOKEN: 'tok', ELECTRON_RUN_AS_NODE: '1' } };
const exa: WebSearchSetup = { mode: 'exa-instant', server };
const off: WebSearchSetup = { mode: 'off' };
const standard: WebSearchSetup = { mode: 'standard' };

const citation = (url: string, title = 'T', content = 'excerpt') => ({ type: 'url_citation', url_citation: { url, title, content, start_index: 0, end_index: 1 } });

describe('Websuche je Anbieter', () => {
  it('lässt jeden Anbieter bei Standard unberührt', () => {
    expect(claudeWebSearch(standard).args).toEqual([]);
    expect(claudeWebSearch(undefined).args).toEqual([]);
    expect(codexWebSearch(standard)).toEqual({ args: [], env: {} });
    expect(grokWebSearchArgs(standard)).toEqual([]);
    expect(acpWebSearchServers(standard)).toEqual([]);
  });

  it('Claude: aus nimmt nur die eigene Suche weg', () => {
    const setup = claudeWebSearch(off);
    expect(setup.args).toEqual(['--disallowedTools', 'WebSearch']);
    expect(setup.configPath).toBeUndefined();
  });

  it('Claude: Exa schreibt eine private Konfiguration und gibt das Werkzeug frei', () => {
    const setup = claudeWebSearch(exa);
    try {
      expect(setup.args).toEqual(['--disallowedTools', 'WebSearch', '--allowedTools', CLAUDE_WEB_SEARCH_TOOL]);
      expect(CLAUDE_WEB_SEARCH_TOOL).toBe('mcp__cortex_websearch__web_search');
      const config = JSON.parse(readFileSync(setup.configPath!, 'utf8'));
      expect(config.mcpServers.cortex_websearch).toEqual({ type: 'stdio', ...server });
      expect(statSync(setup.configPath!).mode & 0o777).toBe(0o600);
    } finally {
      setup.dispose();
    }
    expect(existsSync(setup.configPath!)).toBe(false);
  });

  it('Claude: die Suchkonfiguration hängt am vorhandenen --mcp-config', () => {
    expect(withExtraMcpConfig(['-p', '--mcp-config', 'a.json', '--permission-prompt-tool', 'x'], 'b.json'))
      .toEqual(['-p', '--mcp-config', 'b.json', 'a.json', '--permission-prompt-tool', 'x']);
    expect(withExtraMcpConfig(['-p'], 'b.json')).toEqual(['-p', '--mcp-config', 'b.json']);
  });

  it('Claude: ohne Suchserver scheitert Exa laut statt still ohne Suche', () => {
    expect(() => claudeWebSearch({ mode: 'exa-instant' })).toThrow(/Suchserver/);
  });

  it('Codex: Token über die Umgebung, nie in den Argumenten', () => {
    const setup = codexWebSearch(exa);
    expect(setup.args).toEqual([
      '-c', 'web_search="disabled"',
      '-c', 'mcp_servers.cortex_websearch.command="/app/node"',
      '-c', 'mcp_servers.cortex_websearch.args=["/app/dist/websearchServer.js"]',
      '-c', 'mcp_servers.cortex_websearch.env={ELECTRON_RUN_AS_NODE="1"}',
      '-c', 'mcp_servers.cortex_websearch.env_vars=["CORTEX_WEBSEARCH_PORT","CORTEX_WEBSEARCH_TOKEN"]',
    ]);
    expect(setup.args.join(' ')).not.toContain('tok');
    // Der Electron-Schalter darf nicht in die Umgebung von Codex (und damit in jede Shell).
    expect(setup.env).toEqual({ CORTEX_WEBSEARCH_PORT: '4711', CORTEX_WEBSEARCH_TOKEN: 'tok' });
    expect(codexWebSearch(off)).toEqual({ args: ['-c', 'web_search="disabled"'], env: {} });
  });

  it('Grok: globales Flag und der Server im ACP-Format', () => {
    expect(grokWebSearchArgs(off)).toEqual(['--disable-web-search']);
    expect(grokWebSearchArgs(exa)).toEqual(['--disable-web-search']);
    expect(acpWebSearchServers(off)).toEqual([]);
    expect(acpWebSearchServers(exa)).toEqual([{
      name: 'cortex_websearch', command: '/app/node', args: ['/app/dist/websearchServer.js'],
      env: [{ name: 'CORTEX_WEBSEARCH_PORT', value: '4711' }, { name: 'CORTEX_WEBSEARCH_TOKEN', value: 'tok' }, { name: 'ELECTRON_RUN_AS_NODE', value: '1' }],
    }]);
  });

  it('OpenRouter: Server-Tool je Wahl', () => {
    expect(openRouterSearchTools(undefined)).toEqual([]);
    expect(openRouterSearchTools(off)).toEqual([]);
    expect(openRouterSearchTools(standard)).toEqual([{ type: 'openrouter:web_search' }]);
    expect(openRouterSearchTools({ mode: 'exa-instant' })).toEqual([{ type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'instant', max_results: 10, max_characters: 600 } }]);
  });

  it('Copilot hat keinen Schalter', () => {
    expect(supportsWebSearchChoice('copilot')).toBe(false);
    expect(['claude', 'codex', 'grok', 'openrouter'].every(p => supportsWebSearchChoice(p as never))).toBe(true);
  });
});

describe('Quellen aus den Anmerkungen', () => {
  it('nimmt nur url_citation mit http(s) und legt doppelte zusammen', () => {
    const results = citationsFrom([citation('https://a.de/x', 'A'), citation('https://a.de/x', 'A2'), { type: 'file' }, citation('javascript:alert(1)'), citation('http://b.de')]);
    expect(results).toEqual([{ url: 'https://a.de/x', title: 'A', content: 'excerpt' }, { url: 'http://b.de', title: 'T', content: 'excerpt' }]);
    expect(citationsFrom(undefined)).toEqual([]);
  });

  it('formatiert eine Markdown-Liste ohne kaputte Klammern', () => {
    expect(formatSources([])).toBe('');
    expect(formatSources([{ url: 'https://a.de', title: 'Titel [neu]' }])).toBe('\n\n**Quellen**\n- [Titel neu](https://a.de)');
  });
});

describe('Exa Instant über OpenRouter', () => {
  it('fragt das Relay-Modell mit Exa instant und liest die Treffer aus den Anmerkungen', async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok', annotations: [citation('https://exa.ai/a', 'Exa A')] } }], usage: { cost: 0.0071 } }), { status: 200 });
    }) as unknown as typeof fetch;
    const answer = await openRouterExaSearch('sk-or-test', 'Kaffeeröster Frankfurt', { maxResults: 40, fetchImpl });
    expect(answer).toEqual({ results: [{ url: 'https://exa.ai/a', title: 'Exa A', content: 'excerpt' }], costUsd: 0.0071 });
    expect(sent.model).toBe(SEARCH_RELAY_MODEL);
    expect(sent.max_tool_calls).toBe(1);
    expect(sent.tools).toEqual([{ type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'instant', max_results: 25, max_characters: 600 } }]);
    expect((sent.messages as Array<{ content: string }>)[1]!.content).toBe('Kaffeeröster Frankfurt');
  });

  it('meldet fehlendes Guthaben verständlich', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 })) as unknown as typeof fetch;
    await expect(openRouterExaSearch('k', 'q', { fetchImpl })).rejects.toThrow(/kein Guthaben/);
  });

  it('gibt andere Fehler mit Status und Meldung weiter', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'bad tool' } }), { status: 400 })) as unknown as typeof fetch;
    await expect(openRouterExaSearch('k', 'q', { fetchImpl })).rejects.toThrow('OpenRouter-Suche fehlgeschlagen (400): bad tool');
  });
});

describe('OpenRouter-Agent mit Websuche', () => {
  const account: ResolvedAccount = { id: 'or', provider: 'openrouter', label: 'or', authMode: 'api-key', hasSecret: true, priority: 9, secret: 'sk-or-test' };
  const sse = (chunks: unknown[]) => {
    const encoder = new TextEncoder();
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    }), { status: 200 });
  };

  it('schickt das Server-Tool mit und hängt die echten Quellen an die Antwort', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const adapter = new OpenRouterAdapter((async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return sse([
        { choices: [{ delta: { content: 'Gefunden: [a](https://a.de).' } }] },
        { choices: [{ delta: { annotations: [citation('https://a.de', 'A'), citation('https://b.de', 'B')] } }] },
      ]);
    }) as unknown as typeof fetch);
    const events: AdapterEvent[] = [];
    for await (const event of adapter.run({ prompt: 'suche', cwd: '/tmp', permissionMode: 'safe', model: 'deepseek/deepseek-v4-flash', webSearch: { mode: 'exa-instant' } }, account, new AbortController().signal)) events.push(event);
    expect(bodies[0]!.tools).toEqual(openRouterSearchTools({ mode: 'exa-instant' }));
    const result = events.find(event => event.type === 'result') as Extract<AdapterEvent, { type: 'result' }>;
    // a.de steht schon im Text, b.de kommt als Quelle dazu.
    expect(result.text).toBe('Gefunden: [a](https://a.de).\n\n**Quellen**\n- [B](https://b.de)');
  });

  it('ohne Websuche-Wahl bleibt die Anfrage wie bisher (Chat, Zweitmeinung)', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const adapter = new OpenRouterAdapter((async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return sse([{ choices: [{ delta: { content: 'hi' } }] }]);
    }) as unknown as typeof fetch);
    for await (const _ of adapter.run({ prompt: 'x', cwd: '/tmp', permissionMode: 'safe', model: 'deepseek/deepseek-v4-flash' }, account, new AbortController().signal)) { /* leeren */ }
    expect(bodies[0]!.tools).toBeUndefined();
  });
});
