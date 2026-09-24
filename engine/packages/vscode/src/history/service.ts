import { randomUUID } from 'node:crypto';
import { HistoryStore, HISTORY_BUSY, type HistorySecrets } from './store.js';
import type { HistoryEntry, HistoryQuestionResult, HistorySettings, HistoryState, NativeHistorySample, NativeHistoryStatus } from './types.js';
import { SerialQueue } from '../util/serialQueue.js';
import { CANCELED, LOCAL_ERROR, MODEL_ERROR } from './messages.js';
import { runHistoryHelper, type NativeCommand, type NativeHistoryCall } from './nativeHelper.js';
import { clean, nativeStatus, settings } from './sanitize.js';
import { fold, inRange, relativeRange, retrievalContext, selectForQuestion } from './retrieval.js';

export type { NativeHistoryCall } from './nativeHelper.js';

interface ComputerHistoryOptions {
  directory: string;
  helperPath: string;
  secrets: HistorySecrets;
  loadSettings: () => HistorySettings | undefined;
  saveSettings: (settings: HistorySettings) => PromiseLike<void>;
  changed: () => void;
  /** Synthetic test seams; production uses the bundled, local native helper. */
  nativeCall?: NativeHistoryCall;
  now?: () => number;
  samplingIntervalMs?: number;
}

export class ComputerHistoryService {
  private readonly store: HistoryStore;
  private readonly native: NativeHistoryCall;
  private readonly now: () => number;
  private currentSettings: HistorySettings;
  private status: NativeHistoryStatus = { permission: false, model: 'unavailable', apps: [] };
  private error?: string;
  private disposed = false;
  private started = false;
  private revision = 0;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private controllers = new Set<AbortController>();
  private readonly mutations = new SerialQueue();
  private activeEntry?: HistoryEntry;
  private lastSnapshot = '';
  private lastSummaryAt = 0;
  private storageReady = false;
  private captureStatus = '';
  private ownershipBlocked = false;

  constructor(private readonly options: ComputerHistoryOptions) {
    this.currentSettings = settings(options.loadSettings());
    this.store = new HistoryStore(options.directory, options.secrets);
    this.native = options.nativeCall ?? ((command, input, signal) => runHistoryHelper(options.helperPath, command, input, signal));
    this.now = options.now ?? Date.now;
  }

  private changed(): void { if (!this.disposed) this.options.changed(); }
  private report(error: unknown): void {
    this.error = error instanceof Error && error.message === HISTORY_BUSY ? HISTORY_BUSY : LOCAL_ERROR;
    if (this.error === HISTORY_BUSY) this.ownershipBlocked = true;
  }
  private async call(command: NativeCommand, input?: unknown): Promise<unknown> {
    if (this.disposed) throw new Error(CANCELED);
    const controller = new AbortController();
    this.controllers.add(controller);
    try { return await this.native(command, input, controller.signal); }
    finally { this.controllers.delete(controller); }
  }
  private cancel(): void {
    this.revision++;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    this.activeEntry = undefined;
    this.lastSnapshot = '';
    this.lastSummaryAt = 0;
    this.captureStatus = '';
  }
  private mutate<T>(work: () => Promise<T>): Promise<T> {
    return this.mutations.run(work);
  }
  private async refreshStatus(): Promise<void> {
    const revision = this.revision;
    try {
      const status = nativeStatus(await this.call('status'));
      if (revision === this.revision && !this.disposed) this.status = status;
    } catch (error) {
      if (revision === this.revision && !this.disposed) {
        this.status = { permission: false, model: 'unavailable', apps: [], modelReason: 'Die lokale Cortex-Komponente ist nicht verfügbar.' };
        this.report(error);
      }
    }
  }
  private canCapture(): boolean {
    return !this.disposed && !this.ownershipBlocked && this.started && this.currentSettings.enabled && this.status.permission
      && this.currentSettings.allowedApps.some(id => this.status.apps.some(app => app.id === id && app.supported));
  }
  private schedule(): void {
    if (this.timer || !this.canCapture()) return;
    this.timer = setInterval(() => { void this.sample(); }, this.options.samplingIntervalMs ?? 20_000);
    this.timer.unref();
  }
  async start(): Promise<void> {
    if (this.started || this.disposed) return;
    this.started = true;
    // Status never reads app contents or requests Accessibility access.
    await this.refreshStatus();
    this.schedule();
    if (this.canCapture()) await this.sample();
  }
  private async read(): Promise<HistoryEntry[]> {
    try {
      const entries = await this.store.read(this.currentSettings.retentionDays, this.now());
      this.storageReady = true;
      return entries;
    } catch (error) { this.storageReady = false; throw error; }
  }
  async state(query = '', from?: number, to?: number): Promise<HistoryState> {
    await this.mutations.idle();
    await this.refreshStatus();
    let entries: HistoryEntry[] = [];
    try { entries = await this.read(); } catch (error) { this.report(error); }
    this.schedule();
    const terms = fold(query.slice(0, 200)).split(/\s+/).filter(Boolean);
    const filtered = entries.filter(entry => inRange(entry, from, to)
      && terms.every(term => fold(`${entry.appName}\n${entry.title}\n${entry.text}\n${entry.summary ?? ''}`).includes(term)));
    const running = this.canCapture() && !!this.timer && this.storageReady && !this.error;
    return {
      settings: { ...this.currentSettings, allowedApps: [...this.currentSettings.allowedApps] },
      ...this.status,
      running,
      status: this.error === HISTORY_BUSY ? HISTORY_BUSY
        : !this.currentSettings.enabled ? 'Pausiert'
        : !this.currentSettings.allowedApps.length ? 'Wähle zuerst erlaubte Apps aus.'
        : !this.status.permission ? 'Die macOS-Berechtigung für Bedienungshilfen fehlt.'
        : this.error ? 'Die lokale Erfassung ist angehalten.'
        : running ? this.captureStatus || 'Lokale Erfassung aktiv' : 'Keine unterstützte App ausgewählt.',
      entries: filtered.sort((a, b) => b.endedAt - a.endedAt).slice(0, 200),
      total: entries.length,
      error: this.error,
    };
  }
  async configure(partial: Partial<HistorySettings>): Promise<void> {
    this.cancel();
    const revision = this.revision;
    return this.mutate(async () => {
      if (this.disposed) return;
      const next = settings({ ...this.currentSettings, ...partial });
      await this.refreshStatus();
      // Unsupported apps may remain visible as previously selected, but can never
      // newly enter the allowlist and never pass the capture gate below.
      next.allowedApps = next.allowedApps.filter(id => this.currentSettings.allowedApps.includes(id)
        || this.status.apps.some(app => app.id === id && app.supported));
      // Every control mutation first proves this window owns the history. A
      // second window must never report a pause while the owning window records.
      try { await this.read(); } catch (error) { this.report(error); this.changed(); throw new Error(this.error); }
      this.currentSettings = next;
      try { await this.options.saveSettings(next); }
      catch (error) {
        // A failed write must not reactivate recording after a requested pause
        // or app revocation. An unsaved opt-in must not start recording either.
        this.currentSettings = { ...next, enabled: false };
        this.report(error);
        this.changed();
        throw new Error(this.error);
      }
      this.ownershipBlocked = false;
      this.error = undefined;
      if (this.storageReady || (next.enabled && next.allowedApps.length)) {
        try { await this.read(); } catch (error) { this.report(error); }
      }
      if (revision === this.revision) this.schedule();
      this.changed();
    });
  }
  async requestPermission(): Promise<void> {
    const revision = this.revision;
    try {
      const result = nativeStatus(await this.call('permission'));
      if (revision !== this.revision || this.disposed) return;
      this.status = result;
      this.error = undefined;
      this.schedule();
    } catch (error) { if (revision === this.revision) this.report(error); }
    this.changed();
  }
  async delete(id: string): Promise<void> {
    if (typeof id !== 'string' || !id.trim() || id.length > 100) throw new Error('Ungültiger Verlaufseintrag.');
    this.cancel();
    const revision = this.revision;
    return this.mutate(async () => {
      try { await this.store.delete(id); this.error = undefined; }
      catch (error) { this.report(error); throw new Error(this.error); }
      finally { if (revision === this.revision) this.schedule(); this.changed(); }
    });
  }
  async clear(): Promise<void> {
    this.cancel();
    return this.mutate(async () => {
      try {
        await this.read();
        this.currentSettings = { ...this.currentSettings, enabled: false };
        await this.options.saveSettings(this.currentSettings);
        await this.store.clear();
        this.error = undefined;
      }
      catch (error) { this.report(error); throw new Error(this.error); }
      finally { this.changed(); }
    });
  }
  private async sample(): Promise<void> {
    if (this.busy || !this.canCapture()) return;
    this.busy = true;
    const revision = this.revision;
    const valid = () => revision === this.revision && this.canCapture();
    try {
      // Prune before capture, even if the foreground app is excluded.
      await this.read();
      if (!valid()) return;
      const allowedApps = this.currentSettings.allowedApps.filter(id => this.status.apps.some(app => app.id === id && app.supported));
      const result = await this.call('sample', { allowedApps }) as NativeHistorySample;
      if (!valid()) return;
      const captureStatus = clean(result?.status, 300);
      if (captureStatus !== this.captureStatus) { this.captureStatus = captureStatus; this.changed(); }
      if (!result?.sample || !allowedApps.includes(result.sample.appId)) return;
      const sample = result.sample;
      const text = clean(sample.text, 8000);
      if (!text) return;
      const now = this.now();
      const title = clean(sample.title, 500);
      const active = this.activeEntry;
      const sameSession = active && active.appId === sample.appId && active.title === title
        && now - active.startedAt < 5 * 60_000 && now - active.endedAt < 90_000;
      const unchanged = sameSession && this.lastSnapshot === text;
      const entry: HistoryEntry = sameSession ? { ...active, endedAt: now } : {
        id: randomUUID(), startedAt: now, endedAt: now, appId: sample.appId,
        appName: clean(sample.appName, 300), title, text,
      };
      if (sameSession && !unchanged) {
        // Preserve changing work in a short activity window, without repeated snapshots.
        entry.text = active.text.includes(text) ? active.text : `${active.text}\n\n${text}`.slice(-8000);
        entry.summary = undefined;
      }
      if (!await this.store.put(entry, valid) || !valid()) return;
      this.activeEntry = entry;
      this.lastSnapshot = text;
      this.error = undefined;
      this.changed();
      if (this.status.model === 'available' && !entry.summary && (!sameSession || now - this.lastSummaryAt >= 120_000)) {
        const output = await this.call('summarize', { text: entry.text.slice(-5000) }) as { text?: unknown };
        if (!valid()) return;
        const summary = clean(output?.text, 1600);
        if (summary) {
          const summarized = { ...entry, summary };
          if (await this.store.put(summarized, valid) && valid()) {
            this.activeEntry = summarized;
            this.lastSummaryAt = now;
            this.changed();
          }
        }
      }
    } catch (error) { if (valid()) { this.report(error); this.changed(); } }
    finally { this.busy = false; }
  }
  async ask(question: string, from?: number, to?: number): Promise<HistoryQuestionResult> {
    question = clean(question, 1000);
    if (!Number.isFinite(from) && !Number.isFinite(to)) {
      const range = relativeRange(question, this.now());
      from = range?.from;
      to = range?.to;
    }
    const empty = { question, answer: '', sources: [] };
    if (!question) return { ...empty, error: 'Bitte gib eine Frage ein.' };
    const revision = this.revision;
    const valid = () => revision === this.revision && !this.disposed;
    try {
      await this.mutations.idle();
      if (!valid()) return { ...empty, error: CANCELED };
      await this.refreshStatus();
      if (!valid()) return { ...empty, error: CANCELED };
      if (this.status.model !== 'available') return { ...empty, error: MODEL_ERROR };
      const all = (await this.read()).filter(entry => inRange(entry, from, to));
      if (!valid()) return { ...empty, error: CANCELED };
      if (!all.length) return { ...empty, answer: 'Für diesen Zeitraum sind keine lokalen Verlaufseinträge vorhanden.' };
      const { selected, terms } = selectForQuestion(question, all);
      // A small retrieval context only. No full-store prompt and no normal chat event.
      const context = retrievalContext(selected, terms);
      const output = await this.call('ask', { question, context }) as { text?: unknown };
      if (!valid()) return { ...empty, error: CANCELED };
      const answer = clean(output?.text, 8000);
      if (!answer) return { ...empty, error: LOCAL_ERROR };
      return { question, answer, sources: selected.map(({ id, startedAt, appName, title }) => ({ id, startedAt, appName, title })) };
    } catch (error) {
      return { ...empty, error: !valid() ? CANCELED : error instanceof Error && error.message === HISTORY_BUSY ? HISTORY_BUSY : LOCAL_ERROR };
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    void this.store.close();
  }
}
