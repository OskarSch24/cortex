/** Projekte, Arbeitsbereich und geänderte Dateien. */

/**
 * Ein Projekt ist ein Name über einem oder mehreren Quellordnern. `path` bleibt
 * die Kennung — sie steht in jedem Chat und darf sich nicht ändern, wenn der
 * Nutzer den Namen umschreibt oder einen zweiten Ordner dazunimmt.
 */
export interface ProjectDto { name: string; path: string; folders?: string[]; pinned?: boolean; missing?: boolean; }
/** Eine geänderte Datei mit ihren Zeilen — die Grundlage für Karte und Prüfansicht. */
export interface FileDiffDto {
  path: string;
  added: number;
  removed: number;
  binary?: boolean;
  hunks?: Array<{ start: number; lines: Array<{ kind: 'add' | 'del' | 'ctx'; text: string; line?: number }> }>;
}

export interface WorkspaceDto {
  root?: string;
  directory: string;
  branch?: string;
  files: Array<{ name: string; path: string; directory: boolean }>;
  changes: Array<{ path: string; status: string }>;
  error?: string;
}

export interface MemoryHitDto {
  id: string;
  titel: string;
  quelle: 'chat' | 'dokument';
  ort?: string;
  datum?: string;
  auszug: string;
  passung: 'sehr' | 'gut';
}
