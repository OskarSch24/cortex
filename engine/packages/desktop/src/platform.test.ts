import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  clipboard: { writeText: vi.fn(), readText: vi.fn(() => '') },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 0 })), showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { openExternal: vi.fn(async () => undefined), openPath: vi.fn(async () => ''), showItemInFolder: vi.fn(), trashItem: vi.fn(async () => undefined) },
}));

import { dialog, shell } from 'electron';
import { commands, configurePlatform, createContext, disposePlatform, env, EventEmitter, notifyEditorState, Position, Range, RelativePattern, Uri, window, workspace, type PlatformServices } from './platform.js';

let root: string;
let service: PlatformServices;
let settings: Record<string, unknown>;
let state: Record<string, unknown>;
let configEvent: EventEmitter<{ affectsConfiguration(section: string): boolean }>;

beforeEach(() => {
  vi.clearAllMocks();
  root = mkdtempSync(join(tmpdir(), 'cortex-platform-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ contributes: {
    configuration: { properties: { 'cortex.test': { default: 'base' } } },
    customEditors: [{ viewType: 'test.database', priority: 'default', selector: [{ filenamePattern: '*.db' }] }],
  } }));
  settings = {}; state = {}; configEvent = new EventEmitter();
  const memento = { get: <T>(key: string, fallback?: T): T | undefined => (state[key] ?? fallback) as T, update: async (key: string, value: unknown) => { state[key] = value; }, keys: () => Object.keys(state) };
  service = {
    resourcesPath: root,
    window: { isFocused: () => true } as any,
    storage: {
      globalState: memento, workspaceState: memento,
      secrets: { get: vi.fn(async () => undefined), store: vi.fn(async () => undefined), delete: vi.fn(async () => undefined), onDidChange: () => ({ dispose() {} }) },
      settings: { read: () => ({ ...settings }), update: async (key, value) => { if (value === undefined) delete settings[key]; else settings[key] = value; configEvent.fire({ affectsConfiguration: section => key === section || key.startsWith(`${section}.`) }); } },
      onDidChangeConfiguration: configEvent.event,
      globalStoragePath: join(root, 'data'), flush: vi.fn(async () => undefined),
    },
    createPanel: vi.fn((viewType, title) => {
      const disposed = new EventEmitter<void>();
      return { viewType, title, webview: {}, active: true, onDidDispose: disposed.event, dispose: () => disposed.fire(), reveal: vi.fn() };
    }),
    executeBuiltin: vi.fn(async () => 'builtin'), builtinCommands: ['workbench.action.browser.open'],
    showEditor: vi.fn(async () => undefined), createTerminal: vi.fn(), sendShell: vi.fn(), requestShell: vi.fn(),
  };
  configurePlatform(service);
});

afterEach(async () => { await disposePlatform(); configEvent.dispose(); rmSync(root, { recursive: true, force: true }); });

describe('standalone platform', () => {
  it('round trips file paths, spaces, reserved characters and remote URLs without query corruption', () => {
    const path = join(root, 'ä # ? 100%.md');
    expect(Uri.parse(Uri.file(path).toString()).fsPath).toBe(path);
    expect(Uri.joinPath(Uri.file(root), 'a b', 'file.md').fsPath).toBe(join(root, 'a b', 'file.md'));
    const oauth = 'https://example.com/?redirect_uri=https%3A%2F%2Fexample.com%2F%3Fa%3D1%26b%3D2&state=%2B';
    expect(Uri.parse(oauth).toString()).toBe(oauth);
  });

  it('loads defaults, persists settings, exposes values and broadcasts configuration changes', async () => {
    const config = workspace.getConfiguration('cortex');
    expect(config.get('test')).toBe('base');
    const listener = vi.fn(); const sub = workspace.onDidChangeConfiguration(listener);
    await config.update('test', 'changed');
    expect(config.get('test')).toBe('changed');
    expect(config.inspect('test')).toMatchObject({ key: 'cortex.test', defaultValue: 'base', globalValue: 'changed' });
    expect(listener.mock.calls[0]![0].affectsConfiguration('cortex')).toBe(true);
    expect(service.sendShell).toHaveBeenCalledWith(expect.objectContaining({ kind: 'configuration' }));
    await config.update('test', undefined); expect(config.get('test')).toBe('base');
    sub.dispose();
  });

  it('runs registered and built-in commands, publishes context and rejects unsupported commands', async () => {
    const sub = commands.registerCommand('cortex.local', (value: number) => value * 2);
    expect(await commands.executeCommand('cortex.local', 3)).toBe(6);
    expect(await commands.executeCommand('workbench.action.browser.open', { url: 'https://example.com' })).toBe('builtin');
    expect(await commands.getCommands()).toContain('workbench.action.browser.open');
    await commands.executeCommand('setContext', 'cortex.chatToolsVisible', true);
    expect(service.sendShell).toHaveBeenCalledWith({ kind: 'contexts', values: { 'cortex.chatToolsVisible': true } });
    await expect(commands.executeCommand('unknown.command')).rejects.toThrow('nicht verfügbar');
    sub.dispose();
    await expect(commands.executeCommand('cortex.local', 3)).rejects.toThrow('nicht verfügbar');
  });

  it('maps quick-pick values back to original objects and treats cancellation as cancellation', async () => {
    const account = { label: 'Konto', account: { id: 'a' }, value: 'original' };
    vi.mocked(service.requestShell).mockResolvedValueOnce(0).mockResolvedValueOnce(undefined);
    expect(await window.showQuickPick([account])).toBe(account);
    expect(service.requestShell).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ value: 0, index: 0 })] }));
    expect(await window.showQuickPick(['eins'])).toBeUndefined();
  });

  it('retains dirty file state and selection context, applies save preferences, rejects external overwrites', async () => {
    const path = join(root, 'example.ts'); writeFileSync(path, 'first\nsecond');
    const document = await workspace.openTextDocument(Uri.file(path));
    await window.showTextDocument(document);
    notifyEditorState({ uri: document.uri, text: 'first\nsecond  ', selection: { start: { line: 1, character: 0 }, end: { line: 1, character: 6 } } });
    expect(document.isDirty).toBe(true);
    expect(window.activeTextEditor.document).toBe(document);
    expect(document.getText(window.activeTextEditor.selection)).toBe('second');
    await workspace.getConfiguration().update('files.trimTrailingWhitespace', true);
    await workspace.getConfiguration().update('files.insertFinalNewline', true);
    expect(await document.save()).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('first\nsecond\n');
    expect(document.isDirty).toBe(false);
    document.update('my draft'); writeFileSync(path, 'external');
    await expect(document.save()).rejects.toThrow('außerhalb von Cortex');
    expect(readFileSync(path, 'utf8')).toBe('external');
    notifyEditorState({ uri: document.uri, closed: true });
    expect(workspace.textDocuments).toHaveLength(0);
  });

  it('opens configured custom editors instead of interpreting binary databases as text', async () => {
    const doc = { dispose: vi.fn() };
    const provider = { openCustomDocument: vi.fn(async () => doc), resolveCustomEditor: vi.fn(async () => undefined) };
    const sub = window.registerCustomEditorProvider('test.database', provider);
    await commands.executeCommand('vscode.open', Uri.file(join(root, 'content.db')));
    expect(provider.openCustomDocument).toHaveBeenCalled();
    expect(provider.resolveCustomEditor).toHaveBeenCalledWith(doc, expect.objectContaining({ viewType: 'test.database' }), expect.anything());
    expect(service.showEditor).not.toHaveBeenCalled();
    sub.dispose();
  });

  it.each([
    ['unknown.data', Buffer.from([65, 0, 66])],
    ['unknown.codec', Buffer.from([0xff, 0xfe, 65, 66])],
    ['picture.heic', Buffer.from([0, 0, 0, 20, 102, 116, 121, 112])],
  ])('opens unsupported binary %s in its native app without creating an editable document', async (name, content) => {
    const path = join(root, name); writeFileSync(path, content);
    await expect(workspace.openTextDocument(Uri.file(path))).rejects.toThrow('Textdokument');
    expect(workspace.textDocuments).toHaveLength(0);
    await commands.executeCommand('vscode.open', Uri.file(path));
    expect(shell.openPath).toHaveBeenCalledWith(path);
    expect(service.showEditor).not.toHaveBeenCalled();
    expect(readFileSync(path)).toEqual(content);
  });

  it('keeps valid Unicode and the original BOM when opening ordinary source text', async () => {
    const path = join(root, 'unicode.txt'), text = '\ufeffGrüße aus Cortex — 🧠\n'; writeFileSync(path, text);
    await commands.executeCommand('vscode.open', Uri.file(path));
    expect(shell.openPath).not.toHaveBeenCalled();
    expect(service.showEditor).toHaveBeenCalled();
    expect(workspace.textDocuments[0]?.getText()).toBe(text);
  });

  it('does not hide missing-file failures or failed native app opening', async () => {
    await expect(commands.executeCommand('vscode.open', Uri.file(join(root, 'missing.txt')))).rejects.toThrow();
    expect(shell.openPath).not.toHaveBeenCalled();
    const path = join(root, 'binary.unknown'); writeFileSync(path, Buffer.from([0, 1, 2]));
    vi.mocked(shell.openPath).mockResolvedValueOnce('Keine zugehörige App gefunden.');
    await expect(commands.executeCommand('vscode.open', Uri.file(path))).rejects.toThrow('Keine zugehörige App');
    expect(workspace.textDocuments).toHaveLength(0);
  });

  it('preserves file-copy overwrite checks and delegates trash requests to macOS', async () => {
    const source = Uri.file(join(root, 'source.txt')), target = Uri.file(join(root, 'target.txt'));
    await workspace.fs.writeFile(source, Buffer.from('new')); await workspace.fs.writeFile(target, Buffer.from('original'));
    await expect(workspace.fs.copy(source, target)).rejects.toThrow();
    expect(readFileSync(target.fsPath, 'utf8')).toBe('original');
    await workspace.fs.copy(source, target, { overwrite: true });
    expect(readFileSync(target.fsPath, 'utf8')).toBe('new');
    await workspace.fs.delete(target, { useTrash: true });
    expect(shell.trashItem).toHaveBeenCalledWith(target.fsPath);
  });

  it('persists workspace folder changes, rejects duplicate folders, delivers the resource change', () => {
    const listener = vi.fn(); const sub = workspace.onDidChangeWorkspaceFolders(listener);
    expect(workspace.updateWorkspaceFolders(0, 0, { uri: Uri.file(root), name: 'Test' })).toBe(true);
    expect(workspace.workspaceFolders?.[0]).toMatchObject({ name: 'Test', index: 0 });
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ added: [expect.objectContaining({ name: 'Test' })] }));
    expect(state['desktop.workspaceFolders']).toEqual([{ path: root, name: 'Test' }]);
    expect(workspace.updateWorkspaceFolders(1, 0, { uri: Uri.file(root) })).toBe(false);
    sub.dispose();
  });

  it('does not open arbitrary external URL schemes', async () => {
    await expect(env.openExternal('javascript:alert(1)')).rejects.toThrow('nicht freigegeben');
    expect(shell.openExternal).not.toHaveBeenCalled();
    await env.openExternal('https://example.com/?state=%2B%26');
    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com/?state=%2B%26');
  });

  it('delivers notices, real native confirmations and correct folder-picker properties', async () => {
    await window.showInformationMessage('Gespeichert');
    expect(service.sendShell).toHaveBeenCalledWith(expect.objectContaining({ kind: 'notice', message: 'Gespeichert' }));
    expect(await window.showWarningMessage('Fortfahren?', { modal: true }, 'Bestätigen')).toBe('Bestätigen');
    vi.mocked(dialog.showOpenDialog).mockResolvedValueOnce({ canceled: false, filePaths: [root] });
    expect((await window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true }))?.[0]?.fsPath).toBe(root);
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(service.window, expect.objectContaining({ properties: ['openDirectory', 'createDirectory'] }));
  });

  it('watches routing-rule changes under a registered project without desktop browser processes', async () => {
    mkdirSync(join(root, '.cortex')); writeFileSync(join(root, '.cortex', 'rules.json'), '{}');
    const watcher = workspace.createFileSystemWatcher(new RelativePattern(Uri.file(root), '**/.cortex/{rules,commands}.json'));
    const changed: string[] = []; watcher.onDidChange(uri => changed.push(uri.fsPath)); watcher.onDidCreate(uri => changed.push(uri.fsPath));
    writeFileSync(join(root, '.cortex', 'rules.json'), '{"rules":[]}');
    await vi.waitFor(() => expect(changed).toContain(join(root, '.cortex', 'rules.json')), { timeout: 1500, interval: 25 });
    watcher.dispose();
  });

  it('provides the existing runtime with owned storage and packaged resource paths', () => {
    const context = createContext();
    expect(context.globalState).toBe(service.storage.globalState);
    expect(context.secrets).toBe(service.storage.secrets);
    expect(context.globalStorageUri.fsPath).toBe(join(root, 'data'));
    expect(context.asAbsolutePath('dist/permissionServer.js')).toBe(join(root, 'dist/permissionServer.js'));
    const emitter = new EventEmitter<number>(), listener = vi.fn(), sub = emitter.event(listener);
    emitter.fire(1); sub.dispose(); emitter.fire(2); expect(listener).toHaveBeenCalledTimes(1); expect(listener).toHaveBeenCalledWith(1);
    expect(new Range(new Position(0, 0), new Position(0, 0)).isEmpty).toBe(true);
  });
});
