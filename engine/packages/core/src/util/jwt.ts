import { isRecord } from './guards.js';

/**
 * Die Claims eines JWT, ungeprüft gelesen — nur für Anzeige und Einordnung
 * (E-Mail, Tarif), nie für eine Entscheidung über Zugang. `undefined`, wenn
 * der Token keinen lesbaren Payload hat.
 */
export function jwtClaims(jwt: string): Record<string, unknown> | undefined {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
    return isRecord(claims) ? claims : undefined;
  } catch {
    return undefined;
  }
}
