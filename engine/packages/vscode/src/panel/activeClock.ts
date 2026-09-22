/** Monotonic active elapsed time. A suspended event loop contributes at most one tick. */
export class ActiveClock {
  private last: number;
  private total = 0;
  constructor(private now: () => number = () => performance.now()) { this.last = now(); }
  elapsed(): number {
    const next = this.now();
    const delta = Math.max(0, next - this.last);
    this.last = next;
    this.total += delta > 5000 ? 1000 : delta;
    return Math.round(this.total);
  }
}
