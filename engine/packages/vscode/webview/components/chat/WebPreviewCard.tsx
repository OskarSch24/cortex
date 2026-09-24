import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icon.js';

/* ── Webvorschau ─────────────────────────────────────────────────────── */

const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s)\]>"'`]*/gi;

export function localUrls(text: string): string[] {
  const urls = [...text.matchAll(LOCAL_URL)].map(match => {
    const before = text[match.index! - 1];
    // Delimiters make the address unambiguous. Punctuation inside belongs to it.
    return before && '`<\"\'('.includes(before) ? match[0] : match[0].replace(/[.,;:!?]+$/, '');
  });
  return [...new Set(urls)].filter(value => {
    try { return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(new URL(value).hostname); } catch { return false; }
  });
}

/** Die erste lokale Adresse einer Antwort — das, was eine Webvorschau zeigen kann. */
export function localUrl(text: string): string | undefined {
  return localUrls(text)[0];
}

/** Die Karte unter einer Antwort, die eine laufende Website nennt. */
export function WebPreviewCard({ url, onOpenIn }: { url: string; onOpenIn: (app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setMenu(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);
  const pick = (app: 'cortex' | 'chrome' | 'safari' | 'default' | 'copy') => { setMenu(false); onOpenIn(app); };
  return (
    <div class="cx-c-card cx-c-web">
      <button type="button" class="cx-c-card-head" onClick={() => onOpenIn('cortex')} title={url}>
        <span class="cx-c-card-mark globe"><Icon name="globe" size={18} /></span>
        <span class="cx-c-card-title"><strong>Webvorschau</strong><small>{new URL(url).host}{new URL(url).pathname === '/' ? '' : new URL(url).pathname}</small></span>
      </button>
      <div class="cx-c-menu-anchor" ref={ref}>
        <button type="button" class="cx-c-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
          Öffnen in<Icon name="chevronDown" size={13} />
        </button>
        {menu && (
          <div class="cx-c-menu" role="menu">
            <button role="menuitem" onClick={() => pick('cortex')}><Icon name="globe" size={14} />Cortex-Browser</button>
            <button role="menuitem" onClick={() => pick('chrome')}><Icon name="globe" size={14} />Google Chrome</button>
            <button role="menuitem" onClick={() => pick('safari')}><Icon name="globe" size={14} />Safari</button>
            <div class="cx-c-menu-rule" />
            <button role="menuitem" onClick={() => pick('copy')}><Icon name="link" size={14} />Link kopieren</button>
          </div>
        )}
      </div>
    </div>
  );
}
