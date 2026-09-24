import type { ProviderId } from '../types.js';
import type { McpServerDef } from './mcpSync.js';
import { isRecord } from '../util/guards.js';

/**
 * mcp.json lesen und bearbeiten — ohne `node:fs`, denn das Webview nutzt es
 * auch. Das Lesen und Schreiben der Datei selbst bleibt beim Host.
 */

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  'claude',
  'codex',
  'copilot',
  'grok',
  'openrouter',
]);

export function parseMcpFile(
  content: string,
): { ok: true; servers: Record<string, McpServerDef> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(content) as { servers?: unknown };
    if (!isRecord(parsed.servers)) {
      return { ok: false, error: 'missing "servers" object' };
    }
    const servers: Record<string, McpServerDef> = {};
    for (const [name, def] of Object.entries(parsed.servers as Record<string, unknown>)) {
      if (def === null || typeof def !== 'object') continue;
      const d = def as Record<string, unknown>;
      servers[name] = {
        command: typeof d.command === 'string' ? d.command : undefined,
        args: Array.isArray(d.args) ? d.args.filter((a): a is string => typeof a === 'string') : undefined,
        env: stringRecord(d.env),
        url: typeof d.url === 'string' ? d.url : undefined,
        headers: stringRecord(d.headers),
        kind: typeof d.kind === 'string' ? d.kind : undefined,
        providers: Array.isArray(d.providers)
          ? (d.providers.filter(
              (p): p is ProviderId => typeof p === 'string' && PROVIDER_IDS.has(p),
            ) as ProviderId[])
          : undefined,
      };
    }
    return { ok: true, servers };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (kv): kv is [string, string] => typeof kv[1] === 'string',
    ),
  );
}

/**
 * Einen Server in den *Text* von mcp.json schreiben statt in ein geparstes
 * Abbild: die Datei gehört dem Nutzer. `_help`, eigene Felder und die
 * Reihenfolge bleiben so erhalten, auch wenn Cortex sie nie gelesen hat.
 */
export function withServer(content: string, name: string, def: McpServerDef): string {
  const doc = parseObject(content);
  const servers = { ...(asObject(doc.servers) ?? {}) };
  servers[name] = compact({
    command: def.command,
    args: def.args,
    env: def.env,
    url: def.url,
    providers: def.providers,
  });
  return stringify({ ...doc, servers });
}

export function withoutServer(content: string, name: string): string {
  const doc = parseObject(content);
  const servers = { ...(asObject(doc.servers) ?? {}) };
  delete servers[name];
  return stringify({ ...doc, servers });
}

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  isRecord(v) ? v : undefined;

function parseObject(content: string): Record<string, unknown> {
  if (!content.trim()) return { servers: {} };
  const parsed = JSON.parse(content) as unknown;
  const doc = asObject(parsed);
  if (!doc) throw new Error('mcp.json is not an object');
  return doc;
}

function compact(def: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(def).filter(([, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    }),
  );
}

const stringify = (doc: Record<string, unknown>): string => `${JSON.stringify(doc, null, 2)}\n`;
