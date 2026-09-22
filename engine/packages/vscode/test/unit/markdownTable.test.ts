import { describe, expect, it } from 'vitest';
import { tableCells } from '../../webview/components/Markdown.js';

describe('Markdown-Tabellen', () => {
  it('teilt an jedem Spaltenstrich', () => {
    expect(tableCells('| # | Titel | Link |')).toEqual(['#', 'Titel', 'Link']);
  });

  it('behält einen maskierten Strich als Inhalt — die Spalten verschieben sich nicht', () => {
    expect(tableCells('| 4 | Chapter 06 \\| Abschluss | 2025-04-20 | 0 | https://youtu.be/demoVideo01 |')).toEqual([
      '4',
      'Chapter 06 | Abschluss',
      '2025-04-20',
      '0',
      'https://youtu.be/demoVideo01',
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
