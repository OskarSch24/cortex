/**
 * Adressen, Namen und Kartenbilder für den Standort-Kontext im Eingabefeld.
 *
 * Adresssuche und Rückwärtssuche laufen über Nominatim, die Kartenkacheln über
 * den Kachelserver von OpenStreetMap — beides ohne Schlüssel. Deren
 * Nutzungsregeln verlangen einen erkennbaren User-Agent und wenige Anfragen:
 * gesucht wird nur auf Knopfdruck, Kacheln werden zwischengespeichert, und
 * höchstens eine Nominatim-Anfrage je Sekunde geht hinaus. Die Webview selbst
 * lädt nichts von außen — ihre CSP bleibt, wie sie ist; Kacheln kommen als
 * Data-URI.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USER_AGENT = 'Cortex/1.0 (Desktop-App; Standort-Kontext im Chat)';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const TILES = 'https://tile.openstreetmap.org';

interface GeoPlace {
  label: string;
  lat: number;
  lon: number;
}

let lastNominatim = 0;
async function nominatim(path: string): Promise<unknown> {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastNominatim = Date.now();
  const response = await fetch(`${NOMINATIM}${path}`, { headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'de' }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Die Adresssuche antwortet nicht (${response.status}).`);
  return response.json();
}

interface NominatimHit { display_name?: string; lat?: string; lon?: string; name?: string; address?: Record<string, string> }

/** Ein kurzer Name statt der langen Nominatim-Zeile: Straße Nr., Ort-Stadtteil. */
export function shortLabel(hit: NominatimHit): string {
  const a = hit.address ?? {};
  const street = [a.road ?? a.pedestrian ?? a.footway, a.house_number].filter(Boolean).join(' ');
  const place = hit.name && !street.startsWith(hit.name) && hit.name !== a.road ? hit.name : '';
  const town = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? '';
  const part = a.suburb ?? a.city_district ?? a.quarter ?? '';
  const where = [town, part && part !== town ? part : ''].filter(Boolean).join('-');
  const label = [place, street, where].filter(Boolean).join(', ');
  return label || (hit.display_name ?? '').split(',').slice(0, 3).join(',').trim() || 'Unbenannter Ort';
}

export async function geocode(query: string): Promise<GeoPlace[]> {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const hits = await nominatim(`/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`) as NominatimHit[];
  return (Array.isArray(hits) ? hits : [])
    .map(hit => ({ label: shortLabel(hit), lat: Number(hit.lat), lon: Number(hit.lon) }))
    .filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lon));
}

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const hit = await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lon}`) as NominatimHit;
  return shortLabel(hit ?? {});
}

/* ── Standort des Macs ─────────────────────────────────────────────────── */

interface DevicePosition { lat: number; lon: number; accuracy: number }

/** Was der Ortungshelfer zurückgeben kann, und was der Nutzer dann tun kann. */
const LOCATE_ERRORS: Record<string, string> = {
  denied: 'macOS hat Cortex den Standort nicht freigegeben. Erlaube ihn unter Systemeinstellungen › Datenschutz & Sicherheit › Ortungsdienste › Cortex — oder gib eine Adresse ein.',
  restricted: 'Der Standort ist auf diesem Mac eingeschränkt (Bildschirmzeit oder Profil). Gib eine Adresse ein.',
  disabled: 'Die Ortungsdienste sind ausgeschaltet: Systemeinstellungen › Datenschutz & Sicherheit › Ortungsdienste. Oder gib eine Adresse ein.',
  undetermined: 'Die Standortabfrage von macOS wurde nicht beantwortet. Drück noch einmal auf „Mein Standort“ und wähle „Erlauben“.',
  timeout: 'Die Ortung hat zu lange gedauert. Versuch es noch einmal oder gib eine Adresse ein.',
  unavailable: 'Der Standort ist gerade nicht bestimmbar (kein WLAN in Reichweite?). Gib eine Adresse ein.',
};

/**
 * Der Standort über CoreLocation (`CortexLocation.app`). Gestartet über
 * `open`, damit macOS sie als eigene App mit Freigabetext sieht — ein
 * Kindprozess ohne App-Kennung bekommt von den Ortungsdiensten keine Abfrage.
 * Die Antwort kommt als JSON-Zeile über `--stdout` in eine Wegwerfdatei.
 */
export async function locateDevice(bundle: string): Promise<DevicePosition> {
  const dir = await mkdtemp(join(tmpdir(), 'cortex-locate-'));
  const out = join(dir, 'out.json');
  try {
    const deadline = Date.now() + 75_000;
    const failed = await new Promise<Error | undefined>(resolve => {
      execFile('/usr/bin/open', ['-n', '-W', '-g', '--stdout', out, '--stderr', join(dir, 'err.txt'), bundle], { timeout: 75_000 }, error => resolve(error ?? undefined));
    });
    // Mit Freigabe ist der Helfer oft schneller fertig, als `open -W` ihn
    // abwarten kann — dann kehrt `open` sofort zurück. Maßgeblich ist die
    // Antwortzeile, nicht das Ende von `open`.
    const answer = async () => { try { return (await readFile(out, 'utf8')).trim(); } catch { return ''; } };
    let text = await answer();
    while (!text && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      text = await answer();
    }
    let payload: { lat?: number; lon?: number; accuracy?: number; code?: string } = {};
    try { payload = JSON.parse(text.split('\n').pop() || '{}'); } catch { /* keine Ausgabe */ }
    if (Number.isFinite(payload.lat) && Number.isFinite(payload.lon)) return { lat: payload.lat!, lon: payload.lon!, accuracy: Math.round(payload.accuracy ?? 0) };
    const code = payload.code ?? (failed && 'killed' in failed && failed.killed ? 'timeout' : 'unavailable');
    throw Object.assign(new Error(LOCATE_ERRORS[code] ?? LOCATE_ERRORS.unavailable!), { code });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ── Kartenkacheln ─────────────────────────────────────────────────────── */

const TILE = 256;
/** Web-Mercator: Welt-Pixel bei Zoomstufe `z`. */
export function project(lat: number, lon: number, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale };
}

/** Meter je Pixel an dieser Breite und Zoomstufe. */
export function metersPerPixel(lat: number, z: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Die Zoomstufe, bei der der Kreis gut in eine Karte von `size` Pixeln passt. */
export function zoomFor(lat: number, radiusKm: number, size: number): number {
  for (let z = 18; z >= 3; z--) if ((radiusKm * 1000 * 2) / metersPerPixel(lat, z) <= size * 0.8) return z;
  return 3;
}

interface MapView {
  zoom: number;
  /** Kachelbilder mit ihrer Lage relativ zum Mittelpunkt der Karte, in Pixeln. */
  tiles: Array<{ src: string; dx: number; dy: number }>;
  /** Radius des Kreises in Pixeln. */
  radiusPx: number;
  attribution: string;
}

const tileCache = new Map<string, string>();

async function tile(z: number, x: number, y: number): Promise<string | undefined> {
  const n = 2 ** z;
  const wrapped = ((x % n) + n) % n;
  if (y < 0 || y >= n) return undefined;
  const key = `${z}/${wrapped}/${y}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const response = await fetch(`${TILES}/${key}.png`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return undefined;
  const src = `data:image/png;base64,${Buffer.from(await response.arrayBuffer()).toString('base64')}`;
  if (tileCache.size > 400) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, src);
  return src;
}

/** Die Kacheln rund um den Mittelpunkt für eine Karte von `width`×`height` Pixeln. */
export async function mapView(lat: number, lon: number, radiusKm: number, width = 800, height = 200): Promise<MapView> {
  // Der Kreis soll in die Höhe passen; die Breite deckt auch ein breites Eingabefeld ab.
  const zoom = zoomFor(lat, radiusKm, height);
  const centre = project(lat, lon, zoom);
  const x0 = Math.floor((centre.x - width / 2) / TILE);
  const x1 = Math.floor((centre.x + width / 2) / TILE);
  const y0 = Math.floor((centre.y - height / 2) / TILE);
  const y1 = Math.floor((centre.y + height / 2) / TILE);
  const jobs: Array<Promise<{ src: string; dx: number; dy: number } | undefined>> = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      jobs.push(tile(zoom, x, y).then(src => (src ? { src, dx: x * TILE - centre.x, dy: y * TILE - centre.y } : undefined)).catch(() => undefined));
    }
  }
  const tiles = (await Promise.all(jobs)).filter((t): t is { src: string; dx: number; dy: number } => !!t);
  return { zoom, tiles, radiusPx: (radiusKm * 1000) / metersPerPixel(lat, zoom), attribution: '© OpenStreetMap-Mitwirkende' };
}
