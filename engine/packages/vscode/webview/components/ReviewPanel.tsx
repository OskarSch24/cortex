import { useEffect, useState } from 'preact/hooks';
import type { FileDiffDto, HostToWebview } from '../../src/panel/protocol.js';
import type { TouchedFile } from '../../src/panel/transcript.js';
import { vscode } from '../vscodeApi.js';
import { Counts, PathLabel } from './ChangeCard.js';
import { Glyph } from './CortexIcons.js';

/**
 * Die Prüfansicht: hier steht, was die Karte im Verlauf nur zusammenfasst.
 *
 * Jede Datei ist eine Kopfzeile mit ihren Zahlen; aufgeklappt zeigt sie den
 * Diff mit den Zeilennummern der *neuen* Fassung. Entfernte Zeilen haben keine
 * Nummer — sie stehen dort nicht mehr, und eine erfundene Nummer wäre eine
 * Behauptung über eine Datei, die es so nicht gibt.
 *
 * Die erste Datei steht offen. Wer prüft, will lesen, nicht erst klicken.
 */
export function ReviewPanel({ touched: files0, code, onClose, onBack }: {
  touched: TouchedFile[];
  /** Ein aufgeschlagener Codeblock aus dem Verlauf — er hat Vorrang vor der Dateiliste. */
  code?: { text: string; lang?: string };
  onClose: () => void;
  onBack?: () => void;
}) {
  const [files, setFiles] = useState<FileDiffDto[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string[]>([]);
  const [opened, setOpened] = useState(false);
  /** Inhalte gelesener Dateien — geholt, sobald eine aufgeklappt wird. */
  const [bodies, setBodies] = useState<Record<string, { text?: string; truncated?: boolean; error?: string }>>({});
  const mode = new Map(files0.map(f => [f.path, f.mode]));

  useEffect(() => {
    const listen = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind === 'fileBody') {
        setBodies(prev => ({ ...prev, [msg.path]: { text: msg.text, truncated: msg.truncated, error: msg.error } }));
        return;
      }
      if (msg?.kind !== 'diff') return;
      // Nur die Dateien dieses Chats, in seiner Reihenfolge. Ein Projekt kann
      // daneben offene Änderungen aus anderer Quelle haben — die gehören nicht
      // in die Prüfung einer Antwort.
      const byPath = new Map(msg.files.map(f => [f.path, f]));
      const mine: FileDiffDto[] = files0.length
        ? files0.map(f => byPath.get(f.path) ?? { path: f.path, added: 0, removed: 0 })
        : msg.files;
      setFiles(mine);
      setError(msg.error);
      setOpen(prev => {
        if (opened) return prev;
        const first = mine.slice(0, 1).map(f => f.path);
        for (const path of first) if (mode.get(path) !== 'write') vscode.postMessage({ kind: 'readFileBody', path });
        return first;
      });
    };
    window.addEventListener('message', listen);
    vscode.postMessage({ kind: 'getDiff' });
    return () => window.removeEventListener('message', listen);
  }, [opened, files0.map(f => f.path).join('\n')]);

  const toggle = (path: string) => {
    setOpened(true);
    setOpen(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      // Erst beim Aufklappen lesen: sonst zöge das Panel beim Öffnen jede
      // Datei des Chats durch die Brücke, nur damit sie zugeklappt dasteht.
      if (next.includes(path) && mode.get(path) !== 'write' && !bodies[path]) {
        vscode.postMessage({ kind: 'readFileBody', path });
      }
      return next;
    });
  };
  const added = files?.reduce((n, f) => n + f.added, 0) ?? 0;
  const removed = files?.reduce((n, f) => n + f.removed, 0) ?? 0;

  if (code) return <aside class="cx-review" aria-label="Codeblock">
    <div class="cx-review-head">
      {onBack && <button class="cx-icon" aria-label="Zurück zur Übersicht" title="Zurück" onClick={onBack}><Glyph name="back" size={14} /></button>}
      <span class="cx-review-tab">{code.lang || 'Code'}</span>
      <span class="cx-change-binary">{code.text.split('\n').length} Zeilen</span>
      <button class="cx-icon" aria-label="Schließen" onClick={onClose}><Glyph name="close" size={15} /></button>
    </div>
    <div class="cx-review-body">
      <div class="cx-diff">
        <div class="cx-diff-hunk">
          {code.text.split('\n').map((text, i) => <div class="cx-diff-line ctx" key={i}>
            <span class="cx-diff-no">{i + 1}</span>
            <span class="cx-diff-sign" />
            <span class="cx-diff-text">{text || ' '}</span>
          </div>)}
        </div>
      </div>
    </div>
  </aside>;

  return <aside class="cx-review" aria-label="Änderungen prüfen">
    <div class="cx-review-head">
      <span class="cx-review-tab"><Glyph name="diff" size={13} />Prüfung</span>
      {(added || removed) ? <Counts added={added} removed={removed} /> : null}
      <button class="cx-icon" aria-label="Aktualisieren" title="Aktualisieren" onClick={() => vscode.postMessage({ kind: 'getDiff' })}><Glyph name="refresh" size={14} /></button>
      <button class="cx-icon" aria-label="Prüfung schließen" onClick={onClose}><Glyph name="close" size={15} /></button>
    </div>

    <div class="cx-review-body">
      {error && <p class="cx-review-error" role="alert">{error}</p>}
      {files && !files.length && !error && <p class="cx-review-empty">Keine offenen Änderungen im Projekt.</p>}
      {!files && !error && <p class="cx-review-empty">Änderungen werden gelesen …</p>}

      {files?.map(file => {
        const isOpen = open.includes(file.path);
        return <section class={`cx-review-file ${isOpen ? 'open' : ''}`} key={file.path}>
          <div class="cx-review-file-head">
            <button class="cx-review-file-open" aria-expanded={isOpen} onClick={() => toggle(file.path)}>
              <span class={isOpen ? 'cx-review-chevron open' : 'cx-review-chevron'}><Glyph name="chevron" size={11} /></span>
              <span class="cx-review-path"><PathLabel path={file.path} /></span>
              {file.binary ? <span class="cx-change-binary">binär</span>
                : (file.added || file.removed) ? <Counts added={file.added} removed={file.removed} />
                : <span class="cx-change-binary">{mode.get(file.path) === 'write' ? 'bearbeitet' : 'gelesen'}</span>}
            </button>
            <button class="cx-icon cx-review-jump" aria-label={`${file.path} im Editor öffnen`} title="Im Editor öffnen"
              onClick={() => vscode.postMessage({ kind: 'openDiffFile', path: file.path })}><Glyph name="arrow" size={13} /></button>
          </div>

          {isOpen && (mode.get(file.path) === 'read'
            ? <FileBody body={bodies[file.path]} />
            : file.hunks?.length
            ? <div class="cx-diff">
                {file.hunks.map((hunk, h) => <div class="cx-diff-hunk" key={h}>
                  {hunk.lines.map((line, i) => <div class={`cx-diff-line ${line.kind}`} key={i}>
                    <span class="cx-diff-no">{line.line ?? ''}</span>
                    <span class="cx-diff-sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}</span>
                    <span class="cx-diff-text">{line.text || ' '}</span>
                  </div>)}
                </div>)}
              </div>
            : <p class="cx-review-empty">{file.binary
                ? 'Binäre Datei — kein Zeilenvergleich.'
                : 'Kein Zeilenvergleich: das Projekt ist kein Git-Repository. Der Pfeil rechts öffnet die Datei.'}</p>)}
        </section>;
      })}
    </div>
  </aside>;
}

/**
 * Der Inhalt einer gelesenen Datei — dieselbe Zeilenoptik wie ein Diff, nur
 * ohne Vorzeichen und ohne Einfärbung. Was nicht geändert wurde, soll auch
 * nicht so aussehen.
 */
function FileBody({ body }: { body?: { text?: string; truncated?: boolean; error?: string } }) {
  if (!body) return <p class="cx-review-empty">Wird gelesen …</p>;
  if (body.error) return <p class="cx-review-error">{body.error}</p>;
  const lines = (body.text ?? '').split('\n');
  return <div class="cx-diff">
    <div class="cx-diff-hunk">
      {lines.map((text, i) => <div class="cx-diff-line ctx" key={i}>
        <span class="cx-diff-no">{i + 1}</span>
        <span class="cx-diff-sign" />
        <span class="cx-diff-text">{text || ' '}</span>
      </div>)}
    </div>
    {body.truncated && <p class="cx-review-empty">Nach 400 Zeilen abgeschnitten — der Pfeil rechts öffnet die ganze Datei.</p>}
  </div>;
}
