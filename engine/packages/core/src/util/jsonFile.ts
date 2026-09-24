import { existsSync, readFileSync } from 'node:fs';

/**
 * Liest eine JSON-Datei. `undefined`, wenn es sie nicht gibt; ungültiges JSON
 * wirft — was dann gilt, entscheidet der Aufrufer. `prepare` bereitet den Text
 * vor dem Parsen auf (etwa Kommentare entfernen).
 */
export function readJson<T = unknown>(path: string, prepare?: (raw: string) => string): T | undefined {
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(prepare ? prepare(raw) : raw) as T;
}

/** JSONC wie in Copilots config.json: ganze Zeilen mit `//` fallen weg. */
export function stripLineComments(raw: string): string {
  return raw.replace(/^\s*\/\/.*$/gm, '');
}
