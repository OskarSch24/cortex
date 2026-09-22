import { useEffect, useState } from 'preact/hooks';
import { vscode } from '../vscodeApi.js';
import { OptimisticSettings } from './optimistic.js';

/**
 * Ein Speicher für die Einstellungsseiten.
 *
 * Zwei Quellen: `cortex.*` und Editorwerte kommen aus der Code-OSS-Konfiguration
 * (`native`), alles ohne eigenen Schalter liegt im globalState des Hosts
 * (`app`). Beide werden hier gespiegelt, damit jede Komponente — auch der
 * Composer, der keine Einstellungsseite ist — synchron nachsehen kann.
 * Geschrieben wird optimistisch: der Schalter springt sofort, der Host
 * bestätigt mit dem vollständigen Stand.
 */
type Values = Record<string, unknown>;
export type ActivityVerbosity = 'minimal' | 'compact' | 'detailed';
export function activityVerbosity(value: unknown): ActivityVerbosity {
  return value === 'minimal' || value === 'detailed' ? value : 'compact';
}

let app: Values = {};
let native: Values = {};
let appLoaded = false;
let nativeLoaded = false;
let started = false;
const appWrites = new OptimisticSettings();
const nativeWrites = new OptimisticSettings();
let requestSequence = 0;
const requestId = () => `${Date.now()}-${++requestSequence}`;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());

export function startSettingsStore(): void {
  if (started) return;
  started = true;
  window.addEventListener('message', event => {
    const msg = event.data;
    if (msg?.kind === 'appSettings') { appWrites.receive(msg.values ?? {}, msg.revision, msg.ack); app = appWrites.values(); appLoaded = true; applyAppearance(); emit(); }
    if (msg?.kind === 'nativeSettings') { nativeWrites.receive(msg.values ?? {}, msg.revision, msg.ack); native = nativeWrites.values(); nativeLoaded = true; emit(); }
  });
  try { window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyAppearance()); } catch { /* ältere Engine */ }
  vscode.postMessage({ kind: 'getAppSettings' });
  vscode.postMessage({ kind: 'getNativeSettings' });
}

export function appSetting<T>(key: string, fallback: T): T {
  return (key in app ? app[key] : fallback) as T;
}

export function useSettingsStore() {
  const [, tick] = useState(0);
  useEffect(() => {
    const fn = () => tick(n => n + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return { app, native, appLoaded, nativeLoaded };
}

export function setAppSetting(key: string, value: unknown): void {
  const id = requestId();
  appWrites.write(key, value, id); app = appWrites.values();
  applyAppearance();
  emit();
  vscode.postMessage({ kind: 'setAppSetting', key, value, requestId: id });
}

export function useApp<T>(key: string, fallback: T): [T, (value: T) => void] {
  useSettingsStore();
  return [appSetting(key, fallback), (value: T) => setAppSetting(key, value)];
}

export function useNative<T>(key: string, fallback: T): [T, (value: T) => void, boolean] {
  useSettingsStore();
  const value = (native[key] ?? fallback) as T;
  return [value, (next: T) => {
    const id = requestId();
    nativeWrites.write(key, next, id); native = nativeWrites.values();
    emit();
    vscode.postMessage({ kind: 'setNativeSetting', key, value: next, requestId: id });
  }, nativeLoaded];
}

/* ── Darstellung ────────────────────────────────────────────────────────────
   Die Darstellungswerte wirken sofort und überall: sie setzen die
   `--cx-*`-Tokens am Wurzelelement. Was nie verändert wurde, bleibt ungesetzt —
   dann gilt die Marke aus cortex.css und nicht eine Kopie ihrer Werte.        */

export const THEME_DEFAULTS = {
  dunkel: { hintergrund: '#181818', vordergrund: '#EDEDEE', akzent: 'cortex', kontrast: 50 },
  hell: { hintergrund: '#F7F7F8', vordergrund: '#1A1C1F', akzent: 'cortex', kontrast: 50 },
} as const;

export const ACCENTS: Record<string, { label: string; dunkel: string; hell: string }> = {
  cortex: { label: 'Cortex', dunkel: '#EDEDEE', hell: '#1A1C1F' },
  indigo: { label: 'Indigo', dunkel: '#8B96C9', hell: '#4F5B93' },
  salbei: { label: 'Salbei', dunkel: '#88B99B', hell: '#3F7A56' },
  bernstein: { label: 'Bernstein', dunkel: '#D6A85C', hell: '#96671C' },
  koralle: { label: 'Koralle', dunkel: '#E08A7A', hell: '#A8483A' },
};

export const UI_FONTS: Record<string, string> = {
  system: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif",
  inter: "Inter, 'SF Pro Text', sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
};
export const CODE_FONTS: Record<string, string> = {
  system: "'SF Mono', 'SFMono-Regular', Menlo, monospace",
  menlo: 'Menlo, monospace',
  jetbrains: "'JetBrains Mono', 'SF Mono', monospace",
  fira: "'Fira Code', 'SF Mono', monospace",
};

export function themeMode(): 'hell' | 'dunkel' {
  const design = appSetting<string>('darstellung.design', 'dunkel');
  if (design === 'hell') return 'hell';
  if (design === 'system') {
    try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'hell' : 'dunkel'; } catch { return 'dunkel'; }
  }
  return 'dunkel';
}

function mix(hex: string, other: string, share: number): string {
  const parse = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const a = parse(hex), b = parse(other);
  if (a.some(Number.isNaN) || b.some(Number.isNaN)) return hex;
  return '#' + a.map((v, i) => Math.round(v * (1 - share) + b[i]! * share).toString(16).padStart(2, '0')).join('');
}

function applyAppearance(): void {
  const root = document.documentElement;
  const mode = themeMode();
  const key = (name: string) => `darstellung.${mode}.${name}`;
  const set = (prop: string, value?: string) => value ? root.style.setProperty(prop, value) : root.style.removeProperty(prop);
  const defaults = THEME_DEFAULTS[mode];
  const hintergrund = appSetting<string | undefined>(key('hintergrund'), undefined);
  const vordergrund = appSetting<string | undefined>(key('vordergrund'), undefined);
  const akzent = appSetting<string>(key('akzent'), defaults.akzent);
  const kontrast = appSetting<number>(key('kontrast'), defaults.kontrast);
  const light = mode === 'hell';
  root.dataset.cxTheme = mode;
  // Selecting the built-in dark preset must use the same sampled surfaces as
  // an untouched installation. An explicitly chosen custom colour stays intact.
  const customBackground = hintergrund && hintergrund.toLowerCase() !== defaults.hintergrund.toLowerCase() ? hintergrund : undefined;
  const bg = customBackground ?? (light ? defaults.hintergrund : undefined);
  const fg = vordergrund ?? (light ? defaults.vordergrund : undefined);
  set('--cx-bg', bg);
  set('--cx-text', fg);
  set('--cx-composer-text', fg);
  if (bg) {
    set('--cx-rail', mix(bg, light ? '#000000' : '#ffffff', light ? 0.035 : 0.06));
    set('--cx-raised', mix(bg, light ? '#000000' : '#ffffff', light ? 0.02 : 0.03));
    set('--cx-hover', mix(bg, light ? '#000000' : '#ffffff', light ? 0.06 : 0.09));
  } else { set('--cx-rail'); set('--cx-raised'); set('--cx-hover'); }
  if (bg) {
    const surface = light ? '#000000' : '#ffffff';
    set('--cx-composer', light ? '#ffffff' : mix(bg, surface, 0.125));
    set('--cx-composer-border', mix(bg, surface, light ? 0.12 : 0.18));
    set('--cx-composer-placeholder', mix(fg ?? defaults.vordergrund, bg, 0.62));
    set('--cx-context', mix(bg, surface, 0.03));
    set('--cx-template-panel', mix(bg, surface, light ? 0.025 : 0.09));
  } else {
    set('--cx-composer'); set('--cx-composer-border'); set('--cx-composer-placeholder');
    set('--cx-context'); set('--cx-template-panel');
  }
  set('--cx-accent', akzent === 'cortex' && !light ? undefined : ACCENTS[akzent]?.[mode]);
  set('--cx-switch', akzent === 'cortex' ? undefined : ACCENTS[akzent]?.[mode]);
  // Kontrast 50 ist die Marke. Darüber werden Linien und Nebentext kräftiger.
  if (kontrast !== 50 || light) {
    const k = Math.max(0, Math.min(100, kontrast)) / 100;
    const base = light ? '#1a1c1f' : '#ffffff';
    const alpha = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
    set('--cx-line', base + alpha(0.03 + k * 0.05));
    set('--cx-strong-line', base + alpha(0.06 + k * 0.08));
    const text = fg ?? (light ? '#1a1c1f' : '#ededee');
    const ground = bg ?? defaults.hintergrund;
    set('--cx-muted', mix(text, ground, 0.55 - k * 0.3));
    set('--cx-dim', mix(text, ground, 0.68 - k * 0.3));
  } else { set('--cx-line'); set('--cx-strong-line'); set('--cx-muted'); set('--cx-dim'); }
  const uiFont = appSetting<string>(key('uiFont'), 'system');
  set('--cx-body-font', uiFont === 'system' ? undefined : UI_FONTS[uiFont]);
  const codeFont = appSetting<string>(key('codeFont'), 'system');
  set('--cx-code-font', CODE_FONTS[codeFont]);
  set('--cx-code-size', `${appSetting<number>('darstellung.codeSchrift', 12)}px`);
  const ui = appSetting<number>('darstellung.uiSchrift', 13);
  document.body.style.zoom = ui === 13 ? '' : String(ui / 13);
  const cls = document.body.classList;
  const motion = appSetting<string>('darstellung.bewegung', 'system');
  cls.toggle('cx-reduce-motion', motion === 'ein');
  cls.toggle('cx-allow-motion', motion === 'aus');
  cls.toggle('cx-no-pointer', !appSetting<boolean>('darstellung.zeiger', true));
  cls.toggle('cx-no-smoothing', !appSetting<boolean>('darstellung.glaettung', true));
  cls.toggle('cx-opaque-rail', !appSetting<boolean>(key('transparent'), true));
}
