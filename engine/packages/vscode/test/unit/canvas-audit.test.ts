import { describe, expect, it } from 'vitest';
import { audit, auditText, moveAll, placeBlock, resolve, rectOf, type El } from '../../webview/canvas/audit.js';

const box = (id: string, x: number, y: number, w = 120, h = 70, extra: Partial<El> = {}): El => ({ id, type: 'rectangle', x, y, width: w, height: h, ...extra });
const label = (id: string, box: El, text: string): El => ({ id, type: 'text', x: box.x + 10, y: box.y + 20, width: box.width - 20, height: 25, containerId: box.id, text, originalText: text });
const hit = (a: El, b: El) => { const r = rectOf(a), s = rectOf(b); return r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h; };

// Ein Raster wie das „Periodensystem“: 3 × 2 Karten mit Beschriftung, darum ein Rahmen.
const grid = (): El[] => {
  const cards = [0, 1, 2].flatMap(c => [0, 1].map(r => box(`k${c}${r}`, c * 140, r * 90)));
  return [box('rahmen', -20, -20, 440, 200), ...cards, ...cards.map(k => label(`t-${k.id}`, k, k.id))];
};

describe('Prüfschicht der Zeichenfläche', () => {
  it('findet Überlappungen, aber nicht Karten in ihrem Rahmen oder Text in seiner Form', () => {
    expect(audit(grid())).toEqual([]);
    const els = [...grid(), { id: 'notiz', type: 'text', x: 100, y: 60, width: 220, height: 25, text: 'Kartenfeld Deutschland' } as El];
    const issues = audit(els);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(i => i.kind === 'overlap' && (i.a === 'notiz' || i.b === 'notiz'))).toBe(true);
    expect(auditText(issues, els)).toMatch(/Layout check found \d+ problem/);
  });

  it('meldet übergelaufenen Text in Formen, nicht bei Pfeilbeschriftungen', () => {
    const k = box('k', 0, 0, 80, 40);
    expect(audit([k, { ...label('t', k, 'Zusammenhang'), width: 140 }])).toEqual([{ kind: 'overflow', a: 'k' }]);
    const p = { id: 'p', type: 'arrow', x: 0, y: 0, width: 4, height: 120, points: [[0, 0], [4, 120]] } as El;
    expect(audit([p, { id: 'pl', type: 'text', x: -10, y: 50, width: 40, height: 20, containerId: 'p', text: 'nein' } as El])).toEqual([]);
  });

  it('setzt einen neuen Block, der das Raster schneiden würde, als Ganzes auf freie Fläche', () => {
    const existing = grid();
    const added = [box('neu1', 60, 40, 200, 60), box('neu2', 300, 40, 150, 60), { id: 'pfeil', type: 'arrow', x: 260, y: 70, width: 40, height: 0, points: [[0, 0], [40, 0]], startBinding: { elementId: 'neu1' }, endBinding: { elementId: 'neu2' } } as El];
    const [dx, dy] = placeBlock(existing, added);
    expect(dx !== 0 || dy !== 0).toBe(true);
    const moved = moveAll(added, new Map(added.map(e => [e.id, [dx, dy] as [number, number]])));
    expect(audit([...existing, ...moved])).toEqual([]);
    // Der Block bleibt in sich gleich: Abstand der beiden Kästen unverändert, Pfeil mitgewandert.
    const [m1, m2, p] = moved;
    expect(m2!.x - m1!.x).toBe(240);
    expect(p!.x).toBe(260 + dx);
  });

  it('lässt ein neues Element, das ganz in einem bestehenden Rahmen liegt, dort', () => {
    const existing = [box('rahmen', 0, 0, 600, 400)];
    expect(placeBlock(existing, [box('innen', 100, 100)])).toEqual([0, 0]);
  });

  it('rückt nur Bewegliches weg; Bestehendes bleibt stehen, Beschriftung und Pfeile gehen mit', () => {
    const a = box('alt', 0, 0), n = box('neu', 60, 20);
    const els: El[] = [a, n, label('t-neu', n, 'Neu'),
      { id: 'p', type: 'arrow', x: 120, y: 35, width: 100, height: 0, points: [[0, 0], [100, 0]], startBinding: { elementId: 'alt' }, endBinding: { elementId: 'neu' } } as El];
    const fix = resolve(els, new Set(['neu', 't-neu', 'p']));
    expect(fix.moves.has('alt')).toBe(false);
    const out = moveAll(els, fix.moves, fix.sizes);
    const byId = new Map(out.map(e => [e.id, e]));
    expect(hit(byId.get('alt')!, byId.get('neu')!)).toBe(false);
    expect(byId.get('t-neu')!.x - byId.get('neu')!.x).toBe(10);
    // Der Pfeil beginnt am Rand von „alt“ und endet am Rand von „neu“.
    const p = byId.get('p')!, end = [p.x + p.points![1]![0], p.y + p.points![1]![1]];
    const nr = rectOf(byId.get('neu')!);
    expect(end[0]).toBeGreaterThanOrEqual(nr.x - 1);
    expect(end[0]).toBeLessThanOrEqual(nr.x + nr.w + 1);
    expect(audit(out)).toEqual([]);
  });

  it('räumt eine ganze verbaute Fläche auf', () => {
    const messy: El[] = [...grid(),
      { id: 'n1', type: 'text', x: 150, y: 60, width: 240, height: 25, text: 'Leerraum rechts' } as El,
      box('n2', 380, -10, 200, 90), { id: 'n3', type: 'text', x: 10, y: 150, width: 300, height: 25, text: 'Zeitstrahl über der Karte' } as El];
    expect(audit(messy).length).toBeGreaterThan(2);
    const fix = resolve(messy, new Set(messy.map(e => e.id)));
    const clean = moveAll(messy, fix.moves, fix.sizes);
    expect(audit(clean)).toEqual([]);
  });
});
