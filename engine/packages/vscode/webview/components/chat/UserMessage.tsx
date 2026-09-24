import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { appSetting } from '../../settings/store.js';
import { vscode } from '../../vscodeApi.js';
import { submitsInput } from '../composerInput.js';
import { CopyButton } from '../CopyButton.js';
import { fileName } from '../steps.js';
import { Icon } from './Icon.js';
import { IMAGE, type ChatActions } from './steps.js';
import { formatStamp } from './time.js';

/* ── Deine Nachricht ─────────────────────────────────────────────────── */

/** Ab so vielen Zeilen wird deine Nachricht im Verlauf eingeklappt. */
const USER_CLAMP_LINES = 17;

/**
 * Deine Nachricht als Blase rechts. Lange Nachrichten bleiben klein — nach
 * 17 Zeilen blendet der Text aus, darunter „Mehr anzeigen“. Zeit und Kopieren
 * erscheinen erst, wenn der Zeiger auf der Nachricht liegt.
 */
/** Vorschaubilder angehängter Bilder, geteilt über alle Nachrichten. */
const thumbCache = new Map<string, string | null>();
const thumbWaiters = new Set<() => void>();
let thumbListening = false;

function useThumbs(paths: string[]): Record<string, string | null> {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!thumbListening) {
      thumbListening = true;
      window.addEventListener('message', (event) => {
        const msg = event.data as { kind?: string; path?: string; src?: string };
        if (msg?.kind !== 'attachmentPreview' || !msg.path) return;
        thumbCache.set(msg.path, msg.src ?? null);
        thumbWaiters.forEach((wake) => wake());
      });
    }
    const wake = () => rerender((n) => n + 1);
    thumbWaiters.add(wake);
    for (const path of paths) {
      if (!IMAGE.test(path) || thumbCache.has(path)) continue;
      thumbCache.set(path, null);
      vscode.postMessage({ kind: 'attachmentPreview', path });
    }
    return () => { thumbWaiters.delete(wake); };
  }, [paths.join('\n')]);
  return Object.fromEntries(paths.map((path) => [path, thumbCache.get(path) ?? null]));
}

/** Trennt den angehängten Block „Attached files:“ vom eigentlichen Text. */
function splitAttachedFiles(text: string): { text: string; paths: string[] } {
  const match = /\n*Attached files:\n((?:- .*(?:\n|$))+)\s*$/.exec(text);
  if (!match) return { text, paths: [] };
  return { text: text.slice(0, match.index), paths: match[1]!.split('\n').filter(Boolean).map((line) => line.slice(2).trim()) };
}

/**
 * Was sich mit einer eigenen Nachricht tun lässt. Alles davon kappt den Chat
 * vor ihr — auch den Kontext des Modells —, deshalb fehlt es, solange ein
 * Auftrag läuft.
 */
export interface UserMessageActions {
  /** Mit neuem Text neu senden; die Nachricht und alles danach fallen weg. */
  onEdit?: (text: string) => void;
  /** Hierher zurück: der Text liegt wieder im Eingabefeld. */
  onRewind?: () => void;
  /** Ein neuer Chat im Projekt mit dem Verlauf davor. */
  onFork?: () => void;
}

export function UserMessage({ text: rawText, at, attachments: given, actions, anchor, image, edit }: { text: string; at?: number; attachments?: string[]; actions: ChatActions; anchor?: string; image?: import('../../../src/panel/imageOptions.js').ImageOptions; edit?: UserMessageActions }) {
  const split = splitAttachedFiles(rawText);
  const text = split.text;
  const keepWhole = /(^|\n)\s*(```|~~~)/.test(text);
  const attachments = given?.length ? given : split.paths;
  const thumbs = useThumbs(attachments);
  const body = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string>();
  const editor = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = editor.current;
    if (draft === undefined || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 23 * 16 + 4)}px`;
  }, [draft]);
  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [draft !== undefined]);
  const submitEdit = () => {
    const next = draft?.trim();
    if (!next) return;
    setDraft(undefined);
    if (next !== text.trim()) edit?.onEdit?.(next);
  };
  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 2 || (expanded && el.scrollHeight > lineHeight(el) * USER_CLAMP_LINES + 2));
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);
  return (
    <div class="cx-c-user" data-anchor={anchor}>
      {image && (
        <div class="cx-c-user-image" title="Bildauftrag">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.8" /><path d="m21 15-4.5-4.5L6 21" /></svg>
          {['Bild', image.ratio, image.count > 1 ? `${image.count} Bilder` : undefined].filter(Boolean).join(' · ')}
        </div>
      )}
      {attachments && attachments.length > 0 && (
        <div class="cx-c-user-files">
          {attachments.map((path) => thumbs[path] ? (
            <button key={path} type="button" class="cx-c-user-thumb" title={path} onClick={() => actions.onOpenPath?.(path)}>
              <img src={thumbs[path]!} alt={fileName(path)} />
            </button>
          ) : (
            <button key={path} type="button" class="cx-c-user-file" title={path} onClick={() => actions.onOpenPath?.(path)}>
              <Icon name={IMAGE.test(path) ? 'images' : 'text'} size={14} />{fileName(path)}
            </button>
          ))}
        </div>
      )}
      {draft !== undefined ? (
        <div class="cx-c-bubble cx-c-bubble-edit">
          <textarea
            ref={editor}
            class="cx-c-edit-input"
            value={draft}
            rows={1}
            aria-label="Nachricht bearbeiten"
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); setDraft(undefined); }
              else if (submitsInput(e, appSetting<string>('composer.senden', 'enter'))) { e.preventDefault(); submitEdit(); }
            }}
          />
          <div class="cx-c-edit-acts">
            <button type="button" class="cx-c-btn" onClick={() => setDraft(undefined)}>Abbrechen</button>
            <button type="button" class="cx-c-btn cx-c-btn-primary" disabled={!draft.trim() || draft.trim() === text.trim()} onClick={submitEdit}>Senden</button>
          </div>
        </div>
      ) : (
        <div class={`cx-c-bubble ${!keepWhole && overflows && !expanded ? 'clamped' : ''}`}>
          <div ref={body} class={`cx-c-bubble-text ${expanded || keepWhole ? '' : 'clamp'}`}>{text}</div>
          {!keepWhole && overflows && !expanded && <div class="cx-c-bubble-more">…</div>}
          {!keepWhole && overflows && (
            <button type="button" class="cx-c-more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? 'Weniger anzeigen' : 'Mehr anzeigen'}<Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={13} />
            </button>
          )}
        </div>
      )}
      {draft === undefined && (
        <div class="cx-c-user-foot">
          {at && <span>{formatStamp(at)}</span>}
          {edit?.onRewind && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Hierher zurückgehen — Nachricht und alles danach entfernen, Kontext zurücksetzen" aria-label="Zu dieser Nachricht zurückgehen" onClick={edit.onRewind}>
              <Icon name="rewind" size={14} />
            </button>
          )}
          {edit?.onFork && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Abzweigen — neuer Chat im Projekt mit dem Verlauf bis hierher" aria-label="Ab hier abzweigen" onClick={edit.onFork}>
              <Icon name="branch" size={14} />
            </button>
          )}
          {edit?.onEdit && !image && (
            <button type="button" class="copy-btn icon cx-c-user-act" title="Bearbeiten und neu senden" aria-label="Nachricht bearbeiten" onClick={() => setDraft(text)}>
              <Icon name="pencil" size={14} />
            </button>
          )}
          <CopyButton icon text={text} label="Nachricht kopieren" className="cx-c-copy" />
        </div>
      )}
    </div>
  );
}

function lineHeight(el: HTMLElement): number {
  return parseFloat(getComputedStyle(el).lineHeight) || 23;
}

/** Die Zeile über einer Nachricht, die nach einer Pause kommt. */
export function DateDivider({ at }: { at: number }) {
  return <div class="cx-c-date">{formatStamp(at)}</div>;
}
