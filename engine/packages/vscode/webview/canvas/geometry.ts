/** Maße und Rechtecke, gemeinsam für die Lagen (spec.ts) und die Prüfung der Fläche (audit.ts). */

/* ── Maße ───────────────────────────────────────────────────────────────── */

/** Zeilenumbruch nach Wörtern; ein ausdrückliches "\n" gilt immer. */
export function wrap(text: string, max = 24): string {
  const out: string[] = [];
  for (const para of text.split(/\\n|\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > max) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Excalifont läuft etwa 0,6 em breit; lieber etwas Luft als abgeschnitten. */
export function measure(text: string, fontSize: number, padX = 26, padY = 18): { w: number; h: number } {
  const lines = text.split('\n');
  const longest = Math.max(...lines.map(line => line.length));
  return {
    w: Math.max(120, Math.round(longest * fontSize * 0.66 + padX * 2)),
    h: Math.max(56, Math.round(lines.length * fontSize * 1.3 + padY * 2)),
  };
}

/* ── Rechtecke ──────────────────────────────────────────────────────────── */

export interface Rect { x: number; y: number; w: number; h: number }
/** Was die Lagen schon gesetzt haben. */
export interface Placed { id: string; x: number; y: number; w: number; h: number }

/**
 * Überlappen sich zwei Rechtecke? `gap` verlangt zusätzlichen Abstand,
 * `tolerance` lässt kleine Berührungen durchgehen.
 */
export const rectsOverlap = (a: Rect, b: Rect, gap = 0, tolerance = 0) =>
  a.x < b.x + b.w + gap - tolerance && b.x < a.x + a.w + gap - tolerance && a.y < b.y + b.h + gap - tolerance && b.y < a.y + a.h + gap - tolerance;
/** Umschließt `a` das Rechteck `b` — bis auf `tolerance`? */
export const rectContains = (a: Rect, b: Rect, tolerance = 0) =>
  a.x <= b.x + tolerance && a.y <= b.y + tolerance && a.x + a.w >= b.x + b.w - tolerance && a.y + a.h >= b.y + b.h - tolerance;
