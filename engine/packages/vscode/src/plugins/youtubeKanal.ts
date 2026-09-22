import type { McpServerDef } from '@cortex/core';

/** Der Name des Zugangs „YouTube · Google-Konto“ im Katalog. */
const SERVER = 'youtube-kanal';
const PACKAGE = 'youtube-analytics-mcp';

let proxyPath: string | undefined;

/** Wo der gebündelte Zwischenserver liegt; ohne Pfad bleibt die Definition, wie sie ist. */
export const setYoutubeKanalProxy = (path: string | undefined) => (proxyPath = path);

/**
 * Setzt den Zwischenserver vor `youtube-analytics-mcp`, damit Zählung und
 * Videoliste auch nicht gelistete und private Videos erfassen — siehe
 * `youtubeKanalServer.ts`.
 *
 * Nur die Katalogfassung wird umgelenkt: ein selbst eingetragener Server
 * gleichen Namens mit anderem Befehl bleibt, wie er ist.
 */
export function withYoutubeVideoTools(servers: Record<string, McpServerDef>): Record<string, McpServerDef> {
  const def = servers[SERVER];
  if (!proxyPath || !def?.command || def.url) return servers;
  const args = def.args ?? [];
  if (def.command === 'node' && args[0] === proxyPath) return servers;
  if (!args.some((arg) => arg === PACKAGE || arg.startsWith(`${PACKAGE}@`))) return servers;
  return { ...servers, [SERVER]: { ...def, command: 'node', args: [proxyPath, def.command, ...args] } };
}
