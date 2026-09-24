import type { ComponentChildren, RefObject } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Glyph } from '../components/CortexIcons.js';

/**
 * Die Bausteine der Einstellungsseiten.
 *
 * Aufbau und Maße folgen der Codex-Aufnahme vom 13.09.2026 (vermessen an
 * Vollauflösungs-Frames, siehe docs/CODEX_EINSTELLUNGEN.md); Flächen, Linien,
 * Schrift und Akzent kommen aus den Cortex-Tokens. Eine Zeile ist immer
 * Titel + grauer Untertitel links, das Steuerelement rechts.
 */

export function Page({ title, subtitle, actions, preview, children, wide }: {
  title: string;
  subtitle?: ComponentChildren;
  actions?: ComponentChildren;
  /** Die ganze Seite speichert nur — Cortex hat die Funktion dahinter noch nicht. */
  preview?: boolean;
  wide?: boolean;
  children: ComponentChildren;
}) {
  return <div class={`cxs-page ${wide ? 'wide' : ''}`}>
    <header class="cxs-page-head">
      <div>
        <h1>{title}{preview && <span class="cxs-preview" title="Cortex speichert diese Werte schon, die Funktion dahinter folgt noch.">Vorschau</span>}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div class="cxs-page-actions">{actions}</div>}
    </header>
    {children}
  </div>;
}

export function Section({ title, subtitle, actions, children, big }: {
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  actions?: ComponentChildren;
  big?: boolean;
  children?: ComponentChildren;
}) {
  return <section class="cxs-section">
    {(title || actions) && <div class={`cxs-section-head ${big ? 'big' : ''} ${subtitle ? 'has-sub' : ''}`}>
      <div>{title && <h2>{title}</h2>}{subtitle && <p>{subtitle}</p>}</div>
      {actions && <div class="cxs-section-actions">{actions}</div>}
    </div>}
    {children}
  </section>;
}

export function Card({ children, class: klass = '' }: { children: ComponentChildren; class?: string }) {
  return <div class={`cxs-card ${klass}`}>{children}</div>;
}

export function Row({ title, sub, children, pending, icon, class: klass = '', onClick }: {
  title: ComponentChildren;
  sub?: ComponentChildren;
  children?: ComponentChildren;
  /** Wird gespeichert, wirkt aber noch nicht. */
  pending?: boolean;
  icon?: ComponentChildren;
  class?: string;
  onClick?: () => void;
}) {
  return <div class={`cxs-row ${icon ? 'has-icon' : ''} ${onClick ? 'clickable' : ''} ${klass}`} onClick={onClick}>
    {icon && <div class="cxs-row-icon">{icon}</div>}
    <div class="cxs-row-text">
      <div class="cxs-row-title">{title}{pending && <i class="cxs-pending" title="Gespeichert – Cortex nutzt diesen Wert noch nicht." aria-label="noch ohne Wirkung" />}</div>
      {sub && <div class="cxs-row-sub">{sub}</div>}
    </div>
    {children !== undefined && <div class="cxs-row-control">{children}</div>}
  </div>;
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange?: (on: boolean) => void; disabled?: boolean; label?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} class={`cxs-toggle ${on ? 'on' : ''}`} disabled={disabled} onClick={e => { e.stopPropagation(); onChange?.(!on); }}><i /></button>;
}

export interface Option<T extends string = string> { value: T; label: string; hint?: string; icon?: ComponentChildren; disabled?: boolean }

/** Schließt ein Menü bei Klick daneben oder Escape. */
export function useDismiss<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return ref;
}

/** Keep menus outside clipped cards/tables, while retaining their trigger and focus. */
function SelectPopup({ anchor, align, label, id, multiple, close, children }: {
  anchor: RefObject<HTMLDivElement>;
  align: 'left' | 'right';
  label?: string;
  id: string;
  multiple?: boolean;
  close: (restoreFocus?: boolean) => void;
  children: ComponentChildren;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, minWidth: 0, maxWidth: innerWidth - 16, maxHeight: 320, visibility: 'hidden' as 'hidden' | 'visible' });
  useLayoutEffect(() => {
    const trigger = anchor.current?.querySelector<HTMLButtonElement>('.cxs-select-button');
    const popup = menu.current;
    if (!trigger || !popup) return;
    const place = () => {
      const box = trigger.getBoundingClientRect();
      const margin = 8, gap = 4;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft ?? 0) + margin;
      const topEdge = (viewport?.offsetTop ?? 0) + margin;
      const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - margin * 2;
      const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - margin * 2;
      if (box.bottom < topEdge || box.top > bottomEdge) { close(); return; }
      const width = Math.min(Math.max(box.width, popup.getBoundingClientRect().width), rightEdge - leftEdge);
      const height = Math.min(popup.scrollHeight + 2, 320);
      const below = Math.max(0, bottomEdge - box.bottom - gap);
      const above = Math.max(0, box.top - topEdge - gap);
      const down = height <= below || below >= above;
      const maxHeight = Math.min(320, down ? below : above);
      const top = down ? box.bottom + gap : box.top - gap - Math.min(height, maxHeight);
      const left = Math.max(leftEdge, Math.min(align === 'right' ? box.right - width : box.left, rightEdge - width));
      setPosition({ left, top: Math.max(topEdge, top), minWidth: Math.min(box.width, rightEdge - leftEdge), maxWidth: rightEdge - leftEdge, maxHeight, visibility: 'visible' });
    };
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !popup.contains(event.target as Node)) close();
    };
    const scrolled = (event: Event) => { if (!popup.contains(event.target as Node)) place(); };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(popup);
    resize.observe(trigger);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', scrolled, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      resize.disconnect();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('scroll', scrolled, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [align]);
  useLayoutEffect(() => {
    // Focusing a still-hidden measuring surface is ignored by the browser.
    if (position.visibility !== 'visible' || !menu.current) return;
    const popup = menu.current;
    const selected = popup.querySelector<HTMLButtonElement>('.cxs-menu-item[aria-selected="true"]:not(:disabled)') ?? popup.querySelector<HTMLButtonElement>('.cxs-menu-item:not(:disabled)');
    selected?.focus({ preventScroll: true });
    if (selected) popup.scrollTop = Math.max(0, selected.offsetTop - popup.clientHeight / 2);
  }, [position.visibility]);
  return createPortal(<div ref={menu} id={id} class="cxs-menu cxs-menu-floating" role="listbox" aria-label={label} aria-multiselectable={multiple || undefined} style={position} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab') {
      // Return to the anchor before the browser moves to its next/previous control.
      anchor.current?.querySelector<HTMLButtonElement>('.cxs-select-button')?.focus({ preventScroll: true });
      close();
      return;
    }
    const options = [...(menu.current?.querySelectorAll<HTMLButtonElement>('.cxs-menu-item:not(:disabled)') ?? [])];
    const current = options.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (current + 1) % options.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    if (next >= 0 && options[next]) {
      event.preventDefault(); event.stopPropagation();
      options[next]!.focus({ preventScroll: true });
      options[next]!.scrollIntoView({ block: 'nearest' });
    }
  }}>{children}</div>, document.body);
}

export function Select<T extends string>({ value, options, onChange, disabled, icon, label, align = 'right', width, placeholder }: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  icon?: ComponentChildren;
  label?: string;
  align?: 'left' | 'right';
  width?: number;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) ref.current?.querySelector<HTMLButtonElement>('.cxs-select-button')?.focus({ preventScroll: true });
  };
  const current = options.find(o => o.value === value);
  return <div class="cxs-select" ref={ref}>
    <button type="button" class="cxs-select-button" aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-expanded={open} aria-label={label} disabled={disabled} style={width ? { width } : undefined} onClick={e => { e.stopPropagation(); setOpen(v => !v); }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
    }}>
      {icon ?? current?.icon}
      <span>{current?.label ?? placeholder ?? value}</span>
      <Glyph name="chevronDown" size={12} />
    </button>
    {open && <SelectPopup anchor={ref} align={align} label={label} id={id} close={close}>
      {options.map(o => <button type="button" role="option" key={o.value} aria-selected={o.value === value} disabled={o.disabled} class="cxs-menu-item" onClick={e => { e.stopPropagation(); close(true); onChange(o.value); }}>
        {o.icon}
        <span>{o.label}{o.hint && <small>{o.hint}</small>}</span>
        {o.value === value && <Glyph name="check" size={14} />}
      </button>)}
    </SelectPopup>}
  </div>;
}

export function MultiSelect({ values, options, onChange, label }: { values: string[]; options: Option[]; onChange: (values: string[]) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) ref.current?.querySelector<HTMLButtonElement>('.cxs-select-button')?.focus({ preventScroll: true });
  };
  return <div class="cxs-select" ref={ref}>
    <button type="button" class="cxs-select-button" aria-haspopup="listbox" aria-controls={open ? id : undefined} aria-expanded={open} aria-label={label} onClick={() => setOpen(v => !v)} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      if (event.key === 'Escape' && open) { event.preventDefault(); close(true); }
    }}><span>{values.length} ausgewählt</span><Glyph name="chevronDown" size={12} /></button>
    {open && <SelectPopup anchor={ref} align="right" label={label} id={id} multiple close={close}>
      {options.map(o => {
        const on = values.includes(o.value);
        return <button type="button" role="option" key={o.value} class="cxs-menu-item" aria-selected={on} disabled={o.disabled} onClick={event => { event.stopPropagation(); onChange(on ? values.filter(v => v !== o.value) : [...values, o.value]); }}><span>{o.label}{o.hint && <small>{o.hint}</small>}</span>{on && <Glyph name="check" size={14} />}</button>;
      })}
    </SelectPopup>}
  </div>;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Option<T>[]; onChange: (value: T) => void; label?: string }) {
  return <div class="cxs-segmented" role="radiogroup" aria-label={label}>
    {options.map(o => <button type="button" key={o.value} role="radio" aria-checked={o.value === value} class={o.value === value ? 'on' : ''} disabled={o.disabled} onClick={e => { e.stopPropagation(); onChange(o.value); }}>{o.icon}{o.label}</button>)}
  </div>;
}

export function Button({ children, onClick, kind = 'default', icon, disabled, title }: {
  children?: ComponentChildren;
  onClick?: () => void;
  kind?: 'default' | 'primary' | 'danger' | 'ghost' | 'outline';
  icon?: string;
  disabled?: boolean;
  title?: string;
}) {
  return <button type="button" class={`cxs-button ${kind}`} disabled={disabled} title={title} onClick={e => { e.stopPropagation(); onClick?.(); }}>{icon && <Glyph name={icon} size={14} />}{children}</button>;
}

export function TextField({ value, onCommit, placeholder, width, mono, suffix, type = 'text', min, max, label }: {
  value: string | number;
  onCommit: (value: string) => void;
  placeholder?: string;
  width?: number;
  mono?: boolean;
  suffix?: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  label?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { if (draft !== String(value)) onCommit(draft); };
  return <span class="cxs-field-wrap">
    <input class={`cxs-field ${mono ? 'mono' : ''}`} aria-label={label} style={width ? { width } : undefined} type={type} min={min} max={max} value={draft} placeholder={placeholder}
      onInput={e => setDraft(e.currentTarget.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} />
    {suffix && <span class="cxs-field-suffix">{suffix}</span>}
  </span>;
}

export function TextArea({ value, onCommit, placeholder, rows = 4, mono, label }: { value: string; onCommit: (value: string) => void; placeholder?: string; rows?: number; mono?: boolean; label?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <textarea class={`cxs-textarea ${mono ? 'mono' : ''}`} aria-label={label} rows={rows} value={draft} placeholder={placeholder} onInput={e => setDraft(e.currentTarget.value)} onBlur={() => { if (draft !== value) onCommit(draft); }} />;
}

export function Slider({ value, min = 0, max = 100, onChange, label }: { value: number; min?: number; max?: number; onChange: (value: number) => void; label?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const pct = ((draft - min) / (max - min)) * 100;
  return <span class="cxs-slider">
    <input type="range" aria-label={label} min={min} max={max} value={draft} style={{ '--pct': `${pct}%` }} onInput={e => setDraft(Number(e.currentTarget.value))} onChange={e => onChange(Number(e.currentTarget.value))} />
    <b>{draft}</b>
  </span>;
}

export function ColorField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return <label class={`cxs-color ${valid && luminance(draft) > 0.6 ? 'bright' : ''}`} style={valid ? { '--swatch': draft } : undefined}>
    <input type="color" aria-label={label ? `${label} wählen` : undefined} value={valid ? draft : '#000000'} onInput={e => { const v = e.currentTarget.value.toUpperCase(); setDraft(v); }} onChange={e => onChange(e.currentTarget.value.toUpperCase())} />
    <i />
    <input type="text" aria-label={label} value={draft} spellcheck={false} onInput={e => setDraft(e.currentTarget.value)} onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(draft) && draft !== value) onChange(draft.toUpperCase()); else setDraft(value); }} />
  </label>;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function Tabs<T extends string>({ value, tabs, onChange }: { value: T; tabs: Array<{ id: T; label: string; count?: number }>; onChange: (id: T) => void }) {
  return <div class="cxs-tabs" role="tablist">
    {tabs.map(t => <button type="button" role="tab" key={t.id} aria-selected={t.id === value} class={t.id === value ? 'on' : ''} onClick={() => onChange(t.id)}>{t.label}{t.count !== undefined && <span>{t.count}</span>}</button>)}
  </div>;
}

export function Empty({ children, icon, action }: { children: ComponentChildren; icon?: ComponentChildren; action?: ComponentChildren }) {
  return <div class={`cxs-empty ${icon || action ? 'tall' : ''}`}>{icon && <div class="cxs-empty-icon">{icon}</div>}<div>{children}</div>{action}</div>;
}

export function Search({ value, onInput, placeholder, class: klass = '' }: { value: string; onInput: (value: string) => void; placeholder: string; class?: string }) {
  return <label class={`cxs-search ${klass}`}><Glyph name="search" size={14} /><input value={value} placeholder={placeholder} aria-label={placeholder} onInput={e => onInput(e.currentTarget.value)} /></label>;
}

export function Radio({ checked, onChange, children, icon, sub }: { checked: boolean; onChange: () => void; children: ComponentChildren; icon?: string; sub?: ComponentChildren }) {
  return <label class="cxs-radio">
    <input type="radio" checked={checked} onChange={onChange} />
    <i />
    {icon && <Glyph name={icon} size={16} />}
    <span>{children}{sub && <small>{sub}</small>}</span>
  </label>;
}

/** Ein Knopf nur aus Symbol; die Beschriftung steht im Tooltip und für Screenreader. */
export function IconButton({ icon, label, size = 14, onClick }: { icon: string; label: string; size?: number; onClick?: () => void }) {
  return <button type="button" class="cxs-icon-button" aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.(); }}><Glyph name={icon} size={size} /></button>;
}

/** Schlichte Umschalter ohne Tab-Rolle, etwa für Zeiträume oder Gruppierungen. */
export function PlainTabs<T extends string | number>({ value, options, onChange, class: klass }: { value: T; options: Array<{ value: T; label: ComponentChildren }>; onChange: (value: T) => void; class?: string }) {
  return <div class={klass ? `cxs-plain-tabs ${klass}` : 'cxs-plain-tabs'}>{options.map(o => <button type="button" key={o.value} class={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

export function Link({ children, onClick }: { children: ComponentChildren; onClick: () => void }) {
  return <button type="button" class="cxs-link" onClick={e => { e.stopPropagation(); onClick(); }}>{children}</button>;
}
