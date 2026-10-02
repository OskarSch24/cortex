/**
 * Was jeder Aufruf der OpenRouter-API gleich braucht — der Chat-Adapter wie die
 * Exa-Suche für die CLIs.
 */

export const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
export const OPENROUTER_CHAT_URL = `${OPENROUTER_API_BASE}/chat/completions`;
/** Bilder: eine Anfrage, die Bilder kommen als Base64 zurück. */
export const OPENROUTER_IMAGES_URL = `${OPENROUTER_API_BASE}/images`;
/** Videos: ein Auftrag, dessen Stand man abfragt, bis die Datei bereitliegt. */
export const OPENROUTER_VIDEOS_URL = `${OPENROUTER_API_BASE}/videos`;
/** Entscheidungsmodelle wie Jev — noch unter `alpha`, nicht unter `v1`. */
export const OPENROUTER_DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

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
