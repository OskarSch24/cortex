import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ComputerHistoryService, type NativeHistoryCall } from '../../src/history/service.js';
import { HistoryStore, HISTORY_BUSY, type HistorySecrets } from '../../src/history/store.js';
import type { HistoryEntry, HistorySettings, NativeHistoryStatus } from '../../src/history/types.js';

const directories: string[] = [];
const stores: HistoryStore[] = [];
const services: ComputerHistoryService[] = [];
const now = new Date(2026, 8, 19, 14, 0, 0).getTime();
const notes = 'com.example.notes';
const browser = 'com.example.browser';
const status: NativeHistoryStatus = {
  permission: true, model: 'available', apps: [
    { id: notes, name: 'Synthetic Notes', supported: true },
    { id: browser, name: 'Synthetic Browser', supported: false, reason: 'Browser ausgeschlossen' },
  ],
};
const enabled: HistorySettings = { enabled: true, allowedApps: [notes], retentionDays: 30 };
const entry = (id: string, time = now, text = 'Synthetic confidential budget'): HistoryEntry => ({
  id, startedAt: time, endedAt: time, appId: notes, appName: 'Synthetic Notes', title: 'Synthetic document', text,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function secrets(): HistorySecrets & { reads: number } {
  const values = new Map<string, string>();
  return { reads: 0, async get(key) { this.reads++; return values.get(key); }, async store(key, value) { values.set(key, value); } };
}
async function directory() {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), 'cortex-history-test-'));
  directories.push(value);
  return value;
}
function localStore(dir: string, key: HistorySecrets) { const store = new HistoryStore(dir, key); stores.push(store); return store; }
async function fixture(nativeCall: NativeHistoryCall, initial?: HistorySettings, interval = 1_000_000_000) {
  const dir = await directory();
  const key = secrets();
  let saved = initial;
  let savingFails = false;
  const service = new ComputerHistoryService({
    directory: dir, helperPath: '/never-executed-test-helper', secrets: key,
    loadSettings: () => saved, saveSettings: async value => { if (savingFails) throw new Error('Synthetic settings failure'); saved = value; },
    changed: () => undefined, nativeCall, now: () => now, samplingIntervalMs: interval,
  });
  services.push(service);
  return { service, key, dir, saved: () => saved, failSaving: () => { savingFails = true; } };
}
const sample = { sample: { appId: notes, appName: 'Synthetic Notes', title: 'Synthetic document', text: 'Synthetic confidential budget' }, status: 'Lokale Erfassung aktiv' };
afterEach(async () => {
  for (const service of services.splice(0)) service.dispose();
  for (const store of stores.splice(0)) await store.close();
  // Service disposal is intentionally synchronous to fit VS Code Disposable.
  await new Promise(resolve => setTimeout(resolve, 10));
  for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

describe('encrypted local history storage', () => {
  it('writes only authenticated ciphertext with private permissions and reloads it', async () => {
    const dir = await directory();
    const key = secrets();
    const store = localStore(dir, key);
    await store.put(entry('one'));
    const bytes = await fs.readFile(store.file);
    expect(bytes.toString()).not.toContain('confidential');
    expect(bytes.subarray(0, 8).toString()).toBe('CRTXHST1');
    expect((await fs.stat(store.file)).mode & 0o777).toBe(0o600);
    expect((await fs.stat(dir)).mode & 0o777).toBe(0o700);
    await store.close();
    expect(await localStore(dir, key).read(30, now)).toEqual([entry('one')]);
  });

  it('rejects corrupted ciphertext and missing keys without replacing user data', async () => {
    const dir = await directory();
    const key = secrets();
    const store = localStore(dir, key);
    await store.put(entry('one'));
    await store.close();
    const original = await fs.readFile(store.file);
    await expect(localStore(dir, secrets()).read(30, now)).rejects.toThrow('nicht sicher');
    expect(await fs.readFile(store.file)).toEqual(original);
    const corrupted = Buffer.from(original);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 1;
    await fs.writeFile(store.file, corrupted);
    await expect(localStore(dir, key).read(30, now)).rejects.toThrow('nicht sicher');
    expect(await fs.readFile(store.file)).toEqual(corrupted);
  });

  it('serializes updates, enforces retention on disk and persists deletion', async () => {
    const dir = await directory();
    const key = secrets();
    const store = localStore(dir, key);
    await Promise.all([store.put(entry('old', now - 40 * 86_400_000)), store.put(entry('recent')), store.put(entry('other'))]);
    expect((await store.read(30, now)).map(item => item.id)).toEqual(['recent', 'other']);
    await store.delete('recent');
    await store.close();
    const reopened = localStore(dir, key);
    expect((await reopened.read(30, now)).map(item => item.id)).toEqual(['other']);
    await reopened.clear();
    expect(await reopened.read(30, now)).toEqual([]);
  });

  it('allows only one writer per history directory, then transfers ownership on close', async () => {
    const dir = await directory();
    const key = secrets();
    const first = localStore(dir, key);
    const second = localStore(dir, key);
    await first.put(entry('one'));
    await expect(second.read(30, now)).rejects.toThrow(HISTORY_BUSY);
    await first.close();
    expect((await second.read(30, now)).map(item => item.id)).toEqual(['one']);
  });

  it('does not insert an invalidated queued snapshot after deletion', async () => {
    const store = localStore(await directory(), secrets());
    await store.put(entry('one'));
    let valid = true;
    const removal = store.clear();
    const pending = store.put(entry('stale'), () => valid);
    valid = false;
    await removal;
    expect(await pending).toBe(false);
    expect(await store.read(30, now)).toEqual([]);
  });
});

describe('Cortex-only history service', () => {
  it('never captures or accesses keys before opt-in, and passes only explicit supported apps', async () => {
    const sampled = deferred<unknown>();
    const calls: string[] = [];
    const { service, key } = await fixture(async (command, input) => {
      calls.push(command);
      if (command === 'sample') { sampled.resolve(input); return sample; }
      if (command === 'summarize') return { text: 'Synthetic local summary' };
      return status;
    }, undefined, 5);
    await service.start();
    expect(calls).toEqual(['status']);
    expect(key.reads).toBe(0);
    await service.configure({ allowedApps: [notes, browser], enabled: false });
    expect(calls).not.toContain('sample');
    await service.configure({ enabled: true });
    expect(await sampled.promise).toEqual({ allowedApps: [notes] });
    await service.configure({ enabled: false });
    const count = calls.filter(command => command === 'sample').length;
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(calls.filter(command => command === 'sample')).toHaveLength(count);
  });

  it('does not sample without permission and rejects out-of-allowlist helper results', async () => {
    const calls: string[] = [];
    const denied = await fixture(async command => { calls.push(command); return { ...status, permission: false }; }, enabled);
    await denied.service.start();
    expect(calls).toEqual(['status']);
    expect((await denied.service.state()).running).toBe(false);
    const malicious = await fixture(async command => command === 'sample' ? { ...sample, sample: { ...sample.sample, appId: browser } } : status, enabled);
    await malicious.service.start();
    expect((await malicious.service.state()).entries).toEqual([]);
  });

  it('drops a late capture when paused even if the native process ignores cancellation', async () => {
    const capturing = deferred<void>();
    const pending = deferred<unknown>();
    let sampleSignal: AbortSignal | undefined;
    const { service } = await fixture(async (command, _input, signal) => {
      if (command === 'sample') { sampleSignal = signal; capturing.resolve(); return pending.promise; }
      return status;
    }, enabled);
    const started = service.start();
    await capturing.promise;
    await service.configure({ enabled: false });
    expect(sampleSignal?.aborted).toBe(true);
    pending.resolve(sample);
    await started;
    expect((await service.state()).entries).toEqual([]);
  });

  it('deletes pending summaries, persists pause on clear, and prevents resurrection', async () => {
    const summarizing = deferred<void>();
    const pending = deferred<unknown>();
    let summarySignal: AbortSignal | undefined;
    const { service, saved } = await fixture(async (command, _input, signal) => {
      if (command === 'sample') return sample;
      if (command === 'summarize') { summarySignal = signal; summarizing.resolve(); return pending.promise; }
      return status;
    }, enabled);
    const started = service.start();
    await summarizing.promise;
    await service.clear();
    expect(summarySignal?.aborted).toBe(true);
    expect(saved()).toEqual({ ...enabled, enabled: false });
    pending.resolve({ text: 'This late summary must never be saved' });
    await started;
    expect((await service.state()).entries).toEqual([]);
  });

  it('searches locally, keeps the total independent of filters, and answers only with a bounded local context', async () => {
    const inputs: Array<{ command: string; input: unknown }> = [];
    const { service, dir, key } = await fixture(async (command, input) => {
      inputs.push({ command, input });
      return command === 'ask' ? { text: 'Synthetic local answer [1].' } : status;
    });
    const store = localStore(dir, key);
    for (let i = 0; i < 8; i++) await store.put(entry(`entry-${i}`, now - i * 1000, `Budget meeting ${'synthetic '.repeat(700)}`));
    await store.put(entry('irrelevant', now, 'Gardening plans'));
    await store.close();
    expect((await service.state('not-present')).total).toBe(9);
    expect((await service.state('not-present')).entries).toHaveLength(0);
    expect((await service.state('budget', now - 2000, now)).entries).toHaveLength(3);
    const answer = await service.ask('Was wurde zum Budget besprochen?');
    expect(answer.answer).toContain('Synthetic local answer');
    expect(answer.sources).toHaveLength(5);
    const context = (inputs.find(call => call.command === 'ask')?.input as { context: string }).context;
    expect(context.length).toBeLessThanOrEqual(5000);
    expect(context).not.toContain('Gardening');
    expect(inputs.every(call => ['status', 'ask'].includes(call.command))).toBe(true);
  });

  it('resolves gestern against local calendar days before retrieving sources', async () => {
    let context = '';
    const { service, dir, key } = await fixture(async (command, input) => {
      if (command === 'ask') { context = (input as { context: string }).context; return { text: 'Gestern: synthetischer Termin [1].' }; }
      return status;
    });
    const store = localStore(dir, key);
    await store.put(entry('today', now, 'Heutiger Termin'));
    await store.put(entry('yesterday', now - 86_400_000, 'Gestriger Termin'));
    await store.close();
    const result = await service.ask('Woran habe ich gestern gearbeitet?');
    expect(result.sources.map(source => source.id)).toEqual(['yesterday']);
    expect(context).toContain('Gestriger Termin');
    expect(context).not.toContain('Heutiger Termin');
  });

  it('has no cloud fallback when the local model is unavailable', async () => {
    const calls: string[] = [];
    const { service } = await fixture(async command => { calls.push(command); return { ...status, model: 'unavailable' }; });
    const result = await service.ask('Was habe ich getan?');
    expect(result.error).toContain('keinen Cloudanbieter');
    expect(calls).toEqual(['status']);
    expect(result.sources).toEqual([]);
  });

  it('drops a pending answer when its history is deleted', async () => {
    const asking = deferred<void>();
    const pending = deferred<unknown>();
    let signal: AbortSignal | undefined;
    const { service, dir, key } = await fixture(async (command, _input, inputSignal) => {
      if (command === 'ask') { signal = inputSignal; asking.resolve(); return pending.promise; }
      return status;
    });
    const store = localStore(dir, key);
    await store.put(entry('one'));
    await store.close();
    const answer = service.ask('Budget?');
    await asking.promise;
    await service.delete('one');
    expect(signal?.aborted).toBe(true);
    pending.resolve({ text: 'Late private answer' });
    expect(await answer).toMatchObject({ answer: '', sources: [], error: 'Die lokale Verarbeitung wurde abgebrochen.' });
  });

  it('rejects pause and clear from another window without saving misleading settings', async () => {
    const first = await fixture(async command => command === 'sample' ? sample : { ...status, model: 'unavailable' }, enabled);
    await first.service.start();
    let saves = 0;
    const second = new ComputerHistoryService({
      directory: first.dir, helperPath: '/never-executed-test-helper', secrets: first.key,
      loadSettings: () => first.saved(), saveSettings: async () => { saves++; }, changed: () => undefined,
      nativeCall: async () => status, now: () => now,
    });
    services.push(second);
    await expect(second.configure({ enabled: false })).rejects.toThrow(HISTORY_BUSY);
    await expect(second.clear()).rejects.toThrow(HISTORY_BUSY);
    expect(saves).toBe(0);
    expect(await second.state()).toMatchObject({ running: false, status: HISTORY_BUSY });
    expect(await first.service.state()).toMatchObject({ running: true, settings: { enabled: true } });
    await first.service.configure({ enabled: false });
    expect(await first.service.state()).toMatchObject({ running: false, settings: { enabled: false } });
  });

  it('keeps recording paused when persisting a pause fails', async () => {
    let captures = 0;
    const { service, failSaving } = await fixture(async command => {
      if (command === 'sample') { captures++; return sample; }
      return { ...status, model: 'unavailable' };
    }, enabled, 5);
    await service.start();
    failSaving();
    await expect(service.configure({ enabled: false })).rejects.toThrow('nicht verfügbar');
    expect(await service.state()).toMatchObject({ running: false, settings: { enabled: false } });
    const capturesAfterPause = captures;
    await new Promise(resolve => setTimeout(resolve, 25));
    expect(captures).toBe(capturesAfterPause);
  });

  it('rejects malformed deletion requests without treating them as clear', async () => {
    const { service } = await fixture(async command => command === 'sample' ? sample : { ...status, model: 'unavailable' }, enabled);
    await service.start();
    await expect(service.delete(undefined as never)).rejects.toThrow('Ungültiger');
    await expect(service.delete('')).rejects.toThrow('Ungültiger');
    expect((await service.state()).total).toBe(1);
  });

  it('includes the matching raw fact when the summary omits it', async () => {
    let context = '';
    const { service, dir, key } = await fixture(async (command, input) => {
      if (command === 'ask') { context = (input as { context: string }).context; return { text: 'Sarah erwartet das Budget am Freitag [1].' }; }
      return status;
    });
    const store = localStore(dir, key);
    await store.put({ ...entry('one', now, `${'Unrelated text. '.repeat(120)}Sarah erwartet das Budget am Freitag.`), summary: 'An einem Budget-Dokument gearbeitet.' });
    await store.close();
    expect((await service.ask('Was habe ich Sarah zum Budget versprochen?')).sources).toHaveLength(1);
    expect(context).toContain('Sarah erwartet das Budget am Freitag');
  });
});
