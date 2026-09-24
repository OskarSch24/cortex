import * as vscode from 'vscode';
import { claudeModelsFromCatalog, setClaudeModels } from '../../core/src/models/catalog.js';
import type { AccountStore } from './storage/accountStore.js';
import { MODEL_LIST_MAX_AGE_MS, ModelListCache } from './modelListCache.js';

const CACHE_KEY = 'cortex.claudeCatalog';

/**
 * Keeps the Claude model list current without a Cortex update. Anthropic's own
 * list needs an API key, which a subscription account does not have; the
 * public OpenRouter list does not, and it carries every Claude release within
 * days. Only model names are read, nothing is sent — and only once a Claude
 * account is connected.
 */
export class ClaudeCatalog {
  private readonly list: ModelListCache;

  constructor(
    ctx: vscode.ExtensionContext,
    private accounts: AccountStore,
    private changed: () => void,
    private log: (line: string) => void = () => {},
  ) {
    this.list = new ModelListCache(ctx, CACHE_KEY, 'claude', (line) => this.log(line));
    const cached = ctx.globalState.get<{ at: number; ids: string[] }>(CACHE_KEY);
    if (cached) setClaudeModels(claudeModelsFromCatalog(cached.ids));
    ctx.subscriptions.push(accounts.onDidChange(() => void this.refresh()));
    void this.refresh();
    // Anthropic releases a few models a year — twelve hours is fresh enough.
    const timer = setInterval(() => void this.refresh(), MODEL_LIST_MAX_AGE_MS);
    ctx.subscriptions.push({ dispose: () => clearInterval(timer) });
  }

  refresh(force = false): Promise<void> {
    if (!this.accounts.all().some((a) => a.provider === 'claude')) return Promise.resolve();
    if (!force && this.list.isFresh()) return Promise.resolve();
    return this.list.fetch(async (models) => {
      const ids = models.map((m) => m.id).filter((id) => id.startsWith('anthropic/'));
      await this.list.save({ ids });
      const fresh = setClaudeModels(claudeModelsFromCatalog(ids));
      if (fresh.length) {
        this.log(`[claude] Neue Modelle: ${fresh.map((m) => m.label).join(', ')}`);
        this.changed();
      }
    });
  }
}
