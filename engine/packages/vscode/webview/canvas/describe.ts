/**
 * Was auf der Zeichenfläche steht, als Text für das Modell.
 *
 * Ein Bild der Fläche wäre ein Anhang bei jeder Nachricht; eine Liste der
 * Formen mit Beschriftung, Lage und Verbindungen ist klein, liest sich für ein
 * Modell wie ein Plan und trägt die Kennungen, mit denen es später gezielt
 * etwas entfernen kann. Freihandstriche haben keine Bedeutung, die sich
 * aufschreiben ließe — sie werden nur gezählt.
 */

import { colorName } from './spec.js';

interface El {
  id: string; type: string; x: number; y: number; width: number; height: number;
  isDeleted?: boolean; strokeColor?: string; backgroundColor?: string; strokeStyle?: string;
  text?: string; originalText?: string; containerId?: string | null; name?: string | null; frameId?: string | null;
  startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null;
  points?: ReadonlyArray<readonly [number, number]>;
}

const MAX_LINES = 400;
const clip = (text: string, max = 80) => {
  const flat = text.replace(/\s*\n\s*/g, ' / ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const r = (n: number) => Math.round(n);

export function describeScene(raw: ReadonlyArray<unknown>): string {
  const elements = (raw as El[]).filter(e => e && !e.isDeleted);
  if (!elements.length) return '';
  const labels = new Map<string, string>();
  for (const e of elements) {
    if (e.type === 'text' && e.containerId) labels.set(e.containerId, e.originalText ?? e.text ?? '');
  }
  const frames = new Map(elements.filter(e => e.type === 'frame' || e.type === 'magicframe').map(e => [e.id, e.name || 'Rahmen']));
  const name = (id?: string) => {
    if (!id) return undefined;
    const label = labels.get(id);
    return label ? `${id} "${clip(label, 40)}"` : id;
  };

  const lines: string[] = [];
  let freehand = 0, images = 0, outlines = 0;
  for (const e of elements) {
    if (lines.length >= MAX_LINES) break;
    const color = colorName(e.strokeColor);
    const fill = colorName(e.backgroundColor);
    const look = [color && `stroke ${color}`, fill && `fill ${fill}`, e.strokeStyle && e.strokeStyle !== 'solid' && e.strokeStyle].filter(Boolean).join(', ');
    const where = `at ${r(e.x)},${r(e.y)}`;
    const inFrame = e.frameId && frames.has(e.frameId) ? ` in frame "${frames.get(e.frameId)}"` : '';
    switch (e.type) {
      case 'rectangle': case 'ellipse': case 'diamond': {
        const label = labels.get(e.id);
        lines.push(`- ${e.id} ${e.type}${label ? ` "${clip(label)}"` : ''} ${where} ${r(e.width)}×${r(e.height)}${look ? ` (${look})` : ''}${inFrame}`);
        break;
      }
      case 'text':
        if (!e.containerId) lines.push(`- ${e.id} text "${clip(e.originalText ?? e.text ?? '')}" ${where}${color ? ` (${color})` : ''}${inFrame}`);
        break;
      case 'arrow': case 'line': {
        // Grenzen und Küsten einer Karte: hunderte Punkte ohne Verbindung — als Zahl, nicht als Zeile je Fläche.
        if (e.type === 'line' && !e.startBinding && !e.endBinding && (e.points?.length ?? 0) > 8) { outlines++; break; }
        const label = labels.get(e.id);
        const from = name(e.startBinding?.elementId), to = name(e.endBinding?.elementId);
        const last = e.points?.[e.points.length - 1];
        const ends = from || to
          ? `${from ?? `(${r(e.x)},${r(e.y)})`} → ${to ?? (last ? `(${r(e.x + last[0])},${r(e.y + last[1])})` : '?')}`
          : `from ${r(e.x)},${r(e.y)}${last ? ` to ${r(e.x + last[0])},${r(e.y + last[1])}` : ''}`;
        lines.push(`- ${e.id} ${e.type} ${ends}${label ? ` "${clip(label, 40)}"` : ''}${look ? ` (${look})` : ''}`);
        break;
      }
      case 'frame': case 'magicframe':
        lines.push(`- ${e.id} frame "${clip(e.name || 'Rahmen', 40)}" ${where} ${r(e.width)}×${r(e.height)}`);
        break;
      case 'freedraw': freehand++; break;
      case 'image': images++; lines.push(`- ${e.id} image ${where} ${r(e.width)}×${r(e.height)}`); break;
      default: lines.push(`- ${e.id} ${e.type} ${where}`);
    }
  }
  const shown = lines.length;
  const extra = elements.length - shown - freehand - images - outlines - elements.filter(e => e.type === 'text' && e.containerId).length;
  if (outlines) lines.push(`- ${outlines} map outline${outlines === 1 ? '' : 's'} (borders and coastlines from real geodata)`);
  if (freehand) lines.push(`- ${freehand} freehand stroke${freehand === 1 ? '' : 's'} (drawn by hand, content not readable as text)`);
  if (extra > 0 && shown >= MAX_LINES) lines.push(`- … ${extra} more elements not listed`);
  return lines.join('\n');
}
