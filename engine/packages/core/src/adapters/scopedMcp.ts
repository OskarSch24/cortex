import type { McpServerDef } from '../mcp/mcpSync.js';
import { isSseUrl } from '../mcp/transport.js';
import { isRecord } from '../util/guards.js';
import { privateTempFile } from '../util/privateTempFile.js';

export interface ScopedMcpConfig {
  path: string;
  dispose(): void;
}

function stringMap(value: unknown): value is Record<string, string> {
  return isRecord(value)
    && Object.values(value).every(entry => typeof entry === 'string');
}

/** Validate all entries: silently skipping one would misrepresent the selection. */
function claudeServers(servers: Record<string, McpServerDef>): Record<string, unknown> {
  if (!isRecord(servers)) {
    throw new Error('Die MCP-Auswahl ist ungültig.');
  }
  return Object.fromEntries(Object.entries(servers).map(([name, def]) => {
    if (!name.trim() || name === 'cortex' || name === 'cortex_canvas') {
      throw new Error('Ein MCP-Name ist leer oder für Cortex reserviert.');
    }
    const invalid = () => new Error(`Die MCP-Konfiguration für „${name}“ ist ungültig.`);
    if (!def || typeof def !== 'object' || Array.isArray(def)) throw invalid();
    const command = typeof def.command === 'string' && def.command.trim().length > 0;
    const url = typeof def.url === 'string' && def.url.trim().length > 0;
    if (command === url) throw invalid();
    if (def.providers && !def.providers.includes('claude')) {
      throw new Error(`„${name}“ ist nicht für Claude freigegeben.`);
    }
    if (def.args !== undefined && (!Array.isArray(def.args) || !def.args.every(arg => typeof arg === 'string'))) throw invalid();
    if (def.env !== undefined && !stringMap(def.env)) throw invalid();
    if (def.headers !== undefined && !stringMap(def.headers)) throw invalid();
    if (url) {
      if (def.command !== undefined || def.args !== undefined || def.env !== undefined) throw invalid();
      try {
        const protocol = new URL(def.url!).protocol;
        if (protocol !== 'http:' && protocol !== 'https:') throw invalid();
      } catch { throw invalid(); }
      return [name, { type: isSseUrl(def.url!) ? 'sse' : 'http', url: def.url, ...(def.headers ? { headers: def.headers } : {}) }];
    }
    if (def.url !== undefined || def.headers !== undefined) throw invalid();
    return [name, { type: 'stdio', command: def.command, ...(def.args ? { args: def.args } : {}), ...(def.env ? { env: def.env } : {}) }];
  }));
}

/**
 * Per-run file, never a shared account configuration or an auth copy. Tokens
 * stay out of process arguments; the file is private and removed on every exit.
 */
export function createClaudeMcpConfig(servers: Record<string, McpServerDef>): ScopedMcpConfig {
  const content = JSON.stringify({ mcpServers: claudeServers(servers) });
  return privateTempFile('cortex-run-mcp-', 'mcp.json', content);
}

/** Keep the host's internal permission/canvas bridges in the same variadic flag. */
export function withClaudeMcpSelection(args: string[], path: string): string[] {
  const rest: string[] = [], configs: string[] = [path];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--strict-mcp-config' || arg === '--no-chrome') continue;
    if (arg.startsWith('--mcp-config=')) {
      configs.push(arg.slice('--mcp-config='.length));
    } else if (arg === '--mcp-config') {
      while (i + 1 < args.length && !args[i + 1]!.startsWith('-')) configs.push(args[++i]!);
    } else {
      rest.push(arg);
    }
  }
  return [...rest, '--strict-mcp-config', '--no-chrome', '--mcp-config', ...configs];
}
