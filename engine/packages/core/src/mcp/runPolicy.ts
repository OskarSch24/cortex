import type { ProviderId } from '../types.js';
import type { McpServerDef } from './mcpSync.js';

/**
 * Only list providers with a verified exclusive, per-run MCP configuration.
 * Claude's --strict-mcp-config excludes user, project, plugin and managed
 * additions. Codex config maps merge; ACP session MCPs are additive. Merely
 * passing an empty map/list to either must never be presented as a restriction.
 * This limits registered MCPs, not the provider's built-in shell/network tools.
 */
export const SCOPED_MCP_PROVIDERS: readonly ProviderId[] = Object.freeze(['claude']);

export function scopedMcpUnsupportedMessage(
  provider: ProviderId,
  servers: Record<string, McpServerDef> | undefined,
): string | undefined {
  if (servers === undefined || SCOPED_MCP_PROVIDERS.includes(provider)) return undefined;
  const label: Record<ProviderId, string> = {
    claude: 'Claude', codex: 'Codex', grok: 'Grok', copilot: 'Copilot', openrouter: 'OpenRouter',
  };
  return `${label[provider]} unterstützt hier keine begrenzte MCP-Auswahl. Wähle Claude oder „Alle verbundenen“.`;
}
