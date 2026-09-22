/** @jsxImportSource react */
/**
 * Zwei Werkzeuge mehr in Excalidraws eigener Werkzeugleiste: Emoji und
 * SVG-Export. Excalidraw kennt keine Schnittstelle für eigene Werkzeuge in
 * dieser Leiste; die Knöpfe werden deshalb per Portal an die Zeile der
 * Formwerkzeuge gehängt — in der Desktop- wie in der schmalen Ansicht, die
 * Excalidraw unter etwa 730 px Breite zeigt — und wieder eingesetzt, wenn
 * Excalidraw die Leiste neu aufbaut. Aussehen: dieselben Klassen wie die
 * Werkzeuge daneben. Das Emoji-Fenster liegt über der ganzen Fläche, sonst
 * schnitte die schmale Leiste es ab.
 *
 * Die Emojis sind der vollständige Unicode-Satz (emoji-data.json); gezeichnet
 * werden sie auf dem Mac von Apple Color Emoji.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import emojiData from './emoji-data.json';

type Emoji = { e: string; n: string; g: number; t?: string; s?: string[] };
const EMOJIS = emojiData.emojis as Emoji[];
const GROUPS = emojiData.groups as Array<{ id: number; name: string }>;
const TONES = ['', '🏻', '🏼', '🏽', '🏾', '🏿'];
const RECENT_KEY = 'cortex.canvas.emoji.recent';
const TONE_KEY = 'cortex.canvas.emoji.tone';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ohne Speicher geht es auch */ } };

function EmojiPanel({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState(() => Number(read(TONE_KEY)) || 0);
  const [recent, setRecent] = useState<string[]>(() => { try { return JSON.parse(read(RECENT_KEY) ?? '[]'); } catch { return []; } });
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);

  const withTone = (e: Emoji) => (tone && e.s ? e.s[tone - 1]! : e.e);
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return undefined;
    return EMOJIS.filter(e => e.n.toLowerCase().includes(q) || e.t?.includes(q)).slice(0, 240);
  }, [query]);
  const pick = (emoji: string) => {
    const next = [emoji, ...recent.filter(r => r !== emoji)].slice(0, 24);
    setRecent(next);
    write(RECENT_KEY, JSON.stringify(next));
    onPick(emoji);
  };
  const cell = (e: Emoji) => <button key={e.e} type="button" className="cx-emoji-cell" title={e.n} aria-label={e.n} onClick={() => pick(withTone(e))}>{withTone(e)}</button>;

  return <div className="cx-emoji-panel" role="dialog" aria-label="Emoji einfügen" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="cx-emoji-top">
      <input ref={search} className="cx-emoji-search" type="search" placeholder="Emoji suchen" aria-label="Emoji suchen" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="cx-emoji-tones" role="radiogroup" aria-label="Hautton">
        {TONES.map((t, i) => <button key={i} type="button" role="radio" aria-checked={tone === i} aria-label={i ? `Hautton ${i}` : 'Standard-Hautton'} className={tone === i ? 'on' : ''} onClick={() => { setTone(i); write(TONE_KEY, String(i)); }}>{`✋${t}`}</button>)}
      </div>
    </div>
    {!found && <div className="cx-emoji-tabs" role="tablist" aria-label="Gruppen">
      {recent.length > 0 && <button type="button" role="tab" title="Zuletzt verwendet" aria-label="Zuletzt verwendet" onClick={() => scroller.current?.querySelector('#cx-emoji-recent')?.scrollIntoView()}>🕘</button>}
      {GROUPS.map(g => <button key={g.id} type="button" role="tab" title={g.name} aria-label={g.name} onClick={() => scroller.current?.querySelector(`#cx-emoji-g${g.id}`)?.scrollIntoView()}>{EMOJIS.find(e => e.g === g.id)?.e}</button>)}
    </div>}
    <div className="cx-emoji-scroll" ref={scroller}>
      {found
        ? found.length ? <div className="cx-emoji-grid">{found.map(cell)}</div> : <p className="cx-emoji-empty">Kein Emoji zu „{query}“.</p>
        : <>
          {recent.length > 0 && <section id="cx-emoji-recent"><h4>Zuletzt verwendet</h4><div className="cx-emoji-grid">
            {recent.map(e => <button key={e} type="button" className="cx-emoji-cell" aria-label={e} onClick={() => pick(e)}>{e}</button>)}
          </div></section>}
          {GROUPS.map(g => <section key={g.id} id={`cx-emoji-g${g.id}`}><h4>{g.name}</h4><div className="cx-emoji-grid">{EMOJIS.filter(e => e.g === g.id).map(cell)}</div></section>)}
        </>}
    </div>
  </div>;
}

const SMILE = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.6 14.2c.9 1.3 2 1.9 3.4 1.9s2.5-.6 3.4-1.9" /><path d="M9.2 9.6h.01M14.8 9.6h.01" strokeWidth="2.4" /></svg>;
const SVG_EXPORT = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5Z" /><path d="M14 3.5v5h5" /><path d="M12 11.5v6m-2.5-2.5 2.5 2.5 2.5-2.5" /></svg>;

const TIDY = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="7" height="6" rx="1.5" /><rect x="13.5" y="4" width="7" height="6" rx="1.5" /><rect x="3.5" y="14" width="7" height="6" rx="1.5" /><path d="M14 17h6m-2.5-2.5L20 17l-2.5 2.5" /></svg>;

export function ToolbarExtras({ root, onEmoji, onTidy, onSvg }: { root: HTMLElement; onEmoji: (emoji: string) => void; onTidy: () => void; onSvg: () => void }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = () => {
    const b = trigger.current?.getBoundingClientRect(), r = root.getBoundingClientRect();
    if (b) setAt({ top: b.bottom - r.top + 10, left: Math.max(8, Math.min(r.width - 352, b.right - r.left - 344)) });
    setOpen(v => !v);
  };
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'cx-xtools';
    const attach = () => {
      // Die Zeile, in der Rechteck, Raute, Pfeil … stehen.
      const bar = root.querySelector('.App-toolbar .ToolIcon.Shape')?.parentElement;
      if (bar && el.parentElement !== bar) { bar.appendChild(el); setSlot(el); }
    };
    attach();
    const watch = new MutationObserver(attach);
    watch.observe(root, { childList: true, subtree: true });
    return () => { watch.disconnect(); el.remove(); };
  }, [root]);
  useEffect(() => {
    if (!open || !slot) return;
    const outside = (e: PointerEvent) => { if (!slot.contains(e.target as Node) && !panel.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [open, slot]);
  if (!slot) return null;
  return <>{createPortal(<>
    <div className="App-toolbar__divider" />
    <button type="button" className={`ToolIcon ToolIcon_type_button ToolIcon_size_medium cx-xtool${open ? ' is-on' : ''}`} title="Emoji" aria-label="Emoji" aria-expanded={open} ref={trigger} onClick={toggle}>
      <div className="ToolIcon__icon">{SMILE}</div>
    </button>
    <button type="button" className="ToolIcon ToolIcon_type_button ToolIcon_size_medium cx-xtool" title="Aufräumen — nichts liegt mehr übereinander (⌘Z macht es rückgängig)" aria-label="Aufräumen" onClick={onTidy}>
      <div className="ToolIcon__icon">{TIDY}</div>
    </button>
    <button type="button" className="ToolIcon ToolIcon_type_button ToolIcon_size_medium cx-xtool" title="Als SVG sichern" aria-label="Als SVG sichern" onClick={onSvg}>
      <div className="ToolIcon__icon">{SVG_EXPORT}</div>
    </button>
  </>, slot)}
  {open && createPortal(<div ref={panel} className="cx-emoji-layer" style={{ top: at.top, left: at.left }}>
    <EmojiPanel onPick={e => { setOpen(false); onEmoji(e); }} onClose={() => { setOpen(false); trigger.current?.focus(); }} />
  </div>, root)}
  </>;
}
