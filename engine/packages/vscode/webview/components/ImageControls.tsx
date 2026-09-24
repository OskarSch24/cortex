import { useState } from 'preact/hooks';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { IMAGE_RATIOS, isImageProvider, type ImageOptions } from '../../src/panel/imageOptions.js';
import type { AccountStatusDto } from '../../src/panel/protocol.js';
import { IconChevron } from './icons.js';
import { BrandMark } from './brandIcons.js';
import { Glyph } from './CortexIcons.js';

/**
 * Die Felder des Bildmodus in der Eingabeleiste: Chip „Bild ×“, dann
 * Seitenverhältnis und Anzahl. Rechts, wo sonst das Modell steht, das
 * Bildmodell — nur der Anbieter. Welches seiner Konten drankommt, entscheidet
 * der Host: das größere zuerst, bei einem Limit das nächste.
 */

export const DEFAULT_IMAGE_OPTIONS: ImageOptions = { ratio: '1:1', count: 1 };

/** Wie der Anbieter im Bildmodus heißt: nach dem Bildmodell, nicht nach dem CLI. */
const IMAGE_MODEL_NAME: Record<string, string> = {
  codex: 'ChatGPT · GPT Image',
  grok: 'Grok Imagine',
};

export type ImageProviderId = 'codex' | 'grok';

/** Die Konten eines Anbieters, die im Bildmodus arbeiten können — in der Folge des Hosts. */
function imageAccountsOf(accounts: AccountStatusDto[], provider: string): AccountStatusDto[] {
  return accounts
    .filter((a) => a.provider === provider && isImageProvider(a.provider) && !a.reviewOnly && a.authState !== 'expired')
    .sort((a, b) => (a.imageRank ?? 99) - (b.imageRank ?? 99));
}

/** Anbieter mit mindestens einem Konto, das gerade Bilder erzeugen kann. */
export function imageProviders(accounts: AccountStatusDto[]): ImageProviderId[] {
  return (['codex', 'grok'] as const).filter((p) => imageAccountsOf(accounts, p).some((a) => a.available));
}

/** Der Anbieter ohne eigene Wahl: der des angehefteten Modells, sonst der erste mit Konto. */
export function defaultImageProvider(accounts: AccountStatusDto[], pinnedProvider?: string): ImageProviderId | undefined {
  const usable = imageProviders(accounts);
  return usable.find((p) => p === pinnedProvider) ?? usable[0];
}

function RatioShape({ ratio, size = 14 }: { ratio: string; size?: number }) {
  const [w, h] = ratio.split(':').map(Number) as [number, number];
  const k = size / Math.max(w, h);
  return <span class="cx-img-ratio" style={{ width: `${Math.max(4, Math.round(w * k))}px`, height: `${Math.max(4, Math.round(h * k))}px` }} aria-hidden="true" />;
}

function usePopup() {
  const [open, setOpen] = useState(false);
  const ref = useDismissiblePopup<HTMLDivElement>(open, () => setOpen(false));
  return { open, setOpen, ref };
}

export function ImageModeChip({ onExit }: { onExit: () => void }) {
  return (
    <span class="cx-img-chip">
      <Glyph name="image" size={14} />
      <span>Bild</span>
      <button type="button" class="cx-img-chip-x" title="Bildmodus verlassen" aria-label="Bildmodus verlassen" onClick={onExit}>×</button>
    </span>
  );
}

export function ImageOptionsBar({ options, onChange }: {
  options: ImageOptions;
  onChange: (next: ImageOptions) => void;
}) {
  const ratio = usePopup();
  const count = usePopup();
  const set = (patch: Partial<ImageOptions>) => onChange({ ...options, ...patch });
  return (
    <div class="cx-img-options">
      <div ref={ratio.ref} class="mode-menu cx-img-menu">
        <button type="button" class={`cx-img-opt ${ratio.open ? 'open' : ''}`} title="Seitenverhältnis" aria-haspopup="menu" aria-expanded={ratio.open} onClick={() => ratio.setOpen(!ratio.open)}>
          <RatioShape ratio={options.ratio} /><b>{options.ratio}</b><IconChevron size={10} />
        </button>
        {ratio.open && (
          <div class="menu-popup cx-img-popup" role="menu" aria-label="Seitenverhältnis">
            <div class="menu-label">Seitenverhältnis</div>
            <div class="cx-img-ratio-grid">
              {IMAGE_RATIOS.map((r) => (
                <button key={r} type="button" role="menuitemradio" aria-checked={r === options.ratio} class={`cx-img-ratio-cell ${r === options.ratio ? 'on' : ''}`} onClick={() => { set({ ratio: r }); ratio.setOpen(false); }}>
                  <RatioShape ratio={r} size={18} /><span>{r}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div ref={count.ref} class="mode-menu cx-img-menu">
        <button type="button" class={`cx-img-opt ${count.open ? 'open' : ''}`} title="Anzahl der Bilder" aria-haspopup="menu" aria-expanded={count.open} onClick={() => count.setOpen(!count.open)}>
          Anzahl <b>{options.count}</b>
        </button>
        {count.open && (
          <div class="menu-popup cx-img-popup cx-img-popup-count" role="menu" aria-label="Anzahl">
            <div class="menu-label">Anzahl</div>
            <div class="cx-img-count">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} type="button" role="menuitemradio" aria-checked={n === options.count} class={n === options.count ? 'on' : ''} onClick={() => { set({ count: n }); count.setOpen(false); }}>{n}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Eine Zeile je Anbieter. Darunter nichts: die Kontofolge steht klein rechts
 * („Side-Hustle › privat“), ein Klick auf ⇅ tauscht, wer zuerst drankommt.
 */
export function ImageModelPicker({ accounts, provider, onPick, onOrder }: {
  accounts: AccountStatusDto[];
  provider?: string;
  onPick: (provider: ImageProviderId) => void;
  onOrder: (provider: ImageProviderId, labels: string[]) => void;
}) {
  const { open, setOpen, ref } = usePopup();
  const label = provider ? IMAGE_MODEL_NAME[provider] ?? provider : 'Bildmodell wählen';
  const rows = (['codex', 'grok'] as const).map((p) => ({ provider: p, accounts: imageAccountsOf(accounts, p) })).filter((r) => r.accounts.length > 0);
  return (
    <div ref={ref} class="mode-menu model-picker cx-img-model">
      <button type="button" class={`mode-btn model-btn ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open} title="Bildmodell wählen" onClick={() => setOpen(!open)}>
        {provider && <span class="model-brand"><BrandMark provider={provider} size={12} /></span>}
        <span class="model-label">{label}</span>
        <IconChevron size={11} />
      </button>
      {open && (
        <div class="menu-popup model-popup cx-img-model-popup" role="menu" aria-label="Bildmodell">
          <div class="menu-label">Bildmodell</div>
          {rows.map((row) => {
            const on = provider === row.provider;
            const usable = row.accounts.some((a) => a.available);
            const order = row.accounts.map((a) => a.label);
            return (
              <div key={row.provider} class={`cx-img-model-row ${on ? 'on' : ''} ${usable ? '' : 'dim'}`}>
                <button type="button" class="cx-img-model-pick" role="menuitemradio" aria-checked={on} disabled={!usable} title={`Zuerst ${order[0]}${order.length > 1 ? `, bei Limit ${order.slice(1).join(', dann ')}` : ''}`} onClick={() => { onPick(row.provider); setOpen(false); }}>
                  <BrandMark provider={row.provider} size={13} />
                  <span class="cx-img-model-name">{IMAGE_MODEL_NAME[row.provider]}</span>
                  <span class="cx-img-model-order">{order.join(' › ')}</span>
                </button>
                {order.length > 1 && (
                  <button type="button" class="cx-img-model-swap" title="Reihenfolge der Konten tauschen" aria-label={`Reihenfolge der ${IMAGE_MODEL_NAME[row.provider]}-Konten tauschen`} onClick={() => onOrder(row.provider, [...order.slice(1), order[0]!])}>⇅</button>
                )}
                <span class="cx-img-model-check" aria-hidden="true">{on && <Glyph name="check" size={13} />}</span>
              </div>
            );
          })}
          {rows.length === 0 && <div class="cx-img-empty">Verbinde ein ChatGPT- oder Grok-Konto, um Bilder zu erstellen.</div>}
        </div>
      )}
    </div>
  );
}
