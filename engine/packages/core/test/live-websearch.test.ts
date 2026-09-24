import { existsSync, readdirSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import { GrokAdapter } from '../src/adapters/grok.js';
import type { ProviderAdapter } from '../src/adapters/adapter.js';
import type { ProviderId, ResolvedAccount } from '../src/types.js';

/**
 * Live-Prüfung „Exa Instant“ gegen die echten CLIs: lädt Claude, Codex und
 * Grok den Suchserver cortex_websearch, und rufen sie sein web_search auf?
 * Die Suche selbst ist hier ein Schein-Cortex auf Loopback (kein OpenRouter,
 * keine Suchkosten) — geprüft wird der Weg CLI → MCP-Server → Cortex → zurück.
 *
 * Läuft nur mit CORTEX_LIVE=1, braucht angemeldete Profile unter
 * ~/.cortex/profiles und den gebauten Server (vscode: node esbuild.mjs).
 */

const LIVE = process.env.CORTEX_LIVE === '1';
const only = process.env.CORTEX_LIVE_PROVIDER;
const PROFILES = join(homedir(), '.cortex', 'profiles');
const SCRIPT = join(__dirname, '..', '..', 'vscode', 'dist', 'websearchServer.js');
const TOKEN = 'live-websearch-token';

const profile = (provider: ProviderId): string | undefined =>
  existsSync(PROFILES) ? readdirSync(PROFILES).find(name => name.startsWith(`${provider}-`)) : undefined;
const account = (provider: ProviderId): ResolvedAccount => ({
  id: profile(provider) ?? provider, provider, label: 'personal', authMode: 'managed-home',
  homeDir: join(PROFILES, profile(provider) ?? provider), hasSecret: false, priority: 1,
});

const CASES: Array<{ provider: ProviderId; adapter: ProviderAdapter }> = [
  { provider: 'claude', adapter: new ClaudeAdapter() },
  { provider: 'codex', adapter: new CodexAdapter() },
  { provider: 'grok', adapter: new GrokAdapter() },
];

let server: Server;
let port = 0;
const queries: string[] = [];

beforeAll(async () => {
  if (!LIVE) return;
  server = createServer(socket => {
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      const request = JSON.parse(buffer.slice(0, nl)) as { token?: string; query?: string };
      if (request.token !== TOKEN) { socket.end(JSON.stringify({ text: '', error: 'fremdes Token' }) + '\n'); return; }
      queries.push(request.query ?? '');
      socket.end(JSON.stringify({ text: `1. Cortex Probe\n   https://probe.cortex.test/${encodeURIComponent(request.query ?? '')}\n   Probe result.` }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  port = (server.address() as { port: number }).port;
});
afterAll(() => server?.close());

describe.skipIf(!LIVE || !existsSync(SCRIPT))('Exa-Instant-Werkzeug in den echten CLIs', () => {
  for (const { provider, adapter } of CASES) {
    it.skipIf((only && only !== provider) || !profile(provider))(`${provider} ruft cortex_websearch.web_search auf`, async () => {
      const marker = `cortex probe ${provider}`;
      let text = '';
      const errors: string[] = [];
      for await (const event of adapter.run({
        prompt: `Call the web_search tool exactly once with the query "${marker}". Then reply with only the URL of the first result, nothing else.`,
        cwd: process.cwd(),
        permissionMode: 'safe',
        webSearch: { mode: 'exa-instant', server: { command: process.execPath, args: [SCRIPT], env: { CORTEX_WEBSEARCH_PORT: String(port), CORTEX_WEBSEARCH_TOKEN: TOKEN, ELECTRON_RUN_AS_NODE: '1' } } },
      }, account(provider), AbortSignal.timeout(240_000))) {
        if (process.env.CORTEX_LIVE_DEBUG) console.log(JSON.stringify(event).slice(0, 400));
        if (event.type === 'result') text = event.text;
        if (event.type === 'error') errors.push(event.message);
      }
      expect(errors).toEqual([]);
      expect(queries).toContain(marker);
      expect(text).toContain(`https://probe.cortex.test/${encodeURIComponent(marker)}`);
    }, 300_000);
  }
});
