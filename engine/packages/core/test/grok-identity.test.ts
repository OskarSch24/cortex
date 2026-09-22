import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAccountIdentity } from '../src/accounts/identity.js';
import type { AccountProfile } from '../src/types.js';

const dirs: string[] = [];
const jwt = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
function profile(cache: object): AccountProfile {
  const homeDir = mkdtempSync(join(tmpdir(), 'cortex-grok-identity-'));
  dirs.push(homeDir);
  mkdirSync(join(homeDir, '.grok'));
  writeFileSync(join(homeDir, '.grok', 'auth.json'), JSON.stringify(cache));
  return { id: 'test', provider: 'grok', label: 'privat', authMode: 'managed-home', homeDir, hasSecret: false, priority: 1 };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
describe('Grok OAuth account identity', () => {
  it('reads scoped userinfo when the current CLI access token has no email claim', async () => {
    const account = profile({ 'https://auth.x.ai::test-client': {
      key: jwt({ iss: 'https://auth.x.ai', sub: 'test-user', principal_id: 'test-user' }),
      auth_mode: 'oauth', user_id: 'test-user', email: 'private@example.com',
    } });
    expect(await getAccountIdentity(account)).toBe('private@example.com');
  });
  it('keeps identities separated across private and business profiles', async () => {
    const a = profile({ 'https://auth.x.ai::test-client': { email: 'private@example.com' } });
    const b = profile({ 'https://auth.x.ai::test-client': { email: 'work@example.com' } });
    expect(await getAccountIdentity(a)).toBe('private@example.com');
    expect(await getAccountIdentity(b)).toBe('work@example.com');
  });
  it('does not accept userinfo from another issuer', async () => {
    const account = profile({ 'https://other.example::test-client': { email: 'wrong@example.com' } });
    expect(await getAccountIdentity(account)).toBeUndefined();
  });
  it('retains compatibility with tokens that contain the email claim', async () => {
    const account = profile({ 'https://auth.x.ai::test-client': { key: jwt({ email: 'work@example.com' }) } });
    expect(await getAccountIdentity(account)).toBe('work@example.com');
  });
});
