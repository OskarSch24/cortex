import * as vscode from 'vscode';
import { accessSync, constants, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { ClaudeAdapter, buildChildEnv, shortId, slugify, type AccountProfile, type AdapterRegistry, type ProviderId } from '@cortex/core';
import { vendorLogin, verifiedIdentity } from './oauthProcess.js';
import type { AccountStore } from '../storage/accountStore.js';

export interface ConnectOptions {
  provider?: ProviderId;
  subscriptionOnly?: boolean;
  label?: string;
  accountId?: string;
  email?: string;
  onProgress?: (state: 'connecting' | 'review' | 'connected' | 'error', message: string, detail?: { attemptId?: string; identity?: string; url?: string }) => void;
}
const pending = new Map<ProviderId, { attemptId: string; abort: AbortController; confirm?: (accept: boolean) => void }>();
export function respondToConnection(provider: ProviderId, attemptId: string, accept: boolean): void {
  const flow = pending.get(provider);
  if (!flow || flow.attemptId !== attemptId) return;
  if (!accept) { flow.confirm?.(false); flow.abort.abort(); } else flow.confirm?.(true);
}
const PROVIDERS: ProviderId[] = ['claude', 'codex', 'grok'];

export function availableLabel(accounts: AccountProfile[], provider: ProviderId, label?: string, ignoreId?: string): string {
  const base = slugify(label?.trim() || 'privat') || 'privat';
  const taken = new Set(accounts.filter(a => a.provider === provider && a.id !== ignoreId).map(a => a.label));
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

function executable(command: string): string | undefined {
  const paths = isAbsolute(command) ? [command] : (process.env.PATH ?? '').split(delimiter).map(p => join(p, command));
  return paths.find(path => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } });
}

/** Isolated vendor OAuth followed by explicit identity confirmation. */
export async function addAccountWizard(accounts: AccountStore, adapters: AdapterRegistry, options: ConnectOptions = {}): Promise<void> {
  let provider = options.provider;
  if (!provider) {
    const choice = await vscode.window.showQuickPick(
      adapters.all().filter(a => PROVIDERS.includes(a.id)).map(a => ({ label: a.displayName, id: a.id })),
      { title: 'KI-Abo verbinden', placeHolder: 'Anbieter wählen' },
    );
    if (!choice) return;
    provider = choice.id;
  }
  const progress = options.onProgress ?? (() => {});
  if (!PROVIDERS.includes(provider)) return;
  if (pending.has(provider)) {
    progress('connecting', 'Eine Anmeldung für diesen Anbieter ist bereits geöffnet.');
    return;
  }
  const adapter = adapters.get(provider);
  if (!adapter) return;
  const existing = options.accountId ? accounts.all().find(a => a.id === options.accountId && a.provider === provider) : undefined;
  if (options.accountId && !existing) return;
  let requestedLabel = existing?.label ?? options.label;
  if (requestedLabel === undefined) {
    requestedLabel = await vscode.window.showInputBox({ title: `${adapter.displayName}: Konto benennen`, prompt: 'Zum Beispiel privat, firma oder kunde. Jedes Konto erhält eine eigene Anmeldung.', value: availableLabel(accounts.all(), provider) });
    if (requestedLabel === undefined) return;
  }
  const label = availableLabel(accounts.all(), provider, requestedLabel, existing?.id);
  const id = existing?.id ?? `${provider}-${shortId()}`;
  // A reconnect authenticates into a fresh directory and replaces only the same account after success.
  // Failed/cancelled login never changes the existing profile or its session.
  const profileDir = join(homedir(), '.cortex', 'profiles', `${id}-${shortId()}`);
  mkdirSync(profileDir, { recursive: true, mode: 0o700 });
  const flow = provider === 'claude' ? (adapter as ClaudeAdapter).managedLoginFlow(profileDir) : adapter.loginFlow(profileDir);
  const [command, ...args] = flow.terminalCommand;
  const binary = command && executable(command);
  if (!binary) {
    const message = `${adapter.displayName} ist noch nicht installiert oder nicht im PATH. Installiere das offizielle Anbieter-Programm oder hinterlege seinen Pfad in den Cortex-Einstellungen.`;
    progress('error', message);
    void vscode.window.showErrorMessage(message);
    return;
  }
  const attemptId = shortId();
  const abort = new AbortController();
  const pendingFlow: { attemptId: string; abort: AbortController; confirm?: (accept: boolean) => void } = { attemptId, abort };
  pending.set(provider, pendingFlow);
  const profile: AccountProfile = { ...existing, id, provider, label, authMode: 'managed-home', homeDir: profileDir, hasSecret: false, disabled: false, identity: undefined, verifiedAt: undefined, priority: existing?.priority ?? accounts.all().length + 1 };
  const env = { ...buildChildEnv(profile, process.env), ...flow.env };
  if (provider === 'claude' && options.email?.trim()) args.push('--email', options.email.trim());
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; pendingFlow.confirm?.(false); abort.abort(); }, 180_000);
  try {
    progress('connecting', 'Die Anmeldung wird vorbereitet. Sobald der Anbieter bereit ist, öffnet sich die Kontoauswahl im Browser.', { attemptId });
    await vendorLogin(binary, args, profile, env, abort.signal, url => {
      progress('connecting', 'Melde dich im Browser an. Danach zeigt Cortex dir das erkannte Konto zur Prüfung.', { attemptId, url });
    });
    if (abort.signal.aborted) return;
    const identity = await verifiedIdentity(binary, profile, env);
    if (abort.signal.aborted) throw new Error('Anmeldung abgebrochen.');
    if (!identity || (provider === 'grok' && identity === 'Grok account')) {
      throw new Error('Der Anbieter hat keine verifizierbare Kontoidentität zurückgegeben. Dieses Profil wurde nicht als verbunden gespeichert. Bitte erneut anmelden.');
    }
    const mismatched = options.email?.trim() && identity.toLowerCase() !== options.email.trim().toLowerCase();
    const review = mismatched
      ? `Abweichende E-Mail: Gewünscht war ${options.email!.trim()}, angemeldet bist du als ${identity}. Trotzdem dieses erkannte Konto als „${label}“ verbinden?`
      : `Angemeldet als ${identity}. Ist das das richtige Konto für „${label}“?`;
    const accepted = options.onProgress ? await new Promise<boolean>(resolve => {
      pendingFlow.confirm = resolve;
      progress('review', review, { attemptId, identity });
    }) : (await vscode.window.showInformationMessage(review, { modal: true }, 'Konto verbinden')) === 'Konto verbinden';
    if (!accepted || abort.signal.aborted) { progress('error', timedOut ? 'Die Anmeldung wurde nach 3 Minuten beendet. Bitte erneut starten.' : 'Anmeldung verworfen. Du kannst ein anderes Konto auswählen.'); return; }
    if (existing && !accounts.all().some(a => a.id === existing.id)) return;
    await accounts.upsert({ ...profile, identity, verifiedAt: Date.now() });
    progress('connected', `${identity} ist als „${label}“ verbunden.`, { identity });
  } catch (e) {
    progress('error', timedOut ? 'Die Anmeldung wurde nach 3 Minuten beendet. Bitte erneut starten.' : (e as Error).message);
  } finally {
    clearTimeout(timeout);
    pending.delete(provider);
  }
}
