import { randomUUID } from 'node:crypto';
import { linkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { alive } from '../util/process.js';

interface Owner { pid: number; id: string }
function readOwner(path: string): Owner | undefined {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Owner;
    if (!value || !Number.isSafeInteger(value.pid) || value.pid <= 0 || typeof value.id !== 'string') throw new Error('Die Besitzdatei der geplanten Aktionen ist beschädigt.');
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** A process-lifetime lease. A live (even temporarily busy) host cannot be stolen. */
export class AutomationLease {
  readonly id = randomUUID();
  private held = false;
  constructor(private readonly path: string) {}

  acquire(): boolean {
    if (this.held) return this.isOwner();
    const candidate = `${this.path}.${this.id}.candidate`;
    writeFileSync(candidate, JSON.stringify({ pid: process.pid, id: this.id }), { flag: 'wx', mode: 0o600 });
    const take = (path: string, depth = 0): boolean => {
      if (depth > 4) return false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { linkSync(candidate, path); return true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        const previous = readOwner(path);
        // Unknown/corrupt ownership fails closed rather than risking a second runner.
        if (!previous) continue;
        if (alive(previous.pid)) return false;
        const recovery = `${path}.recover`;
        if (!take(recovery, depth + 1)) return false;
        try {
          const current = readOwner(path);
          if (current?.pid === previous.pid && current.id === previous.id && !alive(current.pid)) rmSync(path, { force: true });
        } finally {
          if (readOwner(recovery)?.id === this.id) rmSync(recovery, { force: true });
        }
      }
      return false;
    };
    try { return this.held = take(this.path); }
    finally { rmSync(candidate, { force: true }); }
  }

  isOwner(): boolean {
    return this.held && readOwner(this.path)?.id === this.id;
  }

  release(): void {
    if (this.isOwner()) rmSync(this.path, { force: true });
    this.held = false;
  }
}
