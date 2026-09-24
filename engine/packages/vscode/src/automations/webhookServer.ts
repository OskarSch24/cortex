import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Das HTTP-Handwerk des lokalen Webhooks: Server mit knappen Deckeln, Lauschen
 * nur auf 127.0.0.1, die Prüfungen einer Anfrage und die JSON-Antwort. Was ein
 * Aufruf auslöst, entscheidet die Laufzeit (runtime.ts).
 */

const BODY_LIMIT = 32 * 1024;

/** Antwortet als JSON und schließt die Verbindung; eine schon beendete Antwort bleibt unberührt. */
export function reply(response: ServerResponse, status: number, body: unknown): undefined {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' });
  response.end(JSON.stringify(body));
}

/** Ein HTTP-Server für kurze Aufrufe von diesem Rechner: knappe Zeit- und Kopfzeilendeckel. */
export function createWebhookServer(handler: (request: IncomingMessage, response: ServerResponse) => void): Server {
  const server = createServer(handler);
  server.headersTimeout = 5000;
  server.requestTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.maxHeadersCount = 32;
  return server;
}

/**
 * Lauscht auf 127.0.0.1:`port`. Scheitert das, ruft es `failed` (noch im
 * Fehlerereignis) und liefert `false`; läuft der Server, gehen spätere Fehler an `lateError`.
 */
export function listenLocal(server: Server, port: number, on: { failed: (error: Error) => void; lateError: (error: Error) => void }): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const onError = (error: Error) => {
      on.failed(error);
      resolve(false);
    };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      server.on('error', on.lateError);
      resolve(true);
    });
  });
}

/**
 * Was vor jedem Blick auf die Profile feststehen muss: POST, kein Browser, der
 * eigene Host samt Port und ein Pfad `/hooks/<Profil>`. Liefert das Profil —
 * oder hat schon abgesagt und liefert `undefined`.
 */
export function webhookTarget(request: IncomingMessage, response: ServerResponse, port: number | undefined): string | undefined {
  if (request.method !== 'POST') return reply(response, 405, { error: 'Nur POST ist erlaubt.' });
  if (request.headers.origin !== undefined || request.headers['sec-fetch-site'] !== undefined) return reply(response, 403, { error: 'Browser-Aufrufe sind nicht erlaubt.' });
  if (request.headers.host !== `127.0.0.1:${port}`) return reply(response, 403, { error: 'Ungültiger lokaler Host.' });
  const match = /^\/hooks\/([a-zA-Z0-9_-]{1,160})$/.exec(request.url ?? '');
  if (!match) return reply(response, 404, { error: 'Webhook nicht gefunden.' });
  return match[1]!;
}

/**
 * Liest, was nach der Anmeldung kommt: Idempotency-Key und JSON-Körper bis
 * 32 KiB. `key` ist der gehashte Idempotency-Key oder, ohne ihn, eine frische
 * Kennung. Bei `undefined` ist die Absage schon verschickt.
 */
export async function readWebhookInput(request: IncomingMessage, response: ServerResponse): Promise<{ key: string; payload: unknown } | undefined> {
  const idempotency = request.headers['idempotency-key'];
  if (idempotency !== undefined && (typeof idempotency !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(idempotency))) return reply(response, 400, { error: 'Idempotency-Key muss 1 bis 200 druckbare Zeichen enthalten.' });
  const contentType = request.headers['content-type'];
  if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) return reply(response, 415, { error: 'Der Webhook akzeptiert JSON.' });
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) return reply(response, 413, { error: 'Webhook-Daten dürfen höchstens 32 KiB umfassen.' });
  let payload: unknown;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > BODY_LIMIT) { reply(response, 413, { error: 'Webhook-Daten dürfen höchstens 32 KiB umfassen.' }); request.resume(); return; }
      chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text) payload = JSON.parse(text);
  } catch { return reply(response, 400, { error: 'Ungültige JSON-Daten.' }); }
  const key = typeof idempotency === 'string' ? createHash('sha256').update(idempotency).digest('hex') : randomUUID();
  return { key, payload };
}
