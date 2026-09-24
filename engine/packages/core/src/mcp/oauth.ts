/**
 * Die Anmeldung bei einem entfernten MCP-Server, so wie die MCP-Spezifikation
 * sie beschreibt — und nicht wie ein einzelner Anbieter sie gebaut hat:
 *
 *   1. Der Server antwortet 401 und nennt in `WWW-Authenticate` seine
 *      Metadaten (RFC 9728). Nennt er sie nicht, gibt es sie unter
 *      `/.well-known/oauth-protected-resource`.
 *   2. Die Metadaten nennen den Autorisierungsserver; dessen eigene Metadaten
 *      (RFC 8414 oder OpenID Discovery) nennen die Endpunkte.
 *   3. Cortex registriert sich dort selbst (RFC 7591) — ohne vorher angelegte
 *      App, ohne Client-Secret.
 *   4. Autorisierungscode mit PKCE (S256) über eine Rückrufadresse auf
 *      127.0.0.1, `resource` nach RFC 8707, damit der Token nur für genau
 *      diesen Server gilt.
 *
 * Alles hier ist ohne VS Code lauffähig und prüfbar. Wo die Tokens liegen und
 * wann der Browser aufgeht, entscheidet der Host.
 */

export {
  OAuthError,
  type OAuthClient,
  type OAuthEndpoints,
  type StoredOAuth,
  type TokenSet,
} from './oauth/shared.js';
export * from './oauth/discover.js';
export * from './oauth/token.js';
export * from './oauth/callback.js';
