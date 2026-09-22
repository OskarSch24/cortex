/**
 * Hält den Exokortex-Status frisch, solange jemand hinsieht.
 *
 * Die Form ist die von `startAuthWatch`: ein Wiedereintritts-Riegel, ein
 * sofortiger erster Durchgang, ein Intervall, ein Disposable. Ein Unterschied
 * ist wesentlich — dieser Wächter läuft **nicht** die ganze Sitzung, sondern
 * nur, solange die Seite offen ist. Wer sie nie aufschlägt, zahlt nichts.
 */
export interface WatchOptions {
  /** Wie oft nachgesehen wird, in Minuten. */
  intervallMinuten: number;
  /** Einen Durchgang machen. Darf nie werfen — ein Fehler wird eine Kachel. */
  tick: () => Promise<void>;
  /** Für den Fall, dass ein Durchgang doch wirft. */
  onFehler?: (fehler: unknown) => void;
}

export class StatusWatch {
  private timer?: ReturnType<typeof setInterval>;
  private laeuft = false;
  /** Wie viele Oberflächen die Seite gerade zeigen. */
  private offen = 0;

  constructor(private readonly opts: WatchOptions) {}

  /** Eine Seite wurde geöffnet oder geschlossen. */
  setOffen(open: boolean): void {
    this.offen = Math.max(0, this.offen + (open ? 1 : -1));
    if (this.offen > 0) this.start();
    else this.stop();
  }

  private start(): void {
    if (this.timer) return;
    void this.durchgang();
    this.timer = setInterval(() => void this.durchgang(), this.opts.intervallMinuten * 60_000);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Sofort nachsehen, ohne den Takt zu verschieben. */
  jetzt(): Promise<void> {
    return this.durchgang();
  }

  /**
   * Ein langsamer Durchgang darf sich nicht mit dem nächsten überlappen: nach
   * einer Einspeisung baut der Leseserver seinen Index nach, und dann dauert
   * derselbe Abruf zwanzig Sekunden statt einer halben.
   */
  private async durchgang(): Promise<void> {
    if (this.laeuft) return;
    this.laeuft = true;
    try {
      await this.opts.tick();
    } catch (e) {
      this.opts.onFehler?.(e);
    } finally {
      this.laeuft = false;
    }
  }

  dispose(): void {
    this.stop();
    this.offen = 0;
  }
}
