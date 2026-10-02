import type { LoginFlow, ProviderAdapter, RunRequest } from './adapter.js';
import { scopedMcpRefusal } from './outcome.js';
import { buildChildEnv } from '../accounts/env.js';
import { isTransientFailure } from './limits.js';
import type { AdapterEvent, LimitInfo, ResolvedAccount, Usage } from '../types.js';
import { ZAI_MODELS, supportedEffort } from '../models/catalog.js';

export { ZAI_MODELS };

/**
 * Z.ai (Zhipu) über seine OpenAI-kompatible HTTP-API — wie OpenRouter ein
 * Konto mit API-Schlüssel, ohne CLI, ohne Werkzeuge. Es antwortet nur, wenn es
 * im Modellmenü oder bei einem Agenten von Hand gewählt wird.
 *
 * Derselbe Schlüssel gilt für zwei Abrechnungen: der GLM Coding Plan läuft über
 * `/api/coding/paas/v4`, Guthaben über `/api/paas/v4`. Welche der Schlüssel hat,
 * sagt Z.ai erst mit 1113 („kein Guthaben oder kein Paket“) — dann wird der
 * andere Weg versucht.
 */
export const ZAI_API_BASE = 'https://api.z.ai/api/paas/v4';
export const ZAI_CODING_API_BASE = 'https://api.z.ai/api/coding/paas/v4';


/** Z.ai meldet Fehler als `{ error: { code, message } }`; sonst der Rohtext. */
export function zaiError(body: string): { code?: string; message?: string } {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: unknown; message?: unknown }; code?: unknown; msg?: unknown };
    const code = parsed.error?.code ?? parsed.code;
    const message = parsed.error?.message ?? parsed.msg;
    return { code: code === undefined ? undefined : String(code), message: typeof message === 'string' ? message : undefined };
  } catch {
    return { message: body.trim() ? body.trim().slice(0, 300) : undefined };
  }
}

/**
 * Reset-Zeiten schreibt Z.ai ohne Zeitzone in chinesischer Zeit
 * („2026-09-26 19:43:12“ = UTC+8). Als UTC gelesen, wäre ein Konto acht
 * Stunden zu lang gesperrt.
 */
export function zaiResetAt(text: string): number | undefined {
  const m = /reset(?:s)? at\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/i.exec(text);
  if (!m) return undefined;
  const at = Date.parse(`${m[1]}T${m[2]!.length === 5 ? `${m[2]}:00` : m[2]}+08:00`);
  return Number.isFinite(at) ? at : undefined;
}

/** 5-Stunden-, Wochen- und Guthabengrenzen; kurze Ratenlimits sind keine. */
export function detectZaiLimit(code: string | undefined, message: string): LimitInfo | undefined {
  const raw = `${code ? `[${code}] ` : ''}${message}`;
  if (code === '1113' || code === '1309' || /insufficient balance|package has expired/i.test(message)) {
    return { scope: 'credits', raw };
  }
  if (['1310', '1317', '1319', '1321'].includes(code ?? '') || /weekly|7 days/i.test(message) && /limit/i.test(message)) {
    return { scope: 'weekly', resetAt: zaiResetAt(message), raw };
  }
  if (['1308', '1316', '1318', '1320'].includes(code ?? '') || /usage limit reached/i.test(message)) {
    return { scope: 'session', resetAt: zaiResetAt(message), raw };
  }
  return undefined;
}

/** Was nach der Prüfung vom Schlüssel gezeigt wird — gekürzt, nie ganz. */
export interface ZaiKeyInfo { label: string }

export const maskedKey = (key: string): string => (key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-3)}` : 'Z.ai-Schlüssel');

/** Prüft einen Schlüssel an der Modellliste — das kostet kein Kontingent. */
export async function verifyZaiKey(
  key: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  signal?: AbortSignal,
): Promise<ZaiKeyInfo> {
  const ask = (base: string) =>
    fetchImpl(`${base}/models`, { signal, headers: { Authorization: `Bearer ${key.trim()}` } });
  const [general, coding] = await Promise.allSettled([ask(ZAI_API_BASE), ask(ZAI_CODING_API_BASE)]);
  const ok = (r: PromiseSettledResult<Response>) => r.status === 'fulfilled' && r.value.ok;
  if (ok(general) || ok(coding)) {
    return { label: maskedKey(key.trim()) };
  }
  const answered = [general, coding].find((r): r is PromiseFulfilledResult<Response> => r.status === 'fulfilled');
  if (!answered) throw (general as PromiseRejectedResult).reason instanceof Error ? (general as PromiseRejectedResult).reason : new Error('Z.ai antwortet nicht.');
  if (answered.value.status === 401 || answered.value.status === 403) {
    throw new Error('Z.ai hat den Schlüssel abgelehnt. Prüfe ihn unter z.ai/manage-apikey/apikey-list.');
  }
  const detail = zaiError(await answered.value.text().catch(() => ''));
  throw new Error(`Z.ai: ${detail.message ?? `${answered.value.status} ${answered.value.statusText}`}`);
}

interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { code?: string; message?: string };
}

export class ZaiAdapter implements ProviderAdapter {
  readonly id = 'zai' as const;
  readonly displayName = 'Z.ai';
  /** Zustandsloses HTTP; der Aufrufer liefert den Verlauf mit. */
  readonly supportsNativeResume = false;
  readonly models = ZAI_MODELS;

  constructor(private fetchImpl: typeof fetch = (...args) => fetch(...args)) {}

  buildEnv(account: ResolvedAccount, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    return buildChildEnv(account, base);
  }

  async *run(req: RunRequest, account: ResolvedAccount, signal: AbortSignal): AsyncGenerator<AdapterEvent> {
    const mcpRefusal = scopedMcpRefusal(this.id, req.mcpServers);
    if (mcpRefusal) {
      yield mcpRefusal;
      return;
    }
    const key = account.secret?.trim();
    if (!key) {
      yield { type: 'error', message: 'Für dieses Z.ai-Konto ist kein API-Schlüssel gespeichert — bitte neu eintragen.', retryable: false };
      return;
    }
    const model = req.model ?? ZAI_MODELS[0]!.id;
    // Ohne Angabe denkt GLM auf `max`; eine andere Stufe geht nur mit, wenn das Modell sie kennt.
    const effort = supportedEffort(this.id, model, req.effort);
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (req.systemBrief?.trim()) messages.push({ role: 'system', content: req.systemBrief.trim() });
    messages.push({ role: 'user', content: req.prompt });

    // Erst der Coding Plan, bei 1113 das Guthaben.
    const bases = [ZAI_CODING_API_BASE, ZAI_API_BASE];
    for (let i = 0; i < bases.length; i++) {
      if (signal.aborted) return;
      let response: Response;
      try {
        response = await this.fetchImpl(`${bases[i]}/chat/completions`, {
          method: 'POST',
          signal,
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Accept-Language': 'en-US,en' },
          body: JSON.stringify({ model, messages, stream: true, ...(effort ? { reasoning_effort: effort } : {}) }),
        });
      } catch (e) {
        if (signal.aborted) return;
        const message = (e as Error).message;
        yield { type: 'error', message: `Z.ai: ${message}`, retryable: isTransientFailure(message) };
        return;
      }
      if (!response.ok) {
        const { code, message = `${response.status} ${response.statusText}` } = zaiError(await response.text().catch(() => ''));
        if (code === '1113' && i < bases.length - 1) continue;
        if (response.status === 401 || response.status === 403) {
          yield { type: 'error', message: 'Z.ai hat den Schlüssel abgelehnt. Trage unter Einstellungen → Konto einen neuen ein.', retryable: false };
          return;
        }
        const limit = detectZaiLimit(code, message);
        if (limit) {
          yield { type: 'limit', ...limit };
          return;
        }
        yield {
          type: 'error',
          message: `Z.ai: ${message}`,
          retryable: response.status === 429 || response.status >= 500 || code === '1302' || code === '1305',
        };
        return;
      }
      yield* this.stream(response, signal);
      return;
    }
  }

  /** Server-sent events → Textstücke, dann ein Ergebnis mit der ganzen Antwort. */
  private async *stream(response: Response, signal: AbortSignal): AsyncGenerator<AdapterEvent> {
    if (!response.body) {
      yield { type: 'error', message: 'Z.ai hat einen leeren Stream geliefert.', retryable: true };
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
    let usage: Usage | undefined;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
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
            const limit = detectZaiLimit(chunk.error.code, chunk.error.message);
            yield limit ? { type: 'limit', ...limit } : { type: 'error', message: `Z.ai: ${chunk.error.message}`, retryable: false };
            return;
          }
          if (chunk.usage) {
            usage = {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              cachedInputTokens: chunk.usage.prompt_tokens_details?.cached_tokens,
            };
          }
          // GLM denkt immer mit (`reasoning_content`); gesammelt wird nur die Antwort.
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            yield { type: 'text-delta', text: delta };
          }
        }
      }
    } catch (e) {
      if (signal.aborted) return;
      const message = (e as Error).message;
      if (!text.trim()) {
        yield { type: 'error', message: `Z.ai: ${message}`, retryable: isTransientFailure(message) };
        return;
      }
    } finally {
      void reader.cancel().catch(() => undefined);
    }
    if (signal.aborted) return;
    yield { type: 'result', text, usage };
  }

  interactiveCommand(): { command: string[]; env: NodeJS.ProcessEnv } {
    throw new Error('Z.ai hat keine interaktive CLI — es antwortet nur über HTTP');
  }

  loginFlow(): LoginFlow {
    throw new Error('Z.ai wird mit einem API-Schlüssel von z.ai/manage-apikey/apikey-list verbunden — es gibt keine Anmeldung');
  }
}
