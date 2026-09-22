import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  ExokortexAction,
  ExokortexAnteil,
  ExokortexInstanz,
  ExokortexPruefung,
  ExokortexQuelleZiel,
  ExokortexStatusDto,
  ExokortexZustand,
  HostToWebview,
} from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { Galaxie } from './Galaxie.js';

/**
 * Der Exokortex als Seite wie die Einstellungen.
 *
 * Die Verbindung zwischen Cortex und dem Graphen kann auf ein Dutzend Arten
 * still kaputtgehen — der Konnektor steht in keinem Profil, der stündliche
 * Lauf ist geladen aber nie gelaufen, die Platte ist zu voll für den Vorflug.
 * Keiner dieser Zustände meldet sich, alle sehen von außen aus wie „läuft".
 *
 * Deshalb steht unter dem Titel ein Satz und nicht ein Raster aus zehn
 * Lämpchen: die Seite wird meist nur kurz angesehen, und die eine Frage dabei
 * lautet, ob gerade etwas zu tun ist.
 *
 * Reiter, weil die Seite verschiedene Fragen beantwortet: was ist zu tun
 * (Überblick), woraus besteht der Graph (Bestand), wie hängt er zusammen
 * (Galaxie), wo kommt der Inhalt her (Datenwege), was ist zuletzt passiert
 * (Läufe). Die Suche ist eine eigene Tätigkeit und hat ihren eigenen Reiter.
 *
 * Gebaut aus den Bausteinen von settings.css — Spalte, Abschnitt, Karte, Zeile,
 * Statuspunkt —, damit der Exokortex keine eigene Designsprache spricht.
 */

/** Die vier Zustände auf die Klassen von `.cxs-status`. */
const STATUS: Record<ExokortexZustand, { klasse: string; wort: string }> = {
  ok: { klasse: '', wort: 'In Ordnung' },
  warnung: { klasse: 'warn', wort: 'Warnung' },
  fehler: { klasse: 'bad', wort: 'Fehler' },
  unbekannt: { klasse: 'off', wort: 'Unbekannt' },
};

interface Knopf {
  action: ExokortexAction;
  label: string;
  dauer?: string;
  primaer?: boolean;
}

const KNOEPFE: Knopf[] = [
  { action: 'nachmessen', label: 'Nachmessen', dauer: '~80 Sek.' },
  { action: 'chatsEinspeisen', label: 'Chats einspeisen', dauer: '~6 Min.' },
  { action: 'pruefen', label: 'Prüfen', primaer: true },
];

/** Wie eine laufende Aktion über der Seite heißt. */
const LAUF_TITEL: Record<ExokortexAction, string> = {
  pruefen: 'Prüfung',
  chatsEinspeisen: 'Einspeisung',
  nachmessen: 'Messung',
  indexNeu: 'Indexbau',
  konnektorenSync: 'Übertragung',
  laufAn: 'Stündlicher Lauf',
  laufAus: 'Stündlicher Lauf',
};

type ReiterId = 'ueberblick' | 'bestand' | 'galaxie' | 'wege' | 'laeufe' | 'suche';

const REITER: Array<{ id: ReiterId; name: string }> = [
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
const ABHILFE: Array<{ passt: RegExp; action: ExokortexAction; label: string }> = [
  { passt: /Graphindex/i, action: 'indexNeu', label: 'Index bauen' },
  { passt: /Konnektor/i, action: 'konnektorenSync', label: 'Übertragen' },
  { passt: /Lauf|Chat/i, action: 'chatsEinspeisen', label: 'Einspeisen' },
];

/** Reine Ordnerstruktur: sie zeichnet den Baum nach, statt etwas zu verbinden. */
const STRUKTUR = ['LIEGT_IN', 'GEHOERT_ZU', 'BELEGT_DURCH', 'TEIL_VON'];

type Laufend = { action: ExokortexAction; zeilen: string[]; fehler?: string; fertig?: boolean };

/**
 * Die Farbe eines Projekts — dieselbe Rechnung wie in `protokoll/farben.py`.
 *
 * Gleiche Abstände auf dem Farbkreis über die sortierte Liste, Nachbarn
 * zusätzlich in der Helligkeit getrennt. Wichtig ist, dass Cortex und der
 * Obsidian-Graph dieselbe Farbe für dasselbe Projekt zeigen.
 */
function projektfarbe(index: number, gesamt: number): string {
  const h = Math.round((index / Math.max(gesamt, 1)) * 360);
  const l = index % 2 === 0 ? 58 : 45;
  return `hsl(${h} 58% ${l}%)`;
}

/** Zwei, drei Buchstaben für Dienste ohne Anwendung auf diesem Rechner. */
function kuerzel(name: string): string {
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
function messwert(text: string | null | undefined): string {
  return lesbar(text)
    .replace(/(\d)\.(\d+)\s?%/g, '$1,$2 %')
    .replace(/(\d)%/g, '$1 %')
    .replace(/\b\d{5,}\b/g, n => Number(n).toLocaleString('de-DE'));
}

/** Kantenarten sind Bezeichner in ASCII: „GEHOERT_ZU" liest sich als „GEHÖRT_ZU". */
const kantenname = (name: string) => name.replace(/AE/g, 'Ä').replace(/OE/g, 'Ö');

/** Der erste Buchstabe groß — Werte aus status.py beginnen oft klein. */
const satzanfang = (text: string) => (text ? text[0]!.toUpperCase() + text.slice(1) : text);

function quelleZiel(w: string | ExokortexQuelleZiel): ExokortexQuelleZiel {
  return typeof w === 'string' ? { name: w } : w;
}

function hatZiel(z: ExokortexQuelleZiel | ExokortexInstanz): boolean {
  return !!(z.url || z.pfad || z.bundle || z.app);
}

function oeffneQuelle(z: ExokortexQuelleZiel | ExokortexInstanz) {
  vscode.postMessage({
    kind: 'exokortexOeffneQuelle',
    bundle: z.bundle,
    app: z.app,
    url: z.url,
    pfad: z.pfad,
  });
}

const zahl = (n: number | null | undefined) => (n ?? 0).toLocaleString('de-DE');
const prozent = (teil: number, ganz: number) =>
  `${((teil / Math.max(ganz, 1)) * 100).toFixed(1).replace('.', ',')} %`;
/** Der Heimordner als Tilde — der volle Pfad steht im Tooltip. */
const kurzpfad = (pfad: string) => pfad.replace(/^\/Users\/[^/]+/, '~');
/** „2026-09-13 01:18" → „13.09. 01:18". */
function zeitpunkt(zeit: string | null | undefined): { tag: string; uhr: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(zeit ?? '');
  return m ? { tag: `${m[3]}.${m[2]}.`, uhr: m[4]! } : { tag: zeit ?? '—', uhr: '' };
}

function Abschnitt({
  titel,
  unter,
  rechts,
  children,
}: {
  titel: string;
  unter?: preact.ComponentChildren;
  rechts?: preact.ComponentChildren;
  children: preact.ComponentChildren;
}) {
  return (
    <section class="cxs-section">
      <div class={`cxs-section-head${unter ? ' has-sub' : ''}`}>
        <div>
          <h2>{titel}</h2>
          {unter && <p>{unter}</p>}
        </div>
        {rechts}
      </div>
      {children}
    </section>
  );
}

function Status({ zustand, wort }: { zustand: ExokortexZustand; wort?: string }) {
  const s = STATUS[zustand];
  return (
    <span class={`cxs-status ${s.klasse}`}>
      <i />
      {wort ?? s.wort}
    </span>
  );
}

/**
 * Eine Verteilung als Zeilen mit Balken. Nur die ersten sieben — danach ist der
 * Abstand zwischen 12.861 und 1 nicht mehr darstellbar, und der Rest steht als
 * Satz darunter.
 */
function Verteilung({
  titel,
  einheit,
  anteile,
  gesamt,
  gedaempft = [],
  fuss,
}: {
  titel: string;
  einheit: string;
  anteile: ExokortexAnteil[];
  gesamt: number;
  gedaempft?: string[];
  fuss?: string;
}) {
  if (!anteile.length) return null;
  const oben = anteile.slice(0, 7);
  const rest = anteile.slice(7);
  const spanne = (oben[0]?.anzahl || 1) * 1.02;
  const restSatz = rest.length
    ? `${zahl(rest.reduce((s, a) => s + a.anzahl, 0))} weitere in ${rest.length} Arten: ${rest
        .slice(0, 7)
        .map(a => a.name)
        .join(', ')}${rest.length > 7 ? ' …' : '.'}`
    : '';
  return (
    <Abschnitt titel={titel} unter={`${anteile.length} Arten · ${zahl(gesamt)} ${einheit}`}>
      <div class="cxs-card">
        {oben.map(a => (
          <div key={a.name} class="cxs-row cx-exo-row">
            <div class="cxs-row-text">
              <div class="cxs-row-title cx-exo-name">{a.name}</div>
            </div>
            <div class="cxs-row-control cx-exo-messung">
              <span class="cxs-meter cx-exo-meter">
                <i
                  class={gedaempft.includes(a.name) ? 'cx-exo-struktur' : ''}
                  style={{ width: `${Math.max((a.anzahl / spanne) * 100, 0.6)}%` }}
                />
              </span>
              <span class="cx-exo-wert">{zahl(a.anzahl)}</span>
              <span class="cx-exo-anteil">{prozent(a.anzahl, gesamt)}</span>
            </div>
          </div>
        ))}
      </div>
      {(restSatz || fuss) && (
        <p class="cxs-footnote">
          {restSatz}
          {restSatz && fuss ? ' ' : ''}
          {fuss}
        </p>
      )}
    </Abschnitt>
  );
}

export function ExokortexView() {
  const [status, setStatus] = useState<ExokortexStatusDto>();
  const [lauf, setLauf] = useState<Laufend>();
  const [reiter, setReiter] = useState<ReiterId>('ueberblick');
  const [listen, setListen] = useState(false);
  const [stillOffen, setStillOffen] = useState(true);
  const [frage, setFrage] = useState('');
  const [treffer, setTreffer] = useState<{ frage: string; text: string }>();
  const [sucht, setSucht] = useState(false);
  const ausgabeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const empfange = (event: MessageEvent<HostToWebview>) => {
      const nachricht = event.data;
      if (nachricht?.kind === 'exokortex') setStatus(nachricht.status);
      if (nachricht?.kind === 'exokortexTreffer') {
        setTreffer({ frage: nachricht.frage, text: nachricht.text });
        setSucht(false);
      }
      if (nachricht?.kind === 'exokortexAktion') {
        setLauf(vorher => {
          const zeilen = nachricht.action === vorher?.action ? [...vorher.zeilen] : [];
          if (nachricht.output && nachricht.state === 'running') zeilen.push(nachricht.output);
          else if (nachricht.output) zeilen.splice(0, zeilen.length, ...nachricht.output.split('\n'));
          return {
            action: nachricht.action,
            zeilen,
            fehler: nachricht.message,
            fertig: nachricht.state !== 'running',
          };
        });
      }
    };
    window.addEventListener('message', empfange);
    // Der Wächter läuft nur, solange diese Seite offen ist.
    vscode.postMessage({ kind: 'exokortexPageOpen', open: true });
    vscode.postMessage({ kind: 'getExokortex' });
    return () => {
      window.removeEventListener('message', empfange);
      vscode.postMessage({ kind: 'exokortexPageOpen', open: false });
    };
  }, []);

  // Ziffer wechselt den Reiter — nur wenn gerade kein Feld den Tastendruck
  // braucht, sonst tippt niemand mehr eine 2 in die Suche.
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const ziel = e.target as HTMLElement | null;
      if (ziel && /^(INPUT|TEXTAREA)$/.test(ziel.tagName)) return;
      const gewaehlt = REITER[Number(e.key) - 1];
      if (gewaehlt) setReiter(gewaehlt.id);
    };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, []);

  useEffect(() => {
    const el = ausgabeRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lauf?.zeilen.length]);

  const laeuft = lauf && !lauf.fertig ? lauf.action : undefined;
  const urteil = status?.urteil;
  const arbeit = status?.arbeitsliste;
  const abnahme = status?.abnahme;
  const bestand = status?.bestand;
  const pruefungen = status?.pruefungen ?? [];
  const brueche = pruefungen.filter(p => p.zustand !== 'ok');
  const stille = pruefungen.filter(p => p.zustand === 'ok');
  const offeneArbeit =
    (arbeit?.offene_entscheidungen ?? 0) + (arbeit?.unbenannte_orte ?? 0) + (arbeit?.fehlende_dateien ?? 0);
  const instanzen = (status?.datenwege?.arten ?? []).flatMap(a => a.instanzen);
  const angebunden = instanzen.filter(i => i.zustand === 'aktiv').length;

  const zaehler: Record<ReiterId, string> = {
    ueberblick: String(brueche.length),
    bestand: zahl(status?.graph?.knoten),
    galaxie: '',
    wege: `${angebunden}/${instanzen.length}`,
    laeufe: String(status?.chronik.length ?? 0),
    suche: '',
  };

  const abhilfe = (p: ExokortexPruefung) => ABHILFE.find(a => a.passt.test(p.name));
  const tu = (action: ExokortexAction) => vscode.postMessage({ kind: 'exokortexAction', action });
  const oeffne = (path: string) => vscode.postMessage({ kind: 'exokortexOpenPath', path });

  // Der Satz unter dem Titel: ein Wort zum Zustand, dahinter der Grund.
  const zustand: ExokortexZustand = status?.fehler ? 'fehler' : (urteil?.zustand ?? 'unbekannt');
  const wort = !status ? 'Wird geprüft …' : zustand === 'fehler' ? 'Gestört' : zustand === 'unbekannt' ? 'Unklar' : 'Bereit';
  const erster = brueche[0];
  const warum = status?.fehler
    ? status.fehler
    : erster
      ? `${lesbar(erster.name)}: ${messwert(erster.wert)}${brueche.length > 1 ? ` und ${brueche.length - 1} weitere` : ''}`
      : urteil?.zustand === 'ok'
        ? 'Alle Prüfungen ohne Befund'
        : '';

  const kopf = (
    <>
      <div class="cxs-page-head">
        <div>
          <h1>Exokortex</h1>
          <p class="cx-exo-satz">
            <span class={`cxs-status ${STATUS[zustand].klasse}`}>
              <i />
            </span>
            <span>
              {wort}
              {warum && ` · ${warum}`}
            </span>
          </p>
        </div>
        <div class="cxs-page-actions">
          {KNOEPFE.map(knopf => (
            <button
              key={knopf.action}
              class={`cxs-button${knopf.primaer ? ' primary' : ''}`}
              title={laeuft === knopf.action ? 'Abbrechen' : knopf.dauer}
              disabled={!!laeuft && laeuft !== knopf.action}
              onClick={() => tu(knopf.action)}
            >
              {laeuft === knopf.action ? 'Abbrechen' : knopf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reiter. Der Zähler steht daneben, damit die Leiste schon sagt, wo
          etwas ansteht — man muss nicht erst hineinklicken. */}
      <div class="cxs-tabbar">
        <div class="cxs-tabs" role="tablist">
          {REITER.map((r, i) => (
            <button
              key={r.id}
              role="tab"
              aria-selected={reiter === r.id}
              class={reiter === r.id ? 'on' : ''}
              title={`Taste ${i + 1}`}
              onClick={() => setReiter(r.id)}
            >
              {r.name}
              {zaehler[r.id] && <span>{zaehler[r.id]}</span>}
            </button>
          ))}
        </div>
        {status?.graph && (
          <span class="cx-exo-stand">
            Stand {zeitpunkt(status.graph.gebaut_am).tag}, {zeitpunkt(status.graph.gebaut_am).uhr}
          </span>
        )}
      </div>

      {/* Eine laufende Aktion steht über allem — sie betrifft jeden Reiter. */}
      {lauf && (lauf.zeilen.length > 0 || lauf.fehler) && (
        <section class="cxs-section cx-exo-lauf">
          <div class="cxs-card">
            <div class="cxs-row has-icon">
              <span class="cxs-row-icon">
                {lauf.fertig ? (
                  <Status zustand={lauf.fehler ? 'fehler' : 'ok'} wort="" />
                ) : (
                  <span class="cxs-spinner" />
                )}
              </span>
              <div class="cxs-row-text">
                <div class="cxs-row-title">
                  {LAUF_TITEL[lauf.action]} {lauf.fertig ? (lauf.fehler ? 'fehlgeschlagen' : 'fertig') : 'läuft'}
                </div>
                <div class="cxs-row-sub">{lauf.fehler ?? (lauf.fertig ? 'Die Seite zeigt den neuen Stand.' : 'Die Ausgabe steht unten.')}</div>
              </div>
              <div class="cxs-row-control">
                {lauf.fertig ? (
                  <button class="cxs-button ghost" aria-label="Ausgabe schließen" onClick={() => setLauf(undefined)}>
                    Schließen
                  </button>
                ) : (
                  <button class="cxs-button" onClick={() => tu(lauf.action)}>
                    Abbrechen
                  </button>
                )}
              </div>
            </div>
            {lauf.zeilen.length > 0 && (
              <pre ref={ausgabeRef} class="cx-exo-ausgabe">
                {lauf.zeilen.join('\n')}
              </pre>
            )}
          </div>
        </section>
      )}
    </>
  );

  // Die Galaxie braucht die ganze Fläche: Kopf und Reiter oben in der Spalte,
  // der Graph darunter über die volle Breite.
  if (reiter === 'galaxie') {
    return (
      <section class="cx-exo cx-settings-mode">
        <div class="cx-exo-oben">
          <div class="cxs-page">{kopf}</div>
        </div>
        <Galaxie />
      </section>
    );
  }

  return (
    <section class="cx-exo cx-settings-mode">
      <div class="cxs-scroll">
        <div class="cxs-page">
          {kopf}

          {/* ══ 1 · Überblick ══ */}
          {reiter === 'ueberblick' && (
            <>
              <Abschnitt
                titel="Braucht Aufmerksamkeit"
                unter={`${brueche.length} ${brueche.length === 1 ? 'Befund' : 'Befunde'} · ${stille.length} ${
                  stille.length === 1 ? 'Prüfung' : 'Prüfungen'
                } ohne Befund`}
              >
                <div class="cxs-card">
                  {brueche.length === 0 && (
                    <div class="cxs-row">
                      <div class="cxs-row-text">
                        <div class="cxs-row-title">Nichts offen</div>
                        <div class="cxs-row-sub">Alle Prüfungen sind ohne Befund.</div>
                      </div>
                      <div class="cxs-row-control">
                        <Status zustand="ok" />
                      </div>
                    </div>
                  )}
                  {brueche.map(p => {
                    const tat = abhilfe(p);
                    return (
                      <div key={p.name} class="cxs-row">
                        <div class="cxs-row-text">
                          <div class="cxs-row-title">{lesbar(p.name)}</div>
                          <div class="cxs-row-sub">
                            {satzanfang([messwert(p.wert), lesbar(p.hinweis)].filter(Boolean).join(' — '))}
                          </div>
                        </div>
                        <div class="cxs-row-control">
                          <Status zustand={p.zustand} />
                          {tat && (
                            <button class="cxs-button" disabled={!!laeuft} onClick={() => tu(tat.action)}>
                              {tat.label}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {stille.length > 0 && (
                    <>
                      <button
                        class="cxs-row cx-exo-row cx-exo-aufklapp"
                        aria-expanded={stillOffen}
                        onClick={() => setStillOffen(v => !v)}
                      >
                        <span class="cxs-row-text cx-exo-leise">
                          {stille.length} {stille.length === 1 ? 'Prüfung' : 'Prüfungen'} ohne Befund
                        </span>
                        <span class={`cx-exo-pfeil${stillOffen ? ' offen' : ''}`}>
                          <Glyph name="chevronDown" size={14} />
                        </span>
                      </button>
                      {stillOffen && (
                        <div class="cx-exo-still">
                          {stille.map(p => (
                            <span key={p.name} class="cxs-status" title={messwert(p.wert)}>
                              <i />
                              {lesbar(p.name)}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Abschnitt>

              {arbeit && offeneArbeit > 0 && (
                <Abschnitt titel="Wartet auf dich" unter={`${zahl(offeneArbeit)} offen`}>
                  <div class="cxs-card">
                    {[
                      { z: arbeit.offene_entscheidungen, n: 'Offene Entscheidungen', h: 'Knoten, die die Maschine nicht raten darf' },
                      { z: arbeit.unbenannte_orte ?? 0, n: 'Unbenannte Ortsgruppen', h: 'Gruppiert, aber noch ohne Namen' },
                      {
                        z: arbeit.fehlende_dateien,
                        n: 'Fehlende Dateien',
                        h: `Aus ${arbeit.fehllisten.length} ${arbeit.fehllisten.length === 1 ? 'früheren Einspeisung' : 'früheren Einspeisungen'}`,
                        listen: arbeit.fehllisten.length > 0,
                      },
                    ].map(x => (
                      <div key={x.n} class="cxs-row">
                        <div class="cxs-row-text">
                          <div class="cxs-row-title">{x.n}</div>
                          <div class="cxs-row-sub">{x.h}</div>
                        </div>
                        <div class="cxs-row-control">
                          <span class="cx-exo-wert">{zahl(x.z)}</span>
                          {x.listen && (
                            <button class="cxs-button" aria-expanded={listen} onClick={() => setListen(v => !v)}>
                              {listen ? 'Ausblenden' : 'Fehllisten'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {listen &&
                      arbeit.fehllisten.map(liste => (
                        <button
                          key={liste.datei}
                          class="cxs-row cx-exo-row cx-exo-datei"
                          title={liste.datei}
                          onClick={() => oeffne(liste.datei)}
                        >
                          <span class="cxs-row-icon">
                            <Glyph name="file" size={15} />
                          </span>
                          <span class="cxs-row-text">{liste.datei.split('/').pop()}</span>
                          <span class="cx-exo-anteil">{zahl(liste.anzahl)} Zeilen</span>
                        </button>
                      ))}
                  </div>
                </Abschnitt>
              )}

              {bestand && (
                <Abschnitt titel="Bestand" unter="Drei Schichten, vom Sichtbaren bis zum Volltext">
                  <div class="cxs-card cx-exo-schichten">
                    {[
                      { rolle: 'Sichtbar', z: bestand.landkarte, was: 'Notizen im Vault', wo: '80-Auto/landkarte' },
                      { rolle: 'Graph', z: status?.graph?.knoten, was: 'Knoten', wo: 'exokortex.graph' },
                      { rolle: 'Beziehungen', z: status?.graph?.kanten, was: 'Kanten', wo: 'graph.sqlite' },
                      { rolle: 'Volltext', z: bestand.einheiten, was: 'Einheiten', wo: 'inhalt.sqlite' },
                    ].map(s => (
                      <div key={s.rolle} title={s.wo}>
                        <span class="rolle">{s.rolle}</span>
                        <strong>{zahl(s.z)}</strong>
                        <span class="was">{s.was}</span>
                      </div>
                    ))}
                  </div>
                </Abschnitt>
              )}

              {status?.pfade.speicher && (
                <Abschnitt titel="Ablage">
                  <div class="cxs-card">
                    {(
                      [
                        ['Speicher', status.pfade.speicher],
                        ['Vault', status.pfade.vault],
                        ['Chats', status.pfade.chats],
                      ] as const
                    ).map(([name, pfad]) => (
                      <div key={name} class="cxs-row has-icon">
                        <span class="cxs-row-icon cx-exo-leise">
                          <Glyph name="folderOpen" size={16} />
                        </span>
                        <div class="cxs-row-text">
                          <div class="cxs-row-title">{name}</div>
                          <div class="cxs-row-sub" title={pfad}>
                            {kurzpfad(pfad)}
                          </div>
                        </div>
                        <div class="cxs-row-control">
                          <button class="cxs-button ghost" onClick={() => oeffne(pfad)}>
                            Öffnen
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p class="cxs-footnote cx-exo-konnektor">
                    <span class="cxs-status">
                      <i />
                    </span>
                    Agenten lesen über den Konnektor exokortex · 5 Werkzeuge · nur lesend
                  </p>
                </Abschnitt>
              )}
            </>
          )}

          {/* ══ 2 · Bestand ══ */}
          {reiter === 'bestand' && bestand && (
            <>
              <Verteilung
                titel="Knoten nach Art"
                einheit="Knoten"
                anteile={bestand.verteilung.knoten}
                gesamt={status?.graph?.knoten ?? 0}
              />
              <Verteilung
                titel="Kanten nach Art"
                einheit="Kanten"
                anteile={bestand.verteilung.kante.map(k => ({ ...k, name: kantenname(k.name) }))}
                gesamt={status?.graph?.kanten ?? 0}
                gedaempft={STRUKTUR.map(kantenname)}
                /* Genau der Anteil der Strukturkanten ist die Zahl, an der die
                   Abnahme misst — 88 % waren der Fehlerzustand. */
                fuss="Grau sind Strukturkanten, die nur den Ordnerbaum nachzeichnen — ihr Anteil ist das Maß, an dem die Abnahme den Rückfall in einen Ordnerbaum misst; über 60 % reißt sie."
              />
              {bestand.verteilung.projekt.length > 0 && (
                <Abschnitt
                  titel="Projekte"
                  unter={`${bestand.verteilung.projekt.length} Projekte · ${zahl(
                    bestand.verteilung.projekt.reduce((s, p) => s + p.anzahl, 0),
                  )} Dokumente`}
                >
                  <div class="cxs-card">
                    {bestand.verteilung.projekt.map((p, i, alle) => (
                      <div key={p.name} class="cxs-row cx-exo-row has-icon">
                        <span class="cx-exo-punkt" style={{ background: projektfarbe(i, alle.length) }} />
                        <div class="cxs-row-text">
                          <div class="cxs-row-title cx-exo-name">{p.name}</div>
                        </div>
                        <div class="cxs-row-control cx-exo-messung">
                          <span class="cxs-meter cx-exo-meter">
                            <i style={{ width: `${Math.max((p.anzahl / (alle[0]?.anzahl || 1)) * 100, 1)}%` }} />
                          </span>
                          <span class="cx-exo-wert">{zahl(p.anzahl)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Abschnitt>
              )}
            </>
          )}

          {/* ══ 4 · Datenwege ══ */}
          {reiter === 'wege' && status?.datenwege && (
            <Abschnitt
              titel="Quellenarten"
              unter={`${status.datenwege.arten.length} Arten · ${angebunden} von ${instanzen.length} Quellen angebunden`}
            >
              {status.datenwege.arten.map(art => (
                <div key={art.kennung} class="cxs-card cx-exo-art">
                  <div class="cxs-row">
                    <div class="cxs-row-text">
                      <div class="cxs-row-title">{lesbar(art.name)}</div>
                      <div class="cxs-row-sub">
                        {lesbar(art.muster)}
                        {art.adapter && ` · ${art.adapter}${art.takt ? `, ${lesbar(art.takt)}` : ''}`}
                      </div>
                    </div>
                    <div class="cxs-row-control">
                      {art.adapter ? (
                        <>
                          <span class="cx-exo-wert">{zahl(art.knoten)}</span>
                          <span class="cx-exo-anteil">Knoten</span>
                        </>
                      ) : (
                        <span class="cx-exo-anteil">kein Adapter</span>
                      )}
                    </div>
                  </div>
                  {art.instanzen.map(i => {
                    const werkzeuge = (i.werkzeuge ?? []).map(quelleZiel);
                    const klickbar = hatZiel(i) || werkzeuge.some(hatZiel);
                    const Name = klickbar ? 'button' : 'div';
                    return (
                      <Name
                        key={i.kennung}
                        class="cx-exo-instanz"
                        title={lesbar(i.hinweis)}
                        {...(klickbar
                          ? { type: 'button' as const, onClick: () => oeffneQuelle(i) }
                          : {})}
                      >
                        <span class="cx-exo-kachel">
                          {i.symbol ? <img src={i.symbol} alt="" /> : kuerzel(i.name)}
                        </span>
                        <span class={`cx-exo-instanz-name${i.zustand === 'aktiv' ? '' : ' geplant'}`}>
                          {i.name}
                          {werkzeuge.length > 0 && (
                            <small class="cx-exo-werkzeuge">
                              {werkzeuge.map((w, n) => (
                                <span key={`${w.name}-${n}`}>
                                  {n > 0 ? ' · ' : null}
                                  {hatZiel(w) ? (
                                    <button
                                      type="button"
                                      class="cx-exo-werkzeug"
                                      onClick={e => {
                                        e.stopPropagation();
                                        oeffneQuelle(w);
                                      }}
                                    >
                                      {w.name}
                                    </button>
                                  ) : (
                                    w.name
                                  )}
                                </span>
                              ))}
                            </small>
                          )}
                        </span>
                        <Status
                          zustand={i.zustand === 'aktiv' ? 'ok' : 'unbekannt'}
                          wort={i.zustand === 'aktiv' ? 'Angebunden' : 'Geplant'}
                        />
                      </Name>
                    );
                  })}
                </div>
              ))}
              <p class="cxs-footnote">
                Die Quellenart bestimmt, wie aus dem Zufluss ein Graph wird; die Quellen darin sind austauschbar. Ein
                zweites Aufnahmegerät oder ein vierter KI-Anbieter reiht sich in seine Art ein, ohne dass sich die
                Systematik ändert — Werkzeuge wie Codex oder Claude Code sind Oberflächen ihres Anbieters, kein eigener
                Quellentyp.
              </p>
            </Abschnitt>
          )}

          {/* ══ 5 · Läufe ══ */}
          {reiter === 'laeufe' && (
            <>
              <Abschnitt titel="Letzte Läufe" unter={`${status?.chronik.length ?? 0} im Journal`}>
                <div class="cxs-card">
                  {(status?.chronik ?? []).length === 0 && <div class="cxs-card-empty">Noch kein Lauf im Journal.</div>}
                  {(() => {
                    const chronik = status?.chronik ?? [];
                    const laengste = Math.max(...chronik.map(e => e.dauer_s ?? 0), 1);
                    return chronik.map((e, i) => {
                      const z = zeitpunkt(e.zeit);
                      const ausgang: ExokortexZustand = e.exitcode === 0 ? 'ok' : e.exitcode == null ? 'unbekannt' : 'fehler';
                      const chats = e.chats != null ? ` · ${e.chats} ${e.chats === 1 ? 'Chat' : 'Chats'}` : '';
                      return (
                        <div key={`${e.zeit}-${i}`} class="cxs-row cx-exo-row">
                          <span class="cx-exo-zeit">
                            {z.tag} <span>{z.uhr}</span>
                          </span>
                          <span class="cxs-row-text cx-exo-leise">
                            {e.quellen.join(', ') || '—'}
                            {chats}
                          </span>
                          <span class="cxs-row-control cx-exo-messung">
                            <span class="cxs-meter cx-exo-meter kurz">
                              <i
                                class={ausgang === 'ok' ? '' : 'cx-exo-struktur'}
                                style={{ width: `${Math.max(((e.dauer_s ?? 0) / laengste) * 100, 1)}%` }}
                              />
                            </span>
                            <span class="cx-exo-wert">{e.dauer_s == null ? '—' : `${Math.max(1, Math.round(e.dauer_s / 60))} Min.`}</span>
                            <span class="cx-exo-ausgang">
                              <Status
                                zustand={ausgang}
                                wort={ausgang === 'ok' ? 'ok' : ausgang === 'unbekannt' ? 'unbekannt' : `exit ${e.exitcode}`}
                              />
                            </span>
                          </span>
                        </div>
                      );
                    });
                  })()}
                </div>
                <p class="cxs-footnote">
                  Knoten, Kanten und Abnahme führt der Speicher nicht als Zeitreihe — hier stehen einzelne Läufe,
                  keine Verlaufskurven.
                </p>
              </Abschnitt>

              {abnahme && abnahme.gerissen !== null && (
                <Abschnitt
                  titel="Abnahme"
                  unter={
                    <>
                      {abnahme.gemessen ? `Gemessen am ${zeitpunkt(abnahme.gemessen).tag} um ${zeitpunkt(abnahme.gemessen).uhr}` : 'Nie gemessen'}
                      {abnahme.veraltet && ' · seither wurde eingespeist, die Messung gilt nicht mehr'}
                      {abnahme.herkunft === 'lauf' && ' · nur die Zahl bekannt, nie im Einzelnen gemessen'}
                    </>
                  }
                  rechts={
                    <Status
                      zustand={abnahme.gerissen === 0 ? 'ok' : 'fehler'}
                      wort={abnahme.gerissen === 0 ? 'Alle bestanden' : `${abnahme.gerissen} von ${abnahme.gesamt ?? '?'} gerissen`}
                    />
                  }
                >
                  {abnahme.befunde.length > 0 && (
                    <div class="cxs-card">
                      {abnahme.befunde.map(b => (
                        <div key={b.name} class="cxs-row">
                          <div class="cxs-row-text">
                            <div class="cxs-row-title">{lesbar(b.name)}</div>
                            <div class="cxs-row-sub" title={b.hinweis}>
                              {messwert(b.wert)}
                            </div>
                          </div>
                          <div class="cxs-row-control">
                            <Status zustand="fehler" wort="Gerissen" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Abschnitt>
              )}
            </>
          )}

          {/* ══ 6 · Suchen ══ */}
          {reiter === 'suche' && (
            <Abschnitt titel="Volltext" unter={`${zahl(bestand?.einheiten)} Einheiten · derselbe Weg, den eine KI nimmt`}>
              <form
                class="cxs-search cx-exo-suche"
                onSubmit={e => {
                  e.preventDefault();
                  if (!frage.trim()) return;
                  setSucht(true);
                  vscode.postMessage({ kind: 'exokortexSuche', frage: frage.trim() });
                }}
              >
                <Glyph name="search" size={15} />
                <input
                  value={frage}
                  placeholder="Volltext über alles, was eingespeist wurde"
                  onInput={e => setFrage((e.target as HTMLInputElement).value)}
                />
                <button class="cxs-button" type="submit" disabled={sucht || !frage.trim()}>
                  {sucht ? 'Sucht …' : 'Suchen'}
                </button>
              </form>
              <div class="cxs-card cx-exo-treffer">
                {treffer ? (
                  <>
                    <div class="cxs-row">
                      <div class="cxs-row-text">
                        <div class="cxs-row-title">Treffer für „{treffer.frage}"</div>
                      </div>
                      <div class="cxs-row-control">
                        <button class="cxs-button ghost" onClick={() => setTreffer(undefined)}>
                          Schließen
                        </button>
                      </div>
                    </div>
                    <pre class="cx-exo-trefftext">{treffer.text}</pre>
                  </>
                ) : (
                  <div class="cxs-empty">
                    <Glyph name="search" size={20} />
                    <span>Treffer erscheinen hier — mit Dokument, Projekt und Fundstelle.</span>
                  </div>
                )}
              </div>
            </Abschnitt>
          )}
        </div>
      </div>
    </section>
  );
}
