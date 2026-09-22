import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { claudeRateLimit } from '../src/adapters/limits.js';
import { shareCodexPluginHost, unwrapErrorMessage } from '../src/adapters/codex.js';
import { JsonRpcProcess } from '../src/adapters/jsonRpc.js';
import { codexImageEvent } from '../src/adapters/images.js';
import { runAcp } from '../src/adapters/acp.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';
import type { LiveRunHandle } from '../src/adapters/adapter.js';

const folders: string[] = [];
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'cx-reliability-')); folders.push(path); return path; };
const fixture = (code: string) => { const path = join(temp(), 'claude-test.mjs'); writeFileSync(path, code); return path; };
const account: ResolvedAccount = { id: 't', provider: 'claude', label: 't', authMode: 'managed-home', hasSecret: false, priority: 0 };
const collect = async (stream: AsyncIterable<AdapterEvent>) => { const events: AdapterEvent[] = []; for await (const event of stream) events.push(event); return events; };
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe('Claude failure handling (#48–53)', () => {
  it('fails closed if ask mode has no permission bridge', async () => {
    const events = await collect(new ClaudeAdapter('/missing-claude').run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'edits', askPermission: true }, account, new AbortController().signal));
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('Genehmigungsabfrage'), retryable: false }]);
  });
  it('supplies the actual permission hook without bypass/acceptEdits flags', async () => {
    const cli = fixture(`process.stdin.resume(); console.log(JSON.stringify({type:'result', result:process.argv.slice(2).join(' ')}));`);
    const events = await collect(new ClaudeAdapter(cli).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'edits', askPermission: true, hostArgs: { args: ['--permission-prompt-tool', 'mcp__cortex__approve'], env: {} } }, account, new AbortController().signal));
    const result = events.find(e => e.type === 'result');
    expect(result).toMatchObject({ text: expect.stringContaining('--permission-prompt-tool mcp__cortex__approve') });
    expect(result?.type === 'result' && result.text).not.toMatch(/skip-permissions|acceptEdits/);
  });
  it('ends a stalled rate-limit retry and clears the live handle', async () => {
    const cli = fixture(`process.stdin.resume(); console.log(JSON.stringify({type:'system',subtype:'api_retry',error:'rate_limit'})); setInterval(()=>{},10000);`);
    const handle: LiveRunHandle = {};
    const events = await collect(new ClaudeAdapter(cli).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'safe', handle }, account, new AbortController().signal));
    expect(events).toEqual([{ type: 'limit', scope: 'unknown', resetAt: undefined, raw: expect.stringContaining('api_retry') }]);
    expect(handle.inject).toBeUndefined();
  });
  it('surfaces asynchronous EPIPE instead of hanging or crashing the host', async () => {
    const cli = fixture(`import {closeSync} from 'node:fs'; closeSync(0); setTimeout(()=>console.log(JSON.stringify({type:'system',subtype:'init',session_id:'s'})),20); setInterval(()=>{},10000);`);
    const handle: LiveRunHandle = {};
    const stream = new ClaudeAdapter(cli).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'safe', handle }, account, new AbortController().signal);
    expect((await stream.next()).value).toMatchObject({ type: 'session' });
    handle.inject!('x'.repeat(100000));
    const tail = await collect(stream);
    expect(tail.some(e => e.type === 'error' && /EPIPE|abgebrochen/i.test(e.message))).toBe(true);
    expect(handle.inject).toBeUndefined();
  });
  it('gives setup guidance for a missing Claude executable', async () => {
    const events = await collect(new ClaudeAdapter(join(temp(), 'claude')).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'safe' }, account, new AbortController().signal));
    expect(events).toContainEqual({ type: 'error', retryable: false, message: expect.stringContaining('Installiere Claude Code'), recovery: 'install-claude' });
  });
  it('does not label an unfamiliar terminal subagent status as success', async () => {
    const cli = fixture(`process.stdin.resume(); for (const event of [
      {type:'assistant',message:{content:[{type:'tool_use',id:'agent',name:'Agent',input:{}}]}},
      {type:'system',subtype:'task_notification',tool_use_id:'agent',status:'unexpected_failure'},
      {type:'result',result:'done'}]) console.log(JSON.stringify(event));`);
    const events = await collect(new ClaudeAdapter(cli).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'safe' }, account, new AbortController().signal));
    expect(events.find(e => e.type === 'agent-end')).toMatchObject({ status: 'failed' });
  });
  it('keeps the main assistant checkpoint when a subagent speaks later (#46)', async () => {
    const cli = fixture(`process.stdin.resume(); for (const event of [
      {type:'assistant',uuid:'main-checkpoint',message:{content:[]}},
      {type:'assistant',uuid:'subagent-checkpoint',parent_tool_use_id:'agent',message:{content:[]}},
      {type:'result',result:'done'}]) console.log(JSON.stringify(event));`);
    const events = await collect(new ClaudeAdapter(cli).run({ prompt: 'go', cwd: process.cwd(), permissionMode: 'safe' }, account, new AbortController().signal));
    expect(events.find(e => e.type === 'result')).toMatchObject({ checkpoint: 'main-checkpoint' });
  });
  it.each([['seven_day_opus', 'weekly'], ['five_hour', 'session'], ['organization_cap', 'unknown']])('preserves scope/reset for %s', (rateLimitType, scope) => {
    expect(claudeRateLimit({ rateLimitType, resetsAt: 1_900_000_000 }, 'raw')).toEqual({ scope, resetAt: 1_900_000_000_000, raw: 'raw' });
    expect(claudeRateLimit({ rateLimitType, resetsAt: 1_900_000_000_000 }, 'raw').resetAt).toBe(1_900_000_000_000);
  });
});

describe('Codex errors, plugin host and images (#54,58,68)', () => {
  it('links only a directory containing the executable host', () => {
    const root = temp(), home = join(root, 'profile'), shared = join(root, 'shared');
    mkdirSync(shared); shareCodexPluginHost(home, shared);
    expect(existsSync(join(home, 'plugins/.plugin-appserver'))).toBe(false);
    const binary = join(shared, 'codex-code-mode-host');
    mkdirSync(binary); shareCodexPluginHost(home, shared);
    expect(existsSync(join(home, 'plugins/.plugin-appserver'))).toBe(false);
    rmSync(binary, { recursive: true }); writeFileSync(binary, 'fake'); chmodSync(binary, 0o755);
    shareCodexPluginHost(home, shared);
    expect(readFileSync(join(home, 'plugins/.plugin-appserver/codex-code-mode-host'), 'utf8')).toBe('fake');
  });
  it.each([
    ['{"error":{"message":"Limit exceeded"}}', 'Limit exceeded'],
    [JSON.stringify(JSON.stringify({ error: { message: 'Limit exceeded' } })), 'Limit exceeded'],
    ['HTTP 400: {"error":{"error":{"message":"Bad input"}}}', 'Bad input'],
    ['{broken json', '{broken json'],
  ])('unwraps %s', (input, expected) => expect(unwrapErrorMessage(input)).toBe(expected));
  it('keeps four id-less images distinct even within one millisecond', () => {
    const root = temp();
    const paths = Array.from({ length: 4 }, (_, i) => codexImageEvent({ type: 'imageGeneration', result: Buffer.from(`image-${i}`).toString('base64') }, root, 'thread')!.path);
    expect(new Set(paths).size).toBe(4);
    expect(paths.map(path => readFileSync(path, 'utf8'))).toEqual(['image-0', 'image-1', 'image-2', 'image-3']);
    const a = codexImageEvent({ type: 'imageGeneration', id: 'a/b', result: 'YQ==' }, root, 'thread')!;
    const b = codexImageEvent({ type: 'imageGeneration', id: 'a_b', result: 'Yg==' }, root, 'thread')!;
    expect(a.path).not.toBe(b.path);
  });
});

describe('JSON-RPC transport (#55,61)', () => {
  it('reassembles split UTF-8 lines and settles requests immediately on dispose', async () => {
    const script = fixture(`import {createInterface} from 'node:readline'; createInterface({input:process.stdin}).on('line',line=>{ const m=JSON.parse(line); if(m.method==='split'){ const bytes=Buffer.from(JSON.stringify({id:m.id,result:{text:'Tätigkeit'}})+'\\n'); const at=bytes.indexOf(0xc3)+1; process.stdout.write(bytes.subarray(0,at)); setTimeout(()=>process.stdout.write(bytes.subarray(at)),10); } });`);
    const rpc = new JsonRpcProcess(process.execPath, [script], { cwd: process.cwd(), env: process.env, signal: new AbortController().signal, onNotification: () => {} });
    rpc.start();
    try {
      expect(await rpc.request('split', {})).toEqual({ text: 'Tätigkeit' });
      const pending = rpc.request('silent', {});
      rpc.dispose();
      await expect(pending).rejects.toThrow('process was closed');
    } finally { rpc.dispose(); }
  });
});

describe('Grok never launches interactive authentication from a run (#62)', () => {
  it.each([false, true])('returns a reconnect action with cached auth available=%s', async cached => {
    const log = join(temp(), 'calls.jsonl');
    const script = fixture(`import {appendFileSync} from 'node:fs'; import {createInterface} from 'node:readline';
      createInterface({input:process.stdin}).on('line', line => {
        const m=JSON.parse(line); appendFileSync(${JSON.stringify(log)}, line+'\\n');
        const result=m.method==='initialize' ? {result:{authMethods:[{id:${JSON.stringify(cached ? 'cached_token' : 'oauth')}}]}} : {error:{code:401,message:'token expired'}};
        console.log(JSON.stringify({id:m.id,...result}));
      });`);
    const events = await collect(runAcp({ command: process.execPath, args: [script], env: process.env, configureGrokSession: true,
      req: { prompt: 'hello', cwd: process.cwd(), permissionMode: 'safe' }, signal: new AbortController().signal, detectLimit: () => undefined }));
    expect(events.at(-1)).toMatchObject({ type: 'error', recovery: 'reconnect-grok', retryable: false });
    const calls = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const auth = calls.filter(call => call.method === 'authenticate');
    expect(auth).toHaveLength(cached ? 1 : 0);
    if (cached) expect(auth[0].params).toEqual({ methodId: 'cached_token', _meta: { headless: true } });
    expect(calls.some(call => call.method === 'session/new')).toBe(false);
  });
});
