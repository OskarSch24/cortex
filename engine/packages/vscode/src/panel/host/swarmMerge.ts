/**
 * Die Merge-Warteschlange eines Schwarms, vom Host aus gesehen („Schritt 3“).
 *
 * Einheiten mit eigenem Worktree liefern ihre Arbeit als Branch ab. Ist die
 * Warteschlange für einen Lauf eingeschaltet (`/merge-queue` oder der Knopf in
 * der Übersicht), übernimmt sie jede fertige Einheit der Reihe nach auf einen
 * eigenen Zusammenführungs-Branch und prüft danach (teams/mergeQueue.ts). In
 * den Branch des Nutzers kommt das Ergebnis erst mit „übernehmen“ — nie, ohne
 * dass er es verlangt.
 *
 * Der Stand steht am Lauf (TeamRun.merge, TeamJob.merge) und kommt über
 * teamsState in die Übersicht; geschrieben wird er mit store.updateMerge, weil
 * die Warteschlange über das Ende des Laufs hinaus arbeitet.
 */
import { adoptIntegration, cleanupUnit, createIntegration, MergeQueue } from '../../teams/mergeQueue.js';
import type { TeamStore } from '../../teams/store.js';
import type { TeamJob, TeamRun, UnitMerge } from '../../teams/types.js';

export interface SwarmMergeHost {
  teams(): TeamStore;
  /** Wo Worktrees von Cortex liegen (globalStorage). */
  storageDir: string;
  /** Neuer Stand an alle Fenster. */
  publish(): void;
  /** Eine Zeile in den Chat, der den Schwarm gestartet hat. */
  notice(runId: string, text: string): void;
  /** Die Prüfungen, die Cortex im Projekt erkennt, als Shell-Befehle. */
  defaultChecks(projectPath: string): string[];
}

const pending = (job: TeamJob) => job.status === 'completed' && !!job.branch && !!job.base && (!job.merge || job.merge.state === 'waiting');

export class SwarmMerge {
  private readonly queues = new Map<string, MergeQueue>();
  private readonly starting = new Map<string, Promise<void>>();
  /** Je Lauf die Einheiten, die schon in der Warteschlange stehen — jede nur einmal. */
  private readonly offered = new Map<string, Set<string>>();

  constructor(private readonly host: SwarmMergeHost) {}

  /** Der Lauf dieses Chats, um den es geht: der jüngste Schwarm mit Einheiten-Branches. */
  latestRun(conversationId: string): TeamRun | undefined {
    const prefix = `swarm-${conversationId}-`;
    return [...this.host.teams().runs].reverse().find(run => run.teamId.startsWith(prefix) && run.jobs.some(job => job.branch));
  }

  /** Einschalten und alles Fertige einreihen. Ohne `checks` gelten die erkannten Prüfungen des Projekts. */
  async start(runId: string, checks?: string[]): Promise<void> {
    const running = this.starting.get(runId);
    if (running) return running;
    const work = this.begin(runId, checks).finally(() => this.starting.delete(runId));
    this.starting.set(runId, work);
    return work;
  }

  private async begin(runId: string, checks?: string[]): Promise<void> {
    const store = this.host.teams();
    store.refresh();
    const run = store.runs.find(entry => entry.id === runId);
    if (!run) throw new Error('Diesen Schwarm-Lauf gibt es nicht mehr.');
    const team = store.teams.find(entry => entry.id === run.teamId);
    if (!team?.projectPath || team.isolation !== 'worktree') throw new Error('Zusammenführen geht nur für Schwärme, deren Einheiten in eigenen Git-Worktrees arbeiten.');
    const useChecks = checks?.length ? checks : run.merge?.checks?.length ? run.merge.checks : this.host.defaultChecks(team.projectPath);
    const integration = await createIntegration({ cwd: team.projectPath, storageDir: this.host.storageDir, runId });
    store.updateMerge(runId, entry => {
      entry.merge = { ...entry.merge, enabled: true, checks: useChecks, targetBranch: integration.target, integrationBranch: integration.branch, integrationPath: integration.path };
      delete entry.merge.adopted; delete entry.merge.adoptDetail;
    });
    this.queues.get(runId)?.stop();
    // Die Warteschlange kennt Einheiten unter ihrer Kennung: Namen können sich wiederholen.
    const queue = new MergeQueue(integration, useChecks, (agentId, merge) => this.changed(runId, agentId, merge));
    this.queues.set(runId, queue);
    this.offered.set(runId, new Set());
    this.host.notice(runId, `Zusammenführung läuft auf ${integration.branch}${useChecks.length ? ` · Prüfungen: ${useChecks.join(' · ')}` : ' · ohne Prüfbefehl'}.`);
    for (const job of run.jobs) this.offer(runId, job);
    this.host.publish();
  }

  /**
   * Bei jedem neuen Stand: fertige Einheiten eingeschalteter Läufe einreihen,
   * und eine Warteschlange, die vor einem Neustart lief, wieder aufnehmen.
   */
  sweep(): void {
    for (const run of this.host.teams().runs) {
      if (!run.merge?.enabled) continue;
      if (!this.queues.has(run.id)) { if (!this.starting.has(run.id)) void this.start(run.id).catch(error => this.host.notice(run.id, `Zusammenführung angehalten: ${(error as Error).message}`)); continue; }
      for (const job of run.jobs) this.offer(run.id, job);
    }
  }

  private offer(runId: string, job: TeamJob): void {
    const queue = this.queues.get(runId), offered = this.offered.get(runId);
    if (!queue || !offered || offered.has(job.agentId) || !pending(job)) return;
    offered.add(job.agentId);
    // Wer außerhalb seines Bereichs geändert hat, wird nicht übernommen.
    if (job.outside?.length) { this.changed(runId, job.agentId, { state: 'outside', detail: `Außerhalb des Bereichs: ${job.outside.join(', ')}`, at: Date.now() }); return; }
    queue.enqueue({ branch: job.branch!, base: job.base!, name: job.agentId });
  }

  private changed(runId: string, agentId: string, merge: UnitMerge): void {
    const store = this.host.teams();
    let cleanup: { root: string; path: string; branch: string } | undefined;
    try {
      store.updateMerge(runId, run => {
        const job = run.jobs.find(entry => entry.agentId === agentId);
        if (job) job.merge = merge;
      });
    } catch { /* Der Stand wird beim nächsten Wechsel erneut geschrieben. */ }
    const run = store.runs.find(entry => entry.id === runId);
    const job = run?.jobs.find(entry => entry.agentId === agentId);
    const unitName = job?.agentName ?? agentId;
    const team = run && store.teams.find(entry => entry.id === run.teamId);
    if ((merge.state === 'merged' || merge.state === 'skipped') && job?.branch && job.worktree && team?.projectPath) cleanup = { root: team.projectPath, path: job.worktree, branch: job.branch };
    // Übernommen oder ohne Änderung: Worktree und Branch der Einheit haben ihren Zweck erfüllt.
    // Bei Konflikten bleiben beide stehen, damit man nachsehen kann.
    if (cleanup) void cleanupUnit(cleanup).catch(() => undefined);
    if (merge.state === 'conflict' || merge.state === 'checks-failed') this.host.notice(runId, `${unitName} nicht übernommen: ${merge.detail ?? merge.state}`.slice(0, 600));
    this.host.publish();
  }

  /** Das Ergebnis in den Branch des Nutzers holen. */
  async adopt(runId: string): Promise<void> {
    const store = this.host.teams();
    store.refresh();
    const run = store.runs.find(entry => entry.id === runId);
    const team = run && store.teams.find(entry => entry.id === run.teamId);
    if (!run?.merge?.integrationBranch || !run.merge.targetBranch || !team?.projectPath) throw new Error('Für diesen Lauf gibt es noch nichts zu übernehmen.');
    if (run.jobs.some(job => job.merge?.state === 'waiting' || job.merge?.state === 'merging')) throw new Error('Die Zusammenführung läuft noch — warte, bis alle Einheiten durch sind.');
    const result = await adoptIntegration({ root: team.projectPath, integrationBranch: run.merge.integrationBranch, target: run.merge.targetBranch });
    store.updateMerge(runId, entry => {
      if (!entry.merge) return;
      entry.merge.adopted = result.ok ? 'ok' : 'failed';
      if (result.ok) delete entry.merge.adoptDetail; else entry.merge.adoptDetail = result.detail;
    });
    this.host.notice(runId, result.ok ? `Schwarm in ${run.merge.targetBranch} übernommen (${result.commit.slice(0, 8)}).` : `Übernehmen ging nicht: ${result.detail}`);
    this.host.publish();
  }

  /** Anhalten: die laufende Prüfung bricht ab, Wartende bleiben „wartet“ und können später weiter. */
  stop(runId: string): void {
    this.queues.get(runId)?.stop();
    this.queues.delete(runId);
    this.offered.delete(runId);
    try {
      this.host.teams().updateMerge(runId, run => {
        if (run.merge) run.merge.enabled = false;
        for (const job of run.jobs) if (job.merge?.state === 'merging') job.merge = { state: 'waiting' };
      });
    } catch { /* siehe changed */ }
    this.host.publish();
  }

  dispose(): void {
    for (const queue of this.queues.values()) queue.stop();
    this.queues.clear();
  }
}
