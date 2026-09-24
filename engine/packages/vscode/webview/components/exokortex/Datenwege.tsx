import type {
  ExokortexStatusDto,
} from '../../../src/panel/protocol.js';
import { Abschnitt, Status } from './parts.js';
import { hatZiel, kuerzel, lesbar, oeffneQuelle, quelleZiel, zahl } from './format.js';
import type { Exokortex } from './useExokortex.js';

export function DatenwegeTab({ x, datenwege }: { x: Exokortex; datenwege: NonNullable<ExokortexStatusDto['datenwege']> }) {
  const { instanzen, angebunden } = x;
  return (
    <Abschnitt
      titel="Quellenarten"
      unter={`${datenwege.arten.length} Arten · ${angebunden} von ${instanzen.length} Quellen angebunden`}
    >
      {datenwege.arten.map(art => (
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
  );
}
