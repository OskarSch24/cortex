/**
 * Karten auf der Excalidraw-Fläche — aus echten Grenzen, nicht aus dem
 * Gedächtnis eines Modells.
 *
 * Das Modell sagt nur, welches Gebiet, welche Länder oder Bundesländer
 * hervorgehoben und welche Orte (mit echten Koordinaten) markiert werden.
 * Die Umrisse kommen aus geo-data.json (scripts/build-canvas-geo.mjs):
 * Natural Earth für Länder, MapSVG für die Bundesländer. Gezeichnet wird in
 * Mercator, derselben Projektion, in der die Bundesländer vorliegen.
 *
 * Diese Datei wird nur ins Excalidraw-Paket gebaut — die Daten sind ein
 * halbes Megabyte und gehören nicht in die Webview, die sie nie braucht.
 */
import geo from './geo-data.json';
import { colorOf, rectsOverlap, type CanvasSpec, type Rect, type Skeleton } from './spec.js';

type Ring = Array<[number, number]>;
type MapSpec = Extract<CanvasSpec, { layout: 'map' }>;

const INK = '#1e1e1e';
const BORDER = '#495057';
const LAND = '#e9ecef';
// Nachbarn nur als Linie: gefüllt verschwämme das Gebiet im Dunkelmodus mit ihnen.
const CONTEXT = { stroke: '#ced4da', fill: 'transparent' };

/** Deutsche und gebräuchliche Namen → Natural-Earth-Name. */
const COUNTRY_ALIASES: Record<string, string> = {
  deutschland: 'Germany', de: 'Germany', österreich: 'Austria', oesterreich: 'Austria', schweiz: 'Switzerland',
  frankreich: 'France', italien: 'Italy', spanien: 'Spain', portugal: 'Portugal', polen: 'Poland', tschechien: 'Czechia',
  'czech republic': 'Czechia', niederlande: 'Netherlands', holland: 'Netherlands', belgien: 'Belgium', luxemburg: 'Luxembourg',
  dänemark: 'Denmark', daenemark: 'Denmark', schweden: 'Sweden', norwegen: 'Norway', finnland: 'Finland', island: 'Iceland',
  irland: 'Ireland', 'vereinigtes königreich': 'United Kingdom', großbritannien: 'United Kingdom', grossbritannien: 'United Kingdom', uk: 'United Kingdom',
  england: 'United Kingdom', griechenland: 'Greece', türkei: 'Turkey', tuerkei: 'Turkey', ungarn: 'Hungary', rumänien: 'Romania',
  bulgarien: 'Bulgaria', kroatien: 'Croatia', slowenien: 'Slovenia', slowakei: 'Slovakia', serbien: 'Serbia', ukraine: 'Ukraine',
  russland: 'Russia', belarus: 'Belarus', weißrussland: 'Belarus', litauen: 'Lithuania', lettland: 'Latvia', estland: 'Estonia',
  usa: 'United States of America', 'vereinigte staaten': 'United States of America', 'united states': 'United States of America',
  kanada: 'Canada', mexiko: 'Mexico', brasilien: 'Brazil', argentinien: 'Argentina', china: 'China', japan: 'Japan', indien: 'India',
  australien: 'Australia', ägypten: 'Egypt', marokko: 'Morocco', südafrika: 'South Africa', 'saudi-arabien': 'Saudi Arabia',
  iran: 'Iran', irak: 'Iraq', syrien: 'Syria', israel: 'Israel', jordanien: 'Jordan', libanon: 'Lebanon',
};
const STATE_ALIASES: Record<string, string> = {
  bavaria: 'Bayern', hesse: 'Hessen', 'lower saxony': 'Niedersachsen', 'north rhine-westphalia': 'Nordrhein-Westfalen', nrw: 'Nordrhein-Westfalen',
  'rhineland-palatinate': 'Rheinland-Pfalz', saxony: 'Sachsen', 'saxony-anhalt': 'Sachsen-Anhalt', thuringia: 'Thüringen',
  'baden-wurttemberg': 'Baden-Württemberg', 'baden-wuerttemberg': 'Baden-Württemberg', bw: 'Baden-Württemberg', mv: 'Mecklenburg-Vorpommern',
};
/** Ausschnitte für ganze Weltgegenden, in Grad: [West, Süd, Ost, Nord]. */
const AREAS: Record<string, [number, number, number, number]> = {
  europe: [-12, 34, 35, 71], europa: [-12, 34, 35, 71], mitteleuropa: [2, 44, 25, 56], dach: [5, 45.5, 17.5, 55.3],
  world: [-170, -58, 180, 80], welt: [-170, -58, 180, 80], 'nahost': [25, 12, 63, 42], 'middle east': [25, 12, 63, 42],
};

const countries = geo.countries as Array<{ name: string; rings: Ring[] }>;
const states = geo.deStates as Array<{ name: string; rings: Ring[] }>;
const countryByName = new Map(countries.map(c => [c.name.toLowerCase(), c]));

export function findCountry(name: string) {
  const key = name.trim().toLowerCase();
  return countryByName.get(COUNTRY_ALIASES[key]?.toLowerCase() ?? key);
}
export function findState(name: string) {
  const key = name.trim().toLowerCase();
  const wanted = STATE_ALIASES[key] ?? name.trim();
  return states.find(s => s.name.toLowerCase() === wanted.toLowerCase());
}

/* ── Geometrie ──────────────────────────────────────────────────────────── */

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));
type Box = [number, number, number, number];

function boxOf(rings: Ring[]): Box {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const r of rings) for (const [x, y] of r) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Sutherland-Hodgman gegen ein Rechteck — Russland soll Europa nicht bis Kamtschatka verlängern. */
function clip(ring: Ring, [w, s, e, n]: Box): Ring {
  let pts: Ring = ring;
  const edges: Array<[(p: [number, number]) => boolean, (a: [number, number], b: [number, number]) => [number, number]]> = [
    [p => p[0] >= w, (a, b) => [w, a[1] + ((b[1] - a[1]) * (w - a[0])) / (b[0] - a[0])]],
    [p => p[0] <= e, (a, b) => [e, a[1] + ((b[1] - a[1]) * (e - a[0])) / (b[0] - a[0])]],
    [p => p[1] >= s, (a, b) => [a[0] + ((b[0] - a[0]) * (s - a[1])) / (b[1] - a[1]), s]],
    [p => p[1] <= n, (a, b) => [a[0] + ((b[0] - a[0]) * (n - a[1])) / (b[1] - a[1]), n]],
  ];
  for (const [inside, cross] of edges) {
    const input = pts; pts = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i]!, prev = input[(i + input.length - 1) % input.length]!;
      if (inside(cur)) { if (!inside(prev)) pts.push(cross(prev, cur)); pts.push(cur); }
      else if (inside(prev)) pts.push(cross(prev, cur));
    }
    if (!pts.length) return [];
  }
  if (pts.length && (pts[0]![0] !== pts[pts.length - 1]![0] || pts[0]![1] !== pts[pts.length - 1]![1])) pts.push(pts[0]!);
  return pts;
}

/** Innenringe (Berlin in Brandenburg) — Excalidraw füllt keine Löcher; sie werden vom Innenliegenden überdeckt. */
function inside(p: [number, number], ring: Ring): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const outerRings = (rings: Ring[]) => rings.filter(r => !rings.some(o => o !== r && o.length > r.length && inside(r[0]!, o)));

/** Schwerpunkt des größten Rings — dorthin kommt der Name. */
function labelPoint(rings: Ring[]): [number, number] {
  let best: Ring = rings[0]!, bestArea = 0;
  for (const r of rings) {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = r; }
  }
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < best.length - 1; i++) {
    const f = best[i]![0] * best[i + 1]![1] - best[i + 1]![0] * best[i]![1];
    a += f; cx += (best[i]![0] + best[i + 1]![0]) * f; cy += (best[i]![1] + best[i + 1]![1]) * f;
  }
  if (!a) return best[0]!;
  const c: [number, number] = [cx / (3 * a), cy / (3 * a)];
  return inside(c, best) ? c : best[Math.floor(best.length / 2)]!;
}

/* ── Karte ──────────────────────────────────────────────────────────────── */

export function mapSkeleton(spec: MapSpec, id: (base: string) => string): Skeleton[] {
  // Gebiet: benannte Weltgegend, sonst die genannten Länder.
  const areaKey = spec.region.length === 1 ? spec.region[0]!.toLowerCase() : '';
  const focus = AREAS[areaKey] ? [] : spec.region.map(findCountry).filter((c): c is NonNullable<typeof c> => !!c);
  const germanyOnly = focus.length === 1 && focus[0]!.name === 'Germany';
  const showStates = spec.states ?? germanyOnly;
  let view: Box = AREAS[areaKey] ?? boxOf((focus.length ? focus : countries.filter(c => c.name === 'Germany')).flatMap(c => outerRings(c.rings)));
  if (!AREAS[areaKey]) {
    // Etwas Rand, und darin die Nachbarn in Grau — eine Insel ohne Umgebung liest sich schlecht.
    const padX = (view[2] - view[0]) * (spec.neighbors ? 0.18 : 0.04), padY = (view[3] - view[1]) * (spec.neighbors ? 0.18 : 0.04);
    view = [view[0] - padX, view[1] - padY, view[2] + padX, view[3] + padY];
  }

  const width = Math.max(300, Math.min(3000, spec.width ?? 900));
  const k = width / (((view[2] - view[0]) * Math.PI) / 180);
  const top = merc(view[3]);
  const px = ([lon, lat]: [number, number]): [number, number] => [Math.round((((lon - view[0]) * Math.PI) / 180) * k * 10) / 10, Math.round((top - merc(lat)) * k * 10) / 10];

  const out: Skeleton[] = [];
  const polygon = (ring: Ring, base: string, stroke: string, fill: string, strokeWidth: number) => {
    const pts = ring.map(px);
    if (pts.length < 4) return;
    const [x0, y0] = pts[0]!;
    const rel = pts.map(([x, y]) => [Math.round((x - x0) * 10) / 10, Math.round((y - y0) * 10) / 10]);
    const xs = rel.map(p => p[0]!), ys = rel.map(p => p[1]!);
    out.push({
      type: 'line', id: id(base), x: x0, y: y0, points: rel,
      width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
      strokeColor: stroke, backgroundColor: fill, fillStyle: 'solid', strokeWidth, roughness: 0,
      roundness: null, startArrowhead: null, endArrowhead: null,
    });
  };
  const highlight = new Map(spec.highlight.map(h => [h.name.toLowerCase(), h] as const));
  const colourFor = (...names: string[]) => {
    for (const n of names) { const h = highlight.get(n.toLowerCase()); if (h) return colorOf(h.color) ?? colorOf('blue'); }
    return undefined;
  };
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-');

  // 1. Umgebung und Länder.
  const focusNames = new Set(focus.map(c => c.name));
  const shown = AREAS[areaKey] || spec.neighbors ? countries.filter(c => overlaps(boxOf(c.rings), view)) : focus;
  for (const c of shown) {
    const inFocus = focusNames.has(c.name) || !!AREAS[areaKey];
    const hl = colourFor(c.name, ...Object.entries(COUNTRY_ALIASES).filter(([, v]) => v === c.name).map(([a]) => a));
    if (showStates && c.name === 'Germany') continue;
    const stroke = inFocus ? BORDER : CONTEXT.stroke;
    const fill = hl?.fill ?? (inFocus ? LAND : CONTEXT.fill);
    for (const ring of outerRings(c.rings)) {
      const cut = AREAS[areaKey] || spec.neighbors ? clip(ring, view) : ring;
      polygon(cut, `land-${slug(c.name)}`, stroke, fill, inFocus ? 1.5 : 1);
    }
  }

  // 2. Bundesländer; die Stadtstaaten zuletzt, damit sie über ihrem Umland liegen.
  if (showStates) {
    const ordered = [...states].sort((a, b) => Number(['Berlin', 'Bremen', 'Hamburg'].includes(a.name)) - Number(['Berlin', 'Bremen', 'Hamburg'].includes(b.name)));
    for (const s of ordered) {
      const hl = colourFor(s.name, ...Object.entries(STATE_ALIASES).filter(([, v]) => v === s.name).map(([a]) => a));
      for (const ring of outerRings(s.rings)) polygon(ring, `land-${slug(s.name)}`, BORDER, hl?.fill ?? LAND, 1);
    }
    const germany = countries.find(c => c.name === 'Germany');
    if (germany) for (const ring of outerRings(germany.rings)) polygon(ring, 'grenze-deutschland', INK, 'transparent', 2);
  }

  // Alles, was schon Platz belegt: Punkte, Gebietsnamen, gesetzte Ortsnamen.
  const taken: Rect[] = [];
  const textBox = (x: number, y: number, text: string, size: number): Rect => ({ x, y, w: [...text].length * size * 0.6, h: size * 1.3 });

  // Beschriftungen der Wege sitzen mittig auf der Linie — ihr Platz ist vergeben.
  for (const route of spec.routes) {
    const a = spec.places.find(p => p.label.toLowerCase() === route.from.toLowerCase()), b = spec.places.find(p => p.label.toLowerCase() === route.to.toLowerCase());
    if (!a || !b || !route.label) continue;
    const [ax, ay] = px([a.lon, a.lat]), [bx, by] = px([b.lon, b.lat]);
    const w = [...route.label].length * 14 * 0.6 + 12, h = 14 * 1.3 + 8;
    taken.push({ x: (ax + bx) / 2 - w / 2, y: (ay + by) / 2 - h / 2, w, h });
  }

  // 3. Namen der Gebiete — nicht dort, wo schon ein Ort mit Namen steht.
  const placePoints = spec.places.map(p => ({ name: p.label.toLowerCase(), at: px([p.lon, p.lat]) }));
  if (spec.labels) {
    const named = showStates ? states : focus;
    for (const area of named) {
      const [lx, ly] = px(labelPoint(outerRings(area.rings)));
      if (placePoints.some(p => p.name === area.name.toLowerCase() || Math.hypot(p.at[0] - lx, p.at[1] - ly) < 45)) continue;
      const small = ['Berlin', 'Bremen', 'Hamburg', 'Saarland'].includes(area.name);
      const [x, y] = [lx, ly];
      const size = small ? 11 : 14;
      const text = area.name;
      const box = textBox(Math.round(x - (text.length * size * 0.3)), Math.round(y - size / 2), text, size);
      if (taken.some(t => rectsOverlap(t, box, 2))) continue;
      taken.push(box);
      out.push({ type: 'text', id: id(`name-${slug(text)}`), x: box.x, y: box.y, text, fontSize: size, strokeColor: '#495057' });
    }
  }

  // 4. Orte und Wege — die Koordinaten liefert das Modell. Erst alle Punkte,
  // dann die Namen: ein Name darf auf keinem Punkt und keinem anderen Namen
  // liegen. Liegen zwei Orte fast aufeinander (Landtag und Gericht in einer
  // Stadt), rückt der zweite Name weg und bekommt eine feine Linie zum Punkt.
  const where = new Map<string, [number, number]>();
  const dots = spec.places.map(p => {
    const [x, y] = px([p.lon, p.lat]);
    where.set(p.label.toLowerCase(), [x, y]);
    const r = p.size === 'large' ? 9 : 6;
    const c = colorOf(p.color) ?? colorOf('red')!;
    out.push({ type: 'ellipse', id: id(`ort-${slug(p.label)}`), x: x - r, y: y - r, width: r * 2, height: r * 2, strokeColor: c.stroke, backgroundColor: c.stroke, fillStyle: 'solid', strokeWidth: 1, roughness: 0 });
    taken.push({ x: x - r, y: y - r, w: r * 2, h: r * 2 });
    return { p, x, y, r };
  });
  for (const { p, x, y, r } of dots) {
    if (!p.label) continue;
    const size = 16, w = [...p.label].length * size * 0.6, h = size * 1.3;
    const near: Array<[number, number]> = [
      [x + r + 5, y - h / 2], [x - r - 5 - w, y - h / 2], [x - w / 2, y - r - 4 - h], [x - w / 2, y + r + 4],
      [x + r + 5, y - h - r], [x + r + 5, y + r], [x - r - 5 - w, y - h - r], [x - r - 5 - w, y + r],
    ];
    const far: Array<[number, number]> = [];
    for (let step = 1; step <= 8; step++) for (const side of [1, -1]) {
      far.push([x + r + 24, y - h / 2 + side * step * (h + 4)], [x - r - 24 - w, y - h / 2 + side * step * (h + 4)]);
    }
    const free = (at: [number, number]) => !taken.some(t => rectsOverlap(t, { x: at[0], y: at[1], w, h }, 2));
    const spot = near.find(free) ?? far.find(free);
    const at = spot ?? near[0]!;
    taken.push({ x: at[0], y: at[1], w, h });
    out.push({ type: 'text', id: id(`ort-${slug(p.label)}-name`), x: Math.round(at[0]), y: Math.round(at[1]), text: p.label, fontSize: size, strokeColor: INK });
    if (spot && !near.includes(spot)) {
      // Führungslinie vom Punkt zur nächstgelegenen Kante des Namens.
      const tx = at[0] > x ? at[0] - 3 : at[0] + w + 3, ty = at[1] + h / 2;
      out.push({ type: 'line', id: id(`ort-${slug(p.label)}-linie`), x, y, points: [[0, 0], [tx - x, ty - y]], width: Math.abs(tx - x), height: Math.abs(ty - y), strokeColor: '#868e96', strokeWidth: 1, roughness: 0, startArrowhead: null, endArrowhead: null });
    }
  }
  for (const route of spec.routes) {
    const a = where.get(route.from.toLowerCase()), b = where.get(route.to.toLowerCase());
    if (!a || !b) continue;
    const c = colorOf(route.color) ?? { stroke: INK, fill: INK };
    out.push({
      type: 'arrow', id: id('weg'), x: a[0], y: a[1], points: [[0, 0], [b[0] - a[0], b[1] - a[1]]],
      width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]), strokeColor: c.stroke, strokeWidth: 2, roughness: 0,
      strokeStyle: route.dashed ? 'dashed' : 'solid', endArrowhead: 'arrow', startArrowhead: null,
      ...(route.label ? { label: { text: route.label, fontSize: 14 } } : {}),
    });
  }
  return out;
}
