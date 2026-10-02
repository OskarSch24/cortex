import { describe, expect, it } from 'vitest';
import { INLINE, linkDest, tableCells } from '../../webview/components/Markdown.js';

describe('Markdown-Tabellen', () => {
  it('teilt an jedem Spaltenstrich', () => {
    expect(tableCells('| # | Titel | Link |')).toEqual(['#', 'Titel', 'Link']);
  });

  it('behält einen maskierten Strich als Inhalt — die Spalten verschieben sich nicht', () => {
    expect(tableCells('| 4 | Chapter 06 \\| After Sell | 2025-04-20 | 0 | https://youtu.be/ZokDMeVjJwA |')).toEqual([
      '4',
      'Chapter 06 | After Sell',
      '2025-04-20',
      '0',
      'https://youtu.be/ZokDMeVjJwA',
    ]);
  });

  it('nimmt eine Zeile ohne schließenden Strich und endet nicht auf einem maskierten', () => {
    expect(tableCells('| a | b')).toEqual(['a', 'b']);
    expect(tableCells('| a | b \\|')).toEqual(['a', 'b |']);
  });

  it('ist keine Tabellenzeile, wenn nur maskierte Striche folgen', () => {
    expect(tableCells('| a \\| b')).toBeUndefined();
    expect(tableCells('kein | Tisch')).toBeUndefined();
  });
});

describe('Markdown-Links', () => {
  const match = (text: string) => INLINE.exec(text);

  it('erkennt ein Ziel in spitzen Klammern mit Leerzeichen', () => {
    const m = match('Quellen: [Welle-3-Stand](</Users/o/Persönliche Projekte/Welle 3/index.html>) und mehr');
    expect(m?.[4]).toBe('Welle-3-Stand');
    expect(m?.[5]).toBe('/Users/o/Persönliche Projekte/Welle 3/index.html');
  });

  it('behält das einfache Ziel ohne Klammern', () => {
    const m = match('[Datei](src/app.ts:12)');
    expect(m?.[6]).toBe('src/app.ts:12');
  });

  it('dekodiert Dateipfade, lässt Web-Adressen unberührt', () => {
    expect(linkDest('/Users/o/Welle%203/index.html')).toBe('/Users/o/Welle 3/index.html');
    expect(linkDest('https://example.com/a%20b')).toBe('https://example.com/a%20b');
    expect(linkDest('/kaputt%E0')).toBe('/kaputt%E0');
  });
});
