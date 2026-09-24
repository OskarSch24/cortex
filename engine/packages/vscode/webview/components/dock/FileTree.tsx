import { useState } from 'preact/hooks';
import type { WorkspaceDto } from '../../../src/panel/protocol.js';
import { vscode } from '../../vscodeApi.js';
import { Glyph } from '../CortexIcons.js';
import { PaneResizeHandle } from '../PaneResizeHandle.js';

export function FileTree({ workspace, activePath, onOpen, width, maxWidth, onWidth }: {
  workspace?: WorkspaceDto;
  activePath?: string;
  onOpen: (path: string, newTab: boolean) => void;
  width: number; maxWidth: number; onWidth: (width: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const files = workspace?.files.filter(file => file.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const up = workspace?.directory
    ? workspace.directory.split('/').slice(0, -1).join('/')
    : undefined;
  return <div class="cx-dock-tree" style={{ width, minWidth: width }}>
    <PaneResizeHandle label="Dateibaumbreite" value={width} min={140} max={maxWidth} initial={230} onChange={onWidth} />
    <div class="cx-file-search">
      <Glyph name="search" size={13} />
      <input aria-label="Dateien filtern" placeholder="Dateien filtern …" value={filter} onInput={e => setFilter(e.currentTarget.value)} />
    </div>
    <div class="cx-file-list">
      {workspace?.error && <p class="cx-error" role="alert">{workspace.error}</p>}
      {!workspace?.root && <div class="cx-small-empty">
        Füge ein Projekt hinzu, um mit seinen Dateien zu arbeiten.
        <button class="cx-text-btn" onClick={() => vscode.postMessage({ kind: 'addProject' })}>Projekt hinzufügen <Glyph name="plus" size={12} /></button>
      </div>}
      {up !== undefined && <button class="cx-file-row cx-parent" onClick={() => vscode.postMessage({ kind: 'inspectWorkspace', directory: up })}>
        <Glyph name="back" size={13} /><span>{workspace!.directory}</span>
      </button>}
      {files?.map(file => <button
        key={file.path}
        class={`cx-file-row ${file.path === activePath ? 'selected' : ''}`}
        title={file.path}
        // Mit gedrückter ⌘-Taste daneben statt darin: derselbe Unterschied wie
        // zwischen Baum und Brotkrume, nur ohne Umweg.
        onClick={event => {
          setFilter('');
          if (file.directory) vscode.postMessage({ kind: 'inspectWorkspace', directory: file.path });
          else onOpen(file.path, event.metaKey || event.ctrlKey);
        }}
      >
        <Glyph name={file.directory ? 'folder' : 'file'} size={14} />
        <span>{file.name}</span>
        {file.directory && <Glyph name="chevron" size={11} />}
      </button>)}
    </div>
  </div>;
}
