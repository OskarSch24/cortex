export type SettingAck = { key: string; requestId: string; error?: string };
export class OptimisticSettings {
  private confirmed: Record<string, unknown> = {};
  private pending = new Map<string, { value: unknown; requestId: string }>();
  private revision = -1;
  values(): Record<string, unknown> {
    return { ...this.confirmed, ...Object.fromEntries([...this.pending].map(([key, item]) => [key, item.value])) };
  }
  write(key: string, value: unknown, requestId: string): void { this.pending.set(key, { value, requestId }); }
  receive(values: Record<string, unknown>, revision?: number, ack?: SettingAck): void {
    if (revision === undefined || revision >= this.revision) {
      this.confirmed = values;
      if (revision !== undefined) this.revision = revision;
    }
    if (ack && this.pending.get(ack.key)?.requestId === ack.requestId) this.pending.delete(ack.key);
  }
}
