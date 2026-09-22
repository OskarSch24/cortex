/**
 * Die Prüfschicht der Zeichenfläche: Was liegt übereinander, welche
 * Beschriftung passt nicht in ihre Form — und wie wird das behoben.
 *
 * Sie arbeitet auf den fertigen Excalidraw-Elementen, also auf dem, was
 * tatsächlich zu sehen ist, nicht auf dem Plan des Modells. Nach jedem
 * Zeichnen durch das Modell läuft sie über die ganze Fläche:
 * - ein neuer Block, der Bestehendes schneiden würde, rückt als Ganzes auf
 *   freie Fläche (placeBlock);
 * - was danach noch übereinanderliegt und neu ist, rückt einzeln weg (resolve);
 * - was bleibt, geht als Liste an das Modell (auditText) — es sieht also, was
 *   noch nicht stimmt.
 * „Aufräumen“ in der Werkzeugleiste ruft resolve für die ganze Fläche auf.
 *
 * Rein, ohne Excalidraw — prüfbar in test/unit/canvas-audit.test.ts.
 */

export interface El {
  id: string; type: string; x: number; y: number; width: number; height: number;
  isDeleted?: boolean; containerId?: string | null; text?: string; originalText?: string;
  startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null;
  points?: ReadonlyArray<readonly [number, number]>;
  version?: number; versionNonce?: number; updated?: number;
  [key: string]: unknown;
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Issue { kind: 'overlap' | 'overflow'; a: string; b?: string }

/** Was Platz belegt. Linien, Pfeile und Freihand nicht — die dürfen kreuzen. */
const SOLID = new Set(['rectangle', 'ellipse', 'diamond', 'text', 'image', 'frame', 'magicframe', 'embeddable', 'iframe']);
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);
const GAP = 16;
const TOLERANCE = 2;

export const rectOf = (e: El): Rect => ({ x: Math.min(e.x, e.x + e.width), y: Math.min(e.y, e.y + e.height), w: Math.abs(e.width), h: Math.abs(e.height) });
const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad - TOLERANCE && b.x < a.x + a.w + pad - TOLERANCE && a.y < b.y + b.h + pad - TOLERANCE && b.y < a.y + a.h + pad - TOLERANCE;
const contains = (a: Rect, b: Rect) => a.x <= b.x + TOLERANCE && a.y <= b.y + TOLERANCE && a.x + a.w >= b.x + b.w - TOLERANCE && a.y + a.h >= b.y + b.h - TOLERANCE;
const area = (r: Rect) => r.w * r.h;

/** Die Elemente, die als Fläche zählen: sichtbar, fest, keine Beschriftung in einer Form. */
function solids(els: readonly El[]): El[] {
  return els.filter(e => !e.isDeleted && SOLID.has(e.type) && !(e.type === 'text' && e.containerId));
}

/** Übereinander, ohne dass eines das andere ganz umschließt (Rahmen, Karte mit Text darin). */
function clash(a: Rect, b: Rect): boolean {
  return overlaps(a, b) && !contains(a, b) && !contains(b, a);
}

export function audit(els: readonly El[]): Issue[] {
  const issues: Issue[] = [];
  const s = solids(els);
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    if (clash(rectOf(s[i]!), rectOf(s[j]!))) issues.push({ kind: 'overlap', a: s[i]!.id, b: s[j]!.id });
  }
  const byId = new Map(els.map(e => [e.id, e]));
  for (const t of els) {
    if (t.isDeleted || t.type !== 'text' || !t.containerId) continue;
    const box = byId.get(t.containerId);
    // Nur Formen haben einen Innenraum; eine Pfeilbeschriftung sitzt auf der Linie.
    if (box && !box.isDeleted && SHAPES.has(box.type) && !contains(rectOf(box), rectOf(t))) issues.push({ kind: 'overflow', a: box.id });
  }
  return issues;
}

/** Für das Modell: kurz, mit Kennungen, damit es gezielt nacharbeiten kann. */
export function auditText(issues: Issue[], els: readonly El[]): string {
  if (!issues.length) return '';
  const label = new Map<string, string>();
  for (const e of els) if (e.type === 'text' && e.containerId) label.set(e.containerId, (e.originalText ?? e.text ?? '').replace(/\s+/g, ' ').slice(0, 30));
  const name = (id: string) => (label.get(id) ? `${id} "${label.get(id)}"` : id);
  const lines = issues.slice(0, 30).map(i => i.kind === 'overlap' ? `- ${name(i.a)} overlaps ${name(i.b!)}` : `- the text of ${name(i.a)} does not fit its shape`);
  return `Layout check found ${issues.length} problem${issues.length === 1 ? '' : 's'} (fix them — move with "remove" + redraw, or use more space):\n${lines.join('\n')}${issues.length > 30 ? `\n- … ${issues.length - 30} more` : ''}`;
}

/* ── Bewegen ───────────────────────────────────────────────────────────── */

const bump = (e: El, patch: Partial<El>): El => ({
  ...e, ...patch, version: (e.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: Date.now(),
});

/** Randpunkt eines Rechtecks in Richtung eines Punktes. */
function edgeToward(r: Rect, tx: number, ty: number): [number, number] {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, dx = tx - cx, dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const s = Math.min(dx ? (r.w / 2) / Math.abs(dx) : Infinity, dy ? (r.h / 2) / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}

/**
 * Verschiebt Elemente samt Beschriftung und hängt gebundene Pfeile nach:
 * zwei bewegte Enden verschieben den Pfeil, ein bewegtes zieht ihn neu.
 */
export function moveAll(els: readonly El[], deltas: Map<string, [number, number]>, sizes: Map<string, [number, number]> = new Map()): El[] {
  if (!deltas.size && !sizes.size) return [...els];
  const byId = new Map(els.map(e => [e.id, e]));
  const d = (id?: string | null) => (id ? deltas.get(id) : undefined);
  return els.map(e => {
    const own = d(e.id) ?? (e.type === 'text' && e.containerId ? d(e.containerId) : undefined);
    if (e.type === 'arrow' || e.type === 'line') {
      const a = d(e.startBinding?.elementId), b = d(e.endBinding?.elementId);
      if (own) return bump(e, { x: e.x + own[0], y: e.y + own[1] });
      if (!a && !b) return e;
      if (a && b && a[0] === b[0] && a[1] === b[1]) return bump(e, { x: e.x + a[0], y: e.y + a[1] });
      const s = e.startBinding ? byId.get(e.startBinding.elementId) : undefined, t = e.endBinding ? byId.get(e.endBinding.elementId) : undefined;
      const pts = e.points ?? [[0, 0], [e.width, e.height]];
      const last = pts[pts.length - 1]!;
      let start: [number, number] = [e.x, e.y], end: [number, number] = [e.x + last[0], e.y + last[1]];
      if (s) { const r = rectOf(s); const m = d(s.id) ?? [0, 0]; start = [r.x + r.w / 2 + m[0], r.y + r.h / 2 + m[1]]; } else if (a) start = [start[0] + a[0], start[1] + a[1]];
      if (t) { const r = rectOf(t); const m = d(t.id) ?? [0, 0]; end = [r.x + r.w / 2 + m[0], r.y + r.h / 2 + m[1]]; } else if (b) end = [end[0] + b[0], end[1] + b[1]];
      if (s) { const r = rectOf(s); const m = d(s.id) ?? [0, 0]; start = edgeToward({ ...r, x: r.x + m[0], y: r.y + m[1] }, end[0], end[1]); }
      if (t) { const r = rectOf(t); const m = d(t.id) ?? [0, 0]; end = edgeToward({ ...r, x: r.x + m[0], y: r.y + m[1] }, start[0], start[1]); }
      const dx = end[0] - start[0], dy = end[1] - start[1];
      return bump(e, { x: start[0], y: start[1], points: [[0, 0], [dx, dy]], width: Math.abs(dx), height: Math.abs(dy) });
    }
    const size = sizes.get(e.id);
    if (!own && !size) return e;
    return bump(e, { ...(own ? { x: e.x + own[0], y: e.y + own[1] } : {}), ...(size ? { width: size[0], height: size[1] } : {}) });
  });
}

/**
 * Setzt einen neuen Block so, dass er nichts Bestehendes schneidet. Liegt er
 * schon frei, bleibt er; sonst der erste freie Platz rechts, dann unten.
 * Ein neues Element, das ganz in einer bestehenden Form liegt (etwas in einen
 * Rahmen setzen), gilt nicht als Schnitt.
 */
export function placeBlock(existing: readonly El[], added: readonly El[]): [number, number] {
  const fixed = solids(existing).map(rectOf);
  const mine = solids(added).map(rectOf);
  if (!fixed.length || !mine.length) return [0, 0];
  const free = (dx: number, dy: number) => mine.every(r => {
    const m = { ...r, x: r.x + dx, y: r.y + dy };
    return fixed.every(f => !overlaps(f, m, GAP) || contains(f, m));
  });
  if (free(0, 0)) return [0, 0];
  const all = [...fixed, ...mine];
  const right = Math.max(...fixed.map(f => f.x + f.w)), bottom = Math.max(...fixed.map(f => f.y + f.h));
  const minX = Math.min(...mine.map(r => r.x)), minY = Math.min(...mine.map(r => r.y));
  const top = Math.min(...all.map(r => r.y)), left = Math.min(...all.map(r => r.x));
  const tries: Array<[number, number]> = [
    [right + 160 - minX, top - minY],
    [left - minX, bottom + 160 - minY],
  ];
  return tries.find(([dx, dy]) => free(dx, dy)) ?? tries[0]!;
}

/**
 * Löst Überlappungen: Geschwister (gleiche umschließende Form) rücken nach
 * rechts oder unten auseinander, Inhalte gehen mit ihrer Form mit, und ein
 * Rahmen wächst mit seinem Inhalt — sonst schnitte eine hinausgerückte Karte
 * ihren eigenen Rahmen. Nur, was in `movable` steht, wird bewegt oder
 * vergrößert; alles andere ist fest und Hindernis.
 */
export function resolve(els: readonly El[], movable: ReadonlySet<string>): { moves: Map<string, [number, number]>; sizes: Map<string, [number, number]> } {
  const s = solids(els);
  const rect = new Map(s.map(e => [e.id, rectOf(e)]));
  const parent = new Map<string, string | undefined>();
  for (const e of s) {
    const r = rect.get(e.id)!;
    const p = s.filter(o => o !== e && contains(rect.get(o.id)!, r) && area(rect.get(o.id)!) > area(r)).sort((a, b) => area(rect.get(a.id)!) - area(rect.get(b.id)!))[0];
    parent.set(e.id, p?.id);
  }
  const kids = (id?: string) => s.filter(e => parent.get(e.id) === id).map(e => e.id);
  const deltas = new Map<string, [number, number]>();
  const moveTree = (id: string, dx: number, dy: number) => {
    const r = rect.get(id)!; r.x += dx; r.y += dy;
    const cur = deltas.get(id) ?? [0, 0]; deltas.set(id, [cur[0] + dx, cur[1] + dy]);
    for (const k of kids(id)) moveTree(k, dx, dy);
  };
  const settle = (group: string[]) => {
    for (let pass = 0; pass < 60; pass++) {
      let moved = false;
      group.sort((a, b) => rect.get(a)!.y - rect.get(b)!.y || rect.get(a)!.x - rect.get(b)!.x);
      for (let i = 0; i < group.length; i++) for (let j = 0; j < group.length; j++) {
        if (i === j) continue;
        const a = rect.get(group[i]!)!, b = rect.get(group[j]!)!;
        if (!clash(a, b)) continue;
        // Bewegt wird, was bewegt werden darf — bei zweien das spätere.
        const mv = movable.has(group[j]!) && (j > i || !movable.has(group[i]!)) ? j : movable.has(group[i]!) ? i : -1;
        if (mv < 0) continue;
        const still = mv === j ? a : b, go = mv === j ? b : a;
        const dx = still.x + still.w + GAP - go.x, dy = still.y + still.h + GAP - go.y;
        if (dx <= dy) moveTree(group[mv]!, dx, 0); else moveTree(group[mv]!, 0, dy);
        moved = true;
      }
      if (!moved) break;
    }
  };
  const sizes = new Map<string, [number, number]>();
  const grow = (id: string) => {
    const group = kids(id);
    if (!group.length || !movable.has(id)) return;
    const r = rect.get(id)!;
    const right = Math.max(...group.map(k => rect.get(k)!.x + rect.get(k)!.w)) + GAP, bottom = Math.max(...group.map(k => rect.get(k)!.y + rect.get(k)!.h)) + GAP;
    if (right > r.x + r.w || bottom > r.y + r.h) {
      r.w = Math.max(r.w, right - r.x); r.h = Math.max(r.h, bottom - r.y);
      sizes.set(id, [r.w, r.h]);
    }
  };
  const walk = (id?: string) => { const group = kids(id); group.forEach(walk); settle(group); if (id) grow(id); };
  walk(undefined);
  for (const [id, [dx, dy]] of deltas) if (!dx && !dy) deltas.delete(id);
  return { moves: deltas, sizes };
}
