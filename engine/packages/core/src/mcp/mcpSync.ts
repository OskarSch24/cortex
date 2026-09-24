import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AccountProfile, ProviderId } from '../types.js';
import { isSseUrl } from './transport.js';
import { readJson } from '../util/jsonFile.js';

export { parseMcpFile } from './mcpFile.js';

/**
 * Define MCP servers once (.cortex/mcp.json) and fan them out to every
 * provider profile — each CLI has its own config format:
 *   claude  → <profile>/.claude.json          mcpServers
 *   codex   → <profile>/config.toml           [mcp_servers.*] (managed block)
 *   grok    → <profile>/.grok/config.toml    [mcp_servers.*] (managed block)
 *   copilot → <profile>/mcp-config.json       mcpServers
 *
 * Fanning out is the default, not the rule. Every server a profile carries puts
 * its whole tool schema into that CLI's context on every single turn, so a
 * server four CLIs hold is a tax paid four times — and three of them may never
 * call it. `providers` narrows a server to the ones that should have it.
 */
export interface McpServerDef {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  /**
   * HTTP-Header für einen entfernten Server. In mcp.json selten von Hand —
   * meist legt Cortex hier beim Übertragen den Bearer-Token einer Anmeldung
   * hinein, der selbst nie in mcp.json steht.
   */
  headers?: Record<string, string>;
  /**
   * Welche Art Vorlagen zu diesem Konnektor gehören — `dokument`, `tabelle`
   * oder was du selbst benennst. Fehlt die Angabe, rät die Oberfläche am
   * Namen; das Feld ist die verlässliche Auskunft.
   */
  kind?: string;
  /**
   * Which CLIs get this server. Omitted means all of them — the old behaviour,
   * kept so an existing mcp.json means exactly what it did before.
   */
  providers?: ProviderId[];
}

/** The servers this provider should actually be given. */
export function serversFor(
  provider: ProviderId,
  servers: Record<string, McpServerDef>,
): Record<string, McpServerDef> {
  const scoped: Record<string, McpServerDef> = {};
  for (const [name, def] of Object.entries(servers)) {
    if (def.providers && !def.providers.includes(provider)) continue;
    scoped[name] = def;
  }
  return scoped;
}

const withHeaders = (def: McpServerDef) =>
  def.headers && Object.keys(def.headers).length > 0 ? { headers: def.headers } : {};

/** Returns an error string, or undefined on success/skip. */
export function syncMcpToProfile(
  account: AccountProfile,
  allServers: Record<string, McpServerDef>,
): string | undefined {
  if (!account.homeDir) return 'no profile directory';
  // Nach Namen sortiert: so schreibt dieselbe Menge immer dieselbe Datei, auch
  // wenn ein Plugin entbunden und wieder verbunden wurde und in mcp.json nun
  // am Ende steht.
  const servers = Object.fromEntries(
    Object.entries(serversFor(account.provider, allServers)).sort(([a], [b]) => a.localeCompare(b)),
  );
  // A server this profile used to be given and is not being given now has to be
  // taken back out — merging alone would leave its schema in the profile, and
  // in that CLI's context, forever. Two ways that happens: it was scoped away
  // from this provider, or it was deleted from mcp.json entirely. The manifest
  // is what makes the second one visible; the current file covers profiles
  // written before there was a manifest.
  const previous = readManifest(account.homeDir);
  const dropped = [...new Set([...previous, ...Object.keys(allServers)])].filter(
    (name) => !(name in servers),
  );
  try {
    switch (account.provider) {
      case 'claude': {
        if (account.authMode !== 'managed-home') return 'token-only account (no profile config)';
        mergeJsonFile(join(account.homeDir, '.claude.json'), 'mcpServers', servers, dropped, (d) =>
          d.url
            ? { type: isSseUrl(d.url) ? 'sse' : 'http', url: d.url, ...withHeaders(d) }
            : { type: 'stdio', command: d.command, args: d.args ?? [], env: d.env ?? {} },
        );
        break;
      }
      case 'copilot': {
        mergeJsonFile(join(account.homeDir, 'mcp-config.json'), 'mcpServers', servers, dropped, (d) =>
          d.url
            ? { type: isSseUrl(d.url) ? 'sse' : 'http', url: d.url, ...withHeaders(d), tools: ['*'] }
            : { type: 'local', command: d.command, args: d.args ?? [], env: d.env ?? {}, tools: ['*'] },
        );
        break;
      }
      case 'codex': {
        // The managed block is rewritten whole, so a dropped server disappears
        // with it — nothing to remove by name. Codex spricht nur Streamable
        // HTTP: ein älterer SSE-Server läuft dort über `mcp-remote`, das den
        // Header weiterreicht.
        const forCodex = Object.fromEntries(
          Object.entries(servers).map(([name, def]) => [
            name,
            def.url && isSseUrl(def.url) ? viaMcpRemote(def) : def,
          ]),
        );
        writeTomlServers(join(account.homeDir, 'config.toml'), forCodex, 'http_headers');
        break;
      }
      case 'grok': {
        // Grok findet seine Konfiguration unter HOME/.grok, nicht im
        // Wurzelordner. Seit 1.0 kennt es `url`, `type = "sse"` und
        // `[mcp_servers.x.headers]` selbst — `mcp-remote` als Umweg hätte bei
        // einer 401 von sich aus einen Browser geöffnet.
        writeTomlServers(join(account.homeDir, '.grok', 'config.toml'), servers, 'headers', true);
        break;
      }
      default:
        return 'unsupported provider';
    }
    writeManifest(account.homeDir, Object.keys(servers));
    return undefined;
  } catch (e) {
    return (e as Error).message;
  }
}

/**
 * What cortex last wrote into this profile.
 *
 * Without it, a server deleted from mcp.json is simply never mentioned again —
 * and goes on being loaded by that CLI, and paid for in its context, until
 * someone edits the profile by hand.
 */
const MANIFEST = '.cortex-mcp.json';

function readManifest(homeDir: string): string[] {
  try {
    const servers = readJson<{ servers?: unknown }>(join(homeDir, MANIFEST))?.servers;
    return Array.isArray(servers)
      ? servers.filter((s): s is string => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeManifest(homeDir: string, names: string[]): void {
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(join(homeDir, MANIFEST), JSON.stringify({ servers: names }, null, 2));
}

function mergeJsonFile(
  path: string,
  key: string,
  servers: Record<string, McpServerDef>,
  dropped: string[],
  convert: (def: McpServerDef) => Record<string, unknown>,
): undefined {
  let existing: Record<string, unknown> = {};
  try {
    const read = readJson<Record<string, unknown>>(path);
    if (read !== undefined) existing = read;
  } catch {
    existing = {};
  }
  const current = (existing[key] as Record<string, unknown> | undefined) ?? {};
  for (const name of dropped) delete current[name];
  for (const [name, def] of Object.entries(servers)) current[name] = convert(def);
  existing[key] = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(existing, null, 2));
  return undefined;
}

const BEGIN = '# cortex-mcp-begin (managed — do not edit inside)';
const END = '# cortex-mcp-end';

/**
 * Ein älterer SSE-Server für eine CLI, die ihn nicht selbst spricht. Der
 * Header geht über eine Umgebungsvariable, damit der Token nicht in der
 * Prozessliste steht.
 */
function viaMcpRemote(def: McpServerDef): McpServerDef {
  const args = ['-y', 'mcp-remote', def.url!, '--transport', 'sse-only'];
  const env: Record<string, string> = {};
  Object.entries(def.headers ?? {}).forEach(([header, value], index) => {
    const variable = `CORTEX_MCP_HEADER_${index}`;
    args.push('--header', `${header}:\${${variable}}`);
    env[variable] = value;
  });
  return { command: 'npx', args, ...(Object.keys(env).length ? { env } : {}), providers: def.providers };
}

function writeTomlServers(
  path: string,
  servers: Record<string, McpServerDef>,
  headerTable: 'http_headers' | 'headers',
  sseType = false,
): undefined {
  const lines: string[] = [BEGIN];
  for (const [name, def] of Object.entries(servers)) {
    lines.push(`[mcp_servers.${tomlKey(name)}]`);
    if (def.url) lines.push(`url = ${JSON.stringify(def.url)}`);
    if (def.url && sseType && isSseUrl(def.url)) lines.push('type = "sse"');
    if (def.command) lines.push(`command = ${JSON.stringify(def.command)}`);
    if (def.args?.length) lines.push(`args = [${def.args.map((a) => JSON.stringify(a)).join(', ')}]`);
    if (def.env && Object.keys(def.env).length > 0) {
      lines.push(`[mcp_servers.${tomlKey(name)}.env]`);
      for (const [k, v] of Object.entries(def.env)) lines.push(`${tomlKey(k)} = ${JSON.stringify(v)}`);
    }
    if (def.url && def.headers && Object.keys(def.headers).length > 0) {
      lines.push(`[mcp_servers.${tomlKey(name)}.${headerTable}]`);
      for (const [k, v] of Object.entries(def.headers)) lines.push(`${tomlKey(k)} = ${JSON.stringify(v)}`);
    }
  }
  lines.push(END);
  const block = lines.join('\n');

  let content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const beginIdx = content.indexOf(BEGIN);
  const endIdx = content.indexOf(END);
  if (beginIdx !== -1 && endIdx !== -1) {
    content = content.slice(0, beginIdx) + block + content.slice(endIdx + END.length);
  } else {
    content = content.trimEnd() + (content.trim() ? '\n\n' : '') + block + '\n';
  }
  content = stripDuplicateServerTables(content, Object.keys(servers));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return undefined;
}

/**
 * Eine von Hand (oder von einem Agenten) hinter das managed-Block kopierte
 * `[mcp_servers.x]`-Tabelle macht TOML ungültig — dieselbe Tabelle zweimal.
 * Grok lädt dann die ganze Datei nicht, und keiner der Server kommt an.
 */
function stripDuplicateServerTables(content: string, names: string[]): string {
  const endIdx = content.indexOf(END);
  if (endIdx === -1 || names.length === 0) return content;
  const head = content.slice(0, endIdx + END.length);
  const skip = new Set(names);
  const out: string[] = [];
  let dropping = false;
  for (const line of content.slice(endIdx + END.length).split('\n')) {
    const table = /^\[mcp_servers\.([A-Za-z0-9_-]+)(?:\.[^\]]+)?\]\s*$/.exec(line);
    if (table) dropping = skip.has(table[1]!);
    else if (line.startsWith('[')) dropping = false;
    if (!dropping) out.push(line);
  }
  return head + out.join('\n');
}

const tomlKey = (key: string) => (/^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key));

export const MCP_TEMPLATE = `{
  "_help": "A server with no \\"providers\\" goes to every CLI, and every CLI then carries its tool schema in every turn. Narrow it with \\"providers\\": [\\"claude\\", \\"codex\\"] when only some of them need it.",
  "servers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
`;
