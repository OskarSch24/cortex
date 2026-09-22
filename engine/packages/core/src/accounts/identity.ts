import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AccountProfile } from '../types.js';

/**
 * Best-effort identity (usually the login email) for an account, read from
 * each CLI's local state — so the accounts panel can show WHICH claude/google/
 * github identity a profile belongs to. Never throws; undefined when unknown.
 */
export async function getAccountIdentity(
  account: AccountProfile,
  _claudeCliPath = 'claude',
): Promise<string | undefined> {
  if (account.identity) return account.identity;
  try {
    switch (account.provider) {
      case 'grok': {
        if (!account.homeDir) return undefined;
        const nested = join(account.homeDir, '.grok', 'auth.json');
        const flat = join(account.homeDir, 'auth.json');
        if (!existsSync(nested) && !existsSync(flat)) return undefined;
        const parsed = JSON.parse(readFileSync(existsSync(nested) ? nested : flat, 'utf8'));
        const email = parsed.email ?? parsed.user?.email ?? parsed.account?.email;
        if (typeof email === 'string' && email.includes('@')) return email;
        // Grok stores userinfo beside the access token inside the issuer entry.
        // Its access token has principal claims, but normally no email claim.
        for (const [scope, entry] of Object.entries(parsed)) {
          if (!scope.startsWith('https://auth.x.ai::') || !entry || typeof entry !== 'object') continue;
          const userinfo = (entry as { email?: unknown }).email;
          if (typeof userinfo === 'string' && userinfo.includes('@')) return userinfo;
          const key = (entry as { key?: unknown }).key;
          const email = typeof key === 'string' ? emailFromJwt(key) : undefined;
          if (email) return email;
        }
        const token = parsed.id_token ?? parsed.tokens?.id_token;
        return typeof token === 'string' ? emailFromJwt(token) : undefined;
      }
      case 'codex': {
        if (!account.homeDir) return undefined;
        const file = join(account.homeDir, 'auth.json');
        if (!existsSync(file)) return undefined;
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
        if (typeof parsed.email === 'string') return parsed.email;
        const idToken = (parsed.tokens as Record<string, unknown> | undefined)?.id_token;
        if (typeof idToken === 'string') return emailFromJwt(idToken);
        return undefined;
      }
      case 'claude': {
        if (!account.homeDir) return undefined;
        // Public CLI preferences only. Never run auth/status or unlock Keychain in the background.
        for (const name of ['.claude.json', 'claude.json']) {
          const file = join(account.homeDir, name);
          if (!existsSync(file)) continue;
          const value = JSON.parse(readFileSync(file, 'utf8'));
          const email = value.oauthAccount?.emailAddress;
          if (typeof email === 'string') return email;
        }
        return undefined;
      }
      case 'copilot': {
        if (!account.homeDir) return undefined;
        const file = join(account.homeDir, 'config.json');
        if (!existsSync(file)) return undefined;
        // JSONC — strip line comments before parsing.
        const raw = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const last = parsed.lastLoggedInUser as Record<string, unknown> | undefined;
        if (last && typeof last.login === 'string') return last.login;
        return undefined;
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function emailFromJwt(jwt: string): string | undefined {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof decoded.email === 'string' ? decoded.email : undefined;
  } catch {
    return undefined;
  }
}
