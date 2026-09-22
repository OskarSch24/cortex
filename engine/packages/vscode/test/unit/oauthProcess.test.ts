import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { authorizationUrl, verifiedIdentity, vendorLogin } from '../../src/onboarding/oauthProcess.js';
import { probeAccount } from '../../src/authWatch.js';
import { refreshUsage } from '../../src/usage.js';
import { getAccountIdentity, type AccountProfile } from '@cortex/core';
vi.mock('node:child_process', () => ({ spawn: vi.fn(), execFile: vi.fn(), execFileSync: vi.fn() }));
const profile: AccountProfile = { id: 'a', provider: 'claude', label: 'privat', authMode: 'managed-home', homeDir: '/nonexistent/cortex-test', hasSecret: false, priority: 1 };
function processMock() {
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(child as any);return child;
}
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
describe('quiet startup', () => {
  it('does not invoke provider CLIs or SecretStorage for background identity, health and usage', async () => {
    const getSecret = vi.fn();
    expect(await probeAccount(profile, (_p, f) => f)).toBe('unknown');
    expect(await getAccountIdentity(profile)).toBeUndefined();
    await refreshUsage({ all: () => [profile, {...profile, id:'b', provider:'copilot', authMode:'api-key', hasSecret:true}], getSecret } as any, { setUsage: vi.fn() } as any);
    expect(spawn).not.toHaveBeenCalled();expect(getSecret).not.toHaveBeenCalled();
  });
  it('retains the last verified public identity without a startup login', async () => {
    expect(await getAccountIdentity({...profile, identity:'work@example.com'})).toBe('work@example.com');
    expect(await probeAccount({...profile, verifiedAt:1}, (_p,f)=>f)).toBe('ok');
    expect(spawn).not.toHaveBeenCalled();
  });
});
describe('explicit browser OAuth', () => {
  it('accepts only the relevant provider authorization URL', () => {
    expect(authorizationUrl('https://claude.ai/oauth/authorize?state=abc', 'claude')).toContain('state=abc');
    expect(authorizationUrl('https://claude.ai.attacker.test/oauth/authorize', 'claude')).toBeUndefined();
    expect(authorizationUrl('https://claude.ai/oauth/authorize', 'codex')).toBeUndefined();
    expect(authorizationUrl('https://secret@claude.ai/oauth/authorize', 'claude')).toBeUndefined();
  });
  it('requires loggedIn and an identity, not just process exit 0', async () => {
    const child=processMock();const result=verifiedIdentity('claude',profile,{});
    child.stdout.write(JSON.stringify({loggedIn:false,email:'wrong@example.com'}));child.emit('close',0);
    expect(await result).toBeUndefined();
  });
  it('returns the verified email after explicit login', async () => {
    const child=processMock();const result=verifiedIdentity('claude',profile,{});
    child.stdout.write(JSON.stringify({loggedIn:true,email:'work@example.com'}));child.emit('close',0);
    expect(await result).toBe('work@example.com');
  });
  it('captures provider URLs, aborts the child and rejects cancelled login', async () => {
    const child=processMock(), abort=new AbortController(), urls=vi.fn();
    const result=vendorLogin('claude',['auth','login'],profile,{},abort.signal,urls);
    child.stdout.write('https://claude.ai/oauth/authorize?state=abc\n');
    expect(urls).toHaveBeenCalledOnce();abort.abort();
    await expect(result).rejects.toThrow('abgebrochen');expect(child.kill).toHaveBeenCalled();
  });
});
