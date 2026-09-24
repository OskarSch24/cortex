import type { McpServerDef } from './mcpSync.js';
import { isSseUrl } from './transport.js';
import type { ProbeOptions, ProbeResult } from './probe/shared.js';
import { probeStdio } from './probe/stdio.js';
import { probeHttp } from './probe/http.js';
import { probeSse } from './probe/sse.js';

export type { ProbeFailure, ProbeOptions, ProbeResult, ProbeTool } from './probe/shared.js';
export { isSseUrl };

/**
 * Ob ein MCP-Server wirklich antwortet — nicht, ob er in einer Datei steht.
 *
 * Geprüft wird genau der Weg, den eine CLI später geht: den Prozess starten
 * oder die URL ansprechen, `initialize`, `notifications/initialized`,
 * `tools/list`. Erst eine Werkzeugliste ist ein Beleg. Alles davor — ein
 * Eintrag in mcp.json, ein laufender Prozess, ein 200 auf der Startseite — ist
 * keiner.
 *
 * Die Prüfung schreibt nichts und merkt sich nichts. Was sie herausfindet, gibt
 * sie zurück; ob und wo es gespeichert wird, entscheidet der Aufrufer.
 */

export async function probeServer(def: McpServerDef, options: ProbeOptions = {}): Promise<ProbeResult> {
  if (def.url) {
    return isSseUrl(def.url) ? probeSse(def.url, options) : probeHttp(def.url, options);
  }
  if (def.command) return probeStdio(def, options);
  return { ok: false, reason: 'protocol', message: 'Die Definition hat weder „command“ noch „url“.' };
}
