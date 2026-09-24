/**
 * Token-Zahlen, je nach Ort verschieden knapp. Wie bei den Dauern bewusst
 * nebeneinander statt vereinheitlicht.
 */

/** Hilfsagenten: `950`, `12.3k`, `1.2M`. */
export function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 24816 → 24.8k. These are five-figure numbers now that cache reads count. */
export function metricTokens(n: number | undefined): string {
  if (!n) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Deutsch mit Wortstufen: „12 Tsd.“, „1,5 Mio.“, „2 Mrd.“. */
export function compactTokens(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.` : n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} Tsd.` : n.toLocaleString('de-DE');
}
