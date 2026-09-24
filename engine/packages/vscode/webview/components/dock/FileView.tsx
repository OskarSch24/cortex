import { CopyButton } from '../CopyButton.js';
import { Markdown } from '../Markdown.js';

const MARKDOWN = /\.(md|markdown|mdx)$/i;
export const HTML = /\.(html?|xhtml)$/i;
/** Markdown und HTML haben eine Vorschau; alles andere hat nur seinen Quelltext. */
export const hasPreview = (path: string) => MARKDOWN.test(path) || HTML.test(path);

export type FileBody = { text?: string; truncated?: boolean; error?: string };
export type FilePage = { url?: string; error?: string };

/**
 * Eine HTML-Datei ist eine Seite und läuft als solche: mit ihren Skripten und
 * den Dateien daneben, ausgeliefert vom Host (htmlPreview.ts).
 *
 * `allow-same-origin` lässt ihr den eigenen Ursprung unter 127.0.0.1 — damit
 * funktionieren `localStorage` und das Nachladen eigener Dateien. Die Webview
 * hat einen anderen Ursprung, an sie kommt die Seite also trotzdem nicht.
 * Fenster öffnen oder Cortex selbst umlenken darf sie nicht.
 */
export function PageView({ path, page }: { path: string; page?: FilePage }) {
  if (!page) return <p class="cx-dock-note">wird geladen …</p>;
  if (page.error) return <p class="cx-dock-note" role="alert">{page.error}</p>;
  return <div class="cx-dock-file page">
    <iframe src={page.url} title={`Vorschau von ${path.split('/').pop()}`} sandbox="allow-scripts allow-same-origin allow-forms" />
  </div>;
}

export function FileView({ path, source, body }: {
  path: string;
  source: boolean;
  body?: FileBody;
}) {
  if (!body) return <p class="cx-dock-note">wird gelesen …</p>;
  if (body.error) return <p class="cx-dock-note" role="alert">{body.error}</p>;
  const text = body.text ?? '';
  // HTML als Seite zeigt PageView — hier wird nur Markdown gerendert.
  const rendered = !source && MARKDOWN.test(path);
  return <div class={`cx-dock-file ${rendered ? 'rendered' : 'source'}`}>
    <CopyButton text={text} label="Datei kopieren" className="cx-dock-copy" icon />
    {rendered
      ? <Markdown text={text} reading />
      : <div class="cx-diff"><div class="cx-diff-hunk">
          {text.split('\n').map((line, i) => <div class="cx-diff-line ctx" key={i}>
            <span class="cx-diff-no">{i + 1}</span>
            <span class="cx-diff-sign" />
            <span class="cx-diff-text">{line || ' '}</span>
          </div>)}
        </div></div>}
    {body.truncated && <p class="cx-dock-note">Vorschau begrenzt auf 512 KB und 4.000 Zeilen. „Öffnen“ zeigt die vollständige Datei.</p>}
  </div>;
}
