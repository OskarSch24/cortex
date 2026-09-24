import { describe, expect, it } from 'vitest';
import { rectContains, rectsOverlap } from '../../webview/canvas/geometry.js';

const a = { x: 0, y: 0, w: 100, h: 50 };

describe('Rechtecke der Zeichenfläche', () => {
  it('zählt Berührung ohne Abstand nicht als Überlappung', () => {
    expect(rectsOverlap(a, { x: 100, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap(a, { x: 99, y: 0, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 110, y: 0, w: 10, h: 10 }, 14)).toBe(true);
  });

  it('lässt mit Toleranz kleine Berührungen durch', () => {
    expect(rectsOverlap(a, { x: 99, y: 0, w: 10, h: 10 }, 0, 2)).toBe(false);
    expect(rectsOverlap(a, { x: 97, y: 0, w: 10, h: 10 }, 0, 2)).toBe(true);
    expect(rectsOverlap(a, { x: 110, y: 0, w: 10, h: 10 }, 16, 2)).toBe(true);
  });

  it('umschließt mit und ohne Toleranz', () => {
    expect(rectContains(a, { x: 10, y: 10, w: 20, h: 20 })).toBe(true);
    expect(rectContains(a, { x: -1, y: 10, w: 20, h: 20 })).toBe(false);
    expect(rectContains(a, { x: -1, y: 10, w: 20, h: 20 }, 2)).toBe(true);
    expect(rectContains(a, { x: 90, y: 10, w: 12, h: 20 }, 2)).toBe(true);
  });
});
