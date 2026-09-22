import type { ImageOptions } from './imageOptions.js';
import type { Effort, PermissionMode, Target } from '@cortex/core';

export interface QueuedMessage {
  id: string;
  text: string;
  tags: string[];
  modes: { effort?: Effort; permissionMode?: PermissionMode; askPermission?: boolean; routingMode?: 'auto' | 'manual'; attachments?: string[]; target?: Target; image?: ImageOptions; imageProvider?: string };
}
export type QueuePauseReason = 'error' | 'stopped' | 'restored' | 'project';

/** One asynchronous worker per conversation; mutations of pending items are synchronous. */
export class MessageQueue {
  private pending = new Map<string, QueuedMessage[]>();
  private working = new Set<string>();
  private paused = new Set<string>();
  private reasons = new Map<string, QueuePauseReason>();
  private held = new Set<string>();
  constructor(private run: (conversationId: string, item: QueuedMessage) => Promise<void | false>, private changed: (conversationId: string) => void, private failed: (conversationId: string, error: unknown) => void) {}
  items(id: string): readonly QueuedMessage[] { return this.pending.get(id) ?? []; }
  isWorking(id: string) { return this.working.has(id); }
  isPaused(id: string) { return this.paused.has(id); }
  pauseReason(id: string) { return this.reasons.get(id); }
  isHeld(id: string) { return this.held.has(id); }
  /** Keep pending items in place while a provider acknowledges live steering. */
  hold(id: string) {
    if (this.held.has(id)) return;
    this.held.add(id); this.changed(id);
    return () => { this.held.delete(id); this.changed(id); void this.drain(id); };
  }
  enqueue(id: string, item: QueuedMessage) {
    this.pending.set(id, [...this.items(id), item]); this.changed(id); void this.drain(id);
  }
  remove(id: string, itemId: string) {
    const list = this.items(id); const item = list.find(m => m.id === itemId);
    if (!item) return;
    this.pending.set(id, list.filter(m => m.id !== itemId)); this.changed(id); return item;
  }
  edit(id: string, itemId: string, text: string, tags: string[]) {
    if (!text.trim()) return;
    this.pending.set(id, this.items(id).map(m => m.id === itemId ? { ...m, text: text.trim(), tags } : m)); this.changed(id);
  }
  move(id: string, itemId: string, direction: -1 | 1) {
    const list = [...this.items(id)]; const from = list.findIndex(m => m.id === itemId); const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to]!, list[from]!]; this.pending.set(id, list); this.changed(id);
  }
  pause(id: string, reason: QueuePauseReason = 'stopped') { this.paused.add(id); this.reasons.set(id, reason); this.changed(id); }
  resume(id: string) { this.paused.delete(id); this.reasons.delete(id); this.changed(id); void this.drain(id); }
  clearPending(id: string) { this.pending.delete(id); this.changed(id); }
  retryBlockedProjects() { for (const [id, reason] of this.reasons) if (reason === 'project') this.resume(id); }
  delete(id: string) { this.pending.delete(id); this.paused.add(id); this.changed(id); }
  clear() { for (const id of this.pending.keys()) this.delete(id); }
  snapshot() { return Object.fromEntries([...this.pending].filter(([, items]) => items.length)); }
  restore(saved: Record<string, QueuedMessage[]>) {
    for (const [id, items] of Object.entries(saved)) {
      if (!Array.isArray(items)) continue;
      const valid = items.filter(m => m && typeof m.id === 'string' && typeof m.text === 'string' && Array.isArray(m.tags) && m.modes);
      if (valid.length) { this.pending.set(id, valid); this.paused.add(id); this.reasons.set(id, 'restored'); }
    }
  }
  private async drain(id: string) {
    if (this.working.has(id) || this.paused.has(id) || this.held.has(id)) return;
    this.working.add(id);
    try {
      while (!this.paused.has(id) && !this.held.has(id) && this.items(id).length) {
        const [item, ...rest] = this.items(id); this.pending.set(id, rest); this.changed(id);
        try {
          if (await this.run(id, item!) === false) {
            this.pending.set(id, [item!, ...this.items(id)]);
            if (!this.paused.has(id)) this.pause(id, 'project');
            break;
          }
        }
        catch (error) { this.paused.add(id); this.reasons.set(id, 'error'); this.failed(id, error); break; }
      }
    } finally { this.working.delete(id); this.changed(id); }
  }
}
