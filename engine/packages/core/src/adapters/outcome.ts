import type { AdapterEvent, LimitInfo, ProviderId, Usage } from '../types.js';
import type { McpServerDef } from '../mcp/mcpSync.js';
import { scopedMcpUnsupportedMessage } from '../mcp/runPolicy.js';
import { isTransientFailure } from './limits.js';

/**
 * Bausteine, die jeder CLI-Adapter gleich braucht: wie ein Lauf endet, wie
 * seine Einrichtung scheitert, was er an Tokens meldet. Jeder Adapter hatte
 * sie einmal selbst — mit denselben Sätzen, die nur gemeinsam gleich bleiben.
 */

export type DetectLimit = (text: string) => LimitInfo | undefined;

/** Ein gewöhnlicher Fehler; ob ein neuer Versuch lohnt, sagt die Meldung. */
export function transientError(message: string): AdapterEvent {
  return { type: 'error', message, retryable: isTransientFailure(message) };
}

/** Ein erkanntes Limit, sonst `failure` (Vorgabe: ein gewöhnlicher Fehler). */
export function limitOrError(
  message: string,
  detect: DetectLimit,
  failure: (message: string) => AdapterEvent = transientError,
): AdapterEvent {
  const limit = detect(message);
  return limit ? { type: 'limit', ...limit } : failure(message);
}

/**
 * Der Prozess ist gestorben, ohne dass der Lauf ein Ende gemeldet hat. Ein
 * Limit kann im Text oder in stderr stehen; was schon geschrieben war, zählt
 * als Antwort; sonst ist das stderr-Ende der Fehler.
 */
export function exitOutcome(
  text: string,
  stderrTail: string,
  detect: DetectLimit,
  fallbackMessage: string,
  failure: (message: string) => AdapterEvent = transientError,
): AdapterEvent {
  const limit = detect(`${text}\n${stderrTail}`);
  if (limit) return { type: 'limit', ...limit };
  if (text) return { type: 'result', text };
  return failure(stderrTail.trim() || fallbackMessage);
}

/** Die letzten `max` Zeichen von stderr — genug für eine Fehlermeldung. */
export function appendTail(tail: string, line: string, max = 4096): string {
  return (tail + '\n' + line).slice(-max);
}

/** Nur was gemeldet wurde: ein Feld ohne Tokens bleibt weg. */
export function usageOf(input: number, output: number, cached: number): Usage {
  const usage: Usage = {};
  if (input > 0) usage.inputTokens = input;
  if (output > 0) usage.outputTokens = output;
  if (cached > 0) usage.cachedInputTokens = cached;
  return usage;
}

export const WEB_SEARCH_SETUP_FAILED = 'Die Websuche konnte nicht eingerichtet werden.';

/** Die Einrichtung eines Laufs ist gescheitert; der Lauf beginnt gar nicht erst. */
export function setupFailure(error: unknown, fallback: string): AdapterEvent {
  return { type: 'error', message: error instanceof Error ? error.message : fallback, retryable: false };
}

/** Eine begrenzte MCP-Auswahl, die dieser Anbieter nicht einhalten kann — dann lieber gar nicht. */
export function scopedMcpRefusal(
  provider: ProviderId,
  servers: Record<string, McpServerDef> | undefined,
): AdapterEvent | undefined {
  const message = scopedMcpUnsupportedMessage(provider, servers);
  return message ? { type: 'error', message, retryable: false } : undefined;
}
