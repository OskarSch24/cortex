import { readProviderUsage } from './providerUsage.js';
import { readCodexUsage, reportsLimits, type QuotaTracker } from '@cortex/core';
import type { AccountStore } from './storage/accountStore.js';

/** Passive refresh: local usage metadata only. Opening Cortex must never unlock
 * Keychain or read SecretStorage to poll an undocumented provider endpoint.
 * Explicit user inspection uses provider-owned CLI control requests, without a model turn. */
export async function refreshUsage(accounts: AccountStore, quota: QuotaTracker, log?: (line: string) => void, live?: { cliPath: (provider: string, fallback: string) => string }): Promise<void> {
  for (const account of accounts.all()) {
    if (!account.homeDir || account.disabled || account.authMode !== 'managed-home') continue;
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

const liveData = new Set<string>();
const inFlight = new Set<string>();
const lastRead = new Map<string, number>();
