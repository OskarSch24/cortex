import type * as vscode from 'vscode';
import { fetchOpenRouterModels, type OpenRouterModel } from '@cortex/core';

/** Neue Modelle kommen wöchentlich, nicht stündlich — zwölf Stunden sind frisch genug. */
export const MODEL_LIST_MAX_AGE_MS = 12 * 60 * 60_000;

/**
 * Die öffentliche OpenRouter-Modellliste, zwischengespeichert in globalState
 * unter `key` als `{ at, … }`. Gleichzeitige Abrufe teilen sich eine Anfrage;
 * ein Fehlschlag landet nur im Protokoll, der alte Stand bleibt.
 */
export class ModelListCache {
  private inflight?: Promise<void>;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly key: string,
    /** Vorsatz im Protokoll, etwa `claude` oder `openrouter`. */
    private readonly tag: string,
    private readonly log: (line: string) => void,
    private readonly fetchModels: (signal: AbortSignal) => Promise<OpenRouterModel[]> = (signal) => fetchOpenRouterModels(undefined, signal),
  ) {}

  /** Liegt der letzte Abruf weniger als zwölf Stunden zurück? */
  isFresh(): boolean {
    const at = this.ctx.globalState.get<{ at: number }>(this.key)?.at ?? 0;
    return Date.now() - at < MODEL_LIST_MAX_AGE_MS;
  }

  /** Holt die Liste und reicht sie an `apply` weiter; läuft schon ein Abruf, wartet man auf ihn. */
  fetch(apply: (models: OpenRouterModel[]) => Promise<void>): Promise<void> {
    this.inflight ??= this.fetchModels(AbortSignal.timeout(15_000))
      .then(apply)
      .catch((e) => this.log(`[${this.tag}] Modellliste nicht geladen: ${(e as Error).message}`))
      .finally(() => { this.inflight = undefined; });
    return this.inflight;
  }

  /** Legt den neuen Stand mit Zeitstempel ab. */
  save(value: Record<string, unknown>): Thenable<void> {
    return this.ctx.globalState.update(this.key, { at: Date.now(), ...value });
  }
}
