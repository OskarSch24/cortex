import { Galaxie } from './Galaxie.js';
import { BestandTab } from './exokortex/Bestand.js';
import { DatenwegeTab } from './exokortex/Datenwege.js';
import { Kopf } from './exokortex/Kopf.js';
import { LaeufeTab } from './exokortex/Laeufe.js';
import { SuchenTab } from './exokortex/Suchen.js';
import { UeberblickTab } from './exokortex/Ueberblick.js';
import { useExokortex } from './exokortex/useExokortex.js';

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

export function ExokortexView() {
  const x = useExokortex();
  const { reiter, status, bestand } = x;
  const kopf = <Kopf x={x} />;

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
          {reiter === 'ueberblick' && <UeberblickTab x={x} />}

          {/* ══ 2 · Bestand ══ */}
          {reiter === 'bestand' && bestand && <BestandTab x={x} bestand={bestand} />}

          {/* ══ 4 · Datenwege ══ */}
          {reiter === 'wege' && status?.datenwege && <DatenwegeTab x={x} datenwege={status.datenwege} />}

          {/* ══ 5 · Läufe ══ */}
          {reiter === 'laeufe' && <LaeufeTab x={x} />}

          {/* ══ 6 · Suchen ══ */}
          {reiter === 'suche' && <SuchenTab x={x} />}
        </div>
      </div>
    </section>
  );
}
