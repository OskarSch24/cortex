import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProbeResult, StoredOAuth } from '@cortex/core';
import { PluginConnections, STALE_AFTER_MS } from '../../src/plugins/connections.js';
import { PluginCredentials, type SecretBackend } from '../../src/plugins/credentials.js';
import { loginToServer, loginWithOwnClient, type LoginStep } from '../../src/plugins/oauthLogin.js';

/** Ein Schlüsselbund im Speicher, der wie der echte bei jeder Änderung Bescheid gibt. */
function memorySecrets(): SecretBackend & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  const listeners: Array<(e: { key: string }) => void> = [];
  return {
    raw,
    get: async (key) => raw.get(key),
    store: async (key, value) => {
      raw.set(key, value);
      for (const l of listeners) l({ key });
    },
    delete: async (key) => {
      raw.delete(key);
      for (const l of listeners) l({ key });
    },
    onDidChange: (listener) => {
      listeners.push(listener);
      return { dispose: () => {} };
    },
  };
}

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
});

async function serve(handler: (req: IncomingMessage, res: ServerResponse, body: string, base: string) => void): Promise<string> {
  let base = '';
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => handler(req, res, body, base));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  return base;
}

const stored = (over: Partial<StoredOAuth['tokens']> = {}, tokenEndpoint = 'http://127.0.0.1:1/token'): StoredOAuth => ({
  endpoints: { resource: 'https://x/mcp', issuer: 'x', authorizationEndpoint: 'x', tokenEndpoint },
  client: { clientId: 'c', authMethod: 'none', redirectUri: 'http://127.0.0.1/callback' },
  tokens: { accessToken: 'alt', tokenType: 'Bearer', refreshToken: 'r', expiresAt: Date.now() + 60_000, ...over },
  connectedAt: 1,
});

describe('Zugangsdaten im Schlüsselbund', () => {
  it('gibt der Oberfläche nur Namen, den Profilen die Werte', async () => {
    const secrets = memorySecrets();
    const credentials = new PluginCredentials(secrets);
    await credentials.load();
    await credentials.setValues('postgres', { POSTGRES_URL: ' postgresql://db ' });
    await credentials.setOAuth('notion', stored({ expiresAt: undefined }));

    const state = credentials.state();
    expect(state.postgres).toEqual({ fields: ['POSTGRES_URL'], oauth: undefined });
    expect(JSON.stringify(state)).not.toContain('postgresql://db');
    expect(JSON.stringify(state)).not.toContain('alt');

    const applied = credentials.applyAll({
      postgres: { command: 'npx', args: ['${POSTGRES_URL}'] },
      notion: { url: 'https://mcp.notion.com/mcp' },
      eigener: { command: 'node' },
    });
    expect(applied.postgres?.args).toEqual(['postgresql://db']);
    expect(applied.notion?.headers).toEqual({ Authorization: 'Bearer alt' });
    expect(applied.eigener).toEqual({ command: 'node' });

    // Ein neues Fenster liest denselben Stand.
    const other = new PluginCredentials(secrets);
    await other.load();
    expect(other.values('postgres')).toEqual({ POSTGRES_URL: 'postgresql://db' });
  });

  it('löscht einen Wert mit leerem String und räumt leere Einträge weg', async () => {
    const secrets = memorySecrets();
    const credentials = new PluginCredentials(secrets);
    await credentials.setValues('x', { A: '1', B: '2' });
    await credentials.setValues('x', { A: '' });
    expect(credentials.values('x')).toEqual({ B: '2' });
    await credentials.clear('x');
    expect(JSON.parse(secrets.raw.get('cortex.plugins.credentials')!)).toEqual({});
  });

  it('frischt bald ablaufende Tokens auf und lässt frische in Ruhe', async () => {
    let calls = 0;
    const base = await serve((_req, res) => {
      calls++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'neu', token_type: 'Bearer', expires_in: 3600 }));
    });
    const credentials = new PluginCredentials(memorySecrets());
    await credentials.setOAuth('bald', stored({}, `${base}/token`));
    await credentials.setOAuth('frisch', stored({ expiresAt: Date.now() + 3 * 3600_000 }, `${base}/token`));

    expect(await credentials.refreshDue()).toBe(true);
    expect(calls).toBe(1);
    expect(credentials.apply('bald', { url: 'https://x' }).headers?.Authorization).toBe('Bearer neu');
    // Der alte Refresh-Token gilt weiter, wenn keiner nachkommt.
    expect(credentials.oauth('bald')?.tokens.refreshToken).toBe('r');
    expect(credentials.apply('frisch', { url: 'https://x' }).headers?.Authorization).toBe('Bearer alt');
  });

  it('erklärt eine Anmeldung erst bei invalid_grant für abgelaufen — nicht bei einem Netzfehler', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant' }));
    });
    const credentials = new PluginCredentials(memorySecrets());
    await credentials.setOAuth('netz', stored());
    await credentials.setOAuth('widerrufen', stored({}, `${base}/token`));

    await credentials.refreshDue();
    expect(credentials.state().netz?.oauth?.expired).toBeUndefined();
    expect(credentials.oauth('netz')).toBeDefined();
    expect(credentials.state().widerrufen?.oauth?.expired).toBe(true);
    // Ein abgelaufener Token geht nicht mehr in die Profile.
    expect(credentials.apply('widerrufen', { url: 'https://x' }).headers).toBeUndefined();
  });
});

describe('Prüfergebnisse', () => {
  const memory = () => {
    const data = new Map<string, unknown>();
    return {
      data,
      get: <T,>(key: string, fallback: T) => (data.has(key) ? (data.get(key) as T) : fallback),
      update: async (key: string, value: unknown) => void data.set(key, value),
    };
  };

  it('startet für einen Server nie zwei Prüfungen und merkt sich das Ergebnis', async () => {
    let runs = 0;
    let release!: (r: ProbeResult) => void;
    const probe = () => {
      runs++;
      return new Promise<ProbeResult>((resolve) => (release = resolve));
    };
    const store = memory();
    const connections = new PluginConnections(store, probe);
    const first = connections.check('a', { command: 'x' });
    const second = connections.check('a', { command: 'x' });
    expect(connections.get('a')?.status).toBe('pruefe');
    release({ ok: true, tools: [{ name: 't' }], ms: 5 });
    await Promise.all([first, second]);
    expect(runs).toBe(1);
    expect(connections.get('a')).toMatchObject({ status: 'verbunden', tools: [{ name: 't' }] });

    // Ein neues Fenster sieht das Ergebnis, aber keine halbe Prüfung.
    const reopened = new PluginConnections(store, probe);
    expect(reopened.get('a')?.status).toBe('verbunden');
    expect(reopened.isStale('a')).toBe(false);
    expect(reopened.isStale('a', Date.now() + STALE_AFTER_MS + 1)).toBe(true);
  });

  it('markiert eine Prüfung sofort, auch bevor der Prozess startet', () => {
    const connections = new PluginConnections(memory(), async () => ({ ok: true, tools: [], ms: 1 }));
    connections.begin('x');
    expect(connections.get('x')?.status).toBe('pruefe');
    // Eine angefangene Prüfung wird nie als Ergebnis gemerkt.
    const reopened = new PluginConnections(memory());
    expect(reopened.get('x')).toBeUndefined();
  });

  it('unterscheidet Anmeldung von Fehler', async () => {
    const connections = new PluginConnections(memory(), async () => ({ ok: false, reason: 'auth', message: 'Anmeldung nötig.' }));
    expect((await connections.check('n', { url: 'https://x' })).status).toBe('anmeldung');
    const broken = new PluginConnections(memory(), async () => ({ ok: false, reason: 'start', message: 'Tot.', detail: 'stderr' }));
    expect(await broken.check('b', { command: 'x' })).toMatchObject({ status: 'fehler', message: 'Tot.', detail: 'stderr' });
  });

  it('prüft höchstens drei gleichzeitig', async () => {
    let active = 0;
    let peak = 0;
    const probe = async (): Promise<ProbeResult> => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return { ok: true, tools: [], ms: 1 };
    };
    const connections = new PluginConnections(memory(), probe);
    await Promise.all(['a', 'b', 'c', 'd', 'e'].map((name) => connections.check(name, { command: 'x' })));
    expect(peak).toBe(3);
  });
});

describe('Anmeldung von Klick bis Token', () => {
  it('läuft gegen einen Server nach MCP-Spezifikation vollständig durch', async () => {
    const steps: LoginStep['step'][] = [];
    const base = await serve((req, res, body, root) => {
      const url = new URL(req.url!, root);
      const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === '/mcp') {
        return json(401, {}, { 'www-authenticate': `Bearer resource_metadata="${root}/.well-known/oauth-protected-resource/mcp", scope="lesen"` });
      }
      if (url.pathname === '/.well-known/oauth-protected-resource/mcp') {
        return json(200, { resource: `${root}/mcp`, authorization_servers: [root] });
      }
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        return json(200, {
          issuer: root,
          authorization_endpoint: `${root}/authorize`,
          token_endpoint: `${root}/token`,
          registration_endpoint: `${root}/register`,
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url.pathname === '/register') return json(201, { client_id: 'cortex' });
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body);
        expect(form.get('code')).toBe('vom-anbieter');
        return json(200, { access_token: 'zugang', token_type: 'Bearer', refresh_token: 'auffrischen', expires_in: 3600 });
      }
      json(404, {});
    });

    // Der „Browser“: ruft die Rückrufadresse so auf, wie der Anbieter es nach der Zustimmung täte.
    const openExternal = async (authorize: string) => {
      const url = new URL(authorize);
      expect(url.searchParams.get('scope')).toBe('lesen');
      expect(url.searchParams.get('resource')).toBe(`${base}/mcp`);
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.searchParams.set('code', 'vom-anbieter');
      callback.searchParams.set('state', url.searchParams.get('state')!);
      void fetch(callback);
      return true;
    };

    const result = await loginToServer(`${base}/mcp`, { openExternal, onStep: (s) => steps.push(s.step), timeoutMs: 5_000 });
    expect(result.tokens).toMatchObject({ accessToken: 'zugang', refreshToken: 'auffrischen' });
    expect(result.client.clientId).toBe('cortex');
    expect(steps).toEqual(['suche', 'browser', 'tausche']);
  });

  it('öffnet keinen Browser, wenn der Server gar nicht erreichbar ist', async () => {
    let opened = false;
    await expect(
      loginToServer('http://127.0.0.1:1/mcp', { openExternal: async () => (opened = true) }),
    ).rejects.toMatchObject({ code: 'unreachable' });
    expect(opened).toBe(false);
  });
});

describe('Eigener OAuth-Client im Host', () => {
  const googleDelivery = {
    provider: 'google' as const,
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    clientFile: 'YOUTUBE_CREDENTIALS_PATH',
    tokenFile: 'YOUTUBE_TOKEN_PATH',
  };
  const client = { clientId: '1-x.apps.googleusercontent.com', clientSecret: 'GOCSPX-s', kind: 'installed' as const };

  it('schreibt Client- und Token-Datei nur für dich lesbar und setzt die Pfade', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cortex-files-'));
    const credentials = new PluginCredentials(memorySecrets(), fetch, root);
    credentials.setDeliveries((server) => (server === 'yt' ? googleDelivery : undefined));
    await credentials.setClient('yt', client, 'client_secret_1.json');

    // Ohne Anmeldung: nur der Client — eine Token-Datei, die es nicht gibt, würde der Server als Anmeldung missverstehen.
    const before = credentials.apply('yt', { command: 'npx' });
    expect(Object.keys(before.env ?? {})).toEqual(['YOUTUBE_CREDENTIALS_PATH']);

    await credentials.setOAuth('yt', stored({ accessToken: 'ya29', refreshToken: '1//r' }));
    const def = credentials.apply('yt', { command: 'npx' });
    const clientPath = def.env!.YOUTUBE_CREDENTIALS_PATH!;
    const tokenPath = def.env!.YOUTUBE_TOKEN_PATH!;
    expect(JSON.parse(readFileSync(clientPath, 'utf8')).installed.client_secret).toBe('GOCSPX-s');
    expect(JSON.parse(readFileSync(tokenPath, 'utf8'))).toMatchObject({ access_token: 'ya29', refresh_token: '1//r' });
    expect(statSync(clientPath).mode & 0o777).toBe(0o600);
    expect(statSync(join(root, 'yt')).mode & 0o777).toBe(0o700);
    // Nicht als HTTP-Header: den würde ein lokaler Server nie lesen.
    expect(def.headers).toBeUndefined();

    expect(credentials.state().yt?.client).toEqual({ clientId: client.clientId, hasSecret: true, fileName: 'client_secret_1.json', projectId: undefined });
    expect(JSON.stringify(credentials.state())).not.toContain('GOCSPX');

    // Entfernen des Clients nimmt Anmeldung und Dateien mit.
    await credentials.clear('yt', 'client');
    expect(existsSync(clientPath)).toBe(false);
    expect(credentials.oauth('yt')).toBeUndefined();
  });

  it('übergibt Client und Token als Variablen, wo der Server das so will', async () => {
    const credentials = new PluginCredentials(memorySecrets(), fetch, mkdtempSync(join(tmpdir(), 'cortex-files-')));
    credentials.setDeliveries(() => ({ clientIdEnv: 'ID', clientSecretEnv: 'SECRET', accessTokenEnv: 'ACCESS', refreshTokenEnv: 'REFRESH' }));
    await credentials.setClient('drive', client);
    await credentials.setOAuth('drive', stored({ accessToken: 'a', refreshToken: 'r' }));
    expect(credentials.apply('drive', { command: 'npx', env: { SCOPES: 'drive' } }).env).toEqual({
      SCOPES: 'drive', ID: client.clientId, SECRET: 'GOCSPX-s', ACCESS: 'a', REFRESH: 'r',
    });
  });

  it('verwirft die alte Anmeldung, wenn ein anderer Client kommt — nicht bei demselben', async () => {
    const credentials = new PluginCredentials(memorySecrets(), fetch, mkdtempSync(join(tmpdir(), 'cortex-files-')));
    await credentials.setClient('yt', client);
    await credentials.setOAuth('yt', stored());
    await credentials.setClient('yt', client, 'neu-hochgeladen.json');
    expect(credentials.oauth('yt')).toBeDefined();
    await credentials.setClient('yt', { ...client, clientSecret: 'anderes' });
    expect(credentials.oauth('yt')).toBeUndefined();
  });

  it('meldet mit eigenem Client an: ohne Registrierung, mit Secret, ohne resource', async () => {
    let registered = false;
    const base = await serve((req, res, body, root) => {
      const url = new URL(req.url!, root);
      if (url.pathname === '/register') registered = true;
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body);
        expect(form.get('client_secret')).toBe('GOCSPX-s');
        expect(form.has('resource')).toBe(false);
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ access_token: 'ya29', refresh_token: '1//r', expires_in: 3599, token_type: 'Bearer' }));
      }
      res.writeHead(404).end();
    });
    const openExternal = async (authorize: string) => {
      const url = new URL(authorize);
      expect(url.searchParams.get('client_id')).toBe(client.clientId);
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.has('resource')).toBe(false);
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      expect(callback.port).toBe('38177');
      callback.searchParams.set('code', 'c');
      callback.searchParams.set('state', url.searchParams.get('state')!);
      void fetch(callback);
      return true;
    };
    const result = await loginWithOwnClient(
      { client: { ...client, tokenEndpoint: `${base}/token` }, delivery: googleDelivery },
      { openExternal, port: 38177, timeoutMs: 5_000 },
    );
    expect(result.tokens).toMatchObject({ accessToken: 'ya29', refreshToken: '1//r' });
    expect(result.client).toMatchObject({ clientSecret: 'GOCSPX-s', authMethod: 'client_secret_post' });
    expect(registered).toBe(false);
  });

  it('meldet einen Remote-Server ohne Selbstregistrierung mit eindeutigem Code', async () => {
    const base = await serve((req, res, _body, root) => {
      const url = new URL(req.url!, root);
      const json = (status: number, value: unknown, headers: Record<string, string> = {}) => {
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(value));
      };
      if (url.pathname === '/mcp') return json(401, {}, { 'www-authenticate': 'Bearer realm="x"' });
      if (url.pathname === '/.well-known/oauth-authorization-server') {
        return json(200, { issuer: root, authorization_endpoint: `${root}/a`, token_endpoint: `${root}/t` });
      }
      json(404, {});
    });
    await expect(loginToServer(`${base}/mcp`, { openExternal: async () => true, timeoutMs: 2_000 })).rejects.toMatchObject({
      code: 'registration_unsupported',
    });
  });
});

describe('Was die CLIs selbst sehen', async () => {
  const { readClaude, readCodex, readGrok, sightInClis } = await import('../../src/plugins/cliSight.js');

  it('liest Claude Codes Auskunft', () => {
    expect(readClaude('youtube-kanal:\n  Scope: User config\n  Status: ✔ Connected\n  Type: stdio')).toMatchObject({ state: 'verbunden' });
    expect(readClaude('notion:\n  Status: ✘ Failed to connect')).toEqual({ state: 'fehler', detail: 'Failed to connect' });
    expect(readClaude('No MCP server found with name: "x".')).toMatchObject({ state: 'fehlt' });
  });

  it('liest Groks Diagnose', () => {
    const healthy = JSON.stringify({ servers: [{ name: 'youtube-kanal', healthy: true, checks: [{ label: 'handshake OK', passed: true }, { label: '27 tools discovered', passed: true }] }] });
    expect(readGrok(healthy, 'youtube-kanal')).toEqual({ state: 'verbunden', detail: 'Grok: 27 Werkzeuge gefunden.' });
    expect(readGrok('', 'remotion')).toMatchObject({ state: 'fehlt' });
    const broken = JSON.stringify({ servers: [{ name: 'x', healthy: false, checks: [{ label: 'command found', passed: false, detail: 'npx fehlt' }] }] });
    expect(readGrok(broken, 'x')).toEqual({ state: 'fehler', detail: 'command found: npx fehlt' });
    expect(readGrok(JSON.stringify({ servers: [] }), 'x')).toMatchObject({ state: 'fehlt' });
    expect(readGrok('kein json', 'x')).toMatchObject({ state: 'fehler' });
  });

  it('liest Codex — das nur „eingetragen“ sagen kann', () => {
    const list = JSON.stringify([{ name: 'youtube-kanal', enabled: true, auth_status: 'unsupported' }, { name: 'aus', enabled: false, disabled_reason: 'user' }]);
    expect(readCodex(list, 'youtube-kanal')).toMatchObject({ state: 'eingetragen' });
    expect(readCodex(list, 'aus')).toMatchObject({ state: 'fehler' });
    expect(readCodex(list, 'fehlt')).toMatchObject({ state: 'fehlt' });
  });

  it('fragt jede CLI mit ihrem Befehl und ihrer Umgebung', async () => {
    const calls: Array<[string, string[], string | undefined]> = [];
    const run = async (command: string, args: string[], env: NodeJS.ProcessEnv) => {
      calls.push([command, args, env.CLAUDE_CONFIG_DIR ?? env.CODEX_HOME ?? env.GROK_HOME]);
      if (args[0] === 'mcp' && args[1] === 'get') return { code: 0, stdout: 'Status: ✔ Connected', stderr: '' };
      if (args[1] === 'doctor') return { code: 0, stdout: JSON.stringify({ servers: [{ name: 's', healthy: true, checks: [] }] }), stderr: '' };
      return { code: 0, stdout: JSON.stringify([{ name: 's', enabled: true }]), stderr: '' };
    };
    const sights = await sightInClis('s', [
      { provider: 'claude', label: 'privat', command: 'claude', env: { CLAUDE_CONFIG_DIR: '/p/claude' } },
      { provider: 'codex', label: 'privat', command: 'codex', env: { CODEX_HOME: '/p/codex' } },
      { provider: 'grok', label: 'studio', command: 'grok', env: { GROK_HOME: '/p/grok/.grok' } },
    ], run);
    expect(sights.map((s) => `${s.provider}:${s.state}`)).toEqual(['claude:verbunden', 'codex:eingetragen', 'grok:verbunden']);
    expect(calls).toEqual([
      ['claude', ['mcp', 'get', 's'], '/p/claude'],
      ['codex', ['mcp', 'list', '--json'], '/p/codex'],
      ['grok', ['mcp', 'doctor', 's', '--json'], '/p/grok/.grok'],
    ]);
  });
});

describe('Ausschalten, ohne zu entfernen', async () => {
  const { PluginSwitches, setPluginSwitches } = await import('../../src/plugins/switches.js');
  const { profileServers } = await import('../../src/plugins/profileServers.js');

  it('nimmt einen ausgeschalteten Server aus der Profilmenge — und nur ihn', async () => {
    const data = new Map<string, unknown>();
    const switches = new PluginSwitches({ get: (k, f) => (data.has(k) ? (data.get(k) as never) : f), update: async (k, v) => void data.set(k, v) });
    setPluginSwitches(switches);
    let changed = 0;
    switches.onDidChange(() => changed++);
    const defined = { youtube: { command: 'npx' }, figma: { url: 'https://x' } };
    await switches.set('youtube', false);
    expect(Object.keys(profileServers(defined))).not.toContain('youtube');
    expect(Object.keys(profileServers(defined))).toContain('figma');
    // Die Definition selbst bleibt unangetastet.
    expect(defined.youtube).toBeDefined();
    await switches.set('youtube', true);
    expect(Object.keys(profileServers(defined))).toContain('youtube');
    expect(changed).toBe(2);
    setPluginSwitches(undefined);
  });
});

describe('CLI-Belege am Prüfergebnis', () => {
  it('hängt sie an und merkt sie sich — außer dem Zwischenstand', () => {
    const data = new Map<string, unknown>();
    const memory = { get: <T,>(k: string, f: T) => (data.has(k) ? (data.get(k) as T) : f), update: async (k: string, v: unknown) => void data.set(k, v) };
    const connections = new PluginConnections(memory, async () => ({ ok: true, tools: [], ms: 1 }));
    return connections.check('s', { command: 'x' }).then(() => {
      connections.attachClis('s', [{ provider: 'claude', label: 'p', state: 'eingetragen', detail: 'Wird gefragt …' }], true);
      expect((data.get('cortex.plugins.connections') as Record<string, { clis?: unknown }>).s?.clis).toBeUndefined();
      connections.attachClis('s', [{ provider: 'claude', label: 'p', state: 'verbunden' }]);
      expect((data.get('cortex.plugins.connections') as Record<string, { clis?: unknown[] }>).s?.clis).toHaveLength(1);
    });
  });
});

describe('YouTube · Google-Konto: Videos jeder Sichtbarkeit', async () => {
  const { setYoutubeKanalProxy, withYoutubeVideoTools } = await import('../../src/plugins/youtubeKanal.js');
  const catalog = { command: 'npx', args: ['-y', 'youtube-analytics-mcp@1.0.6'], env: { YOUTUBE_TOKEN_PATH: '/t.json' } };

  it('setzt den Zwischenserver vor die Katalogfassung und behält Umgebung und Befehl', () => {
    setYoutubeKanalProxy('/ext/dist/youtubeKanalServer.js');
    const once = withYoutubeVideoTools({ 'youtube-kanal': catalog });
    expect(once['youtube-kanal']).toEqual({
      command: 'node',
      args: ['/ext/dist/youtubeKanalServer.js', 'npx', '-y', 'youtube-analytics-mcp@1.0.6'],
      env: { YOUTUBE_TOKEN_PATH: '/t.json' },
    });
    // Die Spiegelung läuft oft — zweimal umgelenkt wäre einmal zu viel.
    expect(withYoutubeVideoTools(once)).toEqual(once);
    setYoutubeKanalProxy(undefined);
  });

  it('lässt fremde Server und einen selbst eingetragenen gleichen Namens in Ruhe', () => {
    setYoutubeKanalProxy('/ext/dist/youtubeKanalServer.js');
    const own = { 'youtube-kanal': { command: 'python3', args: ['mein-server.py'] }, youtube: { command: 'npx', args: ['youtube-data-mcp-server'] } };
    expect(withYoutubeVideoTools(own)).toEqual(own);
    setYoutubeKanalProxy(undefined);
    expect(withYoutubeVideoTools({ 'youtube-kanal': catalog })['youtube-kanal']).toBe(catalog);
  });
});
