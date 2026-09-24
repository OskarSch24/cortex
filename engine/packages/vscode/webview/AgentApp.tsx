import { ImageWorkspace } from './components/ImageWorkspace.js';
import { nestBackground } from './components/backgroundTasks.js';
import { PaneResizeHandle, storedPaneWidth, savePaneWidth, usePaneBounds } from './components/PaneResizeHandle.js';
import { conversationImages, type WorkspaceImage } from './components/imageWorkspaceState.js';
import type { ImageOptions } from '../src/panel/imageOptions.js';
import { assistantText } from '../src/panel/transcript.js';
import { QueuedMessages } from './components/QueuedMessages.js';
import { TemplateStrip } from './components/TemplateStrip.js';
import { templateCategoryForAction, type ArtifactTemplateCategory } from './components/templateCommands.js';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AccountStatusDto, QueuedMessageDto, ConversationMeta, FileDiffDto, HostToWebview, ProjectDto, WorkspaceDto } from '../src/panel/protocol.js';
import { applyHostMessage, touchedFiles, type TranscriptItem } from '../src/panel/transcript.js';
import { vscode } from './vscodeApi.js';
import { tagsOf } from '../src/panel/tags.js';
import { useArchivedProjects } from './hooks/useArchivedProjects.js';
import { useNavigation } from './hooks/useNavigation.js';
import { answerCanvasRequest, blockKey, canvasBlocks, requestDraw, type CanvasHost } from './canvas/client.js';
import { Composer, type PinnedTarget } from './components/Composer.js';
import { ControlPanel } from './components/ControlPanel.js';
import { AccountLimits } from './components/AccountLimits.js';
import { AccountsView } from './components/AccountsView.js';
import { AgentTeamsView } from './components/AgentTeamsView.js';
import { AgentAutomationsView } from './components/AgentAutomationsView.js';
import { SettingsApp, type Route } from './settings/SettingsApp.js';
import type { SlashAction } from '../../core/src/commands/slashCommands.js';
import { appSetting, startSettingsStore } from './settings/store.js';
import { Transcript } from './components/Transcript.js';
import { Dock, DOCK_MIN, emptyDock, focusOrAddTab, newTab, type DockKind, type DockPick, type DockState, type TranscriptDoc } from './components/Dock.js';
import { collectAgents } from './components/DockAgents.js';
import { LocationChip, LocationPicker } from './components/LocationPicker.js';
import type { ChatLocation } from '../../core/src/context/chatLocationBrief.js';

/** So lange fährt das Dock herein und hinaus — gemessen an Codex (0,40 s / 0,30 s). */
const DOCK_ENTER_MS = 400;
const DOCK_LEAVE_MS = 300;
/** Die Übersichtskarte samt rechtem Rand, und was der Chat daneben behalten soll. */
const CARD_WIDTH = 368;
const CHAT_ROOM = 560;
/** Die Einstiege der Startseite: runde Knöpfe unter der Eingabe, der Text geht ins Eingabefeld. */
const START_PROMPTS = [
  { icon: 'search', label: 'Code verstehen', text: 'Analysiere dieses Projekt. Erkläre den Aufbau und die wichtigsten Abläufe.' },
  { icon: 'code', label: 'Feature bauen', text: 'Ich möchte ein neues Feature entwickeln. Prüfe zuerst die bestehende Architektur und frage mich nach dem gewünschten Verhalten.' },
  { icon: 'eye', label: 'Code prüfen', text: 'Prüfe die aktuellen Änderungen auf Fehler und mögliche Regressionen.' },
  { icon: 'bug', label: 'Fehler beheben', text: 'Hilf mir, einen Fehler zu beheben. Frage mich nach dem Problem und untersuche zuerst seine Ursache.' },
];
import { ArchivedProjects, ProjectTree } from './components/ProjectTree.js';
import { ProjectEditor } from './components/ProjectEditor.js';
import { ProjectPicker } from './components/ProjectPicker.js';
import { ConversationSearch } from './components/ConversationSearch.js';
import { PluginsView } from './components/PluginsView.js';
import { ReviewPanel } from './components/ReviewPanel.js';
import { ExokortexView } from './components/ExokortexView.js';
import { CortexBrain, CortexMark, Glyph } from './components/CortexIcons.js';

export function AgentApp() {
  const { history, cursor, here, page, pageRef, go, setCursor, goPlugins, setPage, canBack, canForward } = useNavigation();
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [accounts, setAccounts] = useState<AccountStatusDto[]>([]);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState('');
  const [projects, setProjects] = useState<ProjectDto[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceDto>();
  const [controlOpen, setControlOpen] = useState(true);
  /**
   * Das Dock rechts: eine Liste von Reitern, kein An/Aus.
   *
   * Offen heißt „hat Reiter“ — bis auf den Moment nach dem Knopfdruck, in dem
   * es leer dasteht und fragt, was hinein soll (`picking`). Der Rückhalt merkt
   * sich beim Zuklappen über den Knopf, was drin lag; über das × wird
   * verworfen. Das ist der ganze Unterschied zwischen den beiden Wegen hinaus.
   */
  const [dock, setDock] = useState<DockState>(emptyDock());
  const [transcript, setTranscript] = useState<TranscriptDoc>();
  /** Standort-Kontext des offenen Chats (vom Host) und ob die Kachel dafür offen ist. */
  const [chatLocation, setChatLocation] = useState<ChatLocation>();
  const [locationOpen, setLocationOpen] = useState(false);
  const saveLocation = (location: ChatLocation | undefined) => {
    setChatLocation(location);
    setLocationOpen(false);
    if (activeRef.current || activeId) vscode.postMessage({ kind: 'setChatLocation', conversationId: activeRef.current || activeId, location: location ?? null });
  };
  const stash = useRef<DockState>();
  const dockOpen = dock.tabs.length > 0;
  /** Gesetzt, wenn der nächste Dockwechsel ohne Bewegung geschehen soll. */
  const dockInstant = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  /**
   * Die Reiter gehören dem Chat, nicht dem Fenster.
   *
   * Was in ihnen steht, ist ohnehin chatgebunden: die Zeichenfläche liegt unter
   * der Chatkennung, Änderungen und Verlauf kommen nur für den offenen Chat an,
   * und das Projekt hängt am Chat. Ohne diese Ablage blieb ein einmal
   * geöffneter Reiter in jedem weiteren Chat stehen und zeigte dort fremden
   * oder leeren Inhalt. Beim Wechsel wird der bisherige Stand weggelegt und der
   * des Ziels geholt; ein Chat ohne Eintrag fängt zugeklappt an. Nur für diese
   * Sitzung — nach einem Neustart beginnt jeder Chat wieder zugeklappt.
   */
  const docks = useRef(new Map<string, { dock: DockState; stash?: DockState }>());
  const dockOwner = useRef('');
  const dockRef = useRef(dock);
  dockRef.current = dock;
  useEffect(() => {
    if (dockOwner.current === activeId) return;
    if (dockOwner.current) docks.current.set(dockOwner.current, { dock: dockRef.current, stash: stash.current });
    dockOwner.current = activeId;
    const held = activeId ? docks.current.get(activeId) : undefined;
    // Ein Chatwechsel tauscht das Dock aus, er öffnet oder schließt es nicht:
    // hier fährt nichts herein oder hinaus.
    dockInstant.current = true;
    setDock(held?.dock ?? emptyDock());
    stash.current = held?.stash;
  }, [activeId]);

  /**
   * Ein Knopf, der schon leuchtet, macht wieder zu.
   *
   * Jeder Knopf steht für einen Inhalt, nicht für das Dock: zeigt das Dock
   * gerade etwas anderes, wird umgeschaltet statt zugeklappt. Zugeklappt wird
   * nur, was der Knopf selbst zeigt — und dann bleibt der Inhalt im Rückhalt
   * liegen, damit der nächste Druck dieselbe Datei wiederbringt.
   */
  const toggleDock = (kind: DockKind) => setDock(current => {
    const active = current.tabs.find(tab => tab.id === current.activeId) ?? current.tabs[0];
    if (active?.kind === kind) {
      stash.current = current;
      return { ...current, tabs: [], activeId: undefined };
    }
    const existing = current.tabs.find(tab => tab.kind === kind);
    if (existing) return { ...current, activeId: existing.id };
    const held = !current.tabs.length ? stash.current : undefined;
    const restored = held?.tabs.find(tab => tab.kind === kind);
    if (held && restored) { stash.current = undefined; return { ...held, activeId: restored.id }; }
    const tab = newTab(kind);
    return { ...current, tabs: [...current.tabs, tab], activeId: tab.id };
  });

  /**
   * Die Excalidraw-Fläche geht auf und bleibt auf: ein Zeichenauftrag aus dem
   * Verlauf oder `/excalidraw` soll sie zeigen, nicht umschalten.
   */
  const openCanvas = () => setDock(current => focusOrAddTab(current, 'canvas'));

  /** Der Reiter „Video“ geht auf und bleibt auf, wie die Zeichenfläche. */
  const openVideo = () => setDock(current => focusOrAddTab(current, 'video'));

  /** Das × wirft weg — deshalb geht hier kein Rückhalt mit. */
  const closeDock = () => {
    stash.current = undefined;
    setDock(current => ({ ...current, tabs: [], activeId: undefined }));
  };

  /**
   * Einklappen wie der Seitenleisten-Knopf bei Codex: alles bleibt liegen und
   * kommt beim nächsten Öffnen wieder — nur das Vollbild nicht, das gilt für
   * den Moment, nicht für das Dock.
   */
  const hideDock = (instant?: boolean) => {
    // Hat das Dock die Bewegung schon selbst gezeichnet (Ziehen, Knopf), fährt
    // hier nichts ein zweites Mal hinaus.
    if (instant) dockInstant.current = true;
    hideDockState();
  };
  const hideDockState = () => setDock(current => {
    if (!current.tabs.length) return current;
    stash.current = { ...current, fullscreen: false };
    return { ...current, tabs: [], activeId: undefined, fullscreen: false };
  });

  /**
   * ⌥⌘B: das ganze Dock ein und aus. Ohne Rückhalt beginnt es mit dem, was
   * der Chat gerade hat — Subagenten, wenn welche liefen, sonst den Dateien.
   */
  const toggleWholeDock = () => setDock(current => {
    if (current.tabs.length) {
      stash.current = { ...current, fullscreen: false };
      return { ...current, tabs: [], activeId: undefined, fullscreen: false };
    }
    const held = stash.current;
    if (held?.tabs.length) { stash.current = undefined; return { ...held, width: current.width, fullscreen: false }; }
    const tab = newTab(collectAgents(itemsRef.current).length ? 'agents' : 'files');
    return { ...current, tabs: [tab], activeId: tab.id, fullscreen: false };
  });

  /*
   * Hereinfahren und Hinausfahren. Das Dock hängt nur im Baum, solange es
   * Reiter hat; damit es beim Schließen sichtbar hinausfahren kann, bleibt
   * sein letzter Stand für die Dauer der Bewegung stehen. Aus dem Vollbild
   * schließt Codex ohne Bewegung, ebenso beim Chatwechsel.
   */
  /*
   * Die Übersichtskarte darf neben dem Dock stehen bleiben, solange der Chat
   * dazwischen noch lesbar ist — Codex blendet sie erst aus, wenn der Platz
   * nicht mehr reicht, und wieder ein, sobald er es tut.
   */
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const workspaceObserver = useRef<ResizeObserver>();
  const measureWorkspace = useCallback((node: HTMLDivElement | null) => {
    workspaceObserver.current?.disconnect();
    if (!node) return;
    // Im nächsten Frame: sofort gesetzt, ändert die neue Breite der Karte die
    // beobachtete Fläche noch im selben Durchlauf — Chromium meldet dann eine
    // Beobachterschleife.
    let frame = 0;
    workspaceObserver.current = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setWorkspaceWidth(node.clientWidth)); });
    workspaceObserver.current.observe(node);
  }, []);
  const [liveDockWidth, setLiveDockWidth] = useState<number>();
  /*
   * Wie viel der Karte neben dem Dock Platz hat, von 0 bis 1. Beim Ziehen
   * nimmt das Dock zuerst der Karte den Raum und erst dann dem Chat — im Takt
   * der Maus, ohne dass der Chat dazwischen breiter oder schmaler springt.
   */
  const dockShown = liveDockWidth ?? Math.max(DOCK_MIN, dock.width);
  const cardRoom = Math.max(0, Math.min(1, (workspaceWidth - dockShown - CHAT_ROOM) / CARD_WIDTH));
  // In Ruhe ganz oder gar nicht; nur während des Ziehens anteilig.
  const cardFit = !dockOpen ? 1 : dock.fullscreen ? 0 : liveDockWidth !== undefined ? cardRoom : cardRoom >= 1 ? 1 : 0;

  /** Ein Subagent aus der Übersichtskarte öffnet sein Protokoll im Dock. */
  const openAgent = (agentId?: string) => setDock(current => focusOrAddTab(current, 'agents', { agentId }));

  const [dockMotion, setDockMotion] = useState<'enter'>();
  const [leavingDock, setLeavingDock] = useState<DockState>();
  const previousDock = useRef(dock);
  useEffect(() => {
    const before = previousDock.current;
    previousDock.current = dock;
    const wasOpen = before.tabs.length > 0;
    const isOpen = dock.tabs.length > 0;
    const instant = dockInstant.current;
    dockInstant.current = false;
    if (wasOpen === isOpen || instant) { if (instant) { setDockMotion(undefined); setLeavingDock(undefined); } return; }
    if (isOpen) {
      setLeavingDock(undefined);
      setDockMotion('enter');
      const timer = setTimeout(() => setDockMotion(undefined), DOCK_ENTER_MS);
      return () => clearTimeout(timer);
    }
    setDockMotion(undefined);
    if (before.fullscreen) return;
    setLeavingDock(before);
    const timer = setTimeout(() => setLeavingDock(undefined), DOCK_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [dock]);

  /**
   * Browser und Terminal sind Flächen von Code-OSS, keine Reiter dieses Docks:
   * der integrierte Browser legt sich neben den Chat, das Terminal darunter.
   * Die Auswahlliste reicht sie an den Host weiter, statt sie nachzubauen.
   */
  const pickPane = (pick: DockPick) => {
    if (pick === 'browser') vscode.postMessage({ kind: 'openBrowser' });
    if (pick === 'terminal') vscode.postMessage({ kind: 'openTerminal' });
  };
  const [sidebar, setSidebar] = useState(true);
  // Im Fenstermodus zeichnet macOS die Ampelknöpfe oben links in die Leiste,
  // im Vollbild nicht. Die Webview sieht das nur an der Fenstergröße: füllt das
  // Fenster den ganzen Bildschirm samt Menüleistenstreifen, ist es Vollbild.
  const [windowed, setWindowed] = useState(true);
  useEffect(() => {
    const check = () => setWindowed(!(window.outerWidth >= screen.width && window.outerHeight >= screen.height));
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(() => Math.min(420, Math.max(180, storedPaneWidth('sidebar', window.innerWidth < 1250 ? 226 : 250))));
  const sidebarBounds = usePaneBounds();
  const sidebarMax = Math.max(180, Math.min(420, (sidebarBounds.parent || window.innerWidth) - 360));
  const shownSidebarWidth = Math.min(sidebarWidth, sidebarMax);
  const resizeSidebar = (width: number) => { setSidebarWidth(width); savePaneWidth('sidebar', width); };
  // Collapsed does not have to mean gone: pointing at the toggle slides the
  // sidebar over the page for as long as you are looking at it, and clicking
  // it pins it back into the layout.
  const [peek, setPeek] = useState(false);
  const [connectors, setConnectors] = useState<string[]>([]);
  const [templates, setTemplates] = useState(false);
  const [templateCategory, setTemplateCategory] = useState<ArtifactTemplateCategory>('dokument');
  const [templateCategoryRequest, setTemplateCategoryRequest] = useState(0);
  const [templatePreview, setTemplatePreview] = useState<ArtifactTemplateCategory>();
  const [templateFiles, setTemplateFiles] = useState<string[]>([]);
  const [settingsRoute, setSettingsRoute] = useState<Route>();
  const [commandRequest, setCommandRequest] = useState<{ action: SlashAction; key: number }>();
  const [archivedChats, setArchivedChats] = useState<ConversationMeta[]>([]);
  const peekTimer = useRef<ReturnType<typeof setTimeout>>();
  const showPeek = () => { clearTimeout(peekTimer.current); if (!sidebar) setPeek(true); };
  const hidePeek = () => { clearTimeout(peekTimer.current); peekTimer.current = setTimeout(() => setPeek(false), 180); };
  useEffect(() => () => clearTimeout(peekTimer.current), []);

  // Der Exokortex-Wächter folgt der Seite; die Titelleiste verwendet davon
  // unabhängig die oben gemeldete tatsächlich sichtbare Seite.
  useEffect(() => {
    vscode.postMessage({ kind: 'exokortexPageOpen', open: page === 'exokortex' });
  }, [page]);
  const [search, setSearch] = useState<string | undefined>();
  // Aufgeklappt wird gemerkt, nicht zugeklappt: eine frisch hinzugekommene
  // Gruppe ist zu, und die Leiste bleibt beim Start ruhig.
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [editing, setEditing] = useState<ProjectDto>();
  const [looseOpen, setLooseOpen] = useState(true);
  // Archivieren ist reine Ordnung in der Leiste und bleibt deshalb hier vorn:
  // der Host erfährt nichts davon, Ordner und Aufgaben bleiben unberührt.
  const [archived, toggleArchived] = useArchivedProjects();
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Die Prüfansicht liegt rechts, wo sonst Ausgaben und Quellen stehen —
  // zwei Panels nebeneinander wären im Chatfenster nicht mehr lesbar.
  const [review, setReview] = useState(false);
  /** Ein Codeblock, der rechts aufgeschlagen wird statt im Verlauf zu stehen. */
  const [code, setCode] = useState<{ text: string; lang?: string }>();
  const [diffFiles, setDiffFiles] = useState<FileDiffDto[]>([]);
  /**
   * Was die Karte zeigt: die Dateien, die der Agent in diesem Chat geschrieben
   * hat. Zahlen bekommen sie aus git, wo es ein Repository gibt — sonst stehen
   * sie ohne da. Der umgekehrte Weg (nur zeigen, was git kennt) verschwieg in
   * einem Ordner ohne Repository jede Änderung.
   */
  const touched = touchedFiles(items);
  const byPath = new Map(diffFiles.map(f => [f.path, f]));
  const changed: FileDiffDto[] = touched.map(f => byPath.get(f.path) ?? { path: f.path, added: 0, removed: 0 });
  const [tags, setTags] = useState<string[]>([]);
  const [customCommands, setCustomCommands] = useState<import('../../core/src/commands/slashCommands.js').SlashCommand[]>([]);
  const [permissionMode, setPermissionMode] = useState('safe');
  const [askPermission, setAskPermission] = useState(false);
  const [routingMode, setRoutingMode] = useState<'auto' | 'manual'>('auto');
  const [pinnedTarget, setPinnedTarget] = useState<PinnedTarget>();
  const [pinnedStandard, setPinnedStandard] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [queued, setQueued] = useState<QueuedMessageDto[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [queuePauseReason, setQueuePauseReason] = useState<'error' | 'stopped' | 'restored' | 'project'>();
  const [startedAt, setStartedAt] = useState(0);
  const [pinned, setPinned] = useState(true);
  const [promptSeed, setPromptSeed] = useState<{ text: string; key: number; mode?: 'chat' }>();
  const [imageSeed, setImageSeed] = useState<{ options: import('../src/panel/imageOptions.js').ImageOptions; provider?: string; key: number }>();
  const [imagePath, setImagePath] = useState<string>();
  const [imageSplit, setImageSplit] = useState(false);
  const [lastContribution, setLastContribution] = useState(false);
  const [imageNotice, setImageNotice] = useState('');
  const [imageProviderChoice, setImageProviderChoice] = useState<'codex' | 'grok'>();
  const images = conversationImages(items);
  const viewedImage = images.find(image => image.path === imagePath);
  const imagePreviews = Object.fromEntries(images.map(image => [image.path, image.src]));
  // Vorschaubilder für angehängte Bilddateien. Getrennt von `imagePreviews`:
  // die stehen für erzeugte Bilder und steuern die Auswahl im Bildbereich.
  const [attachmentThumbs, setAttachmentThumbs] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const wanted = attachments.filter(path => /\.(png|jpe?g|webp|gif|svg|bmp|heic|heif|tiff?|mp4|mov|m4v|webm|mkv|avi|pdf)$/i.test(path) && !imagePreviews[path] && !(path in attachmentThumbs));
    if (!wanted.length) return;
    setAttachmentThumbs(prev => ({ ...prev, ...Object.fromEntries(wanted.map(path => [path, null])) }));
    for (const path of wanted) vscode.postMessage({ kind: 'attachmentPreview', path });
  }, [attachments]);
  const lastAnswer = [...items].reverse().find(item => item.kind === 'assistant');
  const lastAnswerText = lastAnswer?.kind === 'assistant' ? assistantText(lastAnswer) : '';
  const openImage = (image: WorkspaceImage) => {
    setImageNotice(''); setReview(false); closeDock(); setImagePath(image.path); setImageSplit(false);
    setImageSeed({ options: { ratio: image.options?.ratio ?? '1:1', count: 1 }, provider: image.provider, key: Date.now() });
  };
  const editImage = (image: WorkspaceImage, text: string, edit?: ImageOptions['edit']) => {
    setImageNotice('');
    const provider = imageProviderChoice ?? (image.provider === 'grok' ? 'grok' : 'codex');
    vscode.postMessage({ kind: 'send', text, tags: [], permissionMode: 'safe', askPermission, routingMode: 'manual', attachments: [image.path], image: { ratio: image.options?.ratio ?? '1:1', count: 1, ...(edit ? { edit } : {}) }, imageProvider: provider });
  };
  const activeRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [hydrating, setHydrating] = useState(false);
  /** Der angeklickte Chat, solange der Host den Wechsel noch nicht bestätigt hat. */
  const [opening, setOpening] = useState<string>();
  /** Was der Host vor dem Lauf tut — für die Arbeitsanzeige. */
  const [hostActivity, setHostActivity] = useState<string>();
  /**
   * Was eine laufende Antwort bisher geschrieben hat — nur, um darin fertige
   * Excalidraw-Blöcke zu finden. Beim Nachladen eines Chats kommt derselbe
   * Text noch einmal; der wird nicht gezeichnet, er steht längst auf der Fläche.
   */
  const liveAnswers = useRef({ hydrating: false, text: new Map<string, string>(), drawn: new Set<string>() });
  /**
   * Beim Chatwechsel schickt der Host jeden gespeicherten Eintrag einzeln. Ein
   * langer Chat sind Tausende davon; einzeln angewandt zeichnet das Fenster den
   * ganzen Verlauf tausendmal neu und steht sekundenlang. Sie werden deshalb
   * gesammelt und in einem Zug angewandt, sobald der Chat vollständig ist.
   */
  const replayBuffer = useRef<HostToWebview[]>([]);
  const active = conversations.find(c => c.id === activeId);
  const projectPath = active?.projectPath;
  const projectName = projects.find(p => p.path === projectPath)?.name ?? projectPath?.split('/').pop();
  // Das Projekt, in dem gerade gearbeitet wird, steht offen. Alles andere hat
  // der Nutzer selbst aufgeklappt und bleibt so, bis er es wieder zumacht —
  // ein automatisches Zuklappen würde ihm die Liste unter der Hand umbauen.
  useEffect(() => {
    if (projectPath) setOpenGroups(prev => prev.includes(projectPath) ? prev : [...prev, projectPath]);
  }, [projectPath]);
  const routable = accounts.filter(a => !a.reviewOnly);
  const runningCount = conversations.filter(c => c.running).length;
  const empty = items.length === 0;
  const chatStarted = items.some(item => item.kind === 'user');
  const newTask = (path?: string) => {
    setPage('chat'); setSearch(undefined);
    vscode.postMessage({ kind: 'newConversation', projectPath: path });
  };
  /**
   * Die Markierung springt sofort: welcher Chat gemeint ist, weiß das Fenster
   * beim Klick. Bis der Host den Chat geladen hat, wäre die alte Zeile markiert
   * und der Klick sähe aus, als wäre er verloren gegangen.
   */
  const openTask = (id: string) => { setPage('chat'); setSearch(undefined); setOpening(id); vscode.postMessage({ kind: 'openConversation', id }); };

  useEffect(() => {
    /**
     * Fertige Excalidraw-Blöcke einer laufenden Antwort auf die Fläche
     * schicken. Derselbe Block eines Chats geht nur einmal los; dass er
     * ankommt, meldet die Fläche selbst zurück (canvas/client.ts).
     */
    const queueCanvasBlocks = (messageId: string, text: string) => {
      const live = liveAnswers.current;
      for (const code of canvasBlocks(text)) {
        const key = blockKey(code);
        if (live.drawn.has(`${messageId}:${key}`)) continue;
        live.drawn.add(`${messageId}:${key}`);
        setReview(false); openCanvas();
        requestDraw({ conversationId: activeRef.current, code, key, force: false });
      }
    };
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg.kind === 'slashAction') { setCommandRequest({ action: msg.action, key: Date.now() }); return; }
      if (msg.kind === 'showPage') { setPage(msg.page); return; }
      if (msg.kind === 'conversationReset') {
        setCommandRequest(undefined);
        setTemplates(false); setTemplatePreview(undefined);
        setImagePath(undefined); setImageSeed(undefined); setImageSplit(false); setLastContribution(false); setImageNotice('');
        setQueued([]); setQueuePaused(false); setItems([]); setAttachments([]); setPromptSeed(undefined); setWorkspace(undefined); setRunning(false); setStartedAt(0);
        setPinnedTarget(undefined); pinnedRef.current = true; setPinned(true); setHydrating(true);
        liveAnswers.current.hydrating = true; liveAnswers.current.text.clear();
        replayBuffer.current = [];
        return;
      }
      if (msg.kind === 'conversationReady') {
        const replayed = replayBuffer.current;
        replayBuffer.current = [];
        if (replayed.length) setItems(prev => replayed.reduce(applyHostMessage, prev));
        setHydrating(false); liveAnswers.current.hydrating = false;
        return;
      }
      if (msg.kind === 'activity') { setHostActivity(msg.text); return; }
      // Das Modell will die Fläche sehen oder darauf zeichnen (canvas_view / canvas_draw).
      if (msg.kind === 'canvasRequest') {
        void answerCanvasRequest(msg).then(answer => vscode.postMessage({ kind: 'canvasAnswer', reqId: msg.reqId, ...answer }));
        return;
      }
      if (msg.kind === 'busy' && !msg.running) setHostActivity(undefined);
      if (msg.kind === 'delta' && !liveAnswers.current.hydrating) {
        // Ein Block wird gezeichnet, sobald sein Zaun schließt — nicht erst,
        // wenn die ganze Antwort fertig ist.
        const live = liveAnswers.current;
        const text = (live.text.get(msg.messageId) ?? '') + msg.text;
        live.text.set(msg.messageId, text);
        queueCanvasBlocks(msg.messageId, text);
      }
      if (msg.kind === 'done') {
        // Letzte Sicherung: am fertigen Text noch einmal nachsehen. Ein Block,
        // den die Teilstücke nicht hergaben — abgerissener Strom, ein Zaun,
        // der erst im Schlussstück zuging —, geht sonst verloren, ohne dass
        // es jemand merkt.
        const live = liveAnswers.current;
        const full = live.text.get(msg.messageId);
        if (full && !live.hydrating) queueCanvasBlocks(msg.messageId, full);
        live.text.delete(msg.messageId);
      }
      if (liveAnswers.current.hydrating) replayBuffer.current.push(msg);
      else setItems(prev => applyHostMessage(prev, msg));
      if (msg.kind === 'messageQueue' && (!activeRef.current || msg.conversationId === activeRef.current)) { setQueued(msg.items); setQueuePaused(msg.paused); setQueuePauseReason(msg.pauseReason); return; }
      if (msg.kind === 'image') { setImagePath(path => path ? msg.path : undefined); setImageNotice(''); }
      if (msg.kind === 'error' || msg.kind === 'notice') { setImageNotice(msg.kind === 'error' ? msg.message : msg.text); setLastContribution(true); }
      if (msg.kind === 'busy') { setRunning(msg.running); setStartedAt(prev => msg.running ? prev || Date.now() : 0); }
      if (msg.kind === 'accounts') setAccounts(msg.accounts);
      if (msg.kind === 'projects') setProjects(msg.projects);
      if (msg.kind === 'diff' && (!activeRef.current || msg.conversationId === activeRef.current)) setDiffFiles(msg.files);
      if (msg.kind === 'workspace' && (!activeRef.current || msg.conversationId === activeRef.current)) setWorkspace(msg.workspace);
      if (msg.kind === 'conversations') { setConversations(msg.list); setArchivedChats(msg.archivedList ?? []); setActiveId(msg.activeId); activeRef.current = msg.activeId; setOpening(undefined); }
      if (msg.kind === 'rules') { setTags([...new Set(msg.rules.rules.flatMap(r => r.match.tags ?? []))]); setCustomCommands(msg.customCommands ?? []); }
      if (msg.kind === 'modes') {
        setPermissionMode(msg.permissionMode); setRoutingMode(msg.routingMode); setAskPermission(msg.askPermission === true);
      }
      if (msg.kind === 'pinnedTarget') { setPinnedTarget(msg.target); setPinnedStandard(msg.standard === true); }
      if (msg.kind === 'chatLocation') { setChatLocation(msg.location); setLocationOpen(false); }
      if (msg.kind === 'connectors') setConnectors(msg.servers.map(server => server.name));
      if (msg.kind === 'toolbar') {
        // Die Knöpfe sitzen jetzt in der Fenster-Titelleiste, die über Chat und
        // Terminal zugleich läuft. Von dort kommen sie als Nachricht herein.
        if (msg.action === 'files') toggleDock('files');
        if (msg.action === 'dock') toggleWholeDock();
        if (msg.action === 'changes') toggleDock('changes');
        if (msg.action === 'canvas') toggleDock('canvas');
        if (msg.action === 'video') toggleDock('video');
        if (msg.action === 'sidebar') { setPeek(false); setSidebar(v => !v); }
        if (msg.action === 'project') vscode.postMessage({ kind: 'assignProject' });
        // Die Übersicht (Ausgaben, Hintergrundprozesse, Quellen) nach dem Schließen zurückholen.
        if (msg.action === 'overview') { setPage('chat'); setControlOpen(v => !v); }
      }
      if (msg.kind === 'transcript') {
        // Der Verlauf öffnet als Reiter im Dock. Ein zweiter Aufruf ersetzt den
        // Inhalt des vorhandenen Reiters, statt einen weiteren aufzumachen.
        setTranscript({ title: msg.title, turns: msg.turns });
        setDock(current => focusOrAddTab(current, 'transcript'));
      }
      // Auf der Plugin-Seite gehört eine gezogene Datei der Seite — meist eine
      // Client-JSON mit Secret, die nie stillschweigend an den nächsten Chat soll.
      if (msg.kind === 'attachments' && pageRef.current !== 'plugins') setAttachments(prev => [...new Set([...prev, ...msg.paths])]);
      // Aus dem Workbench-Drop: ein Bild ohne Pfad (Screenshot-Vorschau) oder ein Ablegen ohne Ergebnis.
      if (msg.kind === 'attachmentData' && pageRef.current !== 'plugins') vscode.postMessage({ kind: 'saveAttachmentData', name: msg.name, dataUrl: msg.dataUrl });
      if (msg.kind === 'attachmentDropFailed') vscode.postMessage({ kind: 'attachmentFailed', reason: msg.reason });
      if (msg.kind === 'composerSeed') { setPage('chat'); setAttachments(msg.attachments ?? []); setPromptSeed({ text: msg.text, key: Date.now() }); }
      if (msg.kind === 'attachmentPreview' && msg.src) setAttachmentThumbs(prev => ({ ...prev, [msg.path]: msg.src! }));
    };
    window.addEventListener('message', onMessage);
    startSettingsStore();
    vscode.postMessage({ kind: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useLayoutEffect(() => {
    if (hydrating || !pinnedRef.current || empty) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [hydrating, items, empty]);
  useEffect(() => {
    if (dockOpen) vscode.postMessage({ kind: 'inspectWorkspace' });
  }, [dockOpen, running]);
  // Die Knöpfe liegen in der Fenster-Titelleiste, außerhalb der Webview. Ohne
  // diese Meldung wüsste keiner von ihnen, ob er aktiv aussehen muss.
  useEffect(() => { vscode.postMessage({ kind: 'dockState', open: dockOpen }); }, [dockOpen]);
  // Nach jedem Lauf stimmen die Zahlen der Karte wieder — vorher zeigte sie
  // den Stand von vor der Bearbeitung.
  useEffect(() => { if (!running) vscode.postMessage({ kind: 'getDiff' }); }, [running, activeId]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(''); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(); }
      if (e.key === 'Escape') setSearch(undefined);
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, []);

  /**
   * Ein Dateilink aus dem Verlauf: Projektdateien öffnen rechts im Dock als
   * Reiter, wie bei Codex. Was außerhalb des Projekts liegt (etwa ein
   * Anhang vom Schreibtisch), geht an den Editor daneben — das Dock liest nur
   * aus dem Projektordner.
   */
  const openPath = (path: string) => {
    // NFC auf beiden Seiten: der Projektordner kommt von macOS zerlegt, ein
    // Anhang oder Agentenpfad oft zusammengesetzt — „ö“ ist sonst nicht „ö“.
    const base = projectPath?.normalize('NFC');
    const full = path.normalize('NFC');
    const underProject = !!base && full.startsWith(base + '/');
    const inside = !path.startsWith('~') && (!path.startsWith('/') || underProject);
    if (!inside) { vscode.postMessage({ kind: 'openWorkspaceFile', path }); return; }
    const rel = underProject ? full.slice(base!.length + 1) : path;
    setReview(false);
    setDock(current => {
      const existing = current.tabs.find(tab => tab.kind === 'files' && tab.path === rel);
      if (existing) return { ...current, activeId: existing.id };
      const tab = newTab('files', rel);
      return { ...current, tabs: [...current.tabs, tab], activeId: tab.id };
    });
  };
  const pickTarget = (target?: PinnedTarget) => { setPinnedTarget(target); vscode.postMessage({ kind: 'setPinnedTarget', target }); };
  const canvasHost: CanvasHost = {
    draw: (code, key, force) => { setReview(false); openCanvas(); requestDraw({ conversationId: activeRef.current || activeId, code, key, force: !!force }); },
    open: () => { setReview(false); openCanvas(); },
  };
  /** Eine Nachricht an den Host ohne Bildauftrag; #tags im Text werden zu Regeln. */
  const buildSend = (text: string) => ({
    kind: 'send' as const, text, tags: tagsOf(text), permissionMode, askPermission, routingMode, target: pinnedTarget,
  });
  const send = (text: string, effort?: import('../../core/src/types.js').Effort, image?: import('./components/Composer.js').ImageSend) => {
    const trimmed = text.trim(); if (!trimmed) return;
    // `/excalidraw` allein öffnet nur die Fläche; mit Auftrag geht sie auf und
    // der Auftrag an das Modell, das dann darauf zeichnet.
    // `/remotion` öffnet den Reiter „Video“; mit Auftrag baut der Agent dort das Video.
    // Ein angehängtes Video oder Bild ist schon ein Auftrag — es ist das Material.
    // Geht nichts hinaus, bleibt der Befehl im Eingabefeld stehen, statt zu verschwinden.
    if (!image && /^\/remotion\b/i.test(trimmed)) {
      setReview(false); openVideo();
      if (!trimmed.replace(/^\/remotion\b/i, '').trim() && !attachments.length) { setPromptSeed({ text: '/remotion ', key: Date.now() }); return; }
    }
    if (!image && /^\/excalidraw\b/i.test(trimmed)) {
      setReview(false); openCanvas();
      if (!trimmed.replace(/^\/excalidraw\b/i, '').trim()) return;
    }
    pinnedRef.current = true;
    const sentAttachments = viewedImage && !attachments.some(path => imagePreviews[path]) ? [...attachments, viewedImage.path] : attachments;
    vscode.postMessage(image
      ? { kind: 'send', text: trimmed, tags: [], permissionMode: 'safe', askPermission, routingMode: 'manual', attachments: sentAttachments, image: image.options, imageProvider: image.provider }
      : { ...buildSend(trimmed), effort, attachments });
    setAttachments([]);
  };
  const runCommand = (action: SlashAction, draft: string) => {
    setCommandRequest(undefined);
    const preserveDraft = () => setPromptSeed({ text: draft, key: Date.now() });
    const settings = (id: Route['id'], sub: string[] = []) => { preserveDraft(); setSettingsRoute({ id, sub }); setPage('settings'); };
    switch (action) {
      case 'archiveChat': vscode.postMessage({ kind: 'chatCommand', action: 'archive' }); break;
      case 'pinChat': vscode.postMessage({ kind: 'chatCommand', action: 'pin' }); break;
      case 'forkChat': vscode.postMessage({ kind: 'chatCommand', action: 'fork' }); break;
      case 'exportChat': vscode.postMessage({ kind: 'chatCommand', action: 'export' }); break;
      case 'compactChat': vscode.postMessage({ kind: 'chatCommand', action: 'compact' }); break;
      case 'openFeedback': vscode.postMessage({ kind: 'chatCommand', action: 'feedback' }); break;
      case 'openMemory': settings('personalisierung'); break;
      case 'openConnectors': settings('plugins', ['mcps']); break;
      case 'openSettings': settings('allgemein'); break;
      case 'refreshUsage': vscode.postMessage({ kind: 'refreshUsage' }); settings('nutzung'); break;
      case 'openAccounts': preserveDraft(); setPage('accounts'); break;
      case 'openRules': vscode.postMessage({ kind: 'openRules' }); break;
      case 'openTerminal': vscode.postMessage({ kind: 'openTerminal' }); break;
      case 'openTemplates': setTemplateCategory('dokument'); setTemplateCategoryRequest(value => value + 1); setTemplates(true); break;
      case 'openDocumentTemplates': case 'openPresentationTemplates': case 'openSpreadsheetTemplates':
        setTemplateCategory(templateCategoryForAction(action)!); setTemplateCategoryRequest(value => value + 1); setTemplates(true); break;
      case 'openSearch': setSearch(''); break;
      case 'newChat': newTask(projectPath); break;
      case 'clearChat': send('/clear'); break;
      // These are handled in the composer, where their controls live.
      case 'openModel': case 'createImage': break;
    }
  };
  const pinnedChats = conversations.filter(c => c.pinned);
  const isWorkspace = !['automations', 'agents', 'exokortex', 'plugins', 'accounts'].includes(page);
  const loose = conversations.filter(c => !c.pinned && !c.projectPath);
  const shownProjects = projects.filter(p => !archived.includes(p.path));
  const archivedProjects = projects.filter(p => archived.includes(p.path));
  const treeProps = {
    conversations: conversations.filter(c => !c.pinned),
    activeId: page === 'chat' ? (opening ?? activeId) : '',
    activePath: projectPath,
    open: openGroups,
    onToggle: (path: string) => setOpenGroups(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]),
    onOpenTask: openTask,
    onNewTask: newTask,
    onDeleteTask: (id: string) => vscode.postMessage({ kind: 'deleteConversation', id }),
    onEditProject: setEditing,
    onPinProject: (project: ProjectDto) => vscode.postMessage({ kind: 'pinProject', path: project.path, pinned: !project.pinned }),
    onArchiveProject: toggleArchived,
  };
  const taskRows = (list: ConversationMeta[], reachable = true) => nestBackground(list).map(c => <div key={c.id} class={`cx-tree-task ${page === 'chat' && (opening ?? activeId) === c.id ? 'active' : ''} ${c.nested ? 'nested' : ''}`}><button class="cx-tree-task-open" onClick={() => openTask(c.id)} title={c.background ? `Hintergrundprozess · ${c.title}` : c.title} tabIndex={reachable ? 0 : -1}>{c.background && <Glyph name="swarm" size={12} />}<span>{c.title === 'New chat' || !c.title ? 'Neue Aufgabe' : c.title}</span></button>{c.running ? <span class="cx-tree-task-run" title="Läuft"><span class="cx-dot" /></span> : <button class="cx-icon cx-tree-task-del" aria-label={`Aufgabe löschen: ${c.title}`} tabIndex={reachable ? 0 : -1} onClick={() => vscode.postMessage({ kind: 'deleteConversation', id: c.id })}><Glyph name="trash" size={12} /></button>}</div>);

  // Die Einstellungen legen sich wie bei Codex über das ganze Fenster: eine
  // eigene Leiste statt der App-Leiste, rechts die Seiten.
  if (page === 'settings') return <div class="cx-shell cx-settings-mode">
    <SettingsApp
      initial={settingsRoute}
      accounts={accounts}
      projects={projects}
      conversations={conversations}
      archivedChats={archivedChats}
      archived={archived}
      onArchive={toggleArchived}
      permissionMode={permissionMode}
      askPermission={askPermission}
      routingMode={routingMode}
      onPermission={id => { setPermissionMode(id); vscode.postMessage({ kind: 'setModes', permissionMode: id }); }}
      onRouting={id => { setRoutingMode(id); vscode.postMessage({ kind: 'setModes', routingMode: id }); }}
      onAsk={ask => { setAskPermission(ask); vscode.postMessage({ kind: 'setAskPermission', ask }); }}
      openPlugin={id => goPlugins(id ? { kind: 'detail', id } : { kind: 'overview' })}
      openTask={openTask}
      onBack={() => { setSettingsRoute(undefined); if (cursor > 0 && history[cursor - 1]?.page !== 'settings') setCursor(c => c - 1); else setPage('chat'); }}
    />
  </div>;

  return <div class={`cx-shell ${!sidebar ? 'cx-sidebar-hidden' : ''} ${windowed ? 'cx-windowed' : ''}`} style={{ '--cx-sidebar-width': `${shownSidebarWidth}px` }}>
    {/* Eingeklappt bleibt eine schmale Leiste mit denselben Bereichen stehen:
        jeder Weg der Seitenleiste ist so weiter einen Klick entfernt. */}
    {!sidebar && <nav class={`cx-mini-rail ${peek ? 'covered' : ''}`} aria-label="Bereiche (eingeklappt)">
      <button class="cx-icon cx-mini-brand" aria-label="Seitenleiste ausklappen" title="Seitenleiste ausklappen" onClick={() => { setPeek(false); setSidebar(true); }}><CortexMark size={24} /></button>
      <button class={`cx-icon ${page === 'chat' ? 'selected' : ''}`} aria-label="Neuer Chat" title="Neuer Chat" onClick={() => newTask()}><Glyph name="compose" size={18} /></button>
      <button class={`cx-icon ${page === 'agents' ? 'selected' : ''}`} aria-label="Aktive Agenten" title="Aktive Agenten" onClick={() => setPage('agents')}><Glyph name="bolt" size={18} />{runningCount > 0 && <span class="cx-mini-dot" />}</button>
      <button class={`cx-icon ${page === 'automations' ? 'selected' : ''}`} aria-label="Geplante Aktionen" title="Geplante Aktionen" onClick={() => setPage('automations')}><Glyph name="clock" size={18} /></button>
      <button class={`cx-icon ${page === 'exokortex' ? 'selected' : ''}`} aria-label="Exokortex" title="Exokortex" onClick={() => setPage('exokortex')}><Glyph name="branch" size={18} /></button>
      <button class={`cx-icon ${page === 'plugins' ? 'selected' : ''}`} aria-label="Plugins" title="Plugins" onClick={() => goPlugins({ kind: 'overview' })}><Glyph name="plug" size={18} /></button>
      <span class="cx-mini-sep" />
      <button class="cx-icon" aria-label="Aufgaben suchen" title="Aufgaben suchen (⌘K)" onClick={() => setSearch('')}><Glyph name="search" size={18} /></button>
      <span class="cx-mini-gap" />
      <button class="cx-icon" aria-label="Konten und Limits" title="Konten und Limits" onClick={() => setPage('accounts')}><Glyph name="user" size={18} /></button>
      <button class="cx-icon" aria-label="Einstellungen" title="Einstellungen" onClick={() => setPage('settings')}><Glyph name="gear" size={18} /></button>
    </nav>}
    {!sidebar && <div class="cx-sidebar-edge" aria-hidden="true" onMouseEnter={showPeek} onMouseLeave={hidePeek} />}
    {/* Die Leiste bleibt im Baum, auch wenn sie zu ist — nur so lässt sich der
        Weg dorthin zeigen, statt sie verschwinden zu lassen. Zugeklappt schiebt
        sie sich um ihre eigene Breite nach links aus dem Bild; der Chat rückt
        dabei nach, weil sie im Fluss bleibt. */}
    <aside ref={sidebarBounds.ref} class={`cx-sidebar ${!sidebar && !peek ? 'closed' : ''} ${!sidebar && peek ? 'peek' : ''}`} aria-label="Navigation" aria-hidden={!sidebar && !peek} onMouseEnter={showPeek} onMouseLeave={hidePeek}>
      {/* Marke und Umschalter teilen sich die oberste Zeile. Sie beginnt an der
          Fensteroberkante — darüber liegt nichts mehr, seit die Kopfzeile aus
          dem Raster genommen ist. Im Fenstermodus rückt sie unter die
          Ampelknöpfe (.cx-windowed), im Vollbild bleibt sie oben. */}
      <div class="cx-rail-brand">
        <CortexMark size={26} />
        <span>Cortex</span>
        <button class="cx-icon" aria-label="Aufgaben suchen" title="Aufgaben suchen (⌘K)" onClick={() => setSearch('')}><Glyph name="search" size={16} /></button>
        <button class="cx-icon" title={sidebar ? 'Seitenleiste ausblenden' : 'Seitenleiste anheften'} aria-label={sidebar ? 'Seitenleiste ausblenden' : 'Seitenleiste anheften'} onClick={() => { if (sidebar) setSidebar(false); else { setPeek(false); setSidebar(true); } }}><Glyph name="panel" size={16} /></button>
      </div>

      <nav class="cx-rail-nav" aria-label="Bereiche">
        <button class={`cx-nav ${page === 'chat' ? 'selected' : ''}`} onClick={() => newTask()}><Glyph name="compose" size={16} /><span>Neuer Chat</span><span class="cx-nav-trail"><Glyph name="composeNew" size={16} /></span></button>
        <button class={`cx-nav ${page === 'agents' ? 'selected' : ''}`} onClick={() => setPage('agents')}><Glyph name="bolt" size={16} /><span>Aktive Agenten</span>{runningCount > 0 && <span class="cx-count">{runningCount}</span>}</button>
        <button class={`cx-nav ${page === 'automations' ? 'selected' : ''}`} onClick={() => setPage('automations')}><Glyph name="clock" size={16} /><span>Geplante Aktionen</span></button>
        <button class={`cx-nav ${page === 'exokortex' ? 'selected' : ''}`} onClick={() => setPage('exokortex')}><Glyph name="branch" size={16} /><span>Exokortex</span></button>
        <button class={`cx-nav ${page === 'plugins' ? 'selected' : ''}`} onClick={() => goPlugins({ kind: 'overview' })}><Glyph name="plug" size={16} /><span>Plugins</span></button>
      </nav>

      <div class="cx-rail-tree">
        <ProjectTree projects={shownProjects} {...treeProps} onAddProject={() => vscode.postMessage({ kind: 'addProject' })} />
        {pinnedChats.length > 0 && <section class="cx-pinned-chats" aria-label="Angeheftete Chats"><div class="cx-tree-row"><span class="cx-tree-open"><Glyph name="pin" size={14} />Angeheftete Chats</span></div>{taskRows(pinnedChats)}</section>}
        {projects.length === 0 && <button class="cx-add-project" onClick={() => vscode.postMessage({ kind: 'addProject' })}><Glyph name="folder" /><span>Projektordner hinzufügen<small>Deine Dateien als Arbeitsgrundlage</small></span></button>}

        {loose.length > 0 && <section class={`cx-tree-node cx-loose ${looseOpen ? 'open' : ''}`}>
          <div class="cx-tree-row">
            <button class="cx-tree-open" aria-expanded={looseOpen} onClick={() => setLooseOpen(v => !v)}>
              <span class="cx-loose-chevron"><Glyph name="chevron" size={12} /></span>
              <span>Zuletzt verwendet</span>
              {!looseOpen && <span class="cx-fold-count" aria-hidden="true">{loose.length}</span>}
            </button>
          </div>
          <div class="cx-tree-children" aria-hidden={!looseOpen}><div><div class="cx-tree-children-inner">{taskRows(loose, looseOpen)}</div></div></div>
        </section>}

      </div>

      <div class="cx-sidebar-bottom"><ArchivedProjects projects={archivedProjects} expanded={archiveOpen} onExpand={() => setArchiveOpen(v => !v)} {...treeProps} /><div class="cx-account-dock"><AccountLimits accounts={routable} current={pinnedTarget} onOpen={() => setPage('accounts')} /><button class="cx-icon cx-settings-btn" aria-label="Einstellungen" title="Einstellungen" onClick={() => setPage('settings')}><Glyph name="gear" size={17} /></button></div></div>
      {(sidebar || peek) && <PaneResizeHandle label="Seitenleistenbreite" edge="right" value={shownSidebarWidth} min={180} max={sidebarMax} initial={250} onChange={resizeSidebar} />}
    </aside>
    <main class={`cx-main ${viewedImage && page === 'chat' ? 'has-image-workspace' : ''} ${isWorkspace ? 'has-workspace' : ''}`}>
      {/* Vor und Zurück, oben links neben der Seitenleiste. Sie bedienen den
          ganzen Verlauf — Seitenwechsel wie Schritte innerhalb der Plugins —
          und liegen links, weil rechts die Werkzeug-Icons der Titelleiste
          sitzen. */}
      <div class="cx-history">
        <button
          class="cx-icon"
          disabled={!canBack}
          title="Zurück"
          aria-label="Zurück"
          onClick={() => setCursor(c => Math.max(0, c - 1))}
        >
          <Glyph name="back" size={16} />
        </button>
        <button
          class="cx-icon"
          disabled={!canForward}
          title="Vorwärts"
          aria-label="Vorwärts"
          onClick={() => setCursor(c => Math.min(history.length - 1, c + 1))}
        >
          <span class="cx-history-forward">
            <Glyph name="back" size={16} />
          </span>
        </button>
      </div>
      
      {page === 'automations' ? <AgentAutomationsView onOpenProfile={id => go({ page: 'agents', profileId: id })} onManageAgents={() => setPage('agents')} /> : page === 'agents' ? <AgentTeamsView initialProfileId={here.profileId} accounts={accounts} projects={projects} conversations={conversations} onOpenConversation={openTask} onAccounts={() => setPage('accounts')} /> : page === 'exokortex' ? <ExokortexView /> : page === 'plugins' ? <PluginsView view={here.plugins ?? { kind: 'overview' }} onView={goPlugins} onPrompt={text => { setPromptSeed({ text, key: Date.now() }); setPage('chat'); }} /> : page === 'accounts' ? <AccountsView accounts={accounts} onUseAccount={a => { pickTarget({ provider: a.provider, account: a.label }); setPage('chat'); }} /> : <div class={`cx-workspace ${dockOpen && dock.fullscreen && !review ? 'dock-full' : ''}`} ref={measureWorkspace}>
        {/* Verlauf und Übersichtskarte teilen sich eine Insel; Dock und Prüfansicht stehen daneben. */}
        <div class="cx-chat-island">
          <div class={`cx-conversation ${empty && !hydrating ? 'is-empty' : ''} ${viewedImage ? 'has-image-workspace' : ''} ${viewedImage && imageSplit ? 'image-split' : ''}`}>
            {empty && !hydrating ? <div class="cx-welcome"><div class="cx-welcome-mark"><CortexBrain size={64} /></div><h1>{projectName ? `Was steht in ${projectName} an?` : 'Was steht heute an?'}</h1></div> : <div class="cx-transcript-scroll" ref={scrollRef} onScroll={e => { const el = e.currentTarget; const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 60; pinnedRef.current = bottom; setPinned(bottom); }}>{hydrating ? null : <div class="cx-chat-width"><Transcript conversationId={activeId} onExecutePrompt={text => vscode.postMessage(buildSend(text))} items={items} canvas={canvasHost} activity={hostActivity} onPrompt={text => setPromptSeed({ text, key: Date.now() })} onEditMessage={(index, text) => { pinnedRef.current = true; vscode.postMessage({ kind: 'editMessage', index, send: buildSend(text) }); }} onRewind={index => vscode.postMessage({ kind: 'rewindTo', index })} onFork={index => vscode.postMessage({ kind: 'forkFrom', index })} noAccounts={!routable.length} running={running} startedAt={startedAt} onAddAccount={() => setPage('accounts')} onPermission={(id, decision) => vscode.postMessage({ kind: 'permissionDecision', id, decision })} onRetry={() => vscode.postMessage({ kind: 'retryLast' })} onRate={(messageId, poor) => vscode.postMessage({ kind: 'rateAnswer', messageId, poor })} onOpenFile={openPath} onOpenUrl={url => vscode.postMessage({ kind: 'openUrlIn', url, app: appSetting<'cortex' | 'chrome' | 'safari' | 'default'>('browser.oeffnungsziel', 'cortex') })} onOpenUrlIn={(url, app) => app === 'copy' ? void navigator.clipboard?.writeText(url) : vscode.postMessage({ kind: 'openUrlIn', url, app })} diffs={changed} onReview={() => { setReview(true); closeDock(); }} onRevert={(messageId, paths) => vscode.postMessage({ kind: 'revertTurn', messageId, paths })} onOpenCode={(text, lang) => { setCode({ text, lang }); setReview(true); closeDock(); }} onImageAction={(action, image, all, options, target) => {
              if (action === 'view') { openImage(images.find(i => i.path === image.path) ?? image); return; }
              if (action === 'variant' || action === 'variantAll') { setAttachments(action === 'variant' ? [image.path] : all.map(i => i.path)); setImageSeed({ options: { ratio: options?.ratio ?? '1:1', count: 1 }, provider: target?.provider, key: Date.now() }); return; }
              if (action === 'copyPrompt') { if (image.prompt) void navigator.clipboard?.writeText(image.prompt); return; }
              vscode.postMessage({ kind: 'imageAction', action, path: image.path, prompt: image.prompt, ...(action === 'saveAll' ? { paths: all.map(i => i.path) } : {}) });
            }} /><div ref={bottomRef} /></div>}</div>}
            {viewedImage && <ImageWorkspace images={images} path={viewedImage.path} title={active?.title || 'Generiertes Bild'} selected={attachments.filter(path => imagePreviews[path])} split={imageSplit} running={running} onPath={setImagePath} onClose={() => setImagePath(undefined)} onSplit={() => setImageSplit(value => !value)} onSelect={paths => setAttachments(previous => [...previous.filter(path => !imagePreviews[path]), ...paths])} onAction={(action, image, paths) => vscode.postMessage({ kind: 'imageAction', action, path: image.path, prompt: image.prompt, paths })} onEdit={editImage} onResize={(image, width, height) => vscode.postMessage({ kind: 'resizeImage', path: image.path, width, height })} />}
            <div class="cx-compose-area cx-chat-width">
              {viewedImage && !imageSplit && <div class={`cx-image-last ${lastContribution ? 'expanded' : ''}`}><button aria-expanded={lastContribution} onClick={() => setLastContribution(value => !value)}><span>{running ? 'Bild wird bearbeitet …' : 'Letzter Beitrag'}</span><Glyph name="chevron" size={13} /></button>{lastContribution && <div>{imageNotice || (running ? 'Bild wird bearbeitet …' : lastAnswerText || 'Generiertes Bild')}</div>}</div>}
              {!hydrating && !pinned && !empty && !viewedImage && <button class="cx-jump" title="Zur neuesten Aktivität" aria-label="Zur neuesten Aktivität" onClick={() => { pinnedRef.current = true; setPinned(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }}><Glyph name="arrowDown" size={16} /></button>}
              {locationOpen && <LocationPicker current={chatLocation} onApply={saveLocation} onRemove={() => saveLocation(undefined)} onClose={() => setLocationOpen(false)} />}
              {!locationOpen && chatLocation && <LocationChip location={chatLocation} onEdit={() => setLocationOpen(true)} onRemove={() => saveLocation(undefined)} />}
              {(templates || templatePreview) && <TemplateStrip initialCategory={templatePreview ?? templateCategory} categoryRequest={templateCategoryRequest} onClose={() => { setTemplates(false); setTemplatePreview(undefined); }} onPick={template => { setTemplates(false); setTemplatePreview(undefined); setPromptSeed({ text: (template.prompt ?? template.body).trim(), key: Date.now(), mode: 'chat' }); const files = [template.artifactPath, template.instructionPath].filter((path): path is string => !!path); setAttachments(previous => [...new Set([...previous.filter(path => !templateFiles.includes(path)), ...files])]); setTemplateFiles(files); }} />}<QueuedMessages key={`queue-${activeId}`} items={queued} paused={queuePaused} pauseReason={queuePauseReason} />
              <Composer key={activeId} project={!chatStarted ? <ProjectPicker projects={shownProjects} activePath={projectPath} disabled={running} /> : undefined} onTemplatePreview={setTemplatePreview} onCommand={runCommand} commandRequest={commandRequest} pinnedChat={active?.pinned} unavailableCommands={{ ...(!chatStarted ? { forkChat: 'Starte zuerst einen Chat', exportChat: 'Starte zuerst einen Chat', compactChat: 'Starte zuerst einen Chat' } : {}), ...(running ? { archiveChat: 'Warte, bis die Antwort fertig ist', forkChat: 'Warte, bis die Antwort fertig ist', compactChat: 'Warte, bis die Antwort fertig ist', clearChat: 'Warte, bis die Antwort fertig ist' } : {}) }} accounts={accounts} tags={tags} customCommands={customCommands} connectors={connectors} running={running} permissionMode={permissionMode} askPermission={askPermission} attachments={attachments} attachmentPreviews={{ ...Object.fromEntries(Object.entries(attachmentThumbs).filter((entry): entry is [string, string] => !!entry[1])), ...imagePreviews }} pinnedTarget={pinnedTarget} pinnedStandard={pinnedStandard} promptSeed={promptSeed} imageSeed={imageSeed} imageWorkspace={!!viewedImage} onImageProviderChange={setImageProviderChoice} onImageOrder={(provider, order) => vscode.postMessage({ kind: 'setImageAccountOrder', provider, accounts: order })} onPickAttachments={() => vscode.postMessage({ kind: 'pickAttachments' })} onAddFolder={() => vscode.postMessage({ kind: 'addProject' })} onConnectors={draft => runCommand('openConnectors', draft)} onTemplates={() => setTemplates(v => !v)} onLocation={() => setLocationOpen(true)} onVoiceSettings={draft => { setPromptSeed({ text: draft, key: Date.now() }); setSettingsRoute({ id: 'stimme', sub: [] }); setPage('settings'); }} onRemoveAttachment={path => setAttachments(prev => prev.filter(p => p !== path))} onSend={send} onCancel={() => vscode.postMessage({ kind: 'cancel' })} onPinnedTarget={pickTarget} onModeChange={({ ask, ...modes }) => { if (ask !== undefined) setAskPermission(ask); if (modes.permissionMode) setPermissionMode(modes.permissionMode); if (modes.routingMode) setRoutingMode(modes.routingMode); if (modes.permissionMode || modes.routingMode || ask !== undefined) vscode.postMessage({ kind: 'setModes', ...modes, ask }); }} />
              {empty && !hydrating && <div class="cx-suggestions cx-start-pills" aria-label="Einstiege">{START_PROMPTS.map(s => <button key={s.label} onClick={() => setPromptSeed({ text: s.text, key: Date.now() })}><Glyph name={s.icon} size={15} /><span>{s.label}</span></button>)}</div>}
              {empty && routable.length === 0 && <div class="cx-connect-nudge"><div><Glyph name="link" size={17} /><span><strong>Mit deinem eigenen KI-Abo starten</strong><small>Claude, ChatGPT oder Grok · auch mehrere Konten</small></span></div><button onClick={() => setPage('accounts')}>Abo verbinden <Glyph name="arrow" size={13} /></button></div>}
            </div>
  
          </div>
          {chatStarted && controlOpen && !review && !viewedImage && (!dock.fullscreen || !dockOpen) && <ControlPanel key={activeId} conversationId={conversations.find(c => c.id === activeId)?.parentId ?? activeId} onSwarm={() => setPage('agents')} onChat={openTask} fit={cardFit} items={items} onImage={openImage} onOpen={openPath} onAgent={openAgent} onCreate={() => setPromptSeed({ text: 'Erstelle eine Datei oder Website: ', key: Date.now() })} onClose={() => setControlOpen(false)} />}
        </div>
        {review && <ReviewPanel touched={touched} code={code} onClose={() => { setReview(false); setCode(undefined); }} onBack={() => setCode(undefined)} />}
        {dockOpen && !review && <Dock state={dock} onState={setDock} conversationId={activeId} workspace={workspace} projectName={projectName ?? 'Projekt'} transcript={transcript} items={items} motion={dockMotion} onClose={closeDock} onHide={hideDock} onPick={pickPane} onLiveWidth={setLiveDockWidth} />}
        {!dockOpen && leavingDock && !review && <Dock state={leavingDock} onState={() => {}} conversationId={activeId} workspace={workspace} projectName={projectName ?? 'Projekt'} transcript={transcript} items={items} motion="leave" onClose={() => {}} onHide={() => {}} onPick={() => {}} />}
      </div>}
    </main>
    {editing && <ProjectEditor project={editing} onClose={() => setEditing(undefined)} onSaved={() => setEditing(undefined)} />}
    {search !== undefined && <ConversationSearch conversations={conversations} archived={archived} onChoose={openTask} onClose={() => setSearch(undefined)} />}
  </div>;
}
