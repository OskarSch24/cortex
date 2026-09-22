import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { HistoryStore, HISTORY_BUSY, type HistorySecrets } from './store.js';
import type { HistoryEntry, HistoryQuestionResult, HistorySettings, HistoryState, NativeHistorySample, NativeHistoryStatus } from './types.js';

type NativeCommand = 'status' | 'permission' | 'sample' | 'summarize' | 'ask';
export type NativeHistoryCall = (command: NativeCommand, input: unknown, signal: AbortSignal) => Promise<unknown>;
export interface ComputerHistoryOptions {
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

const LOCAL_ERROR = 'Der lokale Computerverlauf ist gerade nicht verfügbar. Es wurden keine Daten an einen Anbieter gesendet.';
const MODEL_ERROR = 'Das lokale Apple-Sprachmodell ist nicht verfügbar. Die Frage wurde an keinen Cloudanbieter gesendet.';
const CANCELED = 'Die lokale Verarbeitung wurde abgebrochen.';
const fold = (text: string) => text.toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';

function settings(value?: Partial<HistorySettings>): HistorySettings {
  return {
    enabled: value?.enabled === true,
    allowedApps: Array.isArray(value?.allowedApps) ? [...new Set(value.allowedApps.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9._-]{1,300}$/.test(id)))].slice(0, 100) : [],
    retentionDays: typeof value?.retentionDays === 'number' && Number.isFinite(value.retentionDays) ? Math.max(1, Math.min(90, Math.round(value.retentionDays))) : 30,
  };
}

function nativeStatus(value: unknown): NativeHistoryStatus {
  const result = value as NativeHistoryStatus | undefined;
  if (!result || typeof result.permission !== 'boolean' || !['available', 'unavailable'].includes(result.model) || !Array.isArray(result.apps)) throw new Error(LOCAL_ERROR);
  return {
    permission: result.permission,
    model: result.model,
    modelReason: clean(result.modelReason, 500) || undefined,
    apps: result.apps.filter(app => app && typeof app.id === 'string' && typeof app.name === 'string' && typeof app.supported === 'boolean')
      .slice(0, 300).map(app => ({ id: clean(app.id, 300), name: clean(app.name, 300), supported: app.supported, reason: clean(app.reason, 300) || undefined })),
  };
}

/** No shell, network SDK, provider routing, transcript, or external memory system. */
export function runHistoryHelper(helperPath: string, command: NativeCommand, input: unknown, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error(CANCELED)); return; }
    const body = input === undefined ? '' : JSON.stringify(input);
    if (Buffer.byteLength(body) > 48_000) { reject(new Error(LOCAL_ERROR)); return; }
    const child = spawn(helperPath, [command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let complete = false;
    let bytes = 0;
    let stderrBytes = 0;
    const chunks: Buffer[] = [];
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 1000);
      killTimer.unref();
    };
    const finish = (error?: string, value?: unknown) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) { stop(); reject(new Error(error)); } else resolve(value);
    };
    const abort = () => finish(CANCELED);
    const timer = setTimeout(() => finish(LOCAL_ERROR), command === 'ask' || command === 'summarize' ? 60_000 : 15_000);
    timer.unref();
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 128_000) finish(LOCAL_ERROR); else if (!complete) chunks.push(chunk);
    });
    // Never forward stderr: native diagnostics must not disclose captured text.
    child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 16_000) finish(LOCAL_ERROR); });
    child.stdin.on('error', () => finish(LOCAL_ERROR));
    child.on('error', () => finish(LOCAL_ERROR));
    child.on('close', code => {
      if (killTimer) clearTimeout(killTimer);
      if (complete) return;
      if (code !== 0) { finish(LOCAL_ERROR); return; }
      try { finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(LOCAL_ERROR); }
    });
    child.stdin.end(body);
  });
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
  private mutations: Promise<unknown> = Promise.resolve();
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
    const result = this.mutations.then(work, work);
    this.mutations = result.catch(() => undefined);
    return result;
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
    await this.mutations;
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
      await this.mutations;
      if (!valid()) return { ...empty, error: CANCELED };
      await this.refreshStatus();
      if (!valid()) return { ...empty, error: CANCELED };
      if (this.status.model !== 'available') return { ...empty, error: MODEL_ERROR };
      const all = (await this.read()).filter(entry => inRange(entry, from, to));
      if (!valid()) return { ...empty, error: CANCELED };
      if (!all.length) return { ...empty, answer: 'Für diesen Zeitraum sind keine lokalen Verlaufseinträge vorhanden.' };
      const stopwords = new Set('was wie wo wann wer warum habe hab hast hat haben ich du wir der die das den dem des ein eine einen einem und oder mit von für zu an in im am ist war heute gestern what did i do the a to my on at'.split(' '));
      const terms = [...new Set(fold(question).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(term => !stopwords.has(term));
      const ranked = all.map(entry => {
        const haystack = fold(`${entry.appName} ${entry.title} ${entry.summary ?? ''} ${entry.text}`);
        return { entry, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
      }).sort((a, b) => b.score - a.score || b.entry.endedAt - a.entry.endedAt);
      const hasMatches = ranked.some(item => item.score > 0);
      const selected = ranked.filter(item => !hasMatches || item.score > 0).slice(0, 5).map(item => item.entry);
      // A small retrieval context only. No full-store prompt and no normal chat event.
      const context = selected.map((entry, index) => `[${index + 1}] ${new Date(entry.startedAt).toISOString()} · ${entry.appName.slice(0, 80)} · ${entry.title.slice(0, 160)}\n${relevantExcerpt(entry, terms)}`).join('\n\n').slice(0, 5000);
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

function inRange(entry: HistoryEntry, from?: number, to?: number): boolean {
  return (!Number.isFinite(from) || entry.endedAt >= from!) && (!Number.isFinite(to) || entry.startedAt <= to!);
}

function relevantExcerpt(entry: HistoryEntry, terms: string[]): string {
  const summary = entry.summary ?? '';
  const folded = fold(entry.text);
  const matches = terms.map(term => folded.indexOf(term)).filter(index => index >= 0);
  if (!matches.length) return (summary || entry.text).slice(0, 680);
  // A summary can mention the topic while omitting the exact person/date asked
  // for. Always retain matching source text, even if the summary also matches.
  const prefix = summary ? `Zusammenfassung: ${summary.slice(0, 140)}\nQuelle: ` : '';
  const budget = 680 - prefix.length - 1;
  const candidates = matches.map(index => Math.max(0, index - 120));
  const score = (start: number) => terms.filter(term => folded.slice(start, start + budget).includes(term)).length;
  const start = candidates.sort((a, b) => score(b) - score(a))[0]!;
  return `${prefix}${start ? '…' : ''}${entry.text.slice(start, start + budget)}`;
}

function relativeRange(question: string, now: number): { from: number; to: number } | undefined {
  const text = fold(question);
  let daysAgo: number | undefined;
  if (/\bvorgestern\b|\bday before yesterday\b/.test(text)) daysAgo = 2;
  else if (/\bgestern\b|\byesterday\b/.test(text)) daysAgo = 1;
  else if (/\bheute\b|\btoday\b/.test(text)) daysAgo = 0;
  if (daysAgo === undefined) return undefined;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() - 1 };
}
