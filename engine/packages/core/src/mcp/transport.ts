/**
 * Wie Cortex mit einem MCP-Server über das Netz spricht — geteilt von der
 * Prüfung, der Anmeldung und dem Schreiben der CLI-Konfigurationen.
 */

/** Die MCP-Protokollversion, die Cortex ankündigt. */
export const MCP_PROTOCOL_VERSION = '2025-06-18';

/**
 * Ein Server mit `/sse` am Ende spricht das ältere Protokoll: ein offener
 * GET-Strom, auf dem die Antworten ankommen, und eine zweite Adresse für die
 * Anfragen. Alle anderen URLs sind Streamable HTTP.
 */
export function isSseUrl(url: string): boolean {
  try {
    return /\/sse\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
