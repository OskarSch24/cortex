/**
 * Die Fristen der Engine an einem Ort. Die Werte sind gewachsen, nicht
 * berechnet — wer einen ändert, ändert ein beobachtbares Verhalten.
 */

/** Längste Stille, die eine JSON-RPC-Anfrage an eine CLI abwartet. */
export const RPC_IDLE_MS = 120_000;
/** Codex: so lange ohne Aktivität, dann wird der Auftrag angehalten. */
export const CODEX_IDLE_MS = 180_000;

/** Vom SIGTERM bis zum SIGKILL für CLI-Läufe. */
export const CLI_KILL_GRACE_MS = 3_000;
/** Vom SIGTERM bis zum SIGKILL für einen geprüften MCP-Server. */
export const PROBE_KILL_GRACE_MS = 2_000;

/** MCP-Prüfung eines lokalen Servers — npx lädt beim ersten Mal. */
export const PROBE_STDIO_TIMEOUT_MS = 120_000;
/** MCP-Prüfung eines entfernten Servers. */
export const PROBE_REMOTE_TIMEOUT_MS = 20_000;

/** OAuth: Metadaten abrufen und Client registrieren. */
export const OAUTH_FETCH_TIMEOUT_MS = 15_000;
/** OAuth: Token tauschen oder erneuern. */
export const OAUTH_TOKEN_TIMEOUT_MS = 20_000;
/** OAuth: wie lange die Anmeldung im Browser dauern darf. */
export const OAUTH_CALLBACK_TIMEOUT_MS = 5 * 60_000;
