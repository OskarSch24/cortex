/** Der Heimatpfad ist auf diesem Mac immer derselbe — er kostet nur Breite. */
export function tildePath(path: string): string {
  const home = /^\/Users\/[^/]+/.exec(path);
  return home ? '~' + path.slice(home[0].length) : path;
}

/** Wie tildePath; lange Pfade behalten nur Anfang und Ende. */
export function shortPath(path: string): string {
  const p = tildePath(path);
  return p.length > 26 ? `${p.slice(0, 10)}…${p.slice(-14)}` : p;
}
