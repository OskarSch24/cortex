import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../src/history/types.js';
import { fold, inRange, relativeRange, retrievalContext, selectForQuestion } from '../../src/history/retrieval.js';
import { clean, settings } from '../../src/history/sanitize.js';

const entry = (id: string, endedAt: number, text: string, extra: Partial<HistoryEntry> = {}): HistoryEntry =>
  ({ id, startedAt: endedAt - 1000, endedAt, appId: 'app', appName: 'Notizen', title: `Titel ${id}`, text, ...extra });

describe('Verlauf: Auswahl für eine Frage', () => {
  it('faltet Akzente und Groß-/Kleinschreibung', () => {
    expect(fold('Müller ÉCOLE')).toBe('muller ecole');
  });

  it('nimmt passende Einträge nach Trefferzahl, bei Gleichstand die jüngsten, höchstens fünf', () => {
    const all = [
      entry('a', 1, 'Rechnung von Müller'),
      entry('b', 3, 'Rechnung Müller Angebot'),
      entry('c', 2, 'nichts davon'),
      ...Array.from({ length: 6 }, (_, i) => entry(`r${i}`, 10 + i, 'Rechnung')),
    ];
    const { selected, terms } = selectForQuestion('Was war die Rechnung von Müller?', all);
    expect(terms).toEqual(['rechnung', 'muller']);
    expect(selected.map((e) => e.id)).toEqual(['b', 'a', 'r5', 'r4', 'r3']);
  });

  it('nimmt ohne jeden Treffer die jüngsten', () => {
    const { selected } = selectForQuestion('Zebra', [entry('a', 1, 'x'), entry('b', 2, 'y')]);
    expect(selected.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('baut den Kontext mit Kopfzeile und Auszug und kappt ihn bei 5000 Zeichen', () => {
    const context = retrievalContext([entry('a', Date.UTC(2026, 0, 2), 'Hallo Welt')], ['welt']);
    expect(context).toBe('[1] 2026-01-01T23:59:59.000Z · Notizen · Titel a\nHallo Welt');
    const long = Array.from({ length: 10 }, (_, i) => entry(String(i), 1000, 'x'.repeat(2000)));
    expect(retrievalContext(long, [])).toHaveLength(5000);
  });

  it('versteht heute, gestern und vorgestern als Tagesgrenzen', () => {
    const now = new Date(2026, 8, 23, 15, 30).getTime();
    const gestern = relativeRange('Was habe ich gestern gemacht?', now)!;
    expect(new Date(gestern.from)).toEqual(new Date(2026, 8, 22, 0, 0, 0, 0));
    expect(gestern.to).toBe(new Date(2026, 8, 23).getTime() - 1);
    expect(relativeRange('vorgestern', now)!.from).toBe(new Date(2026, 8, 21).getTime());
    expect(relativeRange('heute', now)!.from).toBe(new Date(2026, 8, 23).getTime());
    expect(relativeRange('neulich', now)).toBeUndefined();
    expect(inRange(entry('a', 50), 40, 60)).toBe(true);
    expect(inRange(entry('a', 50), 51)).toBe(false);
    expect(inRange(entry('a', 5000), undefined, 3000)).toBe(false);
  });
});

describe('Verlauf: Bereinigung', () => {
  it('entfernt Steuerzeichen und stutzt Einstellungen zurecht', () => {
    expect(clean(' a\u0000b\u007f ', 10)).toBe('ab');
    expect(clean(42, 10)).toBe('');
    expect(settings({ enabled: true, allowedApps: ['com.apple.Notes', 'böse id', 'com.apple.Notes'], retentionDays: 500 }))
      .toEqual({ enabled: true, allowedApps: ['com.apple.Notes'], retentionDays: 90 });
    expect(settings(undefined)).toEqual({ enabled: false, allowedApps: [], retentionDays: 30 });
  });
});
