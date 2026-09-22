import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WIDGET_BRIEF, WIDGET_TYPE_NAMES } from '../../../core/src/context/widgetBrief.js';
import {
  contrast, daysBetween, formatClock, friendlyDate, formatOffset, parseWidget, timerRemaining, wcagGrade, workflowColumns, zoneTime, widgetProgress,
} from '../../webview/components/widgets/spec.js';

const samples = JSON.parse(readFileSync(new URL('../../dev/widget-samples.json', import.meta.url), 'utf8')) as { spec: { type: string } }[];

describe('chat widgets: what a model may send', () => {
  it('repairs trailing commas without changing string content or inventing incomplete JSON', () => {
    const parsed = parseWidget('{"type":"todo","title":"Heute,}","items":[{"text":"Zitat: \\\"ja\\\",]",},],}');
    expect(parsed).toMatchObject({ ok: true, spec: { title: 'Heute,}', items: [{ text: 'Zitat: "ja",]' }] } });
    expect(parseWidget('{"type":"todo","title":"Heute')).toMatchObject({ ok: false });
  });
  it('describes streamed content and counts only completed entries', () => {
    expect(widgetProgress('{"type":"query-result","rows":[["a,b"],["c"],[')).toBe('Tabelle wird erstellt (2 Zeilen) …');
    expect(widgetProgress('{"type":"todo","items":[{"text":"unfinished')).toBe('Aufgabenliste wird erstellt …');
  });
  it('has one example for every type, and every example is drawable', () => {
    expect(new Set(samples.map((s) => s.spec.type))).toEqual(new Set(WIDGET_TYPE_NAMES));
    for (const s of samples) {
      const parsed = parseWidget(JSON.stringify(s.spec));
      expect(parsed, s.spec.type).toMatchObject({ ok: true });
    }
  });
  it('tells the models about every type it can draw', () => {
    for (const type of WIDGET_TYPE_NAMES) expect(WIDGET_BRIEF).toContain(`\n${type} {`);
    expect(WIDGET_BRIEF).toContain('```cortex-widget');
  });
  it('keeps unreadable blocks as code, with the reason', () => {
    expect(parseWidget('{"type":"weather"')).toEqual({ ok: false, error: 'Kein gültiges JSON' });
    expect(parseWidget('[1,2]')).toEqual({ ok: false, error: 'Kein Objekt' });
    expect(parseWidget('{"type":"hologram"}')).toEqual({ ok: false, error: 'Unbekannter Typ „hologram“' });
    expect(parseWidget('{"type":"todo","title":"Heute","items":[]}')).toEqual({ ok: false, error: 'Feld „items“ fehlt' });
    expect(parseWidget('{"type":"timer","label":"Tee","durationSec":"300"}')).toEqual({ ok: false, error: 'Feld „durationSec“ fehlt' });
  });
});

describe('chat widgets: what Cortex computes itself', () => {
  it('measures contrast the WCAG way', () => {
    expect(contrast('#ededee', '#101113')).toBeCloseTo(16.15, 1);
    expect(contrast('#707277', '#101113')).toBeCloseTo(3.92, 1);
    expect(wcagGrade(16.15)).toBe('AAA');
    expect(wcagGrade(6.7)).toBe('AA');
    expect(wcagGrade(3.92)).toBe('AA groß');
    expect(wcagGrade(1.2)).toBe('Zu schwach');
    expect(contrast('rot', '#101113')).toBeUndefined();
  });
  it('reads time zones instead of trusting a model with offsets', () => {
    const at = new Date('2026-09-13T12:32:00Z');
    const berlin = zoneTime('Europe/Berlin', at)!;
    const tokyo = zoneTime('Asia/Tokyo', at)!;
    expect(berlin.time).toBe('14:32');
    expect(tokyo.time).toBe('21:32');
    expect(formatOffset(tokyo.offsetMin - berlin.offsetMin)).toBe('+7 Std');
    expect(formatOffset(zoneTime('America/Bogota', at)!.offsetMin - berlin.offsetMin)).toBe('−7 Std');
    expect(formatOffset(zoneTime('Asia/Kolkata', at)!.offsetMin - berlin.offsetMin)).toBe('+3:30 Std');
    expect(zoneTime('Mars/Olympus', at)).toBeUndefined();
  });
  it('handles the weeks when New York and London change daylight savings on different days', () => {
    for (const [date, ny, london] of [['2026-03-15T12:00:00Z', '08:00', '12:00'], ['2026-10-28T12:00:00Z', '08:00', '12:00']]) {
      expect(zoneTime('America/New_York', new Date(date!))!.time).toBe(ny);
      expect(zoneTime('Europe/London', new Date(date!))!.time).toBe(london);
    }
  });
  it('counts a timer down from its end, never past its length', () => {
    const now = Date.parse('2026-09-13T14:48:18Z');
    expect(timerRemaining({ durationSec: 1500, endsAt: '2026-09-13T15:07:00Z' }, now)).toBe(1122);
    expect(timerRemaining({ durationSec: 60, endsAt: '2026-09-13T15:07:00Z' }, now)).toBe(60);
    expect(timerRemaining({ durationSec: 1500, endsAt: '2026-09-13T14:00:00Z' }, now)).toBe(0);
    expect(timerRemaining({ durationSec: 300 }, now)).toBe(300);
    expect(formatClock(1122)).toBe('18:42');
    expect(formatClock(3725)).toBe('1:02:05');
  });
  it('writes model dates the way people read them', () => {
    expect(friendlyDate('2026-09-13')).toBe('Sonntag, 13. September');
    expect(friendlyDate('Heute')).toBe('Heute');
  });
  it('knows how far a review date is', () => {
    expect(daysBetween('2026-09-13', '2026-12-05')).toBe(83);
    expect(daysBetween('2026-09-06', '2026-12-05')).toBe(90);
  });
  it('lays a workflow out by depth, and survives a cycle', () => {
    const cols = workflowColumns([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'r' }], [['a', 'b'], ['b', 'c'], ['b', 'r']]);
    expect([...cols.entries()]).toEqual([['a', 0], ['b', 1], ['c', 2], ['r', 2]]);
    const loop = workflowColumns([{ id: 'x' }, { id: 'y' }], [['x', 'y'], ['y', 'x']]);
    expect(Math.max(...loop.values())).toBeLessThan(2);
  });
});

describe('chat widgets: numbers where text was asked for', () => {
  it('draws a ticker Claude sent with numeric price and change (13.09.2026)', () => {
    const parsed = parseWidget(JSON.stringify({ type: 'ticker', name: 'Bitcoin', symbol: 'BTC/EUR', price: 66633.9, change: -0.05, series: [1, 2, 3],
      others: [{ name: 'Ethereum', symbol: 'ETH', price: 2312.4, change: 1.12 }] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.spec.type !== 'ticker') return;
    expect(parsed.spec.price).toBe('66.633,9');
    expect(parsed.spec.change).toBe('−0,05 %');
    expect(parsed.spec.tone).toBe('neg');
    expect(parsed.spec.others?.[0]).toMatchObject({ price: '2.312,4', change: '+1,12 %', tone: 'pos' });
  });
  it('gives weather numbers their unit', () => {
    const parsed = parseWidget(JSON.stringify({ type: 'weather', location: 'Hamburg', temp: 18.4, condition: 'Bewölkt', rain: 0, wind: 13.8 }));
    expect(parsed.ok && parsed.spec.type === 'weather' && [parsed.spec.rain, parsed.spec.wind]).toEqual(['0 mm', '13,8 km/h']);
  });
  it('keeps years as years', async () => {
    const { displayNumber } = await import('../../webview/components/widgets/spec.js');
    expect(displayNumber(2025)).toBe('2025');
    expect(displayNumber(184200)).toBe('184.200');
  });
});
