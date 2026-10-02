import type { UsageWindow } from './quotaTracker.js';
import { OPENROUTER_API_BASE } from '../adapters/openrouterHttp.js';

/**
 * Limits der Anbieter, die sie selbst melden — OpenRouter und Z.ai über ihre
 * HTTP-API, Grok über die Abrechnungsmethode seiner CLI (`x.ai/billing`).
 * Alle Werte als verbrauchter Anteil in Prozent; der Rest ist Anzeige.
 */

type Obj = Record<string, unknown>;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const obj = (v: unknown): Obj | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : undefined);
const clampPct = (v: number) => Math.max(0, Math.min(100, v));
/** Sekunden, Millisekunden oder ein Datum als Text → Millisekunden. */
function epoch(v: unknown): number | undefined {
  const n = num(v);
  if (n !== undefined) return n < 1e12 ? n * 1000 : n;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

/** Nächster Wechsel eines Tages-, Wochen- oder Monatslimits (OpenRouter rechnet in UTC). */
function nextUtcReset(period: string, now: number): number | undefined {
  const d = new Date(now);
  if (period === 'daily') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  if (period === 'weekly') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  if (period === 'monthly') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  return undefined;
}

// ── OpenRouter ────────────────────────────────────────────────────────────

/** `/key`: das Limit des Schlüssels; `/credits`: das Guthaben des Kontos. */
export function openRouterUsageWindows(key: Obj | undefined, credits: Obj | undefined, now = Date.now()): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const limit = num(key?.limit);
  const remaining = num(key?.limit_remaining);
  if (limit && limit > 0) {
    const used = remaining !== undefined ? limit - remaining : num(key?.usage) ?? 0;
    const period = typeof key?.limit_reset === 'string' ? key.limit_reset : '';
    const label = period === 'daily' ? 'Tag · Schlüssel' : period === 'weekly' ? 'Woche · Schlüssel' : period === 'monthly' ? 'Monat · Schlüssel' : 'Schlüssel-Limit';
    windows.push({ label, utilizationPct: clampPct((used / limit) * 100), resetAt: nextUtcReset(period, now) });
  }
  const total = num(credits?.total_credits);
  const spent = num(credits?.total_usage);
  if (total && total > 0 && spent !== undefined) {
    windows.push({ label: `Guthaben · ${Math.max(0, total - spent).toFixed(2)} $ übrig`, utilizationPct: clampPct((spent / total) * 100) });
  }
  return windows;
}

export async function fetchOpenRouterLimits(apiKey: string, fetchImpl: typeof fetch = (...a) => fetch(...a), signal?: AbortSignal): Promise<UsageWindow[]> {
  const get = async (path: string) => {
    const r = await fetchImpl(`${OPENROUTER_API_BASE}${path}`, { signal, headers: { Authorization: `Bearer ${apiKey}` } });
    return r.ok ? obj(((await r.json()) as Obj).data) : undefined;
  };
  const [key, credits] = await Promise.all([get('/key').catch(() => undefined), get('/credits').catch(() => undefined)]);
  return openRouterUsageWindows(key, credits);
}

// ── Z.ai ──────────────────────────────────────────────────────────────────

export const ZAI_QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit';

/**
 * Antwort von `/api/monitor/usage/quota/limit` (`{ code, data: { level, limits } }`).
 * unit 3 / number 5 ist das 5-Stunden-Fenster, unit 6 die Woche, TIME_LIMIT
 * die monatlichen MCP-Aufrufe. Ein Schlüssel ohne Coding Plan hat keine.
 */
export function zaiUsageWindows(body: unknown): UsageWindow[] {
  const data = obj(obj(body)?.data) ?? obj(body);
  const limits = Array.isArray(data?.limits) ? data!.limits : [];
  const windows: UsageWindow[] = [];
  for (const raw of limits) {
    const item = obj(raw);
    if (!item) continue;
    const unit = num(item.unit);
    const count = num(item.number);
    let pct = num(item.percentage);
    const total = num(item.usage) ?? num(item.total);
    const used = num(item.currentValue);
    if (pct === undefined && total && used !== undefined) pct = (used / total) * 100;
    if (pct === undefined) continue;
    const label = item.type === 'TIME_LIMIT' ? 'Monat · MCP-Aufrufe'
      : unit === 3 ? `${count ?? 5} Stunden` : unit === 6 ? 'Woche' : unit === 5 ? 'Monat' : String(item.type ?? 'Limit');
    windows.push({ label, utilizationPct: clampPct(pct), resetAt: epoch(item.nextResetTime) });
  }
  return windows;
}

export async function fetchZaiLimits(apiKey: string, fetchImpl: typeof fetch = (...a) => fetch(...a), signal?: AbortSignal): Promise<UsageWindow[]> {
  const r = await fetchImpl(ZAI_QUOTA_URL, { signal, headers: { Authorization: `Bearer ${apiKey}`, 'Accept-Language': 'en-US,en' } });
  if (!r.ok) return [];
  return zaiUsageWindows(await r.json());
}

// ── Grok ──────────────────────────────────────────────────────────────────

/**
 * Antwort der ACP-Methode `x.ai/billing` der Grok CLI — dieselbe Quelle wie
 * ihr `/usage`-Fenster. Felder laut CLI: creditUsagePercent, monthlyLimit,
 * includedUsed, totalUsed, onDemandCap, onDemandUsed, billingPeriodStart,
 * billingCycle, currentPeriod. Was fehlt, wird nicht erfunden.
 */
export function grokUsageWindows(body: unknown): UsageWindow[] {
  const root = obj(body);
  const data = obj(root?.billing) ?? obj(root?.data) ?? root;
  if (!data) return [];
  const period = obj(data.currentPeriod);
  const cycle = String(data.billingCycle ?? period?.type ?? '').toUpperCase();
  const label = cycle.includes('WEEK') ? 'Woche' : 'Monat';
  let pct = num(data.creditUsagePercent);
  const limit = num(data.monthlyLimit) ?? num(period?.limit);
  const used = num(data.includedUsed) ?? num(data.totalUsed) ?? num(period?.used);
  if (pct !== undefined && pct <= 1 && limit && used !== undefined && used / limit > 0.011) pct *= 100;
  if (pct === undefined && limit && used !== undefined) pct = (used / limit) * 100;
  const windows: UsageWindow[] = [];
  const resetAt = epoch(period?.end ?? period?.endTime ?? data.billingPeriodEnd ?? data.nextReset);
  if (pct !== undefined) windows.push({ label, utilizationPct: clampPct(pct), resetAt });
  const cap = num(data.onDemandCap);
  const onDemand = num(data.onDemandUsed);
  if (cap && cap > 0 && onDemand !== undefined) windows.push({ label: 'Zusatznutzung', utilizationPct: clampPct((onDemand / cap) * 100), resetAt });
  return windows;
}
