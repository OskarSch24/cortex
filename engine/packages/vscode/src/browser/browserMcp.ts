/**
 * MCP-Server „cortex_browser“, von der CLI des Modells gestartet: der
 * eingebaute Browser von Cortex als Werkzeug. Recherche läuft damit in Tabs
 * von Cortex statt in einem Desktop-Browser — mehrere nebeneinander, während
 * der Nutzer in seinem eigenen Browser weiterarbeitet.
 *
 * Eigene Logik hat er nicht: er reicht an Cortex weiter (browserBridge.ts →
 * desktop/src/agentBrowser.ts). Eigenes Paket (esbuild → dist/browserServer.js).
 */
import { askLoopback, runStdioMcpServer } from '../mcp/stdioServer.js';

const PORT = Number(process.env.CORTEX_BROWSER_PORT ?? 0);
const TOKEN = process.env.CORTEX_BROWSER_TOKEN ?? '';
const TIMEOUT_MS = 90_000;

type Answer = { text: string; image?: string; error?: string };

function askCortex(tool: string, args: Record<string, unknown>): Promise<Answer> {
  return askLoopback<Answer>({
    port: PORT,
    token: TOKEN,
    payload: { tool, args },
    timeoutMs: TIMEOUT_MS,
    unreachable: { text: '', error: 'Cortex ist nicht erreichbar.' },
    timedOut: { text: '', error: 'Cortex hat nicht rechtzeitig geantwortet.' },
    malformed: { text: '', error: 'Antwort von Cortex unlesbar.' },
    read: (answer) => answer as Answer,
  });
}

const tabId = { type: 'string', description: 'Tab id from browser_open or browser_tabs.' };
const target = {
  ref: { type: 'number', description: 'Element number from browser_read with elements: true (preferred).' },
  selector: { type: 'string', description: 'CSS selector, if you know it.' },
};
const readOnly = (title: string) => ({ title, readOnlyHint: true, openWorldHint: true });
const acting = (title: string) => ({ title, readOnlyHint: false, destructiveHint: false, openWorldHint: true });

const BROWSER_TOOLS = [
  {
    name: 'browser_open',
    description: 'Open a web page in Cortex\'s built-in browser. Without tabId it opens a NEW tab in the background and returns its id — open several tabs for independent sources and work through them in parallel. With tabId it navigates one of your tabs. show: true also puts the tab in front for the user.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, tabId, show: { type: 'boolean' } }, required: ['url'], additionalProperties: false },
    annotations: readOnly('Seite im Cortex-Browser öffnen'),
  },
  {
    name: 'browser_read',
    description: 'Read a tab as text (title, URL, visible text). Long pages come in parts: continue with offset. elements: true also lists links, buttons and inputs with numbers for browser_click / browser_type. Works on your tabs and on the user\'s tabs.',
    inputSchema: { type: 'object', properties: { tabId, offset: { type: 'number' }, maxChars: { type: 'number', description: 'Default 20000.' }, elements: { type: 'boolean' } }, required: ['tabId'], additionalProperties: false },
    annotations: readOnly('Tab lesen'),
  },
  {
    name: 'browser_screenshot',
    description: 'Look at a tab: returns a picture of what is visible (1280 px wide). Use it when layout, images or charts matter; for text, browser_read is cheaper.',
    inputSchema: { type: 'object', properties: { tabId }, required: ['tabId'], additionalProperties: false },
    annotations: readOnly('Tab ansehen'),
  },
  {
    name: 'browser_tabs',
    description: 'List the open tabs of Cortex\'s built-in browser: yours (you may act in them) and the user\'s (read and look only).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: readOnly('Tabs auflisten'),
  },
  {
    name: 'browser_click',
    description: 'Click an element in one of your tabs — by ref (from browser_read elements), CSS selector, or visible text. Waits for a navigation it triggers.',
    inputSchema: { type: 'object', properties: { tabId, ...target, text: { type: 'string', description: 'Visible text or label of the element.' } }, required: ['tabId'], additionalProperties: false },
    annotations: acting('Im Cortex-Browser klicken'),
  },
  {
    name: 'browser_type',
    description: 'Type into an input of one of your tabs (by ref, selector, or field label). Replaces the current value unless clear: false. submit: true sends the form / presses Enter.',
    inputSchema: { type: 'object', properties: { tabId, ...target, field: { type: 'string', description: 'Label or placeholder of the input, if no ref.' }, text: { type: 'string' }, clear: { type: 'boolean' }, submit: { type: 'boolean' } }, required: ['tabId', 'text'], additionalProperties: false },
    annotations: acting('Im Cortex-Browser tippen'),
  },
  {
    name: 'browser_eval',
    description: 'Run a JavaScript expression in the page of one of your tabs and get its JSON result — for extracting tables or structured data, scrolling (window.scrollBy), or going back (history.back()).',
    inputSchema: { type: 'object', properties: { tabId, expression: { type: 'string' } }, required: ['tabId', 'expression'], additionalProperties: false },
    annotations: acting('JavaScript im Cortex-Browser'),
  },
  {
    name: 'browser_show',
    description: 'Put a tab in front in Cortex\'s side panel so the user sees it.',
    inputSchema: { type: 'object', properties: { tabId }, required: ['tabId'], additionalProperties: false },
    annotations: readOnly('Tab zeigen'),
  },
  {
    name: 'browser_close',
    description: 'Close one of your tabs (tabId "all" closes all of yours). Close tabs when you are done with them, unless the user wants to look at them.',
    inputSchema: { type: 'object', properties: { tabId }, required: ['tabId'], additionalProperties: false },
    annotations: readOnly('Tab schließen'),
  },
] as const;

const NAMES = new Set<string>(BROWSER_TOOLS.map((tool) => tool.name));

async function call(name: string, args: Record<string, unknown>) {
  if (!NAMES.has(name)) return { isError: true, content: [{ type: 'text', text: `Unbekanntes Werkzeug ${name}` }] };
  const answer = await askCortex(name, args);
  if (answer.error) return { isError: true, content: [{ type: 'text', text: answer.error }] };
  const content: Array<Record<string, unknown>> = [];
  if (answer.image) content.push({ type: 'image', data: answer.image, mimeType: 'image/jpeg' });
  content.push({ type: 'text', text: answer.text || 'Erledigt.' });
  return { content };
}

runStdioMcpServer({
  name: 'cortex_browser',
  tools: BROWSER_TOOLS,
  call,
  ping: true,
  requireId: true,
  unknownMethod: (method) => `Unbekannte Methode ${method}`,
});
