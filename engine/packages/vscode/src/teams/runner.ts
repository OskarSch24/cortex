import { randomUUID } from 'node:crypto';
import { MAX_PARALLEL, MAX_PER_ACCOUNT, teamOrder, type AgentTeam, type TeamAgent, type TeamJob, type TeamRun } from './types.js';
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

/** Handoffs stay ordered; roles without one run side by side. */
export class TeamRunner {
  private controllers = new Map<string, AbortController>();
  constructor(private store: TeamStore, private execute: TeamExecutor, private changed: () => void) {}
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
  private async run(run: TeamRun, team: AgentTeam, controller: AbortController): Promise<void> {
    const overall = new Gate(MAX_PARALLEL);
    const accounts = new Map<string, Gate>();
    const accountGate = (agent: TeamAgent): Gate => {
      const key = `${agent.target.provider}\n${agent.target.account}`;
      const known = accounts.get(key);
      if (known) return known;
      const gate = new Gate(MAX_PER_ACCOUNT);
      accounts.set(key, gate);
      return gate;
    };
    const settled = new Map<string, Promise<void>>();
    try {
      // run.jobs kommt aus teamOrder(): Vorgänger stehen vor ihren Nachfolgern,
      // ihre Zusagen liegen hier also schon bereit.
      for (const job of run.jobs) {
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
          // Erst das Konto, dann den Gesamtplatz — sonst hält eine wartende Rolle
          // einen Platz besetzt, den eine andere sofort nutzen könnte.
          const gate = accountGate(agent);
          const seat = gate.enter();
          if (seat) await seat;
          try {
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
                job.result = await this.execute(team, agent, run.task, upstream, controller.signal, change => {
                  const durable = (change.conversationId !== undefined && change.conversationId !== job.conversationId)
                    || (change.status !== undefined && change.status !== job.status)
                    || (change.startedAt !== undefined && change.startedAt !== job.startedAt);
                  Object.assign(job, change);
                  // Preserve the chat link before a long-running provider turn;
                  // activity-only updates may remain transient without disk churn.
                  if (durable) this.store.persist();
                  this.publish();
                });
                job.status = controller.signal.aborted ? 'cancelled' : 'completed';
              } catch (error) {
                job.status = controller.signal.aborted ? 'cancelled' : 'failed';
                job.error = errorMessage(error);
              }
              job.finishedAt = Date.now(); job.activity = undefined;
              this.store.persist(); this.publish();
            } finally { overall.leave(); }
          } finally { gate.leave(); }
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
