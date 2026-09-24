import type { ExokortexAction, ExokortexZustand } from '../../../src/panel/protocol.js';

/** Die vier Zustände auf die Klassen von `.cxs-status`. */
export const STATUS: Record<ExokortexZustand, { klasse: string; wort: string }> = {
  ok: { klasse: '', wort: 'In Ordnung' },
  warnung: { klasse: 'warn', wort: 'Warnung' },
  fehler: { klasse: 'bad', wort: 'Fehler' },
  unbekannt: { klasse: 'off', wort: 'Unbekannt' },
};

export interface Knopf {
  action: ExokortexAction;
  label: string;
  dauer?: string;
  primaer?: boolean;
}

export const KNOEPFE: Knopf[] = [
  { action: 'nachmessen', label: 'Nachmessen', dauer: '~80 Sek.' },
  { action: 'chatsEinspeisen', label: 'Chats einspeisen', dauer: '~6 Min.' },
  { action: 'pruefen', label: 'Prüfen', primaer: true },
];

/** Wie eine laufende Aktion über der Seite heißt. */
export const LAUF_TITEL: Record<ExokortexAction, string> = {
  pruefen: 'Prüfung',
  chatsEinspeisen: 'Einspeisung',
  nachmessen: 'Messung',
  indexNeu: 'Indexbau',
  konnektorenSync: 'Übertragung',
  laufAn: 'Stündlicher Lauf',
  laufAus: 'Stündlicher Lauf',
};

export type ReiterId = 'ueberblick' | 'bestand' | 'galaxie' | 'wege' | 'laeufe' | 'suche';

export const REITER: Array<{ id: ReiterId; name: string }> = [
  { id: 'ueberblick', name: 'Überblick' },
  { id: 'bestand', name: 'Bestand' },
  { id: 'galaxie', name: 'Galaxie' },
  { id: 'wege', name: 'Datenwege' },
  { id: 'laeufe', name: 'Läufe' },
  { id: 'suche', name: 'Suchen' },
];

/**
 * Welche Aktion einen Befund behebt.
 *
 * Ein Befund ohne Handlung daneben ist eine Meldung; mit Handlung ist er eine
 * Aufgabe. Die Zuordnung geht über den Prüfungsnamen aus `status.py` — der ist
 * Vertrag zwischen beiden Seiten.
 */
export const ABHILFE: Array<{ passt: RegExp; action: ExokortexAction; label: string }> = [
  { passt: /Graphindex/i, action: 'indexNeu', label: 'Index bauen' },
  { passt: /Konnektor/i, action: 'konnektorenSync', label: 'Übertragen' },
  { passt: /Lauf|Chat/i, action: 'chatsEinspeisen', label: 'Einspeisen' },
];

/** Reine Ordnerstruktur: sie zeichnet den Baum nach, statt etwas zu verbinden. */
export const STRUKTUR = ['LIEGT_IN', 'GEHOERT_ZU', 'BELEGT_DURCH', 'TEIL_VON'];

export type Laufend = { action: ExokortexAction; zeilen: string[]; fehler?: string; fertig?: boolean };
