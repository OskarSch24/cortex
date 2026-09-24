/**
 * Was jeder Aufruf der OpenRouter-API gleich braucht — der Chat-Adapter wie die
 * Exa-Suche für die CLIs.
 */

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_CHAT_URL = `${OPENROUTER_API_BASE}/chat/completions`;

/** Schlüssel, JSON und die Zuordnungs-Header, die OpenRouter für seine App-Rangliste nutzt. */
export function openRouterHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/bulsana/cortex',
    'X-Title': 'cortex',
  };
}

/** 402: das Guthaben ist aufgebraucht — `what` sagt, wofür es gefehlt hat. */
export function openRouterNoCredit(what: string): string {
  return `OpenRouter: kein Guthaben mehr für ${what} — lade es unter openrouter.ai/credits auf.`;
}

/** OpenRouter reports failures as `{ error: { message } }`; fall back to raw text. */
export function openRouterErrorMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // not JSON
  }
  return body.trim() ? body.trim().slice(0, 300) : undefined;
}
