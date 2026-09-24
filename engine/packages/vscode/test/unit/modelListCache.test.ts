import { describe, expect, it, vi } from 'vitest';
import type { OpenRouterModel } from '@cortex/core';
import { MODEL_LIST_MAX_AGE_MS, ModelListCache } from '../../src/modelListCache.js';

function fakeContext() {
  const state = new Map<string, unknown>();
  return {
    state,
    ctx: { globalState: { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => { state.set(key, value); } } } as any,
  };
}

describe('ModelListCache', () => {
  it('teilt sich einen laufenden Abruf und legt den Stand mit Zeitstempel ab', async () => {
    const { ctx, state } = fakeContext();
    let release!: (models: OpenRouterModel[]) => void;
    const fetchModels = vi.fn(() => new Promise<OpenRouterModel[]>((resolve) => { release = resolve; }));
    const cache = new ModelListCache(ctx, 'k', 'test', () => {}, fetchModels);
    expect(cache.isFresh()).toBe(false);
    const seen: string[][] = [];
    const apply = async (models: OpenRouterModel[]) => { seen.push(models.map((m) => m.id)); await cache.save({ ids: models.map((m) => m.id) }); };
    const first = cache.fetch(apply);
    const second = cache.fetch(apply);
    expect(first).toBe(second);
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchModels.mock.calls[0]![0]).toBeInstanceOf(AbortSignal);
    release([{ id: 'anthropic/x' } as OpenRouterModel]);
    await first;
    expect(seen).toEqual([['anthropic/x']]);
    const stored = state.get('k') as { at: number; ids: string[] };
    expect(Object.keys(stored)).toEqual(['at', 'ids']);
    expect(stored.ids).toEqual(['anthropic/x']);
    expect(cache.isFresh()).toBe(true);
    stored.at = Date.now() - MODEL_LIST_MAX_AGE_MS - 1;
    expect(cache.isFresh()).toBe(false);
    // Nach dem Ende darf ein neuer Abruf starten.
    const third = cache.fetch(async () => {});
    expect(third).not.toBe(first);
    release([]);
    await third;
    expect(fetchModels).toHaveBeenCalledTimes(2);
  });

  it('meldet einen Fehlschlag nur im Protokoll', async () => {
    const { ctx } = fakeContext();
    const log = vi.fn();
    const cache = new ModelListCache(ctx, 'k', 'openrouter', log, async () => { throw new Error('offline'); });
    await expect(cache.fetch(async () => {})).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('[openrouter] Modellliste nicht geladen: offline');
  });
});
