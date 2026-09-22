import { useState } from 'preact/hooks';
import type { GeneratedImage } from '../../src/panel/transcript.js';
import type { ImageOptions } from '../../src/panel/imageOptions.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { Glyph } from './CortexIcons.js';

export type ImageAction = 'view' | 'copy' | 'save' | 'saveAll' | 'reveal' | 'open' | 'variant' | 'variantAll' | 'copyPrompt';

/** Das Bild selbst ist die Ausgabe. Weitere Aktionen stehen im Hover-Menü. */
export function ImageCard({ images, onAction, onRate, ratedPoor }: {
  images: GeneratedImage[];
  options?: ImageOptions;
  provider?: string;
  onRate?: () => void;
  ratedPoor?: boolean;
  onAction: (action: ImageAction, image: GeneratedImage, all: GeneratedImage[]) => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useDismissiblePopup<HTMLDivElement>(menu, () => setMenu(false));
  const first = images[0];
  if (!first) return null;
  const act = (action: ImageAction, image = first) => { setMenu(false); onAction(action, image, images); };
  return <div class="cx-img-card" aria-label={images.length === 1 ? 'Generiertes Bild' : `${images.length} generierte Bilder`}>
    <div class={`cx-img-grid ${images.length === 1 ? 'single' : ''}`}>
      {images.map((image, i) => <div key={image.path} class="cx-img-tile">
        <button type="button" class="cx-img-open" aria-label={`Bild ${i + 1} öffnen`} title="Bild öffnen" onClick={() => act('view', image)}><img src={image.src} alt={image.prompt ?? `Bild ${i + 1}`} loading="lazy" /></button>
        <div class="cx-img-tile-acts">
          <button title="Bild bearbeiten" aria-label="Bild bearbeiten" onClick={() => act('view', image)}><Glyph name="edit" size={15} /></button>
          <button title="Bild speichern" aria-label="Speichern" onClick={() => act('save', image)}><Glyph name="download" size={15} /></button>
        </div>
      </div>)}
    </div>
    <div class="cx-img-card-foot">
      <button title="Bild kopieren" aria-label="Bild kopieren" onClick={() => act('copy')}><Glyph name="copy" size={15} /></button>
      <button title="Antwort war schlecht" aria-label="Antwort war schlecht" aria-pressed={ratedPoor === true} onClick={onRate}><Glyph name="thumbDown" size={15} /></button>
      <button title="Groß anzeigen" aria-label="Groß anzeigen" onClick={() => act('view')}><Glyph name="expand" size={15} /></button>
      <div class="cx-c-menu-anchor" ref={menuRef}>
        <button title="Weitere Aktionen" aria-label="Weitere Aktionen" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}><Glyph name="dots" size={15} /></button>
        {menu && <div class="cx-c-menu" role="menu">
          <button role="menuitem" onClick={() => act(images.length > 1 ? 'variantAll' : 'variant')}><Glyph name="refresh" size={14} />Variante erstellen</button>
          <button role="menuitem" onClick={() => act(images.length > 1 ? 'saveAll' : 'save')}><Glyph name="download" size={14} />Im Projekt speichern …</button>
          <button role="menuitem" onClick={() => act('reveal')}><Glyph name="folder" size={14} />Im Finder zeigen</button>
          <button role="menuitem" onClick={() => act('open')}><Glyph name="image" size={14} />In Vorschau öffnen</button>
          <button role="menuitem" disabled={!first.prompt} onClick={() => act('copyPrompt')}><Glyph name="copy" size={14} />Prompt kopieren</button>
        </div>}
      </div>
    </div>
  </div>;
}
