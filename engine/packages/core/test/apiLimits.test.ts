import { describe, expect, it } from 'vitest';
import { fetchZaiLimits, grokUsageWindows, openRouterUsageWindows, zaiUsageWindows } from '../src/quota/apiLimits.js';

describe('Limits der Anbieter', () => {
  it('Z.ai: 5 Stunden, Woche und MCP-Aufrufe aus dem Kontingent', async () => {
    const body = { code: 200, success: true, data: { level: 'pro', limits: [
      { type: 'TOKENS_LIMIT', unit: 3, number: 5, percentage: 42, nextResetTime: 1790430000000 },
      { type: 'TOKENS_LIMIT', unit: 6, number: 1, percentage: 7.5, nextResetTime: 1790900000000 },
      { type: 'TIME_LIMIT', unit: 5, number: 1, usage: 1000, currentValue: 250 },
    ] } };
    expect(zaiUsageWindows(body)).toEqual([
      { label: '5 Stunden', utilizationPct: 42, resetAt: 1790430000000 },
      { label: 'Woche', utilizationPct: 7.5, resetAt: 1790900000000 },
      { label: 'Monat · MCP-Aufrufe', utilizationPct: 25, resetAt: undefined },
    ]);
    // Ein Schlüssel ohne Plan hat keine Fenster, eine Fehlerantwort auch nicht.
    expect(zaiUsageWindows({ code: 1000, msg: 'Authentication Failed', success: false })).toEqual([]);
    const seen: string[] = [];
    await fetchZaiLimits('k', async (url, init) => { seen.push(String((init?.headers as Record<string, string>).Authorization)); return new Response(JSON.stringify(body)); });
    expect(seen).toEqual(['Bearer k']);
  });

  it('OpenRouter: Schlüssel-Limit und Guthaben', () => {
    const now = Date.parse('2026-09-26T12:00:00Z');
    expect(openRouterUsageWindows({ limit: 10, limit_remaining: 7.5, limit_reset: 'monthly' }, { total_credits: 20, total_usage: 5 }, now)).toEqual([
      { label: 'Monat · Schlüssel', utilizationPct: 25, resetAt: Date.parse('2026-10-01T00:00:00Z') },
      { label: 'Guthaben · 15.00 $ übrig', utilizationPct: 25 },
    ]);
    expect(openRouterUsageWindows({ limit: null }, undefined, now)).toEqual([]);
  });

  it('Grok: Anteil am Abo-Kontingent aus x.ai/billing', () => {
    expect(grokUsageWindows({ creditUsagePercent: 63, billingCycle: 'MONTHLY', currentPeriod: { end: '2026-10-01T00:00:00Z' } }))
      .toEqual([{ label: 'Monat', utilizationPct: 63, resetAt: Date.parse('2026-10-01T00:00:00Z') }]);
    expect(grokUsageWindows({ monthlyLimit: 200, includedUsed: 50, billingCycle: 'WEEKLY', onDemandCap: 10, onDemandUsed: 5 }))
      .toEqual([{ label: 'Woche', utilizationPct: 25, resetAt: undefined }, { label: 'Zusatznutzung', utilizationPct: 50, resetAt: undefined }]);
    expect(grokUsageWindows(undefined)).toEqual([]);
  });
});
