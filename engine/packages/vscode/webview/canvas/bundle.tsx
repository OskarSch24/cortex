/** @jsxImportSource react */
/**
 * Excalidraw für das Dock — ein eigenes Paket neben der Webview.
 *
 * Excalidraw ist eine React-Bibliothek und einige Megabyte schwer; Cortex
 * selbst läuft auf Preact. Deshalb wird dieses Paket mit echtem React gebaut
 * (esbuild.mjs → media/excalidraw.js) und erst geladen, wenn jemand die
 * Zeichenfläche öffnet. Nach außen zeigt es nur `window.CortexExcalidraw`.
 */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, exportToBlob, exportToSvg, hashElementsVersion, serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { bounds, parseCanvas, shift, specSize, toSkeleton, type CanvasSpec, type Skeleton } from './spec.js';
import { describeScene } from './describe.js';
import { mapSkeleton } from './map.js';
import { ToolbarExtras } from './toolbar.js';
import { audit, auditText, moveAll, placeBlock, resolve, type El } from './audit.js';

/** Was das Modell von der Fläche sieht: die Elemente und, falls vorhanden, was die Prüfung bemängelt. */
function describeChecked(elements: readonly unknown[]): string {
  const els = elements as readonly El[];
  const problems = auditText(audit(els), els);
  const scene = describeScene(elements);
  return problems ? `${scene}\n\n${problems}` : scene;
}

type Api = Parameters<NonNullable<Parameters<typeof Excalidraw>[0]['excalidrawAPI']>>[0];
type Theme = 'light' | 'dark';

export interface MountOptions {
  /** Eine gespeicherte Zeichnung im .excalidraw-Format. */
  scene?: string;
  theme: Theme;
  /** Nach einer Pause im Zeichnen: der Stand zum Speichern und als Text für das Modell. */
  onChange: (json: string, description: string) => void;
  /** Der SVG-Knopf in der Werkzeugleiste — sichern kann nur der Host. */
  onExport: (format: 'svg') => void;
}

export interface CanvasHandle {
  /**
   * Zeichnet einen Block und antwortet erst, wenn er wirklich auf der Fläche
   * steht. Das Anordnen ist asynchron (Schriften, Geodaten) — wer nur den
   * Rückgabewert des Aufrufs abwartet, erfährt nichts über das, was danach
   * schiefgeht.
   */
  apply(code: string): Promise<{ ok: true; count: number } | { ok: false; error: string }>;
  exportSvg(): Promise<string>;
  json(): string;
  /** Die Zeichnung als Text für das Modell (describe.ts), samt Prüfergebnis (audit.ts). */
  describe(): string;
  /** Räumt die ganze Fläche auf: nichts liegt mehr übereinander. Rückgängig mit ⌘Z. */
  tidy(): number;
  /** Zeichnet (optional) einen Block, wartet, bis er steht, und gibt das Bild der Fläche zurück. */
  snapshot(code?: string): Promise<Snapshot>;
  /** Setzt einen Text (ein Emoji) in die Mitte der Ansicht und wählt ihn aus. */
  insertText(text: string, fontSize?: number): void;
  setTheme(theme: Theme): void;
  destroy(): void;
}

function Board({ root, onEmoji, onTidy, onExport, initial, theme: initialTheme, onApi, onTheme, onChange }: {
  root: HTMLElement;
  onEmoji: (emoji: string) => void;
  onTidy: () => void;
  onExport: MountOptions['onExport'];
  initial?: Record<string, unknown>;
  theme: Theme;
  onApi: (api: Api) => void;
  onTheme: (set: (theme: Theme) => void) => void;
  onChange: MountOptions['onChange'];
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => onTheme(setTheme), []);
  // Excalidraw meldet jede Mausbewegung. Gespeichert und beschrieben wird
  // erst, wenn sich an den Elementen wirklich etwas geändert hat und das
  // Zeichnen kurz ruht.
  const [timer] = useState(() => ({ id: 0 as unknown as ReturnType<typeof setTimeout>, last: -1 }));
  return <><Excalidraw
    initialData={initial as never}
    theme={theme}
    langCode="de-DE"
    excalidrawAPI={onApi}
    UIOptions={{
      canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: null },
    }}
    onChange={(elements, appState, files) => {
      const version = hashElementsVersion(elements);
      if (version === timer.last) return;
      clearTimeout(timer.id);
      timer.id = setTimeout(() => {
        timer.last = version;
        onChange(serializeAsJSON(elements, appState, files, 'local'), describeChecked(elements));
      }, 600);
    }}
  />
  <ToolbarExtras root={root} onEmoji={onEmoji} onTidy={onTidy} onSvg={() => onExport('svg')} />
  </>;
}

/**
 * Ein Block auf eine Fläche: Anordnung, Platzierung auf freier Fläche und
 * Prüfschicht (audit.ts). Braucht keine sichtbare Fläche — dieselbe Funktion
 * zeichnet für den offenen Reiter und für einen Chat im Hintergrund.
 */
async function drawOnto(current: El[], spec: CanvasSpec): Promise<{ all: El[]; added: El[] }> {
  // Excalidraw misst Beschriftungen mit der Schrift, die gerade da ist.
  // Ist Excalifont noch nicht geladen, wird zu schmal gemessen und das
  // Wort später abgeschnitten — also erst die nötigen Zeichen laden.
  const sample = JSON.stringify(spec).replace(/[{}[\]":,]/g, ' ').slice(0, 4000) || 'A';
  await Promise.all(['20px Excalifont', '20px Nunito', '20px "Comic Shanns"'].map(font => document.fonts.load(font, sample).catch(() => []))).catch(() => undefined);
  const live = current.filter(e => !e.isDeleted);
  const removed = new Set(spec.remove);
  const kept = spec.mode === 'add'
    ? live.filter(e => !removed.has(e.id) && !(e.type === 'text' && e.containerId && removed.has(e.containerId)))
    : [];
  let skeleton: Skeleton[] = toSkeleton(spec, new Set(kept.map(e => e.id)), mapSkeleton);
  // Ein Titel steht über dem Bild, nicht darin.
  const box = bounds(skeleton);
  if (spec.title && box && spec.layout !== 'free') {
    const width = spec.title.length * 32 * 0.62;
    skeleton = [...skeleton, { type: 'text', id: `titel-${Date.now().toString(36)}`, x: Math.round((box.minX + box.maxX) / 2 - width / 2), y: box.minY - 80, text: spec.title, fontSize: 32, strokeColor: '#1e1e1e' }];
  }
  // Beim Ergänzen kommt das Neue rechts neben das Vorhandene (freie Zeichnungen prüft placeBlock).
  const there = bounds(kept as never);
  const fresh = bounds(skeleton);
  if (spec.mode === 'add' && there && fresh && spec.layout !== 'free') {
    skeleton = shift(skeleton, there.maxX + 160 - fresh.minX, there.minY - fresh.minY);
  }
  let added = convertToExcalidrawElements(skeleton as never, { regenerateIds: false }) as unknown as El[];
  // Prüfschicht: der neue Block schneidet nichts Bestehendes — sonst rückt er
  // als Ganzes auf freie Fläche —, und was danach noch übereinanderliegt und
  // neu ist, rückt einzeln weg. Bestehendes bleibt fest.
  const [bx, by] = placeBlock(kept, added);
  if (bx || by) added = moveAll(added, new Map(added.map(e => [e.id, [bx, by] as [number, number]])));
  let all: El[] = [...kept, ...added];
  { const fix = resolve(all, new Set(added.map(e => e.id))); all = moveAll(all, fix.moves, fix.sizes); }
  const addedIds = new Set(added.map(e => e.id));
  return { all, added: all.filter(e => addedIds.has(e.id)) };
}

/** Die Fläche als PNG (hell, wie auf Papier) — so sieht das Modell, was gezeichnet ist. */
async function pngOf(elements: readonly unknown[], files: unknown): Promise<string> {
  const live = (elements as El[]).filter(e => !e.isDeleted);
  if (!live.length) return '';
  const blob = await exportToBlob({
    elements: live as never, files: (files ?? {}) as never, mimeType: 'image/png', maxWidthOrHeight: 1600,
    appState: { exportBackground: true, viewBackgroundColor: '#ffffff', exportWithDarkMode: false, exportPadding: 24 } as never,
  });
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => resolve(''); r.readAsDataURL(blob); });
}

export interface Snapshot { png: string; description: string; json: string; error?: string }

/** Ohne sichtbare Fläche: gespeicherte Zeichnung laden, optional einen Block darauf zeichnen, Bild machen. */
async function render(scene: string | undefined, code: string | undefined): Promise<Snapshot> {
  let data: { elements?: El[]; appState?: Record<string, unknown>; files?: unknown } = {};
  try { if (scene) data = JSON.parse(scene); } catch { /* leer */ }
  let elements = (data.elements ?? []) as El[];
  if (code) {
    const parsed = parseCanvas(code);
    if (!parsed.ok) return { png: '', description: '', json: scene ?? '', error: parsed.error };
    elements = (await drawOnto(elements, parsed.spec)).all;
  }
  const json = serializeAsJSON(elements as never, (data.appState ?? {}) as never, (data.files ?? {}) as never, 'local');
  return { png: await pngOf(elements, data.files), description: describeChecked(elements), json };
}

function mount(el: HTMLElement, options: MountOptions): CanvasHandle {
  let api: Api | undefined;
  let setTheme: ((theme: Theme) => void) | undefined;
  const pending: Array<() => void> = [];
  const initial = (() => {
    // Im dunklen Thema kehrt Excalidraw die Farben selbst um — der Hintergrund
    // bleibt also weiß und wird dunkel gezeigt.
    if (!options.scene) return undefined;
    try {
      const data = JSON.parse(options.scene) as Record<string, unknown>;
      return { elements: data.elements, appState: { ...(data.appState as object), collaborators: new Map() }, files: data.files, scrollToContent: true };
    } catch { return undefined; }
  })();
  const root = createRoot(el);
  // Der Emoji-Knopf ruft insertText der fertigen Schnittstelle — die gibt es erst unten.
  let self: CanvasHandle | undefined;
  root.render(<Board
    root={el}
    onEmoji={emoji => self?.insertText(emoji)}
    onTidy={() => self?.tidy()}
    onExport={options.onExport}
    initial={initial}
    theme={options.theme}
    onApi={a => { api = a; pending.splice(0).forEach(run => run()); }}
    onTheme={set => { setTheme = set; }}
    onChange={options.onChange}
  />);

  // Das Zeichnen selbst ist drawOnto (unten) — hier nur Fläche und Ansicht.
  let lastRun: Promise<void> = Promise.resolve();
  const apply = async (code: string): ReturnType<CanvasHandle['apply']> => {
    const parsed = parseCanvas(code);
    if (!parsed.ok) return parsed;
    const spec = parsed.spec;
    const run = async () => {
      const { all, added } = await drawOnto(api!.getSceneElements() as unknown as El[], spec);
      api!.updateScene({ elements: all as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      const target = (added.length ? added : api!.getSceneElements()) as never[];
      // Nicht randvoll: oben und unten liegen Excalidraws Werkzeugleisten.
      if (target.length) api!.scrollToContent(target, { fitToViewport: true, viewportZoomFactor: 0.78, animate: true, duration: 300 });
    };
    // Steht die Fläche noch nicht, wartet der Auftrag auf sie — aber nicht
    // endlos: sonst bliebe die ganze Warteschlange dahinter stehen.
    const done = new Promise<{ ok: true; count: number } | { ok: false; error: string }>(resolve => {
      const timer = setTimeout(() => resolve({ ok: false, error: 'Die Zeichenfläche ist nicht bereit geworden.' }), 30_000);
      const go = () => run().then(
        () => { clearTimeout(timer); resolve({ ok: true, count: specSize(spec) }); },
        (e: unknown) => { clearTimeout(timer); resolve({ ok: false, error: (e as Error)?.message || 'Der Block ließ sich nicht zeichnen.' }); },
      );
      if (api) void go(); else pending.push(() => void go());
    });
    lastRun = done.then(() => undefined);
    return done;
  };

  self = {
    apply,
    async exportSvg() {
      if (!api) return '';
      const svg = await exportToSvg({ elements: api.getSceneElements(), appState: { ...api.getAppState(), exportBackground: true }, files: api.getFiles() });
      return svg.outerHTML;
    },
    insertText(text, fontSize = 64) {
      if (!api) return;
      const s = api.getAppState();
      const zoom = s.zoom.value;
      // Die Mitte dessen, was man gerade sieht, in Zeichnungskoordinaten.
      const cx = -s.scrollX + s.width / 2 / zoom, cy = -s.scrollY + s.height / 2 / zoom;
      const [el] = convertToExcalidrawElements([{ type: 'text', x: cx - fontSize / 2, y: cy - fontSize / 2, text, fontSize } as never], { regenerateIds: true });
      if (!el) return;
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), el],
        appState: { selectedElementIds: { [el.id]: true } } as never,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    describe() {
      if (api) return describeChecked(api.getSceneElements());
      return describeChecked(Array.isArray(initial?.elements) ? initial.elements : []);
    },
    async snapshot(code) {
      if (code) {
        const r = await apply(code);
        if (!r.ok) return { png: '', description: '', json: self!.json(), error: r.error };
      }
      await lastRun;
      if (!api) return { png: '', description: self!.describe(), json: self!.json(), error: 'Fläche noch nicht bereit' };
      return { png: await pngOf(api.getSceneElements(), api.getFiles()), description: self!.describe(), json: self!.json() };
    },
    tidy() {
      if (!api) return 0;
      const els = api.getSceneElementsIncludingDeleted() as unknown as El[];
      const fix = resolve(els, new Set(els.map(e => e.id)));
      const changed = fix.moves.size + fix.sizes.size;
      if (changed) api.updateScene({ elements: moveAll(els, fix.moves, fix.sizes) as never, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      return changed;
    },
    json() { return api ? serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), 'local') : options.scene ?? ''; },
    setTheme(theme) { setTheme?.(theme); },
    destroy() { root.unmount(); },
  };
  return self;
}

(window as unknown as { CortexExcalidraw: { mount: typeof mount; render: typeof render } }).CortexExcalidraw = { mount, render };
