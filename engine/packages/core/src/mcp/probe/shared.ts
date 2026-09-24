import { nonEmptyString } from '../../util/guards.js';
import { MCP_PROTOCOL_VERSION } from '../transport.js';

/** Was alle drei Wege der Prüfung (stdio, HTTP, SSE) gleich brauchen. */

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

const CLIENT_INFO = { name: 'cortex', title: 'Cortex', version: '1' };
/** Eine Werkzeugliste über mehr Seiten ist denkbar, eine endlose nicht. */
export const MAX_TOOL_PAGES = 10;

export interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
}

export const initializeRequest = (id: number) => ({
  jsonrpc: '2.0',
  id,
  method: 'initialize',
  params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
});
export const initializedNotification = { jsonrpc: '2.0', method: 'notifications/initialized' };
export const toolsRequest = (id: number, cursor?: string) => ({
  jsonrpc: '2.0',
  id,
  method: 'tools/list',
  params: cursor ? { cursor } : {},
});

export function serverInfo(result: Record<string, unknown> | undefined) {
  const info = result?.serverInfo as Record<string, unknown> | undefined;
  if (!info) return undefined;
  return { name: nonEmptyString(info.name), title: nonEmptyString(info.title), version: nonEmptyString(info.version) };
}

export function readTools(result: Record<string, unknown> | undefined): { tools: ProbeTool[]; next?: string } {
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

export function rpcError(message: JsonRpcMessage, step: string): ProbeResult {
  return {
    ok: false,
    reason: 'protocol',
    message: `Der Server hat „${step}“ mit einem Fehler beantwortet.`,
    detail: message.error?.message ?? JSON.stringify(message.error),
  };
}

export const tail = (text: string, max = 600) => {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim();
  return clean.length > max ? `…${clean.slice(-max)}` : clean;
};

/**
 * `tools/list` über alle Seiten, höchstens MAX_TOOL_PAGES. `page` holt eine
 * Seite (Ids ab 2) oder sagt, warum es nicht ging.
 */
export async function listTools(
  page: (id: number, cursor: string | undefined) => Promise<{ message: JsonRpcMessage } | { failure: ProbeResult }>,
): Promise<ProbeTool[] | ProbeResult> {
  const tools: ProbeTool[] = [];
  let cursor: string | undefined;
  for (let n = 0, id = 2; n < MAX_TOOL_PAGES; n++, id++) {
    const listed = await page(id, cursor);
    if ('failure' in listed) return listed.failure;
    if (listed.message.error) return rpcError(listed.message, 'tools/list');
    const read = readTools(listed.message.result);
    tools.push(...read.tools);
    cursor = read.next;
    if (!cursor) break;
  }
  return tools;
}
