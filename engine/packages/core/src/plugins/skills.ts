import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Der Teil der Plugin-Schicht, der die Platte anfasst — und deshalb nur im
 * Host läuft, nie im Webview. `installed.ts` bleibt frei von `node:*`, damit
 * dieselben Zustandsfunktionen in beiden Welten gelten.
 */
/** Die Skill-Ordner, die es gibt. Fehlende Wurzeln sind kein Fehler. */
export function readSkills(roots: string[]): Set<string> {
  const found = new Set<string>();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let names: string[];
    try {
      names = readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory() || e.isSymbolicLink())
        .map((e) => e.name);
    } catch {
      continue;
    }
    for (const name of names) {
      // Ein Ordner ohne SKILL.md ist kein Skill, sondern Ablage.
      if (existsSync(join(root, name, 'SKILL.md'))) found.add(name);
    }
  }
  return found;
}
