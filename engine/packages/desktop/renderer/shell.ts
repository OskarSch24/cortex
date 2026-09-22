// Use Monaco's complete editor entry so its lazy language services and diff
// contributions share the same initialized service collection.
import * as monaco from 'monaco-editor';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import './shell.css';

type Message = { type: string; [key: string]: any };
interface DesktopBridge {
  send(message: Message): void;
  subscribe(listener: (message: Message) => void): (() => void) | void;
  getFilePath(file: File): string;
}
declare global {
  interface Window { cortexDesktop?: DesktopBridge; MonacoEnvironment?: { getWorkerUrl(moduleId: string, label: string): string } }
}

const bridge = window.cortexDesktop;
if (bridge) startShell(bridge);

function startShell(host: DesktopBridge): void {
  const send = (message: Message) => host.send(message);
  const script = document.currentScript as HTMLScriptElement | null;
  const source = script?.src || [...document.scripts].find(item => /shell\.js(?:\?|$)/.test(item.src))?.src || location.href;
  window.MonacoEnvironment = { getWorkerUrl: (_moduleId, label) => {
    const name = label === 'json' ? 'json' : ['typescript', 'javascript'].includes(label) ? 'ts' : ['css', 'scss', 'less'].includes(label) ? 'css' : ['html', 'handlebars', 'razor'].includes(label) ? 'html' : 'editor';
    return new URL(`./${name}.worker.js`, source).href;
  } };
  document.body.classList.add('cortex-desktop-shell');

  const icons: Record<string, string> = {
    globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
    folder: '<path d="M3 19V6.4a1 1 0 0 1 1-1h4.5l2 2H20a1 1 0 0 1 1 1V19Z"/>',
    terminal: '<path d="m4 5 6 6-6 6m9 1h7"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    back: '<path d="m14 5-7 7 7 7"/>',
    forward: '<path d="m10 5 7 7-7 7"/>',
    reload: '<path d="M20 7v5h-5M4 17a9 9 0 0 0 16-5M4 12a9 9 0 0 1 16-5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    save: '<path d="M4 3h13l4 4v14H3V3Zm3 0v7h10V3M7 21v-7h10v7"/>',
    file: '<path d="M5 3h9l5 5v13H5Z M14 3v6h5"/>',
    chevron: '<path d="m7 10 5 5 5-5"/>',
  };
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag); node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name: string): SVGSVGElement {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24'); node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', '1.5');
    node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true'); node.innerHTML = icons[name] ?? icons.file!;
    return node;
  }
  function button(label: string, name: string, action: () => void, className = ''): HTMLButtonElement {
    const node = el('button', `cxd-icon ${className}`); node.type = 'button';
    node.title = label; node.setAttribute('aria-label', label); node.append(icon(name));
    node.addEventListener('click', action); return node;
  }
  function stored(key: string, fallback: number): number {
    try { const value = Number(localStorage.getItem(`cortex.desktop.${key}`)); return Number.isFinite(value) && value > 0 ? value : fallback; } catch { return fallback; }
  }
  function remember(key: string, value: number): void {
    try { localStorage.setItem(`cortex.desktop.${key}`, String(value)); } catch { /* Private storage is optional. */ }
  }

  const dragbar = el('div', 'cxd-dragbar'); dragbar.setAttribute('aria-hidden', 'true');
  const toolbar = el('div', 'cxd-toolbar'); toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Chat-Werkzeuge');
  const command = (value: string) => send({ type: 'command', command: value });
  const browserButton = button('Browser', 'globe', () => command(browser.visible ? 'cortex.hidePreview' : 'cortex.showPreview'));
  const filesButton = button('Dateien', 'folder', () => command(context['cortex.filesOpen'] ? 'cortex.hideFiles' : 'cortex.showFiles'));
  const terminalButton = button('Terminal', 'terminal', () => command(terminalVisible ? 'cortex.hideTerminal' : 'cortex.showTerminal'));
  const menuButton = button('Chat-Aktionen', 'more', () => toggleMenu());
  menuButton.setAttribute('aria-haspopup', 'menu'); menuButton.setAttribute('aria-expanded', 'false');
  toolbar.append(browserButton, filesButton, terminalButton, menuButton);

  const side = el('section', 'cxd-side'); side.setAttribute('aria-label', 'Arbeitsbereich');
  const sideResize = el('div', 'cxd-resize cxd-side-resize');
  const sideTabs = el('div', 'cxd-tabs cxd-side-tabs'); sideTabs.setAttribute('role', 'tablist'); sideTabs.setAttribute('aria-label', 'Geöffnete Arbeitsbereiche');
  const browserPanel = el('div', 'cxd-browser');
  const browserControls = el('form', 'cxd-browser-controls'); browserControls.setAttribute('aria-label', 'Browser-Navigation');
  const back = button('Im Browser zurück', 'back', () => send({ type: 'browser-back' }));
  const forward = button('Im Browser vorwärts', 'forward', () => send({ type: 'browser-forward' }));
  const reload = button('Seite neu laden', 'reload', () => send({ type: 'browser-reload' }));
  const address = el('input', 'cxd-address'); address.type = 'text'; address.placeholder = 'Adresse oder localhost';
  address.setAttribute('aria-label', 'Browser-Adresse'); address.spellcheck = false; address.autocomplete = 'off';
  address.addEventListener('focus', () => address.select());
  browserControls.addEventListener('submit', event => { event.preventDefault(); const value = address.value.trim(); if (value) send({ type: 'browser-navigate', url: value }); });
  browserControls.append(back, forward, reload, address, button('Browser schließen', 'close', () => send({ type: 'browser-close' })));
  const browserContent = el('div', 'cxd-browser-content'); browserContent.setAttribute('aria-label', 'Integrierte Webseite');
  const browserNotice = el('p', 'cxd-browser-notice', 'Öffne eine Adresse, um die Seite hier anzuzeigen.');
  browserContent.append(browserNotice); browserPanel.append(browserControls, browserContent);

  const editorPanel = el('div', 'cxd-editor-panel');
  const editorHeader = el('div', 'cxd-editor-header');
  const editorPath = el('span', 'cxd-editor-path');
  const editorStatus = el('span', 'cxd-editor-status'); editorStatus.setAttribute('role', 'status');
  const editorSave = button('Datei speichern', 'save', () => saveEditor());
  editorHeader.append(editorPath, editorStatus, editorSave);
  const editorSurface = el('div', 'cxd-editor-surface');
  const diffSurface = el('div', 'cxd-editor-surface'); diffSurface.hidden = true;
  editorPanel.append(editorHeader, editorSurface, diffSurface);
  side.append(sideResize, sideTabs, browserPanel, editorPanel);

  const terminalPanel = el('section', 'cxd-terminal'); terminalPanel.setAttribute('aria-label', 'Terminal');
  const terminalResize = el('div', 'cxd-resize cxd-terminal-resize');
  const terminalHeader = el('div', 'cxd-terminal-header');
  const terminalTabs = el('div', 'cxd-tabs'); terminalTabs.setAttribute('role', 'tablist'); terminalTabs.setAttribute('aria-label', 'Terminal-Sitzungen');
  terminalHeader.append(terminalTabs, button('Neue Terminal-Sitzung', 'plus', () => send({ type: 'terminal-new' })), button('Terminal ausblenden', 'chevron', () => { terminalVisible = false; send({ type: 'terminal-hide' }); layout(); }));
  const terminalsHost = el('div', 'cxd-terminals');
  terminalPanel.append(terminalResize, terminalHeader, terminalsHost);
  const toast = el('div', 'cxd-toast'); toast.hidden = true; toast.setAttribute('role', 'status');
  // Der Ziehstreifen kommt vor die Oberfläche: Electron sammelt die Ziehflächen
  // in Dokumentreihenfolge, und die spätere Ausnahme gewinnt. Stünde er hinten,
  // schluckte er die Klicks auf die Knöpfe in den obersten 44 Pixeln.
  document.body.prepend(dragbar);
  document.body.append(toolbar, side, terminalPanel, toast);

  const context: Record<string, unknown> = {};
  let config: Record<string, unknown> = {};
  let paneWidth = stored('paneWidth', Math.max(420, window.innerWidth * .43));
  let terminalHeight = stored('terminalHeight', 260);
  let terminalVisible = false;
  let sideOpenedOnCurrentPage = false;
  let terminalOpenedOnCurrentPage = false;
  let activeTerminal = '';
  let activePanel = '';
  let browser = { visible: false, url: '', title: 'Browser', canBack: false, canForward: false, loading: false, error: '' };
  let menu: HTMLElement | undefined;
  let prompt: HTMLElement | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let resizeFrame = 0;
  let lastBrowserBounds = '';
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let diffEditor: monaco.editor.IStandaloneDiffEditor | undefined;
  let changingModel = false;
  interface FileEntry { id: string; path: string; model: monaco.editor.ITextModel; original?: monaco.editor.ITextModel; saved: string; readonly: boolean; view?: monaco.editor.ICodeEditorViewState | null; timer?: ReturnType<typeof setTimeout>; autoSave?: ReturnType<typeof setTimeout>; saving?: boolean; savingText?: string }
  interface TermEntry { id: string; name: string; cwd?: string; term: Terminal; fit: FitAddon; host: HTMLElement; exited?: boolean }
  const files = new Map<string, FileEntry>();
  const diagnostics = new Map<string, Record<string, any[]>>();
  const terminals = new Map<string, TermEntry>();
  const pendingTerminalData = new Map<string, string>();
  const promptQueue: Message[] = [];
  let activePrompt: Message | undefined;

  function notify(text: string, error = false): void {
    clearTimeout(toastTimer); toast.textContent = text; toast.hidden = false;
    toast.classList.toggle('is-error', error); toast.setAttribute('role', error ? 'alert' : 'status');
    toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 9000 : 4500);
  }
  function isChat(): boolean { return context['cortex.chatToolsVisible'] !== false; }
  function fileDirty(file: FileEntry): boolean { return file.model.getValue() !== file.saved; }
  function setActivePanel(id: string): void {
    const previous = files.get(activePanel);
    if (previous && editor && !previous.original) previous.view = editor.saveViewState();
    activePanel = id;
    if (files.has(id)) { send({ type: 'editor-active', id }); renderEditor(); }
    renderSideTabs(); layout();
  }
  function renderSideTabs(): void {
    sideTabs.replaceChildren();
    const tab = (id: string, label: string, title: string, close: () => void, dirty = false) => {
      const wrapper = el('div', `cxd-tab-wrap${activePanel === id ? ' selected' : ''}`);
      const item = el('button', 'cxd-tab', label); item.type = 'button'; item.title = title;
      item.setAttribute('role', 'tab'); item.setAttribute('aria-selected', String(activePanel === id));
      item.addEventListener('click', () => setActivePanel(id));
      if (dirty) { const mark = el('span', 'cxd-dirty', '•'); mark.setAttribute('aria-label', 'Ungespeicherte Änderungen'); item.append(mark); }
      const closeButton = button(`${label} schließen`, 'close', close, 'cxd-tab-close');
      wrapper.append(item, closeButton); sideTabs.append(wrapper);
    };
    if (browser.visible) tab('browser', browser.title || 'Browser', browser.url || 'Browser', () => send({ type: 'browser-close' }));
    for (const file of files.values()) tab(file.id, file.path.split('/').pop() || file.path || 'Unbenannt', file.path, () => send({ type: 'editor-close', id: file.id }), fileDirty(file));
  }
  function renderTerminalTabs(): void {
    terminalTabs.replaceChildren();
    for (const entry of terminals.values()) {
      const wrapper = el('div', `cxd-tab-wrap${activeTerminal === entry.id ? ' selected' : ''}`);
      const label = `${entry.name}${entry.exited ? ' · beendet' : ''}`;
      const item = el('button', 'cxd-tab', label); item.type = 'button'; item.title = entry.cwd || label;
      item.setAttribute('role', 'tab'); item.setAttribute('aria-selected', String(activeTerminal === entry.id));
      item.addEventListener('click', () => { activeTerminal = entry.id; renderTerminalTabs(); layout(); entry.term.focus(); });
      wrapper.append(item, button(`${entry.name} beenden`, 'close', () => send({ type: 'terminal-close', id: entry.id }), 'cxd-tab-close'));
      terminalTabs.append(wrapper); entry.host.hidden = activeTerminal !== entry.id;
    }
  }
  function layout(): void {
    const rightVisible = (isChat() || sideOpenedOnCurrentPage) && (files.size > 0 || browser.visible);
    const termVisible = (isChat() || terminalOpenedOnCurrentPage) && terminalVisible && terminals.size > 0;
    paneWidth = Math.max(320, Math.min(paneWidth, Math.max(320, window.innerWidth - 360)));
    terminalHeight = Math.max(140, Math.min(terminalHeight, Math.max(140, window.innerHeight - 220)));
    document.documentElement.style.setProperty('--cxd-pane-width', rightVisible ? `${paneWidth}px` : '0px');
    document.documentElement.style.setProperty('--cxd-terminal-height', termVisible ? `${terminalHeight}px` : '0px');
    document.body.classList.toggle('cxd-auto-sidebar', rightVisible && window.innerWidth - paneWidth < 620);
    document.body.classList.toggle('cxd-compact-workspace', window.innerHeight - (termVisible ? terminalHeight : 0) < 480);
    const main = document.querySelector('.cx-main');
    document.documentElement.style.setProperty('--cxd-terminal-left', main ? `${Math.max(0, Math.round(main.getBoundingClientRect().left))}px` : '0px');
    side.hidden = !rightVisible; terminalPanel.hidden = !termVisible; toolbar.hidden = !isChat();
    browserPanel.hidden = activePanel !== 'browser'; editorPanel.hidden = !files.has(activePanel);
    browserButton.classList.toggle('selected', browser.visible); browserButton.setAttribute('aria-pressed', String(browser.visible));
    filesButton.classList.toggle('selected', !!context['cortex.filesOpen']); filesButton.setAttribute('aria-pressed', String(!!context['cortex.filesOpen']));
    terminalButton.classList.toggle('selected', terminalVisible); terminalButton.setAttribute('aria-pressed', String(terminalVisible));
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (rightVisible && files.has(activePanel)) { editor?.layout(); diffEditor?.layout(); }
      if (termVisible) {
        const entry = terminals.get(activeTerminal);
        if (entry) { entry.fit.fit(); send({ type: 'terminal-resize', id: entry.id, cols: entry.term.cols, rows: entry.term.rows }); }
      }
      const rect = browserContent.getBoundingClientRect();
      const value = { type: 'browser-bounds', x: Math.round(rect.x), y: Math.round(rect.y), width: Math.max(0, Math.round(rect.width)), height: Math.max(0, Math.round(rect.height)), visible: !!(rightVisible && activePanel === 'browser' && !prompt && !menu) };
      const encoded = JSON.stringify(value);
      if (encoded !== lastBrowserBounds) { lastBrowserBounds = encoded; send(value); }
    });
  }
  function resizeHandle(handle: HTMLElement, axis: 'horizontal' | 'vertical'): void {
    handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', axis === 'horizontal' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', axis === 'horizontal' ? 'Arbeitsbereich vergrößern oder verkleinern' : 'Terminalhöhe ändern');
    const change = (delta: number) => { if (axis === 'horizontal') paneWidth += delta; else terminalHeight += delta; layout(); };
    handle.addEventListener('keydown', event => {
      const minus = axis === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
      const plus = axis === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      if (event.key === minus || event.key === plus) { event.preventDefault(); change(event.key === plus ? 20 : -20); remember(axis === 'horizontal' ? 'paneWidth' : 'terminalHeight', axis === 'horizontal' ? paneWidth : terminalHeight); }
    });
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return; event.preventDefault(); handle.setPointerCapture(event.pointerId);
      let position = axis === 'horizontal' ? event.clientX : event.clientY;
      const move = (next: PointerEvent) => { const at = axis === 'horizontal' ? next.clientX : next.clientY; change(position - at); position = at; };
      const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); remember(axis === 'horizontal' ? 'paneWidth' : 'terminalHeight', axis === 'horizontal' ? paneWidth : terminalHeight); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
    });
  }
  resizeHandle(sideResize, 'horizontal'); resizeHandle(terminalResize, 'vertical');
  window.addEventListener('resize', layout);
  new ResizeObserver(layout).observe(browserContent);
  const mainResize = new ResizeObserver(layout);
  let observedMain: Element | null = null;
  const followMain = () => {
    const main = document.querySelector('.cx-main');
    if (main === observedMain) return;
    if (observedMain) mainResize.unobserve(observedMain);
    observedMain = main; if (main) mainResize.observe(main); layout();
  };
  new MutationObserver(followMain).observe(document.getElementById('root')!, { childList: true, subtree: true });
  followMain();

  function closeMenu(): void { menu?.remove(); menu = undefined; menuButton.setAttribute('aria-expanded', 'false'); layout(); }
  function toggleMenu(): void {
    if (menu) { closeMenu(); return; }
    menu = el('div', 'cxd-menu'); menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Chat-Aktionen');
    const items = [
      ['Dateien', 'cortex.showFiles'], ['Änderungen', 'cortex.showChanges'], ['Transkript-Ansicht', 'cortex.showTranscript'], ['Excalidraw', 'cortex.showCanvas'],
      ['Chat kopieren', 'cortex.copyChat'], ['Chat exportieren …', 'cortex.exportChat'], ['', ''],
      ['Umbenennen', 'cortex.renameChat'], ['Ausgabestil', 'cortex.outputStyle'], ['Fork', 'cortex.forkChat'], ['', ''],
      ['Computer wach halten', 'cortex.keepAwake'], ['', ''], ['Archivieren', 'cortex.archiveChat'], ['Löschen', 'cortex.deleteChat'],
    ];
    for (const [label, cmd] of items) {
      if (!label) { const rule = el('hr'); rule.setAttribute('role', 'separator'); menu.append(rule); continue; }
      const item = el('button', '', label); item.type = 'button'; item.setAttribute('role', 'menuitem');
      item.addEventListener('click', () => { closeMenu(); command(cmd!); }); menu.append(item);
    }
    menu.addEventListener('keydown', event => {
      const options = [...menu!.querySelectorAll<HTMLButtonElement>('button')];
      const at = options.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); menuButton.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); options[event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus(); }
    });
    document.body.append(menu); menuButton.setAttribute('aria-expanded', 'true'); menu.querySelector('button')?.focus(); layout();
  }
  document.addEventListener('pointerdown', event => { if (menu && !menu.contains(event.target as Node) && !menuButton.contains(event.target as Node)) closeMenu(); });

  function editorOptions(): monaco.editor.IStandaloneEditorConstructionOptions {
    const lineNumbers = config['editor.lineNumbers']; const wrap = config['editor.wordWrap'];
    return {
      theme: document.documentElement.dataset.theme === 'light' ? 'vs' : 'cortex-dark',
      fontSize: Number(config['editor.fontSize']) || 14, fontFamily: String(config['editor.fontFamily'] || "'SF Mono', Menlo, monospace"),
      tabSize: Number(config['editor.tabSize']) || 4, insertSpaces: config['editor.insertSpaces'] !== false,
      wordWrap: ['off', 'on', 'wordWrapColumn', 'bounded'].includes(String(wrap)) ? wrap as any : 'off',
      lineNumbers: ['off', 'on', 'relative', 'interval'].includes(String(lineNumbers)) ? lineNumbers as any : 'on',
      minimap: { enabled: config['editor.minimap.enabled'] !== false },
      automaticLayout: true, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 },
      accessibilitySupport: 'auto', fixedOverflowWidgets: true, contextmenu: true,
      ariaLabel: 'Dateiinhalt', renderLineHighlight: 'gutter', smoothScrolling: true,
    };
  }
  monaco.editor.defineTheme('cortex-dark', { base: 'vs-dark', inherit: true, rules: [], colors: {
    'editor.background': '#181818', 'editor.foreground': '#ededee', 'editor.lineHighlightBackground': '#ffffff06',
    'editorLineNumber.foreground': '#707277', 'editor.selectionBackground': '#ffffff25', 'editorWidget.background': '#272727',
  } });
  function ensureEditor(): void {
    if (editor) return;
    editor = monaco.editor.create(editorSurface, { ...editorOptions(), model: null });
    editor.onDidChangeCursorSelection(event => {
      const file = files.get(activePanel); if (!file || changingModel) return;
      send({ type: 'editor-selection', id: file.id, selection: { startLine: event.selection.startLineNumber - 1, startCharacter: event.selection.startColumn - 1, endLine: event.selection.endLineNumber - 1, endCharacter: event.selection.endColumn - 1 } });
    });
    editor.onDidBlurEditorText(() => { if (config['files.autoSave'] === 'onFocusChange') void saveEditor(); });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveEditor());
  }
  function renderEditor(): void {
    const file = files.get(activePanel); if (!file) return;
    ensureEditor(); changingModel = true;
    if (file.original) {
      if (!diffEditor) {
        diffEditor = monaco.editor.createDiffEditor(diffSurface, { ...editorOptions(), readOnly: file.readonly, originalEditable: false, renderSideBySide: true });
        diffEditor.getModifiedEditor().onDidChangeCursorSelection(event => {
          const current = files.get(activePanel); if (!current || changingModel) return;
          send({ type: 'editor-selection', id: current.id, selection: { startLine: event.selection.startLineNumber - 1, startCharacter: event.selection.startColumn - 1, endLine: event.selection.endLineNumber - 1, endCharacter: event.selection.endColumn - 1 } });
        });
        diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveEditor());
      }
      diffEditor.setModel({ original: file.original, modified: file.model });
      diffEditor.updateOptions({ ...editorOptions(), readOnly: file.readonly });
      editorSurface.hidden = true; diffSurface.hidden = false;
    } else {
      editor!.setModel(file.model); editor!.updateOptions({ ...editorOptions(), readOnly: file.readonly });
      if (file.view) editor!.restoreViewState(file.view);
      editorSurface.hidden = false; diffSurface.hidden = true;
    }
    changingModel = false; editorPath.textContent = file.path; editorPath.title = file.path;
    refreshEditorStatus();
  }
  function refreshEditorStatus(): void {
    const file = files.get(activePanel); if (!file) return;
    editorStatus.textContent = file.saving ? 'Wird gespeichert …' : file.readonly ? 'Schreibgeschützt' : fileDirty(file) ? 'Nicht gespeichert' : 'Gespeichert';
    editorSave.disabled = file.readonly || !!file.saving || !fileDirty(file);
  }
  function openEditor(message: Message): void {
    sideOpenedOnCurrentPage = true;
    const id = String(message.id); const text = String(message.text ?? message.modified ?? '');
    let file = files.get(id);
    if (file) {
      // Reopening a dirty tab must never silently discard its working copy.
      if (!fileDirty(file) && file.model.getValue() !== text) { file.saved = text; file.model.setValue(text); }
      file.readonly = !!message.readonly;
    } else {
      // Build the URI from decoded path pieces. Encoding an entire absolute
      // path as one piece creates encoded slash aliases that TS workers cannot
      // consistently match to their mirrored document.
      const model = monaco.editor.createModel(text, String(message.language || languageForPath(message.path)), monaco.Uri.from({ scheme: 'inmemory', authority: 'cortex', path: `/${encodeURIComponent(id)}/${String(message.path || 'untitled').split('/').pop()}` }));
      file = { id, path: String(message.path || 'Unbenannt'), model, saved: text, readonly: !!message.readonly };
      if (message.type === 'editor-diff' || message.original !== undefined) file.original = monaco.editor.createModel(String(message.original ?? ''), model.getLanguageId());
      files.set(id, file); applyDiagnostics();
      const entry = file;
      model.onDidChangeContent(() => {
        if (changingModel) return;
        // The host decides whether closing a tab needs a save prompt. Keep its
        // working copy current synchronously so closing immediately after a
        // keystroke cannot lose that edit.
        send({ type: 'editor-change', id, text: model.getValue() });
        clearTimeout(entry.autoSave);
        if (config['files.autoSave'] === 'afterDelay' && !entry.readonly) entry.autoSave = setTimeout(() => saveEditor(id), 1000);
        refreshEditorStatus(); renderSideTabs();
      });
    }
    setActivePanel(id);
    requestAnimationFrame(() => { if (file?.original) diffEditor?.getModifiedEditor().focus(); else editor?.focus(); });
  }
  function languageForPath(path: unknown): string {
    const ext = String(path || '').split('.').pop()?.toLowerCase();
    return ({ js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', mdx: 'markdown', py: 'python', sh: 'shell', bash: 'shell', zsh: 'shell', html: 'html', htm: 'html', css: 'css', sql: 'sql', yaml: 'yaml', yml: 'yaml', swift: 'swift', xml: 'xml', svg: 'xml', plist: 'xml' } as Record<string, string>)[ext || ''] || 'plaintext';
  }
  async function saveEditor(id = activePanel): Promise<void> {
    const file = files.get(id); if (!file || file.readonly || file.saving || !fileDirty(file)) return;
    clearTimeout(file.autoSave); clearTimeout(file.timer);
    if (config['editor.formatOnSave'] === true && id === activePanel) {
      const view = file.original ? diffEditor?.getModifiedEditor() : editor;
      const action = view?.getAction('editor.action.formatDocument');
      if (action?.isSupported()) await action.run();
    }
    let text = file.model.getValue();
    if (config['files.trimTrailingWhitespace'] === true) text = text.replace(/[\t ]+$/gm, '');
    if (config['files.insertFinalNewline'] === true && text && !text.endsWith('\n')) text += '\n';
    if (text !== file.model.getValue()) file.model.pushEditOperations([], [{ range: file.model.getFullModelRange(), text }], () => null);
    file.saving = true; file.savingText = text; refreshEditorStatus(); send({ type: 'editor-save', id, text });
  }
  function closeEditor(id: string): void {
    const file = files.get(id); if (!file) return;
    clearTimeout(file.timer); clearTimeout(file.autoSave);
    if (activePanel === id) { editor?.setModel(null); diffEditor?.setModel(null); }
    file.model.dispose(); file.original?.dispose(); files.delete(id);
    if (activePanel === id) activePanel = [...files.keys()].at(-1) || (browser.visible ? 'browser' : '');
    if (files.has(activePanel)) { renderEditor(); send({ type: 'editor-active', id: activePanel }); }
    renderSideTabs(); layout();
  }
  function openTerminal(message: Message): void {
    terminalOpenedOnCurrentPage = true;
    const id = String(message.id); let entry = terminals.get(id);
    if (!entry) {
      const container = el('div', 'cxd-terminal-session'); terminalsHost.append(container);
      const term = new Terminal({ cursorBlink: true, fontFamily: "'SF Mono', Menlo, monospace", fontSize: Number(config['terminal.integrated.fontSize']) || 13, cursorStyle: terminalCursor(), scrollback: Number(config['terminal.integrated.scrollback'] ?? 10000), theme: { background: '#181818', foreground: '#ededee', cursor: '#ededee', selectionBackground: '#ffffff30' }, allowProposedApi: false });
      const fit = new FitAddon(); term.loadAddon(fit); term.open(container);
      entry = { id, name: String(message.name || 'Terminal'), cwd: message.cwd, term, fit, host: container }; terminals.set(id, entry);
      term.onData(data => send({ type: 'terminal-input', id, data }));
      term.onResize(size => send({ type: 'terminal-resize', id, ...size }));
      const pending = pendingTerminalData.get(id); if (pending) { term.write(pending); pendingTerminalData.delete(id); }
    }
    activeTerminal = id; terminalVisible = true; renderTerminalTabs(); layout();
    requestAnimationFrame(() => entry?.term.focus());
  }
  function terminalCursor(): 'block' | 'bar' | 'underline' { return config['terminal.integrated.cursorStyle'] === 'line' ? 'bar' : config['terminal.integrated.cursorStyle'] === 'underline' ? 'underline' : 'block'; }
  function applyDiagnostics(): void {
    for (const file of files.values()) for (const [owner, entries] of diagnostics) {
      const rows = Object.entries(entries).filter(([uri]) => {
        if (uri === file.path) return true;
        try { return monaco.Uri.parse(uri).fsPath === file.path; } catch { return false; }
      }).flatMap(([, values]) => Array.isArray(values) ? values : []);
      monaco.editor.setModelMarkers(file.model, owner, rows.map(value => ({
        message: String(value.message || ''), source: value.source,
        severity: [monaco.MarkerSeverity.Error, monaco.MarkerSeverity.Warning, monaco.MarkerSeverity.Info, monaco.MarkerSeverity.Hint][Number(value.severity ?? 0)] || monaco.MarkerSeverity.Error,
        startLineNumber: Number(value.range?.start?.line ?? 0) + 1, startColumn: Number(value.range?.start?.character ?? 0) + 1,
        endLineNumber: Number(value.range?.end?.line ?? 0) + 1, endColumn: Number(value.range?.end?.character ?? 0) + 1,
      })));
    }
  }
  function applyConfig(values: Record<string, unknown>): void {
    config = { ...config, ...values }; editor?.updateOptions(editorOptions()); diffEditor?.updateOptions(editorOptions());
    for (const file of files.values()) file.model.updateOptions({ tabSize: Number(config['editor.tabSize']) || 4, insertSpaces: config['editor.insertSpaces'] !== false });
    for (const entry of terminals.values()) { entry.term.options.fontSize = Number(config['terminal.integrated.fontSize']) || 13; entry.term.options.cursorStyle = terminalCursor(); entry.term.options.scrollback = Number(config['terminal.integrated.scrollback'] ?? 10000); }
    layout();
  }
  window.addEventListener('blur', () => { if (config['files.autoSave'] === 'onWindowChange') for (const id of files.keys()) void saveEditor(id); });
  window.addEventListener('message', event => {
    if (event.origin && event.origin !== window.origin) return;
    if (event.data?.kind === 'nativeSettings') applyConfig(event.data.values ?? {});
    if (event.data?.kind === 'desktop-host-ping' && typeof event.data.token === 'string') send({ type: 'host-roundtrip', token: event.data.token });
  });

  function showNextPrompt(): void {
    if (activePrompt || !promptQueue.length) return;
    const request = promptQueue.shift()!; activePrompt = request;
    const previousFocus = document.activeElement as HTMLElement | null;
    prompt = el('div', 'cxd-modal-backdrop');
    const dialog = el('form', 'cxd-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const title = el('h2', '', String(request.title || (request.kind === 'pick' ? 'Auswählen' : 'Eingabe'))); title.id = 'cxd-prompt-title'; dialog.setAttribute('aria-labelledby', title.id);
    const input = el('input', 'cxd-prompt-input'); input.type = request.password ? 'password' : 'text'; input.placeholder = String(request.placeholder || ''); input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', String(request.placeholder || request.title || 'Eingabe')); input.value = request.kind === 'input' ? String(request.value ?? '') : '';
    const items = Array.isArray(request.items) ? request.items : [];
    const selected = new Set<number>(items.flatMap((item: any, index: number) => item?.picked ? [index] : []));
    const choices = el('div', 'cxd-prompt-choices'); choices.setAttribute('role', 'listbox'); choices.setAttribute('aria-label', 'Auswahl'); if (request.canPickMany) choices.setAttribute('aria-multiselectable', 'true');
    let visibleItems: number[] = []; let focusedIndex = 0;
    const valueFor = (index: number) => { const item = items[index]; return typeof item === 'string' ? item : item.value !== undefined ? item.value : item.id !== undefined ? item.id : index; };
    const finish = (value?: unknown) => {
      send({ type: 'prompt-result', id: request.id, ...(value !== undefined ? { value } : {}) });
      prompt?.remove(); prompt = undefined; activePrompt = undefined; previousFocus?.focus(); layout(); showNextPrompt();
    };
    const draw = () => {
      choices.replaceChildren(); visibleItems = [];
      const query = input.value.trim().toLocaleLowerCase();
      items.forEach((raw: any, index: number) => {
        const item = typeof raw === 'string' ? { label: raw } : raw;
        if (item.kind === -1 || item.kind === 'separator') { const heading = el('div', 'cxd-prompt-group', String(item.label || '')); choices.append(heading); return; }
        if (!item.alwaysShow && query && !`${item.label || ''} ${item.description || ''} ${item.detail || ''}`.toLocaleLowerCase().includes(query)) return;
        const row = el('button', 'cxd-choice'); row.type = 'button'; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(selected.has(index))); row.disabled = !!item.disabled;
        if (!row.disabled) visibleItems.push(index);
        const caption = el('div', 'cxd-choice-caption'); caption.append(el('strong', '', String(item.label || ''))); if (item.description) caption.append(el('span', '', String(item.description)));
        row.append(caption); if (item.detail) row.append(el('small', '', String(item.detail)));
        row.classList.toggle('selected', selected.has(index)); row.dataset.index = String(index);
        row.addEventListener('click', () => { if (request.canPickMany) { selected.has(index) ? selected.delete(index) : selected.add(index); draw(); } else finish(valueFor(index)); }); choices.append(row);
      });
      focusedIndex = Math.max(0, Math.min(focusedIndex, visibleItems.length - 1));
      if (!visibleItems.length) choices.append(el('p', 'cxd-empty', 'Keine passenden Einträge.'));
      highlight();
    };
    const highlight = () => { for (const row of choices.querySelectorAll<HTMLElement>('.cxd-choice')) { const active = Number(row.dataset.index) === visibleItems[focusedIndex]; row.classList.toggle('focused', active); if (active) row.scrollIntoView({ block: 'nearest' }); } };
    input.addEventListener('input', () => { focusedIndex = 0; draw(); });
    const controls = el('div', 'cxd-dialog-actions'); const cancel = el('button', 'cxd-secondary', 'Abbrechen'); cancel.type = 'button'; cancel.addEventListener('click', () => finish());
    const confirm = el('button', 'cxd-primary', request.kind === 'pick' ? 'Übernehmen' : 'Bestätigen'); confirm.type = 'submit'; controls.append(cancel, confirm);
    dialog.append(title); if (request.detail) dialog.append(el('p', 'cxd-prompt-detail', String(request.detail))); dialog.append(input); if (request.kind === 'pick') { dialog.append(choices); draw(); } dialog.append(controls);
    dialog.addEventListener('submit', event => { event.preventDefault(); if (request.kind === 'input') finish(input.value); else if (request.canPickMany) finish([...selected].map(valueFor)); else if (visibleItems[focusedIndex] !== undefined) finish(valueFor(visibleItems[focusedIndex]!)); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
      if (request.kind === 'pick' && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); focusedIndex = (focusedIndex + (event.key === 'ArrowDown' ? 1 : -1) + visibleItems.length) % Math.max(1, visibleItems.length); highlight(); }
      if (event.key === 'Tab') {
        const focusables = [...dialog.querySelectorAll<HTMLElement>('input, button:not([disabled])')]; const first = focusables[0], last = focusables.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    prompt.addEventListener('pointerdown', event => { if (event.target === prompt) finish(); });
    prompt.append(dialog); document.body.append(prompt); layout(); input.focus(); if (request.kind === 'input') input.select();
  }

  function receive(message: Message): void {
    switch (message.type) {
      case 'context': {
        const key = String(message.key);
        if (key === 'cortex.chatToolsVisible' && context[key] !== message.value) { sideOpenedOnCurrentPage = false; terminalOpenedOnCurrentPage = false; }
        context[key] = message.value; if (!isChat()) closeMenu(); layout(); break;
      }
      case 'config': applyConfig(message.values ?? {}); break;
      case 'diagnostics': diagnostics.set(String(message.name || 'cortex'), message.entries ?? {}); applyDiagnostics(); break;
      case 'window-state': document.documentElement.classList.toggle('cxd-fullscreen', !!message.fullscreen); break;
      case 'browser-state': {
        const wasVisible = browser.visible; browser = { ...browser, ...message };
        // Opening/loading can recreate or temporarily hide the native view.
        // Re-send the current bounds even if their geometry did not change.
        lastBrowserBounds = '';
        if (browser.visible && (!wasVisible || message.activate)) { activePanel = 'browser'; sideOpenedOnCurrentPage = true; }
        if (!browser.visible && activePanel === 'browser') activePanel = [...files.keys()].at(-1) || '';
        if (document.activeElement !== address) address.value = browser.url === 'about:blank' ? '' : browser.url;
        back.disabled = !browser.canBack; forward.disabled = !browser.canForward;
        browserNotice.textContent = browser.error || (browser.loading ? 'Seite wird geladen …' : 'Öffne eine Adresse, um die Seite hier anzuzeigen.');
        browserNotice.hidden = !!browser.url && browser.url !== 'about:blank' && !browser.error;
        renderSideTabs(); if (files.has(activePanel)) renderEditor(); layout(); break;
      }
      case 'terminal-open': openTerminal(message); break;
      case 'terminal-data': {
        const entry = terminals.get(String(message.id)); const data = String(message.data ?? '');
        if (entry) entry.term.write(data); else pendingTerminalData.set(String(message.id), `${pendingTerminalData.get(String(message.id)) ?? ''}${data}`.slice(-200_000));
        break;
      }
      case 'terminal-exit': { const entry = terminals.get(String(message.id)); if (entry) { entry.exited = true; entry.term.write(`\r\n\x1b[90m[Prozess beendet${message.code !== undefined ? ` · Status ${message.code}` : ''}]\x1b[0m\r\n`); renderTerminalTabs(); } break; }
      case 'terminal-hide': terminalVisible = false; layout(); break;
      case 'terminal-show': terminalVisible = true; terminalOpenedOnCurrentPage = true; if (message.id && terminals.has(String(message.id))) activeTerminal = String(message.id); renderTerminalTabs(); layout(); break;
      case 'terminal-closed': {
        const id = String(message.id); const entry = terminals.get(id); entry?.term.dispose(); entry?.host.remove(); terminals.delete(id);
        if (activeTerminal === id) activeTerminal = [...terminals.keys()].at(-1) || '';
        if (!terminals.size) terminalVisible = false; renderTerminalTabs(); layout(); break;
      }
      case 'editor-open': case 'editor-diff': openEditor(message); break;
      case 'editor-saved': { const file = files.get(String(message.id)); if (file) { file.saved = String(message.text ?? file.savingText ?? file.saved); file.saving = false; file.savingText = undefined; refreshEditorStatus(); renderSideTabs(); } break; }
      case 'editor-error': { const file = files.get(String(message.id)); if (file) file.saving = false; refreshEditorStatus(); notify(String(message.message || 'Datei konnte nicht gespeichert werden.'), true); break; }
      case 'editor-closed': closeEditor(String(message.id)); break;
      case 'editor-save-active': void saveEditor(); break;
      case 'editor-focus': {
        if (message.id && files.has(String(message.id))) setActivePanel(String(message.id));
        const file = files.get(activePanel);
        if (file?.original) diffEditor?.getModifiedEditor().focus(); else editor?.focus();
        break;
      }
      case 'editor-format': {
        const file = files.get(activePanel); const view = file?.original ? diffEditor?.getModifiedEditor() : editor;
        const action = view?.getAction('editor.action.formatDocument');
        if (action?.isSupported()) void action.run(); else notify('Für diese Datei ist kein Formatierer verfügbar.');
        break;
      }
      case 'editor-request-close': {
        const file = files.get(String(message.id || activePanel));
        if (file) { send({ type: 'editor-change', id: file.id, text: file.model.getValue() }); send({ type: 'editor-close', id: file.id }); }
        break;
      }
      case 'prompt': promptQueue.push(message); showNextPrompt(); break;
      case 'shell-error': notify(String(message.message || 'Die Aktion konnte nicht abgeschlossen werden.'), true); break;
      case 'shell-notice': notify(String(message.message || ''), false); break;
    }
  }
  host.subscribe(receive);

  layout(); send({ type: 'shell-ready' });
}
