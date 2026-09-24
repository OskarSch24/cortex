/**
 * Die Dauer-Schreibweisen der Oberfläche nebeneinander. Sie sind bewusst nicht
 * vereinheitlicht: jede Stelle hat ihre eigene Genauigkeit und Sprache.
 */

/** Hilfsagenten: `850ms`, `1.2s`, `3m 4s`. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

/**
 * The run clock, spelled out. A line you read while you wait should be a
 * sentence, not a stopwatch readout — `1 Min. 2 Sek.`, not `1m 2s`.
 */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} Sek.`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes} Min. ${restSeconds} Sek.` : `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} Std. ${restMinutes} Min.` : `${hours} Std.`;
}

/** „11m 58s“ — wie Codex die Arbeitszeit eines Auftrags schreibt. */
export function formatWorked(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Analyse-Ansicht: eine Nachkommastelle, `—` ohne Wert. */
export function metricDuration(ms: number | undefined): string {
  if (!ms) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
}

/** Nutzungsstatistik in den Einstellungen: auf Minuten gerundet, `–` ohne Wert. */
export function roundedDuration(ms: number): string {
  if (!ms) return '–';
  const m = Math.round(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : m ? `${m} Min.` : `${Math.round(ms / 1000)} Sek.`;
}
