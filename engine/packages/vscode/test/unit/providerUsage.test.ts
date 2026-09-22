import { describe, expect, it } from 'vitest';
import { providerUsageWindows } from '../../src/providerUsage.js';
describe('provider limit windows', () => {
  it('keeps Claude session, weekly and model windows with provider precision', () => {
    const windows = providerUsageWindows('claude', { rate_limits_available: true, rate_limits: { five_hour: { utilization: 12.75, resets_at: '2026-09-09T10:00:00Z' }, seven_day: { utilization: 80 }, model_scoped: [{ display_name: 'Fable', utilization: 35 }] } });
    expect(windows.map(w => [w.label, w.utilizationPct])).toEqual([['5 Stunden', 12.75], ['Woche', 80], ['Woche · Fable', 35]]);
    expect(windows[0]?.resetAt).toBe(Date.parse('2026-09-09T10:00:00Z'));
  });
  it('does not invent full availability for absent, invalid or inaccessible data', () => {
    expect(providerUsageWindows('claude', { rate_limits_available: false, rate_limits: { five_hour: { utilization: 0 } } })).toEqual([]);
    expect(providerUsageWindows('codex', { rateLimits: { primary: { usedPercent: null }, secondary: { usedPercent: -1 } } })).toEqual([]);
  });
  it('prefers Codex named buckets over the legacy mirror without duplicate totals', () => {
    const result = providerUsageWindows('codex', { rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: { codex: { primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: 24.5, windowDurationMins: 10080 } } } });
    expect(result.map(w => [w.label, w.utilizationPct])).toEqual([['5 Stunden', 0], ['Woche', 24.5]]);
    expect(result[0]?.resetAt).toBe(1800000000000);
  });
});
