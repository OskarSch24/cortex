import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { grokAuthOk, type AccountProfile } from '@cortex/core';
import type { AccountStore } from './storage/accountStore.js';

export type AuthHealth = 'ok' | 'expired' | 'unknown';

const INTERVAL_MS = 180_000;
const NOTIFY_COOLDOWN_MS = 30 * 60_000;

export async function probeAccount(
  account: AccountProfile,
  _cliPath: (provider: string, fallback: string) => string,
): Promise<AuthHealth> {
  try {
    switch (account.provider) {
      case 'claude': {
        // Claude stores credentials in Keychain on macOS. Absence of a token file
        // does not mean signed out, and background CLI probes can show OS prompts.
        return account.verifiedAt ? 'ok' : 'unknown';
      }
      case 'codex': {
        if (!account.homeDir) return 'unknown';
        return existsSync(join(account.homeDir, 'auth.json')) ? 'ok' : 'expired';
      }
      case 'copilot': {
        if (!account.homeDir) return account.hasSecret ? 'ok' : 'unknown';
        return existsSync(join(account.homeDir, 'config.json')) ? 'ok' : 'expired';
      }
      case 'grok': {
        if (!account.homeDir) return 'unknown';
        return grokAuthOk(account.homeDir) ? 'ok' : 'expired';
      }
      default:
        return account.hasSecret ? 'ok' : 'unknown';
    }
  } catch {
    return 'unknown';
  }
}

/**
 * Keeps subscription CLIs from silently dying. Isolated profiles stay on disk;
 * this only *checks* them and asks you to re-authorize when a login is gone.
 */
export function startAuthWatch(
  ctx: vscode.ExtensionContext,
  accounts: AccountStore,
  cliPath: (provider: string, fallback: string) => string,
  health: Map<string, AuthHealth>,
  onChange: () => void,
  output: vscode.OutputChannel,
): void {
  const lastNotify = new Map<string, number>();

  let checking = false;
  const tick = async () => {
    if (checking) return;
    checking = true;
    try {
    let changed = false;
    for (const account of accounts.all()) {
      const next = await probeAccount(account, cliPath);
      const prev = health.get(account.id);
      if (prev !== next) {
        health.set(account.id, next);
        changed = true;
        output.appendLine(`[auth] ${account.provider}:${account.label} → ${next}`);
      }
      if (next === 'expired') {
        const last = lastNotify.get(account.id) ?? 0;
        if (Date.now() - last < NOTIFY_COOLDOWN_MS) continue;
        lastNotify.set(account.id, Date.now());
        const action = await vscode.window.showWarningMessage(
          `Cortex: ${account.provider}:${account.label} is signed out. Reconnect so the link stays on this Mac.`,
          'Reconnect',
        );
        if (action === 'Reconnect') {
          void vscode.commands.executeCommand('cortex.reconnectAccount', account.id);
        }
      } else if (next === 'ok') {
        lastNotify.delete(account.id);
      }
    }
    if (changed) onChange();
    } finally { checking = false; }
  };

  ctx.subscriptions.push(accounts.onDidChange(() => void tick()));
  void tick();
  const timer = setInterval(() => void tick(), INTERVAL_MS);
  ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
}
