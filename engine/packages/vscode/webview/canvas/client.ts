/**
 * Die Seite der Webview, die Excalidraw nicht kennt: das Paket nachladen und
 * Zeichenaufträge aus dem Verlauf an die offene Fläche weiterreichen.
 *
 * Ein Auftrag kann eintreffen, bevor die Fläche steht — der Block ist fertig,
 * der Reiter geht gerade erst auf, das Paket lädt noch. Deshalb laufen die
 * Aufträge über eine kleine Warteschlange, die die Fläche abholt, sobald sie
 * bereit ist.
 */
import { CANVAS_LANG } from '../../../core/src/context/canvasBrief.js';
import type { CanvasHandle, MountOptions, Snapshot } from './bundle.js';

export type { CanvasHandle } from './bundle.js';

interface CanvasLib {
  mount(el: HTMLElement, options: MountOptions): CanvasHandle;
  render(scene: string | undefined, code: string | undefined): Promise<Snapshot>;
}

/* ── Die Fläche für das Modell sichtbar machen ─────────────────────────── */

/** Flächen, die gerade im Dock stehen — CanvasView trägt sich hier ein. */
const mounted = new Map<string, CanvasHandle>();
export function registerCanvas(conversationId: string, handle: CanvasHandle | undefined): void {
  if (handle) mounted.set(conversationId, handle); else mounted.delete(conversationId);
}

/**
 * Eine Anfrage des Modells (über den Host, canvas_view / canvas_draw): Bild
 * der Fläche, nachdem der Block gezeichnet ist. Steht die Fläche des Chats im
 * Dock, zeichnet sie dort — sonst im Hintergrund auf der gespeicherten
 * Zeichnung, die der Host mitschickt und danach wieder ablegt.
 */
export async function answerCanvasRequest(req: { conversationId: string; code?: string; scene?: string }): Promise<Snapshot & { headless: boolean }> {
  try {
    const lib = await loadCanvasLib();
    const open = mounted.get(req.conversationId);
    if (open) return { ...(await open.snapshot(req.code)), headless: false };
    return { ...(await lib.render(req.scene, req.code)), headless: true };
  } catch (e) {
    return { png: '', description: '', json: '', error: (e as Error).message, headless: true };
  }
}
type CanvasWindow = Window & { CortexExcalidraw?: CanvasLib; EXCALIDRAW_ASSET_PATH?: string; __CORTEX_MEDIA__?: string };

let loading: Promise<CanvasLib> | undefined;

/** Lädt media/excalidraw.js samt Stil einmal. Die CSP lässt es über die Nonce der Seite zu. */
export function loadCanvasLib(): Promise<CanvasLib> {
  const w = window as CanvasWindow;
  if (w.CortexExcalidraw) return Promise.resolve(w.CortexExcalidraw);
  loading ??= new Promise<CanvasLib>((resolve, reject) => {
    const media = w.__CORTEX_MEDIA__ ?? '../media/';
    // Excalidraw baut Schrift-Adressen mit `new URL(…, basis)` — die Basis muss absolut sein.
    w.EXCALIDRAW_ASSET_PATH = new URL(`${media}excalidraw/`, location.href).href;
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${media}excalidraw.css`;
    document.head.appendChild(style);
    const script = document.createElement('script');
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    if (nonce) script.nonce = nonce;
    script.src = `${media}excalidraw.js`;
    script.onload = () => (w.CortexExcalidraw ? resolve(w.CortexExcalidraw) : reject(new Error('Excalidraw hat sich nicht gemeldet.')));
    script.onerror = () => { loading = undefined; reject(new Error('Excalidraw konnte nicht geladen werden.')); };
    document.head.appendChild(script);
  });
  return loading;
}

/** Hell oder dunkel — gemessen am Hintergrund, nicht an einem Klassennamen. */
export function pageTheme(): 'light' | 'dark' {
  const color = getComputedStyle(document.body).backgroundColor;
  const [r = 0, g = 0, b = 0] = (color.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? 'light' : 'dark';
}

/** Kurzer, stabiler Schlüssel für einen Block — derselbe Block wird nur einmal gezeichnet. */
export function blockKey(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0;
  return `b${(h >>> 0).toString(36)}${code.length.toString(36)}`;
}

/** Die fertigen (geschlossenen) Excalidraw-Blöcke in einem Antworttext. */
export function canvasBlocks(text: string): string[] {
  const out: string[] = [];
  const fence = new RegExp(`^(\`{3,}|~{3,})[ \\t]*(?:${CANVAS_LANG}|excalidraw)[ \\t]*\\n([\\s\\S]*?)\\n\\1[ \\t]*$`, 'gm');
  for (let m = fence.exec(text); m; m = fence.exec(text)) out.push(m[2]!.trim());
  return out;
}

/* ── Warteschlange ─────────────────────────────────────────────────────── */

export interface CanvasJob { conversationId: string; code: string; key: string; force: boolean }
/**
 * Wie weit ein Block ist. `wartet` heißt: der Auftrag liegt in der
 * Warteschlange, aber noch keine Fläche hat ihn geholt — genau der Fall, in
 * dem früher stillschweigend nichts geschah.
 */
export type CanvasResult =
  | { state: 'wartet' }
  | { state: 'gezeichnet'; count: number }
  | { state: 'stand-schon' }
  | { state: 'fehler'; error: string };

const jobs: CanvasJob[] = [];
const listeners = new Set<() => void>();
const results = new Map<string, CanvasResult>();
const resultListeners = new Set<() => void>();

export function requestDraw(job: CanvasJob): void {
  if (!jobs.some(j => j.key === job.key && j.conversationId === job.conversationId && j.force === job.force)) jobs.push(job);
  // Der Block gilt ab jetzt als unterwegs. Holt ihn keine Fläche ab, bleibt es
  // dabei — und die Karte im Verlauf sagt es, statt so zu tun, als sei nichts
  // gewesen.
  reportResult(job.key, { state: 'wartet' });
  listeners.forEach(fn => fn());
}

/** Die Fläche holt ab, was für ihren Chat bereitliegt. */
export function takeJobs(conversationId: string): CanvasJob[] {
  const mine = jobs.filter(j => j.conversationId === conversationId);
  for (const job of mine) jobs.splice(jobs.indexOf(job), 1);
  return mine;
}

export function onJobs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reportResult(key: string, result: CanvasResult): void {
  results.set(key, result);
  resultListeners.forEach(fn => fn());
}

export function resultOf(key: string): CanvasResult | undefined {
  return results.get(key);
}

export function onResults(fn: () => void): () => void {
  resultListeners.add(fn);
  return () => resultListeners.delete(fn);
}

/** Was die Karte im Verlauf von ihrer Umgebung braucht. */
export interface CanvasHost {
  /** Zeichnet den Block auf die Fläche dieses Chats; `force` auch, wenn er schon gezeichnet wurde. */
  draw(code: string, key: string, force?: boolean): void;
  /** Öffnet die Fläche, ohne etwas zu zeichnen. */
  open(): void;
}
