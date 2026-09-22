import { describe, expect, it } from 'vitest';
import { parseNumstat, parseUnifiedDiff } from '../../src/panel/workspace.js';

describe('parseNumstat', () => {
  it('liest Zahlen und Pfad', () => {
    expect(parseNumstat('20\t0\tAGENTS.md\n3\t4\ttests/a.py\n')).toEqual([
      { path: 'AGENTS.md', added: 20, removed: 0, binary: false },
      { path: 'tests/a.py', added: 3, removed: 4, binary: false },
    ]);
  });

  it('erkennt binäre Dateien am Strich statt an einer Zahl', () => {
    expect(parseNumstat('-\t-\tbrand/icon.png\n')[0]).toEqual({ path: 'brand/icon.png', added: 0, removed: 0, binary: true });
  });
});

describe('parseUnifiedDiff', () => {
  const patch = [
    'diff --git a/README.md b/README.md',
    'index 111..222 100644',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -3,4 +3,5 @@ Kontext',
    ' erste Zeile',
    '-alte Zeile',
    '+neue Zeile',
    '+noch eine',
    ' letzte Zeile',
  ].join('\n');

  it('nummeriert die neue Fassung und lässt entfernte Zeilen ohne Nummer', () => {
    const hunks = parseUnifiedDiff(patch).get('README.md')!;
    expect(hunks).toHaveLength(1);
    expect(hunks[0]!.start).toBe(3);
    expect(hunks[0]!.lines).toEqual([
      { kind: 'ctx', text: ' erste Zeile'.slice(1), line: 3 },
      { kind: 'del', text: 'alte Zeile' },
      { kind: 'add', text: 'neue Zeile', line: 4 },
      { kind: 'add', text: 'noch eine', line: 5 },
      { kind: 'ctx', text: 'letzte Zeile', line: 6 },
    ]);
  });

  it('trägt binäre Dateien ohne Zeilen ein, statt sie zu verschlucken', () => {
    const binary = ['diff --git a/x.png b/x.png', 'Binary files a/x.png and b/x.png differ'].join('\n');
    expect(parseUnifiedDiff(binary).get('x.png')).toEqual([]);
  });
});
