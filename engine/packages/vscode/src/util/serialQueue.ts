/**
 * Führt Arbeiten strikt nacheinander aus, in der Reihenfolge ihres Eintreffens.
 * Eine gescheiterte Arbeit hält die Schlange nicht an: die nächste startet
 * trotzdem, und nur der Aufrufer der gescheiterten sieht den Fehler.
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Erfüllt sich, sobald alles bis jetzt Eingereihte fertig ist — scheitert nie. */
  idle(): Promise<unknown> {
    return this.tail;
  }
}
