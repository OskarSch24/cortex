import { measure, wrap, type Placed } from '../geometry.js';
import { COLORS, INK, colorOf, type CanvasSpec, type FlowEdge, type Skeleton } from '../schema.js';

/* ── Ablauf ─────────────────────────────────────────────────────────────── */

export function flow(spec: Extract<CanvasSpec, { layout: 'flow' }>, id: (base: string) => string): Skeleton[] {
  const { nodes, edges, direction } = spec;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const out = new Map<string, string[]>(), into = new Map<string, string[]>();
  for (const n of nodes) { out.set(n.id, []); into.set(n.id, []); }

  // Rückwärtskanten (Schleifen) zählen für die Ebenen nicht, sonst gäbe es
  // keine erste Ebene. Gefunden werden sie über eine Tiefensuche.
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<FlowEdge>();
  const byFrom = new Map<string, FlowEdge[]>();
  for (const e of edges) { if (!byFrom.has(e.from)) byFrom.set(e.from, []); byFrom.get(e.from)!.push(e); }
  const visit = (nid: string) => {
    state.set(nid, 1);
    for (const e of byFrom.get(nid) ?? []) {
      const s = state.get(e.to) ?? 0;
      if (s === 1) back.add(e);
      else if (s === 0) visit(e.to);
    }
    state.set(nid, 2);
  };
  for (const n of nodes) if (!state.get(n.id) && !edges.some(e => e.to === n.id && e.from !== n.id)) visit(n.id);
  for (const n of nodes) if (!state.get(n.id)) visit(n.id);
  for (const e of edges) {
    if (back.has(e) || e.from === e.to) continue;
    out.get(e.from)!.push(e.to); into.get(e.to)!.push(e.from);
  }

  // Ebene = längster Weg von einem Anfang.
  const layer = new Map<string, number>();
  const depth = (nid: string, guard = 0): number => {
    if (layer.has(nid)) return layer.get(nid)!;
    const parents = into.get(nid)!;
    const d = !parents.length || guard > nodes.length ? 0 : Math.max(...parents.map(p => depth(p, guard + 1))) + 1;
    layer.set(nid, d);
    return d;
  };
  nodes.forEach(n => depth(n.id));
  const layers: string[][] = [];
  for (const n of nodes) (layers[layer.get(n.id)!] ??= []).push(n.id);

  // Reihenfolge in der Ebene: Mittel der Nachbarn, ein paar Durchgänge hin
  // und her. Knoten derselben Gruppe rücken zusammen, damit ihr Rahmen nicht
  // über fremde Knoten greift.
  const pos = new Map<string, number>();
  const refresh = () => layers.forEach(row => row.forEach((nid, i) => pos.set(nid, i)));
  refresh();
  const groupOf = new Map(nodes.map(n => [n.id, n.group ?? '']));
  for (let pass = 0; pass < 6; pass++) {
    const down = pass % 2 === 0;
    const rows = down ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const row of rows) {
      const bary = new Map(row.map(nid => {
        const near = (down ? into : out).get(nid)!;
        return [nid, near.length ? near.reduce((s, x) => s + pos.get(x)!, 0) / near.length : pos.get(nid)!] as const;
      }));
      const groupMean = new Map<string, number>();
      for (const g of new Set(row.map(nid => groupOf.get(nid)!))) {
        const members = row.filter(nid => groupOf.get(nid) === g);
        groupMean.set(g, members.reduce((s, nid) => s + bary.get(nid)!, 0) / members.length);
      }
      row.sort((a, b) => {
        const ga = groupOf.get(a)!, gb = groupOf.get(b)!;
        if (ga !== gb && ga && gb) return groupMean.get(ga)! - groupMean.get(gb)! || ga.localeCompare(gb);
        return bary.get(a)! - bary.get(b)! || index.get(a)! - index.get(b)!;
      });
      row.forEach((nid, i) => pos.set(nid, i));
    }
  }

  const sizes = new Map(nodes.map(n => {
    const text = wrap(n.label, n.shape === 'diamond' ? 18 : 24);
    const m = measure(text, 20);
    // Eine Raute braucht mehr Fläche für denselben Text.
    return [n.id, n.shape === 'diamond' ? { text, w: Math.round(m.w * 1.5), h: Math.round(m.h * 1.7) } : n.shape === 'ellipse' ? { text, w: Math.round(m.w * 1.25), h: Math.round(m.h * 1.3) } : { text, ...m }] as const;
  }));
  const labelled = edges.some(e => e.label);
  // Gruppenkästen ragen mit ihrem Namen in den Zwischenraum — der muss dann
  // breiter sein, sonst stoßen sie an die Pfeilbeschriftungen.
  const grouped = nodes.some(n => n.group);
  const MAIN_GAP = (direction === 'down' ? (labelled ? 110 : 80) : (labelled ? 170 : 120)) + (grouped ? 70 : 0);
  const CROSS_GAP = direction === 'down' ? 60 : 40;

  const placed = new Map<string, Placed>();
  let main = 0;
  for (const row of layers) {
    const cross = row.map(nid => (direction === 'down' ? sizes.get(nid)!.w : sizes.get(nid)!.h));
    const thick = Math.max(...row.map(nid => (direction === 'down' ? sizes.get(nid)!.h : sizes.get(nid)!.w)));
    const span = cross.reduce((s, c) => s + c, 0) + CROSS_GAP * (row.length - 1);
    let at = -span / 2;
    row.forEach((nid, i) => {
      const s = sizes.get(nid)!;
      const c = at + cross[i]! / 2;
      const cx = direction === 'down' ? c : main + thick / 2;
      const cy = direction === 'down' ? main + thick / 2 : c;
      placed.set(nid, { id: '', x: Math.round(cx - s.w / 2), y: Math.round(cy - s.h / 2), w: s.w, h: s.h });
      at += cross[i]! + CROSS_GAP;
    });
    main += thick + MAIN_GAP;
  }

  const ids = new Map(nodes.map(n => [n.id, id(n.id)]));
  const shapes: Skeleton[] = nodes.map(n => {
    const p = placed.get(n.id)!;
    p.id = ids.get(n.id)!;
    const color = colorOf(n.color) ?? (n.shape === 'note' ? COLORS.yellow : undefined);
    return {
      type: n.shape === 'diamond' ? 'diamond' : n.shape === 'ellipse' ? 'ellipse' : 'rectangle',
      id: p.id, x: p.x, y: p.y, width: p.w, height: p.h,
      strokeColor: color?.stroke ?? INK, backgroundColor: color?.fill ?? 'transparent', fillStyle: 'solid',
      strokeWidth: 2, roughness: 1,
      roundness: n.shape === 'box' || n.shape === 'note' ? null : { type: 3 },
      label: { text: sizes.get(n.id)!.text, fontSize: 20, strokeColor: INK },
    };
  });

  const pairs = new Set(edges.map(e => `${e.from}>${e.to}`));
  const arrows: Skeleton[] = edges.map(e => {
    const a = placed.get(e.from)!, b = placed.get(e.to)!;
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    // Vom Rand des einen zum Rand des anderen, in Laufrichtung.
    const forward = direction === 'down' ? bc.y > ac.y : bc.x > ac.x;
    const sx = direction === 'down' ? ac.x : forward ? a.x + a.w : a.x;
    const sy = direction === 'down' ? (forward ? a.y + a.h : a.y) : ac.y;
    const ex = direction === 'down' ? bc.x : forward ? b.x : b.x + b.w;
    const ey = direction === 'down' ? (forward ? b.y : b.y + b.h) : bc.y;
    // Ein Rückweg auf derselben Strecke wie der Hinweg (A→B und B→A) läge
    // genau darauf. Er bekommt einen Bogen zur Seite.
    const detour = back.has(e) && pairs.has(`${e.to}>${e.from}`) ? 70 : back.has(e) ? 40 : 0;
    const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1;
    const points: Array<[number, number]> = detour
      ? [[0, 0], [Math.round(dx / 2 + (dy / len) * detour), Math.round(dy / 2 - (dx / len) * detour)], [dx, dy]]
      : [[0, 0], [dx, dy]];
    return {
      type: 'arrow', id: id('edge'), x: sx, y: sy, width: Math.abs(dx), height: Math.abs(dy),
      points, ...(detour ? { roundness: { type: 2 } } : {}),
      start: { id: ids.get(e.from) }, end: { id: ids.get(e.to) },
      strokeColor: INK, strokeWidth: 2, roughness: 1,
      strokeStyle: e.dashed ? 'dashed' : 'solid',
      startArrowhead: e.twoWay ? 'arrow' : null, endArrowhead: 'arrow',
      ...(e.label ? { label: { text: wrap(e.label, 22), fontSize: 16 } } : {}),
    };
  });

  // Gruppen als gestrichelter Kasten hinter ihren Knoten, mit Namen oben
  // links. Excalidraws eigene Rahmen („frames“) schneiden ihren Inhalt ab und
  // wachsen um jeden gebundenen Pfeil — für ein Diagramm zu grob.
  const groups: Skeleton[] = [];
  const groupIds = [...new Set(nodes.map(n => n.group).filter((g): g is string => !!g))];
  for (const g of groupIds) {
    const members = nodes.filter(n => n.group === g).map(n => placed.get(n.id)!);
    const pad = 22, head = 34;
    const x = Math.min(...members.map(m => m.x)) - pad, y = Math.min(...members.map(m => m.y)) - pad - head;
    const w = Math.max(...members.map(m => m.x + m.w)) + pad - x, h = Math.max(...members.map(m => m.y + m.h)) + pad - y;
    const name = spec.groups.find(x => x.id === g)?.label ?? g;
    groups.push(
      { type: 'rectangle', id: id(`gruppe-${g}`), x, y, width: w, height: h, strokeColor: '#868e96', backgroundColor: 'transparent', strokeStyle: 'dashed', strokeWidth: 1, roughness: 0, roundness: { type: 3 } },
      { type: 'text', id: id(`gruppe-${g}-name`), x: x + 14, y: y + 8, text: name, fontSize: 16, strokeColor: '#868e96' },
    );
  }
  return [...groups, ...shapes, ...arrows];
}
