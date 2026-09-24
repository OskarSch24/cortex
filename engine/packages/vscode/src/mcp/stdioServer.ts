/**
 * Das Gerüst der kleinen MCP-Server, die eine CLI als eigenen Prozess startet
 * (Genehmigung, Zeichenfläche, Websuche): JSON-RPC zeilenweise über stdio, und
 * jede eigentliche Frage über einen Loopback-Socket an Cortex.
 *
 * Wird in jedes Server-Paket mitgebündelt (esbuild), darf also nur node: kennen.
 */
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

export interface StdioMcpServer {
  /** `serverInfo.name` im Handschlag. */
  name: string;
  /** Feste Protokollversion. Ohne sie gilt die des Clients, ersatzweise `2025-06-18`. */
  protocolVersion?: string;
  tools: readonly unknown[];
  /** Beantwortet `tools/call`; das Ergebnis geht unverändert als `result` zurück. */
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
  /** `ping` beantworten — sonst gilt es als unbekannte Methode. */
  ping: boolean;
  /** Fehlertext für eine unbekannte Methode. */
  unknownMethod(method: string | undefined): string;
  /**
   * `true`: Nachrichten ohne `id` bleiben ganz unbeantwortet, alles mit `id`
   * bekommt eine Antwort. `false` (Genehmigungsserver): Anfragen werden auch
   * ohne `id` beantwortet, `notifications/initialized` nie, eine unbekannte
   * Methode nur mit `id`.
   */
  requireId: boolean;
}

type Send = (message: Record<string, unknown>) => void;

/** Eine eingegangene Nachricht beantworten. Getrennt vom Lesen, damit sie sich ohne Prozess prüfen lässt. */
export async function handleMcpMessage(server: StdioMcpServer, message: JsonRpcMessage, send: Send): Promise<void> {
  const { id, method, params } = message;
  if (server.requireId && id === undefined) return;
  if (method === 'initialize') {
    const protocolVersion = server.protocolVersion ?? (params?.protocolVersion as string) ?? '2025-06-18';
    send({ id, result: { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: server.name, version: '1.0.0' } } });
    return;
  }
  if (!server.requireId && method === 'notifications/initialized') return;
  if (method === 'tools/list') {
    send({ id, result: { tools: server.tools } });
    return;
  }
  if (method === 'tools/call') {
    const call = params ?? {};
    send({ id, result: await server.call(String(call.name), (call.arguments as Record<string, unknown>) ?? {}) });
    return;
  }
  if (server.ping && method === 'ping') {
    send({ id, result: {} });
    return;
  }
  if (id !== undefined) send({ id, error: { code: -32601, message: server.unknownMethod(method) } });
}

/** Liest JSON-RPC zeilenweise von stdin und antwortet auf stdout. Unlesbare Zeilen fallen still weg. */
export function runStdioMcpServer(server: StdioMcpServer): void {
  const send: Send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  createInterface({ input: process.stdin }).on('line', (line) => {
    let message: JsonRpcMessage;
    try { message = JSON.parse(line) as JsonRpcMessage; } catch { return; }
    void handleMcpMessage(server, message, send);
  });
}

export interface LoopbackAsk<T> {
  port: number;
  token: string;
  /** Geht mit dem Token als eine JSON-Zeile an Cortex. */
  payload: Record<string, unknown>;
  timeoutMs: number;
  /** Die Antwort, wenn Port oder Token fehlen oder die Verbindung scheitert. */
  unreachable: T;
  timedOut: T;
  /** Die Antwort, wenn Cortex' Zeile kein JSON ist oder `read` daran scheitert. */
  malformed: T;
  /** Legt Cortex ohne Antwort auf, gilt sofort diese. Ohne sie wartet man bis zum Zeitdeckel. */
  closed?: T;
  /** Macht aus Cortex' Antwortzeile das Ergebnis. */
  read(answer: unknown): T;
}

/** Eine Frage an Cortex auf 127.0.0.1: eine Zeile hin, die erste Zeile zurück zählt. */
export function askLoopback<T>(ask: LoopbackAsk<T>): Promise<T> {
  if (!ask.port || !ask.token) return Promise.resolve(ask.unreachable);
  return new Promise((resolve) => {
    const socket = createConnection({ port: ask.port, host: '127.0.0.1' });
    let buffer = '';
    const done = (value: T) => { clearTimeout(timer); socket.destroy(); resolve(value); };
    const timer = setTimeout(() => done(ask.timedOut), ask.timeoutMs);
    socket.on('error', () => done(ask.unreachable));
    socket.on('connect', () => socket.write(JSON.stringify({ token: ask.token, ...ask.payload }) + '\n'));
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      try { done(ask.read(JSON.parse(buffer.slice(0, nl)))); } catch { done(ask.malformed); }
    });
    if (ask.closed !== undefined) {
      const closed = ask.closed;
      socket.on('close', () => done(closed));
    }
  });
}
