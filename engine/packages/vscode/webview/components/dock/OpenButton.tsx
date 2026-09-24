import { useEffect, useRef, useState } from 'preact/hooks';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';

/** Dieselbe Regel wie `XCODE_FILE` im Host; die Webview lädt keine Node-Module. */
const XCODE_FILE = /(\.(swift|xcodeproj|xcworkspace|xcconfig|storyboard|xib|xcassets|entitlements|plist)|\/Package\.swift)$/i;

const OPEN_ITEMS: Array<{ id: 'default' | 'terminal' | 'xcode' | 'reveal' | 'saveAs'; label: string; rule?: boolean }> = [
  { id: 'default', label: 'Standardprogramm' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'xcode', label: 'In Xcode öffnen' },
  { id: 'reveal', label: 'Im Finder zeigen', rule: true },
  { id: 'saveAs', label: 'Sichern unter …' },
];

export function OpenButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const run = (action: typeof OPEN_ITEMS[number]['id']) => {
    setOpen(false);
    vscode.postMessage({ kind: 'fileAction', action, path });
  };
  return <div class="cx-dock-open" ref={root} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button class="cx-dock-open-main" title="Im Standardprogramm öffnen" onClick={() => run('default')}>
      <Glyph name="arrow" size={13} />Öffnen
    </button>
    <button class="cx-dock-open-more" aria-label="Weitere Wege, die Datei zu öffnen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Glyph name="chevron" size={11} />
    </button>
    {open && <div class="cx-dock-open-menu" role="menu">
      {OPEN_ITEMS.filter(item => item.id !== 'xcode' || XCODE_FILE.test(`/${path}`)).map(item => <button key={item.id} role="menuitem" class={item.rule ? 'ruled' : ''} onClick={() => run(item.id)}>{item.label}</button>)}
    </div>}
  </div>;
}
