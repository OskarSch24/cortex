import { measure, rectContains, rectsOverlap, wrap, type Rect } from '../geometry.js';
import { INK, colorOf, type FreeElement, type Skeleton } from '../schema.js';

/* ── Frei ───────────────────────────────────────────────────────────────── */

/* ── Überlappungen ──────────────────────────────────────────────────────── */

const GAP = 14;

/** Wie viel Platz eine Beschriftung in einer Form braucht — Ellipse und Raute haben weniger Innenraum. */
const INNER = { rectangle: 1, ellipse: 0.72, diamond: 0.55 } as const;

/**
 * Freie Zeichnungen kommen mit Lagen, die das Modell geschätzt hat. Zwei
 * Fehler kommen dabei immer wieder vor und werden hier behoben, bevor
 * gezeichnet wird:
 * - eine Form ist zu klein für ihre Beschriftung — Excalidraw bricht dann
 *   mitten im Wort um und der Rest läuft in die Form darunter;
 * - Formen liegen übereinander, obwohl keine die andere umrahmen soll.
 * Eine Form, die andere ganz umschließt (ein Gruppenrahmen), bleibt, wo sie
 * ist, und wächst am Ende mit ihrem Inhalt.
 */
export function fitAndSeparate(elements: FreeElement[]): FreeElement[] {
  const out = elements.map(e => ({ ...e }));
  // 1. Formen so groß wie ihr Text, Umbruch nur zwischen Wörtern.
  for (const e of out) {
    if (!(e.type in INNER) || !e.label) continue;
    const k = INNER[e.type as keyof typeof INNER];
    const fs = e.fontSize ?? 20, charW = fs * 0.62, pad = 22;
    const longest = Math.max(...e.label.split(/\\n|\n|\s+/).map(w => w.length));
    const minW = Math.ceil((longest * charW + pad * 2) / k);
    const w = Math.max(e.width ?? 0, minW, 90);
    const perLine = Math.max(longest, Math.floor((w * k - pad * 2) / charW));
    const lines = wrap(e.label, perLine).split('\n').length;
    const minH = Math.ceil((lines * fs * 1.3 + 36) / k);
    e.width = w;
    e.height = Math.max(e.height ?? 0, minH);
    e.label = wrap(e.label, perLine);
  }
  // 2. Übereinanderliegendes auseinanderrücken.
  const boxOf = (e: FreeElement): Rect | undefined => {
    if (e.type === 'arrow' || e.type === 'line') return undefined;
    if (e.type === 'text') {
      const text = e.text ?? e.label ?? '';
      const fs = e.fontSize ?? 20, lines = text.split('\n');
      return { x: e.x, y: e.y, w: Math.max(...lines.map(l => [...l].length)) * fs * 0.6, h: lines.length * fs * 1.25 };
    }
    return { x: e.x, y: e.y, w: e.width ?? 200, h: e.height ?? 80 };
  };
  // Was ganz in etwas anderem liegt, gehört dazu (Text in einer Karte,
  // Karten in einem Rahmen) und bewegt sich mit. Aufgelöst wird unter
  // Geschwistern, von innen nach außen; ein Eltern-Element wächst danach mit.
  type Node = { e: FreeElement; r: Rect; kids: Node[] };
  const nodes: Node[] = out.map(e => ({ e, r: boxOf(e)!, kids: [] as Node[] })).filter(n => n.r);
  const area = (r: Rect) => r.w * r.h;
  const roots: Node[] = [];
  for (const n of nodes) {
    const parent = nodes.filter(p => p !== n && rectContains(p.r, n.r) && area(p.r) > area(n.r)).sort((a, b) => area(a.r) - area(b.r))[0];
    (parent ? parent.kids : roots).push(n);
  }
  const move = (n: Node, dx: number, dy: number) => { n.r.x += dx; n.r.y += dy; n.kids.forEach(k => move(k, dx, dy)); };
  const separate = (siblings: Node[]) => {
    for (let pass = 0; pass < 40; pass++) {
      let moved = false;
      siblings.sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x);
      for (let i = 0; i < siblings.length; i++) for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i]!.r, b = siblings[j]!.r;
        if (!rectsOverlap(a, b)) continue;
        // Kürzester Weg hinaus, nach rechts oder unten — die Leserichtung bleibt.
        const dx = a.x + a.w + GAP - b.x, dy = a.y + a.h + GAP - b.y;
        if (dx < dy) move(siblings[j]!, dx, 0); else move(siblings[j]!, 0, dy);
        moved = true;
      }
      if (!moved) break;
    }
  };
  const settle = (n: Node) => {
    n.kids.forEach(settle);
    separate(n.kids);
    if (!n.kids.length) return;
    const right = Math.max(...n.kids.map(k => k.r.x + k.r.w)) + 16, bottom = Math.max(...n.kids.map(k => k.r.y + k.r.h)) + 16;
    n.r.w = Math.max(n.r.w, right - n.r.x);
    n.r.h = Math.max(n.r.h, bottom - n.r.y);
  };
  roots.forEach(settle);
  separate(roots);
  for (const { e, r } of nodes) {
    e.x = Math.round(r.x); e.y = Math.round(r.y);
    if (e.type !== 'text') { e.width = Math.round(r.w); e.height = Math.round(r.h); }
  }
  return out;
}

export function free(input: FreeElement[], id: (base: string) => string): Skeleton[] {
  const elements = fitAndSeparate(input);
  const ids = new Map<string, string>();
  const boxes = new Map<string, FreeElement>();
  const withIds = elements.map((e, i) => {
    const own = id(e.id ?? `${e.type}${i + 1}`);
    if (e.id) { ids.set(e.id, own); boxes.set(e.id, e); }
    return { e, own };
  });
  const shapes: Skeleton[] = [], lines: Skeleton[] = [];
  for (const { e, own } of withIds) {
    const color = colorOf(e.color);
    const stroke = color?.stroke ?? INK;
    if (e.type === 'text') {
      shapes.push({ type: 'text', id: own, x: e.x, y: e.y, text: e.text ?? e.label ?? '', fontSize: e.fontSize ?? 20, strokeColor: stroke });
      continue;
    }
    if (e.type === 'arrow' || e.type === 'line') {
      const from = e.from ? boxes.get(e.from) : undefined, to = e.to ? boxes.get(e.to) : undefined;
      let x = e.x, y = e.y, points = e.points;
      if (from && to) {
        const fc = centre(from), tc = centre(to);
        x = fc.x; y = fc.y; points = [[0, 0], [tc.x - fc.x, tc.y - fc.y]];
      }
      points ??= [[0, 0], [e.width ?? 150, e.height ?? 0]];
      const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
      lines.push({
        type: e.type, id: own, x, y, points,
        width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        strokeColor: stroke, strokeWidth: 2, roughness: 1, strokeStyle: e.dashed ? 'dashed' : 'solid',
        ...(e.type === 'arrow' ? { endArrowhead: 'arrow' } : {}),
        ...(from && to && e.type === 'arrow' ? { start: { id: ids.get(e.from!) }, end: { id: ids.get(e.to!) } } : {}),
        ...(e.label && e.type === 'arrow' ? { label: { text: wrap(e.label, 22), fontSize: 16 } } : {}),
      });
      continue;
    }
    // Größe und Umbruch hat fitAndSeparate schon festgelegt.
    const text = e.label;
    const m = text ? measure(text, e.fontSize ?? 20) : { w: 200, h: 80 };
    shapes.push({
      type: e.type, id: own, x: e.x, y: e.y, width: e.width ?? m.w, height: e.height ?? m.h,
      strokeColor: stroke, backgroundColor: e.fill ? color?.fill ?? '#e9ecef' : 'transparent', fillStyle: 'solid',
      strokeWidth: 2, roughness: 1, strokeStyle: e.dashed ? 'dashed' : 'solid',
      roundness: e.type === 'rectangle' ? { type: 3 } : null,
      ...(text ? { label: { text, fontSize: e.fontSize ?? 20, strokeColor: INK } } : {}),
    });
  }
  return [...shapes, ...lines];
}

function centre(e: FreeElement): { x: number; y: number } {
  return { x: e.x + (e.width ?? 200) / 2, y: e.y + (e.height ?? 80) / 2 };
}
