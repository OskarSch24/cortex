/**
 * MCP-Server „cortex_websearch“, von der CLI des Agenten gestartet, wenn im
 * Agenten die Websuche „Exa Instant“ gewählt ist: ein Werkzeug `web_search`.
 *
 * Eigene Logik und eigene Schlüssel hat er nicht: er reicht die Anfrage über
 * einen Loopback-Socket an Cortex weiter (websearchBridge.ts), und Cortex
 * sucht mit dem OpenRouter-Schlüssel aus seinem Speicher bei Exa.
 * Eigenes Paket (esbuild → dist/websearchServer.js), weil er ein eigener Prozess ist.
 */
import { askLoopback, runStdioMcpServer } from '../mcp/stdioServer.js';

const PORT = Number(process.env.CORTEX_WEBSEARCH_PORT ?? 0);
const TOKEN = process.env.CORTEX_WEBSEARCH_TOKEN ?? '';
const TIMEOUT_MS = 45_000;

interface Answer { text: string; error?: string }

function askCortex(query: string, maxResults?: number): Promise<Answer> {
  return askLoopback<Answer>({
    port: PORT,
    token: TOKEN,
    payload: { query, maxResults },
    timeoutMs: TIMEOUT_MS,
    unreachable: { text: '', error: 'Cortex ist nicht erreichbar.' },
    timedOut: { text: '', error: 'Die Suche hat nicht rechtzeitig geantwortet.' },
    malformed: { text: '', error: 'Antwort von Cortex unlesbar.' },
    read: (answer) => answer as Answer,
  });
}

const TOOLS = [{
  name: 'web_search',
  description: 'Search the web (Exa, instant mode, ~250 ms). Returns up to max_results results, each with title, URL and a short excerpt. Use it instead of any other web search. Run several focused queries rather than one broad one; take URLs only from the results, never invent them.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
      max_results: { type: 'integer', minimum: 1, maximum: 25, description: 'How many results (default 10; up to 10 cost the same).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  annotations: { title: 'Websuche (Exa Instant)', readOnlyHint: true, destructiveHint: false, openWorldHint: true },
}];

async function call(name: string, args: Record<string, unknown>) {
  if (name !== 'web_search') return { isError: true, content: [{ type: 'text', text: `Unbekanntes Werkzeug ${name}` }] };
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { isError: true, content: [{ type: 'text', text: 'Die Suchanfrage fehlt.' }] };
  const maxResults = typeof args.max_results === 'number' ? args.max_results : undefined;
  const answer = await askCortex(query, maxResults);
  if (answer.error) return { isError: true, content: [{ type: 'text', text: answer.error }] };
  return { content: [{ type: 'text', text: answer.text }] };
}

runStdioMcpServer({
  name: 'cortex_websearch',
  tools: TOOLS,
  call,
  ping: true,
  requireId: true,
  unknownMethod: (method) => `Unbekannte Methode ${method}`,
});
