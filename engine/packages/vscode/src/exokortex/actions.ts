import { spawnLines } from '@cortex/core';
import { join } from 'node:path';
import type { ExokortexAction } from '../panel/protocol.js';
import type { ExokortexPfade } from './status.js';

/**
 * Was die Seite auslösen darf.
 *
 * Alles hier ist ungefährlich oder umkehrbar: prüfen, den Index neu bauen
 * (er ist abgeleitet), die eigenen Chats einspeisen, nachmessen. Eine
 * beliebige Quelle einzuspeisen steht bewusst **nicht** in dieser Liste —
 * das ist der einzige Weg, der den Graphen spürbar verändert, und er hat
 * einen eigenen, zweistufigen Fluss.
 */

const LAUNCHAGENT = 'com.exokortex.chats';

export interface Aktion {
  /** Was in der Leiste steht. */
  label: string;
  /** Ein Satz darunter, wenn er etwas erklärt, das der Knopf nicht sagt. */
  hinweis?: string;
  /** Wie lange es ungefähr dauert — damit niemand einen Sechs-Minuten-Lauf
   *  für hängengeblieben hält. */
  dauer?: string;
}

export const AKTIONEN: Record<Exclude<ExokortexAction, 'konnektorenSync'>, Aktion> = {
  pruefen: { label: 'Jetzt prüfen' },
  chatsEinspeisen: {
    label: 'Chats einspeisen',
    hinweis: 'Ohne Ruhefrist, auch Chats von gerade eben.',
    dauer: '~6 Min., wenn etwas anliegt',
  },
  nachmessen: {
    label: 'Abnahme nachmessen',
    hinweis: 'Misst alle 17 Prüfungen des Bestands neu.',
    dauer: '~80 Sek.',
  },
  indexNeu: { label: 'Graphindex neu bauen', dauer: '~5 Sek.' },
  laufAn: { label: 'Stündlichen Lauf einschalten' },
  laufAus: { label: 'Stündlichen Lauf ausschalten' },
};

/** Der Befehl hinter einer Aktion. `undefined` heißt: Cortex macht das selbst. */
export function befehl(action: ExokortexAction, pfade: ExokortexPfade): [string, string[]] | undefined {
  const bruecke = (datei: string, ...args: string[]): [string, string[]] =>
    [pfade.python, [join(pfade.repo, 'bruecke', datei), ...args]];
  const plist = `${process.env.HOME}/Library/LaunchAgents/${LAUNCHAGENT}.plist`;
  switch (action) {
    case 'pruefen':
      return undefined;                       // ist nur ein neuer Statusabruf
    case 'konnektorenSync':
      return undefined;                       // hat Cortex schon: syncConnectors
    case 'chatsEinspeisen':
      return bruecke('chats.py', '--jetzt');
    case 'nachmessen':
      return [pfade.python, [join(pfade.repo, 'protokoll', 'abnahme.py')]];
    case 'indexNeu':
      return bruecke('graphindex.py', '--neu');
    // Der Zustand des stündlichen Laufs lebt in launchd, nicht in einer
    // Einstellung. Eine gespiegelte Kopie wäre eine zweite Wahrheit, die
    // auseinanderläuft, sobald jemand launchctl direkt benutzt.
    case 'laufAn':
      return ['launchctl', ['bootstrap', `gui/${process.getuid?.() ?? 501}`, plist]];
    case 'laufAus':
      return ['launchctl', ['bootout', `gui/${process.getuid?.() ?? 501}/${LAUNCHAGENT}`]];
  }
}

export interface LaufErgebnis {
  code: number | null;
  ausgabe: string;
}

/** So viel Ausgabe behält die Seite. Das Ende zählt — dort steht das Ergebnis. */
const MAX_ZEILEN = 400;

/**
 * Führt eine Aktion aus und meldet jede Zeile, während sie entsteht.
 *
 * Ein Lauf, der sechs Minuten stumm ist, sieht aus wie einer, der hängt.
 */
export async function fuehreAus(
  action: ExokortexAction,
  pfade: ExokortexPfade,
  signal: AbortSignal,
  onLine: (zeile: string) => void,
): Promise<LaufErgebnis> {
  const gewaehlt = befehl(action, pfade);
  if (!gewaehlt) return { code: 0, ausgabe: '' };
  const [command, args] = gewaehlt;
  const zeilen: string[] = [];
  let code: number | null = null;
  for await (const ereignis of spawnLines(command, args, {
    cwd: pfade.repo,
    env: process.env,
    signal,
  })) {
    if (ereignis.kind === 'line') {
      zeilen.push(ereignis.line);
      if (zeilen.length > MAX_ZEILEN) zeilen.shift();
      onLine(ereignis.line);
    } else if (ereignis.kind === 'exit') {
      code = ereignis.code;
    } else if (ereignis.kind === 'spawn-error') {
      zeilen.push(ereignis.message);
      return { code: -1, ausgabe: zeilen.join('\n') };
    }
  }
  return { code, ausgabe: zeilen.join('\n') };
}
