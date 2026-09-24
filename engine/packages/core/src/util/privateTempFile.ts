import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface PrivateTempFile {
  path: string;
  /** Löscht den ganzen Ordner; mehrfach aufrufbar. */
  dispose(): void;
}

/**
 * Eine Datei nur für diesen Lauf: in einem eigenen, frischen Ordner, nur für
 * den Nutzer lesbar (0600) und nie über eine bestehende geschrieben. Scheitert
 * das Schreiben, ist der Ordner schon wieder weg.
 */
export function privateTempFile(prefix: string, name: string, content: string): PrivateTempFile {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  const path = join(folder, name);
  const dispose = () => rmSync(folder, { recursive: true, force: true });
  try {
    writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    dispose();
    throw error;
  }
  return { path, dispose };
}
