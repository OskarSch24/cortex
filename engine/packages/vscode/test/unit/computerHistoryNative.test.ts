import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ComputerHistoryService } from '../../src/history/service.js';
import { HistoryStore } from '../../src/history/store.js';

// Explicit live check: synthetic records only. Never grants AX or calls sample.
it.skipIf(process.env.CORTEX_HISTORY_NATIVE_TEST !== '1')('answers a synthetic encrypted history using the bundled on-device model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cortex-history-native-'));
  const values = new Map<string, string>();
  const secrets = { get: async (key: string) => values.get(key), store: async (key: string, value: string) => { values.set(key, value); } };
  const store = new HistoryStore(directory, secrets);
  const service = new ComputerHistoryService({
    directory, helperPath: resolve('dist/history-tool'), secrets,
    loadSettings: () => ({ enabled: false, allowedApps: [], retentionDays: 7 }),
    saveSettings: async () => {}, changed: () => {},
  });
  try {
    await store.put({ id: 'synthetic', startedAt: Date.now(), endedAt: Date.now(), appId: 'example.fixture', appName: 'Testquelle', title: 'Projektplan', text: 'Künstlicher Testdatensatz: Der nächste Entwurf des Projektplans ist am Freitag fällig. Zuständig ist Anna.' });
    await store.close();
    await service.start();
    const state = await service.state();
    expect(state.running).toBe(false);
    expect(state.model).toBe('available');
    const result = await service.ask('An welchem Wochentag ist laut Projektplan der nächste Entwurf fällig?');
    expect(result.error).toBeUndefined();
    expect(result.answer).toMatch(/Freitag/i);
    expect(result.sources.map(source => source.id)).toEqual(['synthetic']);
  } finally {
    service.dispose(); await store.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
