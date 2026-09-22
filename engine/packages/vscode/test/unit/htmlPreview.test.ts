import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { request, type IncomingHttpHeaders } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HtmlPreviewServer } from '../../src/panel/htmlPreview.js';

const roots: string[] = [];
const servers: HtmlPreviewServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) server.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'cortex-preview-')); roots.push(root);
  await mkdir(join(root, 'site'));
  await writeFile(join(root, 'site', 'Prototyp für Oskar.html'), '<!doctype html><script src="daten.js"></script><p>Hallo</p>');
  await writeFile(join(root, 'site', 'daten.js'), 'window.daten = [1, 2, 3];');
  await writeFile(join(root, 'site', 'index.html'), '<p>Startseite</p>');
  await writeFile(join(root, '.env'), 'GEHEIM=1');
  await writeFile(join(root, 'film.mp4'), '0123456789');
  return root;
}

function preview() {
  const server = new HtmlPreviewServer(); servers.push(server);
  return server;
}

function get(url: string, headers: Record<string, string> = {}) {
  const { port, pathname, search } = new URL(url);
  return raw(Number(port), pathname + search, headers);
}

/** Der Pfad genau so, wie er dasteht — `new URL` löste `%2e%2e` schon vorher auf. */
function raw(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => done({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', fail);
    req.end();
  });
}

describe('HTML-Vorschau im Dock', () => {
  it('falls back to a free port when the preferred project port is already in use', async () => {
    const root = await project();
    const first = new URL(await preview().url(root, 'site/index.html'));
    const second = new URL(await preview().url(root, 'site/index.html'));
    expect(first.port).not.toBe(second.port);
    expect((await get(second.href)).body).toBe('<p>Startseite</p>');
  });
  it('liefert die Seite und ihre relativen Nachbarn aus, ohne Cache', async () => {
    const root = await project();
    const url = await preview().url(root, 'site/Prototyp für Oskar.html');
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{32}\/site\/Prototyp%20f%C3%BCr%20Oskar\.html$/);
    const page = await get(url);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toBe('text/html');
    expect(page.headers['cache-control']).toBe('no-store');
    expect(page.body).toContain('<p>Hallo</p>');
    const script = await get(new URL('daten.js', url).href);
    expect(script.headers['content-type']).toBe('text/javascript');
    expect(script.body).toBe('window.daten = [1, 2, 3];');
  });

  it('antwortet nur mit dem Geheimnis im Pfad und nur unter 127.0.0.1', async () => {
    const root = await project();
    const url = new URL(await preview().url(root, 'site/index.html'));
    const token = url.pathname.split('/')[1]!;
    expect((await get(`${url.origin}/site/index.html`)).status).toBe(404);
    expect((await get(`${url.origin}/${'0'.repeat(token.length)}/site/index.html`)).status).toBe(404);
    // Ein anderer Host-Kopf hieße DNS-Rebinding.
    expect((await get(url.href, { Host: `evil.test:${url.port}` })).status).toBe(403);
    expect((await get(url.href, { Host: `localhost:${url.port}` })).status).toBe(403);
  });

  it('gibt weder Punktdateien noch Dateien außerhalb des Projekts heraus', async () => {
    const root = await project(); const other = await project();
    await symlink(join(other, 'site'), join(root, 'fremd'));
    await symlink(join(root, '.env'), join(root, 'harmlos.txt'));
    const server = preview();
    const url = new URL(await server.url(root, 'site/index.html'));
    const token = url.pathname.split('/')[1]!;
    const base = `${url.origin}/${token}`;
    expect((await get(`${base}/.env`)).status).toBe(404);
    expect((await raw(Number(url.port), `/${token}/site/%2e%2e/.env`)).status).toBe(404);
    expect((await raw(Number(url.port), `/${token}/%2e%2e/%2e%2e/%2e%2e/etc/hosts`)).status).toBe(404);
    expect((await raw(Number(url.port), `/${token}/site/%2e%2e/site/index.html`)).body).toBe('<p>Startseite</p>');
    expect((await get(`${base}/fremd/index.html`)).status).toBe(404);
    expect((await get(`${base}/harmlos.txt`)).status).toBe(404);
    await expect(server.url(root, '.env')).rejects.toThrow('Punktdateien');
    await expect(server.url(root, '../x.html')).rejects.toThrow();
    await expect(server.url(root, 'fehlt.html')).rejects.toThrow();
  });

  it('führt einen Ordner zu seiner Startseite und beantwortet Range-Anfragen', async () => {
    const root = await project();
    const url = new URL(await preview().url(root, 'site/index.html'));
    const base = `${url.origin}/${url.pathname.split('/')[1]}`;
    const redirect = await get(`${base}/site?x=1`);
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe(`/${url.pathname.split('/')[1]}/site/?x=1`);
    expect((await get(`${base}/site/`)).body).toBe('<p>Startseite</p>');
    const part = await get(`${base}/film.mp4`, { Range: 'bytes=2-5' });
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 2-5/10');
    expect(part.body).toBe('2345');
    expect((await get(`${base}/film.mp4`, { Range: 'bytes=-3' })).body).toBe('789');
    expect((await get(`${base}/film.mp4`, { Range: 'bytes=20-' })).status).toBe(416);
  });

  it('trennt Projekte: jedes bekommt seinen eigenen Ursprung und sein eigenes Geheimnis', async () => {
    const a = await project(); const b = await project();
    const server = preview();
    const urlA = new URL(await server.url(a, 'site/index.html'));
    const urlB = new URL(await server.url(b, 'site/index.html'));
    expect(urlA.origin).not.toBe(urlB.origin);
    expect(urlA.pathname.split('/')[1]).not.toBe(urlB.pathname.split('/')[1]);
    // Ein zweiter Aufruf fürs selbe Projekt startet keinen zweiten Server.
    expect(new URL(await server.url(a, 'site/daten.js')).origin).toBe(urlA.origin);
  });
});
