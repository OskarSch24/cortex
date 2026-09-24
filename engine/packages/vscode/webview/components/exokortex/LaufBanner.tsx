import { Status } from './parts.js';
import { LAUF_TITEL } from './model.js';
import type { Exokortex } from './useExokortex.js';

export function LaufBanner({ x }: { x: Exokortex }) {
  const { lauf, setLauf, ausgabeRef, tu } = x;
  return (
    lauf && (lauf.zeilen.length > 0 || lauf.fehler) && (
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
    )
  );
}
