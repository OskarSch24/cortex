/**
 * Bausteine der Chat-Widgets. Maße aus dem Entwurf „Cortex Chat-Widgets“
 * (docs/design/cortex-widgets), der seine Werte aus dem Abschnitt „Chat nach
 * Codex“ in media/cortex.css hat: Karte wie `.cx-c-card`, Kopf 12/12/12/14,
 * Marke 36 px, Titel 15/21, Unterzeile 13,5/19.
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Tone, WidgetAction } from './spec.js';

export const TONE: Record<Tone, string> = {
  pos: '#88b99b', neg: '#e36a6a', warn: '#d8b36a', info: '#6aa8ff', violet: '#9d8fd9', mute: '#999a9d',
};
export const TEXT = '#ededee';

export interface WidgetHost {
  conversationId?: string;
  stateKey?: string;
  /** Called only after the user confirms the displayed follow-up prompt. */
  onExecutePrompt?: (text: string) => void;
  /** Folgeauftrag ins Eingabefeld legen — abgeschickt wird er vom Nutzer. */
  onPrompt?: (text: string) => void;
  onOpenUrl?: (url: string) => void;
  onOpenFile?: (path: string) => void;
  /** Die Excalidraw-Fläche im Dock — für `cortex-excalidraw`-Blöcke. */
  canvas?: import('../../canvas/client.js').CanvasHost;
}

const PATHS: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  cloud: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7 9.5a4.5 4.5 0 0 0 0 9Z"/>',
  rain: '<path d="M7 15h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.4 6.6 4.2 4.2 0 0 0 7 15Z"/><path d="m8 18-1 2.5M12 18l-1 2.5M16 18l-1 2.5"/>',
  snow: '<path d="M7 15h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.4 6.6 4.2 4.2 0 0 0 7 15Z"/><path d="M8 18.5h.01M12 19.5h.01M16 18.5h.01M10 21h.01M14 21h.01"/>',
  storm: '<path d="M7 15h10a3.6 3.6 0 0 0 .5-7.15A5 5 0 0 0 7.4 6.6 4.2 4.2 0 0 0 7 15Z"/><path d="m12.5 15-2 3.5h3l-2 3.5"/>',
  fog: '<path d="M4 9h16M6 13h12M4 17h16"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 10.5h14M8.5 21l1.5-4M15.5 21 14 17"/>',
  swap: '<path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4"/>',
  package: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9M8 5.2l8 4.5"/>',
  list: '<path d="M10.5 6H20M10.5 12H20M10.5 18H20"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11"/><circle cx="5.3" cy="18" r="1.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trend: '<path d="m3 16 5.5-5.5 4 4L21 6"/><path d="M15 6h6v6"/>',
  trendDown: '<path d="m3 8 5.5 5.5 4-4L21 18"/><path d="M15 18h6v-6"/>',
  trendFlat: '<path d="M3 12h18"/><path d="m17 8 4 4-4 4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5Z"/>',
  pause: '<path d="M9 5.5v13M15 5.5v13"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V7.5A1.5 1.5 0 0 1 5.5 6H10"/>',
  refresh: '<path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6"/>',
  terminal: '<path d="m4 5 6 6-6 6m9 1h7"/>',
  server: '<rect x="3.5" y="4" width="17" height="7" rx="1.8"/><rect x="3.5" y="13" width="17" height="7" rx="1.8"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  upload: '<path d="M12 15V4m-5 5 5-5 5 5"/><path d="M4 16v3a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-3"/>',
  shield: '<path d="M12 3 19.5 6v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6Z"/><path d="m8.8 12 2.3 2.3 4.2-4.3"/>',
  download: '<path d="M12 4v11m-5-5 5 5 5-5"/><path d="M4 17v2a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-2"/>',
  flow: '<rect x="3" y="4" width="6" height="5" rx="1.2"/><rect x="15" y="4" width="6" height="5" rx="1.2"/><rect x="9" y="15" width="6" height="5" rx="1.2"/><path d="M9 6.5h6M18 9v2.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9M12 12.5V15"/>',
  database: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  node: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="1.8"/><circle cx="19" cy="6" r="1.8"/><circle cx="18" cy="19" r="1.8"/><path d="m6.3 6.3 3.5 3.5M17.6 7.1l-3.4 3M16.8 17.6l-2.7-3.4"/>',
  scale: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="m5 7-2.5 6a2.5 2.5 0 0 0 5 0Zm14 0-2.5 6a2.5 2.5 0 0 0 5 0Z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.7"/><path d="m20.5 16-4.5-4.5L6 20"/>',
  bars: '<path d="M4 6h9M8 12h12M4 18h7"/>',
  briefcase: '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  compare: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M12 2.5v19"/>',
  drop: '<path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z"/>',
  wave: '<path d="M3 12h1.5M7 8.5v7M11 5v14M15 9v6M19 7v10"/>',
  cap: '<path d="m2.5 9.5 9.5-5 9.5 5-9.5 5Z"/><path d="M6.5 11.6V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.4M21.5 9.5v5"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 19.5c.5-3 2.8-5 5.5-5s5 2 5.5 5M14.5 14.6c3-.6 5.8 1.3 6.5 4.4"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8Z"/>',
  spark: '<path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z"/>',
  swarm: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="17.5" r="2.2"/><circle cx="19" cy="17.5" r="2.2"/><path d="M10.8 7 6.2 15.4M13.2 7l4.6 8.4M7.2 17.5h9.6"/>',
  gauge: '<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4-5"/>',
  alert: '<path d="M12 4 21 19.5H3Z"/><path d="M12 10v4M12 17h.01"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/>',
};

export function WIcon({ name, size = 16, color = 'currentColor', width = 1.5, fill = 'none' }: { name: string; size?: number; color?: string; width?: number; fill?: string }) {
  return (
    <svg
      class="cx-w-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      stroke-width={width}
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.spark! }}
    />
  );
}

export function Card({ label, children }: { label: string; children: ComponentChildren }) {
  return <section class="cx-w" aria-label={label}>{children}</section>;
}

export function Head({ mark, markTone, title, sub, right }: { mark: ComponentChildren; markTone?: string; title: ComponentChildren; sub?: ComponentChildren; right?: ComponentChildren }) {
  return (
    <div class="cx-w-head">
      <span class="cx-w-mark" style={markTone ? { color: markTone } : undefined}>{typeof mark === 'string' && PATHS[mark] ? <WIcon name={mark} size={18} /> : mark}</span>
      <span class="cx-w-title"><strong>{title}</strong>{sub !== undefined && sub !== '' && <small>{sub}</small>}</span>
      {right && <span class="cx-w-acts">{right}</span>}
    </div>
  );
}

export function Pill({ tone = 'mute', children }: { tone?: Tone; children: ComponentChildren }) {
  return <span class={`cx-w-pill ${tone}`}>{children}</span>;
}

export function Dot({ color }: { color: string }) {
  return <span class="cx-w-dot" style={{ background: color }} />;
}

export function Meter({ percent, color, width }: { percent: number; color?: string; width?: number | string }) {
  const p = Math.max(0, Math.min(100, percent));
  return <span class="cx-w-meter" style={width !== undefined ? { width } : undefined}><i style={{ width: `${p}%`, background: color }} /></span>;
}

export function Seg({ items, value, onChange }: { items: string[]; value: number; onChange?: (i: number) => void }) {
  return (
    <span class="cx-w-seg" role="tablist">
      {items.map((t, i) => (
        <button type="button" role="tab" aria-selected={i === value} class={i === value ? 'on' : ''} key={t} onClick={() => onChange?.(i)}>{t}</button>
      ))}
    </span>
  );
}

export function Foot({ left, right }: { left?: ComponentChildren; right?: ComponentChildren }) {
  if (!left && !right) return null;
  return <div class="cx-w-foot"><span>{left}</span><span>{right}</span></div>;
}

export function Check({ on, size = 16 }: { on: boolean; size?: number }) {
  return <span class={`cx-w-check ${on ? 'on' : ''}`} style={{ width: size, height: size }}>{on && <WIcon name="check" size={size - 5} color="#131416" width={2.4} />}</span>;
}

/** Stand eines Schritts als Kreis: fertig, läuft, offen, fehlgeschlagen. */
export function StateMark({ state, size = 16 }: { state: 'done' | 'now' | 'next' | 'failed' | 'ok' | 'warn' | 'fail' | 'retry'; size?: number }) {
  if (state === 'done' || state === 'ok') return <span class="cx-w-state" style={{ width: size, height: size, background: '#88b99b29' }}><WIcon name="check" size={size - 6} color={TONE.pos} width={2.4} /></span>;
  if (state === 'failed' || state === 'fail') return <span class="cx-w-state" style={{ width: size, height: size, background: '#e36a6a29' }}><WIcon name="close" size={size - 7} color={TONE.neg} width={2.4} /></span>;
  if (state === 'warn' || state === 'retry') return <span class="cx-w-state warn" style={{ width: size, height: size, fontSize: size - 5 }}>!</span>;
  if (state === 'now') return <Spinner size={size} />;
  return <span class="cx-w-state next" style={{ width: size, height: size }} />;
}

export function Spinner({ size = 16, color = TONE.info }: { size?: number; color?: string }) {
  return (
    <svg class="cx-w-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke={color} stroke-opacity=".22" stroke-width="2" />
      <path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" stroke={color} stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

let sparkId = 0;

/**
 * Linie mit getönter Fläche, gepunkteter Bezugslinie und leuchtendem Endpunkt.
 * Die Zeichenfläche dehnt sich auf die Breite; der Endpunkt liegt als HTML
 * darüber, damit er rund bleibt, wenn das SVG gestreckt wird.
 */
export function Spark({ values, width, height, color, area = true, glow = true, reference, stroke = 1.6 }: {
  values: number[]; width: number | string; height: number; color: string; area?: boolean; glow?: boolean; reference?: number; stroke?: number;
}) {
  const nums = (Array.isArray(values) ? values : []).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) return <span class="cx-w-sparkwrap" style={{ width, height }} />;
  const W = 1000;
  const pad = 6;
  const all = reference !== undefined ? [...nums, reference] : nums;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i * W) / (nums.length - 1);
  const y = (v: number) => pad + ((hi - v) * (height - 2 * pad)) / span;
  const pts = nums.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const id = `cx-w-g${++sparkId}`;
  const last = nums[nums.length - 1]!;
  return (
    <span class="cx-w-sparkwrap" style={{ width, height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {area && (
          <>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color={color} stop-opacity=".22" />
                <stop offset="1" stop-color={color} stop-opacity="0" />
              </linearGradient>
            </defs>
            <path d={`M0,${height} L${pts.replace(/ /g, ' L')} L${W},${height} Z`} fill={`url(#${id})`} />
          </>
        )}
        {reference !== undefined && <path d={`M0 ${y(reference).toFixed(1)}H${W}`} stroke="#ffffff40" stroke-width="1" stroke-dasharray="1 3" vector-effect="non-scaling-stroke" />}
        <polyline points={pts} fill="none" stroke={color} stroke-width={stroke} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      </svg>
      {glow && <i class="cx-w-glow" style={{ top: y(last), background: color, boxShadow: `0 0 0 4px ${color}2e` }} />}
    </span>
  );
}

export function Actions({ actions, host }: { actions?: WidgetAction[]; host: WidgetHost }) {
  const [pending, setPending] = useState<WidgetAction>();
  const usable = (actions ?? []).filter((a) => a && typeof a.label === 'string' && (a.prompt || a.url || a.path));
  if (!usable.length) return null;
  return (
    <div class="cx-w-actions">
      {usable.map((a, i) => (
        <button
          type="button"
          key={i}
          class={`cx-w-btn ${a.primary ? 'primary' : ''}`}
          onClick={() => (a.prompt ? host.onExecutePrompt ? setPending(a) : host.onPrompt?.(a.prompt) : a.url ? host.onOpenUrl?.(a.url) : a.path ? host.onOpenFile?.(a.path) : undefined)}
        >
          {a.url && <WIcon name="external" size={14} />}
          {a.label}
        </button>
      ))}
      {pending?.prompt && <div class="cx-w-stack" role="group" aria-label="Folgeauftrag bestätigen">
        <strong>{pending.label}</strong><p>{pending.prompt}</p>
        <div class="cx-w-actions inline">
          <button type="button" class="cx-w-btn primary" onClick={() => { const text = pending.prompt!; setPending(undefined); host.onExecutePrompt?.(text); }}>Als Auftrag starten</button>
          <button type="button" class="cx-w-btn" onClick={() => { host.onPrompt?.(pending.prompt!); setPending(undefined); }}>Ins Eingabefeld</button>
          <button type="button" class="cx-w-btn quiet" onClick={() => setPending(undefined)}>Abbrechen</button>
        </div>
      </div>}
    </div>
  );
}

export function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** Anzeigewert: Zahlen deutsch (ganze unter 10.000 ohne Punkt), Text wie er ist. */
export function fmt(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Number.isInteger(v) && Math.abs(v) < 10_000 ? String(v) : v.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  }
  return str(v);
}

export function toneOf(v: unknown, fallback: Tone = 'mute'): Tone {
  return typeof v === 'string' && v in TONE ? (v as Tone) : fallback;
}

export function list<T>(v: T[] | undefined): T[] {
  return Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : [];
}
