import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorkspaceDto } from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';

/**
 * Der Weg zur Datei, und zugleich der Weg zurück: ein Ordnerstück klappt seinen
 * Inhalt auf. Was darin gewählt wird, öffnet daneben statt darin — sonst wäre
 * das Nachschlagen in einem Ordner ein Verlust des gerade Gelesenen.
 */
export function Crumbs({ projectName, path, workspace, onOpen }: {
  projectName: string;
  path: string;
  workspace?: WorkspaceDto;
  onOpen: (path: string) => void;
}) {
  const [openAt, setOpenAt] = useState<string>();
  const parts = path.split('/');
  const folders = parts.slice(0, -1);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openAt === undefined) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpenAt(undefined);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [openAt]);

  const open = (dir: string) => {
    setOpenAt(dir);
    vscode.postMessage({ kind: 'inspectWorkspace', directory: dir });
  };
  const crumb = (label: string, dir: string) => <span class="cx-crumb" key={dir || '/'}>
    <button onClick={() => (openAt === dir ? setOpenAt(undefined) : open(dir))} aria-expanded={openAt === dir} aria-haspopup="menu">{label}</button>
    <Glyph name="chevron" size={10} />
    {openAt === dir && <div class="cx-crumb-menu" role="menu">
      {workspace?.directory !== dir
        ? <p>wird gelesen …</p>
        : workspace.files.map(file => <button
            key={file.path}
            role="menuitem"
            onClick={() => {
              setOpenAt(undefined);
              if (file.directory) open(file.path); else onOpen(file.path);
            }}
          >
            <Glyph name={file.directory ? 'folder' : 'file'} size={13} />
            <span>{file.name}</span>
          </button>)}
      {workspace?.directory === dir && !workspace.files.length && <p>Der Ordner ist leer.</p>}
    </div>}
  </span>;

  return <div class="cx-dock-crumbs" ref={root}>
    {crumb(projectName, '')}
    {folders.map((name, i) => crumb(name, folders.slice(0, i + 1).join('/')))}
    <strong>{parts[parts.length - 1]}</strong>
  </div>;
}
