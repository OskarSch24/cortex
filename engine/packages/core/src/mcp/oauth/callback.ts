import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { OAUTH_CALLBACK_TIMEOUT_MS } from '../../util/timeouts.js';
import { OAuthError } from './shared.js';

// Rückruf

export interface CallbackListener {
  redirectUri: string;
  /** Erfüllt sich mit dem Code, sobald der Browser mit dem richtigen `state` zurückkommt. */
  code: Promise<string>;
  close(): void;
}

/**
 * Ein kurzlebiger Empfänger auf 127.0.0.1 — nie auf allen Schnittstellen. Er
 * nimmt genau einen Rückruf mit dem erwarteten `state` an und schließt sich.
 */
export async function listenForCallback(
  state: string,
  /** `port`: fest statt frei — für eigene Clients, deren Rückrufadresse beim Anbieter eingetragen ist. */
  options: { timeoutMs?: number; signal?: AbortSignal; port?: number; redirectHost?: 'localhost' | '127.0.0.1' } = {},
): Promise<CallbackListener> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Wer den Code nicht abholt, soll keinen unbehandelten Fehler bekommen.
  code.catch(() => {});

  let server: Server | undefined;
  let timer: NodeJS.Timeout | undefined;
  const close = () => {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
    server?.close();
    server?.closeAllConnections?.();
  };
  const onAbort = () => {
    rejectCode(new OAuthError('Anmeldung abgebrochen.', 'cancelled'));
    close();
  };

  const handle = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    const page = (title: string, text: string) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(
        `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
          `<body style="font:15px -apple-system,system-ui,sans-serif;background:#1e1e1e;color:#ddd;display:grid;place-items:center;height:100vh;margin:0">` +
          `<div style="text-align:center"><h1 style="font-size:18px;font-weight:600">${title}</h1><p style="color:#999">${text}</p></div>`,
      );
    };
    if (url.searchParams.get('state') !== state) {
      // Ein fremder Rückruf ändert nichts — der richtige kann noch kommen.
      page('Unbekannte Anmeldung', 'Diese Rückmeldung gehört zu keiner laufenden Anmeldung in Cortex.');
      return;
    }
    const error = url.searchParams.get('error');
    const received = url.searchParams.get('code');
    if (error || !received) {
      const description = url.searchParams.get('error_description');
      page('Anmeldung nicht abgeschlossen', 'Du kannst dieses Fenster schließen und es in Cortex erneut versuchen.');
      rejectCode(
        new OAuthError(
          error === 'access_denied'
            ? 'Die Anmeldung wurde beim Anbieter abgelehnt.'
            : `Der Anbieter hat die Anmeldung abgebrochen${description ? `: ${description}` : '.'}`,
          error ?? undefined,
        ),
      );
    } else {
      page('Verbunden', 'Du kannst dieses Fenster schließen und zu Cortex zurückkehren.');
      resolveCode(received);
    }
    setTimeout(close, 200).unref();
  };

  server = createServer(handle);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'EADDRINUSE'
          ? new OAuthError(
              `Port ${options.port} ist belegt — vermutlich läuft schon eine Anmeldung. Schließe sie oder warte, bis sie abläuft.`,
              'port_in_use',
            )
          : error,
      ),
    );
    server!.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  timer = setTimeout(() => {
    rejectCode(new OAuthError('Die Anmeldung wurde nicht rechtzeitig abgeschlossen.', 'timeout'));
    close();
  }, options.timeoutMs ?? OAUTH_CALLBACK_TIMEOUT_MS);
  timer.unref();
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();

  return { redirectUri: `http://${options.redirectHost ?? '127.0.0.1'}:${port}/callback`, code, close };
}
