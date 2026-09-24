import { tildePath } from '../../format/path.js';
import { Glyph } from '../CortexIcons.js';
import { Abschnitt, Status } from './parts.js';
import { lesbar, messwert, satzanfang, zahl } from './format.js';
import type { Exokortex } from './useExokortex.js';

export function UeberblickTab({ x }: { x: Exokortex }) {
  const { status, listen, setListen, stillOffen, setStillOffen, laeuft, arbeit, bestand, brueche, stille, offeneArbeit, abhilfe, tu, oeffne } = x;
  return (
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
                    {tildePath(pfad)}
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
  );
}
