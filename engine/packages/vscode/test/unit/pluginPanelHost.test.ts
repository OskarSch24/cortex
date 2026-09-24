import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectiveServers, type McpServerDef } from '@cortex/core';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import type { PluginScopeState } from '../../src/panel/protocol.js';
import { loginToServer } from '../../src/plugins/oauthLogin.js';
import { fsSpies, Uri } from './vscodeStub.js';

/**
 * Charakterisierung der Plugin-Seite, so wie der Provider sie heute bedient:
 * Installieren, Entfernen und Anmelden über die Weiche der Webview. Nur die
 * Grenzen nach außen sind ersetzt — mcp.json, Schlüsselbund, Prüfung und
 * Browser-Anmeldung. Der Katalog ist der echte, ausgelieferte.
 */

const scopes = vi.hoisted(() => ({ current: [] as PluginScopeState[] }));
vi.mock('../../src/plugins/scopes.js', () => ({
  readScopes: () => scopes.current,
  effectiveMcp: (list: PluginScopeState[] = scopes.current) => ({ ...effectiveServers(list), scopes: list, errors: [] }),
}));
vi.mock('../../src/plugins/appChecks.js', () => ({ checkApps: vi.fn(async () => []), checkApp: vi.fn(async () => undefined) }));
vi.mock('../../src/plugins/cliSight.js', () => ({ sightInClis: vi.fn(async () => []) }));
vi.mock('../../src/plugins/oauthLogin.js', () => ({ loginToServer: vi.fn(), loginWithOwnClient: vi.fn() }));
vi.mock('../../src/database/index.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/database/index.js')>(),
  databaseStudioServer: () => undefined,
}));
vi.mock('@cortex/core', async importOriginal => ({ ...await importOriginal<typeof import('@cortex/core')>(), readSkills: () => [] }));

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const dirs: string[] = [];
beforeEach(() => {
  // Der Stub kennt joinPath nicht; der Katalog liegt unter media/plugins.
  (Uri as unknown as { joinPath: (base: Uri, ...parts: string[]) => Uri }).joinPath = (base, ...parts) => Uri.file(join(base.fsPath, ...parts));
});
afterEach(() => {
  vi.clearAllMocks();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function host(servers: Record<string, McpServerDef> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-plugins-')); dirs.push(dir);
  const path = join(dir, 'mcp.json');
  const exists = Object.keys(servers).length > 0;
  if (exists) writeFileSync(path, JSON.stringify({ servers }, null, 2));
  scopes.current = [{ id: 'persoenlich', path, exists, servers }];
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const webview = {};
  const posted: any[] = [];
  chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'one' }]]);
  chat.safePost = vi.fn((_view: unknown, message: unknown) => posted.push(structuredClone(message)));
  chat.ctx = { extensionUri: Uri.file(packageRoot), globalState: { get: () => undefined, update: vi.fn(async () => {}) } };
  chat.output = { appendLine: vi.fn() };
  chat.accounts = { all: () => [] };
  const oauth = new Map<string, unknown>();
  chat.pluginCredentials = {
    setValues: vi.fn(async () => {}), values: () => ({}), client: () => undefined,
    oauth: (server: string) => oauth.get(server), setOAuth: vi.fn(async (server: string, stored: unknown) => { oauth.set(server, stored); }),
    refresh: vi.fn(async () => false), apply: (_server: string, def: McpServerDef) => def,
    state: () => ({}), clear: vi.fn(async () => {}), markClientRequired: vi.fn(async () => {}),
  };
  let result: { status: string; message?: string; tools?: Array<{ name: string }> } | undefined;
  chat.pluginConnections = {
    begin: vi.fn(), all: () => ({}), isStale: () => false, attachClis: vi.fn(), forget: vi.fn(),
    get: () => result,
    check: vi.fn(async () => result),
    set result(next: typeof result) { result = next; },
  };
  chat.pluginSwitches = { isDisabled: () => false, set: vi.fn(async () => {}), disabled: () => [] };
  return { chat, webview, posted, path };
}

const progress = (posted: any[]) => posted.filter(m => m.kind === 'pluginProgress').map(m => [m.ok, m.message]);

describe('Plugin-Seite über die Weiche (Charakterisierung)', () => {
  it('installiert erst nach erfolgreicher Prüfung und trägt dann in mcp.json ein', async () => {
    const { chat, webview, posted, path } = host();
    chat.pluginConnections.result = { status: 'verbunden', tools: [{ name: 'a' }, { name: 'b' }] };
    await chat.dispatchMessage({ kind: 'installPlugin', id: 'memory', scope: 'persoenlich' }, webview);
    expect(chat.pluginConnections.check).toHaveBeenCalledWith('memory', { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }, 180_000, undefined);
    expect(fsSpies.writeFile).toHaveBeenCalledOnce();
    const [uri, content] = fsSpies.writeFile.mock.calls[0]!;
    expect(uri.fsPath).toBe(path);
    expect(JSON.parse(Buffer.from(content).toString()).servers.memory).toEqual({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] });
    expect(posted.map(m => m.kind)).toEqual(['pluginProgress', 'plugins', 'pluginProgress']);
    expect(progress(posted)).toEqual([
      [true, 'Gedächtnis: Verbindung wird geprüft …'],
      [true, 'Gedächtnis ist verbunden — 2 Werkzeuge. Neue Chats können es benutzen.'],
    ]);
    expect(chat.ctx.globalState.update).toHaveBeenCalledWith('cortex.databaseStudio.mirrored', true);
  });

  it('trägt nichts ein, wenn der Server nicht antwortet, und vergisst die Probe', async () => {
    const { chat, webview, posted } = host();
    chat.pluginConnections.result = { status: 'fehler', message: 'Prozess beendet.' };
    await chat.dispatchMessage({ kind: 'installPlugin', id: 'memory', scope: 'persoenlich' }, webview);
    expect(fsSpies.writeFile).not.toHaveBeenCalled();
    expect(chat.pluginConnections.forget).toHaveBeenCalledWith('memory');
    expect(progress(posted)).toEqual([
      [true, 'Gedächtnis: Verbindung wird geprüft …'],
      [false, 'Gedächtnis ist nicht verbunden und wurde nicht eingetragen: Prozess beendet.'],
    ]);
  });

  it('entfernt den Eintrag samt Schlüssel und Anmeldung', async () => {
    const memory = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] };
    const { chat, webview, posted } = host({ memory });
    await chat.dispatchMessage({ kind: 'uninstallPlugin', id: 'memory', scope: 'persoenlich' }, webview);
    expect(JSON.parse(Buffer.from(fsSpies.writeFile.mock.calls[0]![1]).toString()).servers).toEqual({});
    expect(chat.pluginCredentials.clear).toHaveBeenCalledWith('memory');
    expect(chat.pluginConnections.forget).toHaveBeenCalledWith('memory');
    expect(posted.map(m => m.kind)).toEqual(['plugins', 'pluginProgress']);
    expect(progress(posted)).toEqual([[true, 'Gedächtnis entfernt.']]);
  });

  it('meldet sich im Browser an, zeigt den Schritt live und prüft danach', async () => {
    const { chat, webview, posted } = host({ notion: { url: 'https://mcp.notion.com/mcp' } });
    const stored = { tokens: { accessToken: 'token' } };
    vi.mocked(loginToServer).mockImplementationOnce(async (_url, deps) => {
      deps.onStep?.({ step: 'browser', url: 'https://notion.example/authorize', message: 'Im Browser bestätigen.' } as never);
      return stored as never;
    });
    chat.pluginConnections.result = { status: 'verbunden', tools: [{ name: 'search' }] };
    await chat.dispatchMessage({ kind: 'loginPlugin', id: 'notion' }, webview);
    expect(loginToServer).toHaveBeenCalledWith('https://mcp.notion.com/mcp', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(chat.pluginCredentials.setOAuth).toHaveBeenCalledWith('notion', stored);
    const live = posted.filter(m => m.kind === 'pluginLive').map(m => m.logins);
    expect(live[0]).toEqual({ notion: { step: 'suche', message: 'Anmeldung wird vorbereitet …', url: undefined, account: undefined } });
    expect(live[1]).toEqual({ notion: { step: 'browser', message: 'Im Browser bestätigen.', url: 'https://notion.example/authorize', account: undefined } });
    expect(live.at(-1)).toEqual({});
    expect(posted.filter(m => m.kind !== 'pluginLive').map(m => m.kind)).toEqual(['plugins', 'pluginProgress', 'pluginProgress']);
    expect(progress(posted)).toEqual([
      [true, 'Notion: Verbindung wird geprüft …'],
      [true, 'Notion ist verbunden — 1 Werkzeug. Neue Chats können es benutzen.'],
    ]);
  });

  it('bricht eine laufende Anmeldung auf Wunsch ab', async () => {
    const { chat, webview, posted } = host({ notion: { url: 'https://mcp.notion.com/mcp' } });
    let signal!: AbortSignal;
    vi.mocked(loginToServer).mockImplementationOnce(async (_url, deps) => {
      signal = deps.signal!;
      await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
      throw Object.assign(new Error('abgebrochen'), { name: 'OAuthError', code: 'cancelled' });
    });
    const login = chat.dispatchMessage({ kind: 'loginPlugin', id: 'notion' }, webview);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await chat.dispatchMessage({ kind: 'cancelPluginLogin', id: 'notion' }, webview);
    await login;
    expect(signal.aborted).toBe(true);
    expect(chat.pluginCredentials.setOAuth).not.toHaveBeenCalled();
    expect(posted.filter(m => m.kind === 'pluginLive').at(-1).logins).toEqual({});
  });
});
