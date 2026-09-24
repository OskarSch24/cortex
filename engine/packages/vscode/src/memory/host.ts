import * as vscode from 'vscode';
import { leseBereiche } from './bereiche.js';
import {
  STANDARD_EINSTELLUNGEN,
  type Abrufmodus,
  type ErinnerungsEinstellungen,
  type Helfer,
  type Schwelle,
} from './erinnerung.js';

export { Erinnerung } from './erinnerung.js';

/** Schlüssel der App-Einstellungen, die keine `cortex.*`-Konfiguration sind (lange Texte, Listen). */
const ERINNERUNG_APP_KEYS = {
  promptNotizen: 'erinnerung.prompt.notizen',
  promptSuche: 'erinnerung.prompt.suche',
  promptEinbettung: 'erinnerung.prompt.einbettung',
  promptSpeichern: 'erinnerung.prompt.speichern',
  bereiche: 'erinnerung.bereiche',
} as const;

function eins<T extends string>(wert: unknown, erlaubt: readonly T[], vorgabe: T): T {
  return erlaubt.includes(wert as T) ? (wert as T) : vorgabe;
}

function text(wert: unknown, vorgabe: string): string {
  return typeof wert === 'string' && wert.trim() ? wert : vorgabe;
}

/** Jede Runde neu gelesen: eine Änderung in den Einstellungen gilt ab der nächsten Nachricht. */
export function erinnerungsEinstellungen(app: Record<string, unknown>): ErinnerungsEinstellungen {
  const c = vscode.workspace.getConfiguration('cortex');
  const s = STANDARD_EINSTELLUNGEN;
  const zahl = (key: string, vorgabe: number, min: number, max: number) => {
    const n = c.get<number>(key, vorgabe);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : vorgabe;
  };
  return {
    notizen: c.get<boolean>('memory.notes', s.notizen),
    abruf: eins<Abrufmodus>(c.get('memory.retrieval'), ['nie', 'erste', 'themenwechsel', 'jede'], s.abruf),
    treffer: zahl('memory.hits', s.treffer, 1, 10),
    budget: zahl('memory.budget', s.budget, 300, 4000),
    schwelle: eins<Schwelle>(c.get('memory.threshold'), ['locker', 'normal', 'streng'], s.schwelle),
    helfer: eins<Helfer>(c.get('memory.helper'), ['guenstig', 'aktuell'], s.helfer),
    promptNotizen: text(app[ERINNERUNG_APP_KEYS.promptNotizen], s.promptNotizen),
    promptSuche: text(app[ERINNERUNG_APP_KEYS.promptSuche], s.promptSuche),
    promptEinbettung: text(app[ERINNERUNG_APP_KEYS.promptEinbettung], s.promptEinbettung),
    promptSpeichern: text(app[ERINNERUNG_APP_KEYS.promptSpeichern], s.promptSpeichern),
    bereiche: leseBereiche(app[ERINNERUNG_APP_KEYS.bereiche]),
  };
}
