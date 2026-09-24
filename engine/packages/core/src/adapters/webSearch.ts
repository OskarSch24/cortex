import type { ProviderId } from '../types.js';
import { privateTempFile } from '../util/privateTempFile.js';
import { OPENROUTER_CHAT_URL, openRouterHeaders, openRouterNoCredit } from './openrouterHttp.js';

/**
 * Welche Websuche ein Agent benutzt.
 *
 * - `standard`: die Suche, die der Anbieter selbst mitbringt (Claude-, Codex-,
 *   Grok-eigene Suche; bei OpenRouter das Server-Tool mit `engine: auto`).
 * - `exa-instant`: Exa im Modus `instant` (~250 ms) über OpenRouter. Die CLIs
 *   verlieren dafür ihre eigene Suche und bekommen das Werkzeug
 *   `cortex_websearch.web_search`, das über Cortex bei OpenRouter sucht.
 * - `off`: keine Websuche.
 */
export type WebSearchMode = 'standard' | 'exa-instant' | 'off';
export const WEB_SEARCH_MODES: readonly WebSearchMode[] = Object.freeze(['standard', 'exa-instant', 'off']);

/** Anbieter, deren Suche sich pro Lauf umstellen lässt. Copilot hat keinen Schalter dafür. */
export const WEB_SEARCH_PROVIDERS: readonly ProviderId[] = Object.freeze(['claude', 'codex', 'grok', 'openrouter']);
export const supportsWebSearchChoice = (provider: ProviderId): boolean => WEB_SEARCH_PROVIDERS.includes(provider);

/** Der MCP-Server, den der Host für `exa-instant` startet (ein eigener Prozess, spricht nur mit Cortex). */
export interface WebSearchServer { command: string; args: string[]; env: Record<string, string> }
export interface WebSearchSetup { mode: WebSearchMode; server?: WebSearchServer }

export const WEB_SEARCH_SERVER_NAME = 'cortex_websearch';
export const WEB_SEARCH_TOOL = 'web_search';
/** So heißt das Werkzeug bei Claude (`mcp__<server>__<tool>`). */
export const CLAUDE_WEB_SEARCH_TOOL = `mcp__${WEB_SEARCH_SERVER_NAME}__${WEB_SEARCH_TOOL}`;

/** Nichts umzustellen: kein Wunsch, oder der Anbieter behält seine eigene Suche. */
const untouched = (setup?: WebSearchSetup): boolean => !setup || setup.mode === 'standard';

function requireServer(setup: WebSearchSetup): WebSearchServer {
  if (!setup.server) throw new Error('Die Exa-Suche konnte nicht gestartet werden: Cortex hat keinen Suchserver bereitgestellt.');
  return setup.server;
}

// ── Claude ────────────────────────────────────────────────────────────────

export interface ClaudeWebSearch { args: string[]; configPath?: string; dispose(): void }

/**
 * `--disallowedTools WebSearch` nimmt Claude die eigene Suche; bei Exa kommt
 * eine private MCP-Konfiguration dazu (Datei 0600, beim Laufende gelöscht) und
 * die Freigabe des Werkzeugs, damit es auch im Plan-Modus ohne Rückfrage läuft.
 * Die Konfiguration wird wie jede andere hinter `--mcp-config` gehängt.
 */
export function claudeWebSearch(setup?: WebSearchSetup): ClaudeWebSearch {
  if (untouched(setup)) return { args: [], dispose: () => undefined };
  const args = ['--disallowedTools', 'WebSearch'];
  if (setup!.mode === 'off') return { args, dispose: () => undefined };
  const server = requireServer(setup!);
  const config = privateTempFile(
    'cortex-websearch-',
    'mcp.json',
    JSON.stringify({ mcpServers: { [WEB_SEARCH_SERVER_NAME]: { type: 'stdio', ...server } } }),
  );
  return { args: [...args, '--allowedTools', CLAUDE_WEB_SEARCH_TOOL], configPath: config.path, dispose: config.dispose };
}

/** Hängt eine weitere Konfiguration an das (einzige) `--mcp-config` an. */
export function withExtraMcpConfig(args: string[], path: string): string[] {
  const at = args.indexOf('--mcp-config');
  if (at < 0) return [...args, '--mcp-config', path];
  return [...args.slice(0, at + 1), path, ...args.slice(at + 1)];
}

// ── Codex ─────────────────────────────────────────────────────────────────

const PLAIN_ENV = new Set(['ELECTRON_RUN_AS_NODE']);

/**
 * Codex liest beides als `-c`-Überschreibung nur für diesen Prozess, die
 * config.toml des Nutzers bleibt unberührt (geprüft mit codex-cli 0.155:
 * `web_search` kennt disabled | cached | indexed | live). Das Token des
 * Suchservers steht nicht in den Argumenten: es geht als Umgebung an Codex,
 * und `env_vars` reicht genau diese Namen an den MCP-Prozess weiter.
 */
export function codexWebSearch(setup?: WebSearchSetup): { args: string[]; env: Record<string, string> } {
  if (untouched(setup)) return { args: [], env: {} };
  const args = ['-c', 'web_search="disabled"'];
  if (setup!.mode === 'off') return { args, env: {} };
  const server = requireServer(setup!);
  const key = `mcp_servers.${WEB_SEARCH_SERVER_NAME}`;
  // Schalter ohne Geheimnis stehen direkt in der Konfiguration: in der Umgebung
  // von Codex würde ELECTRON_RUN_AS_NODE auch jede Shell des Agenten erreichen.
  const plain = Object.entries(server.env).filter(([name]) => PLAIN_ENV.has(name));
  const passed = Object.fromEntries(Object.entries(server.env).filter(([name]) => !PLAIN_ENV.has(name)));
  return {
    args: [
      ...args,
      '-c', `${key}.command=${JSON.stringify(server.command)}`,
      '-c', `${key}.args=${JSON.stringify(server.args)}`,
      ...(plain.length ? ['-c', `${key}.env={${plain.map(([name, value]) => `${name}=${JSON.stringify(value)}`).join(',')}}`] : []),
      '-c', `${key}.env_vars=${JSON.stringify(Object.keys(passed))}`,
    ],
    env: passed,
  };
}

// ── Grok (ACP) ────────────────────────────────────────────────────────────

/** So nennt Grok das Werkzeug in Freigabe-Anfragen (`<server>__<tool>`). */
export const ACP_WEB_SEARCH_TOOL = `${WEB_SEARCH_SERVER_NAME}__${WEB_SEARCH_TOOL}`;

/**
 * Globale Grok-Flags stehen vor `agent stdio`. Live geprüft (grok 1.0.34):
 * `--disallowed-tools web_search` lässt die eigene Suche im ACP-Modus an, nur
 * `--disable-web-search` nimmt sie weg — dabei geht auch Groks Web-Fetch.
 */
export function grokWebSearchArgs(setup?: WebSearchSetup): string[] {
  return untouched(setup) ? [] : ['--disable-web-search'];
}

/** Die MCP-Liste für `session/new` / `session/load` im ACP-Format. */
export function acpWebSearchServers(setup?: WebSearchSetup): Array<{ name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> }> {
  if (!setup || setup.mode !== 'exa-instant') return [];
  const server = requireServer(setup);
  return [{ name: WEB_SEARCH_SERVER_NAME, command: server.command, args: server.args, env: Object.entries(server.env).map(([name, value]) => ({ name, value })) }];
}

// ── OpenRouter ────────────────────────────────────────────────────────────

/** Wie viel Text je Treffer mitkommt — für die Quellensuche reichen Titel, URL und ein Ausschnitt. */
const RESULT_CHARACTERS = 600;

/**
 * Das Server-Tool für einen OpenRouter-Lauf. OpenRouter führt die Suche selbst
 * aus; `standard` lässt die Maschine offen (eigene Suche des Modells, sonst Exa).
 */
export function openRouterSearchTools(setup?: WebSearchSetup): Array<Record<string, unknown>> {
  if (!setup || setup.mode === 'off') return [];
  if (setup.mode === 'standard') return [{ type: 'openrouter:web_search' }];
  return [{ type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'instant', max_results: 10, max_characters: RESULT_CHARACTERS } }];
}

export interface WebSearchResult { url: string; title?: string; content?: string }

/** `url_citation`-Anmerkungen aus einer Antwort oder einem Stream-Stück, doppelte URLs zusammengelegt. */
export function citationsFrom(annotations: unknown, into: WebSearchResult[] = []): WebSearchResult[] {
  if (!Array.isArray(annotations)) return into;
  for (const entry of annotations) {
    const citation = entry && typeof entry === 'object' ? (entry as { type?: unknown; url_citation?: unknown }) : undefined;
    if (citation?.type !== 'url_citation' || !citation.url_citation || typeof citation.url_citation !== 'object') continue;
    const { url, title, content } = citation.url_citation as { url?: unknown; title?: unknown; content?: unknown };
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || into.some(result => result.url === url)) continue;
    into.push({ url, ...(typeof title === 'string' && title ? { title } : {}), ...(typeof content === 'string' && content ? { content } : {}) });
  }
  return into;
}

/** Die Quellen als Markdown-Liste — so kommen die echten URLs mit der Antwort bei Nachfolgern an. */
export function formatSources(results: WebSearchResult[]): string {
  if (!results.length) return '';
  return `\n\n**Quellen**\n${results.map(result => `- [${(result.title ?? result.url).replace(/[[\]]/g, '')}](${result.url})`).join('\n')}`;
}

/**
 * Das Modell, das bei `exa-instant` für die CLIs die Suche an OpenRouter
 * weiterreicht. Es denkt nicht: es ruft das Werkzeug genau einmal auf.
 * Oskars Wahl für die Suche (22.09.2026).
 */
export const SEARCH_RELAY_MODEL = 'deepseek/deepseek-v4-flash';

export interface ExaSearchAnswer { results: WebSearchResult[]; costUsd?: number }

/**
 * Eine Exa-Instant-Suche über OpenRouter. OpenRouter bietet die Suche nur als
 * Werkzeug eines Modells an, deshalb geht die Anfrage an ein billiges Modell,
 * das sie genau einmal ausführt. Die Treffer stammen aus den Anmerkungen, nie
 * aus dem Antworttext — der könnte erfunden sein.
 */
export async function openRouterExaSearch(
  key: string,
  query: string,
  options: { maxResults?: number; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ExaSearchAnswer> {
  const maxResults = Math.min(25, Math.max(1, Math.round(options.maxResults ?? 10)));
  const response = await (options.fetchImpl ?? fetch)(OPENROUTER_CHAT_URL, {
    method: 'POST',
    signal: options.signal,
    headers: openRouterHeaders(key),
    body: JSON.stringify({
      model: SEARCH_RELAY_MODEL,
      messages: [
        { role: 'system', content: 'You are a search relay. Call the web_search tool exactly once, using the user message verbatim as the query. After the results arrive, reply with the single word: ok' },
        { role: 'user', content: query },
      ],
      tools: [{ type: 'openrouter:web_search', parameters: { engine: 'exa', mode: 'instant', max_results: maxResults, max_characters: RESULT_CHARACTERS } }],
      max_tool_calls: 1,
      usage: { include: true },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    let detail = text.trim().slice(0, 300);
    try { detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? detail; } catch { /* Rohtext genügt */ }
    if (response.status === 402) throw new Error(openRouterNoCredit('die Websuche'));
    throw new Error(`OpenRouter-Suche fehlgeschlagen (${response.status}): ${detail}`);
  }
  const body = JSON.parse(text) as { choices?: Array<{ message?: { annotations?: unknown } }>; usage?: { cost?: number } };
  const results = citationsFrom(body.choices?.[0]?.message?.annotations);
  return { results, ...(typeof body.usage?.cost === 'number' ? { costUsd: body.usage.cost } : {}) };
}
