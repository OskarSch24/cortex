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
  if (token.startsWith('/') && start !== 0) return;
  return { start, token };
}
