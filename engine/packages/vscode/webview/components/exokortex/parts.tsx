import type {
  ExokortexAnteil, ExokortexZustand,
} from '../../../src/panel/protocol.js';
import { STATUS } from './model.js';
import { prozent, zahl } from './format.js';

export function Abschnitt({
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

export function Status({ zustand, wort }: { zustand: ExokortexZustand; wort?: string }) {
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
export function Verteilung({
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
