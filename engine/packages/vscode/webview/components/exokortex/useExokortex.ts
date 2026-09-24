import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  ExokortexAction, ExokortexPruefung, ExokortexStatusDto, ExokortexZustand, HostToWebview,
} from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';
import { ABHILFE, REITER, type Laufend, type ReiterId } from './model.js';
import { lesbar, messwert, zahl } from './format.js';

/**
 * Zustand der Exokortex-Seite: der Stand vom Host, eine laufende Aktion, der
 * offene Reiter samt Zifferntasten und was die Reiter an Aufgeklapptem halten.
 * Er bleibt hier oben, damit ein Reiterwechsel nichts vergisst.
 */
export function useExokortex() {
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

  return {
    status, setStatus, lauf, setLauf, reiter, setReiter, listen, setListen, stillOffen, setStillOffen, frage,
    setFrage, treffer, setTreffer, sucht, setSucht, ausgabeRef, laeuft, urteil, arbeit, abnahme, bestand,
    pruefungen, brueche, stille, offeneArbeit, instanzen, angebunden, zaehler, abhilfe, tu, oeffne, zustand, wort,
    erster, warum,
  };
}

export type Exokortex = ReturnType<typeof useExokortex>;
