import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProjectDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { AddFolderButton, FolderRow, ProjectDialog, ProjectNameField, RemoveFolderButton, useEscapeClose, useFolderPicks } from './projectDialog.js';

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
  const [folders, setFolders] = useFolderPicks(() => (project.folders?.length ? project.folders : [project.path]));
  const [confirm, setConfirm] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.select(); }, []);
  useEscapeClose(onClose);

  const save = () => {
    const clean = name.trim() || project.name;
    vscode.postMessage({ kind: 'saveProject', path: project.path, name: clean, folders });
    onSaved();
  };
  // Der Kennpfad trägt jeden bestehenden Chat. Fällt er aus der Liste, hätte das
  // Projekt seine Aufgaben verloren — deshalb bleibt er der letzte Ordner.
  const removable = (folder: string) => folders.length > 1 && folder !== project.path;

  return <ProjectDialog title="Projekt bearbeiten" onClose={onClose}>
    <ProjectNameField field={field} value={name} onInput={setName} onEnter={save} />

    <p class="cx-project-legend">Quellordner</p>
    <div class="cx-project-folders">
      {folders.map(folder => <FolderRow key={folder} folder={folder}>
        {removable(folder)
          ? <RemoveFolderButton folder={folder} onRemove={() => setFolders(prev => prev.filter(f => f !== folder))} />
          : <span class="cx-project-anchor" title="Trägt die bestehenden Aufgaben dieses Projekts">Kennordner</span>}
      </FolderRow>)}
      <AddFolderButton />
    </div>

    <footer>
      {confirm
        ? <span class="cx-project-confirm">Aus der Leiste entfernen?<button class="cx-danger" onClick={() => { vscode.postMessage({ kind: 'removeProject', path: project.path }); onSaved(); }}>Entfernen</button><button class="cx-ghost" onClick={() => setConfirm(false)}>Zurück</button></span>
        : <button class="cx-danger" onClick={() => setConfirm(true)}>Lokales Projekt entfernen</button>}
      <span class="cx-project-spacer" />
      <button class="cx-ghost" onClick={onClose}>Abbrechen</button>
      <button class="cx-primary" onClick={save}>Speichern</button>
    </footer>
  </ProjectDialog>;
}
