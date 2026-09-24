import * as vscode from 'vscode';
import {
  currentDefaultFavorites,
  freeReviewChain,
  type OpenRouterAdapter,
  type OpenRouterModel,
} from '@cortex/core';
import type { AccountStore } from './storage/accountStore.js';
import { ModelListCache } from './modelListCache.js';

const CACHE_KEY = 'cortex.openrouterCatalog';

/**
 * OpenRouter's live model list, and which of those models the chat picker
 * offers. The list is public; it is only fetched once an OpenRouter account is
 * connected, so a Cortex without one never talks to openrouter.ai.
 */
export class OpenRouterCatalog {
  private catalog: OpenRouterModel[];
  private readonly list: ModelListCache;
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.emitter.event;

  constructor(
    ctx: vscode.ExtensionContext,
    private adapter: OpenRouterAdapter,
    private accounts: AccountStore,
    private log: (line: string) => void = () => {},
  ) {
    this.list = new ModelListCache(ctx, CACHE_KEY, 'openrouter', (line) => this.log(line));
    this.catalog = ctx.globalState.get<{ at: number; models: OpenRouterModel[] }>(CACHE_KEY)?.models ?? [];
    this.apply();
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('cortex.openrouterModels') || e.affectsConfiguration('cortex.openrouterDefaultModel')) { this.apply(); this.emitter.fire(); }
      }),
      accounts.onDidChange(() => void this.refresh()),
    );
    void this.refresh();
  }

  models(): OpenRouterModel[] {
    return this.catalog;
  }

  favorites(): string[] {
    // Only a list the user actually saved counts — an emptied one stays empty
    // instead of snapping back to the defaults.
    const saved = vscode.workspace.getConfiguration('cortex').inspect<string[]>('openrouterModels')?.globalValue;
    return Array.isArray(saved) ? saved : currentDefaultFavorites(this.catalog);
  }

  /** The model a run without a named model gets; unset until the user picks one. */
  defaultModel(): string | undefined {
    return vscode.workspace.getConfiguration('cortex').get<string>('openrouterDefaultModel')?.trim() || undefined;
  }

  async setDefaultModel(id: string | undefined): Promise<void> {
    await vscode.workspace.getConfiguration('cortex').update('openrouterDefaultModel', id?.trim() || undefined, vscode.ConfigurationTarget.Global);
  }

  async setFavorites(ids: string[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    await vscode.workspace.getConfiguration('cortex').update('openrouterModels', unique, vscode.ConfigurationTarget.Global);
  }

  /** Reads the list again when an account exists and the cache is stale (or `force`). */
  refresh(force = false): Promise<void> {
    if (!this.accounts.all().some((a) => a.provider === 'openrouter')) return Promise.resolve();
    // OpenRouter adds models weekly, not hourly — twelve hours is fresh enough.
    if (!force && this.catalog.length && this.list.isFresh()) return Promise.resolve();
    return this.list.fetch(async (models) => {
      this.catalog = models;
      await this.list.save({ models });
      this.apply();
      this.emitter.fire();
    });
  }

  /** Hands the picker list and the review chain to the adapter. */
  private apply(): void {
    // Before the first catalog read nothing can be checked, so favourites pass
    // as they are; afterwards a model OpenRouter retired is dropped quietly.
    const known = new Map(this.catalog.map((m) => [m.id, m]));
    // The default stands first in every picker, even when it is not a favourite.
    const fallback = this.defaultModel();
    const ids = fallback ? [fallback, ...this.favorites().filter((id) => id !== fallback)] : this.favorites();
    const favorites = ids
      .filter((id) => id === fallback || !this.catalog.length || known.has(id))
      .map((id) => ({ id, label: known.get(id)?.label ?? id }));
    this.adapter.setModels(favorites, this.catalog.length ? freeReviewChain(this.catalog) : undefined, fallback);
  }
}
