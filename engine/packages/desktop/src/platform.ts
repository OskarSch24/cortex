/**
 * Cortex's desktop platform. This is a small application-owned compatibility
 * boundary for the existing host services, not a VS Code extension runtime.
 * Every visible operation delegates to a real Electron service or native API.
 */
import { clipboard, dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import * as fs from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export class Disposable {
  private ended = false;
  constructor(private readonly callback: () => unknown = () => undefined) {}
  dispose(): void { if (!this.ended) { this.ended = true; this.callback(); } }
  static from(...items: Array<{ dispose(): unknown }>): Disposable {
    return new Disposable(() => { for (const item of items.reverse()) item.dispose(); });
  }
}

export class EventEmitter<T> {
  private listeners = new Set<(event: T) => unknown>();
  readonly event = (listener: (event: T) => unknown, thisArg?: unknown, disposables?: Array<{ dispose(): void }>): Disposable => {
    const wrapped = thisArg ? listener.bind(thisArg) : listener;
    this.listeners.add(wrapped);
    const disposable = new Disposable(() => this.listeners.delete(wrapped));
    disposables?.push(disposable);
    return disposable;
  };
  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      try {
        const result = listener(value);
        if (result && typeof (result as Promise<unknown>).catch === 'function') {
          void (result as Promise<unknown>).catch(error => console.error('[Cortex event]', error));
        }
      } catch (error) { console.error('[Cortex event]', error); }
    }
  }
  dispose(): void { this.listeners.clear(); }
}

export class Uri {
  private constructor(private readonly url: URL) {}
  static file(path: string): Uri { return new Uri(pathToFileURL(resolve(path))); }
  static parse(value: string): Uri { return new Uri(new URL(value)); }
  static joinPath(base: Uri, ...segments: string[]): Uri {
    if (base.scheme === 'file') return Uri.file(join(base.fsPath, ...segments));
    const url = new URL(base.toString());
    url.pathname = `${url.pathname.replace(/\/$/, '')}/${segments.map(segment => segment.split('/').map(encodeURIComponent).join('/')).join('/')}`;
    return new Uri(url);
  }
  static from(value: { scheme: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    const url = new URL(`${value.scheme}://${value.authority ?? ''}/`);
    url.pathname = value.path ?? '/'; url.search = value.query ?? ''; url.hash = value.fragment ?? '';
    return new Uri(url);
  }
  get scheme(): string { return this.url.protocol.slice(0, -1); }
  get authority(): string { return this.url.host; }
  get path(): string { return decodeURIComponent(this.url.pathname); }
  get fsPath(): string { return this.scheme === 'file' ? fileURLToPath(this.url) : this.path; }
  get query(): string { return this.url.search.slice(1); }
  get fragment(): string { return this.url.hash.slice(1); }
  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return Uri.from({ scheme: this.scheme, authority: this.authority, path: this.path, query: this.query, fragment: this.fragment, ...change });
  }
  toString(_skipEncoding?: boolean): string { return this.url.href; }
  toJSON(): Record<string, string> { return { scheme: this.scheme, authority: this.authority, path: this.path, query: this.query, fragment: this.fragment }; }
}

export class Position {
  constructor(readonly line: number, readonly character: number) {}
  isEqual(other: Position): boolean { return this.line === other.line && this.character === other.character; }
  isBefore(other: Position): boolean { return this.line < other.line || (this.line === other.line && this.character < other.character); }
  translate(lineDelta = 0, characterDelta = 0): Position { return new Position(this.line + lineDelta, this.character + characterDelta); }
}
export class Range {
  readonly start: Position;
  readonly end: Position;
  constructor(start: Position | number, end: Position | number, endLine?: number, endCharacter?: number) {
    this.start = typeof start === 'number' ? new Position(start, end as number) : start;
    this.end = typeof start === 'number' ? new Position(endLine ?? start, endCharacter ?? (end as number)) : end as Position;
  }
  get isEmpty(): boolean { return this.start.isEqual(this.end); }
}
export class Selection extends Range {
  readonly anchor: Position;
  readonly active: Position;
  constructor(anchor: Position | number, active: Position | number, activeLine?: number, activeCharacter?: number) {
    const a = typeof anchor === 'number' ? new Position(anchor, active as number) : anchor;
    const b = typeof anchor === 'number' ? new Position(activeLine ?? anchor, activeCharacter ?? (active as number)) : active as Position;
    super(b.isBefore(a) ? b : a, b.isBefore(a) ? a : b);
    this.anchor = a; this.active = b;
  }
}
export class RelativePattern {
  readonly baseUri: Uri;
  readonly base: string;
  constructor(base: Uri | string | { uri: Uri }, readonly pattern: string) {
    this.baseUri = typeof base === 'string' ? Uri.file(base) : base instanceof Uri ? base : base.uri;
    this.base = this.baseUri.fsPath;
  }
}
export const DiagnosticSeverity = { Error: 0, Warning: 1, Information: 2, Hint: 3 } as const;
export class Diagnostic {
  source?: string;
  code?: string | number;
  constructor(readonly range: Range, readonly message: string, readonly severity: number = DiagnosticSeverity.Error) {}
}
export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 } as const;
export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;
export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;
export const QuickPickItemKind = { Separator: -1, Default: 0 } as const;
export const EndOfLine = { LF: 1, CRLF: 2 } as const;
/** API compatibility level only; not the product version or a shipped VS Code runtime. */
export const version = '1.126.0';

export interface Memento {
  get<T>(key: string, fallback?: T): T | undefined;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}
export interface PlatformStorage {
  globalState: Memento;
  workspaceState: Memento;
  secrets: {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    onDidChange(listener: (event: { key: string }) => unknown): { dispose(): void };
  };
  settings: { read(): Record<string, unknown>; update(key: string, value: unknown): Promise<void> };
  onDidChangeConfiguration(listener: (event: { affectsConfiguration(section: string): boolean }) => unknown): { dispose(): void };
  globalStoragePath: string;
  flush(): Promise<void>;
}
export interface PlatformServices {
  resourcesPath: string;
  window: BrowserWindow;
  storage: PlatformStorage;
  createPanel(viewType: string, title: string, options: Record<string, unknown>, viewColumn?: number): any;
  executeBuiltin(command: string, ...args: any[]): Promise<any>;
  builtinCommands: string[];
  showEditor(document: DesktopDocument, options?: any): Promise<any>;
  createTerminal(options: Record<string, unknown>): any;
  sendShell(event: Record<string, unknown>): void;
  requestShell(request: Record<string, unknown>): Promise<any>;
}

let services: PlatformServices | undefined;
let configurationSubscription: { dispose(): void } | undefined;
let defaults: Record<string, unknown> = {};
let defaultCustomEditors: Array<{ viewType: string; patterns: RegExp[] }> = [];
let workspaceFolders: Array<{ uri: Uri; name: string; index: number }> = [];
const configurationChanged = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();
const foldersChanged = new EventEmitter<{ added: typeof workspaceFolders; removed: typeof workspaceFolders }>();
const windowStateChanged = new EventEmitter<{ focused: boolean }>();
const terminalClosed = new EventEmitter<any>();
const terminalIntegrationChanged = new EventEmitter<any>();
const activeEditorChanged = new EventEmitter<any>();
const documentChanged = new EventEmitter<any>();
const registeredCommands = new Map<string, (...args: any[]) => any>();
const contexts = new Map<string, unknown>();
const panels = new Set<any>();
const viewProviders = new Map<string, any>();
const customEditors = new Map<string, any>();
const documents = new Map<string, DesktopDocument>();
const fileWatchers = new Set<DesktopFileWatcher>();
let activeTextEditor: any;

function host(): PlatformServices {
  if (!services) throw new Error('Die Cortex-Desktop-Plattform ist noch nicht initialisiert.');
  return services;
}

export function configurePlatform(next: PlatformServices): void {
  configurationSubscription?.dispose();
  services = next;
  defaultCustomEditors = [];
  defaults = {
    'editor.fontSize': 13, 'editor.fontFamily': 'Menlo, Monaco, monospace', 'editor.tabSize': 2,
    'editor.insertSpaces': true, 'editor.wordWrap': 'off', 'editor.minimap.enabled': false,
    'editor.lineNumbers': 'on', 'editor.formatOnSave': false, 'files.autoSave': 'off',
    'files.trimTrailingWhitespace': false, 'files.insertFinalNewline': false,
    'terminal.integrated.fontSize': 13, 'terminal.integrated.cursorStyle': 'block',
    'terminal.integrated.scrollback': 1000, 'cortex.browserAccess': 'auf-ansage',
  };
  try {
    const manifest = JSON.parse(readFileSync(join(next.resourcesPath, 'package.json'), 'utf8'));
    const sections = [manifest.contributes?.configuration].flat().filter(Boolean);
    for (const section of sections) for (const [key, value] of Object.entries(section.properties ?? {})) {
      if (value && typeof value === 'object' && 'default' in value) defaults[key] = (value as { default: unknown }).default;
    }
    Object.assign(defaults, manifest.contributes?.configurationDefaults ?? {});
    defaultCustomEditors = (manifest.contributes?.customEditors ?? [])
      .filter((editor: any) => editor.priority === 'default' && typeof editor.viewType === 'string')
      .map((editor: any) => ({ viewType: editor.viewType, patterns: (editor.selector ?? []).map((selector: any) => globExpression(selector.filenamePattern)) }));
  } catch (error) {
    console.error('[Cortex] Einstellungs-Vorgaben konnten nicht gelesen werden.', error);
  }
  const saved = next.storage.workspaceState.get<Array<{ path: string; name?: string }>>('desktop.workspaceFolders', []) ?? [];
  workspaceFolders = saved.filter(folder => folder && typeof folder.path === 'string').map((folder, index) => ({ uri: Uri.file(folder.path), name: folder.name ?? basename(folder.path), index }));
  configurationSubscription = next.storage.onDidChangeConfiguration(event => {
    configurationChanged.fire(event);
    next.sendShell({ kind: 'configuration', values: configurationValues() });
  });
}

export function configurationValues(): Record<string, unknown> { return { ...defaults, ...host().storage.settings.read() }; }
export function notifyWindowFocus(focused: boolean): void { windowStateChanged.fire({ focused }); }
export function notifyTerminalClosed(terminal: any): void { terminalClosed.fire(terminal); }
export function notifyTerminalShellIntegration(terminal: any, shellIntegration: any): void {
  terminal.shellIntegration = shellIntegration;
  terminalIntegrationChanged.fire({ terminal, shellIntegration });
}

function asUri(value: Uri | string | { fsPath?: string; scheme?: string; path?: string }): Uri {
  if (value instanceof Uri) return value;
  if (typeof value === 'string') return isAbsolute(value) ? Uri.file(value) : Uri.parse(value);
  if (value.fsPath) return Uri.file(value.fsPath);
  if (value.scheme && value.path) return Uri.from({ scheme: value.scheme, path: value.path });
  throw new Error('Ungültiger Dateipfad.');
}

export class DesktopDocument {
  private text: string;
  private savedText: string;
  isClosed = false;
  version = 1;
  readonly languageId: string;
  constructor(public uri: Uri, text: string, language?: string) {
    this.text = text; this.savedText = text;
    this.languageId = language ?? languageFor(uri.fsPath);
  }
  get fileName(): string { return this.uri.fsPath; }
  get isUntitled(): boolean { return this.uri.scheme === 'untitled'; }
  get isDirty(): boolean { return this.text !== this.savedText; }
  get lineCount(): number { return this.text.split(/\r?\n/).length; }
  get eol(): number { return this.text.includes('\r\n') ? EndOfLine.CRLF : EndOfLine.LF; }
  getText(range?: Range): string { return range ? this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end)) : this.text; }
  offsetAt(position: { line: number; character: number }): number {
    const lines = this.text.split('\n');
    const line = Math.max(0, Math.min(position.line, lines.length - 1));
    return lines.slice(0, line).reduce((n, value) => n + value.length + 1, 0) + Math.max(0, Math.min(position.character, lines[line]!.replace(/\r$/, '').length));
  }
  positionAt(offset: number): Position {
    const before = this.text.slice(0, Math.max(0, Math.min(offset, this.text.length))).split('\n');
    return new Position(before.length - 1, before[before.length - 1]!.length);
  }
  lineAt(line: number | Position): any {
    const number = typeof line === 'number' ? line : line.line;
    const text = this.text.split(/\r?\n/)[number];
    if (text === undefined) throw new Error('Zeile liegt außerhalb des Dokuments.');
    return { lineNumber: number, text, range: new Range(number, 0, number, text.length), isEmptyOrWhitespace: !text.trim(), firstNonWhitespaceCharacterIndex: text.search(/\S|$/) };
  }
  update(text: string): void {
    if (text === this.text) return;
    this.text = text; this.version++;
    documentChanged.fire({ document: this, contentChanges: [{ text }] });
  }
  async save(): Promise<boolean> {
    let target = this.uri;
    if (this.isUntitled) {
      const selected = await window.showSaveDialog({ defaultUri: Uri.file(join(workspaceFolders[0]?.uri.fsPath ?? host().storage.globalStoragePath, 'Unbenannt.txt')) });
      if (!selected) return false;
      target = selected;
    } else {
      const current = await fs.readFile(target.fsPath, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      });
      if (current !== undefined && current !== this.savedText) throw new Error('Die Datei wurde außerhalb von Cortex geändert. Lade sie neu, bevor du speicherst.');
    }
    let text = this.text;
    const config = configurationValues();
    if (config['files.trimTrailingWhitespace']) text = text.replace(/[\t ]+$/gm, '');
    if (config['files.insertFinalNewline'] && text && !text.endsWith('\n')) text += '\n';
    await fs.mkdir(dirname(target.fsPath), { recursive: true });
    await fs.writeFile(target.fsPath, text, 'utf8');
    if (target.toString() !== this.uri.toString()) {
      documents.delete(this.uri.toString()); this.uri = target; documents.set(this.uri.toString(), this);
    }
    this.text = text; this.savedText = text;
    host().sendShell({ kind: 'editorSaved', uri: target.toString(), text });
    return true;
  }
}

export function notifyEditorState(update: {
  uri: Uri | string;
  text?: string;
  selection?: { start: { line: number; character: number }; end: { line: number; character: number } };
  closed?: boolean;
  active?: boolean;
}): void {
  const uri = asUri(update.uri), document = documents.get(uri.toString());
  if (!document) return;
  if (update.text !== undefined) document.update(update.text);
  if (update.closed) {
    document.isClosed = true;
    documents.delete(uri.toString());
    if (activeTextEditor?.document === document) { activeTextEditor = undefined; activeEditorChanged.fire(undefined); }
    return;
  }
  if (update.active !== false) {
    const selected = update.selection;
    const selection = selected ? new Selection(new Position(selected.start.line, selected.start.character), new Position(selected.end.line, selected.end.character)) : new Selection(0, 0, 0, 0);
    activeTextEditor = { document, selection, selections: [selection] };
    activeEditorChanged.fire(activeTextEditor);
  }
}

function languageFor(path: string): string {
  return ({ '.ts': 'typescript', '.tsx': 'typescriptreact', '.js': 'javascript', '.jsx': 'javascriptreact', '.json': 'json', '.md': 'markdown', '.py': 'python', '.html': 'html', '.css': 'css', '.scss': 'scss', '.sh': 'shellscript', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.swift': 'swift', '.rs': 'rust', '.go': 'go', '.sql': 'sql', '.xml': 'xml', '.csv': 'csv' } as Record<string, string>)[extname(path)] ?? 'plaintext';
}

class NativeFileRequiredError extends Error {
  constructor() { super('Diese Datei ist kein unterstütztes Textdokument. Öffne sie mit der zugehörigen App.'); }
}

/** Never create an editable UTF-8 replacement-string version of a binary file. */
async function readTextDocument(path: string): Promise<string> {
  const file = await fs.open(path, 'r');
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 32 * 1024 * 1024) throw new NativeFileRequiredError();
    const buffer = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await file.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > info.size) throw new Error('Die Datei wurde beim Öffnen geändert. Öffne sie erneut.');
    const content = buffer.subarray(0, length);
    if (content.includes(0)) throw new NativeFileRequiredError();
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(content); }
    catch { throw new NativeFileRequiredError(); }
  } finally { await file.close(); }
}

function globExpression(glob: string): RegExp {
  let pattern = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]!;
    if (char === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { pattern += '(?:.*/)?'; i++; } else pattern += '.*';
    } else if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else if (char === '{') pattern += '(?:';
    else if (char === '}') pattern += ')';
    else if (char === ',') pattern += '|';
    else pattern += char.replace(/[.()+^$|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

class DesktopFileWatcher extends Disposable {
  private watchers: FSWatcher[] = [];
  private known = new Set<string>();
  private readonly create = new EventEmitter<Uri>();
  private readonly change = new EventEmitter<Uri>();
  private readonly remove = new EventEmitter<Uri>();
  readonly onDidCreate = this.create.event;
  readonly onDidChange = this.change.event;
  readonly onDidDelete = this.remove.event;
  constructor(private readonly pattern: string | RelativePattern, private readonly ignored: [boolean, boolean, boolean]) {
    super(); fileWatchers.add(this); this.reset();
  }
  reset(): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = [];
    const roots = typeof this.pattern === 'string' ? workspaceFolders.map(folder => folder.uri.fsPath) : [this.pattern.base];
    const expression = globExpression(typeof this.pattern === 'string' ? this.pattern : this.pattern.pattern);
    for (const root of roots) {
      let base = root;
      while (!existsSync(base) && dirname(base) !== base) base = dirname(base);
      try {
        const watcher = watch(base, { recursive: true, persistent: false }, (event, file) => {
          if (!file) return;
          const path = resolve(base, file.toString());
          const rel = relative(root, path).split(sep).join('/');
          if (rel.startsWith('../') || !expression.test(rel)) return;
          const uri = Uri.file(path), exists = existsSync(path);
          if (!exists) { this.known.delete(path); if (!this.ignored[2]) this.remove.fire(uri); }
          else if (event === 'rename' && !this.known.has(path)) { this.known.add(path); if (!this.ignored[0]) this.create.fire(uri); }
          else { this.known.add(path); if (!this.ignored[1]) this.change.fire(uri); }
        });
        watcher.on('error', error => host().sendShell({ kind: 'notice', level: 'warning', message: `Dateiüberwachung unter ${root}: ${error.message}` }));
        this.watchers.push(watcher);
      } catch (error) {
        host().sendShell({ kind: 'notice', level: 'warning', message: `Dateiüberwachung unter ${root} konnte nicht starten: ${String(error)}` });
      }
    }
  }
  override dispose(): void {
    for (const watcher of this.watchers) watcher.close();
    this.watchers = []; this.create.dispose(); this.change.dispose(); this.remove.dispose(); fileWatchers.delete(this);
  }
}

export const workspace = {
  get workspaceFolders() { return workspaceFolders.length ? workspaceFolders : undefined; },
  get textDocuments() { return [...documents.values()]; },
  get isTrusted() { return true; },
  onDidChangeConfiguration: configurationChanged.event,
  onDidChangeWorkspaceFolders: foldersChanged.event,
  onDidChangeTextDocument: documentChanged.event,
  getConfiguration(section?: string) {
    const full = (key: string) => section ? `${section}.${key}` : key;
    return {
      get<T>(key: string, fallback?: T): T | undefined {
        const value = configurationValues()[full(key)];
        return value === undefined ? fallback : structuredClone(value) as T;
      },
      has(key: string): boolean { return Object.hasOwn(configurationValues(), full(key)); },
      inspect<T>(key: string) {
        const name = full(key), saved = host().storage.settings.read();
        return { key: name, defaultValue: defaults[name] as T | undefined, globalValue: saved[name] as T | undefined, workspaceValue: undefined, workspaceFolderValue: undefined };
      },
      async update(key: string, value: unknown, _target?: number): Promise<void> { await host().storage.settings.update(full(key), value); },
    };
  },
  updateWorkspaceFolders(start: number, deleteCount: number | undefined, ...folders: Array<{ uri: Uri; name?: string }>): boolean {
    if (!Number.isInteger(start) || start < 0 || start > workspaceFolders.length) return false;
    const proposed = [...workspaceFolders];
    const added = folders.map((folder, index) => ({ uri: asUri(folder.uri), name: folder.name ?? basename(folder.uri.fsPath), index: start + index }));
    const removed = proposed.splice(start, deleteCount ?? proposed.length - start, ...added);
    if (new Set(proposed.map(folder => folder.uri.toString())).size !== proposed.length) return false;
    workspaceFolders = proposed.map((folder, index) => ({ ...folder, index }));
    void host().storage.workspaceState.update('desktop.workspaceFolders', workspaceFolders.map(folder => ({ path: folder.uri.fsPath, name: folder.name }))).catch(error => {
      host().sendShell({ kind: 'notice', level: 'error', message: `Arbeitsordner konnten nicht gespeichert werden: ${String(error)}` });
    });
    for (const watcher of fileWatchers) watcher.reset();
    foldersChanged.fire({ added, removed });
    return true;
  },
  createFileSystemWatcher(pattern: string | RelativePattern, ignoreCreate = false, ignoreChange = false, ignoreDelete = false) {
    return new DesktopFileWatcher(pattern, [ignoreCreate, ignoreChange, ignoreDelete]);
  },
  async openTextDocument(value: Uri | string | { content?: string; language?: string }): Promise<DesktopDocument> {
    if (typeof value === 'object' && !(value instanceof Uri) && !('scheme' in value) && ('content' in value || 'language' in value)) {
      const document = new DesktopDocument(Uri.parse(`untitled:/${randomUUID()}`), value.content ?? '', value.language);
      documents.set(document.uri.toString(), document);
      return document;
    }
    const uri = asUri(value as Uri | string), existing = documents.get(uri.toString());
    if (existing && !existing.isClosed) return existing;
    if (uri.scheme !== 'file') throw new Error('Dieses Dokument ist keine lokale Datei.');
    const document = new DesktopDocument(uri, await readTextDocument(uri.fsPath));
    documents.set(uri.toString(), document);
    return document;
  },
  fs: {
    readFile: (uri: Uri) => fs.readFile(asUri(uri).fsPath),
    writeFile: (uri: Uri, content: Uint8Array) => fs.writeFile(asUri(uri).fsPath, content),
    createDirectory: async (uri: Uri) => { await fs.mkdir(asUri(uri).fsPath, { recursive: true }); },
    async stat(uri: Uri) {
      const stat = await fs.stat(asUri(uri).fsPath);
      return { type: stat.isDirectory() ? FileType.Directory : stat.isFile() ? FileType.File : FileType.Unknown, ctime: stat.ctimeMs, mtime: stat.mtimeMs, size: stat.size };
    },
    async readDirectory(uri: Uri) {
      return (await fs.readdir(asUri(uri).fsPath, { withFileTypes: true })).map(entry => [entry.name, entry.isSymbolicLink() ? FileType.SymbolicLink : entry.isDirectory() ? FileType.Directory : FileType.File]);
    },
    async copy(source: Uri, target: Uri, options: { overwrite?: boolean } = {}) {
      await fs.cp(asUri(source).fsPath, asUri(target).fsPath, { recursive: true, force: !!options.overwrite, errorOnExist: !options.overwrite });
    },
    async rename(source: Uri, target: Uri, options: { overwrite?: boolean } = {}) {
      if (!options.overwrite && existsSync(asUri(target).fsPath)) throw new Error('Die Zieldatei existiert bereits.');
      await fs.rename(asUri(source).fsPath, asUri(target).fsPath);
    },
    async delete(uri: Uri, options: { recursive?: boolean; useTrash?: boolean } = {}) {
      if (options.useTrash) await shell.trashItem(asUri(uri).fsPath);
      else await fs.rm(asUri(uri).fsPath, { recursive: !!options.recursive });
    },
  },
};

function filters(value?: Record<string, string[]>): Electron.FileFilter[] | undefined {
  return value && Object.entries(value).map(([name, extensions]) => ({ name, extensions }));
}
async function message(type: 'info' | 'warning' | 'error', text: string, ...rest: any[]): Promise<any> {
  const options = rest[0] && typeof rest[0] === 'object' && !('title' in rest[0]) ? rest.shift() : {};
  const choices = rest.filter(item => typeof item === 'string' || item && typeof item.title === 'string');
  if (!choices.length && !options.modal) {
    host().sendShell({ kind: 'notice', level: type, message: text, detail: options.detail });
    return undefined;
  }
  const labels = choices.map(item => typeof item === 'string' ? item : item.title);
  const cancel = labels.length;
  const result = await dialog.showMessageBox(host().window, {
    type, title: 'Cortex', message: text, detail: options.detail,
    buttons: [...labels, labels.length ? 'Abbrechen' : 'OK'], cancelId: cancel,
    defaultId: labels.length ? 0 : cancel, noLink: true,
  });
  return result.response < choices.length ? choices[result.response] : undefined;
}

class DesktopStatusItem {
  private values: Record<string, unknown> = {};
  private visible = false;
  readonly id = randomUUID();
  constructor(readonly alignment: number, readonly priority: number) {}
  private publish(): void { host().sendShell({ kind: 'statusItem', id: this.id, visible: this.visible, alignment: this.alignment, priority: this.priority, ...this.values }); }
  get text(): string { return this.values.text as string ?? ''; }
  set text(value: string) { this.values.text = value; if (this.visible) this.publish(); }
  get tooltip(): any { return this.values.tooltip; }
  set tooltip(value: unknown) { this.values.tooltip = value; if (this.visible) this.publish(); }
  get command(): any { return this.values.command; }
  set command(value: unknown) { this.values.command = value; if (this.visible) this.publish(); }
  get name(): any { return this.values.name; }
  set name(value: unknown) { this.values.name = value; if (this.visible) this.publish(); }
  get color(): any { return this.values.color; }
  set color(value: unknown) { this.values.color = value; if (this.visible) this.publish(); }
  show(): void { this.visible = true; this.publish(); }
  hide(): void { this.visible = false; this.publish(); }
  dispose(): void { this.hide(); }
}

export class TabInputWebview { constructor(readonly viewType: string) {} }

export const window = {
  get activeTextEditor() { return activeTextEditor; },
  get state() { return { focused: host().window.isFocused() }; },
  onDidChangeWindowState: windowStateChanged.event,
  onDidCloseTerminal: terminalClosed.event,
  onDidChangeTerminalShellIntegration: terminalIntegrationChanged.event,
  onDidChangeActiveTextEditor: activeEditorChanged.event,
  createWebviewPanel(viewType: string, title: string, column: number | { viewColumn: number }, options: Record<string, unknown> = {}): any {
    const panel = host().createPanel(viewType, title, options, typeof column === 'number' ? column : column.viewColumn);
    panels.add(panel);
    panel.onDidDispose(() => panels.delete(panel));
    if (!panel.viewType) panel.viewType = viewType;
    return panel;
  },
  registerWebviewViewProvider(id: string, provider: any, _options?: any): Disposable {
    viewProviders.set(id, provider);
    return new Disposable(() => viewProviders.delete(id));
  },
  registerCustomEditorProvider(id: string, provider: any, _options?: any): Disposable {
    customEditors.set(id, provider);
    return new Disposable(() => customEditors.delete(id));
  },
  async showTextDocument(value: DesktopDocument | Uri | string, options?: any): Promise<any> {
    const document = value instanceof DesktopDocument ? value : await workspace.openTextDocument(value);
    const result = await host().showEditor(document, options);
    notifyEditorState({ uri: document.uri, active: !options?.preserveFocus });
    return result ?? activeTextEditor;
  },
  createTerminal(options: Record<string, unknown> | string = {}): any { return host().createTerminal(typeof options === 'string' ? { name: options } : options); },
  showErrorMessage: (text: string, ...rest: any[]) => message('error', text, ...rest),
  showWarningMessage: (text: string, ...rest: any[]) => message('warning', text, ...rest),
  showInformationMessage: (text: string, ...rest: any[]) => message('info', text, ...rest),
  async showOpenDialog(options: any = {}): Promise<Uri[] | undefined> {
    const properties: Electron.OpenDialogOptions['properties'] = [];
    if (options.canSelectFiles !== false) properties.push('openFile');
    if (options.canSelectFolders) properties.push('openDirectory', 'createDirectory');
    if (options.canSelectMany) properties.push('multiSelections');
    const result = await dialog.showOpenDialog(host().window, { title: options.title, buttonLabel: options.openLabel, defaultPath: options.defaultUri?.fsPath, filters: filters(options.filters), properties });
    return result.canceled ? undefined : result.filePaths.map(path => Uri.file(path));
  },
  async showSaveDialog(options: any = {}): Promise<Uri | undefined> {
    const result = await dialog.showSaveDialog(host().window, { title: options.title, buttonLabel: options.saveLabel, defaultPath: options.defaultUri?.fsPath, filters: filters(options.filters), properties: ['createDirectory', 'showOverwriteConfirmation'] });
    return result.canceled || !result.filePath ? undefined : Uri.file(result.filePath);
  },
  async showQuickPick<T>(items: readonly T[] | PromiseLike<readonly T[]>, options: any = {}): Promise<T | T[] | undefined> {
    const values = await items;
    const response = await host().requestShell({ kind: 'quickPick', title: options.title, placeHolder: options.placeHolder, canPickMany: !!options.canPickMany, items: values.map((item, index) => typeof item === 'string' ? { label: item, index, value: index } : { ...(item as object), index, value: index }) });
    if (response === undefined || response === null) return undefined;
    const indexOf = (item: any) => typeof item === 'number' ? item : typeof item?.index === 'number' ? item.index : -1;
    if (options.canPickMany) return (Array.isArray(response) ? response : [response]).map(indexOf).filter(index => index >= 0 && index < values.length).map(index => values[index]!);
    const index = indexOf(response);
    return index >= 0 && index < values.length ? values[index] : undefined;
  },
  async showInputBox(options: any = {}): Promise<string | undefined> {
    let validationMessage: string | undefined;
    let value = options.value ?? '';
    for (;;) {
      const response = await host().requestShell({ kind: 'input', title: options.title, prompt: options.prompt, placeHolder: options.placeHolder, password: !!options.password, value, validationMessage });
      if (response === undefined || response === null) return undefined;
      value = typeof response === 'string' ? response : response.value;
      if (typeof value !== 'string') return undefined;
      const validation = options.validateInput ? await options.validateInput(value) : undefined;
      if (!validation) return value;
      validationMessage = typeof validation === 'string' ? validation : validation.message;
    }
  },
  createOutputChannel(name: string): any {
    const path = join(host().storage.globalStoragePath, 'logs', `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.log`);
    mkdirSync(dirname(path), { recursive: true });
    let closed = false;
    const append = (text: string) => { if (!closed) appendFileSync(path, text, { encoding: 'utf8', mode: 0o600 }); };
    return { name, append, appendLine: (text: string) => append(`${text}\n`), clear: () => fs.writeFile(path, '', { mode: 0o600 }), replace: (text: string) => fs.writeFile(path, text, { mode: 0o600 }), show: () => window.showTextDocument(Uri.file(path)), hide: () => host().sendShell({ kind: 'closeOutput', name }), dispose: () => { closed = true; } };
  },
  createStatusBarItem(alignment = StatusBarAlignment.Left as number, priority = 0): DesktopStatusItem { return new DesktopStatusItem(alignment, priority); },
  setStatusBarMessage(text: string, timeoutOrPromise?: number | PromiseLike<unknown>): Disposable {
    const item = new DesktopStatusItem(StatusBarAlignment.Left, 1000);
    item.text = text; item.show();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (typeof timeoutOrPromise === 'number') timeout = setTimeout(() => item.dispose(), timeoutOrPromise);
    else if (timeoutOrPromise) void Promise.resolve(timeoutOrPromise).then(() => item.dispose(), () => item.dispose());
    return new Disposable(() => { if (timeout) clearTimeout(timeout); item.dispose(); });
  },
  tabGroups: {
    get all(): any[] { return [{ tabs: [...panels].map(panel => ({ label: panel.title, isDirty: false, input: new TabInputWebview(panel.viewType), panel })) }]; },
    async close(tabs: any | any[]): Promise<boolean> { for (const tab of [tabs].flat()) tab.panel?.dispose(); return true; },
  },
};

export const commands = {
  registerCommand(command: string, callback: (...args: any[]) => any, thisArg?: any): Disposable {
    registeredCommands.set(command, thisArg ? callback.bind(thisArg) : callback);
    return new Disposable(() => registeredCommands.delete(command));
  },
  async getCommands(_filterInternal?: boolean): Promise<string[]> {
    return [...new Set([...registeredCommands.keys(), ...host().builtinCommands, 'setContext', 'vscode.open', 'vscode.openWith', 'revealFileInOS', 'revealInExplorer'])];
  },
  async executeCommand<T = unknown>(command: string, ...args: any[]): Promise<T> {
    const registered = registeredCommands.get(command);
    if (registered) return await registered(...args);
    if (command === 'setContext') {
      contexts.set(args[0], args[1]);
      host().sendShell({ kind: 'contexts', values: Object.fromEntries(contexts) });
      return undefined as T;
    }
    if (command === 'revealFileInOS' || command === 'revealInExplorer') { shell.showItemInFolder(asUri(args[0]).fsPath); return undefined as T; }
    if (command === 'vscode.open') {
      const uri = asUri(args[0]);
      if (uri.scheme === 'http' || uri.scheme === 'https') return await env.openExternal(uri) as T;
      const custom = defaultCustomEditors.find(editor => customEditors.has(editor.viewType) && editor.patterns.some(pattern => pattern.test(basename(uri.fsPath))));
      if (custom) return await commands.executeCommand<T>('vscode.openWith', uri, custom.viewType, args[1]);
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.docx', '.xlsx', '.pptx', '.mp4', '.mov', '.mp3', '.wav'].includes(extname(uri.fsPath).toLowerCase())) {
        const error = await shell.openPath(uri.fsPath); if (error) throw new Error(error); return undefined as T;
      }
      try { return await window.showTextDocument(uri, args[1]) as T; }
      catch (error) {
        if (!(error instanceof NativeFileRequiredError)) throw error;
        const message = await shell.openPath(uri.fsPath);
        if (message) throw new Error(message);
        return undefined as T;
      }
    }
    if (command === 'vscode.openWith') {
      const uri = asUri(args[0]), provider = customEditors.get(args[1]);
      if (!provider) throw new Error(`Für „${args[1]}“ ist kein Cortex-Editor registriert.`);
      const document = await provider.openCustomDocument(uri, {}, { isCancellationRequested: false });
      const panel = window.createWebviewPanel(args[1], basename(uri.fsPath), args[2]?.viewColumn ?? ViewColumn.Beside, { enableScripts: true });
      panel.onDidDispose(() => document.dispose());
      await provider.resolveCustomEditor(document, panel, { isCancellationRequested: false });
      return undefined as T;
    }
    if (!host().builtinCommands.includes(command)) throw new Error(`Die Desktop-Funktion „${command}“ ist nicht verfügbar.`);
    return await host().executeBuiltin(command, ...args);
  },
};

export const env = {
  appName: 'Cortex',
  language: 'de',
  clipboard: { async writeText(text: string): Promise<void> { clipboard.writeText(text); }, async readText(): Promise<string> { return clipboard.readText(); } },
  async openExternal(value: Uri | string | URL): Promise<boolean> {
    const url = typeof value === 'string' ? new URL(value) : new URL(value.toString());
    if (url.protocol === 'file:') { const error = await shell.openPath(fileURLToPath(url)); if (error) throw new Error(error); return true; }
    if (!['http:', 'https:', 'mailto:', 'x-apple.systempreferences:'].includes(url.protocol)) throw new Error('Dieses Link-Protokoll ist in Cortex nicht freigegeben.');
    await shell.openExternal(url.href); return true;
  },
};

export const languages = {
  async getLanguages(): Promise<string[]> { return ['plaintext', 'typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'json', 'markdown', 'python', 'html', 'css', 'scss', 'shellscript', 'yaml', 'toml', 'swift', 'rust', 'go', 'sql', 'xml', 'csv']; },
  createDiagnosticCollection(name: string): any {
    const entries = new Map<string, Diagnostic[]>();
    const publish = () => host().sendShell({ kind: 'diagnostics', name, entries: Object.fromEntries(entries) });
    return { name, set: (uri: Uri, values: Diagnostic[]) => { entries.set(uri.toString(), values); publish(); }, get: (uri: Uri) => entries.get(uri.toString()), delete: (uri: Uri) => { entries.delete(uri.toString()); publish(); }, clear: () => { entries.clear(); publish(); }, dispose: () => { entries.clear(); publish(); } };
  },
};

export function createContext(): any {
  const current = host(), subscriptions: Array<{ dispose(): unknown }> = [];
  return {
    subscriptions, extensionPath: current.resourcesPath, extensionUri: Uri.file(current.resourcesPath),
    globalStorageUri: Uri.file(current.storage.globalStoragePath), globalStoragePath: current.storage.globalStoragePath,
    storageUri: Uri.file(join(current.storage.globalStoragePath, 'workspace')), storagePath: join(current.storage.globalStoragePath, 'workspace'),
    logUri: Uri.file(join(current.storage.globalStoragePath, 'logs')), logPath: join(current.storage.globalStoragePath, 'logs'),
    globalState: current.storage.globalState, workspaceState: current.storage.workspaceState, secrets: current.storage.secrets,
    extension: { id: 'cortex.desktop', extensionPath: current.resourcesPath, extensionUri: Uri.file(current.resourcesPath), isActive: true },
    extensionMode: 1,
    asAbsolutePath: (path: string) => join(current.resourcesPath, path),
  };
}

export async function disposePlatform(): Promise<void> {
  configurationSubscription?.dispose(); configurationSubscription = undefined;
  for (const watcher of [...fileWatchers]) watcher.dispose();
  for (const panel of [...panels]) panel.dispose();
  panels.clear(); documents.clear(); registeredCommands.clear(); viewProviders.clear(); customEditors.clear(); contexts.clear();
  activeTextEditor = undefined;
  await services?.storage.flush();
}
