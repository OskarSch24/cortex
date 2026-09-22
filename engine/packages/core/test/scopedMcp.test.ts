import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import { GrokAdapter } from '../src/adapters/grok.js';
import { CopilotAdapter } from '../src/adapters/copilot.js';
import { OpenRouterAdapter } from '../src/adapters/openrouter.js';
import { createClaudeMcpConfig, withClaudeMcpSelection } from '../src/adapters/scopedMcp.js';
import { SCOPED_MCP_PROVIDERS, scopedMcpUnsupportedMessage } from '../src/mcp/runPolicy.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';
import type { RunRequest } from '../src/adapters/adapter.js';

const folders: string[] = [];
const temp = () => { const folder = mkdtempSync(join(tmpdir(), 'cx-scoped-mcp-test-')); folders.push(folder); return folder; };
const account: ResolvedAccount = { id: 'test', provider: 'claude', label: 'test', authMode: 'managed-home', hasSecret: false, priority: 0 };
const request: RunRequest = { prompt: 'test', cwd: process.cwd(), permissionMode: 'safe' };
const collect = async (stream: AsyncIterable<AdapterEvent>) => { const events: AdapterEvent[] = []; for await (const event of stream) events.push(event); return events; };
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });

describe('exclusive per-run MCP selection', () => {
  it('advertises only the verified exclusive provider and leaves inherited runs unchanged', () => {
    expect(SCOPED_MCP_PROVIDERS).toEqual(['claude']);
    for (const provider of ['claude', 'codex', 'grok', 'copilot', 'openrouter'] as const) {
      expect(scopedMcpUnsupportedMessage(provider, undefined)).toBeUndefined();
    }
    expect(scopedMcpUnsupportedMessage('claude', {})).toBeUndefined();
    expect(scopedMcpUnsupportedMessage('grok', {})).toContain('keine begrenzte MCP-Auswahl');
  });

  it('writes only selected transports in a private file and removes it on disposal', () => {
    const config = createClaudeMcpConfig({
      local: { command: 'node', args: ['server.mjs'], env: { TOKEN: 'secret-local' }, providers: ['claude'], kind: 'docs' },
      remote: { url: 'https://example.test/mcp', headers: { Authorization: 'Bearer secret-http' } },
      legacy: { url: 'https://example.test/sse' },
    });
    try {
      expect(JSON.parse(readFileSync(config.path, 'utf8'))).toEqual({ mcpServers: {
        local: { type: 'stdio', command: 'node', args: ['server.mjs'], env: { TOKEN: 'secret-local' } },
        remote: { type: 'http', url: 'https://example.test/mcp', headers: { Authorization: 'Bearer secret-http' } },
        legacy: { type: 'sse', url: 'https://example.test/sse' },
      } });
      expect(statSync(config.path).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(config.path)).mode & 0o077).toBe(0);
    } finally { config.dispose(); }
    expect(existsSync(config.path)).toBe(false);
  });

  it('combines internal host bridges with the selected file in one strict argument', () => {
    const host = ['--mcp-config', '/permission.json', '/canvas.json', '--permission-prompt-tool', 'mcp__cortex__approve', '--mcp-config=/extra-host.json'];
    expect(withClaudeMcpSelection(host, '/selected.json')).toEqual([
      '--permission-prompt-tool', 'mcp__cortex__approve', '--strict-mcp-config', '--no-chrome',
      '--mcp-config', '/selected.json', '/permission.json', '/canvas.json', '/extra-host.json',
    ]);
    expect(host[0]).toBe('--mcp-config');
  });

  it.each([
    { bad: {} },
    { bad: { command: 'node', url: 'https://example.test/mcp' } },
    { bad: { url: 'file:///private/secret' } },
    { bad: { command: 'node', providers: ['grok'] } },
    { cortex: { command: 'node' } },
  ])('refuses incomplete or conflicting selections before starting Claude: %j', async servers => {
    const events = await collect(new ClaudeAdapter('/must-not-start').run({ ...request, mcpServers: servers as unknown as RunRequest['mcpServers'] }, account, new AbortController().signal));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error', retryable: false });
    expect(events[0]).not.toHaveProperty('recovery');
  });

  it.each([{}, { selected: { url: 'https://example.test/mcp', headers: { Authorization: 'Bearer selected-secret' } } }] as NonNullable<RunRequest['mcpServers']>[])('delivers a strict selection and cleans the file after a real child exits', async servers => {
    const folder = temp(), cli = join(folder, 'inspect.mjs'), profile = join(folder, 'untouched-profile.json');
    writeFileSync(profile, '{"unrelated":"keep"}');
    writeFileSync(cli, `import {readFileSync,statSync} from 'node:fs';
      process.stdin.resume(); const args=process.argv.slice(2); const path=args[args.indexOf('--mcp-config')+1];
      console.log(JSON.stringify({type:'result',result:JSON.stringify({args,path,config:JSON.parse(readFileSync(path,'utf8')),mode:statSync(path).mode&511,connectors:process.env.ENABLE_CLAUDEAI_MCP_SERVERS})}));`);
    const events = await collect(new ClaudeAdapter(cli).run({ ...request, mcpServers: servers }, { ...account, homeDir: folder }, new AbortController().signal));
    const result = events.find(event => event.type === 'result');
    expect(result?.type).toBe('result');
    const observed = JSON.parse(result && result.type === 'result' ? result.text : '{}');
    expect(observed.args).toContain('--strict-mcp-config');
    expect(observed.args).toContain('--no-chrome');
    expect(JSON.stringify(observed.args)).not.toContain('selected-secret');
    expect(Object.keys(observed.config.mcpServers)).toEqual(Object.keys(servers));
    expect(observed.connectors).toBe('false');
    expect(observed.mode).toBe(0o600);
    expect(existsSync(observed.path)).toBe(false);
    expect(readFileSync(profile, 'utf8')).toBe('{"unrelated":"keep"}');
  });

  it('keeps the permission bridge active when strict selection is empty', async () => {
    const cli = join(temp(), 'args.mjs');
    writeFileSync(cli, `process.stdin.resume(); console.log(JSON.stringify({type:'result',result:JSON.stringify(process.argv.slice(2))}));`);
    const events = await collect(new ClaudeAdapter(cli).run({ ...request, permissionMode: 'edits', askPermission: true, mcpServers: {}, hostArgs: { args: ['--mcp-config', '/internal-permission.json', '--permission-prompt-tool', 'mcp__cortex__approve'], env: {} } }, account, new AbortController().signal));
    const result = events.find(event => event.type === 'result');
    const args = JSON.parse(result && result.type === 'result' ? result.text : '[]');
    expect(args.filter((value: string) => value === '--mcp-config')).toHaveLength(1);
    expect(args).toContain('/internal-permission.json');
    expect(args).toContain('mcp__cortex__approve');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('does not add strict flags or a temporary config to inherited runs', async () => {
    const cli = join(temp(), 'args.mjs');
    writeFileSync(cli, `process.stdin.resume(); console.log(JSON.stringify({type:'result',result:JSON.stringify(process.argv.slice(2))}));`);
    const events = await collect(new ClaudeAdapter(cli).run(request, account, new AbortController().signal));
    const result = events.find(event => event.type === 'result');
    expect(result).toMatchObject({ text: expect.not.stringContaining('--strict-mcp-config') });
    expect(result).toMatchObject({ text: expect.not.stringContaining('--mcp-config') });
  });

  it.each(['failure', 'cancel'] as const)('removes credential-bearing files after %s', async ending => {
    const folder = temp(), cli = join(folder, 'ending.mjs'), observedPath = join(folder, 'config-path.txt');
    writeFileSync(cli, `import {writeFileSync} from 'node:fs'; process.stdin.resume();
      const args=process.argv.slice(2); writeFileSync(${JSON.stringify(observedPath)},args[args.indexOf('--mcp-config')+1]);
      ${ending === 'failure' ? "process.stderr.write('fixture failure'); process.exit(1);" : "console.log(JSON.stringify({type:'system',subtype:'init',session_id:'fixture-session'})); setInterval(()=>{},10000);"}`);
    const abort = new AbortController();
    const stream = new ClaudeAdapter(cli).run({ ...request, mcpServers: { secret: { command: 'node', env: { TOKEN: 'private-value' } } } }, account, abort.signal);
    if (ending === 'cancel') {
      expect((await stream.next()).value).toMatchObject({ type: 'session' });
      abort.abort();
    }
    await collect(stream);
    expect(existsSync(readFileSync(observedPath, 'utf8'))).toBe(false);
  });

  it('blocks unsupported providers before spawn, HTTP, or profile setup, even with an empty map', async () => {
    const fetch = vi.fn();
    const adapters = [new CodexAdapter('/must-not-start'), new GrokAdapter('/must-not-start'), new CopilotAdapter('/must-not-start'), new OpenRouterAdapter(fetch)];
    for (const adapter of adapters) {
      const buildEnv = vi.spyOn(adapter, 'buildEnv');
      const events = await collect(adapter.run({ ...request, mcpServers: {} }, { ...account, provider: adapter.id }, new AbortController().signal));
      expect(events).toEqual([{ type: 'error', message: expect.stringContaining('keine begrenzte MCP-Auswahl'), retryable: false }]);
      // ACP adapters currently construct their env before the transport guard;
      // only Codex's env construction would change shared plugin profile links.
      if (adapter.id === 'codex') expect(buildEnv).not.toHaveBeenCalled();
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
