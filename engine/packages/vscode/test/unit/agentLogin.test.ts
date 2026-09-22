import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { claudeMcpLogin, claudeMcpSight, codexLoginUrl, codexMcpLogin, grokConnectorSight, readGrokConnector, type Spawn } from '../../src/plugins/agentLogin.js';
import { readCodex } from '../../src/plugins/cliSight.js';

const target = (provider: string) => ({ provider, label: 'test', command: provider, env: {} });

/** Ein Claude Code, das Steueranfragen beantwortet — `figma` wird nach `connectAfter` Statusabfragen verbunden. */
function fakeClaude(opts: { requiresUserAction: boolean; connectAfter: number; spawned: string[][] }): Spawn {
  return ((command: string, args: string[]) => {
    opts.spawned.push([command, ...args]);
    const child = new EventEmitter() as EventEmitter & { stdin: PassThrough; stdout: PassThrough; stderr: PassThrough; kill(): void; exitCode: number | null };
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 0;
      child.emit('close', 0);
    };
    let polls = 0;
    let buffer = '';
    child.stdin.on('data', (d: Buffer) => {
      buffer += d.toString();
      let i: number;
      while ((i = buffer.indexOf('\n')) >= 0) {
        const req = JSON.parse(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
        const reply = (response: unknown) =>
          child.stdout.write(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: req.request_id, response } })}\n`);
        const { subtype } = req.request;
        if (subtype === 'initialize') reply({ commands: [] });
        if (subtype === 'mcp_authenticate') reply(opts.requiresUserAction ? { authUrl: 'https://www.figma.com/oauth/mcp?x=1', requiresUserAction: true } : { requiresUserAction: false });
        if (subtype === 'mcp_status') {
          polls++;
          const connected = polls > opts.connectAfter;
          reply({ mcpServers: [{ name: 'figma', status: connected ? 'connected' : 'needs-auth', tools: connected ? [{ name: 'get_design_context' }, { name: 'get_screenshot' }] : [] }] });
        }
      }
    });
    return child;
  }) as unknown as Spawn;
}

describe('Anmeldung über die CLIs', () => {
  it('Claude Code: Link öffnen, warten bis verbunden, Werkzeuge melden', async () => {
    const urls: Array<[string, boolean]> = [];
    const spawned: string[][] = [];
    const result = await claudeMcpLogin(target('claude'), 'figma', {
      onUrl: (url, opens) => urls.push([url, opens]),
      spawnFn: fakeClaude({ requiresUserAction: true, connectAfter: 2, spawned }),
      pollMs: 5,
    });
    expect(result).toEqual({ ok: true, tools: ['get_design_context', 'get_screenshot'] });
    expect(urls).toEqual([['https://www.figma.com/oauth/mcp?x=1', false]]);
    expect(spawned[0]).toEqual(['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']);
  });

  it('Claude Code: schon angemeldet — kein Browser', async () => {
    const urls: string[] = [];
    const result = await claudeMcpLogin(target('claude'), 'figma', {
      onUrl: (url) => urls.push(url),
      spawnFn: fakeClaude({ requiresUserAction: false, connectAfter: 0, spawned: [] }),
      pollMs: 5,
    });
    expect(result.ok).toBe(true);
    expect(urls).toEqual([]);
  });

  it('Claude Code: Abbrechen beendet das Warten', async () => {
    const abort = new AbortController();
    const result = await claudeMcpLogin(target('claude'), 'figma', {
      onUrl: () => abort.abort(),
      signal: abort.signal,
      spawnFn: fakeClaude({ requiresUserAction: true, connectAfter: 1000, spawned: [] }),
      pollMs: 5,
    });
    expect(result).toMatchObject({ ok: false, cancelled: true });
  });

  it('Claude Code: Stand mit Werkzeugen, ohne Anmeldung als Fehler', async () => {
    const connected = await claudeMcpSight(target('claude'), 'figma', fakeClaude({ requiresUserAction: false, connectAfter: 0, spawned: [] }), 5);
    expect(connected.sight.state).toBe('verbunden');
    expect(connected.tools).toHaveLength(2);
    const open = await claudeMcpSight(target('claude'), 'figma', fakeClaude({ requiresUserAction: false, connectAfter: 1000, spawned: [] }), 5);
    expect(open.sight).toMatchObject({ state: 'fehler', detail: 'In Claude Code nicht angemeldet.' });
  });

  it('Codex: Link aus der Ausgabe, Erfolg bei Code 0', async () => {
    expect(codexLoginUrl("Authorize `figma` by opening this URL in your browser:\nhttps://www.figma.com/oauth/mcp?a=b\n")).toBe('https://www.figma.com/oauth/mcp?a=b');
    const spawn = ((command: string, args: string[]) => {
      expect([command, ...args]).toEqual(['codex', 'mcp', 'login', 'figma']);
      const child = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill(): void; exitCode: number | null };
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.exitCode = null;
      child.kill = () => undefined;
      setTimeout(() => child.stdout.write('Authorize `figma` by opening this URL in your browser:\nhttps://www.figma.com/oauth/mcp?c=d\n'), 1);
      setTimeout(() => {
        child.exitCode = 0;
        child.emit('close', 0);
      }, 10);
      return child;
    }) as unknown as Spawn;
    const urls: Array<[string, boolean]> = [];
    const result = await codexMcpLogin(target('codex'), 'figma', { onUrl: (u, o) => urls.push([u, o]), spawnFn: spawn });
    expect(result).toEqual({ ok: true });
    expect(urls).toEqual([['https://www.figma.com/oauth/mcp?c=d', true]]);
  });

  it('Codex-Stand: angemeldet ist eingetragen, nicht angemeldet ein Fehler', () => {
    const list = (auth: string) => JSON.stringify([{ name: 'figma', enabled: true, auth_status: auth }]);
    expect(readCodex(list('not_logged_in'), 'figma').state).toBe('fehler');
    expect(readCodex(list('oauth'), 'figma')).toMatchObject({ state: 'eingetragen', detail: expect.stringContaining('angemeldet') });
    expect(readCodex(list('unsupported'), 'figma').state).toBe('eingetragen');
  });
});

describe('Grok: Konnektor im Grok-Konto', () => {
  const base = { provider: 'grok', label: 'Privat', account: 'g1' };

  it('fragt nur mit search_tool, use_tool verboten', async () => {
    const calls: string[][] = [];
    const run = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: JSON.stringify({ text: 'Ich suche.figma__get_metadata\n`figma__get_screenshot`\nfigma__get_metadata' }), stderr: '' };
    };
    const { sight, tools } = await grokConnectorSight({ ...base, command: 'grok', env: {} }, 'figma', run);
    expect(calls[0]!.slice(1, 5)).toEqual(['--always-approve', '--deny', 'use_tool', '--output-format']);
    expect(sight).toMatchObject({ state: 'verbunden', account: 'g1' });
    expect(tools).toEqual(['figma__get_metadata', 'figma__get_screenshot']);
  });

  it('ohne Konnektor oder ohne lesbare Antwort ein Fehler', () => {
    expect(readGrokConnector(JSON.stringify({ text: 'KEINE' }), 'figma', base).sight).toMatchObject({ state: 'fehler', detail: 'Im Grok-Konto ist kein figma-Konnektor hinzugefügt.' });
    expect(readGrokConnector('kaputt', 'figma', base).sight.state).toBe('fehler');
  });
});
