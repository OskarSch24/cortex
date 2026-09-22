import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnLines } from '@cortex/core';
import { appSymbol } from './icons.js';
import type {
  ExokortexPruefung,
  ExokortexStatusDto,
  ExokortexZustand,
} from '../panel/protocol.js';

/**
 * Der Zustand des Exokortex, für die Seite.
 *
 * Die Prüfungen selbst macht `bruecke/status.py` — dort gehören die Schwellen
 * hin, und dort sind sie auch ohne laufende IDE abrufbar. Cortex ergänzt nur,
 * was Python nicht wissen kann: ob der Konnektor tatsächlich in den
 * Anbieterprofilen steht. Das Wissen über die drei Zielformate liegt in
 * `mcpSync.ts`; eine zweite Fassung davon in Python wäre eine schwächere
 * Wahrheit, die irgendwann von der ersten abweicht.
 */

export const KONNEKTOR = 'exokortex';
const MANIFEST = '.cortex-mcp.json';
/** Ein Statusabruf darf nie länger dauern als das Intervall, das ihn auslöst. */
const TIMEOUT_MS = 90_000;

export interface ExokortexPfade {
  /** Absolut, nie nach Namen: der ererbte PATH ist unbestimmt, und nur
   *  /usr/bin/python3 trägt die Extraktionspakete. */
  python: string;
  repo: string;
  /** `media/icons` der Extension — Rückfall-Symbole für Dienste ohne
   *  Anwendung auf diesem Rechner (Grok, OMI). Fehlt er, bleibt es beim Kürzel. */
  symbole?: string;
}

export interface Profil {
  provider: string;
  label: string;
  homeDir?: string;
}

/**
 * Ob der Konnektor in einem Profil angekommen ist.
 *
 * `never` ist der Zustand, den es heute gibt und den nichts anzeigt: die
 * Definition steht in `mcp.json`, gespiegelt wurde sie nie, und jede KI in
 * Cortex arbeitet ohne Gedächtnis, ohne dass es jemandem auffällt.
 */
export function spiegelung(profile: Profil[]): { zustand: 'ok' | 'stale' | 'never'; wert: string } {
  const mit: string[] = [];
  const ohne: string[] = [];
  for (const profil of profile) {
    if (!profil.homeDir) continue;
    const name = `${profil.provider}:${profil.label}`;
    let servers: unknown;
    try {
      servers = (JSON.parse(readFileSync(join(profil.homeDir, MANIFEST), 'utf8')) as { servers?: unknown })
        .servers;
    } catch {
      ohne.push(name);
      continue;
    }
    (Array.isArray(servers) && servers.includes(KONNEKTOR) ? mit : ohne).push(name);
  }
  if (mit.length === 0) {
    return { zustand: 'never', wert: profile.length ? `in keinem von ${profile.length} Profilen` : 'keine Konten' };
  }
  if (ohne.length > 0) return { zustand: 'stale', wert: `${mit.length} von ${mit.length + ohne.length} Profilen` };
  return { zustand: 'ok', wert: `in allen ${mit.length} Profilen` };
}

const RANG: Record<ExokortexZustand, number> = { fehler: 3, warnung: 2, unbekannt: 1, ok: 0 };

/** Dasselbe Urteil wie in status.py, gefällt über die vollständige Liste. */
export function urteil(pruefungen: ExokortexPruefung[]): ExokortexStatusDto['urteil'] {
  let schlimmste: ExokortexPruefung | undefined;
  for (const p of pruefungen) {
    if (!schlimmste || RANG[p.zustand] > RANG[schlimmste.zustand]) schlimmste = p;
  }
  if (!schlimmste || schlimmste.zustand === 'ok') {
    return { zustand: 'ok', satz: 'Exokortex bereit', hinweis: '' };
  }
  const kopf = schlimmste.zustand === 'fehler' ? '' : 'Exokortex bereit — ';
  return {
    zustand: schlimmste.zustand,
    satz: `${kopf}${schlimmste.name}: ${schlimmste.wert}`,
    hinweis: schlimmste.hinweis,
  };
}

/** Ein kaputtes oder fehlendes Python wird eine rote Kachel, nie eine Ausnahme. */
function ausfall(nachricht: string): ExokortexStatusDto {
  return {
    urteil: { zustand: 'fehler', satz: `Status nicht abrufbar: ${nachricht}`, hinweis: '' },
    pruefungen: [{ name: 'Statusquelle', zustand: 'fehler', wert: nachricht, hinweis: 'bruecke/status.py von Hand starten' }],
    graph: null,
    abnahme: { herkunft: null, gerissen: null, gesamt: null, gemessen: null, veraltet: true, befunde: [] },
    arbeitsliste: { offene_entscheidungen: 0, unbenannte_orte: null, fehlende_dateien: 0, fehllisten: [] },
    chronik: [],
    pfade: { speicher: '', vault: '', chats: '', log: '' },
    fehler: nachricht,
  };
}

export async function leseStatus(
  pfade: ExokortexPfade,
  profile: Profil[],
  signal?: AbortSignal,
): Promise<ExokortexStatusDto> {
  const skript = join(pfade.repo, 'bruecke', 'status.py');
  if (!existsSync(skript)) return ausfall(`${skript} fehlt`);

  const zeilen: string[] = [];
  const fehlerzeilen: string[] = [];
  const abbruch = new AbortController();
  const frist = setTimeout(() => abbruch.abort(), TIMEOUT_MS);
  signal?.addEventListener('abort', () => abbruch.abort(), { once: true });
  let code: number | null = null;
  try {
    for await (const ereignis of spawnLines(pfade.python, [skript, '--json'], {
      cwd: pfade.repo,
      env: process.env,
      signal: abbruch.signal,
    })) {
      if (ereignis.kind === 'line') {
        (ereignis.stream === 'stdout' ? zeilen : fehlerzeilen).push(ereignis.line);
      } else if (ereignis.kind === 'exit') {
        code = ereignis.code;
      } else if (ereignis.kind === 'spawn-error') {
        return ausfall(ereignis.message);
      }
    }
  } catch (e) {
    return ausfall((e as Error).message);
  } finally {
    clearTimeout(frist);
  }

  return verarbeite(zeilen.join('\n'), fehlerzeilen, code, profile, pfade.symbole);
}

/**
 * Aus der Ausgabe von `status.py` wird der Zustand der Seite.
 *
 * Getrennt vom Prozessaufruf, weil hier der Fall liegt, der wehtut: eine
 * abgeschnittene oder unlesbare Ausgabe. Die Seite muss ein kaputtes Python
 * überleben und darüber berichten, statt daran zu sterben.
 */
export function verarbeite(
  ausgabe: string,
  fehlerzeilen: string[],
  code: number | null,
  profile: Profil[],
  /** Ordner mit Rückfall-Symbolen für Dienste ohne Anwendung (media/icons). */
  symbolOrdner?: string,
): ExokortexStatusDto {
  let status: ExokortexStatusDto;
  try {
    status = JSON.parse(ausgabe) as ExokortexStatusDto;
    if (!Array.isArray(status.pruefungen)) throw new Error('keine Prüfungen');
  } catch (e) {
    // Die letzte stderr-Zeile sagt meist, woran es lag, und ist nützlicher als
    // der Parserfehler.
    const grund = fehlerzeilen[fehlerzeilen.length - 1] ?? (e as Error).message;
    return ausfall(code ? `Exit ${code}: ${grund}` : grund);
  }

  const gespiegelt = spiegelung(profile);
  const kachel: ExokortexPruefung = {
    name: 'Konnektor in Profilen',
    zustand: gespiegelt.zustand === 'ok' ? 'ok' : gespiegelt.zustand === 'stale' ? 'warnung' : 'fehler',
    wert: gespiegelt.wert,
    hinweis:
      gespiegelt.zustand === 'ok'
        ? ''
        : 'Ohne Spiegelung erreicht keine KI den Exokortex. „Konnektoren übertragen“ drücken.',
  };
  // Zwischen Schreibsperre und Leseserver: erst was alles blockiert, dann was
  // man sonst nirgends sieht.
  const pruefungen = [...status.pruefungen];
  pruefungen.splice(2, 0, kachel);
  return { ...status, pruefungen, urteil: urteil(pruefungen), datenwege: mitSymbolen(status, symbolOrdner) };
}

/**
 * Die Quellen um das echte Symbol ihrer Anwendung ergänzen.
 *
 * Python kennt die Bundle-Kennung, kommt aber nicht an die Programmbündel —
 * das ist Sache der Extension. Fehlt eine Anwendung, bleibt `symbol` null und
 * die Seite setzt ein Kürzel: besser als ein nachgebautes Logo.
 */
function mitSymbolen(
  status: ExokortexStatusDto,
  ordner?: string,
): ExokortexStatusDto['datenwege'] {
  const wege = status.datenwege;
  if (!wege?.arten?.length) return wege;
  return {
    arten: wege.arten.map(art => ({
      ...art,
      instanzen: art.instanzen.map(i => ({
        ...i,
        symbol: appSymbol(i.bundle, i.kennung, ordner, i.app),
      })),
    })),
  };
}

/** Profile, wie sie auf der Platte liegen — als Rückfall ohne Kontoliste. */
export function profileAufDerPlatte(): Profil[] {
  const wurzel = join(homedir(), '.cortex', 'profiles');
  if (!existsSync(wurzel)) return [];
  return readdirSync(wurzel).map((name) => {
    const [provider = name] = name.split('-');
    return { provider, label: name, homeDir: join(wurzel, name) };
  });
}
