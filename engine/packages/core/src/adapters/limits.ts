import type { LimitInfo } from '../types.js';

/**
 * All limit-message fingerprints live here so upstream copy changes only ever
 * require touching this file. Detection is passive (parse what the CLI said);
 * a miss degrades to a generic error, never a crash.
 */

const CLAUDE_PIPE_EPOCH = /Claude AI usage limit reached\|(\d{5,})/i;

/**
 * Infrastructure failures — a dropped stream, an overloaded upstream, a socket
 * reset. These say nothing about the account or the model, so the right answer
 * is to try the same account again rather than spend another provider's quota.
 */
const TRANSIENT = [
  /connection closed mid-?response/i,
  /connection (error|reset|closed)/i,
  /socket hang ?up/i,
  /premature close/i,
  /stream (disconnected|ended unexpectedly|closed)/i,
  /fetch failed/i,
  /network (error|timeout)/i,
  /\b(ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENETUNREACH|EAI_AGAIN)\b/,
  /\boverloaded(_error)?\b/i,
  /\b(429|500|502|503|504)\b.*\b(error|gateway|unavailable|timeout)\b/i,
  /(bad gateway|service unavailable|gateway timeout|internal server error)/i,
  /request timed out/i,
];

/** True when an error is worth retrying on the same account. */
export function isTransientFailure(text: string): boolean {
  if (!text) return false;
  return TRANSIENT.some((re) => re.test(text));
}

/**
 * The model id was rejected, not the account. Model names are retired on the
 * provider's schedule, and the tier table here pins some of them by version —
 * so this is a normal, expected failure rather than an exotic one. It says
 * nothing about the credential, which is why failing over to another account
 * (and asking it for the same dead model) is the wrong answer.
 */
const UNKNOWN_MODEL = [
  /unknown model/i,
  /model not found/i,
  /invalid model/i,
  /no such model/i,
  /unsupported model/i,
  /not a valid model/i,
  // Dots are allowed through the gap on purpose — the model id sitting in it
  // usually contains one ("grok-4.6"). The length cap does the fencing.
  /model[^\n]{0,40}(does not exist|is n[o']?t? (longer )?available|unavailable|deprecated|retired)/i,
  /(does not exist|is not available)[^\n]{0,20}model/i,
];

/** True when the CLI rejected the requested model itself. */
export function isUnknownModel(text: string): boolean {
  if (!text) return false;
  return UNKNOWN_MODEL.some((re) => re.test(text));
}

export function detectClaudeLimit(text: string): LimitInfo | undefined {
  const pipe = CLAUDE_PIPE_EPOCH.exec(text);
  if (pipe) {
    const epoch = Number(pipe[1]);
    // Epoch may be seconds or milliseconds.
    const resetAt = epoch > 10_000_000_000 ? epoch : epoch * 1000;
    return { resetAt, scope: /week|seven.day/i.test(text) ? 'weekly' : 'session', raw: text };
  }
  if (/usage limit reached/i.test(text) || /you'?ve (hit|reached) your usage limit/i.test(text)) {
    return { scope: 'unknown', raw: text };
  }
  return undefined;
}

/** Preserve the provider's reset even for a newly introduced quota window. */
export function claudeRateLimit(info: Record<string, unknown>, raw: string): LimitInfo {
  const window = String(info.rateLimitType ?? info.windowType ?? '').toLowerCase();
  const scope = /^(seven_day|weekly)(?:_|$)/.test(window) ? 'weekly'
    : /^(five_hour|session)(?:_|$)/.test(window) ? 'session'
      : /^(daily|one_day)(?:_|$)/.test(window) ? 'daily' : 'unknown';
  const reset = info.resetsAt ?? info.resets_at ?? info.resetAt;
  const numeric = typeof reset === 'number' ? reset : typeof reset === 'string' && /^\d+(?:\.\d+)?$/.test(reset) ? Number(reset) : undefined;
  const parsed = numeric !== undefined ? (numeric > 10_000_000_000 ? numeric : numeric * 1000)
    : typeof reset === 'string' ? Date.parse(reset) : NaN;
  return { scope, resetAt: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined, raw };
}

export function detectCodexLimit(text: string, now: () => number = () => Date.now()): LimitInfo | undefined {
  if (!/usage[ _]limit/i.test(text) && !/usage_limit_reached/i.test(text)) return undefined;
  const info: LimitInfo = { scope: 'unknown', raw: text };
  // "... try again at 5:30 PM." — best-effort; next occurrence of that wall-clock time.
  const at = /try again at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(text);
  if (at) {
    let hours = Number(at[1]);
    const minutes = at[2] ? Number(at[2]) : 0;
    const meridiem = at[3]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    const d = new Date(now());
    d.setHours(hours, minutes, 0, 0);
    if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
    info.resetAt = d.getTime();
  }
  return info;
}

export function detectCopilotLimit(text: string): LimitInfo | undefined {
  if (/quota_exceeded/i.test(text) || /no quota/i.test(text) || /status(?: code)?[: ]+402/i.test(text)) {
    return { scope: 'credits', raw: text };
  }
  return undefined;
}

export function detectGrokLimit(text: string): LimitInfo | undefined {
  if (
    /rate limit/i.test(text) ||
    /quota (limit|exceeded)/i.test(text) ||
    /usage limit/i.test(text) ||
    /status(?: code)?[: ]+429/i.test(text)
  ) {
    return { scope: 'unknown', raw: text };
  }
  return undefined;
}
