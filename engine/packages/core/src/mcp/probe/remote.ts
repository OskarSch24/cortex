import { tail, type JsonRpcMessage, type ProbeResult } from './shared.js';

/** Was HTTP und SSE gleich behandeln: Statuscodes, Antwort-Ids, Netzfehler. */

export async function httpFailure(response: Response): Promise<ProbeResult | undefined> {
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

export function pick(message: unknown, id: number): JsonRpcMessage | undefined {
  const list = Array.isArray(message) ? message : [message];
  return list.find(
    (m): m is JsonRpcMessage => !!m && typeof m === 'object' && (m as JsonRpcMessage).id === id,
  );
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function fetchFailure(error: unknown, aborted: boolean, timeoutMs: number, cancelled?: boolean): ProbeResult {
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
