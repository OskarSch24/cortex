import { sseEvents } from '../../util/sse.js';
import { PROBE_REMOTE_TIMEOUT_MS } from '../../util/timeouts.js';
import { MCP_PROTOCOL_VERSION } from '../transport.js';
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

// Entfernt: Streamable HTTP

export async function probeHttp(url: string, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? PROBE_REMOTE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let sessionId: string | undefined;
  const post = async (body: unknown) => {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(options.headers ?? {}),
    };
    if (sessionId) headers['mcp-session-id'] = sessionId;
    if (sessionId !== undefined || (body as JsonRpcMessage).method !== 'initialize') {
      headers['mcp-protocol-version'] = MCP_PROTOCOL_VERSION;
    }
    return doFetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  };

  const call = async (body: JsonRpcMessage & { id: number }): Promise<JsonRpcMessage | ProbeResult> => {
    const response = await post(body);
    const failure = await httpFailure(response);
    if (failure) return failure;
    sessionId = response.headers.get('mcp-session-id') ?? sessionId;
    const message = await readResponse(response, body.id);
    if (!message) {
      return { ok: false, reason: 'protocol', message: 'Der Server hat keine JSON-RPC-Antwort geschickt.' };
    }
    return message;
  };

  try {
    const init = await call(initializeRequest(1));
    if ('ok' in init) return init;
    if (init.error) return rpcError(init, 'initialize');
    const info = serverInfo(init.result);

    // Eine Benachrichtigung hat keine Antwort; 202 ist die Regel, aber was der
    // Server sonst schickt, ändert nichts am Ergebnis.
    const notified = await post(initializedNotification);
    await notified.body?.cancel().catch(() => {});

    const tools = await listTools(async (id, cursor) => {
      const listed = await call(toolsRequest(id, cursor) as JsonRpcMessage & { id: number });
      return 'ok' in listed ? { failure: listed } : { message: listed };
    });
    if (!Array.isArray(tools)) return tools;

    // Die Sitzung wieder freigeben — höflich, nicht notwendig.
    if (sessionId) {
      void doFetch(url, {
        method: 'DELETE',
        headers: { ...(options.headers ?? {}), 'mcp-session-id': sessionId, 'mcp-protocol-version': MCP_PROTOCOL_VERSION },
      }).then((r) => r.body?.cancel()).catch(() => {});
    }
    return { ok: true, server: info, tools, ms: Date.now() - started };
  } catch (error) {
    return fetchFailure(error, controller.signal.aborted, timeoutMs, options.signal?.aborted);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Eine Antwort kommt als JSON oder als SSE-Strom, in dem sie irgendwann steht. */
async function readResponse(response: Response, id: number): Promise<JsonRpcMessage | undefined> {
  const type = response.headers.get('content-type') ?? '';
  if (type.includes('text/event-stream')) {
    if (!response.body) return undefined;
    let found: JsonRpcMessage | undefined;
    for await (const event of sseEvents(response.body)) {
      found = pick(parseJson(event.data), id);
      if (found) break;
    }
    // Erst nach der Schleife: solange der Leser den Strom hält, lässt er sich
    // nicht abbrechen, und ein offener Strom hielte die Verbindung fest.
    await response.body.cancel().catch(() => {});
    return found;
  }
  return pick(parseJson(await response.text()), id);
}
