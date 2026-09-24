import { useEffect, useState } from 'preact/hooks';
import type { WorkspaceDto } from '../../src/panel/protocol.js';
import { useHostMessage } from '../hooks/useHostMessage.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { CanvasView } from './CanvasView.js';
import { PaneResizeHandle, storedPaneWidth, savePaneWidth, usePaneBounds } from './PaneResizeHandle.js';
import { AgentsView } from './DockAgents.js';
import { VideoView } from './VideoView.js';
import type { TranscriptItem } from '../../src/panel/transcript.js';
import { Changes } from './dock/Changes.js';
import { Crumbs } from './dock/Crumbs.js';
import { DockChooser, type DockPick } from './dock/DockChooser.js';
import { FileTree } from './dock/FileTree.js';
import { FileView, HTML, PageView, hasPreview, type FileBody, type FilePage } from './dock/FileView.js';
import { OpenButton } from './dock/OpenButton.js';
import { DOCK_DEFAULT, DOCK_MIN, focusOrAddTab, newTab, tabLabel, type DockState, type TranscriptDoc } from './dock/state.js';
import { TranscriptView } from './dock/TranscriptView.js';
import { useDockResize } from './dock/useDockResize.js';

export { DOCK_MIN, emptyDock, focusOrAddTab, newTab, type DockKind, type DockState, type DockTab, type TranscriptDoc } from './dock/state.js';
export type { DockPick } from './dock/DockChooser.js';

/**
 * Das Dock rechts neben dem Chat.
 *
 * Es ist ein Behälter für Reiter, kein Dateibrowser mit Deckel: was darin
 * liegt, bestimmt der Reiter, nicht das Dock. Deshalb trägt die Kopfzeile zwei
 * Etagen — oben die Reiter, die für jeden Inhalt gleich aussehen, darunter die
 * Werkzeuge des gerade offenen. Ein Terminal oder der integrierte Browser sind
 * echte Flächen von Code-OSS und liegen außerhalb; die Auswahlliste reicht sie
 * an den Host weiter, statt sie hier nachzubauen.
 */

/* ── Das Dock ────────────────────────────────────────────────────────────── */

export function Dock({ state, onState, workspace, projectName, transcript, conversationId, items, motion, onClose, onHide, onPick, onLiveWidth }: {
  state: DockState;
  /** Der offene Chat — die Excalidraw-Fläche gehört zu ihm. */
  conversationId: string;
  onState: (next: DockState) => void;
  workspace?: WorkspaceDto;
  projectName: string;
  /** Der Verlauf des offenen Chats, sobald er angefordert wurde. */
  transcript?: TranscriptDoc;
  /** Der Verlauf des offenen Chats — daraus liest der Reiter „Subagenten“. */
  items: TranscriptItem[];
  /** Hereinfahren beim Öffnen, Hinausfahren beim Schließen, sonst still. */
  motion?: 'enter' | 'leave';
  /** Der letzte geschlossene Reiter endet hier: das Dock ist dann leer. */
  onClose: () => void;
  /**
   * Einklappen, ohne etwas wegzuwerfen — der Umschalter oben rechts, ⌥⌘B und
   * das Zuziehen unter die Mindestbreite. Beim nächsten Öffnen liegt alles
   * wieder da, nur nicht mehr im Vollbild.
   */
  onHide: (instant?: boolean) => void;
  /** Die gerade gezogene Breite, damit die Übersichtskarte schon beim Ziehen Platz macht. */
  onLiveWidth?: (width: number | undefined) => void;
  /** Browser und Terminal sind Flächen des Editors, nicht Reiter dieses Docks. */
  onPick: (pick: DockPick) => void;
}) {
  const [adding, setAdding] = useState(false);
  const bounds = usePaneBounds();
  const [treeWidth, setTreeWidth] = useState(() => storedPaneWidth('tree', 230));
  const [bodies, setBodies] = useState<Record<string, FileBody>>({});
  const [pages, setPages] = useState<Record<string, FilePage>>({});
  const active = state.tabs.find(tab => tab.id === state.activeId) ?? state.tabs[0];
  const canvasTab = state.tabs.some(tab => tab.kind === 'canvas');
  const asPage = !!active?.path && HTML.test(active.path) && !active.source;

  // Der Inhalt kommt vom Host und wird bei jedem Wechsel neu geholt — eine
  // Datei, die der Agent inzwischen geschrieben hat, wäre sonst gelogen. Was
  // schon gelesen wurde, bleibt beim Wechsel stehen, statt zu blinken.
  useHostMessage('fileBody', msg => setBodies(prev => ({ ...prev, [msg.path]: { text: msg.text, truncated: msg.truncated, error: msg.error } })));
  useHostMessage('filePreview', msg => setPages(prev => ({ ...prev, [msg.path]: { url: msg.url, error: msg.error } })));
  // Eine Seite braucht keinen Text, sondern ihre Adresse; den Quelltext holt
  // erst, wer ihn sehen will. Der Rahmen lädt beim Zurückwechseln neu.
  useEffect(() => {
    const path = active?.path;
    if (!path) return;
    vscode.postMessage(asPage ? { kind: 'previewFile', path } : { kind: 'readFileBody', path, maxLines: 4000 });
  }, [active?.path, asPage]);

  const patch = (next: Partial<DockState>) => onState({ ...state, ...next });
  const openPath = (path: string, inNewTab: boolean) => {
    const existing = state.tabs.find(tab => tab.path === path);
    if (existing) { patch({ activeId: existing.id }); return; }
    if (inNewTab || !active || active.kind !== 'files' || active.path) {
      const tab = newTab('files', path);
      patch({ tabs: [...state.tabs, tab], activeId: tab.id });
      return;
    }
    // Der leere „Datei öffnen“-Reiter wird gefüllt, nicht verdoppelt.
    patch({ tabs: state.tabs.map(tab => (tab.id === active.id ? { ...tab, path } : tab)) });
  };
  const closeTab = (id: string) => {
    const rest = state.tabs.filter(tab => tab.id !== id);
    // Der letzte Reiter nimmt das Dock mit. Ein leerer Rahmen bliebe sonst
    // stehen und niemand wüsste, wozu.
    if (!rest.length) { onClose(); return; }
    // Nur wer den offenen Reiter schließt, bekommt einen anderen — sonst
    // spränge das Dock beim Aufräumen nebenher auf eine fremde Datei.
    if (id !== active?.id) { patch({ tabs: rest }); return; }
    const at = state.tabs.findIndex(tab => tab.id === id);
    patch({ tabs: rest, activeId: (rest[at] ?? rest[rest.length - 1])!.id });
  };
  const pick = (choice: DockPick) => {
    setAdding(false);
    // Eine Fläche, ein Subagenten- und ein Video-Reiter je Chat: ein zweiter
    // Druck holt den vorhandenen nach vorn.
    if (choice === 'canvas' || choice === 'agents' || choice === 'video') { onState(focusOrAddTab(state, choice)); return; }
    if (choice === 'files' || choice === 'changes') {
      const tab = newTab(choice);
      patch({ tabs: [...state.tabs, tab], activeId: tab.id });
      return;
    }
    onPick(choice);
  };

  const { maxWidth, parentWidth, settled, width, narrow, overwide, setLive, release, toggleFullscreen, hide } = useDockResize({ state, patch, bounds, motion, onHide, onLiveWidth });

  const treeMax = Math.max(140, (bounds.width || width || DOCK_DEFAULT) - 220);
  const shownTreeWidth = Math.min(treeMax, Math.max(140, treeWidth));
  return <aside
    ref={bounds.ref}
    class={`cx-dock ${state.fullscreen ? 'full' : ''} ${motion ?? ''} ${narrow ? 'narrow' : ''} ${overwide ? 'overwide' : ''}`}
    aria-label="Arbeitsbereich"
    aria-hidden={motion === 'leave' || undefined}
    style={width === undefined ? undefined : { width, minWidth: Math.min(width, DOCK_MIN), '--cx-dock-w': `${width}px`, '--cx-dock-inner': `${DOCK_MIN}px` }}
  >
    {!state.fullscreen && motion !== 'leave' && <PaneResizeHandle label="Dock verbreitern" value={settled} min={DOCK_MIN} max={maxWidth} initial={DOCK_DEFAULT}
      onChange={width => { patch({ width, fullscreen: false }); savePaneWidth('dock', width); }}
      onDrag={raw => setLive(Math.max(0, Math.min(parentWidth, raw)))} onRelease={release} />}

    <div class="cx-dock-tabs">
      <div class="cx-dock-tablist" role="tablist" aria-label="Offene Reiter">
        {state.tabs.map(tab => <span class={`cx-dock-tab ${tab.id === active?.id ? 'active' : ''}`} key={tab.id}>
          <button role="tab" aria-selected={tab.id === active?.id} onClick={() => patch({ activeId: tab.id })}>
            <Glyph name={tab.kind === 'changes' ? 'diff' : tab.kind === 'transcript' ? 'chat' : tab.kind === 'canvas' ? 'canvas' : tab.kind === 'agents' ? 'user' : tab.kind === 'video' ? 'play' : tab.path ? 'file' : 'folder'} size={13} />
            <span>{tabLabel(state.tabs, tab)}</span>
          </button>
          <button class="cx-dock-tab-x" aria-label={`${tabLabel(state.tabs, tab)} schließen`} onClick={() => closeTab(tab.id)}>
            <Glyph name="close" size={11} />
          </button>
        </span>)}
      </div>
      {/* Das Plus steht neben der Reiterleiste, nicht darin: sonst schnitte
          deren waagerechter Überlauf sein Menü ab. */}
      <span class="cx-dock-add">
        <button class="cx-icon" aria-label="Etwas hinzufügen" aria-haspopup="menu" aria-expanded={adding} onClick={() => setAdding(v => !v)}>
          <Glyph name="plus" size={14} />
        </button>
        {adding && <DockChooser onPick={pick} onDismiss={() => setAdding(false)} />}
      </span>
      <span class="cx-dock-gap" />
      <button
        class="cx-icon"
        aria-pressed={state.fullscreen}
        title={state.fullscreen ? 'Vollbildmodus beenden' : 'Vollbildmodus aktivieren'}
        aria-label={state.fullscreen ? 'Vollbildmodus beenden' : 'Vollbildmodus aktivieren'}
        onClick={toggleFullscreen}
      >
        <Glyph name={state.fullscreen ? 'shrink' : 'expand'} size={14} />
      </button>
      <button class="cx-icon" aria-pressed="true" aria-label="Rechte Seitenleiste ausblenden" title="Seitenleiste ein-/ausblenden (⌥⌘B)" onClick={hide}>
        <Glyph name="panel" size={14} />
      </button>
    </div>

    {active?.kind === 'transcript' && <div class="cx-dock-head">
      <span class="cx-dock-title">{transcript?.title ?? 'Transkript'}</span>
    </div>}

    {active?.kind === 'files' && active.path && <div class="cx-dock-head">
      <Crumbs projectName={projectName} path={active.path} workspace={workspace} onOpen={path => openPath(path, true)} />
      {/* Ohne Vorschau wäre ein Umschalter zwischen zwei gleichen Ansichten eine Lüge. */}
      {hasPreview(active.path) && <button
        class="cx-dock-text-btn"
        onClick={() => patch({ tabs: state.tabs.map(tab => (tab.id === active.id ? { ...tab, source: !tab.source } : tab)) })}
      >
        {active.source ? 'Vorschau anzeigen' : 'Quelle anzeigen'}
      </button>}
      <button class="cx-icon" aria-pressed={state.tree} title={state.tree ? 'Dateibaum ausblenden' : 'Dateibaum einblenden'} aria-label={state.tree ? 'Dateibaum ausblenden' : 'Dateibaum einblenden'} onClick={() => patch({ tree: !state.tree })}>
        <Glyph name={state.tree ? 'folderOpen' : 'folder'} size={15} />
      </button>
      <OpenButton path={active.path} />
    </div>}

    <div class="cx-dock-body">
      <div class="cx-dock-main">
        {/* Die Fläche bleibt stehen, solange ihr Reiter offen ist — auch
            hinter einem anderen. Sonst verlöre jeder Reiterwechsel den
            Rückgängig-Verlauf, und das Modell sähe sie nur zeitweise. */}
        {canvasTab && conversationId && <CanvasView key={conversationId} conversationId={conversationId} hidden={active?.kind !== 'canvas'} />}
        {!active || active.kind === 'canvas'
          ? null
          : active.kind === 'changes'
          ? <Changes workspace={workspace} onOpen={path => openPath(path, true)} />
          : active.kind === 'transcript'
          ? <TranscriptView transcript={transcript} />
          : active.kind === 'video'
          ? <VideoView key={conversationId} conversationId={conversationId} />
          : active.kind === 'agents'
          ? <AgentsView items={items} agentId={active.agentId}
              onAgent={agentId => patch({ tabs: state.tabs.map(tab => (tab.id === active.id ? { ...tab, agentId } : tab)) })} />
          : active.path && asPage
          ? <PageView path={active.path} page={pages[active.path]} />
          : active.path
          ? <FileView path={active.path} source={active.source === true} body={bodies[active.path]} />
          : <div class="cx-dock-empty">
              <Glyph name="folder" size={26} />
              <strong>Datei öffnen</strong>
              <span>Wähle eine Datei im Baum rechts.</span>
            </div>}
      </div>
      {active?.kind === 'files' && state.tree && <FileTree workspace={workspace} activePath={active.path} onOpen={openPath} width={shownTreeWidth} maxWidth={treeMax} onWidth={width => { setTreeWidth(width); savePaneWidth('tree', width); }} />}
    </div>
  </aside>;
}
