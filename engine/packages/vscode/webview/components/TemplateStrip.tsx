import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { useHostMessage } from '../hooks/useHostMessage.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import type { ArtifactTemplateCategory } from './templateCommands.js';

export type Template = Extract<HostToWebview, { kind: 'templates' }>['items'][number];
const CATEGORIES = [
  { id: 'dokument', label: 'Dokumente' },
  { id: 'praesentation', label: 'Präsentationen' },
  { id: 'tabelle', label: 'Tabellen' },
  { id: 'eigen', label: 'Eigene Vorlagen' },
];

/** Original previews and editable files share one manifest entry. */
export function TemplateStrip({ onPick, onClose, initialCategory = 'dokument', categoryRequest = 0 }: { onPick: (template: Template) => void; onClose: () => void; initialCategory?: ArtifactTemplateCategory; categoryRequest?: number }) {
  const [items, setItems] = useState<Template[]>([]);
  const [category, setCategory] = useState<string>(initialCategory);
  useLayoutEffect(() => { setCategory(initialCategory); }, [initialCategory, categoryRequest]);
  const [menu, setMenu] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  const rail = useRef<HTMLDivElement>(null);
  const menuRoot = useDismissiblePopup<HTMLDivElement>(menu, () => setMenu(false));
  const shown = items.filter(item => category === 'eigen' ? item.own : item.kind === category && !item.own);
  const landscape = category === 'praesentation' || category === 'tabelle';
  const measure = () => {
    const el = rail.current;
    if (el) setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useHostMessage('templates', msg => { setItems(msg.items); setLoaded(true); });
  useEffect(() => { vscode.postMessage({ kind: 'getTemplates' }); }, []);
  useLayoutEffect(() => {
    if (!rail.current) return;
    rail.current.scrollLeft = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail.current);
    return () => observer.disconnect();
  }, [category, items]);
  const scroll = (direction: number) => {
    const el = rail.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('.cx-template');
    const step = (card?.offsetWidth ?? 138) + 14;
    const count = Math.max(1, Math.floor(el.clientWidth / step));
    el.scrollBy({ left: direction * step * count, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return (
    <section class={`cx-templates ${landscape ? 'landscape' : 'portrait'}`} aria-label="Vorlagen">
      <div class="cx-templates-head">
        <div class="cx-template-category" ref={menuRoot}>
          <button class="cx-template-category-toggle" title="Vorlagenart auswählen" aria-label="Vorlagenart auswählen" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(value => !value)}>Vorlagen</button>
          {menu && <div class="cx-template-categories" role="menu" aria-label="Vorlagenart">
            {CATEGORIES.map(value => <button key={value.id} role="menuitemradio" aria-checked={category === value.id} onClick={() => { setCategory(value.id); setMenu(false); }}><span>{value.label}</span>{category === value.id && <Glyph name="check" size={14} />}</button>)}
            <button class="cx-template-manage" role="menuitem" onClick={() => { setMenu(false); vscode.postMessage({ kind: 'editTemplates' }); }}>Eigene Vorlage hinzufügen <Glyph name="plus" size={14} /></button>
          </div>}
        </div>
        <div class="cx-template-controls">
          <button class="cx-icon cx-template-prev" aria-label="Vorherige Vorlagen" disabled={edges.start} onClick={() => scroll(-1)}><Glyph name="chevron" size={16} /></button>
          <button class="cx-icon" aria-label="Weitere Vorlagen" disabled={edges.end} onClick={() => scroll(1)}><Glyph name="chevron" size={16} /></button>
          <button class="cx-icon" aria-label="Vorlagen schließen" onClick={onClose}><Glyph name="close" size={16} /></button>
        </div>
      </div>
      <div key={category} class="cx-template-row" ref={rail} onScroll={measure} aria-label={CATEGORIES.find(value => value.id === category)?.label}>
        {shown.map(item => (
          <button key={item.id ?? item.name} class={`cx-template ${item.aspectRatio ?? (landscape ? 'landscape' : 'portrait')}`} title={item.name} onClick={() => onPick(item)}>
            <span class="cx-template-sheet" aria-hidden="true">
              {item.previewUrl ? <img src={item.previewUrl} alt="" draggable={false} /> : <span class="cx-template-custom"><Glyph name={item.kind === 'tabelle' ? 'chart' : 'file'} size={26} /><strong>{item.name}</strong><span>{item.body.trim().slice(0, 260)}</span></span>}
            </span>
            <span class="cx-template-name">{item.name}</span>
          </button>
        ))}
        {!shown.length && <div class="cx-template-empty">{!loaded ? 'Vorlagen werden geladen …' : category === 'eigen' ? <><span>Noch keine eigenen Vorlagen.</span><button onClick={() => vscode.postMessage({ kind: 'editTemplates' })}>Vorlagenordner öffnen</button></> : 'Keine Vorlagen verfügbar.'}</div>}
      </div>
    </section>
  );
}
