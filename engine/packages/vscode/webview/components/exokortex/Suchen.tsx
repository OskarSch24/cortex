import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';
import { Abschnitt } from './parts.js';
import { zahl } from './format.js';
import type { Exokortex } from './useExokortex.js';

export function SuchenTab({ x }: { x: Exokortex }) {
  const { frage, setFrage, treffer, setTreffer, sucht, setSucht, bestand } = x;
  return (
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
  );
}
