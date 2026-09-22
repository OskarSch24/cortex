import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/**
 * Profilordner ohne Konto — aus entfernten Konten, abgebrochenen Anmeldungen oder
 * dem am 08.09.2026 entfernten Gemini — werden nicht gelöscht, sondern nach
 * `~/.cortex/profiles-archiv/<Datum>/` verschoben. Die Zugangsdaten des Anbieters
 * darin bleiben so wiederherstellbar, aber `profiles/` zeigt nur, was Cortex
 * wirklich benutzt (beobachtet am 13.09.2026: drei Gemini- und zwei Grok-Reste).
 */
export const PROFILES_ROOT = join(homedir(), '.cortex', 'profiles');
export const ARCHIVE_ROOT = join(homedir(), '.cortex', 'profiles-archiv');

/** Ein frisch angelegter Ordner kann zu einer laufenden Anmeldung gehören. */
const GRACE_MS = 24 * 60 * 60 * 1000;

export function orphanProfiles(root: string, inUse: string[], now = Date.now()): string[] {
  if (!existsSync(root)) return [];
  const used = new Set(inUse.map((dir) => basename(dir)));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !used.has(entry.name))
    .map((entry) => join(root, entry.name))
    .filter((dir) => now - statSync(dir).mtimeMs > GRACE_MS);
}

export function archiveProfile(dir: string, archiveRoot = ARCHIVE_ROOT, now = new Date()): string | undefined {
  if (!existsSync(dir)) return undefined;
  const day = now.toISOString().slice(0, 10);
  const target = join(archiveRoot, day);
  mkdirSync(target, { recursive: true });
  let destination = join(target, basename(dir));
  for (let i = 2; existsSync(destination); i++) destination = join(target, `${basename(dir)}-${i}`);
  renameSync(dir, destination);
  return destination;
}

export function archiveOrphanProfiles(inUse: string[], root = PROFILES_ROOT, archiveRoot = ARCHIVE_ROOT): string[] {
  const moved: string[] = [];
  for (const dir of orphanProfiles(root, inUse)) {
    try {
      const destination = archiveProfile(dir, archiveRoot);
      if (destination) moved.push(destination);
    } catch {
      // Ein Ordner, der gerade benutzt wird, bleibt liegen und kommt beim nächsten Start dran.
    }
  }
  return moved;
}
