import { spawn } from 'node:child_process';
import { getAccountIdentity, type AccountProfile, type ProviderId } from '@cortex/core';

const LOGIN_HOSTS: Partial<Record<ProviderId, string[]>> = {
  claude: ['claude.ai', 'platform.claude.com', 'console.anthropic.com'],
  codex: ['auth.openai.com', 'chatgpt.com'],
  grok: ['auth.x.ai', 'accounts.x.ai', 'grok.com', 'x.ai'],
};
export function authorizationUrl(text: string, provider: ProviderId): string | undefined {
  // The CLI creates PKCE/state/callbacks. Only pass its HTTPS authorization URL through.
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  for (const candidate of clean.match(/https:\/\/[^\s<>"\x1b]+/g) ?? []) {
    try { const url = new URL(candidate); if (!url.username && !url.password && LOGIN_HOSTS[provider]?.includes(url.hostname) && /oauth|authorize|login|device/.test(url.pathname)) return url.href; } catch { /* incomplete chunk */ }
  }
  return undefined;
}

/** Browser OAuth driven by the vendor CLI, with no interactive shell or terminal UI. */
export async function vendorLogin(binary: string, args: string[], profile: AccountProfile, env: NodeJS.ProcessEnv, signal: AbortSignal, onUrl: (url: string) => void): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // A single process owns the login and the OAuth callback, including cancellation.
    const child = spawn(binary, args, { env, cwd: profile.homeDir, stdio: ['pipe', 'pipe', 'pipe'] });
    let tail = '', seenUrl = '', settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); child.kill('SIGTERM'); if (error) reject(error); else resolve(); };
    const abort = () => finish(new Error('Anmeldung abgebrochen.'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    const observe = (data: Buffer) => { tail = (tail + data.toString()).slice(-32_768); const url = authorizationUrl(tail, profile.provider); if (url && url !== seenUrl) { seenUrl = url; onUrl(url); } };
    child.stderr.on('data', observe);
    child.stdout.on('data', observe);
    child.on('error', () => finish(new Error('Das Anbieter-Programm konnte nicht gestartet werden.')));
    child.on('close', code => finish(code === 0 ? undefined : new Error('Der Anbieter hat die Anmeldung nicht abgeschlossen. Bitte erneut anmelden.')));
  });
}

/** Explicit login verification only. Never called by activation, usage polling or identity refresh. */
export async function verifiedIdentity(binary: string, profile: AccountProfile, env: NodeJS.ProcessEnv): Promise<string | undefined> {
  if (profile.provider !== 'claude') return getAccountIdentity(profile);
  return new Promise(resolve => {
    const child = spawn(binary, ['auth', 'status', '--json'], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(undefined); }, 10_000);
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); if (output.length > 65_536) child.kill('SIGTERM'); });
    child.on('error', () => { clearTimeout(timer); resolve(undefined); });
    child.on('close', code => {
      clearTimeout(timer);
      try { const status = JSON.parse(output); resolve(code === 0 && status.loggedIn === true && typeof status.email === 'string' && status.email.includes('@') ? status.email : undefined); } catch { resolve(undefined); }
    });
  });
}
