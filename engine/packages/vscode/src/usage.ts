import { readGrokUsage, readProviderUsage } from './providerUsage.js';
import { fetchOpenRouterLimits, fetchZaiLimits, grokAuthOk, readCodexUsage, reportsLimits, type AccountProfile, type QuotaTracker, type UsageWindow } from '@cortex/core';
import type { AccountStore } from './storage/accountStore.js';

/** Passive refresh: local usage metadata only. Opening Cortex must never unlock
 * Keychain or read SecretStorage to poll an undocumented provider endpoint.
 * Explicit user inspection uses provider-owned CLI control requests, without a model turn. */
export async function refreshUsage(accounts: AccountStore, quota: QuotaTracker, log?: (line: string) => void, live?: { cliPath: (provider: string, fallback: string) => string }): Promise<void> {
  for (const account of accounts.all()) {
    if (account.disabled) continue;
    // Schlüssel-Konten fragen ihre API — nur auf ausdrücklichen Wunsch, dann
    // liest Cortex den Schlüssel aus dem Schlüsselbund.
    if (account.provider === 'openrouter' || account.provider === 'zai' || account.provider === 'grok') {
      if (live) await readLive(account, quota, log, () => apiWindows(account, accounts, live.cliPath));
      continue;
    }
    if (!account.homeDir || account.authMode !== 'managed-home') continue;
    if (live && reportsLimits(account.provider)) {
      const key = account.id;
      if (!inFlight.has(key) && Date.now() - (lastRead.get(key) ?? 0) > 180000) {
        inFlight.add(key); lastRead.set(key, Date.now());
        try {
          const windows = await readProviderUsage(account, live.cliPath(account.provider, account.provider));
          if (windows.length) { quota.setUsage(account.id, windows); liveData.add(account.id); }
        } catch { log?.(`[usage] ${account.provider}: Limits nicht gemeldet.`); }
        finally { inFlight.delete(key); }
      }
      continue;
    }
    if (account.provider !== 'codex' || liveData.has(account.id)) continue;
    try {
      const windows = readCodexUsage(account.homeDir);
      if (windows.length) quota.setUsage(account.id, windows);
    } catch { log?.(`[usage] ${account.provider}:${account.label}: Lokale Nutzungsdaten nicht verfügbar.`); }
  }
}

async function apiWindows(account: AccountProfile, accounts: AccountStore, cliPath: (provider: string, fallback: string) => string): Promise<UsageWindow[]> {
  if (account.provider === 'grok') return account.homeDir && grokAuthOk(account.homeDir) ? readGrokUsage(account, cliPath('grok', 'grok')) : [];
  const key = account.hasSecret ? await accounts.getSecret(account.id) : undefined;
  if (!key) return [];
  const signal = AbortSignal.timeout(15_000);
  return account.provider === 'zai' ? fetchZaiLimits(key, undefined, signal) : fetchOpenRouterLimits(key, undefined, signal);
}

async function readLive(account: AccountProfile, quota: QuotaTracker, log: ((line: string) => void) | undefined, read: () => Promise<UsageWindow[]>): Promise<void> {
  const key = account.id;
  if (inFlight.has(key) || Date.now() - (lastRead.get(key) ?? 0) <= 180000) return;
  inFlight.add(key); lastRead.set(key, Date.now());
  try {
    const windows = await read();
    if (windows.length) quota.setUsage(account.id, windows);
    else log?.(`[usage] ${account.provider}:${account.label}: keine Limits gemeldet.`);
  } catch { log?.(`[usage] ${account.provider}:${account.label}: Limits nicht abrufbar.`); }
  finally { inFlight.delete(key); }
}

const liveData = new Set<string>();
const inFlight = new Set<string>();
const lastRead = new Map<string, number>();
