import { randomUUID } from 'node:crypto';
import { DEFAULT_POOL_ATTEMPTS, MAX_PARALLEL, MAX_POOL_CONCURRENCY, teamOrder, type AgentTeam, type TeamAgent, type TeamJob, type TeamRun } from './types.js';
import type { TeamStore } from './store.js';
import type { AutomationSource } from '../automations/types.js';
import { errorMessage } from '../util/errors.js';

interface TeamExecutor {
  (team: AgentTeam, agent: TeamAgent, task: string, upstream: TeamJob[], signal: AbortSignal, update: (change: Partial<TeamJob>) => void): Promise<string>;
}

/**
 * Zählsperre: lässt `limit` Rollen hinein, Wartende der Reihe nach.
 *
 * Gibt bewusst `undefined` zurück, wenn ein Platz frei ist, statt eines
 * erfüllten Promise: nur so bleibt eine startbereite Rolle im selben Tick wie
 * `start()` — die Oberfläche und der Speicher sehen sie sofort laufen.
 */
class Gate {
  private free: number;
  private waiting: Array<() => void> = [];
  constructor(limit: number) { this.free = limit; }
  enter(): Promise<void> | undefined {
    if (this.free > 0) { this.free--; return undefined; }
    return new Promise<void>(resolve => this.waiting.push(resolve));
  }
  leave(): void {
    const next = this.waiting.shift();
    if (next) next(); else this.free++;
  }
}

/** Ein Konto, das eine Pool-Einheit gerade nehmen darf (vom Host, Reihenfolge = Vorzug). */
export interface TeamPoolAccount { provider: string; account: string; model?: string }

interface PoolSeat { key: string; account: string; agent: TeamAgent }
interface PoolEntry { order: number; agent: TeamAgent; tried: Set<string>; seat?: PoolSeat; resolve?: (seat: PoolSeat) => void }

const accountKey = (provider: string, account: string) => `${provider}\n${account}`;

/**
 * Platzvergabe im Pool: eine Einheit ist an kein Konto gebunden, sondern nimmt
 * beim Start das erste Konto der Liste, das sie noch nicht versucht hat. Die
 * Liste nennt nur Konten, die gerade nutzbar sind, in Vorzugsreihenfolge —
 * zuerst das Konto des Schwarms. Ein Konto begrenzt die Zahl seiner Sitzungen
 * nicht; erreicht es sein Limit, fällt es aus der Liste, und die folgenden
 * Einheiten nehmen das nächste. Insgesamt laufen höchstens `limit` zugleich;
 * Wartende kommen in Listenreihenfolge dran, sobald ein Platz frei wird —
 * ohne Zeitgeber, nur beim Betreten und Verlassen.
 *
 * Wie Gate gibt enter() den Platz sofort zurück, wenn einer frei ist, damit
 * eine startbereite Einheit noch im Tick von start() losläuft.
 */
class PoolGate {
  private running = 0;
  private waiting: PoolEntry[] = [];
  constructor(private limit: number, private accounts: () => TeamPoolAccount[]) {}
  enter(order: number, agent: TeamAgent, tried: Set<string>): PoolSeat | Promise<PoolSeat> {
    const entry: PoolEntry = { order, agent, tried };
    const index = this.waiting.findIndex(other => other.order > order);
    this.waiting.splice(index < 0 ? this.waiting.length : index, 0, entry);
    this.pump();
    return entry.seat ?? new Promise<PoolSeat>(resolve => { entry.resolve = resolve; });
  }
  leave(): void {
    this.running--;
    this.pump();
  }
  private pump(): void {
    while (this.waiting.length && this.running < this.limit) {
      // Die Kontenliste je Start neu fragen: ein Konto, das gerade sein Limit
      // erreicht hat, bekommt keine weitere Einheit.
      const entry = this.waiting.shift()!;
      const seat = this.choose(entry, this.current());
      this.running++;
      entry.seat = seat; entry.resolve?.(seat);
    }
  }
  private current(): TeamPoolAccount[] {
    try { return this.accounts(); } catch { return []; }
  }
  /** Das erste noch nicht versuchte Konto der Liste, sonst ihr erstes. */
  private choose(entry: PoolEntry, list: TeamPoolAccount[]): PoolSeat {
    const own = entry.agent.target;
    // Ohne Kontenliste arbeitet die Einheit wie bisher auf ihrem eigenen Konto.
    if (!list.length) return { key: accountKey(own.provider, own.account), account: own.account, agent: entry.agent };
    const option = list.find(item => !entry.tried.has(accountKey(item.provider, item.account))) ?? list[0]!;
    const key = accountKey(option.provider, option.account);
    // Das Modell der Rolle gilt nur beim selben Anbieter weiter; die
    // Reasoning-Stärke nur, solange auch das Modell dasselbe bleibt.
    const model = option.model ?? (option.provider === own.provider ? own.model : undefined);
    const same = option.provider === own.provider && model === own.model;
    const { effort, ...rest } = entry.agent;
    const agent: TeamAgent = { ...rest, ...(same && effort !== undefined ? { effort } : {}),
      target: { provider: option.provider as TeamAgent['target']['provider'], account: option.account, ...(model ? { model } : {}) } };
    return { key, account: option.account, agent };
  }
}

const shorten = (text: string, limit = 160) => {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > limit ? line.slice(0, limit - 1) + '…' : line;
};

/** Handoffs stay ordered; roles without one run side by side. */
export class TeamRunner {
  private controllers = new Map<string, AbortController>();
  /**
   * `accounts` nennt die Konten, die Pool-Einheiten gerade nehmen dürfen
   * (Reihenfolge = Vorzug). Fehlt es oder liefert es nichts, bleibt jede
   * Einheit auf ihrem eigenen Konto.
   */
  constructor(private store: TeamStore, private execute: TeamExecutor, private changed: () => void, private accounts?: (team: AgentTeam) => TeamPoolAccount[]) {}
  start(teamId: string, task: string, source?: AutomationSource, expectedProfile?: AgentTeam): TeamRun {
    if (!task.trim() || task.length > 100_000) throw new Error('Gib einen gültigen Auftrag ein.');
    this.store.refresh();
    if (this.store.error) throw new Error(this.store.error);
    const team = this.store.teams.find(item => item.id === teamId);
    if (!team) throw new Error('Dieses Profil existiert nicht mehr.');
    if (expectedProfile && JSON.stringify(team) !== JSON.stringify(expectedProfile)) throw new Error('Das Profil wurde während der Startprüfung geändert. Starte den Auftrag erneut.');
    if (this.store.runs.some(run => run.teamId === teamId && run.status === 'running')) throw new Error(team.kind === 'agent' ? 'Dieser Agent arbeitet bereits.' : 'Dieses Team arbeitet bereits.');
    const snapshot = structuredClone(team);
    const run: TeamRun = { id: randomUUID(), kind: team.kind ?? 'team', teamId, teamName: team.name, task: task.trim(), ...(source ? { source: structuredClone(source) } : {}), status: 'running', startedAt: Date.now(), jobs: teamOrder(snapshot).map(agent => ({ agentId: agent.id, agentName: agent.name, status: 'waiting' })) };
    const controller = new AbortController();
    this.store.beginRun(run);
    this.controllers.set(run.id, controller);
    this.publish();
    void this.run(run, snapshot, controller).catch(error => {
      controller.abort();
      run.status = 'failed'; run.finishedAt = Date.now();
      for (const job of run.jobs) if (job.status === 'running' || job.status === 'waiting') {
        job.status = 'failed'; job.error = errorMessage(error); job.finishedAt = run.finishedAt; job.activity = undefined;
      }
      try { this.store.persist(); } catch { /* Store exposes the write error and retries on refresh. */ }
      this.publish();
    });
    return run;
  }
  stop(id: string): void {
    const controller = this.controllers.get(id);
    try { this.store.requestStop(id); }
    finally { controller?.abort(); }
    this.publish();
  }
  /** Call after store.refresh(); the owner receives requests from every window. */
  syncStops(): void {
    let changed = false;
    for (const [id, controller] of this.controllers) {
      if (!controller.signal.aborted && this.store.runs.some(run => run.id === id && run.stopRequested)) {
        controller.abort(); changed = true;
      }
    }
    if (changed) this.publish();
  }
  dispose(): void { for (const controller of this.controllers.values()) controller.abort(); }
  private publish(): void {
    // A disposed view must not change an agent's outcome or reject an unawaited run.
    try { this.changed(); } catch { /* The next getTeams reloads persisted state. */ }
  }
  private progress(job: TeamJob): (change: Partial<TeamJob>) => void {
    return change => {
      const durable = (change.conversationId !== undefined && change.conversationId !== job.conversationId)
        || (change.status !== undefined && change.status !== job.status)
        || (change.startedAt !== undefined && change.startedAt !== job.startedAt);
      Object.assign(job, change);
      // Preserve the chat link before a long-running provider turn;
      // activity-only updates may remain transient without disk churn.
      if (durable) this.store.persist();
      this.publish();
    };
  }
  /**
   * Eine Pool-Einheit: nimmt beim Start ein freies Konto und wird nach einem
   * Fehler bis `maxAttempts`-mal wiederholt, bevorzugt auf einem anderen Konto.
   */
  private async runPoolJob(run: TeamRun, team: AgentTeam, job: TeamJob, agent: TeamAgent, upstream: TeamJob[], controller: AbortController, pool: PoolGate, order: number): Promise<void> {
    const maxAttempts = team.pool?.maxAttempts ?? DEFAULT_POOL_ATTEMPTS;
    const tried = new Set<string>();
    for (;;) {
      const entered = pool.enter(order, agent, tried);
      const seat = entered instanceof Promise ? await entered : entered;
      let retry = false;
      try {
        if (run.stopRequested) controller.abort();
        if (controller.signal.aborted) {
          job.status = 'cancelled'; job.finishedAt = Date.now(); job.activity = undefined;
          this.store.persist(); this.publish(); return;
        }
        tried.add(seat.key);
        job.attempts = (job.attempts ?? 0) + 1; job.account = seat.account;
        job.status = 'running'; job.startedAt = Date.now(); job.activity = undefined; job.error = undefined;
        this.store.persist(); this.syncStops(); this.publish();
        try {
          job.result = await this.execute(team, seat.agent, run.task, upstream, controller.signal, this.progress(job));
          job.status = controller.signal.aborted ? 'cancelled' : 'completed';
        } catch (error) {
          job.error = errorMessage(error);
          if (!controller.signal.aborted && job.attempts < maxAttempts) {
            // Zurück in die Warteschlange; der Fehler bleibt sichtbar, bis der nächste Versuch beginnt.
            retry = true;
            job.status = 'waiting'; job.activity = `Wiederholung nach Fehler: ${shorten(job.error)}`;
          } else job.status = controller.signal.aborted ? 'cancelled' : 'failed';
        }
        if (!retry) { job.finishedAt = Date.now(); job.activity = undefined; }
        this.store.persist(); this.publish();
      } finally { pool.leave(); }
      if (!retry) return;
    }
  }
  private async run(run: TeamRun, team: AgentTeam, controller: AbortController): Promise<void> {
    const pool = team.pool
      ? new PoolGate(Math.max(1, Math.min(team.pool.concurrency ?? MAX_PARALLEL, MAX_POOL_CONCURRENCY)), () => this.accounts?.(team) ?? [])
      : undefined;
    const overall = new Gate(MAX_PARALLEL);
    const settled = new Map<string, Promise<void>>();
    try {
      // run.jobs kommt aus teamOrder(): Vorgänger stehen vor ihren Nachfolgern,
      // ihre Zusagen liegen hier also schon bereit.
      for (const [order, job] of run.jobs.entries()) {
        const agent = team.agents.find(item => item.id === job.agentId)!;
        const handoffs = agent.dependsOn
          .map(id => settled.get(id))
          .filter((promise): promise is Promise<void> => !!promise);
        const work = (async () => {
          // Ohne offene Übergabe kein await: die Rolle soll noch im Tick von
          // start() loslaufen, nicht erst im nächsten Microtask.
          if (handoffs.length) await Promise.all(handoffs);
          if (run.stopRequested) controller.abort();
          if (controller.signal.aborted) {
            job.status = 'cancelled'; job.finishedAt = Date.now();
            this.store.persist(); this.publish(); return;
          }
          const upstream = run.jobs.filter(other => agent.dependsOn.includes(other.agentId));
          if (upstream.some(other => other.status !== 'completed')) {
            job.status = 'blocked'; job.finishedAt = Date.now(); job.error = 'Eine benötigte Übergabe wurde nicht abgeschlossen.';
            this.store.persist(); this.publish(); return;
          }
          if (pool) return this.runPoolJob(run, team, job, agent, upstream, controller, pool, order);
          const place = overall.enter();
          if (place) await place;
          try {
            if (run.stopRequested) controller.abort();
            if (controller.signal.aborted) {
              job.status = 'cancelled'; job.finishedAt = Date.now();
              this.store.persist(); this.publish(); return;
            }
            job.status = 'running'; job.startedAt = Date.now(); job.activity = undefined;
            this.store.persist(); this.syncStops(); this.publish();
            try {
              job.result = await this.execute(team, agent, run.task, upstream, controller.signal, this.progress(job));
              job.status = controller.signal.aborted ? 'cancelled' : 'completed';
            } catch (error) {
              job.status = controller.signal.aborted ? 'cancelled' : 'failed';
              job.error = errorMessage(error);
            }
            job.finishedAt = Date.now(); job.activity = undefined;
            this.store.persist(); this.publish();
          } finally { overall.leave(); }
        })();
        // Eine gescheiterte Rolle darf die übrigen nicht mitreißen: sie trägt
        // ihren Fehler selbst ein, damit Promise.all die anderen abwartet.
        settled.set(job.agentId, work.catch(error => {
          job.status = 'failed'; job.error = errorMessage(error);
          job.finishedAt = Date.now(); job.activity = undefined;
          try { this.store.persist(); } catch { /* Store meldet den Schreibfehler beim nächsten refresh. */ }
          this.publish();
        }));
      }
      await Promise.all(settled.values());
      run.status = controller.signal.aborted ? 'cancelled' : run.jobs.every(job => job.status === 'completed') ? 'completed' : 'failed';
    } finally {
      run.finishedAt = Date.now();
      this.controllers.delete(run.id);
      this.store.persist(); this.publish();
    }
  }
}
