import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { ImageOptions, ImageRegion } from '../../src/panel/imageOptions.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { Glyph } from './CortexIcons.js';
import { selectionRegion, type WorkspaceImage } from './imageWorkspaceState.js';
import { PaneResizeHandle, storedPaneWidth, savePaneWidth, usePaneBounds } from './PaneResizeHandle.js';

type Tool = 'comment' | 'remove' | 'resize';
export function ImageWorkspace({ images, path, title, selected, split, running, onPath, onSelect, onClose, onSplit, onAction, onEdit, onResize }: {
  images: WorkspaceImage[];
  path: string;
  title: string;
  selected: string[];
  split: boolean;
  running: boolean;
  onPath: (path: string) => void;
  onSelect: (paths: string[]) => void;
  onClose: () => void;
  onSplit: () => void;
  onAction: (action: 'open' | 'save' | 'saveAll' | 'reveal' | 'copy', image: WorkspaceImage, paths?: string[]) => void;
  onEdit: (image: WorkspaceImage, text: string, edit?: ImageOptions['edit']) => void;
  onResize: (image: WorkspaceImage, width: number, height: number) => void;
}) {
  const current = images.find(i => i.path === path) ?? images[0]!;
  const index = images.indexOf(current);
  const [gallery, setGallery] = useState(false);
  const [multi, setMulti] = useState(false);
  const [tool, setTool] = useState<Tool>();
  const [region, setRegion] = useState<ImageRegion>();
  const [comment, setComment] = useState('');
  const [zoom, setZoom] = useState<number>();
  const [natural, setNatural] = useState({ width: 1024, height: 1024 });
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [popup, setPopup] = useState<'open' | 'zoom'>();
  const popupRef = useDismissiblePopup<HTMLDivElement>(!!popup, () => setPopup(undefined));
  const [size, setSize] = useState({ width: 1024, height: 1024 });
  const [locked, setLocked] = useState(true);
  const workspaceBounds = usePaneBounds();
  const workspaceRef = workspaceBounds.ref;
  const [splitWidth, setSplitWidth] = useState(() => storedPaneWidth('image', 0));
  const parentWidth = workspaceBounds.parent || 1000;
  const splitMax = Math.max(280, parentWidth - 220);
  const shownSplitWidth = Math.max(280, Math.min(splitMax, splitWidth || parentWidth * .62));
  const [composerInset, setComposerInset] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number }>();
  const pan = useRef<{ x: number; y: number; left: number; top: number }>();
  const fit = Math.min((viewport.width - 24) / natural.width, (viewport.height - composerInset - 16) / natural.height, 1);
  const scale = zoom === undefined ? Math.max(.05, fit) : zoom / 100;
  const percent = Math.round(scale * 100);

  useLayoutEffect(() => {
    const parent = workspaceRef.current?.parentElement;
    if (!parent || !split) return;
    parent.style.setProperty('--cx-image-split-width', `${shownSplitWidth}px`);
    return () => parent.style.removeProperty('--cx-image-split-width');
  }, [split, shownSplitWidth]);

  useLayoutEffect(() => {
    const composer = workspaceRef.current?.parentElement?.querySelector<HTMLElement>(':scope > .cx-compose-area');
    if (split || !composer) { setComposerInset(0); return; }
    // The canvas extends behind the floating composer. Only fitting and the
    // trailing scroll space reserve room so every image edge stays reachable.
    const measure = () => setComposerInset(composer.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(composer);
    return () => observer.disconnect();
  }, [split]);

  useLayoutEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setViewport({ width: node.clientWidth, height: node.clientHeight }));
    observer.observe(node);
    return () => observer.disconnect();
  }, [gallery]);
  useEffect(() => {
    // A variant changes the selection, not the user's inspection viewport.
    // Keep zoom/scroll; the browser clamps pan if the next image is smaller.
    setRegion(undefined); setTool(undefined); setComment('');
  }, [current.path]);
  useLayoutEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || popup) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (tool) { setTool(undefined); setRegion(undefined); } else onClose(); return; }
      if ((event.target as HTMLElement)?.closest('textarea, input, [contenteditable="true"]')) return;
      if (event.key === 'ArrowRight' && index < images.length - 1) { event.preventDefault(); onPath(images[index + 1]!.path); }
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onPath(images[index - 1]!.path); }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(Math.min(400, percent + 25)); }
      if (event.key === '-') { event.preventDefault(); setZoom(Math.max(10, percent - 25)); }
      if (event.key === '0') { event.preventDefault(); setZoom(undefined); }
    };
    document.addEventListener('keydown', key, true);
    return () => document.removeEventListener('keydown', key, true);
  }, [index, tool, percent, images, onClose, popup]);

  const choose = (image: WorkspaceImage) => {
    onPath(image.path);
    onSelect(multi ? selected.includes(image.path) ? selected.filter(p => p !== image.path) : [...selected, image.path] : [image.path]);
  };
  const point = (event: PointerEvent) => {
    const box = pictureRef.current!.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
  };
  const finishSelection = (event: PointerEvent) => {
    if (!drag.current) return;
    let next = selectionRegion(drag.current, point(event));
    if (next.width < .005 || next.height < .005) {
      const p = point(event);
      next = selectionRegion({ x: p.x - .035, y: p.y - .035 }, { x: p.x + .035, y: p.y + .035 });
    }
    setRegion(next); drag.current = undefined;
  };
  const pickTool = (next: Tool) => { setTool(tool === next ? undefined : next); setRegion(undefined); setComment(''); if (next === 'resize') setSize(natural); };
  const apply = () => {
    if (tool === 'resize') { onResize(current, size.width, size.height); setTool(undefined); return; }
    if (!region || (tool === 'comment' && !comment.trim())) return;
    onEdit(current, tool === 'remove' ? 'Entferne das Objekt im markierten Bereich.' : comment.trim(), { kind: tool === 'remove' ? 'remove' : 'comment', region });
    setTool(undefined); setRegion(undefined); setComment('');
  };
  const dimension = (key: 'width' | 'height', value: number) => {
    if (!Number.isFinite(value)) return;
    const n = Math.min(8192, Math.max(1, Math.round(value)));
    const other = key === 'width' ? 'height' : 'width';
    setSize(s => ({ ...s, [key]: n, ...(locked ? { [other]: Math.min(8192, Math.max(1, Math.round(n * natural[other] / natural[key]))) } : {}) }));
  };

  return <section ref={workspaceRef} class={`cx-image-workspace ${gallery ? 'gallery' : ''}`} style={{ '--cx-image-composer-inset': `${composerInset}px` }} aria-label="Bildbearbeitung">
    {split && <PaneResizeHandle label="Breite der Bildansicht" value={shownSplitWidth} min={280} max={splitMax} initial={parentWidth * .62}
      onChange={width => { setSplitWidth(width); savePaneWidth('image', width); }} />}
    <header class="cx-image-header">
      <div class="cx-image-tab"><Glyph name="image" size={15} /><span title={title}>{title}</span><button class="cx-icon" aria-label="Bildansicht schließen" title="Zurück zum Chat" onClick={onClose}><Glyph name="close" size={13} /></button></div>
      <div class="cx-image-header-actions">
        <div class="cx-image-pop-anchor" ref={popup === 'open' ? popupRef : undefined}>
          <button class="cx-image-open-in" aria-expanded={popup === 'open'} onClick={() => setPopup(popup === 'open' ? undefined : 'open')}><Glyph name="image" size={14} />Öffnen<Glyph name="chevron" size={11} /></button>
          {popup === 'open' && <div class="cx-image-pop" role="menu">
            <button role="menuitem" onClick={() => { onAction('open', current); setPopup(undefined); }}>In Vorschau öffnen</button>
            <button role="menuitem" onClick={() => { onAction('reveal', current); setPopup(undefined); }}>Im Finder zeigen</button>
            <button role="menuitem" onClick={() => { onAction('save', current); setPopup(undefined); }}>Sichern unter …</button>
            <button role="menuitem" onClick={() => { onAction('copy', current); setPopup(undefined); }}>Bild kopieren</button>
          </div>}
        </div>
        <button class="cx-icon" title={multi && selected.length > 1 ? 'Ausgewählte Bilder speichern' : 'Bild speichern'} aria-label="Bild speichern" onClick={() => onAction(multi && selected.length > 1 ? 'saveAll' : 'save', multi && selected.length ? images.find(image => image.path === selected[0]) ?? current : current, selected)}><Glyph name="download" size={18} /></button>
        <button class={`cx-icon ${split ? 'selected' : ''}`} title={split ? 'Bildansicht vergrößern' : 'Neben Chat anzeigen'} aria-label={split ? 'Bildansicht vergrößern' : 'Neben Chat anzeigen'} onClick={onSplit}><Glyph name={split ? 'expand' : 'panel'} size={17} /></button>
      </div>
    </header>
    <div class="cx-image-toolbar">
      <div class="cx-image-view-toggle" role="group" aria-label="Bildansicht">
        <button class={!gallery ? 'on' : ''} aria-label="Einzelansicht" aria-pressed={!gallery} title="Einzelansicht" onClick={() => { setGallery(false); setTool(undefined); }}><Glyph name="image" size={15} /></button>
        <button class={gallery ? 'on' : ''} aria-label="Galerie" aria-pressed={gallery} title="Galerie" onClick={() => { setGallery(true); setTool(undefined); }}><Glyph name="sites" size={15} /></button>
      </div>
      <div class="cx-image-tools" role="toolbar" aria-label="Bildwerkzeuge">
        <button class={tool === 'comment' ? 'on' : ''} aria-pressed={tool === 'comment'} onClick={() => { if (gallery) { setGallery(false); onSelect([current.path]); } pickTool('comment'); }}><Glyph name="comment" size={14} />Kommentieren</button>
        {gallery ? <button class={multi ? 'on' : ''} aria-pressed={multi} onClick={() => { setMulti(!multi); if (multi) onSelect([current.path]); }}><Glyph name="select" size={14} />Mehrfachauswahl</button> : <>
          <button disabled={running} onClick={() => onEdit(current, 'Entferne den Hintergrund und stelle das Motiv frei.', { kind: 'background' })}><Glyph name="background" size={14} />HG entfernen</button>
          <button class={tool === 'remove' ? 'on' : ''} aria-pressed={tool === 'remove'} onClick={() => pickTool('remove')}><Glyph name="eraser" size={14} />Entfernen</button>
          <button class={tool === 'resize' ? 'on' : ''} aria-pressed={tool === 'resize'} onClick={() => pickTool('resize')}><Glyph name="resize" size={14} />Größe ändern</button>
        </>}
      </div>
      <div class="cx-image-zoom cx-image-pop-anchor" ref={popup === 'zoom' ? popupRef : undefined}>
        <button aria-label="Zoom" aria-expanded={popup === 'zoom'} onClick={() => setPopup(popup === 'zoom' ? undefined : 'zoom')}>{gallery ? 100 : percent} %<Glyph name="chevron" size={10} /></button>
        {popup === 'zoom' && <div class="cx-image-pop" role="menu" aria-label="Zoom">
          {[undefined, 25, 50, 75, 100, 150, 200, 300, 400].map(value => <button role="menuitemradio" aria-checked={zoom === value} onClick={() => { setZoom(value); setGallery(false); setPopup(undefined); }}>{value === undefined ? 'Einpassen' : `${value} %`}</button>)}
        </div>}
      </div>
    </div>
    {gallery ? <div class="cx-image-gallery" aria-label="Bilder dieser Aufgabe">
      {images.map((image, i) => <figure key={image.path}>
        {image.at && <figcaption>{new Date(image.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</figcaption>}
        <button class={selected.includes(image.path) ? 'selected' : ''} aria-label={`Bild ${i + 1} auswählen`} aria-pressed={selected.includes(image.path)} onClick={() => choose(image)} onDblClick={() => { onPath(image.path); setGallery(false); }}><img src={image.src} alt={image.prompt ?? `Bild ${i + 1}`} draggable={false} />{multi && <span class="cx-image-selection-check">{selected.includes(image.path) && <Glyph name="check" size={14} />}</span>}</button>
      </figure>)}
    </div> : <div class="cx-image-viewer">
      <nav class="cx-image-thumbs" aria-label="Bildverlauf">
        {images.map((image, i) => <button key={image.path} class={image.path === current.path ? 'selected' : ''} aria-label={`Bild ${i + 1} anzeigen`} aria-current={image.path === current.path ? 'true' : undefined} onClick={() => onPath(image.path)}><img src={image.src} alt={`Bild ${i + 1}`} draggable={false} /></button>)}
      </nav>
      <div class={`cx-image-canvas ${tool === 'comment' || tool === 'remove' ? 'selecting' : ''}`} ref={canvasRef}
        onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoom(Math.min(400, Math.max(10, percent - Math.sign(event.deltaY) * 10))); } }}
        onPointerDown={event => { if (tool === 'comment' || tool === 'remove' || event.button !== 0) return; const node = event.currentTarget; pan.current = { x: event.clientX, y: event.clientY, left: node.scrollLeft, top: node.scrollTop }; node.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (!pan.current) return; event.currentTarget.scrollLeft = pan.current.left + pan.current.x - event.clientX; event.currentTarget.scrollTop = pan.current.top + pan.current.y - event.clientY; }}
        onPointerUp={() => { pan.current = undefined; }} onPointerCancel={() => { pan.current = undefined; }}>
        <div class="cx-image-canvas-inner" style={{ width: `${Math.max(viewport.width, natural.width * scale + 24)}px`, minHeight: `${Math.max(viewport.height, natural.height * scale + composerInset + 16)}px` }}>
          <div class="cx-image-picture" ref={pictureRef} style={{ width: `${natural.width * scale}px`, height: `${natural.height * scale}px` }}
            onPointerDown={event => { if ((tool !== 'comment' && tool !== 'remove') || event.button !== 0) return; event.preventDefault(); drag.current = point(event); setRegion(undefined); event.currentTarget.setPointerCapture(event.pointerId); }}
            onPointerMove={event => { if (drag.current) setRegion(selectionRegion(drag.current, point(event))); }}
            onPointerUp={finishSelection} onPointerCancel={() => { drag.current = undefined; setRegion(undefined); }}>
            <img key={current.path} src={current.src} alt={current.prompt ?? 'Generiertes Bild'} draggable={false} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} />
            {region && <div class="cx-image-region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}><span>1</span></div>}
          </div>
        </div>
      </div>
    </div>}
    {tool && <div class="cx-image-tool-panel" role="region" aria-label={tool === 'resize' ? 'Bildgröße' : 'Bildauswahl'}>
      <button class="cx-icon cx-image-tool-close" aria-label="Werkzeug schließen" onClick={() => { setTool(undefined); setRegion(undefined); }}><Glyph name="close" size={14} /></button>
      {tool === 'resize' ? <><span>Bildgröße</span><div class="cx-image-dimensions"><label>Breite<input type="number" min="1" max="8192" value={size.width} onInput={e => dimension('width', e.currentTarget.valueAsNumber)} /></label><button class={`cx-icon ${locked ? 'selected' : ''}`} aria-label="Seitenverhältnis beibehalten" aria-pressed={locked} onClick={() => setLocked(!locked)}><Glyph name="link" size={16} /></button><label>Höhe<input type="number" min="1" max="8192" value={size.height} onInput={e => dimension('height', e.currentTarget.valueAsNumber)} /></label><small>px</small></div><button class="cx-image-apply" disabled={running} onClick={apply}>Größe ändern</button></>
        : <><span>{region ? 'Bereich 1 ausgewählt' : tool === 'remove' ? 'Markiere den Bereich, den du entfernen möchtest.' : 'Klicke ins Bild oder ziehe einen Bereich auf.'}</span>{tool === 'comment' && <textarea aria-label="Bildkommentar" placeholder="Was soll hier geändert werden?" value={comment} onInput={e => setComment(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); apply(); } if (e.key === 'Escape') { setTool(undefined); setRegion(undefined); } }} />}<button class="cx-image-apply" disabled={running || !region || (tool === 'comment' && !comment.trim())} onClick={apply}>{tool === 'remove' ? 'Auswahl entfernen' : 'Änderung senden'}<Glyph name="arrowUp" size={15} /></button></>}
    </div>}
  </section>;
}
