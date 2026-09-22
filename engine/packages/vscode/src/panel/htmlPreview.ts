import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import { projectFile } from './workspace.js';

/**
 * Die gerenderte Vorschau einer HTML-Datei im Dock.
 *
 * Als `srcdoc` in der Webview liefe eine Seite nicht: der Rahmen erbte deren
 * CSP, die nur Skripte mit Nonce zulässt, und relative Verweise wie
 * `<script src="daten.js">` gingen ins Leere. Deshalb liefert je Projekt ein
 * kleiner Server auf 127.0.0.1 den Projektordner aus, wie es ein
 * Entwicklungsserver täte, und das Dock zeigt die Seite in einem Rahmen mit
 * eigenem Ursprung — an die Webview und ihre Brücke zum Host kommt sie nicht.
 *
 * Erreichbar ist nur, wer das Geheimnis im Pfad kennt, und nur unter
 * 127.0.0.1 — ein anderer Host-Kopf hieße DNS-Rebinding. Punktdateien
 * (`.env`, `.git`) liefert er nie aus: eine Seite, die sie lesen könnte,
 * könnte sie auch verschicken.
 */

interface Served {
  server: Server;
  port: number;
  token: string;
}

export class HtmlPreviewServer {
  private served = new Map<string, Promise<Served>>();

  /** Die Adresse, unter der `path` aus dem Projekt `root` als Seite erscheint. */
  async url(root: string, path: string): Promise<string> {
    const base = await realpath(root);
    const rel = relative(base, resolve(base, path));
    // Wirft, wenn die Datei fehlt oder außerhalb des Projekts liegt.
    const file = await projectFile(base, rel);
    if (hidden(rel) || hidden(relative(base, file))) throw new Error('Punktdateien zeigt die Vorschau nicht.');
    const { port, token } = await this.serve(base);
    return `http://127.0.0.1:${port}/${token}/${rel.split(sep).map(encodeURIComponent).join('/')}`;
  }

  dispose(): void {
    for (const pending of this.served.values()) pending.then(({ server }) => server.close(), () => undefined);
    this.served.clear();
  }

  private serve(root: string): Promise<Served> {
    let pending = this.served.get(root);
    if (!pending) {
      pending = listen(root);
      // Ein gescheiterter Start wird beim nächsten Öffnen neu versucht.
      pending.catch(() => this.served.delete(root));
      this.served.set(root, pending);
    }
    return pending;
  }
}

async function listen(root: string): Promise<Served> {
  const token = randomBytes(16).toString('hex');
  const server = createServer((req, res) => {
    handle(root, token, req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  let port: number;
  try {
    port = await listenOn(server, preferredPort(root));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error;
    port = await listenOn(server, 0);
  }
  // Ein Fehler nach dem Start darf den Erweiterungshost nicht mitreißen.
  server.on('error', () => undefined);
  server.unref();
  return { server, port, token };
}

function listenOn(server: Server, port: number): Promise<number> {
  return new Promise((done, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail);
      done((server.address() as AddressInfo).port);
    });
  });
}

/**
 * Derselbe Ordner bekommt nach Möglichkeit bei jedem Start denselben Port.
 * Mit dem Port wechselte sonst der Ursprung, und eine Seite verlöre, was sie
 * in `localStorage` abgelegt hat. Ist er belegt, tut es ein beliebiger.
 */
function preferredPort(root: string): number {
  let hash = 2166136261;
  for (const char of root) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return 42000 + ((hash >>> 0) % 6000);
}

async function handle(root: string, token: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.headers.host !== `127.0.0.1:${req.socket.localPort}`) return refuse(res, 403);
  if (req.method !== 'GET' && req.method !== 'HEAD') return refuse(res, 405);
  const target = req.url ?? '/';
  const at = target.indexOf('?');
  const pathname = at < 0 ? target : target.slice(0, at);
  const search = at < 0 ? '' : target.slice(at);
  const [first = '', ...segments] = pathname.slice(1).split('/');
  if (!sameSecret(first, token)) return refuse(res, 404);
  let rel: string;
  try { rel = segments.map(decodeURIComponent).join('/'); } catch { return refuse(res, 400); }
  if (hidden(rel)) return refuse(res, 404);

  let file: string;
  let size: number;
  try {
    file = await projectFile(root, rel);
    let info = await stat(file);
    if (info.isDirectory()) {
      // Ohne Schrägstrich lösten sich die relativen Verweise der Startseite
      // gegen den Ordner darüber auf — deshalb erst umleiten, wie jeder Webserver.
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/${search}`, 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      file = await projectFile(root, `${rel}/index.html`);
      info = await stat(file);
    }
    if (!info.isFile() || hidden(relative(root, file))) return refuse(res, 404);
    size = info.size;
  } catch {
    return refuse(res, 404);
  }

  const headers: OutgoingHttpHeaders = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    // Der Agent schreibt die Datei womöglich gerade um; neu laden heißt neu lesen.
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  };
  // Videos und Tonspuren springen per Range; ohne Antwort darauf ließe sich
  // in einem eingebetteten Video nicht spulen.
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), size - 1);
    } else {
      start = Math.max(0, size - Number(range[2]));
    }
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}`, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = size ? end - start + 1 : 0;
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || !size) { res.end(); return; }
  // Bricht der Rahmen ab, schließt `pipeline` auch die Datei wieder.
  pipeline(createReadStream(file, { start, end }), res, () => undefined);
}

function refuse(res: ServerResponse, status: number): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(status === 404 ? 'Nicht gefunden.' : status === 403 ? 'Nicht erlaubt.' : 'Ungültige Anfrage.');
}

function sameSecret(given: string, token: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `.env`, `.git/config` und alles darunter — `.` und `..` sind nur Wegangaben. */
function hidden(rel: string): boolean {
  return rel.split(/[\\/]/).some(part => part.startsWith('.') && part !== '.' && part !== '..');
}

/**
 * HTML, CSS und Skripte tragen keinen Zeichensatz: wie beim Doppelklick im
 * Finder entscheidet das `<meta charset>` der Seite, und was sie lädt, erbt ihn.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xhtml': 'application/xhtml+xml',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.geojson': 'application/geo+json',
  '.topojson': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.pdf': 'application/pdf',
};
