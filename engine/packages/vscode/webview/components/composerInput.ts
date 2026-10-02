import { commandZoneEnd } from '../../../core/src/commands/slashCommands.js';

/** Shared by the composer and inline editor, including IME confirmation. */
export function submitsInput(e: { key: string; isComposing?: boolean; keyCode?: number; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }, mode: string): boolean {
  return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !e.shiftKey
    && (mode !== 'cmd-enter' || !!(e.metaKey || e.ctrlKey));
}

export function activeToken(text: string, caret: number): { start: number; token: string } | undefined {
  const m = /(^|[\s([{])([@#/][\p{L}\p{N}\p{M}_:./-]*)$/u.exec(text.slice(0, caret));
  if (!m) return;
  const token = m[2]!;
  const start = caret - token.length;
  // Befehle gehen überall im ersten Absatz, auch mehrere (`/goal /test`) —
  // dahinter steht meist Eingefügtes, und `/bin/sh` ist ein Pfad, kein Befehl.
  if (token.startsWith('/') && (start > commandZoneEnd(text) || token.indexOf('/', 1) !== -1)) return;
  return { start, token };
}

/** Steht der Befehl ganz vorn? Nur dort gelten auch Aktionen (Archivieren, Einstellungen …). */
export function atMessageStart(text: string, start: number): boolean {
  return start === text.length - text.trimStart().length;
}
