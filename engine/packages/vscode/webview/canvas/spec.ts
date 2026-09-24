/**
 * Was in einem `cortex-excalidraw`-Block stehen darf, und wie daraus Elemente
 * auf der Zeichenfläche werden.
 *
 * Das Modell beschreibt Struktur: eine Mindmap als Baum, einen Ablauf als
 * Knoten und Kanten. Die Lage rechnet diese Datei aus und gibt Excalidraws
 * „Skeleton“-Format zurück, das `convertToExcalidrawElements` fertig macht.
 * Sie kennt Excalidraw selbst nicht und läuft deshalb auch im Test.
 *
 * Die Anweisung an das Modell steht in core/src/context/canvasBrief.ts — was
 * dort versprochen wird, muss hier verstanden werden.
 */

export {
  colorName, colorOf, isCanvasLang, parseCanvas, specSize,
  type CanvasSpec, type FlowEdge, type FlowNode, type FreeElement, type MapPlace, type MapRoute, type MindNode, type Skeleton,
} from './schema.js';
export { rectsOverlap, wrap, type Rect } from './geometry.js';
export { fitAndSeparate } from './layout/free.js';

import type { CanvasSpec, Skeleton } from './schema.js';
import { flow } from './layout/flow.js';
import { free } from './layout/free.js';
import { mindmap } from './layout/mindmap.js';

/* ── Zusammen ───────────────────────────────────────────────────────────── */

/**
 * Die Elemente eines Blocks. `taken` sind die Kennungen, die schon auf der
 * Fläche stehen: wer im „add“-Modus wieder `start` nennt, soll nicht das
 * Vorhandene überschreiben.
 */
export function toSkeleton(
  spec: CanvasSpec,
  taken: ReadonlySet<string> = new Set(),
  /** Karten zeichnet map.ts — nur im Excalidraw-Paket, die Grenzdaten sind groß. */
  maps?: (spec: Extract<CanvasSpec, { layout: 'map' }>, id: (base: string) => string) => Skeleton[],
): Skeleton[] {
  const used = new Set(taken);
  let n = 0;
  const id = (base: string) => {
    const clean = base.replace(/[^\w-]/g, '_').slice(0, 40) || 'el';
    let candidate = clean === 'node' || clean === 'edge' ? `${clean}-${++n}` : clean;
    while (used.has(candidate)) candidate = `${clean}-${++n}`;
    used.add(candidate);
    return candidate;
  };
  if (spec.layout === 'mindmap') return mindmap(spec.root, id);
  if (spec.layout === 'flow') return flow(spec, id);
  if (spec.layout === 'free') return free(spec.elements, id);
  if (spec.layout === 'map') return maps ? maps(spec, id) : [];
  return [];
}

/** Umriss einer Menge von Elementen (Rahmen zählen erst nach dem Umwandeln). */
export function bounds(elements: Array<{ x?: unknown; y?: unknown; width?: unknown; height?: unknown }>): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of elements) {
    if (typeof e.x !== 'number' || typeof e.y !== 'number') continue;
    const w = typeof e.width === 'number' ? e.width : 0, h = typeof e.height === 'number' ? e.height : 0;
    minX = Math.min(minX, e.x, e.x + w); maxX = Math.max(maxX, e.x, e.x + w);
    minY = Math.min(minY, e.y, e.y + h); maxY = Math.max(maxY, e.y, e.y + h);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : undefined;
}

/** Schiebt ein Skelett, ohne Kennungen oder Verbindungen anzufassen. */
export function shift(elements: Skeleton[], dx: number, dy: number): Skeleton[] {
  return elements.map(e => (typeof e.x === 'number' && typeof e.y === 'number' ? { ...e, x: e.x + dx, y: e.y + dy } : e));
}
