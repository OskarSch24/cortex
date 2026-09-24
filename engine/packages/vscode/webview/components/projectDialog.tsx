import type { ComponentChildren, RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { tildePath } from '../format/path.js';
import { useHostMessage } from '../hooks/useHostMessage.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

/**
 * Was „Projekt erstellen“ und „Projekt bearbeiten“ teilen: der Rahmen, das
 * Namensfeld, die Ordnerliste und die Ordner aus dem Dateidialog.
 */

/** Die Quellordner; ein im Dateidialog gewählter Ordner kommt dazu, doppelte nicht. */
export function useFolderPicks(initial: () => string[]) {
  const [folders, setFolders] = useState<string[]>(initial);
  useHostMessage('pickedFolder', msg => setFolders(prev => prev.includes(msg.path) ? prev : [...prev, msg.path]));
  return [folders, setFolders] as const;
}

export const pickProjectFolder = () => vscode.postMessage({ kind: 'pickProjectFolder' });

/** Escape schließt den Dialog, bevor ein anderer Empfänger die Taste sieht. */
export function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    const keys = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [onClose]);
}

export function ProjectDialog({ title, class: klass, onClose, children }: { title: string; class?: string; onClose: () => void; children: ComponentChildren }) {
  return <div class="cx-modal-backdrop" onClick={onClose}>
    <section class={klass ? `cx-project-dialog ${klass}` : 'cx-project-dialog'} role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}>
      <header>
        <h2>{title}</h2>
        <button class="cx-icon" aria-label="Schließen" onClick={onClose}><Glyph name="close" size={16} /></button>
      </header>
      {children}
    </section>
  </div>;
}

export function ProjectNameField({ field, value, placeholder, onInput, onEnter }: {
  field: RefObject<HTMLInputElement>;
  value: string;
  placeholder?: string;
  onInput: (value: string) => void;
  onEnter: () => void;
}) {
  return <div class="cx-project-name">
    <Glyph name="folder" size={15} />
    <input
      ref={field}
      aria-label="Projektname"
      placeholder={placeholder}
      value={value}
      onInput={event => onInput(event.currentTarget.value)}
      onKeyDown={event => { if (event.key === 'Enter') onEnter(); }}
    />
  </div>;
}

/** Eine Zeile der Ordnerliste; rechts steht, was sich mit dem Ordner tun lässt. */
export function FolderRow({ folder, children }: { folder: string; children: ComponentChildren }) {
  return <div class="cx-project-folder">
    <Glyph name="folder" size={14} />
    <span title={folder}>{tildePath(folder)}</span>
    {children}
  </div>;
}

export function RemoveFolderButton({ folder, onRemove }: { folder: string; onRemove: () => void }) {
  return <button class="cx-icon" aria-label={`Ordner entfernen: ${folder}`} onClick={onRemove}><Glyph name="close" size={14} /></button>;
}

export function AddFolderButton() {
  return <button class="cx-project-add-folder" onClick={pickProjectFolder}>
    <Glyph name="folderPlus" size={14} />Ordner hinzufügen
  </button>;
}
