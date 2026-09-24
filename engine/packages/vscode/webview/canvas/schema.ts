/** Was ein `cortex-excalidraw`-Block enthalten darf: Typen, Farben und die Prüfung. */

import { CANVAS_COLORS, CANVAS_LANG } from '../../../core/src/context/canvasBrief.js';

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

type Swatch = { stroke: string; fill: string };
/** Excalidraws eigene Palette: kräftig für Linien, hell für Flächen. Genau die Namen aus dem Brief. */
export const COLORS: Record<string, Swatch> = {
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
} satisfies Record<(typeof CANVAS_COLORS)[number], Swatch>;
const ALIASES: Record<string, string> = {
  grey: 'gray', purple: 'violet', cyan: 'teal', blau: 'blue', grün: 'green', gruen: 'green', rot: 'red',
  gelb: 'yellow', grau: 'gray', lila: 'violet', rosa: 'pink', schwarz: 'black', türkis: 'teal',
};
/** Die Äste einer Mindmap bekommen der Reihe nach diese Farben. */
export const BRANCHES = ['blue', 'green', 'orange', 'violet', 'red', 'teal', 'pink', 'yellow'];
export const INK = '#1e1e1e';

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
