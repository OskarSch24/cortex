import { Abschnitt, Verteilung } from './parts.js';
import { STRUKTUR } from './model.js';
import { kantenname, projektfarbe, zahl } from './format.js';
import type { Exokortex } from './useExokortex.js';

export function BestandTab({ x, bestand }: { x: Exokortex; bestand: NonNullable<Exokortex['bestand']> }) {
  const { status } = x;
  return (
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
  );
}
