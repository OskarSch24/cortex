import type { LoginFlow, ProviderAdapter, RunRequest } from './adapter.js';
import { scopedMcpRefusal } from './outcome.js';
import {
  OPENROUTER_API_BASE,
  OPENROUTER_CHAT_URL,
  openRouterErrorMessage,
  openRouterHeaders,
  openRouterNoCredit,
} from './openrouterHttp.js';
import { citationsFrom, formatSources, openRouterSearchTools, type WebSearchResult } from './webSearch.js';
import { buildChildEnv } from '../accounts/env.js';
import { isTransientFailure } from './limits.js';
import type { AdapterEvent, ResolvedAccount, Usage } from '../types.js';
import type { ModelOption } from '../models/catalog.js';

/**
 * Any model on OpenRouter over its HTTP API — the only provider here that is
 * not a CLI.
 *
 * Two jobs. The second opinion: a review needs a model from a different lab
 * reading a diff, a single stateless request that a free model can carry. And
 * plain chat: with the user's own key, any model on OpenRouter can answer a
 * message the user explicitly sends there. Either way there are no tools, no
 * sandbox and no session, so it is never routed an edit on its own (see
 * `REVIEW_ONLY_PROVIDERS`); it only answers when picked by hand.
 *
 * Two facts about free models shape the code below. The free list rotates
 * without notice, so a pinned model id will eventually 404 — a free request
 * walks a chain instead of trusting one. And free capacity runs out both
 * per-model (busy hour) and per-account (daily cap), both reported as 429 — so
 * a 429 is worth retrying on another free model before it is believed as a
 * real limit. A paid model the user chose is never swapped for another one.
 */

/**
 * Fallback reviewers, used until the live catalog has been read. Ordered by
 * usefulness as a reviewer: a large reasoning model first, then a coder, then
 * a generalist. Ids ending in `:free` are the zero-cost variants; everything
 * else on OpenRouter bills the account.
 */
export const OPENROUTER_FREE_MODELS: ModelOption[] = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'Nemotron 3 Ultra (free)' },
  { id: 'qwen/qwen3.8-27b:free', label: 'Qwen3.8 27B (free)' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)' },
];

/** What the chat picker offers until the user chooses their own favourites. */
export const OPENROUTER_DEFAULT_FAVORITES = [
  'anthropic/claude-opus-5',
  'openai/gpt-5.6-terra',
  'google/gemini-3.8-flash',
  'x-ai/grok-4.7',
  'deepseek/deepseek-v4-pro',
  'moonshotai/kimi-k3',
  'z-ai/glm-5.3',
];

/**
 * The built-in favourites with each Claude entry moved to the newest release
 * of its family in the live catalog — `anthropic/claude-opus-5` becomes
 * `anthropic/claude-opus-5.5` once that exists. Other labs stay as listed.
 */
export function currentDefaultFavorites(catalog: OpenRouterModel[]): string[] {
  const version = (id: string) => /^anthropic\/claude-(sonnet|opus|fable)-(\d+)(?:\.(\d+))?$/.exec(id);
  return OPENROUTER_DEFAULT_FAVORITES.map((id) => {
    const family = version(id)?.[1];
    if (!family) return id;
    const newest = catalog
      .map((m) => version(m.id))
      .filter((v): v is RegExpExecArray => !!v && v[1] === family)
      .sort((a, b) => Number(b[2]) - Number(a[2]) || Number(b[3] ?? 0) - Number(a[3] ?? 0))[0];
    return newest?.[0] ?? id;
  });
}

export const isFreeModel = (id: string): boolean => id.endsWith(':free');

/** One entry of OpenRouter's public model list, reduced to what Cortex shows. */
export interface OpenRouterModel {
  id: string;
  label: string;
  free: boolean;
  contextLength?: number;
  /** US dollars per million input tokens. */
  promptPerMillion?: number;
  /** US dollars per million output tokens. */
  completionPerMillion?: number;
  created?: number;
}

/**
 * The live model list. Public — no key needed. Batch variants are dropped:
 * they answer hours later and make no sense in a chat.
 */
export async function fetchOpenRouterModels(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  signal?: AbortSignal,
): Promise<OpenRouterModel[]> {
  const response = await fetchImpl(`${OPENROUTER_API_BASE}/models`, { signal });
  if (!response.ok) throw new Error(`OpenRouter: ${response.status} ${response.statusText}`);
  const body = (await response.json()) as {
    data?: Array<{ id: string; name?: string; context_length?: number; created?: number; pricing?: { prompt?: string; completion?: string } }>;
  };
  const perMillion = (v?: string) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) * 1e6 : undefined);
  return (body.data ?? [])
    .filter((m) => typeof m.id === 'string' && !m.id.endsWith(':batch'))
    .map((m) => ({
      id: m.id,
      // "Anthropic: Claude Opus 5" → "Claude Opus 5"; the lab is in the id.
      label: (m.name ?? m.id).replace(/^[^:]+:\s*/, ''),
      free: isFreeModel(m.id),
      contextLength: m.context_length,
      promptPerMillion: perMillion(m.pricing?.prompt),
      completionPerMillion: perMillion(m.pricing?.completion),
      created: m.created,
    }));
}

/**
 * Free models worth asking for a review, best first: the largest context
 * windows among the newest free models. Falls back to the built-in list when
 * the catalog has none.
 */
export function freeReviewChain(catalog: OpenRouterModel[], size = 3): ModelOption[] {
  const free = catalog
    .filter((m) => m.free && (m.contextLength ?? 0) >= 32_000)
    .sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0) || (b.created ?? 0) - (a.created ?? 0))
    .slice(0, size)
    .map((m) => ({ id: m.id, label: m.label }));
  return free.length ? free : OPENROUTER_FREE_MODELS;
}

/** What OpenRouter says about a key — enough to show which key is connected. */
export interface OpenRouterKeyInfo {
  label: string;
  /** Credit limit in US dollars, when the key has one. */
  limit?: number;
  usage?: number;
  freeTier: boolean;
}

/** Checks a key against OpenRouter before it is stored. Throws a readable error. */
export async function verifyOpenRouterKey(
  key: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  signal?: AbortSignal,
): Promise<OpenRouterKeyInfo> {
  const response = await fetchImpl(`${OPENROUTER_API_BASE}/key`, {
    signal,
    headers: { Authorization: `Bearer ${key.trim()}` },
  });
  const text = await response.text().catch(() => '');
  if (response.status === 401 || response.status === 403) {
    throw new Error('OpenRouter hat den Schlüssel abgelehnt. Prüfe ihn unter openrouter.ai/keys.');
  }
  if (!response.ok) throw new Error(`OpenRouter: ${openRouterErrorMessage(text) ?? `${response.status} ${response.statusText}`}`);
  const data = (JSON.parse(text) as { data?: { label?: string; limit?: number | null; usage?: number; is_free_tier?: boolean } }).data ?? {};
  return {
    label: data.label || 'OpenRouter-Schlüssel',
    limit: typeof data.limit === 'number' ? data.limit : undefined,
    usage: data.usage,
    freeTier: !!data.is_free_tier,
  };
}

/** A model that is gone or unroutable right now — try the next one instead. */
function isModelUnavailable(status: number, body: string): boolean {
  return status === 404 || /no (?:endpoints|allowed providers) found|not a valid model/i.test(body);
}

interface StreamChoice {
  delta?: { content?: string | null; annotations?: unknown };
  message?: { annotations?: unknown };
}

interface StreamChunk {
  choices?: StreamChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string };
}

export class OpenRouterAdapter implements ProviderAdapter {
  readonly id = 'openrouter' as const;
  readonly displayName = 'OpenRouter';
  /** Stateless HTTP; the caller supplies whatever history matters. */
  readonly supportsNativeResume = false;
  /** The chat picker's list: the user's favourites, then the free reviewers. */
  models: ModelOption[] = OPENROUTER_FREE_MODELS;
  /** Free models a review walks through, best first. */
  freeChain: ModelOption[] = OPENROUTER_FREE_MODELS;
  /** Chosen in the settings; answers whenever a run names no model. */
  defaultModel?: string;

  // Wrapped rather than passed as a bare reference so the global keeps its own
  // receiver when it is called as a method of this adapter.
  constructor(private fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  /** Replaces the picker list and the review chain, e.g. after the catalog was read. */
  setModels(models: ModelOption[], freeChain?: ModelOption[], defaultModel?: string): void {
    if (freeChain?.length) this.freeChain = freeChain;
    this.defaultModel = defaultModel || undefined;
    const seen = new Set<string>();
    this.models = [...models, ...this.freeChain].filter((m) => !seen.has(m.id) && !!seen.add(m.id));
  }

  buildEnv(account: ResolvedAccount, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return buildChildEnv(account, base);
  }

  async *run(
    req: RunRequest,
    account: ResolvedAccount,
    signal: AbortSignal,
  ): AsyncGenerator<AdapterEvent> {
    const mcpRefusal = scopedMcpRefusal(this.id, req.mcpServers);
    if (mcpRefusal) {
      yield mcpRefusal;
      return;
    }
    const key = account.secret?.trim();
    if (!key) {
      yield {
        type: 'error',
        message: 'no OpenRouter API key stored for this account — re-add it to save one',
        retryable: false,
      };
      return;
    }

    // No model named: the default from the settings. A paid model is billed
    // and meant — it is asked alone. A free one (or none at all) walks the
    // free chain, the requested model first.
    const requested = req.model ?? this.defaultModel;
    const freeIds = this.freeChain.map((m) => m.id);
    const chain = requested && !isFreeModel(requested)
      ? [requested]
      : requested
        ? [requested, ...freeIds.filter((id) => id !== requested)]
        : freeIds;

    for (let i = 0; i < chain.length; i++) {
      if (signal.aborted) return;
      const model = chain[i]!;
      const isLast = i === chain.length - 1;

      let response: Response;
      try {
        response = await this.open(model, key, req, signal);
      } catch (e) {
        if (signal.aborted) return;
        const message = (e as Error).message;
        yield { type: 'error', message, retryable: isTransientFailure(message) };
        return;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        const detail = openRouterErrorMessage(body) ?? `${response.status} ${response.statusText}`;

        // Both "this model is gone" and "this model is busy" are worth trying
        // the next free model for; only the last one is believed.
        if (!isLast && (isModelUnavailable(response.status, body) || response.status === 429)) {
          continue;
        }
        if (response.status === 402) {
          yield { type: 'error', message: openRouterNoCredit(model), retryable: false };
          return;
        }
        yield response.status === 429 && isFreeModel(model)
          ? // OpenRouter's free allowance is a daily count; the tracker parks
            // the account until it rolls over rather than retrying all day.
            { type: 'limit', scope: 'daily', raw: detail }
          : // A paid model's 429 is a short rate limit, not a day-long one —
            // parking the account would lock every other model out with it.
            { type: 'error', message: `OpenRouter: ${detail}`, retryable: response.status === 429 || response.status >= 500 };
        return;
      }

      yield* this.stream(response, signal);
      return;
    }
  }

  private open(
    model: string,
    key: string,
    req: RunRequest,
    signal: AbortSignal,
  ): Promise<Response> {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    const brief = req.systemBrief?.trim();
    if (brief) messages.push({ role: 'system', content: brief });
    messages.push({ role: 'user', content: req.prompt });

    // Websuche eines Agenten: OpenRouter führt sie als Server-Tool selbst aus.
    const tools = openRouterSearchTools(req.webSearch);
    return this.fetchImpl(OPENROUTER_CHAT_URL, {
      method: 'POST',
      signal,
      headers: openRouterHeaders(key),
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        usage: { include: true },
        ...(tools.length ? { tools } : {}),
      }),
    });
  }

  /** Server-sent events → text deltas, then one result carrying the whole answer. */
  private async *stream(response: Response, signal: AbortSignal): AsyncGenerator<AdapterEvent> {
    const body = response.body;
    if (!body) {
      yield { type: 'error', message: 'OpenRouter returned an empty stream', retryable: true };
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage: Usage | undefined;
    let cost: number | undefined;
    // Treffer der Websuche — die echten URLs, nicht die aus dem Antworttext.
    const sources: WebSearchResult[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          // Keep-alive comments (": OPENROUTER PROCESSING") arrive between events.
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;

          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(payload) as StreamChunk;
          } catch {
            continue;
          }
          if (chunk.error?.message) {
            yield { type: 'error', message: `OpenRouter: ${chunk.error.message}`, retryable: false };
            return;
          }
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
            };
            if (typeof chunk.usage.cost === 'number') cost = chunk.usage.cost;
          }
          // Reasoning models also stream a `reasoning` field; the answer is
          // what the caller asked for, so only `content` is collected.
          const choice = chunk.choices?.[0];
          citationsFrom(choice?.delta?.annotations, sources);
          citationsFrom(choice?.message?.annotations, sources);
          const delta = choice?.delta?.content;
          if (delta) {
            text += delta;
            yield { type: 'text-delta', text: delta };
          }
        }
      }
    } catch (e) {
      if (signal.aborted) return;
      const message = (e as Error).message;
      // A dropped stream that already produced an answer is still an answer.
      if (!text.trim()) {
        yield { type: 'error', message, retryable: isTransientFailure(message) };
        return;
      }
    } finally {
      void reader.cancel().catch(() => undefined);
    }

    if (signal.aborted) return;
    // Die Quellen gehen mit der Antwort weiter, damit Nachfolger im Team echte URLs bekommen.
    const sourceList = formatSources(sources.filter(source => !text.includes(source.url)));
    if (sourceList) {
      text += sourceList;
      yield { type: 'text-delta', text: sourceList };
    }
    yield { type: 'result', text, usage, costUsd: cost ?? 0 };
  }

  interactiveCommand(): { command: string[]; env: NodeJS.ProcessEnv } {
    // Nothing to attach a terminal to — this provider is an HTTP call, and the
    // host filters it out of the interactive picker for that reason.
    throw new Error('OpenRouter has no interactive CLI — it answers over HTTP only');
  }

  loginFlow(): LoginFlow {
    // Unreachable: the account wizard offers OpenRouter only as an API key,
    // which never reaches a login flow.
    throw new Error(
      'OpenRouter is connected with an API key from openrouter.ai/keys — there is no login flow',
    );
  }
}
