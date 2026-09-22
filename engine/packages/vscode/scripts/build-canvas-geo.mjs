/**
 * Erzeugt webview/canvas/geo-data.json: echte Grenzen für Karten auf der
 * Excalidraw-Fläche, damit ein Modell eine Deutschlandkarte nicht aus dem
 * Gedächtnis nachzeichnet.
 *
 * - Länder: Natural Earth 1:50 Mio. (world-atlas, gemeinfrei), in Grad.
 * - Bundesländer: MapSVG über @svg-maps/germany (CC BY 4.0). Die Pfade liegen
 *   in SVG-Einheiten; sie werden über den Umriss Deutschlands aus Natural
 *   Earth 1:10 Mio. in Grad zurückgerechnet. Welche Projektion MapSVG nutzt,
 *   entscheidet der Abgleich — der kleinere Fehler gewinnt.
 *
 * Aufruf: node scripts/build-canvas-geo.mjs (nur nötig, wenn sich die Quellen ändern).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';

const require = createRequire(import.meta.url);
const atlas = (name) => JSON.parse(readFileSync(require.resolve(`world-atlas/${name}`), 'utf8'));

/* ── Hilfen ─────────────────────────────────────────────────────────────── */

const rings = (geometry) => geometry.type === 'Polygon' ? geometry.coordinates : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : [];

/** Douglas-Peucker in Grad, mit cos(Breite) für die Länge. */
function simplify(points, tolerance) {
  if (points.length < 5) return points;
  const k = Math.cos((points[0][1] * Math.PI) / 180);
  const dist = (p, a, b) => {
    const [px, py, ax, ay, bx, by] = [p[0] * k, p[1], a[0] * k, a[1], b[0] * k, b[1]];
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
    return Math.hypot(px - ax - t * dx, py - ay - t * dy);
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, at = -1;
    for (let i = a + 1; i < b; i++) { const d = dist(points[i], points[a], points[b]); if (d > max) { max = d; at = i; } }
    if (max > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

const round = (ring) => ring.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
/** Winzige Inseln fallen weg — auf einer Übersichtskarte sind sie Rauschen. */
function area(ring) {
  const k = Math.cos((ring[0][1] * Math.PI) / 180);
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * k * ring[i + 1][1] - ring[i + 1][0] * k * ring[i][1];
  return Math.abs(s / 2);
}

/* ── Länder ─────────────────────────────────────────────────────────────── */

const world = atlas('countries-50m.json');
const countries = feature(world, world.objects.countries).features
  .map(f => ({
    name: f.properties.name,
    rings: rings(f.geometry).map(r => simplify(r, 0.035)).filter(r => r.length >= 4 && area(r) > 0.02).map(round),
  }))
  .filter(c => c.rings.length);

/* ── Bundesländer ───────────────────────────────────────────────────────── */

const svgMap = (await import('@svg-maps/germany')).default;
function parsePath(d) {
  const tokens = d.match(/[mz]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const out = [];
  let x = 0, y = 0, sx = 0, sy = 0, ring = null, first = false;
  for (let i = 0; i < tokens.length;) {
    const t = tokens[i];
    if (t === 'm' || t === 'M') { first = true; i++; continue; }
    if (t === 'z' || t === 'Z') { if (ring) { ring.push([sx, sy]); out.push(ring); } ring = null; x = sx; y = sy; i++; continue; }
    const dx = Number(t), dy = Number(tokens[i + 1]); i += 2;
    x += dx; y += dy;
    if (first) { if (ring) out.push(ring); ring = [[x, y]]; sx = x; sy = y; first = false; } else ring.push([x, y]);
  }
  if (ring) out.push(ring);
  return out;
}
const states = svgMap.locations.map(l => ({ name: l.name, id: l.id, rings: parsePath(l.path) }));
const all = states.flatMap(s => s.rings.flat());
const svgBox = { minX: Math.min(...all.map(p => p[0])), maxX: Math.max(...all.map(p => p[0])), minY: Math.min(...all.map(p => p[1])), maxY: Math.max(...all.map(p => p[1])) };

const fine = atlas('countries-10m.json');
const germany = feature(fine, fine.objects.countries).features.find(f => f.properties.name === 'Germany');
const outline = rings(germany.geometry).flat();
const geoBox = { minX: Math.min(...outline.map(p => p[0])), maxX: Math.max(...outline.map(p => p[0])), minY: Math.min(...outline.map(p => p[1])), maxY: Math.max(...outline.map(p => p[1])) };

const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const unmerc = (y) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;
const projections = {
  equirectangular: { y: lat => lat, inv: v => v },
  mercator: { y: merc, inv: unmerc },
};
function toGeo(proj, [px, py]) {
  const lon = geoBox.minX + ((px - svgBox.minX) / (svgBox.maxX - svgBox.minX)) * (geoBox.maxX - geoBox.minX);
  const top = proj.y(geoBox.maxY), bottom = proj.y(geoBox.minY);
  const v = top - ((py - svgBox.minY) / (svgBox.maxY - svgBox.minY)) * (top - bottom);
  return [lon, proj.inv(v)];
}
/** Mittlerer Abstand (km) jedes Bundesland-Randpunkts zum nächsten Punkt des echten Umrisses — nur Außengrenze zählt. */
function error(proj) {
  const sample = all.filter((_, i) => i % 7 === 0).map(p => toGeo(proj, p));
  const km = (a, b) => Math.hypot((a[0] - b[0]) * 111 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111);
  const ds = sample.map(p => Math.min(...outline.map(q => km(p, q)))).sort((a, b) => a - b);
  // Innere Grenzen liegen weit vom Umriss; der Median der äußeren Hälfte trifft die Passung.
  return ds[Math.floor(ds.length * 0.25)];
}
const fits = Object.entries(projections).map(([name, proj]) => ({ name, proj, err: error(proj) }));
fits.forEach(f => console.log(`Projektion ${f.name}: ${f.err.toFixed(2)} km`));
const best = fits.sort((a, b) => a.err - b.err)[0];

const GERMAN = {
  'Baden-Wurttemberg': 'Baden-Württemberg', Bavaria: 'Bayern', Berlin: 'Berlin', Brandenburg: 'Brandenburg', Bremen: 'Bremen',
  Hamburg: 'Hamburg', Hesse: 'Hessen', 'Lower Saxony': 'Niedersachsen', 'Mecklenburg-Vorpommern': 'Mecklenburg-Vorpommern',
  'North Rhine-Westphalia': 'Nordrhein-Westfalen', 'Rhineland-Palatinate': 'Rheinland-Pfalz', Saarland: 'Saarland', Saxony: 'Sachsen',
  'Saxony-Anhalt': 'Sachsen-Anhalt', 'Schleswig-Holstein': 'Schleswig-Holstein', Thuringia: 'Thüringen',
};
const deStates = states.map(s => ({
  name: GERMAN[s.name] ?? s.name,
  rings: s.rings.map(r => simplify(r.map(p => toGeo(best.proj, p)), 0.012)).filter(r => r.length >= 4 && area(r) > 0.0008).map(round),
}));

const out = {
  source: 'Länder: Natural Earth 1:50m (gemeinfrei, world-atlas). Bundesländer: MapSVG via @svg-maps/germany (CC BY 4.0), in Grad umgerechnet (' + best.name + ', ' + best.err.toFixed(1) + ' km).',
  countries, deStates,
};
const json = JSON.stringify(out);
writeFileSync(new URL('../webview/canvas/geo-data.json', import.meta.url), json);
console.log(`${countries.length} Länder, ${deStates.length} Bundesländer, ${(json.length / 1024).toFixed(0)} KB`);
