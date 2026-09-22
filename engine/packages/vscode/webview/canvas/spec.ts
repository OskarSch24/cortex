/**
 * Was in einem `cortex-excalidraw`-Block stehen darf, und wie daraus Elemente
 * auf der Zeichenfläche werden.
 *
 * Das Modell beschreibt Struktur: eine Mindmap als Baum, einen Ablauf als
 * Knoten und Kanten. Die Lage rechnet diese Datei aus und gibt Excalidraws
 * „Skeleton“-Format zurück, das `convertToExcalidrawElements` fertig macht.
 * Sie kennt Excalidraw selbst nicht und läuft deshalb auch im Test.
 *
 * Die Anweisung an das Modell steht in core/src/context/canvasBrief.ts — was
 * dort versprochen wird, muss hier verstanden werden.
 */

import { CANVAS_LANG } from '../../../core/src/context/canvasBrief.js';

export type Skeleton = Record<string, unknown> & { type: string; id?: string; x?: number; y?: number };

export interface MindNode { label: string; color?: string; note?: string; children: MindNode[] }
export interface FlowNode { id: string; label: string; shape: 'box' | 'round' | 'ellipse' | 'diamond' | 'note'; color?: string; group?: string }
export interface FlowEdge { from: string; to: string; label?: string; dashed?: boolean; twoWay?: boolean }
export interface FreeElement {
  type: 'rectangle' | 'ellipse' | 'diamond' | 'text' | 'arrow' | 'line';
  id?: string; x: number; y: number; width?: number; height?: number;
  label?: string; text?: string; color?: string; fill?: boolean; dashed?: boolean; fontSize?: number;
  points?: Array<[number, number]>; from?: string; to?: string;
}

export interface MapPlace { label: string; lat: number; lon: number; color?: string; size?: 'large' }
export interface MapRoute { from: string; to: string; label?: string; color?: string; dashed?: boolean }

interface Base { title?: string; mode: 'replace' | 'add'; remove: string[] }
export type CanvasSpec = Base & (
  | { layout: 'mindmap'; root: MindNode }
  | { layout: 'flow'; direction: 'down' | 'right'; nodes: FlowNode[]; edges: FlowEdge[]; groups: Array<{ id: string; label: string }> }
  | { layout: 'free'; elements: FreeElement[] }
  /** Echte Grenzen aus geo-data.json (map.ts); das Modell nennt nur Gebiet, Hervorhebungen und Orte. */
  | { layout: 'map'; region: string[]; states?: boolean; labels: boolean; neighbors: boolean; width?: number;
      highlight: Array<{ name: string; color?: string }>; places: MapPlace[]; routes: MapRoute[] }
  | { layout: 'none' }
);

export function isCanvasLang(lang?: string): boolean {
  return !!lang && (lang === CANVAS_LANG || lang === 'excalidraw');
}

/* ── Farben ─────────────────────────────────────────────────────────────── */

/** Excalidraws eigene Palette: kräftig für Linien, hell für Flächen. */
const COLORS: Record<string, { stroke: string; fill: string }> = {
  blue: { stroke: '#1971c2', fill: '#a5d8ff' },
  green: { stroke: '#2f9e44', fill: '#b2f2bb' },
  red: { stroke: '#e03131', fill: '#ffc9c9' },
  orange: { stroke: '#e8590c', fill: '#ffd8a8' },
  violet: { stroke: '#6741d9', fill: '#d0bfff' },
  yellow: { stroke: '#f08c00', fill: '#ffec99' },
  gray: { stroke: '#495057', fill: '#e9ecef' },
  teal: { stroke: '#0c8599', fill: '#99e9f2' },
  pink: { stroke: '#c2255c', fill: '#fcc2d7' },
  black: { stroke: '#1e1e1e', fill: '#ced4da' },
};
const ALIASES: Record<string, string> = {
  grey: 'gray', purple: 'violet', cyan: 'teal', blau: 'blue', grün: 'green', gruen: 'green', rot: 'red',
  gelb: 'yellow', grau: 'gray', lila: 'violet', rosa: 'pink', schwarz: 'black', türkis: 'teal',
};
/** Die Äste einer Mindmap bekommen der Reihe nach diese Farben. */
const BRANCHES = ['blue', 'green', 'orange', 'violet', 'red', 'teal', 'pink', 'yellow'];
const INK = '#1e1e1e';

export function colorOf(name?: string): { stroke: string; fill: string } | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase();
  const named = COLORS[ALIASES[key] ?? key];
  if (named) return named;
  if (/^#[0-9a-f]{6}$/i.test(key) || /^#[0-9a-f]{3}$/i.test(key)) return { stroke: key, fill: key };
  return undefined;
}

/** Für die Beschreibung an das Modell: aus einem Farbwert wieder ein Name. */
export function colorName(hex?: string): string | undefined {
  if (!hex || hex === 'transparent') return undefined;
  const lower = hex.toLowerCase();
  // Schwarze Tinte ist der Normalfall und keine Angabe wert.
  if (lower === INK) return undefined;
  for (const [name, c] of Object.entries(COLORS)) if (c.stroke === lower || c.fill === lower) return name;
  return lower;
}

/* ── Prüfen ─────────────────────────────────────────────────────────────── */

const MAX_ITEMS = 400;
type Parsed = { ok: true; spec: CanvasSpec } | { ok: false; error: string };

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const obj = (v: unknown): Record<string, unknown> | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function mindNode(raw: unknown, depth: number, count: { n: number }): MindNode | undefined {
  // Ein Ast als blanker Text ist erlaubt — Modelle schreiben Blätter gern so.
  const o = typeof raw === 'string' ? { label: raw } : obj(raw);
  const label = o && (str(o.label) ?? str(o.text) ?? str(o.title) ?? str(o.name));
  if (!o || !label || depth > 12 || ++count.n > MAX_ITEMS) return undefined;
  const kids = arr(o.children ?? o.items ?? o.branches);
  return {
    label, color: str(o.color), note: str(o.note),
    children: kids.map(kid => mindNode(kid, depth + 1, count)).filter((kid): kid is MindNode => !!kid),
  };
}

const SHAPES = new Set(['box', 'round', 'ellipse', 'diamond', 'note']);
const SHAPE_ALIASES: Record<string, FlowNode['shape']> = {
  rectangle: 'box', rect: 'box', square: 'box', rounded: 'round', circle: 'ellipse', oval: 'ellipse',
  decision: 'diamond', rhombus: 'diamond', sticky: 'note',
};

export function parseCanvas(code: string): Parsed {
  let raw: unknown;
  try { raw = JSON.parse(code); } catch (e) { return { ok: false, error: `kein gültiges JSON (${(e as Error).message})` }; }
  const o = obj(raw);
  if (!o) return { ok: false, error: 'erwartet ein JSON-Objekt' };
  const base: Base = {
    title: str(o.title),
    mode: o.mode === 'add' || o.mode === 'append' ? 'add' : 'replace',
    remove: arr(o.remove).map(str).filter((id): id is string => !!id),
  };
  const layout = str(o.layout)?.toLowerCase()
    ?? (o.root ? 'mindmap' : o.nodes ? 'flow' : o.elements ? 'free' : o.region || o.places ? 'map' : base.remove.length ? 'none' : undefined);

  if (layout === 'mindmap') {
    const root = mindNode(o.root ?? (o.label ? o : undefined), 0, { n: 0 });
    if (!root) return { ok: false, error: 'Mindmap ohne "root" mit "label"' };
    return { ok: true, spec: { ...base, layout: 'mindmap', root } };
  }

  if (layout === 'flow') {
    const seen = new Set<string>();
    const nodes: FlowNode[] = [];
    for (const [i, entry] of arr(o.nodes).slice(0, MAX_ITEMS).entries()) {
      const n = typeof entry === 'string' ? { id: entry, label: entry } : obj(entry);
      if (!n) continue;
      const id = str(n.id) ?? `n${i + 1}`;
      const label = str(n.label) ?? str(n.text) ?? id;
      if (seen.has(id)) continue;
      seen.add(id);
      const shapeRaw = str(n.shape)?.toLowerCase() ?? 'round';
      const shape = (SHAPES.has(shapeRaw) ? shapeRaw : SHAPE_ALIASES[shapeRaw] ?? 'round') as FlowNode['shape'];
      nodes.push({ id, label, shape, color: str(n.color), group: str(n.group) });
    }
    if (!nodes.length) return { ok: false, error: 'Ablauf ohne "nodes"' };
    const edges: FlowEdge[] = [];
    for (const entry of arr(o.edges ?? o.links).slice(0, MAX_ITEMS * 2)) {
      // Auch [von, nach] und [von, nach, Beschriftung] sind erlaubt.
      const e: Record<string, unknown> | undefined = Array.isArray(entry) ? { from: entry[0], to: entry[1], label: entry[2] } : obj(entry);
      const from = e && str(e.from ?? e.source), to = e && str(e.to ?? e.target);
      if (!e || !from || !to || !seen.has(from) || !seen.has(to)) continue;
      edges.push({ from, to, label: str(e.label), dashed: e.dashed === true || e.style === 'dashed', twoWay: e.twoWay === true || e.bidirectional === true });
    }
    const groups = arr(o.groups).map(obj).filter((g): g is Record<string, unknown> => !!g && !!str(g.id))
      .map(g => ({ id: str(g.id)!, label: str(g.label) ?? str(g.id)! }));
    const direction = ['right', 'lr', 'horizontal'].includes(str(o.direction)?.toLowerCase() ?? '') ? 'right' : 'down';
    return { ok: true, spec: { ...base, layout: 'flow', direction, nodes, edges, groups } };
  }

  if (layout === 'free') {
    const elements: FreeElement[] = [];
    for (const entry of arr(o.elements).slice(0, MAX_ITEMS)) {
      const e = obj(entry);
      const type = str(e?.type)?.toLowerCase();
      const kind = type === 'rect' || type === 'box' ? 'rectangle' : type === 'circle' ? 'ellipse' : type;
      if (!e || !kind || !['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line'].includes(kind)) continue;
      const points = arr(e.points).map(p => (Array.isArray(p) && num(p[0]) !== undefined && num(p[1]) !== undefined ? [num(p[0])!, num(p[1])!] as [number, number] : undefined))
        .filter((p): p is [number, number] => !!p);
      elements.push({
        type: kind as FreeElement['type'], id: str(e.id), x: num(e.x) ?? 0, y: num(e.y) ?? 0,
        width: num(e.width), height: num(e.height), label: str(e.label), text: str(e.text),
        color: str(e.color), fill: e.fill === true, dashed: e.dashed === true, fontSize: num(e.fontSize),
        points: points.length >= 2 ? points : undefined, from: str(e.from), to: str(e.to),
      });
    }
    if (!elements.length) return { ok: false, error: 'freie Zeichnung ohne "elements"' };
    return { ok: true, spec: { ...base, layout: 'free', elements } };
  }

  if (layout === 'map') {
    const region = (Array.isArray(o.region) ? o.region : [o.region ?? o.country ?? 'Germany']).map(str).filter((r): r is string => !!r).slice(0, 60);
    const places: MapPlace[] = [];
    for (const entry of arr(o.places ?? o.markers).slice(0, MAX_ITEMS)) {
      const p = obj(entry);
      const lat = num(p?.lat), lon = num(p?.lon ?? p?.lng);
      if (!p || lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
      places.push({ label: str(p.label) ?? str(p.name) ?? '', lat, lon, color: str(p.color), size: p.size === 'large' ? 'large' : undefined });
    }
    const highlight = arr(o.highlight).map(h => (typeof h === 'string' ? { name: h } : obj(h)))
      .filter((h): h is Record<string, unknown> => !!h && !!str(h.name))
      .map(h => ({ name: str(h.name)!, color: str(h.color) }));
    const routes = arr(o.routes).map(obj).filter((r): r is Record<string, unknown> => !!r && !!str(r.from) && !!str(r.to))
      .map(r => ({ from: str(r.from)!, to: str(r.to)!, label: str(r.label), color: str(r.color), dashed: r.dashed === true }));
    return { ok: true, spec: {
      ...base, layout: 'map', region, places, highlight, routes,
      states: typeof o.states === 'boolean' ? o.states : undefined, labels: o.labels !== false, neighbors: o.neighbors === true, width: num(o.width),
    } };
  }

  if (layout === 'none') return { ok: true, spec: { ...base, mode: 'add', layout: 'none' } };
  return { ok: false, error: 'unbekanntes "layout" — erwartet mindmap, flow, map oder free' };
}

/** Wie viele Dinge der Block zeichnet — für die Karte im Verlauf. */
export function specSize(spec: CanvasSpec): number {
  if (spec.layout === 'mindmap') {
    const count = (n: MindNode): number => 1 + n.children.reduce((sum, kid) => sum + count(kid), 0);
    return count(spec.root);
  }
  if (spec.layout === 'flow') return spec.nodes.length;
  if (spec.layout === 'free') return spec.elements.length;
  if (spec.layout === 'map') return spec.places.length;
  return 0;
}

/* ── Maße ───────────────────────────────────────────────────────────────── */

/** Zeilenumbruch nach Wörtern; ein ausdrückliches "\n" gilt immer. */
export function wrap(text: string, max = 24): string {
  const out: string[] = [];
  for (const para of text.split(/\\n|\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > max) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Excalifont läuft etwa 0,6 em breit; lieber etwas Luft als abgeschnitten. */
function measure(text: string, fontSize: number, padX = 26, padY = 18): { w: number; h: number } {
  const lines = text.split('\n');
  const longest = Math.max(...lines.map(line => line.length));
  return {
    w: Math.max(120, Math.round(longest * fontSize * 0.66 + padX * 2)),
    h: Math.max(56, Math.round(lines.length * fontSize * 1.3 + padY * 2)),
  };
}

/* ── Mindmap ────────────────────────────────────────────────────────────── */

interface Placed { id: string; x: number; y: number; w: number; h: number }

function mindmap(root: MindNode, id: (base: string) => string): Skeleton[] {
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

/* ── Ablauf ─────────────────────────────────────────────────────────────── */

function flow(spec: Extract<CanvasSpec, { layout: 'flow' }>, id: (base: string) => string): Skeleton[] {
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

/* ── Frei ───────────────────────────────────────────────────────────────── */

/* ── Überlappungen ──────────────────────────────────────────────────────── */

export interface Rect { x: number; y: number; w: number; h: number }
const GAP = 14;
export const rectsOverlap = (a: Rect, b: Rect, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const contains = (a: Rect, b: Rect) => a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h;

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
    const parent = nodes.filter(p => p !== n && contains(p.r, n.r) && area(p.r) > area(n.r)).sort((a, b) => area(a.r) - area(b.r))[0];
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

function free(input: FreeElement[], id: (base: string) => string): Skeleton[] {
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

/* ── Zusammen ───────────────────────────────────────────────────────────── */

/**
 * Die Elemente eines Blocks. `taken` sind die Kennungen, die schon auf der
 * Fläche stehen: wer im „add“-Modus wieder `start` nennt, soll nicht das
 * Vorhandene überschreiben.
 */
export function toSkeleton(
  spec: CanvasSpec,
  taken: ReadonlySet<string> = new Set(),
  /** Karten zeichnet map.ts — nur im Excalidraw-Paket, die Grenzdaten sind groß. */
  maps?: (spec: Extract<CanvasSpec, { layout: 'map' }>, id: (base: string) => string) => Skeleton[],
): Skeleton[] {
  const used = new Set(taken);
  let n = 0;
  const id = (base: string) => {
    const clean = base.replace(/[^\w-]/g, '_').slice(0, 40) || 'el';
    let candidate = clean === 'node' || clean === 'edge' ? `${clean}-${++n}` : clean;
    while (used.has(candidate)) candidate = `${clean}-${++n}`;
    used.add(candidate);
    return candidate;
  };
  if (spec.layout === 'mindmap') return mindmap(spec.root, id);
  if (spec.layout === 'flow') return flow(spec, id);
  if (spec.layout === 'free') return free(spec.elements, id);
  if (spec.layout === 'map') return maps ? maps(spec, id) : [];
  return [];
}

/** Umriss einer Menge von Elementen (Rahmen zählen erst nach dem Umwandeln). */
export function bounds(elements: Array<{ x?: unknown; y?: unknown; width?: unknown; height?: unknown }>): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    if (typeof e.x !== 'number' || typeof e.y !== 'number') continue;
    const w = typeof e.width === 'number' ? e.width : 0, h = typeof e.height === 'number' ? e.height : 0;
    minX = Math.min(minX, e.x, e.x + w); maxX = Math.max(maxX, e.x, e.x + w);
    minY = Math.min(minY, e.y, e.y + h); maxY = Math.max(maxY, e.y, e.y + h);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

/** Schiebt ein Skelett, ohne Kennungen oder Verbindungen anzufassen. */
export function shift(elements: Skeleton[], dx: number, dy: number): Skeleton[] {
  return elements.map(e => (typeof e.x === 'number' && typeof e.y === 'number' ? { ...e, x: e.x + dx, y: e.y + dy } : e));
}
