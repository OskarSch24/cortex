import type {
  ExokortexZustand,
} from '../../../src/panel/protocol.js';
import { Abschnitt, Status } from './parts.js';
import { lesbar, messwert, zeitpunkt } from './format.js';
import type { Exokortex } from './useExokortex.js';

export function LaeufeTab({ x }: { x: Exokortex }) {
  const { status, abnahme } = x;
  return (
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
  );
}
