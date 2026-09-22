import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { teamProfileSignature, validateTeam, type AgentTeam, type TeamRun } from './types.js';
import { validateAutomation } from '../automations/cron.js';

interface TeamFile { version: 1; revision: number; teams: AgentTeam[]; runs: TeamRun[] }
const changedMessage = 'Die Teams wurden inzwischen geändert. Lade den aktuellen Stand, bevor du speicherst.';
const busyMessage = 'Ein anderes Cortex-Fenster speichert gerade die Teams. Versuche es erneut.';
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
};

/** Shared profiles use file-level CAS; a host may update only the runs it owns. */
export class TeamStore {
  teams: AgentTeam[] = [];
  runs: TeamRun[] = [];
  revision = 0;
  error?: string;
  readonly instanceId = randomUUID();
  private ownedRunIds = new Set<string>();
  private writeError?: string;
  constructor(private path: string) { this.refresh(); }

  /** Reload foreign changes without replacing live objects held by our runner. */
  refresh(): void {
    try {
      this.locked(() => {
        const latest = this.read();
        const recovered = this.recoverOrphans(latest);
        if (this.writeError) this.mergeOwnedRuns(latest);
        if (recovered || this.writeError) this.write(latest);
        this.writeError = undefined;
        this.adopt(latest);
      });
      this.error = undefined;
    } catch (error) {
      this.error = 'Teams konnten nicht geladen werden: ' + (error as Error).message;
    }
  }

  ownsRun(id: string): boolean { return this.ownedRunIds.has(id); }

  /** Any Cortex window may request cancellation without rewriting the owner's status. */
  requestStop(id: string): void {
    this.mutate(latest => {
      const run = latest.runs.find(candidate => candidate.id === id);
      if (!run) throw new Error('Dieser Auftrag ist nicht mehr verfügbar.');
      if (run.status === 'running') run.stopRequested = true;
    });
  }

  save(team: AgentTeam, expectedRevision: number, baseSignature?: string): void {
    const validated = validateTeam(team);
    if (validated.automation) validated.automation = validateAutomation(validated.automation);
    this.mutate(latest => {
      this.checkRevision(latest, expectedRevision);
      if (baseSignature !== undefined) {
        const current = latest.teams.find(item => item.id === team.id);
        if (!current || teamProfileSignature(current) !== baseSignature) throw new Error('Dieses Profil wurde inzwischen geändert. Dein Entwurf bleibt erhalten. Lade das Profil neu, bevor du diese Änderungen speicherst.');
      }
      if (latest.runs.some(run => run.teamId === team.id && run.status === 'running')) {
        const current = latest.teams.find(item => item.id === team.id);
        const execution = (profile: AgentTeam | undefined) => profile && JSON.stringify({ ...profile, automation: undefined, updatedAt: 0 });
        // Pausing future triggers must remain possible while the frozen run
        // finishes. Changes to roles, tools or project still require stopping it.
        if (execution(current) !== execution(validated)) throw new Error('Beende den laufenden Auftrag, bevor du dieses Profil änderst. Zeitplan und Webhook kannst du schon jetzt anpassen.');
      }
      latest.teams = [...latest.teams.filter(item => item.id !== team.id), validated];
    });
  }

  remove(id: string, expectedRevision: number): void {
    this.mutate(latest => {
      this.checkRevision(latest, expectedRevision);
      if (latest.runs.some(run => run.teamId === id && run.status === 'running')) throw new Error('Beende zuerst den laufenden Auftrag.');
      latest.teams = latest.teams.filter(team => team.id !== id);
    });
  }

  /** The running check and insertion happen under one cross-process lock. */
  beginRun(run: TeamRun): void {
    const snapshot = this.teams.find(team => team.id === run.teamId);
    if (!snapshot) throw new Error('Dieses Profil existiert nicht mehr.');
    const owned: TeamRun = { ...run, ownerPid: process.pid, ownerId: this.instanceId };
    this.mutate(latest => {
      const team = latest.teams.find(team => team.id === run.teamId);
      if (!team) throw new Error('Dieses Profil existiert nicht mehr.');
      if (JSON.stringify(team) !== JSON.stringify(snapshot)) throw new Error(changedMessage);
      if (latest.runs.some(other => other.teamId === run.teamId && other.status === 'running')) throw new Error(team.kind === 'agent' ? 'Dieser Agent arbeitet bereits in einem Cortex-Fenster.' : 'Dieses Team arbeitet bereits in einem Cortex-Fenster.');
      if (latest.runs.some(other => other.id === run.id)) throw new Error('Diese Laufkennung wird bereits verwendet.');
      latest.runs.push(owned);
    });
    Object.assign(run, owned);
    this.ownedRunIds.add(run.id);
    this.runs = this.runs.map(candidate => candidate.id === run.id ? run : candidate);
  }

  /** Persist only our own run objects; never write a stale team/foreign-run snapshot. */
  persist(): void {
    try { this.mutate(latest => this.mergeOwnedRuns(latest)); }
    catch (error) {
      this.writeError = `Der Teamstatus konnte nicht gespeichert werden: ${(error as Error).message}`;
      this.error = this.writeError;
      throw error;
    }
  }

  private mergeOwnedRuns(latest: TeamFile): void {
    const own = new Map(this.runs.filter(run => this.ownedRunIds.has(run.id)).map(run => [run.id, run]));
    latest.runs = latest.runs.map(run => {
      const update = own.get(run.id);
      if (!update) return run;
      if (run.ownerId !== this.instanceId || run.ownerPid !== process.pid) throw new Error('Der Teamauftrag gehört inzwischen einem anderen Cortex-Fenster.');
      // Another window may have requested Stop after our last refresh. Never
      // erase that one writable foreign field when persisting live progress.
      if (run.stopRequested) update.stopRequested = true;
      return update;
    });
  }

  private checkRevision(latest: TeamFile, expected: number): void {
    if (expected !== latest.revision) throw new Error(changedMessage);
  }

  private mutate(change: (latest: TeamFile) => void): void {
    if (this.error && this.error !== this.writeError) throw new Error(this.error);
    this.locked(() => {
      const latest = this.read();
      this.recoverOrphans(latest);
      change(latest);
      this.write(latest);
      this.adopt(latest);
      this.writeError = undefined; this.error = undefined;
    });
  }

  private read(): TeamFile {
    let value: unknown;
    try { value = JSON.parse(readFileSync(this.path, 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, revision: 0, teams: [], runs: [] };
      throw error;
    }
    const data = value as Partial<TeamFile> | null;
    if (!data || data.version !== 1 || !Array.isArray(data.teams) || !Array.isArray(data.runs)) throw new Error('Unbekanntes Teamformat.');
    const teams = data.teams.map(team => {
      const validated = validateTeam(team);
      return { ...validated, ...(typeof team.updatedAt === 'number' && Number.isFinite(team.updatedAt) ? { updatedAt: team.updatedAt } : {}) };
    });
    const jobStatuses = ['waiting', 'running', 'completed', 'failed', 'cancelled', 'blocked'];
    for (const run of data.runs) {
      if (!run || typeof run.id !== 'string' || typeof run.teamId !== 'string' || typeof run.teamName !== 'string' || typeof run.task !== 'string'
        || (run.kind !== undefined && run.kind !== 'agent' && run.kind !== 'team')
        || !['running', 'completed', 'failed', 'cancelled'].includes(run.status) || !Array.isArray(run.jobs)
        || run.jobs.some(job => !job || typeof job.agentId !== 'string' || typeof job.agentName !== 'string' || !jobStatuses.includes(job.status))
        || (run.ownerPid !== undefined && (!Number.isSafeInteger(run.ownerPid) || run.ownerPid <= 0))
        || (run.ownerId !== undefined && typeof run.ownerId !== 'string')
        || (run.stopRequested !== undefined && typeof run.stopRequested !== 'boolean')) throw new Error('Ein gespeicherter Teamauftrag ist ungültig.');
    }
    if (new Set(teams.map(team => team.id)).size !== teams.length || new Set(data.runs.map(run => run.id)).size !== data.runs.length) throw new Error('Teamkennungen sind mehrfach gespeichert.');
    if (data.revision !== undefined && (!Number.isSafeInteger(data.revision) || data.revision < 0)) throw new Error('Ungültiger Teamstand.');
    return { version: 1, revision: data.revision ?? 0, teams, runs: data.runs };
  }

  private recoverOrphans(state: TeamFile): boolean {
    let changed = false;
    for (const run of state.runs) {
      // Old files had no ownership metadata. New files are interrupted only
      // when the owning process is demonstrably gone, never on another window.
      if (run.status !== 'running' || (run.ownerPid !== undefined && alive(run.ownerPid))) continue;
      changed = true;
      run.status = 'cancelled'; run.finishedAt = Date.now();
      for (const job of run.jobs) if (job.status === 'running' || job.status === 'waiting') {
        job.status = 'cancelled'; job.finishedAt = run.finishedAt; job.activity = undefined;
        job.error = 'Cortex wurde beendet. Starte den Auftrag erneut, um weiterzuarbeiten.';
      }
    }
    return changed;
  }

  private adopt(state: TeamFile): void {
    const own = new Map(this.runs.filter(run => this.ownedRunIds.has(run.id)).map(run => [run.id, run]));
    this.teams = state.teams;
    this.runs = state.runs.map(run => {
      const live = own.get(run.id);
      if (!live) return run;
      if (run.stopRequested) live.stopRequested = true;
      return live;
    });
    this.revision = state.revision;
  }

  private write(state: TeamFile): void {
    // Keep every live run; bound only finished history.
    const keep = new Set(state.runs.filter(run => run.status !== 'running').slice(-30).map(run => run.id));
    state.runs = state.runs.filter(run => run.status === 'running' || keep.has(run.id));
    state.revision++;
    const temporary = this.path + '.tmp-' + randomUUID();
    try {
      writeFileSync(temporary, JSON.stringify(state, null, 2), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.path);
    } finally { rmSync(temporary, { force: true }); }
  }

  private locked<T>(operation: () => T): T {
    mkdirSync(dirname(this.path), { recursive: true });
    const lock = this.path + '.lock', candidate = lock + '-' + randomUUID();
    // Link a fully written owner record atomically: no empty lock after a crash.
    writeFileSync(candidate, JSON.stringify({ pid: process.pid, instanceId: this.instanceId }), { mode: 0o600, flag: 'wx' });
    let acquired = false;
    try {
      const pause = new Int32Array(new SharedArrayBuffer(4));
      const take = (target: string, depth = 0): void => {
        if (depth > 4) throw new Error(busyMessage);
        for (let attempt = 0; attempt < 50; attempt++) {
          try { linkSync(candidate, target); return; }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
          try {
            const owner = JSON.parse(readFileSync(target, 'utf8'));
            if (Number.isSafeInteger(owner.pid) && owner.pid > 0 && !alive(owner.pid)) {
              // Serialize stale-lock removal as well: two recovering hosts must
              // never unlink a new owner's lock based on the same stale read.
              const recovery = target + '.reap';
              take(recovery, depth + 1);
              try {
                const current = JSON.parse(readFileSync(target, 'utf8'));
                if (current.pid === owner.pid && current.instanceId === owner.instanceId && !alive(current.pid)) rmSync(target, { force: true });
              } finally { rmSync(recovery, { force: true }); }
              continue;
            }
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            if (!(error instanceof SyntaxError)) throw error;
          }
          Atomics.wait(pause, 0, 0, 5);
        }
        throw new Error(busyMessage);
      };
      take(lock); acquired = true;
      return operation();
    } finally {
      if (acquired) rmSync(lock, { force: true });
      rmSync(candidate, { force: true });
    }
  }
}
