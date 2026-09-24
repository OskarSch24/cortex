import type { WorkspaceDto } from '../../../src/panel/protocol.js';
import { Glyph } from '../CortexIcons.js';

export function Changes({ workspace, onOpen }: { workspace?: WorkspaceDto; onOpen: (path: string) => void }) {
  if (!workspace?.root) return <div class="cx-dock-empty"><Glyph name="diff" size={26} /><strong>Kein Projekt</strong><span>Ohne Projektordner gibt es nichts zu vergleichen.</span></div>;
  if (!workspace.changes.length) return <div class="cx-dock-empty"><Glyph name="check" size={26} /><strong>Keine offenen Änderungen</strong><span>Änderungen im Git-Projekt erscheinen hier.</span></div>;
  return <div class="cx-file-list">
    {workspace.changes.map(file => <button key={file.path} class="cx-file-row" title={file.path} onClick={() => onOpen(file.path)}>
      <Glyph name="file" size={14} />
      <span>{file.path}</span>
      <b class="cx-change-state">{file.status === '??' ? 'U' : file.status}</b>
    </button>)}
  </div>;
}
