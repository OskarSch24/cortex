import { spawn } from 'node:child_process';
import type { McpServerDef } from './mcpSync.js';

/**
 * Ob ein MCP-Server wirklich antwortet — nicht, ob er in einer Datei steht.
 *
 * Geprüft wird genau der Weg, den eine CLI später geht: den Prozess starten
 * oder die URL ansprechen, `initialize`, `notifications/initialized`,
 * `tools/list`. Erst eine Werkzeugliste ist ein Beleg. Alles davor — ein
 * Eintrag in mcp.json, ein laufender Prozess, ein 200 auf der Startseite — ist
 * keiner.
 *
 * Die Prüfung schreibt nichts und merkt sich nichts. Was sie herausfindet, gibt
 * sie zurück; ob und wo es gespeichert wird, entscheidet der Aufrufer.
 */

export interface ProbeTool {
  name: string;
  title?: string;
  description?: string;
}

export type ProbeFailure =
  /** Der Server verlangt eine Anmeldung oder hat den mitgeschickten Token abgelehnt. */
  | 'auth'
  /** Das Programm fehlt auf diesem Mac. */
  | 'missing'
  /** Der Prozess ist gestartet und wieder gestorben, bevor er geantwortet hat. */
  | 'start'
  /** Keine Antwort in der erlaubten Zeit. */
  | 'timeout'
  /** Nicht erreichbar: DNS, TLS, abgelehnte Verbindung, HTTP-Fehler. */
  | 'network'
  /** Er hat geantwortet, aber nicht wie ein MCP-Server. */
  | 'protocol';

export type ProbeResult =
  | {
      ok: true;
      server?: { name?: string; title?: string; version?: string };
      tools: ProbeTool[];
      /** Wie lange der Weg bis zur Werkzeugliste gedauert hat. */
      ms: number;
      /** Was ein lokaler Server nebenbei auf stderr geschrieben hat. */
      log?: string;
      /**
       * Der Server antwortet, verweigert aber den ersten echten Aufruf — etwa
       * Xcode, solange der Agent dort nicht freigegeben ist. Ein Satz dazu.
       */
      notice?: string;
      /** Die Antwort des Servers dahinter. */
      noticeDetail?: string;
    }
  | {
      ok: false;
      reason: ProbeFailure;
      /** Ein Satz für die Oberfläche. */
      message: string;
      /** Das Rohe dahinter: stderr-Ende, HTTP-Status, Fehlertext. */
      detail?: string;
      /** Der `WWW-Authenticate`-Kopf einer 401 — der Einstieg für die Anmeldung. */
      wwwAuthenticate?: string;
      /** Das ganze stderr-Ende eines lokalen Servers, für „Protokoll anzeigen“. */
      log?: string;
    };

export interface ProbeOptions {
  /** Zusätzliche Umgebung für einen lokalen Server — etwa ein API-Schlüssel. */
  env?: Record<string, string>;
  /** Zusätzliche Header für einen entfernten Server — etwa der Bearer-Token. */
  headers?: Record<string, string>;
  /** Vorgabe: 120 s lokal (npx lädt beim ersten Mal), 20 s entfernt. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Für Tests. */
  fetch?: typeof fetch;
  /**
   * Nach der Werkzeugliste ein harmloser Aufruf, der zeigt, ob der Server auch
   * wirklich arbeitet. Passt seine Antwort auf `blocked`, gilt er als verbunden
   * mit offenem Punkt (`notice`). Nur lokal (stdio).
   */
  readiness?: { tool: string; arguments?: Record<string, unknown>; blocked: RegExp; notice: string };
}

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'cortex', title: 'Cortex', version: '1' };
/** Eine Werkzeugliste über mehr Seiten ist denkbar, eine endlose nicht. */
const MAX_TOOL_PAGES = 10;

export async function probeServer(def: McpServerDef, options: ProbeOptions = {}): Promise<ProbeResult> {
  if (def.url) {
    return isSseUrl(def.url) ? probeSse(def.url, options) : probeHttp(def.url, options);
  }
  if (def.command) return probeStdio(def, options);
  return { ok: false, reason: 'protocol', message: 'Die Definition hat weder „command“ noch „url“.' };
}

/**
 * Ein Server mit `/sse` am Ende spricht das ältere Protokoll: ein offener
 * GET-Strom, auf dem die Antworten ankommen, und eine zweite Adresse für die
 * Anfragen. Alle anderen URLs sind Streamable HTTP.
 */
export function isSseUrl(url: string): boolean {
  try {
    return /\/sse\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Gemeinsam

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

const initializeRequest = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
});
const initializedNotification = { jsonrpc: '2.0', method: 'notifications/initialized' };
const toolsRequest = (id: number, cursor?: string) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/list',
  params: cursor ? { cursor } : {},
});

function serverInfo(result: Record<string, unknown> | undefined) {
  const info = result?.serverInfo as Record<string, unknown> | undefined;
  if (!info) return undefined;
  const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return { name: text(info.name), title: text(info.title), version: text(info.version) };
}

function readTools(result: Record<string, unknown> | undefined): { tools: ProbeTool[]; next?: string } {
  const list = Array.isArray(result?.tools) ? (result!.tools as unknown[]) : [];
  const tools: ProbeTool[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.name !== 'string') continue;
    tools.push({
      name: t.name,
      title: typeof t.title === 'string' ? t.title : undefined,
      description: typeof t.description === 'string' ? firstSentence(t.description) : undefined,
    });
  }
  const next = typeof result?.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined;
  return { tools, next };
}

/** Werkzeugbeschreibungen sind oft ganze Handbücher — für eine Liste reicht der erste Satz. */
function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const cut = flat.search(/[.!?](\s|$)/);
  const sentence = cut > 0 ? flat.slice(0, cut + 1) : flat;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

/** Die Id des Bereitschaftsaufrufs — weit weg von den Seiten der Werkzeugliste. */
const READINESS_ID = 9_000;

function callTexts(result: Record<string, unknown> | undefined): string[] {
  const content = Array.isArray(result?.content) ? (result!.content as Array<Record<string, unknown>>) : [];
  return content.map((c) => (typeof c.text === 'string' ? c.text : '')).filter(Boolean);
}

function rpcError(message: JsonRpcMessage, step: string): ProbeResult {
  return {
    ok: false,
    reason: 'protocol',
    message: `Der Server hat „${step}“ mit einem Fehler beantwortet.`,
    detail: message.error?.message ?? JSON.stringify(message.error),
  };
}

const tail = (text: string, max = 600) => {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
};

// ---------------------------------------------------------------------------
// Lokal: stdio

function probeStdio(def: McpServerDef, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise<ProbeResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const tools: ProbeTool[] = [];
    let info: ReturnType<typeof serverInfo>;
    let pages = 0;

    const child = spawn(def.command!, def.args ?? [], {
      env: { ...process.env, ...(def.env ?? {}), ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      const log = tail(stderr, 8_000);
      if (log) result = { ...result, log };
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      stop(child);
      resolve(result);
    };
    const onAbort = () => finish({ ok: false, reason: 'timeout', message: 'Prüfung abgebrochen.' });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          reason: 'timeout',
          message: `Der Server hat nach ${Math.round(timeoutMs / 1000)} s noch nicht geantwortet.`,
          detail: tail(stderr) || undefined,
        }),
      timeoutMs,
    );

    const send = (message: unknown) => {
      if (child.stdin.writable) child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(
        error.code === 'ENOENT'
          ? { ok: false, reason: 'missing', message: `„${def.command}“ ist auf diesem Mac nicht zu finden.` }
          : { ok: false, reason: 'start', message: `„${def.command}“ ließ sich nicht starten.`, detail: error.message },
      );
    });
    // Ein Server, der beim Beenden noch schreibt, soll die Prüfung nicht umwerfen.
    child.stdin.on('error', () => {});
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });
    child.on('close', (code, signal) => {
      finish({
        ok: false,
        reason: 'start',
        message:
          code === 0 || signal
            ? 'Der Server hat sich beendet, ohne zu antworten.'
            : `Der Server ist beim Start mit Code ${code} ausgestiegen.`,
        detail: tail(stderr) || undefined,
      });
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      let newline: number;
      while ((newline = stdout.indexOf('\n')) !== -1) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(line) as JsonRpcMessage;
        } catch {
          // Manche Server schreiben Begrüßungen auf stdout. Das ist unsauber, aber
          // kein Grund, die Verbindung für kaputt zu erklären.
          continue;
        }
        // Anfragen des Servers an den Client (etwa `roots/list`) beantworten wir
        // leer, damit er nicht auf uns wartet.
        if (message.method && message.id !== undefined && message.id !== null) {
          send({ jsonrpc: '2.0', id: message.id, result: {} });
          continue;
        }
        if (message.id === 1) {
          if (message.error) return finish(rpcError(message, 'initialize'));
          info = serverInfo(message.result);
          send(initializedNotification);
          send(toolsRequest(2));
        } else if (message.id === READINESS_ID && options.readiness) {
          const text = [message.error?.message, ...callTexts(message.result)].filter(Boolean).join(' ');
          const blocked = options.readiness.blocked.test(text);
          finish({
            ok: true, server: info, tools, ms: Date.now() - started,
            ...(blocked ? { notice: options.readiness.notice, noticeDetail: tail(text, 400) } : {}),
          });
        } else if (typeof message.id === 'number' && message.id >= 2) {
          if (message.error) return finish(rpcError(message, 'tools/list'));
          const page = readTools(message.result);
          tools.push(...page.tools);
          pages++;
          if (page.next && pages < MAX_TOOL_PAGES) {
            send(toolsRequest(message.id + 1, page.next));
          } else if (options.readiness && tools.some((t) => t.name === options.readiness!.tool)) {
            send({ jsonrpc: '2.0', id: READINESS_ID, method: 'tools/call', params: { name: options.readiness.tool, arguments: options.readiness.arguments ?? {} } });
          } else {
            finish({ ok: true, server: info, tools, ms: Date.now() - started });
          }
        }
      }
    });

    send(initializeRequest(1));
  });
}

/** Beenden, und wer nicht hört, nach zwei Sekunden hart. */
function stop(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.stdin?.end();
    child.kill('SIGTERM');
  } catch {
    return;
  }
  const hard = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, 2_000);
  hard.unref();
}

// ---------------------------------------------------------------------------
// Entfernt: Streamable HTTP

async function probeHttp(url: string, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20_000;
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
      headers['mcp-protocol-version'] = PROTOCOL_VERSION;
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

    const tools: ProbeTool[] = [];
    let cursor: string | undefined;
    for (let page = 0, id = 2; page < MAX_TOOL_PAGES; page++, id++) {
      const listed = await call(toolsRequest(id, cursor) as JsonRpcMessage & { id: number });
      if ('ok' in listed) return listed;
      if (listed.error) return rpcError(listed, 'tools/list');
      const read = readTools(listed.result);
      tools.push(...read.tools);
      cursor = read.next;
      if (!cursor) break;
    }

    // Die Sitzung wieder freigeben — höflich, nicht notwendig.
    if (sessionId) {
      void doFetch(url, {
        method: 'DELETE',
        headers: { ...(options.headers ?? {}), 'mcp-session-id': sessionId, 'mcp-protocol-version': PROTOCOL_VERSION },
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

async function httpFailure(response: Response): Promise<ProbeResult | undefined> {
  if (response.status === 401 || response.status === 403) {
    const wwwAuthenticate = response.headers.get('www-authenticate') ?? undefined;
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      reason: 'auth',
      message:
        response.status === 401
          ? 'Der Server verlangt eine Anmeldung.'
          : 'Der Server hat den Zugang abgelehnt.',
      detail: tail(body, 300) || `HTTP ${response.status}`,
      wwwAuthenticate,
    };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      reason: 'network',
      message: `Der Server hat mit HTTP ${response.status} geantwortet.`,
      detail: tail(body, 300) || undefined,
    };
  }
  return undefined;
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

function pick(message: unknown, id: number): JsonRpcMessage | undefined {
  const list = Array.isArray(message) ? message : [message];
  return list.find(
    (m): m is JsonRpcMessage => !!m && typeof m === 'object' && (m as JsonRpcMessage).id === id,
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fetchFailure(error: unknown, aborted: boolean, timeoutMs: number, cancelled?: boolean): ProbeResult {
  if (cancelled) return { ok: false, reason: 'timeout', message: 'Prüfung abgebrochen.' };
  if (aborted) {
    return {
      ok: false,
      reason: 'timeout',
      message: `Der Server hat nach ${Math.round(timeoutMs / 1000)} s noch nicht geantwortet.`,
    };
  }
  const cause = (error as { cause?: { code?: string; message?: string } })?.cause;
  return {
    ok: false,
    reason: 'network',
    message: 'Der Server ist nicht erreichbar.',
    detail: cause?.code ?? cause?.message ?? (error instanceof Error ? error.message : String(error)),
  };
}

// ---------------------------------------------------------------------------
// Entfernt: das ältere SSE-Protokoll

async function probeSse(url: string, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20_000;
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

    const tools: ProbeTool[] = [];
    let cursor: string | undefined;
    for (let page = 0, id = 2; page < MAX_TOOL_PAGES; page++, id++) {
      const bad = await post(toolsRequest(id, cursor));
      if (bad) return bad;
      const listed = await await_(id);
      if (!listed) return { ok: false, reason: 'protocol', message: 'Keine Antwort auf „tools/list“.' };
      if (listed.error) return rpcError(listed, 'tools/list');
      const read = readTools(listed.result);
      tools.push(...read.tools);
      cursor = read.next;
      if (!cursor) break;
    }
    return { ok: true, server: serverInfo(init.result), tools, ms: Date.now() - started };
  } catch (error) {
    return fetchFailure(error, controller.signal.aborted, timeoutMs, options.signal?.aborted);
  } finally {
    clearTimeout(timer);
    controller.abort();
    options.signal?.removeEventListener('abort', onAbort);
  }
}

// ---------------------------------------------------------------------------
// SSE lesen

interface SseEvent {
  event: string;
  data: string;
}

async function* sseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(buffer[newline] === '\r' ? newline + 2 : newline + 1);
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = 'message';
          data = [];
        } else if (line.startsWith(':')) {
          // Kommentar, meist ein Lebenszeichen.
        } else {
          const colon = line.indexOf(':');
          const field = colon === -1 ? line : line.slice(0, colon);
          const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
      }
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    reader.releaseLock();
  }
}
