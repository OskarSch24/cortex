import { useState } from 'preact/hooks';
import type { ProjectDto } from '../../src/panel/protocol.js';

/** Welche Projektpfade in der Leiste unter „Archivierte Projekte“ stehen. */
const ARCHIVE_KEY = 'cortex.archivedProjects';
function storedArchive(): string[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(ARCHIVE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string') : [];
  } catch { return []; }
}

/** Die archivierten Projektpfade, im Browser gemerkt; umschalten schreibt sie gleich zurück. */
export function useArchivedProjects() {
  const [archived, setArchived] = useState<string[]>(storedArchive);
  const toggleArchived = (project: ProjectDto) => setArchived(prev => {
    const next = prev.includes(project.path) ? prev.filter(p => p !== project.path) : [...prev, project.path];
    try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(next)); } catch { /* Speicher kann in einer frischen Webview fehlen. */ }
    return next;
  });
  return [archived, toggleArchived] as const;
}
