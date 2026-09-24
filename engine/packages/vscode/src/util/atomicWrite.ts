import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Wie eine Datei ersetzt wird. Die Zwischendatei entsteht exklusiv (`wx`) —
 * eine fremde Datei gleichen Namens wird nie überschrieben — und wird danach in
 * jedem Fall weggeräumt.
 */
export interface AtomicWriteOptions {
  /** Rechte der Zwischendatei und damit der neuen Datei. */
  mode: number;
  /** Den Inhalt vor dem Umbenennen auf die Platte zwingen. */
  fsync: boolean;
  /** Nach dem Umbenennen auch den Ordner synchronisieren — erst dann übersteht das Umbenennen einen Absturz. */
  syncDir: boolean;
  /** Pfad der Zwischendatei; Vorgabe `<path>.<uuid>.tmp`. Muss im selben Ordner liegen. */
  temporary?: string;
}

/** Synchronisiert einen Ordner, damit ein Umbenennen darin dauerhaft ist. */
export function syncDirectory(path: string): void {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

/**
 * Ersetzt `path` in einem Zug: wer liest, sieht die alte oder die neue Datei,
 * nie eine halbe. Fehler gehen unverändert an den Aufrufer.
 */
export function writeFileAtomic(path: string, data: string | Uint8Array, options: AtomicWriteOptions): void {
  const temporary = options.temporary ?? `${path}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporary, 'wx', options.mode);
    writeFileSync(fd, data);
    if (options.fsync) fsyncSync(fd);
    closeSync(fd); fd = undefined;
    renameSync(temporary, path);
    if (options.syncDir) syncDirectory(dirname(path));
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}

/** Wie `writeFileAtomic`, ohne den Ereignisfluss zu blockieren. */
export async function writeFileAtomicAsync(path: string, data: string | Uint8Array, options: AtomicWriteOptions): Promise<void> {
  const temporary = options.temporary ?? `${path}.${randomUUID()}.tmp`;
  let handle: fs.FileHandle | undefined;
  try {
    handle = await fs.open(temporary, 'wx', options.mode);
    await handle.writeFile(data);
    if (options.fsync) await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, path);
    if (options.syncDir) {
      const directoryHandle = await fs.open(dirname(path), 'r');
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    }
  } finally {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
  }
}
