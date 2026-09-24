import type {
  ExokortexInstanz, ExokortexQuelleZiel,
} from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';

/**
 * Die Farbe eines Projekts — dieselbe Rechnung wie in `protokoll/farben.py`.
 *
 * Gleiche Abstände auf dem Farbkreis über die sortierte Liste, Nachbarn
 * zusätzlich in der Helligkeit getrennt. Wichtig ist, dass Cortex und der
 * Obsidian-Graph dieselbe Farbe für dasselbe Projekt zeigen.
 */
export function projektfarbe(index: number, gesamt: number): string {
  const h = Math.round((index / Math.max(gesamt, 1)) * 360);
  const l = index % 2 === 0 ? 58 : 45;
  return `hsl(${h} 58% ${l}%)`;
}

/** Zwei, drei Buchstaben für Dienste ohne Anwendung auf diesem Rechner. */
export function kuerzel(name: string): string {
  const worte = name.split(/[\s·—-]+/).filter(Boolean);
  if (worte.length === 1) return (worte[0] ?? '').slice(0, 3).toUpperCase();
  return worte
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * `status.py` schreibt ASCII: „aelter", „Stuendlicher Lauf", „->". Für die
 * Anzeige nur die Wortstämme, die dort vorkommen — eine allgemeine Regel machte
 * aus „aktuell" ein „aktüll".
 */
const STAEMME: Array<[string, string]> = [
  ['aelter', 'älter'],
  ['stuendlich', 'stündlich'],
  ['laeuf', 'läuf'],
  ['vollstaendig', 'vollständig'],
  ['pruef', 'prüf'],
  ['fuer', 'für'],
  ['ueber', 'über'],
  ['spaeter', 'später'],
  ['naechst', 'nächst'],
  ['moeglich', 'möglich'],
  ['muess', 'müss'],
  ['koenn', 'könn'],
  ['waehrend', 'während'],
  ['zaehl', 'zähl'],
  ['groess', 'größ'],
  ['geraet', 'gerät'],
  ['rueck', 'rück'],
];

export function lesbar(text: string | null | undefined): string {
  let t = (text ?? '').replace(/\s*->\s*/g, ' → ');
  for (const [ascii, echt] of STAEMME) {
    t = t.replace(new RegExp(ascii, 'gi'), treffer =>
      treffer[0] === treffer[0]?.toUpperCase() ? echt[0]!.toUpperCase() + echt.slice(1) : echt,
    );
  }
  return t;
}

/** Messwerte deutsch: „0.3%" → „0,3 %", „128654/128699" → „128.654/128.699". */
export function messwert(text: string | null | undefined): string {
  return lesbar(text)
    .replace(/(\d)\.(\d+)\s?%/g, '$1,$2 %')
    .replace(/(\d)%/g, '$1 %')
    .replace(/\b\d{5,}\b/g, n => Number(n).toLocaleString('de-DE'));
}

/** Kantenarten sind Bezeichner in ASCII: „GEHOERT_ZU" liest sich als „GEHÖRT_ZU". */
export const kantenname = (name: string) => name.replace(/AE/g, 'Ä').replace(/OE/g, 'Ö');

/** Der erste Buchstabe groß — Werte aus status.py beginnen oft klein. */
export const satzanfang = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

export function quelleZiel(w: string | ExokortexQuelleZiel): ExokortexQuelleZiel {
  return typeof w === 'string' ? { name: w } : w;
}

export function hatZiel(z: ExokortexQuelleZiel | ExokortexInstanz): boolean {
  return !!(z.url || z.pfad || z.bundle || z.app);
}

export function oeffneQuelle(z: ExokortexQuelleZiel | ExokortexInstanz) {
  vscode.postMessage({
    kind: 'exokortexOeffneQuelle',
    bundle: z.bundle,
    app: z.app,
    url: z.url,
    pfad: z.pfad,
  });
}

export const zahl = (n: number | null | undefined) => (n ?? 0).toLocaleString('de-DE');
export const prozent = (teil: number, ganz: number) =>
  `${((teil / Math.max(ganz, 1)) * 100).toFixed(1).replace('.', ',')} %`;
/** „2026-09-13 01:18" → „13.09. 01:18". */
export function zeitpunkt(zeit: string | null | undefined): { tag: string; uhr: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(zeit ?? '');
  return m ? { tag: `${m[3]}.${m[2]}.`, uhr: m[4]! } : { tag: zeit ?? '—', uhr: '' };
}
