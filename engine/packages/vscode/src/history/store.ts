import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HistoryEntry } from './types.js';

export interface HistorySecrets {
  get(key: string): PromiseLike<string | undefined>;
  store(key: string, value: string): PromiseLike<void>;
}

const MAGIC = Buffer.from('CRTXHST1');
const KEY_ID = 'cortex.computerHistory.encryption.v1';
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 5000;
export const HISTORY_BUSY = 'Der Computerverlauf wird in einem anderen Cortex-Fenster verwaltet.';
const STORE_ERROR = 'Der lokale Computerverlauf konnte nicht sicher geöffnet oder gespeichert werden.';

function validEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const e = value as HistoryEntry;
  return typeof e.id === 'string' && e.id.length <= 100
    && Number.isFinite(e.startedAt) && Number.isFinite(e.endedAt) && e.endedAt >= e.startedAt
    && typeof e.appId === 'string' && e.appId.length <= 300
    && typeof e.appName === 'string' && e.appName.length <= 300
    && typeof e.title === 'string' && e.title.length <= 500
    && typeof e.text === 'string' && e.text.length <= 8000
    && (e.summary === undefined || (typeof e.summary === 'string' && e.summary.length <= 1600));
}

/** A private store, deliberately independent of chat, provider and export storage. */
export class HistoryStore {
  readonly file: string;
  private readonly lock: string;
  private readonly owner = `${process.pid}:${randomUUID()}`;
  private ownsLock = false;
  private key?: Buffer;
  private entries: HistoryEntry[] = [];
  private initialized = false;
  private closed = false;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly directory: string, private readonly secrets: HistorySecrets) {
    this.file = path.join(directory, 'history.enc');
    this.lock = path.join(directory, '.writer-lock');
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async acquireLock(): Promise<void> {
    if (this.ownsLock) return;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Atomic symlink creation has no interval in which a lock has no owner.
        await fs.symlink(this.owner, this.lock);
        this.ownsLock = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const target = await fs.readlink(this.lock).catch(() => '');
        const pid = Number(target.split(':')[0]);
        if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error(HISTORY_BUSY);
        try { process.kill(pid, 0); throw new Error(HISTORY_BUSY); }
        catch (probeError) {
          if ((probeError as NodeJS.ErrnoException).code !== 'ESRCH') throw new Error(HISTORY_BUSY);
        }
        // Serialize stale-owner cleanup too: two reclaimers must never unlink a
        // fresh owner's lock between the check and unlink. A crashed reaper is
        // deliberately fail-closed rather than risking concurrent writers.
        const reaper = `${this.lock}.reaper`;
        try { await fs.symlink(this.owner, reaper); } catch { throw new Error(HISTORY_BUSY); }
        try {
          if (await fs.readlink(this.lock).catch(() => '') !== target) throw new Error(HISTORY_BUSY);
          await fs.unlink(this.lock);
        } finally { await fs.unlink(reaper).catch(() => undefined); }
      }
    }
    throw new Error(HISTORY_BUSY);
  }

  private async open(): Promise<void> {
    if (this.closed) throw new Error(STORE_ERROR);
    if (this.initialized) return;
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const directoryInfo = await fs.lstat(this.directory);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error(STORE_ERROR);
      await fs.chmod(this.directory, 0o700);
      await this.acquireLock();
      const info = await fs.lstat(this.file).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (info && (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES + 64)) throw new Error(STORE_ERROR);
      let savedKey = await this.secrets.get(KEY_ID);
      if (!savedKey) {
        // A missing key must never silently replace an existing encrypted history.
        if (info) throw new Error(STORE_ERROR);
        savedKey = randomBytes(32).toString('base64');
        await this.secrets.store(KEY_ID, savedKey);
      }
      this.key = Buffer.from(savedKey, 'base64');
      if (this.key.length !== 32) throw new Error(STORE_ERROR);
      if (info) {
        await fs.chmod(this.file, 0o600);
        const packed = await fs.readFile(this.file);
        if (packed.length < 36 || !packed.subarray(0, 8).equals(MAGIC)) throw new Error(STORE_ERROR);
        const decipher = createDecipheriv('aes-256-gcm', this.key, packed.subarray(8, 20));
        decipher.setAAD(MAGIC);
        decipher.setAuthTag(packed.subarray(20, 36));
        const plain = Buffer.concat([decipher.update(packed.subarray(36)), decipher.final()]);
        try {
          const parsed: unknown = JSON.parse(plain.toString('utf8'));
          const value = parsed as { version?: unknown; entries?: unknown };
          if (value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES || !value.entries.every(validEntry)) throw new Error(STORE_ERROR);
          this.entries = value.entries;
        } finally { plain.fill(0); }
      }
      this.initialized = true;
    } catch (error) {
      this.key?.fill(0);
      this.key = undefined;
      await this.releaseLock();
      throw new Error(error instanceof Error && error.message === HISTORY_BUSY ? HISTORY_BUSY : STORE_ERROR);
    }
  }

  private async persist(next: HistoryEntry[]): Promise<void> {
    if (!this.key || this.closed) throw new Error(STORE_ERROR);
    const bounded = next.slice(-MAX_ENTRIES);
    let plain = Buffer.from(JSON.stringify({ version: 1, entries: bounded }));
    while (plain.length > MAX_BYTES && bounded.length > 0) {
      plain.fill(0);
      bounded.splice(0, Math.max(1, Math.ceil(bounded.length / 10)));
      plain = Buffer.from(JSON.stringify({ version: 1, entries: bounded }));
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(MAGIC);
    const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
    plain.fill(0);
    const packed = Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
    const temporary = path.join(this.directory, `.history-${randomUUID()}.tmp`);
    let handle: fs.FileHandle | undefined;
    try {
      handle = await fs.open(temporary, 'wx', 0o600);
      await handle.writeFile(packed);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.rename(temporary, this.file);
      // Sync the rename as well as the encrypted file before reporting success.
      const directoryHandle = await fs.open(this.directory, 'r');
      try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      this.entries = bounded;
    } catch { throw new Error(STORE_ERROR); }
    finally {
      await handle?.close().catch(() => undefined);
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  async read(retentionDays: number, now: number): Promise<HistoryEntry[]> {
    return this.serialize(async () => {
      await this.open();
      const cutoff = now - retentionDays * 86_400_000;
      const retained = this.entries.filter(entry => entry.endedAt >= cutoff);
      if (retained.length !== this.entries.length) await this.persist(retained);
      return this.entries.map(entry => ({ ...entry }));
    });
  }

  async put(entry: HistoryEntry, stillValid: () => boolean = () => true): Promise<boolean> {
    return this.serialize(async () => {
      if (!stillValid()) return false;
      await this.open();
      if (!stillValid() || !validEntry(entry)) return false;
      const next = this.entries.filter(item => item.id !== entry.id);
      next.push({ ...entry });
      next.sort((a, b) => a.startedAt - b.startedAt);
      await this.persist(next);
      return true;
    });
  }

  async delete(id: string): Promise<void> {
    if (typeof id !== 'string' || !id.trim() || id.length > 100) throw new Error(STORE_ERROR);
    return this.serialize(async () => {
      await this.open();
      await this.persist(this.entries.filter(entry => entry.id !== id));
    });
  }

  async clear(): Promise<void> {
    return this.serialize(async () => {
      await this.open();
      await this.persist([]);
    });
  }

  private async releaseLock(): Promise<void> {
    if (!this.ownsLock) return;
    this.ownsLock = false;
    if (await fs.readlink(this.lock).catch(() => '') === this.owner) await fs.unlink(this.lock).catch(() => undefined);
  }

  /** Waits for writes before relinquishing ownership to another Cortex window. */
  async close(): Promise<void> {
    return this.serialize(async () => {
      this.closed = true;
      this.entries = [];
      this.key?.fill(0);
      this.key = undefined;
      await this.releaseLock();
    });
  }
}
