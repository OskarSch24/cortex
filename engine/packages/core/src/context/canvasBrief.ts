/**
 * Die Excalidraw-Zeichenfläche im Dock: wie ein Modell darauf zeichnet und
 * wie es sieht, was dort schon steht.
 *
 * Gezeichnet wird nicht mit Maus und Werkzeugen, sondern mit einem Codeblock
 * der Sprache `cortex-excalidraw` in der Antwort. Das Modell beschreibt nur
 * Inhalt und Struktur — Knoten, Äste, Verbindungen —, die Anordnung rechnet
 * Cortex selbst aus (webview/canvas/spec.ts). Koordinaten kann ein Modell
 * schlecht schätzen, Struktur kann es gut.
 *
 * Mit geht diese Anweisung nur, wenn die Zeichenfläche im Chat offen ist oder
 * der Auftrag mit `/excalidraw` beginnt — sonst kostete sie in jedem Chat
 * Platz, der mit Zeichnen nichts zu tun hat.
 */

import type { BriefSection } from './brief.js';

export const CANVAS_LANG = 'cortex-excalidraw';

export const CANVAS_COLORS = ['blue', 'green', 'red', 'orange', 'violet', 'yellow', 'gray', 'teal', 'pink', 'black'] as const;

export const CANVAS_BRIEF = [
  'Excalidraw canvas: Cortex shows an Excalidraw whiteboard next to this chat. To draw on it, put exactly one fenced code block with the language ' +
    '`cortex-excalidraw` in your answer. Cortex lays it out and draws it — you describe content and structure, not pixels. ' +
    'Do not write .excalidraw files, SVG or HTML for this, and do not describe the drawing again in prose; one or two sentences around the block are enough.',
  'This chat works on that canvas. When the user asks to add, change, extend, move, fix or show something and names no other target (a file, a page, a component), ' +
    'the canvas is the target — answer with a cortex-excalidraw block ("mode": "add" to extend, "remove" to take elements away, "replace" to redo), ' +
    'even if the canvas is not open right now: the block opens it. Only build HTML, SVG or other files when the user explicitly asks for a file.',
  'The block body is one JSON object: {"title"?, "mode"?: "replace" | "add", "remove"?: [element ids], "layout": "mindmap" | "flow" | "free", …}. ' +
    '"replace" (default) clears the canvas first; "add" keeps what is there and places the new part beside it; "remove" deletes elements by the ids you were shown.',
  'layout "mindmap": {"root": {"label", "color"?, "children"?: [{"label", "color"?, "note"?, "children"?: […]}]}} — any depth; each first-level branch gets its own colour unless you set one. ' +
    'Use it for topics, brainstorming, overviews, learning material.',
  'layout "flow": {"direction"?: "down" | "right", "nodes": [{"id", "label", "shape"?: "box" | "round" | "ellipse" | "diamond" | "note", "color"?, "group"?}], ' +
    '"edges": [{"from", "to", "label"?, "dashed"?: true, "twoWay"?: true}], "groups"?: [{"id", "label"}]} — ' +
    'use it for processes, architectures, decision trees (diamond = decision), timelines, org charts, dependencies. A node\'s "group" draws a labelled frame around all nodes of that group.',
  'layout "free": {"elements": [{"type": "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line", "id"?, "x", "y", "width"?, "height"?, "label"?, "text"?, "color"?, "fill"?: true, ' +
    '"dashed"?: true, "fontSize"?, "points"?: [[dx, dy], …], "from"?: id, "to"?: id}]} — only when the picture needs exact positions (a floor plan, a sketch, a layout). ' +
    'x grows to the right, y downwards, a normal box is about 200×80.',
  'layout "map": {"region": ["Germany"] | ["France", "Spain"] | ["Europe"] | ["World"] (country names in English or German), "states"?: true (German Bundesländer; default when the region is Germany alone), ' +
    '"neighbors"?: true (surrounding countries in grey), "labels"?: false, "highlight"?: [{"name": country or Bundesland, "color"}], ' +
    '"places"?: [{"label", "lat", "lon", "color"?, "size"?: "large"}], "routes"?: [{"from": place label, "to": place label, "label"?, "dashed"?}]}. ' +
    'Maps must be true to reality: Cortex draws every coastline and border from real geodata (Natural Earth, MapSVG) — never draw a country, border or coastline yourself with free shapes, ' +
    'always use layout "map" for anything geographic. Give places their real latitude and longitude (decimal degrees, WGS84); look them up if you are not certain rather than estimating. ' +
    'If a place or area is outside what the data covers, say so instead of improvising an outline.',
  'Seeing the canvas: with each of your turns Cortex attaches a current picture of the canvas when it changed — look at it. ' +
    'If the tools canvas_draw and canvas_view (server cortex_canvas) are available, prefer them over the code block: draw with canvas_draw, look at the picture it returns, ' +
    'and fix overlaps, cut-off or unreadable text, crossing lines and empty areas with further calls until the picture is clean. Never say a drawing is fine without having looked at it; ' +
    'if you could not look, say so.',
  'Cortex checks every drawing: a new block that would overlap what is already there is moved to free space as a whole, overlapping new shapes are pushed apart, ' +
    'and remaining problems appear as "Layout check found …" in what you see of the canvas — fix those before anything else. ' +
    'With "mode": "add" and layout "free", place new things in empty space (right of or below the existing content) or fully inside an existing frame; never on top of existing elements. ' +
    'To change something that exists, "remove" its ids and draw it again instead of drawing over it.',
  'Emojis are welcome where they carry meaning — in labels ("🚀 Launch") or as their own text element in "free" ({"type": "text", "text": "🌧️", "fontSize": 48}); do not decorate every node.',
  `Colours: ${CANVAS_COLORS.join(', ')} or a hex value. Labels short (under ~40 characters, "\\n" for a line break), in the user's language. ` +
    'Several diagrams at once: send one block with "mode": "add" per extra diagram, or one flow with groups.',
].join('\n');

/** `/excalidraw …` — auch hinter einer Konto-Erwähnung wie `@claude`. */
export function asksForCanvas(prompt: string): boolean {
  return /^\s*(?:@\S+\s+)?\/excalidraw\b/i.test(prompt);
}

/**
 * Geht es in dieser Nachricht um die Zeichnung? Nur dann braucht eine
 * geschlossene Fläche ihre ganze Elementliste im Brief. Lieber einmal zu oft
 * ja — ein falsches Ja kostet Tokens, ein falsches Nein eine Zeichnung ohne Ids.
 */
export function touchesCanvas(prompt: string): boolean {
  return asksForCanvas(prompt) ||
    /excalidraw|canvas|whiteboard|zeichen|zeichn|skizz|sketch|draw|diagramm|diagram|mind-?map|flussdiagramm|flowchart|schaubild|grafik|fläche|pfeil|kasten|kästchen|knoten|rahmen|\bkarte\b|\bmap\b/i.test(prompt);
}

/** Zeilen der Szene nach Element-Id; undefined, wenn eine Id doppelt vorkommt und der Vergleich nicht eindeutig wäre. */
function sceneLines(scene: string): Map<string, string> | undefined {
  const lines = new Map<string, string>();
  let audit = false;
  for (const line of scene.split('\n')) {
    if (!line.trim()) continue;
    // Ab „Layout check found …“ nennen die Zeilen Probleme, keine Elemente.
    if (line.startsWith('Layout check found')) audit = true;
    // Sammelzeilen („- 3 freehand strokes“) tragen keine Id — sie zählen als Ganzes.
    const summary = audit || /^- (?:\d+ (?:map outline|freehand stroke)|… )/.test(line);
    const id = !summary && /^- (\S+) /.exec(line)?.[1];
    const key = id || `\u0000${line}`;
    if (lines.has(key)) return undefined;
    lines.set(key, line);
  }
  return lines;
}

/**
 * Nur was sich auf der Fläche bewegt hat. Die ganze Elementliste bei jeder
 * Nachricht neu zu schicken, kostete in langen Chats zehntausende Tokens —
 * und die meisten Änderungen hat das Modell gerade selbst gezeichnet.
 */
function sceneDelta(previous: string, head: string, scene: string): string | undefined {
  const cut = previous.indexOf('\n');
  if (cut < 0) return undefined;
  const before = sceneLines(previous.slice(cut + 1));
  const after = sceneLines(scene);
  if (!before || !after) return undefined;
  const changed = [...after].filter(([key, line]) => before.get(key) !== line).map(([, line]) => line);
  const gone = [...before.keys()].filter(key => !after.has(key));
  const removed = gone.filter(key => !key.startsWith('\u0000'));
  const dropped = gone.filter(key => key.startsWith('\u0000')).map(key => key.slice(1));
  const parts = [`${head} Only the changes since the state you were last shown — everything else on it is unchanged.`];
  if (changed.length) parts.push(`New or changed:\n${changed.join('\n')}`);
  if (removed.length) parts.push(`Removed: ${removed.join(', ')}`);
  if (dropped.length) parts.push(`No longer listed:\n${dropped.join('\n')}`);
  if (!changed.length && !gone.length) parts.push('The drawing itself is unchanged.');
  return parts.join('\n');
}

export interface CanvasSectionOptions {
  /**
   * Geschlossen und die Nachricht handelt nicht davon: statt der
   * Elementliste nur, dass es die Zeichnung gibt.
   */
  noteOnly?: boolean;
}

/**
 * Die Abschnitte im Brief: die Anweisung und, getrennt davon, was auf der
 * Fläche steht. Getrennt, weil sich nur die Zeichnung ändert — eine Sitzung,
 * die die Anweisung schon kennt, bekommt dann allein den neuen Stand, und
 * davon nur die Elemente, die sich geändert haben.
 */
export function canvasSections(scene: string | undefined, open = true, options: CanvasSectionOptions = {}): BriefSection[] {
  const drawing = scene?.trim() ?? '';
  const instructions: BriefSection = { id: 'canvas', title: 'Excalidraw canvas', body: CANVAS_BRIEF };
  const section = (body: string, delta?: BriefSection['delta']): BriefSection[] =>
    [instructions, { id: 'canvas-scene', title: 'On the Excalidraw canvas now', body, ...(delta ? { delta } : {}) }];

  if (scene === undefined) return section('The canvas is not open yet; Cortex opens it when your block arrives.');
  if (!drawing) return section(open ? 'The canvas is open and empty.' : 'The canvas of this chat is empty.');
  if (!open && options.noteOnly) {
    const count = drawing.split('\n').filter(line => line.startsWith('- ')).length;
    return section(
      `The canvas of this chat is closed in the side panel and holds a drawing (${count} listed element${count === 1 ? '' : 's'}). ` +
        'Its element list comes along when the user\'s message is about the drawing; to extend it without the list, use "mode": "add".',
    );
  }
  const head = open
    ? 'The user may have drawn or changed things by hand — this is the current state, use the ids to remove or refer to elements:'
    : 'The canvas of this chat is closed in the side panel right now; your next cortex-excalidraw block reopens it. Its last saved state (use the ids to remove or refer to elements):';
  return section(`${head}\n${drawing}`, previous => sceneDelta(previous, head, drawing));
}
