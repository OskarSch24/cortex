import type { ComponentChildren } from 'preact';
import { CopyButton } from './CopyButton.js';
import { Widget, type WidgetHost } from './widgets/Widget.js';
import { isWidgetLang } from './widgets/spec.js';
import { CanvasCard } from './CanvasCard.js';
import { isCanvasLang } from '../canvas/spec.js';

type Part =
  | { type: 'code'; lang?: string; code: string; open?: boolean }
  | { type: 'text'; text: string };

/** Splits fenced code blocks; an unclosed trailing fence (mid-stream) renders as code. */
function splitFences(src: string): Part[] {
  const parts: Part[] = [];
  const re = /```([\w+.-]*)\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) parts.push({ type: 'text', text: src.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1] || undefined, code: m[2] ?? '' });
    last = m.index + m[0].length;
  }
  const rest = src.slice(last);
  const openIdx = rest.indexOf('```');
  if (openIdx === -1) {
    if (rest) parts.push({ type: 'text', text: rest });
  } else {
    if (openIdx > 0) parts.push({ type: 'text', text: rest.slice(0, openIdx) });
    const afterFence = rest.slice(openIdx + 3);
    const nl = afterFence.indexOf('\n');
    parts.push({
      type: 'code',
      lang: nl === -1 ? undefined : afterFence.slice(0, nl).trim() || undefined,
      code: nl === -1 ? '' : afterFence.slice(nl + 1),
      open: true,
    });
  }
  return parts;
}

/** Wohin ein Link führt: Web-Adressen in den Cortex-Browser, alles andere ist ein Dateipfad fürs Dock. */
export type LinkHandler = (href: string, kind: 'web' | 'file') => void;

const WEB_ICON = <svg class="md-link-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0" /><path d="M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>;
const FILE_ICON = <svg class="md-link-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>;

function link(label: ComponentChildren, href: string, onLink: LinkHandler | undefined, icon: boolean): ComponentChildren {
  const kind = /^https?:\/\//.test(href) ? 'web' : 'file';
  const target = kind === 'file' ? href.replace(/^file:\/\//, '').replace(/#L?\d+(-L?\d+)?$/, '') : href;
  return (
    <a
      class={`md-link ${kind}`}
      href={kind === 'web' ? href : '#'}
      title={target}
      onClick={(e) => {
        if (!onLink) return;
        e.preventDefault();
        onLink(target, kind);
      }}
    >
      {icon && (kind === 'web' ? WEB_ICON : FILE_ICON)}
      {label}
    </a>
  );
}

/** `pfad/datei.py:101` oder `datei.ts` — ein Dateiverweis, kein Code. */
const FILE_REF = /^(?:~\/|\.{0,2}\/)?(?:[\w .@-]+\/)*[\w.@-]+\.[A-Za-z][\w]{0,9}(?::(\d+)(?:-\d+)?)?$/;
const PAGE_ICON = <svg class="md-file-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></svg>;

/**
 * Inline-Code. Ein Dateiverweis wird zur Marke — Dateiname, Zeile, voller Pfad
 * beim Überfahren, Klick öffnet die Datei. Ein Pfad in Code-Schrift liest sich
 * wie ein Terminal, nicht wie ein Verweis.
 */
function inlineCode(code: string, onLink?: LinkHandler): ComponentChildren {
  const ref = FILE_REF.exec(code);
  // Ohne Schrägstrich und ohne Zeile nur bei typischen Dateiendungen: `apidojo/tiktok-scraper` ist kein Pfad, `v1.2` keine Datei.
  const isFile = ref && !/^\d/.test(code) && (code.includes('/') ? /\.[A-Za-z]\w*(:\d+)?/.test(code.split('/').pop()!) : /\.(py|ts|tsx|js|mjs|json|md|sql|db|sh|css|html|yml|yaml|toml|swift|txt|csv)(:\d+)?$/i.test(code));
  if (!ref || !isFile) return <code class="md-inline">{code}</code>;
  const path = code.replace(/:\d+(-\d+)?$/, '');
  const name = path.split('/').pop()!;
  return (
    <a class="md-file-chip" href="#" title={code} onClick={(e) => { e.preventDefault(); onLink?.(path, 'file'); }}>
      {PAGE_ICON}<span>{name}</span>{ref[1] && <span class="md-file-line">Z. {ref[1]}</span>}
    </a>
  );
}

/** Inline: `code`, **bold**, [link](ziel), nackte Adressen. Alles als DOM-Knoten — kein rohes HTML. */
function renderInline(text: string, onLink?: LinkHandler, inLink = false): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(https?:\/\/[^\s)<>\]]+[^\s)<>\].,;:!?'"])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(inLink ? <code class="md-inline">{m[1].slice(1, -1)}</code> : inlineCode(m[1].slice(1, -1), onLink));
    // Fett darf Code und Links enthalten — der Inhalt läuft noch einmal durch.
    else if (m[2]) out.push(<strong>{renderInline(m[2].slice(2, -2), onLink, inLink)}</strong>);
    else if (m[3]) out.push(inLink ? m[4]! : link(renderInline(m[4]!, onLink, true), m[5]!, onLink, true));
    else if (m[6]) out.push(inLink ? m[6] : link(m[6], m[6], onLink, false));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * `| a | b |` → die Zellen, ohne die äußeren Trennstriche.
 *
 * Ein `\|` gehört zum Inhalt, nicht zur Spalte — so maskieren Modelle einen
 * Strich im Text („Chapter 06 | Abschluss“). Wer an jedem Strich teilte,
 * schöbe den Rest der Zeile eine Spalte weiter und verlöre die letzte.
 */
export function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return undefined;
  const cells: string[] = [];
  let cell = '', slashes = 0, delimiters = 0;
  for (let i = 1; i < trimmed.length; i++) {
    const char = trimmed[i]!;
    if (char === '|' && slashes % 2 === 0) {
      cells.push(cell.trim()); cell = ''; delimiters++;
    } else if (char === '|') cell = cell.slice(0, -1) + '|';
    else cell += char;
    slashes = char === '\\' ? slashes + 1 : 0;
  }
  if (!delimiters) return undefined;
  if (cell || !trimmed.endsWith('|') || slashes) cells.push(cell.trim());
  return cells;
}

/**
 * Eine Zelle aus einem einzigen kurzen Token — Zahl, Datum, Adresse, ID — wird
 * nicht umbrochen: „10“ als „1“ über „0“ oder ein Datum am Bindestrich getrennt
 * liest niemand richtig. Ist die Tabelle dann zu breit, scrollt sie.
 */
function unbreakable(cell: string): boolean {
  return cell.length > 0 && cell.length <= 60 && !/\s/.test(cell);
}

/** Die Trennzeile `|---|:--:|` bestimmt zugleich die Ausrichtung je Spalte. */
function tableAlignment(line: string): Array<'left' | 'center' | 'right'> | undefined {
  const cells = tableCells(line);
  if (!cells || cells.length === 0) return undefined;
  const aligns: Array<'left' | 'center' | 'right'> = [];
  for (const cell of cells) {
    if (!/^:?-{1,}:?$/.test(cell)) return undefined;
    aligns.push(cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left');
  }
  return aligns;
}

const LIST_ITEM = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/;

/**
 * Text als Blöcke: Absätze, Listen, Überschriften, Tabellen, Zitate. Ein
 * einzelner Zeilenumbruch bleibt einer — Modelle setzen ihn mit Absicht.
 */
function renderTextBlock(text: string, onLink?: LinkHandler): ComponentChildren[] {
  const out: ComponentChildren[] = [];
  const lines = text.split('\n');
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    const body: ComponentChildren[] = [];
    para.forEach((line, n) => { if (n) body.push(<br />); body.push(...renderInline(line, onLink)); });
    out.push(<p class="md-p">{body}</p>);
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) { flush(); continue; }

    // Eine Tabelle ist erst eine, wenn die Trennzeile da ist. Solange die
    // Antwort noch strömt, bleibt die Kopfzeile deshalb einfacher Text —
    // besser als eine Tabelle, die sich unter dem Lesen umbaut.
    const head = tableCells(line);
    const aligns = head && i + 1 < lines.length ? tableAlignment(lines[i + 1]!) : undefined;
    if (head && aligns) {
      flush();
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const cells = tableCells(lines[j]!);
        if (!cells) break;
        rows.push(cells);
      }
      out.push(
        <div class="md-table-wrap">
          <table class="md-table">
            <thead>
              <tr>
                {head.map((cell, c) => (
                  <th key={c} style={{ textAlign: aligns[c] ?? 'left' }}>{renderInline(cell, onLink)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((cells, r) => (
                <tr key={r}>
                  {head.map((_, c) => (
                    <td key={c} class={unbreakable(cells[c] ?? '') ? 'md-nowrap' : undefined} style={{ textAlign: aligns[c] ?? 'left' }}>{renderInline(cells[c] ?? '', onLink)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      i = j - 1;
      continue;
    }

    const header = /^(#{1,6})\s+(.*)$/.exec(line);
    if (header) { flush(); out.push(<div class={`md-h md-h${Math.min(header[1]!.length, 4)}`}>{renderInline(header[2]!, onLink)}</div>); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push(<hr class="md-hr" />); continue; }
    if (/^\s*>/.test(line)) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]!); i++) quote.push(lines[i]!.replace(/^\s*>\s?/, ''));
      i--;
      out.push(<blockquote class="md-quote">{renderTextBlock(quote.join('\n'), onLink)}</blockquote>);
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const ordered = /\d/.test(item[2]!);
      const base = item[1]!.length;
      const entries: string[][] = [];
      for (; i < lines.length; i++) {
        const current = lines[i]!;
        const match = LIST_ITEM.exec(current);
        if (match && match[1]!.length <= base + 1 && /\d/.test(match[2]!) === ordered) { entries.push([match[3]!]); continue; }
        // Eingerückte Folgezeilen und Unterlisten gehören zum letzten Punkt.
        if (current.trim() && (/^\s{2,}/.test(current) || (match && match[1]!.length > base + 1))) { entries[entries.length - 1]!.push(current.replace(/^\s{2,4}/, '')); continue; }
        break;
      }
      i--;
      const start = ordered ? Number(/\d+/.exec(item[2]!)![0]) : undefined;
      const children = entries.map((entry, n) => (
        <li key={n}>{entry.length === 1 ? renderInline(entry[0]!, onLink) : renderTextBlock(entry.join('\n'), onLink)}</li>
      ));
      out.push(ordered ? <ol class="md-list" start={start}>{children}</ol> : <ul class="md-list">{children}</ul>);
      continue;
    }
    para.push(line);
  }
  flush();
  return out;
}

const KEYWORDS = new Set(
  (
    'const let var function return if else for while class import export from async await new ' +
    'try catch finally throw type interface extends implements static public private readonly ' +
    'def elif lambda pass with as in not and or is None True False null undefined true false ' +
    'fn pub struct impl match enum use mod func package switch case break continue default do ' +
    'void int string bool number float double select go defer chan map range yield print'
  ).split(' '),
);

/** Eine Sprachangabe ist ein Wort. Bei einem Zaun mitten im Satz landet sonst
    der halbe Satz als „Sprache“ im Titel. */
const LANG = /^[\w+#.-]{1,16}$/;

/**
 * Ein Zaun ohne Sprache voller Rahmen- und Pfeilzeichen ist eine Skizze, kein
 * Code: ein Panel-Entwurf, ein Sankey aus `──▶`. Er wird als Bild gezeigt, nicht
 * als Karte, hinter der man ihn erst suchen müsste.
 */
const DIAGRAM_LANG = /^(text|txt|plain|ascii|diagram|diagramm)$/i;
const DIAGRAM_CHARS = /[\u2500-\u259F\u2190-\u21FF\u25A0-\u25FF\u27F5-\u27FF]/;
function isDiagram(lang: string | undefined, body: string): boolean {
  return (!lang || DIAGRAM_LANG.test(lang)) && DIAGRAM_CHARS.test(body);
}

/**
 * Ein Codeblock im Verlauf trägt dieselbe Karte wie die Dateiübersicht.
 *
 * Ausgerollt frisst er den halben Chat, läuft waagerecht hinaus und wird beim
 * Lesen übersprungen. Hier steht nur, *dass* etwas da ist und wie viel —
 * angesehen wird er im Panel rechts, wo Breite und Zeilennummern hingehören.
 * Die Bausteine sind die der Änderungskarte, damit im Verlauf nicht zweierlei
 * Kästen mit derselben Aufgabe nebeneinanderstehen.
 */
export function Markdown({ text, onOpenCode, onLink, widgets, live, reading }: { text: string; onOpenCode?: (code: string, lang?: string) => void; onLink?: LinkHandler; widgets?: WidgetHost; /** Die Antwort läuft noch — ein offener Block kommt also noch. */ live?: boolean; /** Eine Datei zum Lesen: Code steht ausgerollt im Text, nicht als Karte. */ reading?: boolean }) {
  const parts = splitFences(text);
  return (
    <div class="md">
      {parts.map((p, i) => {
        if (p.type !== 'code') return <div class="md-text md-blocks" key={i}>{renderTextBlock(p.text, onLink)}</div>;
        const body = p.code.replace(/\n$/, '');
        const lines = body ? body.split('\n').length : 0;
        const lang = p.lang && LANG.test(p.lang) ? p.lang : undefined;
        const card = (note?: string) => (
          <div class="cx-change-card cx-code-card" key={i}>
            <div class="cx-change-head">
              <span class="cx-change-mark" aria-hidden="true">{'{ }'}</span>
              <span class="cx-change-title">
                <strong>{lang ?? 'Codeblock'}</strong>
                <span class="cx-change-sub">{note ? `${note} · ` : ''}{lines === 1 ? '1 Zeile' : `${lines} Zeilen`}</span>
              </span>
              <CopyButton text={body} label="Kopieren" className="cx-code-copy" icon />
              <button class="cx-change-review" onClick={() => onOpenCode?.(body, lang)} disabled={!onOpenCode}>Ansehen</button>
            </div>
          </div>
        );
        if (isDiagram(p.lang, body)) {
          return <figure class="md-diagram" key={i}><pre>{body}</pre></figure>;
        }
        if (reading) {
          return (
            <div class="md-codeblock" key={i}>
              <div class="md-codeblock-head">
                <span>{lang ?? 'Code'}</span>
                <CopyButton text={body} label="Kopieren" className="md-codeblock-copy" icon />
              </div>
              <pre><code>{body}</code></pre>
            </div>
          );
        }
        if (widgets?.canvas && isCanvasLang(p.lang)) {
          return <CanvasCard key={i} code={body} streaming={!!p.open && !!live} host={widgets.canvas} fallback={(reason) => card(reason)} />;
        }
        if (widgets && isWidgetLang(p.lang)) {
          return <Widget key={i} code={body} streaming={!!p.open && !!live} host={{ ...widgets, stateKey: widgets.stateKey ? `${widgets.stateKey}/${i}` : undefined }} fallback={(reason) => card(reason)} />;
        }
        if (!p.open && !isWidgetLang(p.lang) && !isCanvasLang(p.lang) && lines <= 8) {
          return <div class="md-codeblock" key={i}><div class="md-codeblock-head"><span>{lang ?? 'Code'}</span><CopyButton text={body} label="Kopieren" icon />{onOpenCode && <button onClick={() => onOpenCode(body, lang)}>Ansehen</button>}</div><pre><code>{body}</code></pre></div>;
        }
        return card();
      })}
    </div>
  );
}
