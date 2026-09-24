/**
 * Plugin-Zeichen: die echten Markenlogos in Farbe.
 *
 * Sie liegen als SVG-Dateien unter `media/plugins/icons/` und werden über die
 * Webview-Basis-URI geladen, nicht in das Bündel eingebettet. Zwei Gründe:
 * 248 KB Logos gehören nicht in eine JavaScript-Datei, und die CSP des Hosts
 * (`img-src ${webview.cspSource}`) erlaubt genau diesen Weg — entfernte Bilder
 * dagegen nie. Woher jedes Logo stammt, steht in `media/plugins/SOURCES.md`.
 *
 * Die Marken bleiben Eigentum ihrer Inhaber; sie stehen hier ausschließlich,
 * um den jeweiligen Dienst erkennbar zu machen. Cortex gehört zu keinem von
 * ihnen. Für einen Dienst ohne frei verfügbares Logo steht die Initiale — ein
 * selbst gezeichnetes Markenzeichen wäre eine Behauptung über fremdes Eigentum.
 *
 * Die Dateien holt `scripts/fetch-plugin-icons.py`.
 */

declare global {
  interface Window {
    /** Basis für `media/`, vom Host ins HTML geschrieben. */
    __CORTEX_MEDIA__?: string;
  }
}

const mediaBase = (): string => window.__CORTEX_MEDIA__ ?? '../media/';

/**
 * Ein Dateiname zeigt in den Icon-Ordner. Ein fertiger `data:`-Verweis kommt
 * dagegen aus dem MCP-Handschlag des eingebauten Konnektors und geht unverändert
 * durch — die CSP des Hosts lässt beides zu.
 */
const iconUrl = (file: string): string =>
  /^data:/.test(file) ? file : `${mediaBase()}plugins/icons/${file}`;

/** Eine stabile, ruhige Fläche für Dienste ohne eigenes Logo. */
const FALLBACK_HUES = [212, 258, 12, 152, 32, 285, 190];
function fallbackColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return `hsl(${FALLBACK_HUES[hash % FALLBACK_HUES.length]} 32% 62%)`;
}

export function PluginMark({
  icon,
  name,
  size = 'md',
}: {
  icon?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const klass = `cx-plugin-tile${size === 'lg' ? ' lg' : size === 'sm' ? ' sm' : ''}`;
  if (!icon) {
    return (
      <span class={klass} aria-hidden="true">
        <span style={{ color: fallbackColor(name) }}>{[...name][0]?.toUpperCase() ?? '?'}</span>
      </span>
    );
  }
  return (
    <span class={klass} aria-hidden="true">
      <img src={iconUrl(icon)} alt="" draggable={false} loading="lazy" />
    </span>
  );
}
