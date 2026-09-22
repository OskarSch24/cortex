import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import type { LoginFlow, ProviderAdapter, RunRequest } from './adapter.js';
import { runAcp } from './acp.js';
import { GROK_MODELS } from '../models/catalog.js';
import { detectGrokLimit } from './limits.js';
import { buildChildEnv } from '../accounts/env.js';
import type { AdapterEvent, ResolvedAccount } from '../types.js';

function authPath(profileDir: string): string {
  const nested = join(profileDir, '.grok', 'auth.json');
  if (existsSync(nested)) return nested;
  return join(profileDir, 'auth.json');
}

export class GrokAdapter implements ProviderAdapter {
  readonly id = 'grok' as const;
  readonly displayName = 'Grok';
  readonly supportsNativeResume = true;
  readonly models = GROK_MODELS;

  constructor(private cliPath = 'grok') {}

  buildEnv(account: ResolvedAccount, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const env = buildChildEnv(account, base);
    // Die Konnektoren des Grok-Kontos (Figma, Notion, …) laufen über Groks eigenes
    // Gateway — angemeldet ist dort schon. Die CLI lädt sie aber nur mit diesen
    // Schaltern; ein ausdrücklich gesetzter Wert bleibt.
    env.GROK_MANAGED_MCPS_ENABLED ??= '1';
    env.GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED ??= '1';
    return env;
  }

  run(
    req: RunRequest,
    account: ResolvedAccount,
    signal: AbortSignal,
  ): AsyncGenerator<AdapterEvent> {
    const args = grokAcpArgs(req.model);
    return runAcp({
      command: this.cliPath,
      configureGrokSession: true,
      args,
      env: this.buildEnv(account, process.env),
      req,
      signal,
      detectLimit: detectGrokLimit,
    });
  }

  interactiveCommand(account: ResolvedAccount, model?: string) {
    const command = [this.cliPath];
    if (model) command.push('-m', model);
    return { command, env: this.buildEnv(account, process.env) };
  }

  loginFlow(profileDir: string): LoginFlow {
    const grokHome = join(profileDir, '.grok');
    mkdirSync(grokHome, { recursive: true });
    const check = async () => existsSync(authPath(profileDir));
    return {
      terminalCommand: [this.cliPath, 'login', '--oauth'],
      env: { GROK_HOME: grokHome, HOME: profileDir, USERPROFILE: profileDir },
      watch: { kind: 'poll', check, intervalMs: 1500 },
      instructions: 'A browser opens — sign in with SuperGrok or X Premium+.',
      verify: check,
    };
  }
}

export function grokAuthOk(profileDir: string): boolean {
  return existsSync(authPath(profileDir));
}

export function grokLoginStatus(cliPath: string, profileDir: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cliPath, ['login', '--help'], {
      env: { ...process.env, HOME: profileDir, USERPROFILE: profileDir },
      stdio: 'ignore',
    });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(grokAuthOk(profileDir)));
  });
}

/** ACP selects the model through session/set_model, never CLI flags. */
export function grokAcpArgs(model?: string): string[] {
  return ['agent', 'stdio'];
}
