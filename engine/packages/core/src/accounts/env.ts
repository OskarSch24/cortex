import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProviderId, ResolvedAccount } from '../types.js';

/**
 * Env vars that can hijack auth for each provider and must never leak from the
 * parent process into a routed subprocess (e.g. a stray ANTHROPIC_API_KEY
 * silently overrides subscription auth in `claude -p`).
 */
const SCRUB: Record<ProviderId, string[]> = {
  // ANTHROPIC_BASE_URL belongs here too: it does not carry a credential, but it
  // decides which server the credential is sent to. A stray one in the user's
  // shell silently reroutes every routed run to a third-party proxy.
  claude: [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_OAUTH_TOKEN',
    'CLAUDE_CODE_OAUTH_TOKEN_FILE',
    'CLAUDE_CONFIG_DIR',
  ],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN', 'CODEX_HOME'],
  copilot: ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN', 'COPILOT_HOME'],
  grok: ['XAI_API_KEY', 'GROK_API_KEY', 'GROK_HOME', 'GROK_DEPLOYMENT_KEY', 'GROK_PROXY_URL', 'XAI_BASE_URL', 'GROK_AUTH', 'GROK_AUTH_PATH', 'GROK_CODE_XAI_API_KEY', 'GROK_CLI_CHAT_PROXY_BASE_URL', 'GROK_AUTH_PROVIDER_COMMAND', 'GROK_AUTH_PROVIDER_ACCESS_TOKEN', 'GROK_AUTH_PROVIDER_REFRESH_TOKEN'],
  openrouter: ['OPENROUTER_API_KEY'],
};

/**
 * Env overrides for a VS Code terminal (TerminalOptions.env): scrubbed vars
 * map to null (removed from the shell), auth vars to their values.
 */
export function terminalEnvOverrides(account: ResolvedAccount): Record<string, string | null> {
  const overrides: Record<string, string | null> = {};
  for (const key of SCRUB[account.provider]) overrides[key] = null;
  const additions = buildChildEnv(account, {});
  for (const [key, value] of Object.entries(additions)) {
    if (value !== undefined) overrides[key] = value;
  }
  return overrides;
}

export function buildChildEnv(
  account: ResolvedAccount,
  base: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base };
  for (const key of SCRUB[account.provider]) delete env[key];

  switch (account.provider) {
    case 'claude':
      if (account.authMode === 'oauth-token' && account.secret) {
        env.CLAUDE_CODE_OAUTH_TOKEN = account.secret;
      } else if (account.authMode === 'managed-home' && account.homeDir) {
        env.CLAUDE_CONFIG_DIR = account.homeDir;
      } else if (account.authMode === 'api-key' && account.secret) {
        env.ANTHROPIC_API_KEY = account.secret;
      }
      break;
    case 'codex':
      if (account.authMode === 'managed-home' && account.homeDir) {
        env.CODEX_HOME = account.homeDir;
      } else if (account.authMode === 'api-key' && account.secret) {
        env.CODEX_API_KEY = account.secret;
      }
      break;
    case 'copilot':
      if (account.homeDir) env.COPILOT_HOME = account.homeDir;
      if (account.authMode === 'api-key' && account.secret) {
        env.COPILOT_GITHUB_TOKEN = account.secret;
      }
      break;
    case 'grok':
      if (account.homeDir) {
        env.GROK_HOME = `${account.homeDir}/.grok`;
        env.HOME = account.homeDir;
        env.USERPROFILE = account.homeDir;
      }
      if (account.authMode === 'api-key' && account.secret) {
        env.XAI_API_KEY = account.secret;
      }
      break;
    case 'openrouter':
      // No child process to configure — the adapter calls the API itself. The
      // var is still set so an interactive shell for this account behaves.
      if (account.secret) env.OPENROUTER_API_KEY = account.secret;
      break;
  }
  return env;
}
