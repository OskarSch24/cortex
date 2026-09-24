import { measure, wrap, type Placed } from '../geometry.js';
import { BRANCHES, COLORS, INK, colorOf, type MindNode, type Skeleton } from '../schema.js';

/* ── Mindmap ────────────────────────────────────────────────────────────── */

export function mindmap(root: MindNode, id: (base: string) => string): Skeleton[] {
  const out: Skeleton[] = [];
  const edges: Skeleton[] = [];
  const GAP_X = 90, GAP_Y = 22;

  type M = { node: MindNode; text: string; font: number; w: number; h: number; sub: number; kids: M[]; depth: number };
  const build = (node: MindNode, depth: number): M => {
    const font = depth === 0 ? 28 : depth === 1 ? 22 : 18;
    const text = wrap(node.note ? `${node.label}\n${node.note}` : node.label, depth === 0 ? 22 : 26);
    const size = measure(text, font, depth === 0 ? 40 : 24, depth === 0 ? 26 : 16);
    const kids = node.children.map(kid => build(kid, depth + 1));
    const stacked = kids.reduce((sum, kid) => sum + kid.sub, 0) + GAP_Y * Math.max(0, kids.length - 1);
    return { node, text, font, ...size, sub: Math.max(size.h, stacked), kids, depth };
  };
  const tree = build(root, 0);

  const box = (m: M, cx: number, cy: number, color: { stroke: string; fill: string } | undefined): Placed => {
    const placed = { id: id(m.depth === 0 ? 'root' : 'node'), x: Math.round(cx - m.w / 2), y: Math.round(cy - m.h / 2), w: m.w, h: m.h };
    const own = colorOf(m.node.color) ?? color;
    out.push({
      type: m.depth === 0 ? 'ellipse' : 'rectangle', id: placed.id, x: placed.x, y: placed.y, width: m.w, height: m.h,
      strokeColor: m.depth === 0 ? INK : own?.stroke ?? INK,
      backgroundColor: m.depth === 0 ? (own?.fill ?? '#ffec99') : m.depth === 1 ? own?.fill ?? 'transparent' : 'transparent',
      fillStyle: 'solid', strokeWidth: m.depth <= 1 ? 2 : 1, roughness: 1,
      roundness: m.depth === 0 ? null : { type: 3 },
      label: { text: m.text, fontSize: m.font, strokeColor: INK },
    });
    return placed;
  };

  // Die Äste der Wurzel gehen zu beiden Seiten, so dass beide Hälften etwa
  // gleich hoch werden — eine einseitige Mindmap wird schnell ein Turm.
  const total = tree.kids.reduce((sum, kid) => sum + kid.sub, 0);
  let acc = 0;
  const right: M[] = [], left: M[] = [];
  for (const kid of tree.kids) {
    if (acc < total / 2 || !right.length) { right.push(kid); acc += kid.sub; } else left.push(kid);
  }

  const rootBox = box(tree, 0, 0, undefined);
  const branchColor = new Map<M, { stroke: string; fill: string }>();
  tree.kids.forEach((kid, i) => branchColor.set(kid, colorOf(kid.node.color) ?? COLORS[BRANCHES[i % BRANCHES.length]!]!));

  const connect = (from: Placed, to: Placed, side: 1 | -1, color: string, width: number) => {
    const sx = side === 1 ? from.x + from.w : from.x, sy = from.y + from.h / 2;
    const ex = side === 1 ? to.x : to.x + to.w, ey = to.y + to.h / 2;
    edges.push({
      type: 'arrow', id: id('edge'), x: sx, y: sy, width: ex - sx, height: ey - sy,
      points: [[0, 0], [ex - sx, ey - sy]],
      start: { id: from.id }, end: { id: to.id },
      strokeColor: color, strokeWidth: width, endArrowhead: null, startArrowhead: null, roughness: 1,
    });
  };

  const place = (kids: M[], parent: Placed, side: 1 | -1, inherited?: { stroke: string; fill: string }) => {
    const stacked = kids.reduce((sum, kid) => sum + kid.sub, 0) + GAP_Y * Math.max(0, kids.length - 1);
    let top = parent.y + parent.h / 2 - stacked / 2;
    for (const kid of kids) {
      const color = inherited ?? branchColor.get(kid);
      const cy = top + kid.sub / 2;
      const cx = side === 1 ? parent.x + parent.w + GAP_X + kid.w / 2 : parent.x - GAP_X - kid.w / 2;
      const placed = box(kid, cx, cy, color);
      connect(parent, placed, side, color?.stroke ?? INK, kid.depth === 1 ? 2 : 1);
      place(kid.kids, placed, side, color);
      top += kid.sub + GAP_Y;
    }
  };
  place(right, rootBox, 1);
  place(left, rootBox, -1);
  // Kanten zuletzt, damit sie beim Umwandeln ihre Knoten schon vorfinden.
  return [...out, ...edges];
}
