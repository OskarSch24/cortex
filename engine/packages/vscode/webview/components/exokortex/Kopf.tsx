import { STATUS, KNOEPFE, REITER } from './model.js';
import { zeitpunkt } from './format.js';
import type { Exokortex } from './useExokortex.js';
import { LaufBanner } from './LaufBanner.js';

export function Kopf({ x }: { x: Exokortex }) {
  const { status, reiter, setReiter, laeuft, zaehler, tu, zustand, wort, warum } = x;
  return (
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
      <LaufBanner x={x} />
    </>
  );
}
