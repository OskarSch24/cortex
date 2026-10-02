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
import { runOpenRouterMedia } from './openrouterMedia.js';
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

/**
 * What the chat picker offers until the user chooses their own favourites —
 * chosen by the user (2026-09-26): the models OpenRouter has and the
 * subscriptions do not. Two Jev decision models, an image model, an avatar
 * video model and one chat model.
 */
export const OPENROUTER_DEFAULT_FAVORITES: ModelOption[] = [
  { id: '~typesafe/jev-latest', label: 'Jev Latest', output: 'decisions' },
  { id: 'typesafe/jev-1.13', label: 'Jev 1.13', output: 'decisions' },
  { id: 'openai/gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst', output: 'image' },
  { id: 'heygen/avatar-iv', label: 'Avatar IV', output: 'video' },
  { id: 'sakana/sakana-namazu', label: 'Sakana Namazu' },
];

export const isFreeModel = (id: string): boolean => id.endsWith(':free');

/**
 * What an OpenRouter model produces — and so which API Cortex calls it
 * through: text over chat completions, images over the Image API, videos over
 * the asynchronous Video API, typed decisions over the Decisions API.
 */
export type OpenRouterKind = 'text' | 'image' | 'video' | 'decisions';

/** One entry of OpenRouter's public model list, reduced to what Cortex shows. */
export interface OpenRouterModel {
  id: string;
  label: string;
  free: boolean;
  /** Missing in lists cached before Cortex knew other kinds: those were all chat models. */
  kind?: OpenRouterKind;
  contextLength?: number;
  /** US dollars per million input tokens. */
  promptPerMillion?: number;
  /** US dollars per million output tokens. */
  completionPerMillion?: number;
  /** Image models: US dollars per million image output tokens. */
  imagePerMillion?: number;
  /** Video models: US dollars per second of video, the cheapest tier. */
  videoPerSecond?: number;
  created?: number;
}

interface ListedModel {
  id: string;
  name?: string;
  context_length?: number;
  created?: number;
  pricing?: { prompt?: string; completion?: string; image_output?: string };
  architecture?: { output_modalities?: string[] };
  pricing_skus?: Record<string, string>;
}

/**
 * Which kind a listed model is. The Image and Video APIs keep their own lists,
 * and those decide — a chat router that can also return an image
 * (`openrouter/auto`) is still a chat model. Only when a list could not be
 * read do the output modalities stand in for it. Speech, transcription,
 * embeddings and rerank models get no kind: Cortex cannot run them.
 */
export function openRouterKind(model: ListedModel, images?: Set<string>, videos?: Set<string>): OpenRouterKind | undefined {
  const out = model.architecture?.output_modalities ?? ['text'];
  if (videos ? videos.has(model.id) : out.includes('video')) return 'video';
  if (images ? images.has(model.id) : out.includes('image') && !out.includes('text')) return 'image';
  if (out.includes('decisions')) return 'decisions';
  return out.includes('text') ? 'text' : undefined;
}

/**
 * The live model list, every kind Cortex can run. Public — no key needed.
 * Batch variants are dropped: they answer hours later and make no sense in a
 * chat.
 */
export async function fetchOpenRouterModels(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  signal?: AbortSignal,
): Promise<OpenRouterModel[]> {
  // The default list holds chat models only; images, videos and decisions
  // appear with `output_modalities=all`.
  const response = await fetchImpl(`${OPENROUTER_API_BASE}/models?output_modalities=all`, { signal });
  if (!response.ok) throw new Error(`OpenRouter: ${response.status} ${response.statusText}`);
  const body = (await response.json()) as { data?: ListedModel[] };
  const listed = async (path: string): Promise<ListedModel[] | undefined> => {
    try {
      const reply = await fetchImpl(`${OPENROUTER_API_BASE}${path}`, { signal });
      return reply.ok ? ((await reply.json()) as { data?: ListedModel[] }).data : undefined;
    } catch {
      return undefined;
    }
  };
  const [imageList, videoList] = await Promise.all([listed('/images/models'), listed('/videos/models')]);
  const ids = (list?: ListedModel[]) => (list ? new Set(list.map((m) => m.id)) : undefined);
  const images = ids(imageList);
  const videos = ids(videoList);
  const perSecond = new Map(
    (videoList ?? []).map((m) => {
      const prices = Object.values(m.pricing_skus ?? {}).map(Number).filter((n) => Number.isFinite(n) && n > 0);
      return [m.id, prices.length ? Math.min(...prices) : undefined] as const;
    }),
  );
  const perMillion = (v?: string) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) * 1e6 : undefined);
  return (body.data ?? []).flatMap((m) => {
    if (typeof m.id !== 'string' || m.id.endsWith(':batch')) return [];
    const kind = openRouterKind(m, images, videos);
    if (!kind) return [];
    return [{
      id: m.id,
      // "Anthropic: Claude Opus 5" → "Claude Opus 5"; the lab is in the id.
      label: (m.name ?? m.id).replace(/^[^:]+:\s*/, ''),
      free: isFreeModel(m.id),
      kind,
      contextLength: m.context_length,
      promptPerMillion: perMillion(m.pricing?.prompt),
      completionPerMillion: perMillion(m.pricing?.completion),
      ...(kind === 'image' ? { imagePerMillion: perMillion(m.pricing?.image_output) } : {}),
      ...(kind === 'video' ? { videoPerSecond: perSecond.get(m.id) } : {}),
      created: m.created,
    }];
  });
}

/**
 * Free models worth asking for a review, best first: the largest context
 * windows among the newest free models. Falls back to the built-in list when
 * the catalog has none.
 */
export function freeReviewChain(catalog: OpenRouterModel[], size = 3): ModelOption[] {
  const free = catalog
    // A review is read and answered in prose — only a chat model can give one.
    .filter((m) => (m.kind ?? 'text') === 'text' && m.free && (m.contextLength ?? 0) >= 32_000)
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
  /**
   * The chat picker's list: exactly the user's favourites. The free reviewers
   * stay behind the scenes — the second opinion and a run without a model
   * still walk them.
   */
  models: ModelOption[] = OPENROUTER_DEFAULT_FAVORITES;
  /** Free models a review walks through, best first. */
  freeChain: ModelOption[] = OPENROUTER_FREE_MODELS;
  /** Chosen in the settings; answers whenever a run names no model. */
  defaultModel?: string;
  /** What each model produces, from the live catalog; a model not in it chats. */
  private kinds = new Map<string, OpenRouterKind>(
    OPENROUTER_DEFAULT_FAVORITES.flatMap((m) => (m.output ? [[m.id, m.output] as const] : [])),
  );

  // Wrapped rather than passed as a bare reference so the global keeps its own
  // receiver when it is called as a method of this adapter.
  constructor(private fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  /** Replaces the picker list and the review chain, e.g. after the catalog was read. */
  setModels(models: ModelOption[], freeChain?: ModelOption[], defaultModel?: string): void {
    if (freeChain?.length) this.freeChain = freeChain;
    this.defaultModel = defaultModel || undefined;
    const seen = new Set<string>();
    this.models = models.filter((m) => !seen.has(m.id) && !!seen.add(m.id));
    for (const m of this.models) if (m.output) this.kinds.set(m.id, m.output);
  }

  /** Learns from the live catalog which API each model is called through. */
  setCatalog(catalog: OpenRouterModel[]): void {
    for (const m of catalog) this.kinds.set(m.id, m.kind ?? 'text');
  }

  /** What `id` produces — a chat model unless the catalog says otherwise. */
  kindOf(id: string): OpenRouterKind {
    return this.kinds.get(id) ?? 'text';
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
    // Image, video and decision models do not chat; each has its own API.
    const kind = requested ? this.kindOf(requested) : 'text';
    if (requested && kind !== 'text') {
      yield* runOpenRouterMedia(kind, { fetchImpl: this.fetchImpl, key, model: requested, req, signal });
      return;
    }
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
