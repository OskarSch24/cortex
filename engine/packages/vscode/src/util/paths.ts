import { isAbsolute, relative, sep } from 'node:path';

/**
 * Liegt `path` in `root`? Streng gerechnet: `..` als ganzer Abschnitt und ein
 * anderes Laufwerk führen hinaus, ein Name wie `..backup` nicht. Symlinks löst
 * das nicht auf — wer ihnen misstraut, übergibt `realpath`-Ergebnisse.
 * `root` selbst zählt als drinnen, außer `allowSelf` ist `false`.
 */
export function isInside(root: string, path: string, { allowSelf = true }: { allowSelf?: boolean } = {}): boolean {
  const rel = relative(root, path);
  if (!rel) return allowSelf;
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
