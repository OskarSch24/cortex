/**
 * Kleine Typprüfungen für Werte unbekannter Herkunft (JSON, Protokolle).
 * Ohne Node-Abhängigkeit — die Webview bündelt Dateien, die sie benutzen.
 */

/** Ein einfaches Objekt: nicht null, kein Array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Der Text, wenn er nicht leer ist — ohne zu trimmen. */
export function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
