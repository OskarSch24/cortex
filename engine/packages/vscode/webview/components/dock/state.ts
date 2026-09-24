import { storedPaneWidth } from '../PaneResizeHandle.js';

/** Reiter und Maße des Docks — ohne Oberfläche, damit sich der Zustand prüfen lässt. */

export type DockKind = 'files' | 'changes' | 'transcript' | 'canvas' | 'agents' | 'video';

export interface DockTab {
  id: string;
  kind: DockKind;
  /** Nur bei `files` und erst, wenn eine Datei gewählt wurde. */
  path?: string;
  /** Quelltext statt gerenderter Vorschau. */
  source?: boolean;
  /** Nur bei `agents`: der Subagent, dessen Protokoll gerade offen ist. */
  agentId?: string;
}

export interface TranscriptDoc {
  title: string;
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export interface DockState {
  tabs: DockTab[];
  activeId?: string;
  width: number;
  fullscreen: boolean;
  /** Der Dateibaum lässt sich einzeln zuklappen, ohne das Dock zu verschmälern. */
  tree: boolean;
}

export const DOCK_MIN = 320;
/**
 * Wie weit man über eine Grenze hinausziehen muss, bis das Dock den Zustand
 * wechselt: unter die Mindestbreite klappt es zu, über die Mindestbreite des
 * Chats hinaus geht es ins Vollbild. Codex rastet ebenso ein.
 */
export const DOCK_SNAP = 48;
/** Was der Chat neben dem Dock mindestens behält. */
export const CHAT_MIN = 300;
export const DOCK_DEFAULT = 620;

export function emptyDock(): DockState {
  return { tabs: [], width: storedPaneWidth('dock', DOCK_DEFAULT), fullscreen: false, tree: true };
}

let seq = 0;
export function newTab(kind: DockKind, path?: string): DockTab {
  return { id: `t${++seq}`, kind, path };
}

/**
 * Holt den Reiter dieser Art nach vorn oder legt ihn an: ein Reiter je Art und
 * Chat genügt, ein zweiter Druck zeigt den vorhandenen. `patch` landet in
 * beiden Fällen auf dem Reiter (etwa der gewählte Subagent).
 */
export function focusOrAddTab(state: DockState, kind: DockKind, patch?: Partial<DockTab>): DockState {
  const existing = state.tabs.find(tab => tab.kind === kind);
  if (existing) {
    return patch
      ? { ...state, activeId: existing.id, tabs: state.tabs.map(tab => (tab === existing ? { ...tab, ...patch } : tab)) }
      : { ...state, activeId: existing.id };
  }
  const tab = { ...newTab(kind), ...patch };
  return { ...state, tabs: [...state.tabs, tab], activeId: tab.id };
}

/** Der Dateiname reicht, solange er eindeutig ist; sonst kommt der Ordner davor. */
export function tabLabel(tabs: DockTab[], tab: DockTab): string {
  if (tab.kind === 'changes') return 'Änderungen';
  if (tab.kind === 'transcript') return 'Transkript';
  if (tab.kind === 'canvas') return 'Excalidraw';
  if (tab.kind === 'agents') return 'Subagenten';
  if (tab.kind === 'video') return 'Video';
  if (!tab.path) return 'Datei öffnen';
  const name = tab.path.split('/').pop()!;
  const twice = tabs.some(other => other !== tab && other.path && other.path.split('/').pop() === name);
  if (!twice) return name;
  const parent = tab.path.split('/').slice(-2, -1)[0];
  return parent ? `${parent}/${name}` : name;
}
