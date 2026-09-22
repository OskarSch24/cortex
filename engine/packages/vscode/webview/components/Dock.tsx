import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview, WorkspaceDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { CopyButton } from './CopyButton.js';
import { Markdown } from './Markdown.js';
import { CanvasView } from './CanvasView.js';
import { PaneResizeHandle, storedPaneWidth, savePaneWidth, usePaneBounds } from './PaneResizeHandle.js';

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

export type DockKind = 'files' | 'changes' | 'transcript' | 'canvas';

export interface DockTab {
  id: string;
  kind: DockKind;
  /** Nur bei `files` und erst, wenn eine Datei gewählt wurde. */
  path?: string;
  /** Quelltext statt gerenderter Vorschau. */
  source?: boolean;
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
export const DOCK_DEFAULT = 620;

export function emptyDock(): DockState {
  return { tabs: [], width: storedPaneWidth('dock', DOCK_DEFAULT), fullscreen: false, tree: true };
}

let seq = 0;
export function newTab(kind: DockKind, path?: string): DockTab {
  return { id: `t${++seq}`, kind, path };
}

/** Der Dateiname reicht, solange er eindeutig ist; sonst kommt der Ordner davor. */
export function tabLabel(tabs: DockTab[], tab: DockTab): string {
  if (tab.kind === 'changes') return 'Änderungen';
  if (tab.kind === 'transcript') return 'Transkript';
  if (tab.kind === 'canvas') return 'Excalidraw';
  if (!tab.path) return 'Datei öffnen';
  const name = tab.path.split('/').pop()!;
  const twice = tabs.some(other => other !== tab && other.path && other.path.split('/').pop() === name);
  if (!twice) return name;
  const parent = tab.path.split('/').slice(-2, -1)[0];
  return parent ? `${parent}/${name}` : name;
}

/* ── Auswahl ─────────────────────────────────────────────────────────────── */

export type DockPick = 'files' | 'browser' | 'terminal' | 'changes' | 'canvas';

const PICKS: Array<{ id: DockPick; label: string; icon: string; keys: string }> = [
  { id: 'files', label: 'Dateien', icon: 'folder', keys: '⌘P' },
  { id: 'browser', label: 'Browser', icon: 'globe', keys: '⌘T' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal', keys: '⌃`' },
  { id: 'changes', label: 'Änderungen', icon: 'diff', keys: '' },
  { id: 'canvas', label: 'Excalidraw', icon: 'canvas', keys: '' },
];

/** Was sich hinzufügen lässt — Reiter dieses Docks wie Flächen des Editors. */
function DockChooser({ onPick, onDismiss }: {
  onPick: (pick: DockPick) => void;
  onDismiss: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onDismiss]);
  return <div
    class="cx-dock-picks"
    role="menu"
    aria-label="Was soll hier liegen?"
    ref={root}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(root.current!.querySelectorAll('button'));
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
        : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}
  >
    {PICKS.map(pick => <button key={pick.id} role="menuitem" onClick={() => onPick(pick.id)}>
      <Glyph name={pick.icon} size={14} />
      <span>{pick.label}</span>
      {pick.keys && <kbd>{pick.keys}</kbd>}
    </button>)}
  </div>;
}

/* ── Dateibaum ───────────────────────────────────────────────────────────── */

function FileTree({ workspace, activePath, onOpen, width, maxWidth, onWidth }: {
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

/* ── Brotkrume ───────────────────────────────────────────────────────────── */

/**
 * Der Weg zur Datei, und zugleich der Weg zurück: ein Ordnerstück klappt seinen
 * Inhalt auf. Was darin gewählt wird, öffnet daneben statt darin — sonst wäre
 * das Nachschlagen in einem Ordner ein Verlust des gerade Gelesenen.
 */
function Crumbs({ projectName, path, workspace, onOpen }: {
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

/* ── Öffnen ──────────────────────────────────────────────────────────────── */

/** Dieselbe Regel wie `XCODE_FILE` im Host; die Webview lädt keine Node-Module. */
const XCODE_FILE = /(\.(swift|xcodeproj|xcworkspace|xcconfig|storyboard|xib|xcassets|entitlements|plist)|\/Package\.swift)$/i;

const OPEN_ITEMS: Array<{ id: 'default' | 'terminal' | 'xcode' | 'reveal' | 'saveAs'; label: string; rule?: boolean }> = [
  { id: 'default', label: 'Standardprogramm' },
  { id: 'xcode', label: 'In Xcode öffnen' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'reveal', label: 'Im Finder zeigen', rule: true },
  { id: 'saveAs', label: 'Sichern unter …' },
];

function OpenButton({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const run = (action: typeof OPEN_ITEMS[number]['id']) => {
    setOpen(false);
    vscode.postMessage({ kind: 'fileAction', action, path });
  };
  return <div class="cx-dock-open" ref={root} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button class="cx-dock-open-main" onClick={() => run('default')}>
      <Glyph name="arrow" size={13} />Öffnen
    </button>
    <button class="cx-dock-open-more" aria-label="Weitere Wege, die Datei zu öffnen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Glyph name="chevron" size={11} />
    </button>
    {open && <div class="cx-dock-open-menu" role="menu">
      {OPEN_ITEMS.filter(item => item.id !== 'xcode' || XCODE_FILE.test(`/${path}`)).map(item => <button key={item.id} role="menuitem" class={item.rule ? 'ruled' : ''} onClick={() => run(item.id)}>{item.label}</button>)}
    </div>}
  </div>;
}

/* ── Dateiinhalt ─────────────────────────────────────────────────────────── */

const MARKDOWN = /\.(md|markdown|mdx)$/i;
const HTML = /\.(html?|xhtml)$/i;
/** Markdown und HTML haben eine Vorschau; alles andere hat nur seinen Quelltext. */
const hasPreview = (path: string) => MARKDOWN.test(path) || HTML.test(path);

type FileBody = { text?: string; truncated?: boolean; error?: string };
type FilePage = { url?: string; error?: string };

/**
 * Eine HTML-Datei ist eine Seite und läuft als solche: mit ihren Skripten und
 * den Dateien daneben, ausgeliefert vom Host (htmlPreview.ts).
 *
 * `allow-same-origin` lässt ihr den eigenen Ursprung unter 127.0.0.1 — damit
 * funktionieren `localStorage` und das Nachladen eigener Dateien. Die Webview
 * hat einen anderen Ursprung, an sie kommt die Seite also trotzdem nicht.
 * Fenster öffnen oder Cortex selbst umlenken darf sie nicht.
 */
function PageView({ path, page }: { path: string; page?: FilePage }) {
  if (!page) return <p class="cx-dock-note">wird geladen …</p>;
  if (page.error) return <p class="cx-dock-note" role="alert">{page.error}</p>;
  return <div class="cx-dock-file page">
    <iframe src={page.url} title={`Vorschau von ${path.split('/').pop()}`} sandbox="allow-scripts allow-same-origin allow-forms" />
  </div>;
}

function FileView({ path, source, body }: {
  path: string;
  source: boolean;
  body?: FileBody;
}) {
  if (!body) return <p class="cx-dock-note">wird gelesen …</p>;
  if (body.error) return <p class="cx-dock-note" role="alert">{body.error}</p>;
  const text = body.text ?? '';
  // HTML als Seite zeigt PageView — hier wird nur Markdown gerendert.
  const rendered = !source && MARKDOWN.test(path);
  return <div class={`cx-dock-file ${rendered ? 'rendered' : 'source'}`}>
    <CopyButton text={text} label="Datei kopieren" className="cx-dock-copy" icon />
    {rendered
      ? <Markdown text={text} reading />
      : <div class="cx-diff"><div class="cx-diff-hunk">
          {text.split('\n').map((line, i) => <div class="cx-diff-line ctx" key={i}>
            <span class="cx-diff-no">{i + 1}</span>
            <span class="cx-diff-sign" />
            <span class="cx-diff-text">{line || ' '}</span>
          </div>)}
        </div></div>}
    {body.truncated && <p class="cx-dock-note">Vorschau begrenzt auf 512 KB und 4.000 Zeilen. „Öffnen“ zeigt die vollständige Datei.</p>}
  </div>;
}

/**
 * Der Verlauf eines Chats. Er kommt als fertiger Klartext vom Host und wird
 * hier wie eine Markdown-Datei gezeigt — lesbar, kopierbar und über das × des
 * Reiters wieder zu.
 */
export function transcriptMarkdown(doc: TranscriptDoc): string {
  const body = doc.turns.map(turn => `## ${turn.role === 'user' ? 'Du' : 'Cortex'}\n\n${turn.text.trim()}`).join('\n\n');
  return `# ${doc.title}\n\n${body || '_Dieser Chat hat noch keinen Verlauf._'}\n`;
}

function TranscriptView({ transcript }: { transcript?: TranscriptDoc }) {
  if (!transcript) return <p class="cx-dock-note">wird geladen …</p>;
  if (!transcript.turns.length) {
    return <div class="cx-dock-empty">
      <Glyph name="chat" size={26} />
      <strong>Noch kein Verlauf</strong>
      <span>Sobald ihr geschrieben habt, steht er hier.</span>
    </div>;
  }
  return <div class="cx-dock-file rendered cx-transkript">
    <CopyButton text={transcriptMarkdown(transcript)} label="Verlauf kopieren" className="cx-dock-copy" icon />
    {transcript.turns.map((turn, i) => <article class="cx-tr-beitrag" key={i}>
      <div class="cx-tr-rolle">{turn.role === 'user' ? 'Du' : 'Cortex'}</div>
      <Markdown text={turn.text} />
    </article>)}
  </div>;
}

/* ── Änderungen ──────────────────────────────────────────────────────────── */

function Changes({ workspace, onOpen }: { workspace?: WorkspaceDto; onOpen: (path: string) => void }) {
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

/* ── Das Dock ────────────────────────────────────────────────────────────── */

export function Dock({ state, onState, workspace, projectName, transcript, conversationId, onClose, onPick }: {
  state: DockState;
  /** Der offene Chat — die Excalidraw-Fläche gehört zu ihm. */
  conversationId: string;
  onState: (next: DockState) => void;
  workspace?: WorkspaceDto;
  projectName: string;
  /** Der Verlauf des offenen Chats, sobald er angefordert wurde. */
  transcript?: TranscriptDoc;
  /** Das × ganz rechts und der letzte geschlossene Reiter enden beide hier. */
  onClose: () => void;
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
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind === 'fileBody') setBodies(prev => ({ ...prev, [msg.path]: { text: msg.text, truncated: msg.truncated, error: msg.error } }));
      if (msg?.kind === 'filePreview') setPages(prev => ({ ...prev, [msg.path]: { url: msg.url, error: msg.error } }));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
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
    if (choice === 'canvas') {
      // Eine Fläche je Chat: ein zweiter Druck holt die vorhandene nach vorn.
      const existing = state.tabs.find(tab => tab.kind === 'canvas');
      if (existing) { patch({ activeId: existing.id }); return; }
    }
    if (choice === 'files' || choice === 'changes' || choice === 'canvas') {
      const tab = newTab(choice);
      patch({ tabs: [...state.tabs, tab], activeId: tab.id });
      return;
    }
    onPick(choice);
  };

  const maxWidth = Math.max(DOCK_MIN, (bounds.parent || window.innerWidth - 250) - (window.innerWidth <= 1200 ? 32 : 300));
  const width = state.fullscreen ? undefined : Math.min(maxWidth, Math.max(DOCK_MIN, state.width));
  const treeMax = Math.max(140, (bounds.width || width || DOCK_DEFAULT) - 220);
  const shownTreeWidth = Math.min(treeMax, Math.max(140, treeWidth));
  return <aside
    ref={bounds.ref}
    class={`cx-dock ${state.fullscreen ? 'full' : ''}`}
    aria-label="Arbeitsbereich"
    style={width === undefined ? undefined : { width, minWidth: Math.min(width, DOCK_MIN) }}
  >
    {!state.fullscreen && <PaneResizeHandle label="Dock verbreitern" value={width!} min={DOCK_MIN} max={maxWidth} initial={DOCK_DEFAULT}
      onChange={width => { patch({ width, fullscreen: false }); savePaneWidth('dock', width); }} />}

    <div class="cx-dock-tabs">
      <div class="cx-dock-tablist" role="tablist" aria-label="Offene Reiter">
        {state.tabs.map(tab => <span class={`cx-dock-tab ${tab.id === active?.id ? 'active' : ''}`} key={tab.id}>
          <button role="tab" aria-selected={tab.id === active?.id} onClick={() => patch({ activeId: tab.id })}>
            <Glyph name={tab.kind === 'changes' ? 'diff' : tab.kind === 'transcript' ? 'chat' : tab.kind === 'canvas' ? 'canvas' : tab.path ? 'file' : 'folder'} size={13} />
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
        onClick={() => patch({ fullscreen: !state.fullscreen })}
      >
        <Glyph name={state.fullscreen ? 'shrink' : 'expand'} size={14} />
      </button>
      <button class="cx-icon" aria-label="Dock schließen" title="Dock schließen" onClick={onClose}>
        <Glyph name="close" size={14} />
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
