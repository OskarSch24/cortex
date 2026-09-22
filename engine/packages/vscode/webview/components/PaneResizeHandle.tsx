import { useEffect, useRef, useState } from 'preact/hooks';

export function storedPaneWidth(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(`cortex.pane.${key}`);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) && value >= 100 && value <= 3000 ? value : fallback;
  } catch { return fallback; }
}

export function savePaneWidth(key: string, value: number): void {
  try { localStorage.setItem(`cortex.pane.${key}`, String(value)); } catch { /* Storage can be unavailable in a temporary webview. */ }
}

/** A real measured parent width, including sidebar and window changes. */
export function usePaneBounds() {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, parent: 0 });
  // Das Element kann verschwinden und wiederkommen — die Einstellungen ersetzen
  // die Seitenleiste für eine Weile. Beobachtet wird deshalb, was gerade hängt.
  const observed = useRef<HTMLElement | null>(null);
  const observer = useRef<ResizeObserver>();
  useEffect(() => {
    const node = ref.current;
    if (node === observed.current) return;
    observer.current?.disconnect();
    observed.current = node;
    if (!node?.parentElement) return;
    const measure = () => { if (node.isConnected && node.parentElement) setBounds({ width: node.clientWidth, parent: node.parentElement.clientWidth }); };
    measure();
    observer.current = new ResizeObserver(measure);
    observer.current.observe(node); observer.current.observe(node.parentElement);
  });
  useEffect(() => () => observer.current?.disconnect(), []);
  return { ref, ...bounds };
}

export function PaneResizeHandle({ label, edge = 'left', value, min, max, initial, onChange }: {
  label: string; edge?: 'left' | 'right'; value: number; min: number; max: number; initial: number; onChange: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number }>();
  const limit = (width: number) => Math.round(Math.max(min, Math.min(Math.max(min, max), width)));
  const stop = () => { drag.current = undefined; document.body.classList.remove('cx-resizing-pane'); };
  useEffect(() => stop, []);
  return <div class={`cx-pane-resize ${edge}`} role="separator" aria-label={label} aria-orientation="vertical"
    aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={Math.max(min, Math.round(max))} tabIndex={0}
    title="Ziehen zum Anpassen · Doppelklick zum Zurücksetzen"
    onDblClick={() => onChange(limit(initial))}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const step = event.shiftKey ? 48 : 16;
      onChange(limit(event.key === 'Home' ? min : event.key === 'End' ? max : value + (event.key === 'ArrowRight' ? 1 : -1) * (edge === 'right' ? 1 : -1) * step));
    }}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault();
      drag.current = { x: event.clientX, width: value };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add('cx-resizing-pane');
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      onChange(limit(drag.current.width + (event.clientX - drag.current.x) * (edge === 'right' ? 1 : -1)));
    }}
    onPointerUp={event => { stop(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={stop} onLostPointerCapture={stop} />;
}
