import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  authParam,
  authorizationHeader,
  buildAuthorizationUrl,
  createPkce,
  discoverOAuth,
  exchangeCode,
  expiresWithin,
  listenForCallback,
  refreshTokens,
  registerClient,
} from '../src/mcp/oauth.js';
import { isSseUrl, probeServer } from '../src/mcp/probe.js';
import { syncMcpToProfile } from '../src/mcp/mcpSync.js';
import { parseCatalog, type PluginEntry } from '../src/plugins/catalog.js';
import { pluginState, pluginStatus, withCredentials } from '../src/plugins/installed.js';
import type { AccountProfile } from '../src/types.js';

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

async function serve(handler: (req: IncomingMessage, res: ServerResponse, body: string) => void): Promise<string> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, res, body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
}

const TOOLS = [
  { name: 'suche', description: 'Findet Dinge. Und noch viel mehr Text danach.' },
  { name: 'schreibe', title: 'Schreiben' },
];

/** Ein kleiner MCP-Server über stdio, als Node-Skript. */
function stdioServer(behaviour: 'ok' | 'crash' | 'silent' | 'noisy' = 'ok'): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-probe-'));
  const file = join(dir, 'server.cjs');
  writeFileSync(
    file,
    `
const behaviour = ${JSON.stringify(behaviour)};
if (behaviour === 'crash') { console.error('Fehlt: TOKEN'); process.exit(3); }
if (behaviour === 'noisy') console.log('Willkommen beim Server!');
const tools = ${JSON.stringify(TOOLS)};
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\\n')) !== -1) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const m = JSON.parse(line);
    if (behaviour === 'silent') continue;
    if (m.method === 'initialize') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 'srv', method: 'roots/list' }) + '\\n');
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'probe', version: '1.2.3', env: process.env.PROBE_KEY } } }) + '\\n');
    }
    if (m.method === 'tools/list') {
      const page = m.params && m.params.cursor ? 1 : 0;
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { tools: [tools[page]], ...(page === 0 ? { nextCursor: 'weiter' } : {}) } }) + '\\n');
    }
  }
});
`,
  );
  return file;
}

describe('Verbindungsprüfung — lokal', () => {
  it('liest Server und alle Werkzeugseiten', async () => {
    const result = await probeServer({ command: process.execPath, args: [stdioServer()] }, { timeoutMs: 10_000 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.server).toMatchObject({ name: 'probe', version: '1.2.3' });
    expect(result.tools.map((t) => t.name)).toEqual(['suche', 'schreibe']);
    // Nur der erste Satz — Werkzeugbeschreibungen sind oft ganze Handbücher.
    expect(result.tools[0]?.description).toBe('Findet Dinge.');
  });

  it('übersteht Begrüßungstext auf stdout', async () => {
    const result = await probeServer({ command: process.execPath, args: [stdioServer('noisy')] }, { timeoutMs: 10_000 });
    expect(result.ok).toBe(true);
  });

  it('meldet einen abstürzenden Server mit seinem stderr', async () => {
    const result = await probeServer({ command: process.execPath, args: [stdioServer('crash')] }, { timeoutMs: 10_000 });
    expect(result).toMatchObject({ ok: false, reason: 'start' });
    if (result.ok) return;
    expect(result.message).toContain('Code 3');
    expect(result.detail).toContain('Fehlt: TOKEN');
  });

  it('meldet ein fehlendes Programm', async () => {
    const result = await probeServer({ command: 'gibt-es-sicher-nicht-12345' });
    expect(result).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('gibt nach der Zeit auf', async () => {
    const result = await probeServer({ command: process.execPath, args: [stdioServer('silent')] }, { timeoutMs: 400 });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
  });
});

describe('Verbindungsprüfung — entfernt', () => {
  const rpc = (res: ServerResponse, body: unknown, sse = false, extra: Record<string, string> = {}) => {
    if (sse) {
      res.writeHead(200, { 'content-type': 'text/event-stream', ...extra });
      res.write(': ping\n\n');
      res.end(`event: message\ndata: ${JSON.stringify(body)}\n\n`);
    } else {
      res.writeHead(200, { 'content-type': 'application/json', ...extra });
      res.end(JSON.stringify(body));
    }
  };

  it('spricht Streamable HTTP mit Sitzung, JSON und SSE-Antworten', async () => {
    const seen: Array<Record<string, string | string[] | undefined>> = [];
    const base = await serve((req, res, body) => {
      seen.push(req.headers);
      if (req.method === 'DELETE') return void res.writeHead(204).end();
      const message = JSON.parse(body);
      if (message.method === 'initialize') {
        return rpc(res, { jsonrpc: '2.0', id: message.id, result: { serverInfo: { name: 'fern' } } }, false, { 'mcp-session-id': 'abc' });
      }
      if (message.method === 'notifications/initialized') return void res.writeHead(202).end();
      if (message.method === 'tools/list') return rpc(res, { jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } }, true);
    });
    const result = await probeServer({ url: `${base}/mcp` }, { headers: { Authorization: 'Bearer t' } });
    expect(result).toMatchObject({ ok: true, server: { name: 'fern' } });
    // Die Sitzung und der Token gehen mit jeder Anfrage nach der ersten.
    expect(seen[1]?.['mcp-session-id']).toBe('abc');
    expect(seen.every((h) => h.authorization === 'Bearer t')).toBe(true);
  });

  it('erkennt eine verlangte Anmeldung und reicht WWW-Authenticate weiter', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(401, { 'www-authenticate': 'Bearer resource_metadata="https://x/.well-known/oauth-protected-resource"' });
      res.end();
    });
    const result = await probeServer({ url: `${base}/mcp` });
    expect(result).toMatchObject({ ok: false, reason: 'auth' });
    if (result.ok) return;
    expect(authParam(result.wwwAuthenticate, 'resource_metadata')).toBe('https://x/.well-known/oauth-protected-resource');
  });

  it('meldet einen nicht erreichbaren Server als Netzwerkfehler', async () => {
    const result = await probeServer({ url: 'http://127.0.0.1:1/mcp' }, { timeoutMs: 3_000 });
    expect(result).toMatchObject({ ok: false, reason: 'network' });
  });

  it('spricht das ältere SSE-Protokoll', async () => {
    let stream: ServerResponse | undefined;
    const base = await serve((req, res, body) => {
      if (req.method === 'GET') {
        stream = res;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('event: endpoint\ndata: /messages?session=1\n\n');
        return;
      }
      const message = JSON.parse(body);
      res.writeHead(202).end();
      const reply = (result: unknown) =>
        stream?.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`);
      if (message.method === 'initialize') reply({ serverInfo: { name: 'alt' } });
      if (message.method === 'tools/list') reply({ tools: TOOLS });
    });
    expect(isSseUrl(`${base}/sse`)).toBe(true);
    const result = await probeServer({ url: `${base}/sse` });
    expect(result).toMatchObject({ ok: true, server: { name: 'alt' } });
    if (result.ok) expect(result.tools).toHaveLength(2);
  });
});

describe('Anmeldung nach MCP-Spezifikation', () => {
  it('entdeckt, registriert, tauscht und frischt auf', async () => {
    const calls: string[] = [];
    let base = '';
    base = await serve((req, res, body) => {
      const url = new URL(req.url!, base);
      calls.push(`${req.method} ${url.pathname}`);
      const json = (status: number, value: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
        return json(200, { resource: `${base}/mcp`, authorization_servers: [`${base}/auth`], scopes_supported: ['lesen'] });
      }
      if (url.pathname === '/.well-known/oauth-authorization-server/auth') {
        return json(200, {
          issuer: `${base}/auth`,
          authorization_endpoint: `${base}/auth/authorize`,
          token_endpoint: `${base}/auth/token`,
          registration_endpoint: `${base}/auth/register`,
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url.pathname === '/auth/register') {
        const request = JSON.parse(body);
        expect(request.token_endpoint_auth_method).toBe('none');
        return json(201, { client_id: 'cortex-1', redirect_uris: request.redirect_uris });
      }
      if (url.pathname === '/auth/token') {
        const form = new URLSearchParams(body);
        expect(form.get('resource')).toBe(`${base}/mcp`);
        expect(form.get('client_id')).toBe('cortex-1');
        if (form.get('grant_type') === 'authorization_code') {
          expect(form.get('code')).toBe('der-code');
          expect(form.get('code_verifier')).toBeTruthy();
          return json(200, { access_token: 'a1', token_type: 'bearer', refresh_token: 'r1', expires_in: 3600 });
        }
        if (form.get('refresh_token') === 'r1') return json(200, { access_token: 'a2', token_type: 'Bearer', expires_in: 60 });
        return json(400, { error: 'invalid_grant' });
      }
      json(404, {});
    });

    // Der Server nennt seine Metadaten nicht im Kopf — dann gilt der Pfad.
    const endpoints = await discoverOAuth(`${base}/mcp`, 'Bearer realm="x"');
    expect(endpoints).toMatchObject({
      resource: `${base}/mcp`,
      authorizationEndpoint: `${base}/auth/authorize`,
      registrationEndpoint: `${base}/auth/register`,
      scope: 'lesen',
    });

    const client = await registerClient(endpoints, 'http://127.0.0.1:5555/callback');
    expect(client).toMatchObject({ clientId: 'cortex-1', authMethod: 'none' });

    const pkce = createPkce();
    const authorize = new URL(buildAuthorizationUrl(endpoints, client, pkce, 'zustand'));
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('resource')).toBe(`${base}/mcp`);
    expect(authorize.searchParams.get('state')).toBe('zustand');
    // Leerzeichen als %20 — ein „+“ würde beim Öffnen durch VS Code zu %2B.
    const spaced = buildAuthorizationUrl({ ...endpoints, scope: 'a b' }, client, pkce, 'z');
    expect(spaced).toContain('scope=a%20b');
    expect(spaced).not.toContain('+');

    const tokens = await exchangeCode(endpoints, client, 'der-code', pkce.verifier);
    expect(authorizationHeader(tokens)).toBe('Bearer a1');
    expect(expiresWithin(tokens, 10 * 60_000)).toBe(false);

    const stored = { endpoints, client, tokens, connectedAt: Date.now() };
    const fresh = await refreshTokens(stored);
    expect(fresh.accessToken).toBe('a2');
    // Kein neuer Refresh-Token heißt: der alte gilt weiter.
    expect(fresh.refreshToken).toBe('r1');
    expect(expiresWithin(fresh, 10 * 60_000)).toBe(true);

    await expect(refreshTokens({ ...stored, tokens: { ...tokens, refreshToken: 'falsch' } })).rejects.toMatchObject({
      code: 'invalid_grant',
    });
  });

  it('sagt ehrlich, wenn ein Anbieter keine Selbstregistrierung erlaubt', async () => {
    await expect(
      registerClient(
        { resource: 'x', issuer: 'x', authorizationEndpoint: 'x', tokenEndpoint: 'x' },
        'http://127.0.0.1/callback',
      ),
    ).rejects.toMatchObject({ code: 'registration_unsupported' });
  });

  it('unterscheidet einen Anbieter, der nur freigegebene Programme registriert', async () => {
    const forbidden = (async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch;
    await expect(
      registerClient(
        { resource: 'x', issuer: 'x', authorizationEndpoint: 'x', tokenEndpoint: 'x', registrationEndpoint: 'https://api.figma.com/v1/oauth/mcp/register' },
        'http://127.0.0.1/callback',
        forbidden,
      ),
    ).rejects.toMatchObject({ code: 'registration_forbidden' });
  });

  it('nimmt nur den Rückruf mit dem richtigen state an', async () => {
    const listener = await listenForCallback('richtig', { timeoutMs: 5_000 });
    expect(listener.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const wrong = await fetch(`${listener.redirectUri}?state=falsch&code=boese`);
    expect(await wrong.text()).toContain('Unbekannte Anmeldung');
    await fetch(`${listener.redirectUri}?state=richtig&code=gut`);
    await expect(listener.code).resolves.toBe('gut');
  });

  it('bricht ab, wenn der Anbieter ablehnt', async () => {
    const listener = await listenForCallback('s', { timeoutMs: 5_000 });
    await fetch(`${listener.redirectUri}?state=s&error=access_denied`);
    await expect(listener.code).rejects.toThrow('abgelehnt');
  });
});

describe('Zugangsdaten in den Profilen', () => {
  const profile = (provider: AccountProfile['provider']): AccountProfile => ({
    id: provider,
    provider,
    label: provider,
    authMode: 'managed-home',
    homeDir: mkdtempSync(join(tmpdir(), `cortex-${provider}-`)),
  } as AccountProfile);

  const remote = withCredentials({ url: 'https://mcp.example.com/mcp' }, {}, 'Bearer geheim');
  const old = withCredentials({ url: 'https://mcp.example.com/sse' }, {}, 'Bearer alt');

  it('gibt Claude den Header und bei /sse den richtigen Typ', () => {
    const account = profile('claude');
    expect(syncMcpToProfile(account, { neu: remote, alt: old })).toBeUndefined();
    const doc = JSON.parse(readFileSync(join(account.homeDir!, '.claude.json'), 'utf8'));
    expect(doc.mcpServers.neu).toEqual({ type: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer geheim' } });
    expect(doc.mcpServers.alt.type).toBe('sse');
  });

  it('gibt Codex http_headers und führt /sse über mcp-remote, ohne Token in den Argumenten', () => {
    const account = profile('codex');
    syncMcpToProfile(account, { neu: remote, alt: old });
    const toml = readFileSync(join(account.homeDir!, 'config.toml'), 'utf8');
    expect(toml).toContain('[mcp_servers.neu.http_headers]\nAuthorization = "Bearer geheim"');
    expect(toml).toContain('"mcp-remote", "https://mcp.example.com/sse", "--transport", "sse-only", "--header", "Authorization:${CORTEX_MCP_HEADER_0}"');
    expect(toml).toContain('CORTEX_MCP_HEADER_0 = "Bearer alt"');
  });

  it('gibt Grok die URL selbst — kein mcp-remote, das von sich aus einen Browser öffnet', () => {
    const account = profile('grok');
    syncMcpToProfile(account, { neu: remote, alt: old });
    const toml = readFileSync(join(account.homeDir!, '.grok', 'config.toml'), 'utf8');
    expect(toml).not.toContain('mcp-remote');
    expect(toml).toContain('[mcp_servers.neu.headers]\nAuthorization = "Bearer geheim"');
    expect(toml).toContain('url = "https://mcp.example.com/sse"\ntype = "sse"');
  });

  it('setzt Werte als Umgebung und in Argumente ein', () => {
    const def = withCredentials(
      { command: 'npx', args: ['-y', 'server-postgres', '${POSTGRES_URL}'], env: { POSTGRES_URL: '' } },
      { POSTGRES_URL: 'postgresql://db' },
    );
    expect(def.args).toEqual(['-y', 'server-postgres', 'postgresql://db']);
    expect(def.env).toEqual({ POSTGRES_URL: 'postgresql://db' });
    // Ein von Hand in mcp.json eingetragener Wert füllt den Platzhalter ebenso.
    expect(withCredentials({ command: 'x', args: ['${A}'], env: { A: 'von-hand' } }, {}).args).toEqual(['von-hand']);
    // Ohne Werte bleibt die Definition, wie sie ist — auch ein unbekannter Platzhalter.
    expect(withCredentials({ command: 'x', args: ['${NICHT}'] }, {})).toEqual({ command: 'x', args: ['${NICHT}'] });
  });
});

describe('Ein Zustand je Zeile', () => {
  const base = (over: Partial<PluginEntry> = {}): PluginEntry => ({
    id: 'p', name: 'P', tagline: 't', description: 'd', category: 'daten', developer: 'x', server: 'p',
    definition: { command: 'npx' }, prompts: [], ...over,
  });
  const installed = { p: { command: 'npx' } };

  it('liest Felder aus dem Katalog und die Kurzform mit env', () => {
    const parsed = parseCatalog(JSON.stringify({ entries: [
      { ...base(), id: 'a', server: 'a', requires: { kind: 'secret', hint: 'h', fields: [
        { env: 'AWS_ACCESS_KEY_ID', label: 'Zugriffsschlüssel' },
        { env: 'AWS_REGION', label: 'Region', secret: false, placeholder: 'eu-central-1' },
        { env: 'kaputt name', label: 'x' },
      ] } },
      { ...base(), id: 'b', server: 'b', requires: { kind: 'secret', env: 'EXA_API_KEY', hint: 'h' } },
    ] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const [a, b] = parsed.catalog.entries;
    expect(a?.requires?.fields?.map((f) => [f.env, f.secret])).toEqual([['AWS_ACCESS_KEY_ID', true], ['AWS_REGION', false]]);
    expect(a?.requires?.env).toBe('AWS_ACCESS_KEY_ID');
    expect(b?.requires?.fields).toEqual([{ env: 'EXA_API_KEY', label: 'API-Schlüssel', secret: true }]);
  });

  it('zeigt „Verbunden“ nur nach einer erfolgreichen Prüfung', () => {
    const entry = base();
    expect(pluginStatus(entry, pluginState(entry, {}, new Set())).kind).toBe('frei');
    // Kein Ergebnis ist kein laufendes: sonst dreht sich die Anzeige endlos.
    expect(pluginStatus(entry, pluginState(entry, installed, new Set())).kind).toBe('ungeprueft');
    expect(
      pluginStatus(entry, pluginState(entry, installed, new Set(), {}, {}, { connections: { p: { status: 'pruefe' } } })).kind,
    ).toBe('pruefe');
    const ok = pluginState(entry, installed, new Set(), {}, {}, {
      connections: { p: { status: 'verbunden', tools: [{ name: 'a' }, { name: 'b' }] } },
    });
    expect(pluginStatus(entry, ok)).toEqual({ kind: 'verbunden', label: 'Verbunden', tools: 2 });
    const bad = pluginState(entry, installed, new Set(), {}, {}, {
      connections: { p: { status: 'fehler', message: 'Kaputt.' } },
    });
    expect(pluginStatus(entry, bad)).toMatchObject({ kind: 'fehler', message: 'Kaputt.' });
  });

  it('stellt eine offene Voraussetzung über ein altes Prüfergebnis', () => {
    const entry = base({ requires: { kind: 'secret', env: 'KEY', fields: [{ env: 'KEY', label: 'K', secret: true }], hint: 'h' } });
    const connections = { p: { status: 'verbunden' as const, tools: [] } };
    expect(pluginStatus(entry, pluginState(entry, installed, new Set(), {}, {}, { connections }))).toMatchObject({
      kind: 'einrichtung',
      reason: 'schluessel',
    });
    // Der Wert liegt im Schlüsselbund — nur der Name kommt über die Leitung.
    const withKey = pluginState(entry, installed, new Set(), {}, {}, { connections, credentials: { p: { fields: ['KEY'] } } });
    expect(withKey.missing).toEqual([]);
    expect(withKey.provided).toEqual(['KEY']);
    expect(pluginStatus(entry, withKey).kind).toBe('verbunden');
  });

  it('verlangt für Anmelde-Plugins eine gehaltene Anmeldung', () => {
    const entry = base({ requires: { kind: 'oauth', hint: 'h' }, definition: { url: 'https://x/mcp' } });
    const remote = { p: { url: 'https://x/mcp' } };
    expect(pluginStatus(entry, pluginState(entry, remote, new Set()))).toMatchObject({ kind: 'einrichtung', reason: 'anmeldung', label: 'Anmelden' });
    const expired = pluginState(entry, remote, new Set(), {}, {}, {
      credentials: { p: { fields: [], oauth: { connectedAt: 1, refreshable: true, expired: true } } },
    });
    expect(pluginStatus(entry, expired)).toMatchObject({ label: 'Neu anmelden' });
    const rejected = pluginState(entry, remote, new Set(), {}, {}, {
      credentials: { p: { fields: [], oauth: { connectedAt: 1, refreshable: true } } },
      connections: { p: { status: 'anmeldung' } },
    });
    expect(pluginStatus(entry, rejected)).toMatchObject({ kind: 'einrichtung', label: 'Neu anmelden' });
  });
});

describe('Eigener OAuth-Client', async () => {
  const { parseClientJson, clientFromFields, googleClientJson, googleTokenJson, maskClientId, ownClientRedirect } = await import(
    '../src/mcp/oauthClient.js'
  );
  const googleFile = (section: 'installed' | 'web') =>
    JSON.stringify({
      [section]: {
        client_id: '492409157416-abcdefghijklmnop.apps.googleusercontent.com',
        project_id: 'mein-projekt',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        client_secret: 'GOCSPX-geheim',
        redirect_uris: ['http://localhost'],
      },
    });

  it('liest Googles Desktop- und Web-Datei', () => {
    for (const section of ['installed', 'web'] as const) {
      const parsed = parseClientJson(googleFile(section));
      expect(parsed).toMatchObject({
        ok: true,
        client: { kind: section, clientSecret: 'GOCSPX-geheim', projectId: 'mein-projekt', tokenEndpoint: 'https://oauth2.googleapis.com/token' },
      });
    }
    expect(parseClientJson(JSON.stringify({ client_id: 'abc', client_secret: 's' }))).toMatchObject({ ok: true, client: { kind: 'plain' } });
  });

  it('sagt, was falsch ist, statt still nichts zu tun', () => {
    expect(parseClientJson('{kaputt')).toMatchObject({ ok: false, error: expect.stringContaining('kein gültiges JSON') });
    expect(parseClientJson(JSON.stringify({ type: 'service_account', client_email: 'x' }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Dienstkontos'),
    });
    expect(parseClientJson(JSON.stringify({ installed: { client_secret: 'x' } }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('„installed“'),
    });
    expect(clientFromFields('  ', 'x')).toMatchObject({ ok: false });
    expect(clientFromFields('abc def', 'x')).toMatchObject({ ok: false, error: expect.stringContaining('Leerzeichen') });
    expect(clientFromFields(' abc ', ' s ')).toEqual({ ok: true, client: { clientId: 'abc', clientSecret: 's', kind: 'plain' } });
  });

  it('schreibt die Dateien so, wie google-auth-library sie liest', () => {
    const parsed = clientFromFields('1-x.apps.googleusercontent.com', 'geheim');
    if (!parsed.ok) throw new Error();
    const client = JSON.parse(googleClientJson(parsed.client));
    expect(client.installed).toMatchObject({ client_id: '1-x.apps.googleusercontent.com', client_secret: 'geheim', redirect_uris: ['http://localhost'] });
    const token = JSON.parse(googleTokenJson({ accessToken: 'a', refreshToken: 'r', expiresAt: 5, tokenType: 'bearer', scope: 's' }));
    expect(token).toEqual({ access_token: 'a', refresh_token: 'r', scope: 's', token_type: 'Bearer', expiry_date: 5 });
  });

  it('zeigt eine Client-ID nur so weit, dass man sie wiedererkennt', () => {
    expect(maskClientId('492409157416-89serkdn1o45rvco6rjc2qc4idusds61.apps.googleusercontent.com')).toBe('4924…ds61.apps.googleusercontent.com');
    expect(ownClientRedirect('localhost')).toBe('http://localhost:38127/callback');
  });

  it('schickt Google kein resource, aber access_type und prompt', () => {
    const url = new URL(
      buildAuthorizationUrl(
        {
          issuer: 'g',
          authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenEndpoint: 'https://oauth2.googleapis.com/token',
          scope: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
          extraAuthParams: { access_type: 'offline', prompt: 'consent' },
        },
        { clientId: 'c', authMethod: 'client_secret_post', redirectUri: 'http://127.0.0.1:38127/callback' },
        createPkce(),
        's',
      ),
    );
    expect(url.searchParams.has('resource')).toBe(false);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')?.split(' ')).toHaveLength(2);
  });

  it('lauscht auf dem festen Port und nennt den gewünschten Namen', async () => {
    const listener = await listenForCallback('s', { port: 38199, redirectHost: 'localhost', timeoutMs: 3_000 });
    expect(listener.redirectUri).toBe('http://localhost:38199/callback');
    // Ein zweiter auf demselben Port bekommt einen verständlichen Fehler.
    await expect(listenForCallback('t', { port: 38199 })).rejects.toMatchObject({ code: 'port_in_use' });
    listener.close();
  });
});

describe('Katalog: eigener OAuth-Client', () => {
  it('liest Anbieter, Berechtigungen und Übergabe — und verwirft Unbekanntes', () => {
    const base = { name: 'X', tagline: 't', description: 'd', category: 'daten', developer: 'x', definition: { command: 'npx' }, prompts: [] };
    const parsed = parseCatalog(JSON.stringify({ entries: [
      { ...base, id: 'yt', server: 'yt', requires: { kind: 'oauth-client', hint: 'h', client: {
        provider: 'google', scopes: ['a', 'b'], clientFile: 'YT_CLIENT', tokenFile: 'YT_TOKEN', accessTokenEnv: 'kaputt name',
      } } },
      { ...base, id: 'fremd', server: 'fremd', requires: { kind: 'oauth-client', hint: 'h', client: { provider: 'gibtsnicht' } } },
      { ...base, id: 'hub', server: 'hub', definition: { url: 'https://x' }, requires: { kind: 'oauth-client', hint: 'h', client: { redirectHost: 'localhost' } } },
    ] }));
    if (!parsed.ok) throw new Error(parsed.error);
    const [yt, fremd, hub] = parsed.catalog.entries;
    expect(yt?.requires?.client).toMatchObject({ provider: 'google', scopes: ['a', 'b'], clientFile: 'YT_CLIENT', tokenFile: 'YT_TOKEN', accessTokenEnv: undefined });
    // Ein unbekannter Anbieter ist ein Tippfehler, keine Anmeldung — dann keine Voraussetzung statt einer falschen.
    expect(fremd?.requires).toBeUndefined();
    expect(hub?.requires?.client?.redirectHost).toBe('localhost');
  });

  it('verlangt erst den Client, dann die Anmeldung', () => {
    const entry: PluginEntry = {
      id: 'yt', name: 'YT', tagline: 't', description: 'd', category: 'daten', developer: 'x', server: 'yt',
      definition: { command: 'npx' }, prompts: [], requires: { kind: 'oauth-client', hint: 'h', client: { provider: 'google' } },
    };
    const installed = { yt: { command: 'npx' } };
    expect(pluginStatus(entry, pluginState(entry, installed, new Set()))).toMatchObject({ kind: 'einrichtung', reason: 'client' });
    const withClient = { yt: { fields: [], client: { clientId: 'c', hasSecret: true } } };
    expect(pluginStatus(entry, pluginState(entry, installed, new Set(), {}, {}, { credentials: withClient }))).toMatchObject({
      kind: 'einrichtung', reason: 'anmeldung', label: 'Anmelden',
    });
  });

  it('bietet den eigenen Client auch dort an, wo ein Anbieter die Registrierung verweigert hat', () => {
    const entry: PluginEntry = {
      id: 'r', name: 'R', tagline: 't', description: 'd', category: 'daten', developer: 'x', server: 'r',
      definition: { url: 'https://x/mcp' }, prompts: [], requires: { kind: 'oauth', hint: 'h' },
    };
    const state = pluginState(entry, { r: { url: 'https://x/mcp' } }, new Set(), {}, {}, { credentials: { r: { fields: [], clientRequired: true } } });
    expect(state.needsOwnClient).toBe(true);
    expect(pluginStatus(entry, state)).toMatchObject({ reason: 'client' });
  });
});

describe('Ein Dienst, mehrere Zugänge', async () => {
  const { groupServices, bestStatus, needsAttention } = await import('../src/plugins/installed.js');
  const { effectiveServers } = await import('../src/plugins/scopes.js');
  const base = (over: Partial<PluginEntry>): PluginEntry => ({
    id: 'x', name: 'X', tagline: 't', description: 'd', category: 'daten', developer: 'x', server: 'x',
    definition: { command: 'npx' }, prompts: [], ...over,
  });
  const youtube = base({ id: 'youtube', name: 'YouTube', server: 'youtube', service: 'youtube', variantLabel: 'API-Schlüssel', requires: { kind: 'secret', env: 'KEY', fields: [{ env: 'KEY', label: 'K', secret: true }], hint: 'h' } });
  const kanal = base({ id: 'youtube-kanal', name: 'YouTube', server: 'youtube-kanal', service: 'youtube', variantLabel: 'Google-Konto' });

  it('fasst Zugänge zu einer Karte zusammen, in Katalogreihenfolge', () => {
    const groups = groupServices([youtube, base({ id: 'figma', server: 'figma' }), kanal]);
    expect(groups.map((g) => [g.key, g.variants.map((v) => v.id)])).toEqual([
      ['youtube', ['youtube', 'youtube-kanal']],
      ['figma', ['figma']],
    ]);
  });

  it('fordert keinen Schlüssel an, solange ein anderer Zugang verbunden ist', () => {
    const state = pluginState(youtube, { youtube: { command: 'npx' } }, new Set());
    expect(pluginStatus(youtube, state).kind).toBe('einrichtung');
    const siblings = [{ id: 'youtube-kanal', label: 'Google-Konto', status: { kind: 'verbunden' as const, label: 'Verbunden', tools: 27 } }];
    expect(pluginStatus(youtube, state, siblings)).toEqual({ kind: 'ersetzt', label: 'Über Google-Konto', via: 'Google-Konto', viaId: 'youtube-kanal', tools: 27 });
    // Ein Geschwister, das selbst hängt, ersetzt nichts.
    expect(pluginStatus(youtube, state, [{ id: 'k', label: 'K', status: { kind: 'fehler', label: 'Fehler', message: 'm' } }]).kind).toBe('einrichtung');
  });

  it('zeigt einen Punkt nur bei Handlungsbedarf', () => {
    expect(needsAttention({ kind: 'fehler', label: 'F', message: 'm' })).toBe('rot');
    expect(needsAttention({ kind: 'einrichtung', reason: 'schluessel', label: 'S' })).toBe('gelb');
    for (const kind of ['ungeprueft', 'pruefe', 'aus'] as const) expect(needsAttention({ kind, label: '' })).toBeUndefined();
    expect(needsAttention({ kind: 'verbunden', label: 'V', tools: 1 })).toBeUndefined();
    expect(bestStatus([{ kind: 'einrichtung', reason: 'schluessel', label: 'S' }, { kind: 'verbunden', label: 'V', tools: 2 }]).kind).toBe('verbunden');
    expect(bestStatus([{ kind: 'ungeprueft', label: '' }, { kind: 'fehler', label: 'F', message: 'm' }]).kind).toBe('fehler');
  });

  it('kennt „Aus“ als Zustand ohne Warnung — vor jeder offenen Einrichtung', () => {
    const off = pluginState(youtube, { youtube: { command: 'npx' } }, new Set(), {}, {}, { disabled: ['youtube'] });
    expect(off.disabled).toBe(true);
    expect(pluginStatus(youtube, off)).toEqual({ kind: 'aus', label: 'Ausgeschaltet' });
    // Nicht installiert ist nie „aus“.
    expect(pluginState(youtube, {}, new Set(), {}, {}, { disabled: ['youtube'] }).disabled).toBe(false);
  });

  it('lässt persönliche Server gelten, wenn das Projekt eine eigene Datei mitbringt', () => {
    const merged = effectiveServers([
      { id: 'projekt', exists: true, servers: { figma: { url: 'https://projekt' }, docs: { command: 'p' } } },
      { id: 'persoenlich', exists: true, servers: { figma: { url: 'https://persoenlich' }, youtube: { command: 'y' } } },
    ]);
    expect(Object.keys(merged.servers).sort()).toEqual(['docs', 'figma', 'youtube']);
    expect(merged.servers.figma?.url).toBe('https://projekt');
    expect(merged.origin).toMatchObject({ figma: 'projekt', docs: 'projekt', youtube: 'persoenlich' });
    expect(merged.shadowed).toEqual(['figma']);
    // Eine kaputte Datei zählt nicht mit — und nimmt der anderen nichts weg.
    const broken = effectiveServers([
      { id: 'projekt', exists: true, error: 'kaputt', servers: {} },
      { id: 'persoenlich', exists: true, servers: { youtube: { command: 'y' } } },
    ]);
    expect(Object.keys(broken.servers)).toEqual(['youtube']);
  });

  it('bringt das stderr eines lokalen Servers als Protokoll mit', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-log-'));
    const file = join(dir, 's.cjs');
    writeFileSync(file, "console.error('Starte mit Konfiguration X'); process.exit(2);");
    const result = await probeServer({ command: process.execPath, args: [file] }, { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    expect(result.log).toContain('Starte mit Konfiguration X');
  });
});
