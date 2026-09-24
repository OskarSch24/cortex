import { useEffect, useRef, useState } from 'preact/hooks';
import type { ProjectDto } from '../../src/panel/protocol.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { vscode } from '../vscodeApi.js';
import { AddFolderButton, FolderRow, ProjectDialog, ProjectNameField, RemoveFolderButton, pickProjectFolder, useEscapeClose, useFolderPicks } from './projectDialog.js';
import { Glyph } from './CortexIcons.js';

/**
 * Das Projekt einer Aufgabe, direkt über der Eingabe.
 *
 * Die Liste geht dort auf, wo der Name steht — kein Systemdialog, der das
 * Fenster verlässt und die Frage aus dem Blick nimmt. Sie zeigt die Projekte
 * so, wie die Leiste sie führt: fehlende ausgegraut, das laufende mit Haken.
 *
 * Zwei Einträge stehen unter dem Strich, weil sie die Liste verlassen statt in
 * ihr auszuwählen: ein neues Projekt anlegen und ganz ohne Projekt arbeiten.
 *
 * Während eine Aufgabe läuft, wird nicht umgehängt. Der Knopf ist dann still —
 * der Host lehnt es ohnehin ab, und ein Menü, das nichts bewirkt, wäre eine
 * Zusage, die niemand einhält.
 */
export function ProjectPicker({ projects, activePath, disabled }: {
  projects: ProjectDto[];
  activePath?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const root = useDismissiblePopup<HTMLDivElement>(open, () => setOpen(false));
  const field = useRef<HTMLInputElement>(null);

  const current = projects.find(project => project.path === activePath);
  const name = current?.name ?? activePath?.split('/').pop();

  // Jedes Öffnen fängt bei der ganzen Liste an: der Suchbegriff von vorhin
  // würde sie stumm beschneiden, ohne dass jemand danach gefragt hat.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    requestAnimationFrame(() => field.current?.focus());
  }, [open]);

  const needle = query.trim().toLowerCase();
  const hits = needle
    ? projects.filter(project => project.name.toLowerCase().includes(needle) || project.path.toLowerCase().includes(needle))
    : projects;

  const choose = (path?: string) => {
    setOpen(false);
    if (projects.some(p => p.path === path && p.missing)) { vscode.postMessage({ kind: 'relinkProject', path: path! }); return; }
    if (path === activePath) return;
    vscode.postMessage({ kind: 'setConversationProject', path });
  };

  return <div ref={root} class="cx-project-picker">
    <button
      class="cx-project-chip"
      aria-haspopup="listbox"
      aria-expanded={open}
      disabled={disabled}
      title={current?.path ?? activePath}
      onClick={() => setOpen(value => !value)}
    >
      <Glyph name="folder" size={16} />
      <span class={name ? undefined : 'cx-project-chip-empty'}>{name ?? 'Projekt auswählen'}</span>
    </button>

    {open && <div class="cx-project-pop">
      <div class="cx-project-search">
        <Glyph name="search" size={16} />
        <input
          ref={field}
          aria-label="Projekte suchen"
          placeholder="Projekte suchen"
          value={query}
          onInput={event => setQuery(event.currentTarget.value)}
        />
      </div>

      <div class="cx-project-list" role="listbox" aria-label="Projekte">
        {hits.map(project => <button
          key={project.path}
          role="option"
          aria-selected={project.path === activePath}
          class={`cx-project-row ${project.missing ? 'missing' : ''}`}
          title={project.path}
          onClick={() => choose(project.path)}
        >
          <Glyph name="folder" size={16} />
          <span>{project.name}</span>
          {project.path === activePath && <Glyph name="check" size={16} />}
        </button>)}
        {!hits.length && <p class="cx-project-none">Kein passendes Projekt.</p>}
      </div>

      <div class="cx-project-sep" />
      <button class="cx-project-row cx-project-act" onClick={() => { setOpen(false); setCreating(true); }}>
        <Glyph name="plus" size={16} /><span>Neues Projekt</span>
      </button>
      <button class="cx-project-row cx-project-act" onClick={() => choose(undefined)}>
        <Glyph name="close" size={16} /><span>Aufgaben ohne Projekt starten</span>
      </button>
    </div>}

    {creating && <ProjectCreate onClose={() => setCreating(false)} />}
  </div>;
}

/**
 * Projekt erstellen.
 *
 * Wie im Editor gilt auch hier: der Name ist frei, die Ordner sind es nicht —
 * sie kommen aus dem Dateidialog. Solange kein Ordner gewählt ist, bleibt der
 * Knopf aus: ein Cortex-Projekt ist sein Kennordner, ohne ihn gäbe es nichts
 * anzulegen.
 */
function ProjectCreate({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [folders, setFolders] = useFolderPicks(() => []);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => { field.current?.focus(); }, []);
  useEscapeClose(onClose);

  const create = () => {
    if (!folders.length) return;
    vscode.postMessage({ kind: 'createProject', name: name.trim(), folders });
    onClose();
  };

  return <ProjectDialog title="Projekt erstellen" class="cx-project-new" onClose={onClose}>
    <ProjectNameField field={field} value={name} placeholder="Projektname" onInput={setName} onEnter={create} />

    <p class="cx-project-legend">Quellordner</p>
    {folders.length === 0
      ? <button class="cx-project-drop" onClick={pickProjectFolder}>
          <Glyph name="folderPlus" size={18} />
          <span>Füge Ordner hinzu, die Cortex lesen und bearbeiten kann</span>
        </button>
      : <div class="cx-project-folders">
          {folders.map(folder => <FolderRow key={folder} folder={folder}>
            <RemoveFolderButton folder={folder} onRemove={() => setFolders(prev => prev.filter(f => f !== folder))} />
          </FolderRow>)}
          <AddFolderButton />
        </div>}

    <footer>
      <span class="cx-project-spacer" />
      <button class="cx-ghost" onClick={onClose}>Abbrechen</button>
      <button class="cx-primary" disabled={!folders.length} onClick={create}>Projekt erstellen</button>
    </footer>
  </ProjectDialog>;
}
