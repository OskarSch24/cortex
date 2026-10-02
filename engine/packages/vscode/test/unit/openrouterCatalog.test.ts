import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { OpenRouterAdapter, type OpenRouterModel } from '@cortex/core';
import { OpenRouterCatalog } from '../../src/openrouterCatalog.js';
import { applyHostMessage, type TranscriptItem } from '../../src/panel/transcript.js';

const model = (id: string, kind: OpenRouterModel['kind'], label = id, free = false): OpenRouterModel => ({ id, label, kind, free, contextLength: 200_000 });

/** A catalog over a fake globalState, as the extension builds it at start. */
function start(opts: { saved?: string[]; state?: Record<string, unknown> } = {}): OpenRouterAdapter {
  const state = new Map<string, unknown>(Object.entries(opts.state ?? {}));
  const ctx = { globalState: { get: (key: string) => state.get(key), update: async (key: string, value: unknown) => { state.set(key, value); } }, subscriptions: [] };
  (vscode.workspace as unknown as { onDidChangeConfiguration: unknown }).onDidChangeConfiguration = vi.fn(() => ({ dispose() {} }));
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(),
    update: vi.fn(async () => {}),
    inspect: vi.fn(() => ({ globalValue: opts.saved })),
  } as never);
  // No OpenRouter account: nothing is fetched, the cached list is all there is.
  const accounts = { all: () => [], onDidChange: () => ({ dispose() {} }) };
  const adapter = new OpenRouterAdapter(vi.fn() as never);
  new OpenRouterCatalog(ctx as never, adapter, accounts as never);
  return adapter;
}

afterEach(() => vi.mocked(vscode.workspace.getConfiguration).mockReset());

describe('OpenRouter im Modellmenü', () => {
  it('zeigt ohne eigene Liste genau die fünf gewählten Modelle, jedes mit seiner Art', () => {
    const adapter = start();
    expect(adapter.models.map((m) => [m.id, m.output])).toEqual([
      ['~typesafe/jev-latest', 'decisions'],
      ['typesafe/jev-1.13', 'decisions'],
      ['openai/gpt-image-2.5-sunburst', 'image'],
      ['heygen/avatar-iv', 'video'],
      ['sakana/sakana-namazu', undefined],
    ]);
    // Die Gratismodelle stehen nicht im Menü; die Zweitmeinung hat sie trotzdem.
    expect(adapter.freeChain.length).toBeGreaterThan(0);
    expect(adapter.kindOf('heygen/avatar-iv')).toBe('video');
  });

  it('übernimmt Namen und Arten aus der Liste und sortiert Verschwundenes aus', () => {
    const adapter = start({
      saved: ['openai/gpt-image-2.5-sunburst', 'sakana/sakana-namazu', 'gone/model'],
      state: { 'cortex.openrouterCatalogAllKinds': { at: Date.now(), models: [
        model('openai/gpt-image-2.5-sunburst', 'image', 'GPT Image 2.5 Sunburst'),
        model('sakana/sakana-namazu', 'text', 'Sakana Namazu'),
        model('chat:free', 'text', 'Chat (free)', true),
      ] } },
    });
    expect(adapter.models).toEqual([
      { id: 'openai/gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', output: 'image' },
      { id: 'sakana/sakana-namazu', label: 'Sakana Namazu' },
    ]);
    expect(adapter.freeChain.map((m) => m.id)).toEqual(['chat:free']);
  });

  it('übergeht einen älteren Stand, der nur Chatmodelle kannte', () => {
    const adapter = start({ state: { 'cortex.openrouterCatalog': { at: Date.now(), models: [model('sakana/sakana-namazu', undefined, 'Sakana Namazu')] } } });
    // Sonst fielen Jev, Sunburst und HeyGen als „nicht mehr gelistet“ heraus.
    expect(adapter.models).toHaveLength(5);
  });
});

describe('Videos im Verlauf', () => {
  it('hängt ein Video an die Antwort, einmal je Datei', () => {
    let items: TranscriptItem[] = [];
    const video = { kind: 'video' as const, messageId: 'm1', path: '/store/videos/abc/1.mp4', src: 'cortex-app://resource/1.mp4', prompt: 'Hallo, ich bin Alex.' };
    items = applyHostMessage(items, video);
    items = applyHostMessage(items, video);
    const turn = items[0] as Extract<TranscriptItem, { kind: 'assistant' }>;
    expect(turn.videos).toEqual([{ path: '/store/videos/abc/1.mp4', src: 'cortex-app://resource/1.mp4', prompt: 'Hallo, ich bin Alex.' }]);
  });
});
