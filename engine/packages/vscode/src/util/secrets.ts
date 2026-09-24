import { timingSafeEqual } from 'node:crypto';

/**
 * Vergleicht ein mitgeschicktes Geheimnis in konstanter Zeit mit dem
 * erwarteten. Nur die Länge verrät sich — die ist bei unseren Tokens ohnehin fest.
 */
export function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
