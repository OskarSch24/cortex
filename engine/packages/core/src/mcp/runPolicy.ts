import type { ProviderId } from '../types.js';
import type { McpServerDef } from './mcpSync.js';

/**
 * Only list providers with a verified exclusive, per-run MCP configuration.
 * Claude's --strict-mcp-config excludes user, project, plugin and managed
 * additions. Grok starts every server of its profile, but Cortex writes each
 * of them behind a gate (`gatedMcpServer`) that reads MCP_ALLOW_ENV — so a run
 * limits exactly the servers Cortex manages. Codex config maps merge; ACP
 * session MCPs are additive. Merely passing an empty map/list to either must
 * never be presented as a restriction. This limits registered MCPs, not the
 * provider's built-in shell/network tools.
 */
export const SCOPED_MCP_PROVIDERS: readonly ProviderId[] = Object.freeze(['claude', 'grok']);

export function scopedMcpUnsupportedMessage(
  provider: ProviderId,
  servers: Record<string, McpServerDef> | undefined,
): string | undefined {
  if (servers === undefined || SCOPED_MCP_PROVIDERS.includes(provider)) return undefined;
  const label: Record<ProviderId, string> = {
    claude: 'Claude', codex: 'Codex', grok: 'Grok', copilot: 'Copilot', openrouter: 'OpenRouter', zai: 'Z.ai',
  };
  return `${label[provider]} unterstützt hier keine begrenzte MCP-Auswahl. Wähle Claude, Grok oder „Alle verbundenen“.`;
}

/**
 * Welche Server eines Profils ein Lauf starten darf, als Komma-Liste. Fehlt
 * die Variable, starten alle — so bleibt jeder gewöhnliche Chat, wie er war.
 * Eine leere Liste heißt: keiner.
 */
export const MCP_ALLOW_ENV = 'CORTEX_MCP_ALLOW';

/**
 * Das Tor vor einem Server im Grok-Profil. Grok reicht seine Umgebung an jeden
 * Server weiter (geprüft mit grok 1.0.41): steht der Name nicht auf der Liste,
 * endet die Shell sofort, und Grok arbeitet ohne diesen Server weiter — ohne
 * auf seine Startfrist zu warten. Ohne Liste ersetzt `exec` die Shell durch den
 * Server selbst: kein Umweg, kein zusätzlicher Prozess.
 */
const MCP_GATE = `case ",\${${MCP_ALLOW_ENV}-*}," in *,\\*,*|*",$0,"*) exec "$@";; esac; exit 0`;

/** Ein lokal gestarteter Server hinter dem Tor; ein Server im Netz startet keinen Prozess und bleibt, wie er ist. */
export function gatedMcpServer(name: string, def: McpServerDef): McpServerDef {
  if (!def.command) return def;
  return { ...def, command: '/bin/sh', args: ['-c', MCP_GATE, name, def.command, ...(def.args ?? [])] };
}
