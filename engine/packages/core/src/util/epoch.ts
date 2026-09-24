/**
 * Anbieter melden Zeitpunkte mal in Sekunden, mal in Millisekunden seit 1970.
 * Alles über zehn Milliarden ist schon Millisekunden (in Sekunden wäre das
 * das Jahr 2286).
 */
export function toEpochMs(epoch: number): number {
  return epoch > 10_000_000_000 ? epoch : epoch * 1000;
}
