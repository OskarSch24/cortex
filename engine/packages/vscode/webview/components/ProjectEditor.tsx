import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview, ProjectDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

/**
 * Projekt bearbeiten.
 *
 * Der Name ist frei wählbar, die Quellordner sind es nicht: sie kommen aus dem
 * Dateiauswahldialog des Systems, nie aus einem Textfeld. Ein getippter Pfad
 * wäre eine Behauptung — ein ausgewählter Ordner existiert.
 *
 * „Lokales Projekt entfernen“ nimmt den Eintrag aus der Leiste. Es fasst keine
 * Datei auf der Platte an, deshalb steht hier auch keine Warnung, die das
 * Gegenteil nahelegt.
 */
export function ProjectEditor({ project, onClose, onSaved }: { project: ProjectDto; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [folders, setFolders] = useState<string[]>(project.folders?.length ? project.folders : [project.path]);
  const [confirm, setConfirm] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.select(); }, []);
  useEffect(() => {
    const listen = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind === 'pickedFolder') setFolders(prev => prev.includes(msg.path) ? prev : [...prev, msg.path]);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [onClose]);

  const save = () => {
    const clean = name.trim() || project.name;
    vscode.postMessage({ kind: 'saveProject', path: project.path, name: clean, folders });
    onSaved();
  };
  // Der Kennpfad trägt jeden bestehenden Chat. Fällt er aus der Liste, hätte das
  // Projekt seine Aufgaben verloren — deshalb bleibt er der letzte Ordner.
  const removable = (folder: string) => folders.length > 1 && folder !== project.path;

  return <div class="cx-modal-backdrop" onClick={onClose}>
    <section class="cx-project-dialog" role="dialog" aria-modal="true" aria-label="Projekt bearbeiten" onClick={e => e.stopPropagation()}>
      <header>
        <h2>Projekt bearbeiten</h2>
        <button class="cx-icon" aria-label="Schließen" onClick={onClose}><Glyph name="close" size={16} /></button>
      </header>

      <div class="cx-project-name">
        <Glyph name="folder" size={15} />
        <input ref={field} aria-label="Projektname" value={name} onInput={e => setName(e.currentTarget.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </div>

      <p class="cx-project-legend">Quellordner</p>
      <div class="cx-project-folders">
        {folders.map(folder => <div key={folder} class="cx-project-folder">
          <Glyph name="folder" size={14} />
          <span title={folder}>{short(folder)}</span>
          {removable(folder)
            ? <button class="cx-icon" aria-label={`Ordner entfernen: ${folder}`} onClick={() => setFolders(prev => prev.filter(f => f !== folder))}><Glyph name="close" size={14} /></button>
            : <span class="cx-project-anchor" title="Trägt die bestehenden Aufgaben dieses Projekts">Kennordner</span>}
        </div>)}
        <button class="cx-project-add-folder" onClick={() => vscode.postMessage({ kind: 'pickProjectFolder' })}>
          <Glyph name="folderPlus" size={14} />Ordner hinzufügen
        </button>
      </div>

      <footer>
        {confirm
          ? <span class="cx-project-confirm">Aus der Leiste entfernen?<button class="cx-danger" onClick={() => { vscode.postMessage({ kind: 'removeProject', path: project.path }); onSaved(); }}>Entfernen</button><button class="cx-ghost" onClick={() => setConfirm(false)}>Zurück</button></span>
          : <button class="cx-danger" onClick={() => setConfirm(true)}>Lokales Projekt entfernen</button>}
        <span class="cx-project-spacer" />
        <button class="cx-ghost" onClick={onClose}>Abbrechen</button>
        <button class="cx-primary" onClick={save}>Speichern</button>
      </footer>
    </section>
  </div>;
}

function short(path: string) {
  const home = /^\/Users\/[^/]+/.exec(path);
  return home ? '~' + path.slice(home[0].length) : path;
}
