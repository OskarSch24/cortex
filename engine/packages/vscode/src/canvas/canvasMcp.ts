/**
 * MCP-Server „cortex_canvas“, von der CLI des Modells gestartet: zwei
 * Werkzeuge, mit denen das Modell die Excalidraw-Fläche sieht.
 *
 * - canvas_view: das Bild der Fläche (PNG) und die Liste ihrer Elemente samt
 *   Prüfergebnis.
 * - canvas_draw: einen cortex-excalidraw-Block zeichnen und sofort das
 *   Ergebnis als Bild zurückbekommen — zeichnen, ansehen, nachbessern.
 *
 * Eigene Logik hat er nicht: er reicht an Cortex weiter (canvasBridge.ts).
 * Eigenes Paket (esbuild → dist/canvasServer.js), weil er ein eigener Prozess ist.
 */
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';

const PORT = Number(process.env.CORTEX_CANVAS_PORT ?? 0);
const TOKEN = process.env.CORTEX_CANVAS_TOKEN ?? '';
const TIMEOUT_MS = 90_000;

interface Rpc { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Record<string, unknown> }
const send = (message: Record<string, unknown>) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');

function askCortex(code?: string): Promise<{ png?: string; text: string; error?: string }> {
  if (!PORT || !TOKEN) return Promise.resolve({ text: '', error: 'Cortex ist nicht erreichbar.' });
  return new Promise(resolve => {
    const socket = createConnection({ port: PORT, host: '127.0.0.1' });
    let buffer = '';
    const done = (v: { png?: string; text: string; error?: string }) => { clearTimeout(timer); socket.destroy(); resolve(v); };
    const timer = setTimeout(() => done({ text: '', error: 'Cortex hat nicht rechtzeitig geantwortet.' }), TIMEOUT_MS);
    socket.on('error', () => done({ text: '', error: 'Cortex ist nicht erreichbar.' }));
    socket.on('connect', () => socket.write(JSON.stringify({ token: TOKEN, code }) + '\n'));
    socket.on('data', chunk => {
      buffer += chunk.toString();
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      try { done(JSON.parse(buffer.slice(0, nl))); } catch { done({ text: '', error: 'Antwort von Cortex unlesbar.' }); }
    });
  });
}

const TOOLS = [
  {
    name: 'canvas_view',
    description: 'Look at the Excalidraw canvas of this chat: returns a PNG picture of everything on it, the list of elements with ids, and Cortex\'s layout check. Use it to verify a drawing before you say it is done.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Zeichenfläche ansehen', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'canvas_draw',
    description: 'Draw on the Excalidraw canvas of this chat and see the result: takes the same JSON as a cortex-excalidraw block (layout mindmap | flow | map | free, mode replace | add, remove) and returns the picture of the canvas afterwards plus the layout check. Look at the picture; if anything overlaps, is cut off or unreadable, call it again to fix it.',
    inputSchema: { type: 'object', properties: { block: { type: 'object', description: 'The cortex-excalidraw JSON object.' } }, required: ['block'] },
    // Zeichnet nur auf der Fläche in Cortex, nie in Dateien des Projekts — auch im Plan-Modus erlaubt.
    annotations: { title: 'Auf der Zeichenfläche zeichnen', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

async function call(name: string, args: Record<string, unknown>) {
  if (name !== 'canvas_view' && name !== 'canvas_draw') return { isError: true, content: [{ type: 'text', text: `Unbekanntes Werkzeug ${name}` }] };
  const block = name === 'canvas_draw' ? (typeof args.block === 'string' ? args.block : JSON.stringify(args.block ?? {})) : undefined;
  const answer = await askCortex(block);
  if (answer.error) return { isError: true, content: [{ type: 'text', text: answer.error }] };
  const content: Array<Record<string, unknown>> = [];
  if (answer.png) content.push({ type: 'image', data: answer.png.replace(/^data:image\/png;base64,/, ''), mimeType: 'image/png' });
  content.push({ type: 'text', text: answer.text || (answer.png ? 'Canvas shown above.' : 'The canvas is empty.') });
  return { content };
}

createInterface({ input: process.stdin }).on('line', async line => {
  let msg: Rpc;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;
  switch (msg.method) {
    case 'initialize':
      send({ id: msg.id, result: { protocolVersion: (msg.params?.protocolVersion as string) ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'cortex_canvas', version: '1.0.0' } } });
      break;
    case 'tools/list':
      send({ id: msg.id, result: { tools: TOOLS } });
      break;
    case 'tools/call': {
      const params = msg.params ?? {};
      send({ id: msg.id, result: await call(String(params.name), (params.arguments as Record<string, unknown>) ?? {}) });
      break;
    }
    case 'ping':
      send({ id: msg.id, result: {} });
      break;
    default:
      send({ id: msg.id, error: { code: -32601, message: `Unbekannte Methode ${msg.method}` } });
  }
});
