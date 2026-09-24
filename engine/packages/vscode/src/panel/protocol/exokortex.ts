/** Die Exokortex-Seite: Status, Prüfungen, Quellen und Galaxie. */

export interface GalaxieKnoten {
  id: string;
  /** Erste Bezeichnung — sie bestimmt Farbe und Rang beim Kappen. */
  art: string;
  name: string;
  projekt: string | null;
  /** Wie viele Kanten insgesamt an ihm hängen: Punktgröße und Hinweis darauf,
   *  ob sich das Aufklappen lohnt. */
  grad: number;
}

/** Was die Seite auslösen darf. Alles hier ist ungefährlich oder umkehrbar. */
export type ExokortexAction =
  | 'pruefen'
  | 'chatsEinspeisen'
  | 'nachmessen'
  | 'indexNeu'
  | 'konnektorenSync'
  | 'laufAn'
  | 'laufAus';

/** Wie eine einzelne Prüfung ausgegangen ist. Bildet 1:1 `.cx-status` ab. */
export type ExokortexZustand = 'ok' | 'warnung' | 'fehler' | 'unbekannt';

export interface ExokortexPruefung {
  name: string;
  zustand: ExokortexZustand;
  wert: string;
  /** Was zu tun ist — nicht, was kaputt ist. Nur bei Bruch gefüllt. */
  hinweis: string;
}

/**
 * Was `bruecke/status.py --json` berichtet, plus die zwei Prüfungen, die nur
 * Cortex beantworten kann: ob der Konnektor in den Anbieterprofilen steht, und
 * ob gerade eine Aktion läuft.
 */
export interface ExokortexStatusDto {
  urteil: { zustand: ExokortexZustand; satz: string; hinweis: string };
  pruefungen: ExokortexPruefung[];
  graph?: { gebaut_am: string; knoten: number; kanten: number } | null;
  abnahme: {
    herkunft: 'abnahme' | 'lauf' | null;
    gerissen: number | null;
    gesamt: number | null;
    gemessen: string | null;
    /** Der Graph hat sich seit der Messung bewegt — der Wert gilt nicht mehr. */
    veraltet: boolean;
    befunde: Array<{ name: string; wert: string; hinweis: string }>;
  };
  arbeitsliste: {
    offene_entscheidungen: number;
    unbenannte_orte: number | null;
    fehlende_dateien: number;
    fehllisten: Array<{ datei: string; anzahl: number }>;
  };
  chronik: Array<{
    zeit: string | null;
    quellen: string[];
    dauer_s?: number | null;
    exitcode?: number | null;
    abgebrochen_in?: string | null;
    chats?: number;
    maskiert?: number;
  }>;
  pfade: { speicher: string; vault: string; chats: string; log: string };
  /**
   * Woher der Inhalt kommt. `bruecke/status.py` liefert die Quellen samt
   * Bundle-Kennung; das Symbol setzt die Extension dazu, weil nur sie an die
   * Programmbündel dieses Rechners kommt.
   */
  datenwege?: { arten: ExokortexQuellenart[] };
  /**
   * Woraus der Exokortex besteht — die drei Schichten und ihre Verteilung.
   * Die Verteilung zaehlt `graphindex` beim Bau; hier kostet sie nichts.
   */
  bestand?: {
    /** Notizen auf der Landkarte im Arbeits-Vault. */
    landkarte: number | null;
    /** Einheiten im Volltext. */
    einheiten: number | null;
    verteilung: {
      knoten: ExokortexAnteil[];
      kante: ExokortexAnteil[];
      projekt: ExokortexAnteil[];
    };
  };
  /** status.py selbst war nicht erreichbar. Dann steht oben nur diese Zeile. */
  fehler?: string;
}

export interface ExokortexAnteil {
  name: string;
  anzahl: number;
}

/**
 * Eine Quellenart — wie aus dem Zufluss ein Graph wird.
 *
 * Die Ebene darunter sind austauschbare Instanzen: ein vierter KI-Anbieter oder
 * ein zweites Aufnahmegerät folgt demselben Muster und ist eine Zeile mehr,
 * kein neuer Fall.
 */
interface ExokortexQuellenart {
  kennung: string;
  name: string;
  /** Was im Graphen daraus wird, in einem Satz. */
  muster: string;
  /** Welches Skript sie hereinholt — `null`, solange keines existiert. */
  adapter: string | null;
  takt: string | null;
  knoten: number;
  hinweis?: string | null;
  /** Wie viele Instanzen tatsächlich angebunden sind. */
  aktive: number;
  instanzen: ExokortexInstanz[];
}

/** Wohin ein Klick auf eine Quelle oder eines ihrer Werkzeuge führt. */
export interface ExokortexQuelleZiel {
  name?: string;
  bundle?: string | null;
  app?: string | null;
  url?: string;
  pfad?: string;
}

export interface ExokortexInstanz {
  kennung: string;
  name: string;
  /** Bundle-Kennung der Anwendung. `null` bei Diensten ohne Anwendung hier. */
  bundle: string | null;
  /** Anzeigename — Rückfall, wenn Spotlight sie nicht kennt. */
  app?: string | null;
  /** Ordner, den ein Klick öffnet, wenn es keine Anwendung gibt. */
  pfad?: string;
  /** Website, falls die Quelle kein Programm auf diesem Rechner hat. */
  url?: string;
  /** Die Oberflächen eines Anbieters: Chat, Code, Cloud. */
  werkzeuge?: Array<string | ExokortexQuelleZiel>;
  hinweis?: string;
  zustand: 'aktiv' | 'geplant';
  /** data-URI des echten App-Symbols; von der Extension ergänzt. */
  symbol?: string | null;
}
