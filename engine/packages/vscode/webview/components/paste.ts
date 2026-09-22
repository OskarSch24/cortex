/**
 * Ab hier wird eingefügter Text zum Block über dem Eingabefeld, statt als Wand
 * darin zu stehen. Im Feld bleibt Platz für die eigentliche Anweisung; der
 * Block geht beim Senden vollständig mit.
 */
export const PASTE_BLOCK_LINES = 20;
export const PASTE_BLOCK_CHARS = 1500;

export function isLongPaste(text: string): boolean {
  return text.length > PASTE_BLOCK_CHARS || text.split('\n').length > PASTE_BLOCK_LINES;
}

/** Deine Anweisung zuerst, dann die eingefügten Texte — jeder als eigener Absatz. */
export function composeMessage(text: string, pastes: string[]): string {
  return [text.trim(), ...pastes.map((p) => p.replace(/\s+$/, ''))].filter(Boolean).join('\n\n');
}
