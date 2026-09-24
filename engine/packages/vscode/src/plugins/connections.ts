import { probeServer, type McpServerDef, type PluginConnection, type ProbeOptions, type ProbeResult } from '@cortex/core';

/**
 * Das letzte Prüfergebnis je Server — gemerkt, damit die Seite beim Öffnen
 * nicht leer „Prüfe …“ zeigt, und neu erhoben, sobald es alt ist.
 *
 * Ein Ergebnis ist ein Beleg mit Zeitstempel, keine Eigenschaft des Plugins:
 * „Verbunden“ heißt „hat um 04:12 seine 29 Werkzeuge genannt“.
 */

/** Genau das, was diese Klasse vom globalState braucht. */
interface ConnectionMemory {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'cortex.plugins.connections';
/** So alt darf ein Ergebnis werden, bevor das Öffnen der Seite neu prüft. */
export const STALE_AFTER_MS = 10 * 60_000;
/** Nie mehr Prüfungen auf einmal — jede lokale startet einen Prozess, oft über npx. */
const PARALLEL = 3;

type Prober = (def: McpServerDef, options: { timeoutMs?: number; readiness?: ProbeOptions['readiness'] }) => Promise<ProbeResult>;

export class PluginConnections {
  private results: Record<string, PluginConnection>;
  private running = new Map<string, Promise<PluginConnection>>();
  private queue: Array<() => void> = [];
  private active = 0;
  private listeners: Array<() => void> = [];

  constructor(
    private memory: ConnectionMemory,
    private probe: Prober = probeServer,
  ) {
    const saved = memory.get<Record<string, PluginConnection>>(KEY, {});
    // Eine Prüfung, die beim letzten Beenden noch lief, hat kein Ergebnis.
    this.results = Object.fromEntries(Object.entries(saved).filter(([, r]) => r.status !== 'pruefe'));
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  all(): Record<string, PluginConnection> {
    return { ...this.results };
  }

  get(server: string): PluginConnection | undefined {
    return this.results[server];
  }

  /** Vergessen — beim Entfernen, damit ein neu installiertes Plugin nicht mit altem Beleg dasteht. */
  forget(server: string): void {
    if (!(server in this.results)) return;
    delete this.results[server];
    this.persist();
  }

  isStale(server: string, now = Date.now()): boolean {
    const result = this.results[server];
    if (!result) return true;
    if (result.status === 'pruefe') return false;
    return !result.checkedAt || now - result.checkedAt > STALE_AFTER_MS;
  }

  /**
   * Sofort als „prüft“ markieren, noch bevor die eigentliche Prüfung beginnt —
   * etwa während vorher ein Token aufgefrischt wird. So zeigt die Seite nie
   * „Nicht geprüft“ für etwas, das gerade geprüft wird.
   */
  begin(server: string): void {
    if (this.running.has(server) || this.results[server]?.status === 'pruefe') return;
    this.results[server] = { ...this.results[server], status: 'pruefe' };
    this.emit();
  }

  /** Was die CLIs sagen, an das letzte Ergebnis hängen. `transient`: nur anzeigen, nicht merken. */
  attachClis(server: string, clis: NonNullable<PluginConnection['clis']>, transient = false): void {
    const result = this.results[server];
    if (!result) return;
    this.results[server] = { ...result, clis };
    if (transient) this.emit();
    else this.persist();
  }

  /**
   * Prüfen. Läuft für diesen Server schon eine Prüfung, gilt deren Ergebnis —
   * zwei Klicks starten keine zwei Prozesse.
   */
  check(server: string, def: McpServerDef, timeoutMs?: number, readiness?: ProbeOptions['readiness']): Promise<PluginConnection> {
    return this.checkWith(server, async () => toConnection(await this.probe(def, { timeoutMs, readiness })));
  }

  /** Dieselbe Prüfung mit eigenem Beleg — etwa, wenn nur die CLIs selbst an den Server kommen. */
  checkWith(server: string, work: () => Promise<PluginConnection>): Promise<PluginConnection> {
    const running = this.running.get(server);
    if (running) return running;

    const previous = this.results[server];
    this.results[server] = { ...previous, status: 'pruefe' };
    this.emit();

    const task = this.slot(async () => {
      const connection = await work();
      this.results[server] = connection;
      this.persist();
      return connection;
    }).finally(() => this.running.delete(server));
    this.running.set(server, task);
    return task;
  }

  private slot<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active++;
        work()
          .then(resolve, reject)
          .finally(() => {
            this.active--;
            this.queue.shift()?.();
          });
      };
      if (this.active < PARALLEL) start();
      else this.queue.push(start);
    });
  }

  private persist(): void {
    const finished = Object.fromEntries(Object.entries(this.results).filter(([, r]) => r.status !== 'pruefe'));
    void this.memory.update(KEY, finished);
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function toConnection(result: ProbeResult, now = Date.now()): PluginConnection {
  if (result.ok) {
    return {
      status: 'verbunden',
      checkedAt: now,
      tools: result.tools.map(({ name, title, description }) => ({ name, title, description })),
      server: result.server,
      ...(result.log ? { log: result.log } : {}),
      ...(result.notice ? { notice: result.notice, detail: result.noticeDetail } : {}),
    };
  }
  if (result.reason === 'auth') {
    return { status: 'anmeldung', checkedAt: now, message: result.message, detail: result.detail };
  }
  return { status: 'fehler', checkedAt: now, message: result.message, detail: result.detail, ...(result.log ? { log: result.log } : {}) };
}
