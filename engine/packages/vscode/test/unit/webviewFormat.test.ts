import { describe, expect, it } from 'vitest';
import { formatDuration, formatElapsed, formatWorked, metricDuration, roundedDuration } from '../../webview/format/duration.js';
import { shortPath, tildePath } from '../../webview/format/path.js';
import { clockTime } from '../../webview/format/time.js';
import { compactTokens, formatTokens, metricTokens } from '../../webview/format/tokens.js';

describe('Webview-Formatierung', () => {
  it('kürzt den Heimatpfad auf ~', () => {
    expect(tildePath('/Users/oskar/Desktop/Kortex')).toBe('~/Desktop/Kortex');
    expect(tildePath('/Users/oskar')).toBe('~');
    expect(tildePath('/opt/homebrew/bin')).toBe('/opt/homebrew/bin');
    expect(tildePath('/Volumes/Users/oskar')).toBe('/Volumes/Users/oskar');
  });

  it('schneidet lange Pfade in der Mitte ab', () => {
    expect(shortPath('/Users/oskar/Notizen')).toBe('~/Notizen');
    const long = shortPath('/Users/oskar/Library/Application Support/Cortex/memory');
    expect(long).toBe('~/Library/…/Cortex/memory');
    expect(long.length).toBe(25);
  });

  it('schreibt die Uhrzeit zweistellig', () => {
    const at = new Date(2026, 8, 23, 7, 5);
    expect(clockTime(at)).toBe('07:05');
    expect(clockTime(at.getTime())).toBe('07:05');
  });

  it('hält die Dauer-Schreibweisen je Ort auseinander', () => {
    expect(formatDuration(850)).toBe('850ms');
    expect(formatDuration(1_234)).toBe('1.2s');
    expect(formatDuration(184_000)).toBe('3m 4s');

    expect(formatElapsed(400)).toBe('0 Sek.');
    expect(formatElapsed(62_000)).toBe('1 Min. 2 Sek.');
    expect(formatElapsed(120_000)).toBe('2 Min.');
    expect(formatElapsed(3_900_000)).toBe('1 Std. 5 Min.');
    expect(formatElapsed(7_200_000)).toBe('2 Std.');

    expect(formatWorked(200)).toBe('1s');
    expect(formatWorked(718_000)).toBe('11m 58s');
    expect(formatWorked(3_780_000)).toBe('1h 3m');

    expect(metricDuration(undefined)).toBe('—');
    expect(metricDuration(420.4)).toBe('420ms');
    expect(metricDuration(12_340)).toBe('12.3s');
    expect(metricDuration(90_000)).toBe('1.5m');

    expect(roundedDuration(0)).toBe('–');
    expect(roundedDuration(20_000)).toBe('20 Sek.');
    expect(roundedDuration(600_000)).toBe('10 Min.');
    expect(roundedDuration(3_900_000)).toBe('1 Std. 5 Min.');
  });

  it('hält die Token-Schreibweisen je Ort auseinander', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_345)).toBe('12.3k');
    expect(formatTokens(1_250_000)).toBe('1.3M');

    expect(metricTokens(undefined)).toBe('0');
    expect(metricTokens(4_321)).toBe('4.3k');
    expect(metricTokens(24_816)).toBe('25k');
    expect(metricTokens(2_000_000)).toBe('2.0M');

    expect(compactTokens(9_999)).toBe('9.999');
    expect(compactTokens(12_400)).toBe('12 Tsd.');
    expect(compactTokens(1_500_000)).toBe('1,5 Mio.');
    expect(compactTokens(2_000_000_000)).toBe('2 Mrd.');
  });
});
