import { realpathSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { isInside } from '../../vscode/src/util/paths.js';

export function allowedResource(path: string, roots: string[]): boolean {
  try {
    const candidate = realpathSync(path);
    return roots.some(root => {
      try { return isInside(realpathSync(root), candidate); }
      catch { return false; }
    });
  } catch { return false; }
}
export function resourceUrl(panel: string, path: string): string {
  return `cortex-app://resource/${panel}/${Buffer.from(resolve(path)).toString('base64url')}`;
}
export function resourcePath(url: URL): { panel: string; path: string } {
  const [, panel, encoded, ...tail] = url.pathname.split('/');
  if (!panel || !encoded || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Ungültige Ressourcenadresse.');
  const decoded = Buffer.from(encoded, 'base64url').toString();
  if (!isAbsolute(decoded) || decoded.includes('\0') || Buffer.from(decoded).toString('base64url') !== encoded) throw new Error('Ungültige Ressourcenadresse.');
  return { panel, path: resolve(decoded, ...tail.map(decodeURIComponent)) };
}
export function previewUrl(value: string): string {
  const address = value.trim();
  const local = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(address);
  const hostWithPort = /^(?:[a-z\d.-]+|\[[a-f\d:]+\]):\d+(?:[/?#]|$)/i.test(address);
  const explicitProtocol = /^[a-z][a-z\d+.-]*:/i.test(address) && !hostWithPort;
  const url = new URL(explicitProtocol ? address : `${local ? 'http' : 'https'}://${address}`);
  if (!['http:', 'https:'].includes(url.protocol) && url.href !== 'about:blank') throw new Error('Die Vorschau unterstützt HTTP und HTTPS.');
  if (url.username || url.password) throw new Error('Bitte keine Zugangsdaten in der Vorschauadresse verwenden.');
  return url.href;
}
export function injectShell(html: string, panel: string, shellRoot: string): string {
  const nonce = html.match(/script nonce="([^"]+)"/)?.[1];
  if (!nonce || !html.includes('id="root"')) return html;
  const css = `${resourceUrl(panel, shellRoot)}/shell.css`;
  const js = `${resourceUrl(panel, shellRoot)}/shell.js`;
  return html.replace('</head>', `<link rel="stylesheet" href="${css}"></head>`)
    .replace('</body>', `<script nonce="${nonce}" src="${js}" data-cortex-desktop-shell></script></body>`);
}
