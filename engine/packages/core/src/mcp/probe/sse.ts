import { sseEvents } from '../../util/sse.js';
import { PROBE_REMOTE_TIMEOUT_MS } from '../../util/timeouts.js';
import {
  initializeRequest,
  initializedNotification,
  listTools,
  rpcError,
  serverInfo,
  toolsRequest,
  type JsonRpcMessage,
  type ProbeOptions,
  type ProbeResult,
} from './shared.js';
import { fetchFailure, httpFailure, parseJson, pick } from './remote.js';

// Entfernt: das ältere SSE-Protokoll

export async function probeSse(url: string, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? PROBE_REMOTE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const stream = await doFetch(url, {
      headers: { accept: 'text/event-stream', ...(options.headers ?? {}) },
      signal: controller.signal,
    });
    const failure = await httpFailure(stream);
    if (failure) return failure;
    if (!stream.body) return { ok: false, reason: 'protocol', message: 'Der Server hat keinen Ereignisstrom geöffnet.' };

    const events = sseEvents(stream.body)[Symbol.asyncIterator]();
    const next = async () => {
      const step = await events.next();
      return step.done ? undefined : step.value;
    };

    // Das erste `endpoint`-Ereignis sagt, wohin die Anfragen gehen.
    let endpoint: string | undefined;
    while (!endpoint) {
      const event = await next();
      if (!event) return { ok: false, reason: 'protocol', message: 'Der Server hat keine Anfrageadresse genannt.' };
      if (event.event === 'endpoint') endpoint = new URL(event.data.trim(), url).href;
    }

    const post = async (body: unknown) => {
      const response = await doFetch(endpoint!, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const bad = await httpFailure(response);
      await response.body?.cancel().catch(() => {});
      return bad;
    };
    const await_ = async (id: number): Promise<JsonRpcMessage | undefined> => {
      for (;;) {
        const event = await next();
        if (!event) return undefined;
        const message = pick(parseJson(event.data), id);
        if (message) return message;
      }
    };

    const initFailure = await post(initializeRequest(1));
    if (initFailure) return initFailure;
    const init = await await_(1);
    if (!init) return { ok: false, reason: 'protocol', message: 'Keine Antwort auf „initialize“.' };
    if (init.error) return rpcError(init, 'initialize');
    await post(initializedNotification);

    const tools = await listTools(async (id, cursor) => {
      const bad = await post(toolsRequest(id, cursor));
      if (bad) return { failure: bad };
      const listed = await await_(id);
      return listed
        ? { message: listed }
        : { failure: { ok: false, reason: 'protocol', message: 'Keine Antwort auf „tools/list“.' } };
    });
    if (!Array.isArray(tools)) return tools;
    return { ok: true, server: serverInfo(init.result), tools, ms: Date.now() - started };
  } catch (error) {
    return fetchFailure(error, controller.signal.aborted, timeoutMs, options.signal?.aborted);
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener('abort', onAbort);
  }
}
