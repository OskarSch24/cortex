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

export function PaneResizeHandle({ label, edge = 'left', value, min, max, initial, onChange, onDrag, onRelease }: {
  label: string; edge?: 'left' | 'right'; value: number; min: number; max: number; initial: number; onChange: (width: number) => void;
  /**
   * Freies Ziehen: die ungebremste Wunschbreite bei jeder Mausbewegung, ohne
   * Grenzen. Wer das übergibt, zeichnet selbst und entscheidet beim Loslassen
   * (`onRelease`), wo die Kante zur Ruhe kommt — so kann eine Fläche über ihre
   * Grenzen hinaus mitgehen und von dort weich einrasten, statt an der Grenze
   * stehen zu bleiben und dann zu springen. Tastatur und Doppelklick bleiben
   * bei `onChange` und den Grenzen.
   */
  onDrag?: (raw: number) => void;
  onRelease?: (raw: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; raw: number }>();
  const limit = (width: number) => Math.round(Math.max(min, Math.min(Math.max(min, max), width)));
  const stop = () => { drag.current = undefined; document.body.classList.remove('cx-resizing-pane'); };
  /** Loslassen, Abbruch oder verlorener Zeiger — die Fläche erfährt es genau einmal. */
  const finish = () => {
    const raw = drag.current?.raw;
    stop();
    if (raw !== undefined) onRelease?.(raw);
  };
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
      drag.current = { x: event.clientX, width: value, raw: value };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add('cx-resizing-pane');
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const raw = drag.current.width + (event.clientX - drag.current.x) * (edge === 'right' ? 1 : -1);
      drag.current.raw = raw;
      if (onDrag) onDrag(raw); else onChange(limit(raw));
    }}
    onPointerUp={event => { finish(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={finish} onLostPointerCapture={finish} />;
}
