/**
 * Was in einem `cortex-widget`-Block stehen darf, und die Prüfung davor.
 *
 * Der Inhalt kommt vom Modell — also ungeprüft. Gezeichnet wird nur, was
 * lesbar ist: ein Objekt mit bekanntem Typ und den Pflichtfeldern. Alles andere
 * bleibt ein gewöhnlicher Codeblock, damit nichts still verschwindet.
 * Die Feldliste für die Modelle steht in core/src/context/widgetBrief.ts.
 */
import { WIDGET_LANG, WIDGET_TYPE_NAMES } from '../../../../core/src/context/widgetBrief.js';

export type Tone = 'pos' | 'neg' | 'warn' | 'info' | 'violet' | 'mute';
export type StepState = 'done' | 'now' | 'next' | 'failed';

export interface WidgetAction { label: string; prompt?: string; url?: string; path?: string; primary?: boolean }
interface Base { type: string; source?: string; actions?: WidgetAction[] }

export interface WeatherW extends Base { type: 'weather'; location: string; date?: string; temp: number | string; condition: string; detail?: string; icon?: string; high?: number | string; low?: number | string; wind?: string; rain?: string; hours?: { time: string; temp: number | string; icon?: string; rain?: number }[] }
export interface TimerW extends Base { type: 'timer'; label: string; durationSec: number; endsAt?: string; note?: string }
export interface DeparturesW extends Base { type: 'departures'; station: string; subtitle?: string; rows: { line: string; color?: string; destination: string; platform?: string; minutes: number | string; delay?: number }[] }
export interface ConverterW extends Base { type: 'converter'; amount: number; from: string; to: string; rate: number; fromSymbol?: string; toSymbol?: string; rateNote?: string; presets?: number[] }
export interface ParcelW extends Base { type: 'parcel'; carrier: string; tracking?: string; status: string; eta?: string; sender?: string; steps: { label: string; time?: string; place?: string; state: 'done' | 'now' | 'next' }[] }
export interface TodoW extends Base { type: 'todo'; title: string; items: { text: string; done?: boolean; tag?: string; tone?: Tone }[] }
export interface RouteW extends Base { type: 'route'; destination: string; subtitle?: string; origin?: string; modes?: { label: string; minutes: number | string }[]; arrival?: string; url?: string }
export interface CalendarW extends Base { type: 'calendar'; title: string; range?: string; days: string[]; startHour?: number; endHour?: number; events: { day: number; start: string; end: string; title: string; tone?: Tone }[]; legend?: { label: string; tone: Tone }[] }
export interface TickerRow { name: string; symbol: string; price: string; change: string; tone?: Tone; series?: number[] }
export interface TickerW extends Base, TickerRow { type: 'ticker'; changeNote?: string; series: number[]; reference?: number; referenceLabel?: string; axis?: string[]; others?: TickerRow[] }
export interface WorldclockW extends Base { type: 'worldclock'; cities: { name: string; timezone: string; home?: boolean; sunrise?: string; sunset?: string }[] }

export interface AgentRunW extends Base { type: 'agent-run'; title: string; account?: string; elapsed?: string; steps: { text: string; state: StepState; duration?: string; added?: number; removed?: number }[]; note?: string }
export interface SwarmRole { name: string; role?: string; instructions?: string }
export interface AgentSwarmW extends Base { type: 'agent-swarm'; task?: string; count?: number; project?: string; agents?: SwarmRole[]; note?: string }
export interface TestResultW extends Base { type: 'test-result'; title: string; command?: string; duration?: string; groups: { label: string; passed: number; total: number }[]; failures?: { name: string; file?: string; detail?: string }[] }
export interface QuotaW extends Base { type: 'quota'; accounts: { provider: string; name: string; plan?: string; percent?: number | null; reset?: string; bound?: boolean }[]; note?: string }
export interface ServerW extends Base { type: 'server'; name: string; subtitle?: string; metrics?: { label: string; value: string | number; unit?: string; percent?: number; series?: number[] }[]; containers?: { name: string; state: 'ok' | 'warn' | 'down'; note?: string }[]; alerts?: { tone: Tone; text: string }[] }
export interface DeployW extends Base { type: 'deploy'; title: string; ref?: string; message?: string; elapsed?: string; steps: { label: string; state: StepState; duration?: string }[]; log?: string }
export interface VerificationW extends Base { type: 'verification'; title: string; subtitle?: string; rows: { platform: string; evidence: string; expected: string | number; found: string | number; state: 'ok' | 'warn' | 'fail' }[]; finding?: { tone: Tone; title: string; text: string } }
export interface ScrapeRunW extends Base { type: 'scrape-run'; title: string; subtitle?: string; done: number; total: number; unit?: string; eta?: string; stats?: { label: string; value: string | number; tone?: Tone }[]; sample?: { key: string; label: string; value: string | number }[]; dataset?: string }
export interface WorkflowW extends Base { type: 'workflow'; title: string; subtitle?: string; nodes: { id: string; label: string; detail?: string; state: 'done' | 'now' | 'next' | 'retry' | 'failed' }[]; edges: [string, string][] }
export interface QueryResultW extends Base { type: 'query-result'; title?: string; subtitle?: string; query?: string; columns: string[]; rows: (string | number | null)[][] }
export interface GraphNodeW extends Base { type: 'graph-node'; name: string; kind: string; id?: string; neighbors?: { label: string; kind?: string }[]; confirmed?: string[]; confirmedSource?: string; observed?: string[]; observedSource?: string; updated?: string }
export interface DecisionW extends Base { type: 'decision'; id: string; title: string; status: string; project?: string; decision: string; rejected?: string[]; wrongIf?: string; decided: string; review: string; gaps?: number }
export interface PlaceNamingW extends Base { type: 'place-naming'; id: string; count: number; span?: string; points?: [number, number][]; photos?: string[]; hint?: string; suggestions?: string[]; remaining?: number }
export interface TimelineW extends Base { type: 'timeline'; title: string; subtitle?: string; startHour?: number; endHour?: number; lanes: { label: string; tone?: Tone; total?: string; blocks: { start: string; end: string; label?: string }[] }[] }
export interface JobsW extends Base { type: 'jobs'; title: string; subtitle?: string; jobs: { score: number; title: string; company: string; location?: string; salary?: string; source?: string; tags?: string[]; url?: string }[]; note?: string }
export interface DesignDiffW extends Base { type: 'design-diff'; title: string; subtitle?: string; diffs: { label: string; design: string; code: string; designColor?: string; codeColor?: string; fixed?: boolean }[] }
export interface PaletteW extends Base { type: 'palette'; title: string; background?: string; colors: { name: string; hex: string }[] }
export interface AudioTakesW extends Base { type: 'audio-takes'; title: string; subtitle?: string; takes: { label: string; note?: string; duration: string; path?: string; favorite?: boolean; peaks?: number[] }[] }
export interface KpisW extends Base { type: 'kpis'; title: string; subtitle?: string; kpis: { label: string; value: string | number; change?: string; tone?: Tone }[]; funnel?: { label: string; value: number }[]; note?: string }
export interface QuizW extends Base { type: 'quiz'; topic: string; subtitle?: string; question: string; options: string[]; answer: number; explanation?: string; progress?: { current: number; total: number; history?: string } }
export interface GameTheoryW extends Base { type: 'game-theory'; title: string; subtitle?: string; actors: { name: string; want: string; tone?: Tone; hidden?: boolean }[]; relations?: { from: number; to: number; label: string; dashed?: boolean }[]; balance?: { value: number; left: string; right: string; note?: string }; recommendation: string }

export type WidgetSpec =
  | WeatherW | TimerW | DeparturesW | ConverterW | ParcelW | TodoW | RouteW | CalendarW | TickerW | WorldclockW
  | AgentRunW | AgentSwarmW | TestResultW | QuotaW | ServerW | DeployW | VerificationW | ScrapeRunW | WorkflowW | QueryResultW
  | GraphNodeW | DecisionW | PlaceNamingW | TimelineW | JobsW | DesignDiffW | PaletteW | AudioTakesW | KpisW
  | QuizW | GameTheoryW;

export const WIDGET_TYPES: readonly string[] = WIDGET_TYPE_NAMES;

/** Pflichtfelder je Typ: [Feld, Art]. Art `a` = nicht leeres Array, `s` = Text oder Zahl, `n` = Zahl. */
const REQUIRED: Record<string, [string, 'a' | 's' | 'n'][]> = {
  weather: [['location', 's'], ['temp', 's'], ['condition', 's']],
  timer: [['label', 's'], ['durationSec', 'n']],
  departures: [['station', 's'], ['rows', 'a']],
  converter: [['amount', 'n'], ['from', 's'], ['to', 's'], ['rate', 'n']],
  parcel: [['carrier', 's'], ['status', 's'], ['steps', 'a']],
  todo: [['title', 's'], ['items', 'a']],
  route: [['destination', 's']],
  calendar: [['title', 's'], ['days', 'a'], ['events', 'a']],
  ticker: [['name', 's'], ['symbol', 's'], ['price', 's'], ['change', 's'], ['series', 'a']],
  worldclock: [['cities', 'a']],
  'agent-run': [['title', 's'], ['steps', 'a']],
  // Die einzige Karte, die nach etwas fragt statt etwas zu melden: ohne Auftrag
  // zeigt sie die Rückfrage, deshalb ist auch `task` nicht verlangt.
  'agent-swarm': [],
  'test-result': [['title', 's'], ['groups', 'a']],
  quota: [['accounts', 'a']],
  server: [['name', 's']],
  deploy: [['title', 's'], ['steps', 'a']],
  verification: [['title', 's'], ['rows', 'a']],
  'scrape-run': [['title', 's'], ['done', 'n'], ['total', 'n']],
  workflow: [['title', 's'], ['nodes', 'a']],
  'query-result': [['columns', 'a'], ['rows', 'a']],
  'graph-node': [['name', 's'], ['kind', 's']],
  decision: [['id', 's'], ['title', 's'], ['status', 's'], ['decision', 's'], ['decided', 's'], ['review', 's']],
  'place-naming': [['id', 's'], ['count', 'n']],
  timeline: [['title', 's'], ['lanes', 'a']],
  jobs: [['title', 's'], ['jobs', 'a']],
  'design-diff': [['title', 's'], ['diffs', 'a']],
  palette: [['title', 's'], ['colors', 'a']],
  'audio-takes': [['title', 's'], ['takes', 'a']],
  kpis: [['title', 's'], ['kpis', 'a']],
  quiz: [['topic', 's'], ['question', 's'], ['options', 'a'], ['answer', 'n']],
  'game-theory': [['title', 's'], ['actors', 'a'], ['recommendation', 's']],
};

export function isWidgetLang(lang: string | undefined): boolean {
  return !!lang && (lang === WIDGET_LANG || lang === 'widget');
}

export type ParsedWidget = { ok: true; spec: WidgetSpec } | { ok: false; error: string };

/** Remove only commas outside strings that precede a closing container. */
export function repairWidgetJson(source: string): string {
  let result = '', quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    if (char === ',' && /^\s*[}\]]/.test(source.slice(i + 1))) continue;
    result += char;
  }
  return result;
}

export function widgetProgress(source: string): string {
  const type = /"type"\s*:\s*"([^"\\]+)"/.exec(source)?.[1];
  const names: Record<string, string> = { 'query-result': 'Tabelle', 'graph-node': 'Graph', workflow: 'Ablauf', todo: 'Aufgabenliste', weather: 'Wetter', server: 'Serverübersicht', kpis: 'Kennzahlen', timer: 'Timer', worldclock: 'Weltuhr' };
  const label = type ? names[type] ?? 'Karte' : 'Karte';
  const array = /"(?:rows|items|nodes|neighbors|kpis)"\s*:\s*\[/.exec(source);
  if (!array) return `${label} wird erstellt …`;
  let start = array.index + array[0].length, depth = 0, quoted = false, escaped = false, count = 0;
  for (let i = start; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if ((char === ',' || char === ']') && depth === 0) {
      const candidate = source.slice(start, i).trim();
      if (candidate) { try { JSON.parse(repairWidgetJson(candidate)); count++; } catch { break; } }
      start = i + 1;
      if (char === ']') break;
    } else if (char === '[' || char === '{') depth++;
    else if (char === ']' || char === '}') depth--;
  }
  return `${label} wird erstellt${count ? ` (${count} ${label === 'Tabelle' ? count === 1 ? 'Zeile' : 'Zeilen' : count === 1 ? 'Eintrag' : 'Einträge'})` : ''} …`;
}

export function parseWidget(source: string): ParsedWidget {
  let value: unknown;
  try {
    value = JSON.parse(repairWidgetJson(source));
  } catch {
    return { ok: false, error: 'Kein gültiges JSON' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'Kein Objekt' };
  const obj = value as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== 'string' || !REQUIRED[type]) return { ok: false, error: `Unbekannter Typ ${typeof type === 'string' ? `„${type}“` : ''}`.trim() };
  for (const [field, kind] of REQUIRED[type]!) {
    const v = obj[field];
    const fine = kind === 'a' ? Array.isArray(v) && v.length > 0
      : kind === 'n' ? typeof v === 'number' && Number.isFinite(v)
      : (typeof v === 'string' && v.trim() !== '') || (typeof v === 'number' && Number.isFinite(v));
    if (!fine) return { ok: false, error: `Feld „${field}“ fehlt` };
  }
  if (obj.actions !== undefined && !Array.isArray(obj.actions)) return { ok: false, error: 'Feld „actions“ ist keine Liste' };
  return { ok: true, spec: normalize(type, obj, REQUIRED[type]!) as unknown as WidgetSpec };
}

/** Eine Zahl für die Anzeige: ganze Zahlen unter 10.000 ohne Punkt (Jahre, Ports), sonst deutsch. */
export function displayNumber(value: number, maxDigits = 2): string {
  if (Number.isInteger(value) && Math.abs(value) < 10_000) return String(value);
  return value.toLocaleString('de-DE', { maximumFractionDigits: maxDigits });
}

/** Mit Vorzeichen: -0.05 → „−0,05 %“. */
function signedPercent(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${Math.abs(value).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;
}

/**
 * Modelle schicken Anzeigewerte oft als Zahl, obwohl die Anweisung Text mit
 * Einheit verlangt — beobachtet am 13.09.2026: Kurs `"price": 66633.9,
 * "change": -0.05`, Wetter `"rain": 0`. Hier wird daraus der Text, den die Karte
 * erwartet, statt dass sie an einer Zahl zerbricht.
 */
function normalize(type: string, obj: Record<string, unknown>, required: [string, 'a' | 's' | 'n'][]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...obj };
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (type === 'ticker') {
    const row = (r: Record<string, unknown>) => ({
      ...r,
      ...(num(r.price) ? { price: displayNumber(r.price) } : {}),
      ...(num(r.change) ? { change: signedPercent(r.change), tone: r.tone ?? (r.change < 0 ? 'neg' : r.change > 0 ? 'pos' : 'mute') } : {}),
    });
    Object.assign(out, row(out));
    if (Array.isArray(out.others)) out.others = out.others.map((o) => (o && typeof o === 'object' ? row(o as Record<string, unknown>) : o));
  }
  if (type === 'weather') {
    if (num(out.rain)) out.rain = `${displayNumber(out.rain, 1)} mm`;
    if (num(out.wind)) out.wind = `${displayNumber(out.wind, 1)} km/h`;
  }
  // Pflichttexte, die als Zahl kamen, werden Text — Karten rufen darauf Textfunktionen auf.
  for (const [field, kind] of required) {
    if (kind === 's' && num(out[field])) out[field] = displayNumber(out[field] as number);
  }
  return out;
}

/* ── Rechnen, das Cortex selbst übernimmt ───────────────────────────────── */

/** „09:30“ → 9,5. Unlesbares → NaN. */
export function hours(time: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(time.trim());
  return m ? Number(m[1]) + Number(m[2]) / 60 : NaN;
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): [number, number, number] | undefined {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return undefined;
  const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG-Kontrastverhältnis zweier Farben, oder undefined bei unlesbarer Farbe. */
export function contrast(a: string, b: string): number | undefined {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return undefined;
  const lum = (rgb: [number, number, number]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
  const [hi, lo] = [lum(ra), lum(rb)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcagGrade(ratio: number): 'AAA' | 'AA' | 'AA groß' | 'Zu schwach' {
  return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA groß' : 'Zu schwach';
}

/** Uhrzeit und Stundenversatz einer Zeitzone zum Zeitpunkt `now`. */
export function zoneTime(timezone: string, now: Date): { time: string; hour: number; offsetMin: number; weekday: string; zoneName: string } | undefined {
  try {
    const parts = new Intl.DateTimeFormat('de-DE', { timeZone: timezone, hour: '2-digit', minute: '2-digit', weekday: 'long', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const h = Number(get('hour'));
    const min = Number(get('minute'));
    const local = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), h, min);
    const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes());
    const zoneName = new Intl.DateTimeFormat('de-DE', { timeZone: timezone, timeZoneName: 'long' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? timezone;
    return { time: `${get('hour')}:${get('minute')}`, hour: h + min / 60, offsetMin: Math.round((local - utc) / 60000), weekday: get('weekday'), zoneName };
  } catch {
    return undefined;
  }
}

export function formatOffset(minutes: number): string {
  if (minutes === 0) return 'Gleiche Zeit';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''} Std`;
}

export function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Restsekunden eines Timers; ohne Endzeit steht er auf der vollen Dauer. */
export function timerRemaining(spec: { durationSec: number; endsAt?: string }, now: number): number {
  if (!spec.endsAt) return spec.durationSec;
  const end = Date.parse(spec.endsAt);
  if (!Number.isFinite(end)) return spec.durationSec;
  return Math.max(0, Math.min(spec.durationSec, Math.round((end - now) / 1000)));
}

export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Tage zwischen zwei Daten „YYYY-MM-DD“ (b − a). */
export function daysBetween(a: string, b: string): number {
  const pa = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const pb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(pa) && Number.isFinite(pb) ? Math.round((pb - pa) / 86400000) : NaN;
}

/** Ebenen eines Workflows von links nach rechts: Tiefe im Graphen ab den Knoten ohne Eingang. */
export function workflowColumns(nodes: { id: string }[], edges: [string, string][]): Map<string, number> {
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < nodes.length; pass++) {
    let changed = false;
    for (const [from, to] of edges) {
      const d = (depth.get(from) ?? 0) + 1;
      if (depth.has(to) && d > (depth.get(to) ?? 0) && d < nodes.length) {
        depth.set(to, d);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return depth;
}

/** „2026-09-13“ → „Sonntag, 13. September“; alles andere bleibt, wie es kam. */
export function friendlyDate(value: string | undefined): string {
  if (!value) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : value;
}
