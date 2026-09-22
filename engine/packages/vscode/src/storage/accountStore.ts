import * as vscode from 'vscode';
import {
  resolveTargetAccount,
  type AccountProfile,
  type ResolvedAccount,
  type Target,
} from '@cortex/core';
import { archiveProfile } from './profileArchive.js';

const KEY = 'cortex.accounts';
/** Retired on 2026-09-08: Gemini was removed from Cortex at the user's request. */
const RETIRED_PROVIDERS: ReadonlySet<string> = new Set(['gemini']);
const secretKey = (id: string) => `cortex.secret.${id}`;

export class AccountStore {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(private ctx: vscode.ExtensionContext) {}

  all(): AccountProfile[] {
    // Providers that were removed from the product can still sit in stored
    // state from an older build. Dropping them here keeps a retired account
    // from resurfacing as an unknown provider that nothing can run.
    return this.ctx.globalState
      .get<AccountProfile[]>(KEY, [])
      .filter(a => !RETIRED_PROVIDERS.has(a.provider as string))
      .map(a => ({ ...a, disabled: a.disabled || (a.authMode === 'managed-home' && !a.verifiedAt) }));
  }

  async upsert(account: AccountProfile): Promise<void> {
    const accounts = this.all().filter((a) => a.id !== account.id);
    accounts.push(account);
    await this.ctx.globalState.update(KEY, accounts);
    this.emitter.fire();
  }

  async remove(id: string): Promise<void> {
    const removed = this.all().find(a => a.id === id);
    await this.ctx.globalState.update(
      KEY,
      this.all().filter((a) => a.id !== id),
    );
    // Managed OAuth profiles have no host secret; deleting one must not unlock Keychain.
    // Provider-owned credentials stay in the isolated profile for safe recovery —
    // moved to ~/.cortex/profiles-archiv, so profiles/ lists only accounts in use.
    if (removed?.hasSecret) await this.ctx.secrets.delete(secretKey(id));
    if (removed?.homeDir && !this.all().some((a) => a.homeDir === removed.homeDir)) {
      try { archiveProfile(removed.homeDir); } catch { /* bleibt liegen; der nächste Start räumt auf */ }
    }
    this.emitter.fire();
  }

  async setSecret(id: string, value: string): Promise<void> {
    await this.ctx.secrets.store(secretKey(id), value);
  }

  async getSecret(id: string): Promise<string | undefined> {
    return this.ctx.secrets.get(secretKey(id));
  }

  async resolve(target: Target): Promise<ResolvedAccount | undefined> {
    const account = resolveTargetAccount(target, this.all());
    if (!account) return undefined;
    const secret = account.hasSecret ? await this.getSecret(account.id) : undefined;
    return { ...account, secret };
  }
}
