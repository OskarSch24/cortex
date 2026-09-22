import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands, window } from './vscodeStub.js';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';

function host() {
  // Real host methods with in-memory persistence and webview delivery.
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const work = { id: 'work', title: 'Business task', projectPath: '/studio', log: [], turns: [], pinnedTarget: { provider: 'claude', account: 'business', model: 'opus' } };
  const privateTask = { id: 'personal', title: 'Private task', projectPath: '/personal', log: [], turns: [] };
  chat.conversations = new Map([['work', work], ['personal', privateTask]]);
  const messages: unknown[] = [];
  const webview = { postMessage: (m: unknown) => { messages.push(m); return Promise.resolve(true); } };
  chat.agentPanel = { webview, active: true };
  chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'personal' }]]);
  chat.ctx = { globalState: { get: () => undefined, update: vi.fn() }, workspaceState: { get: () => undefined, update: vi.fn() } };
  chat.persistSoon = vi.fn();
  chat.sidePanes = { browser: false };
  chat.browserChats = new Set();
  chat.safePost = (_w: unknown, m: unknown) => messages.push(m);
  const accounts: any[] = [{ provider: 'claude', label: 'business', available: true, authState: 'ok' }];
  chat.accountDtos = () => accounts;
  return { chat, work, privateTask, webview, messages, accounts };
}
afterEach(() => vi.restoreAllMocks());
describe('Cortex task account and project selection', () => {
  it('changing the visible task account does not change the account of another task', async () => {
    const { chat, work, webview, messages } = host();
    await chat.setPinnedTarget({ provider: 'codex', account: 'private' });
    expect(chat.pinnedTarget('personal')).toEqual({ provider: 'codex', account: 'private' });
    expect(chat.pinnedTarget('work')).toEqual(work.pinnedTarget);
    chat.surfaces.get(webview).conversationId = 'work';
    expect(chat.pinnedTarget()).toEqual({ provider: 'claude', account: 'business', model: 'opus' });
    await chat.setPinnedTarget(undefined);
    expect(chat.pinnedTarget('work')).toBeUndefined();
    expect(chat.pinnedTarget('personal').account).toBe('private');
    // Nichts gewählt heißt nicht „kein Modell“: der Knopf zeigt Opus 5.
    // … und das Modellmenü hakt dann „Standard“ ab.
    expect(messages).toContainEqual({ kind: 'pinnedTarget', target: { provider: 'claude', account: 'business', model: 'claude-opus-5' }, standard: true });
  });
});

describe('Opus 5 as the model when nothing is chosen', () => {
  it('shows Opus 5 on the first Claude account that can take a task', () => {
    const { chat, accounts } = host();
    accounts.unshift({ provider: 'claude', label: 'private', available: false, authState: 'ok' }, { provider: 'codex', label: 'private', available: true, authState: 'ok' });
    expect(chat.pinnedTarget('personal')).toBeUndefined();
    expect(chat.shownTarget('personal')).toEqual({ provider: 'claude', account: 'business', model: 'claude-opus-5' });
  });
  it('keeps an explicit choice', () => {
    const { chat } = host();
    expect(chat.shownTarget('work')).toEqual({ provider: 'claude', account: 'business', model: 'opus' });
  });
  it('fills in Opus 5 when a Claude account was chosen without a model', async () => {
    const { chat } = host();
    await chat.setPinnedTarget({ provider: 'claude', account: 'business' }, 'personal');
    expect(chat.shownTarget('personal')).toEqual({ provider: 'claude', account: 'business', model: 'claude-opus-5' });
  });
  it('leaves another provider without a model alone', async () => {
    const { chat } = host();
    await chat.setPinnedTarget({ provider: 'codex', account: 'private' }, 'personal');
    expect(chat.shownTarget('personal')).toEqual({ provider: 'codex', account: 'private' });
  });
  it('shows nothing when there is no Claude account', () => {
    const { chat, accounts } = host();
    accounts.splice(0);
    expect(chat.shownTarget('personal')).toBeUndefined();
  });
  it('uses each task project even when a different task is visible', () => {
    const { chat } = host();
    expect(chat.projectRoot('work')).toBe('/studio');
    expect(chat.projectRoot('personal')).toBe('/personal');
  });
});

describe('native preview alongside the chat', () => {
  it('opens the integrated browser to the side rather than replacing the conversation', async () => {
    commands.executeCommand.mockClear();const { chat, webview } = host();
    await chat.dispatchMessage({kind:'openBrowser',url:'http://localhost:3000'},webview);
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.browser.open',{url:'http://localhost:3000/',openToSide:true});
    expect(chat.surfaces.get(webview).conversationId).toBe('personal');
  });
  it('offers to close the preview it opened, and stops offering once it is closed', async () => {
    commands.executeCommand.mockClear();const { chat, webview, messages } = host();
    await chat.dispatchMessage({kind:'openBrowser',url:'http://localhost:3000'},webview);
    expect(messages).toContainEqual({ kind: 'panes', browser: true, terminal: false });
    await chat.dispatchMessage({kind:'closeBrowser'},webview);
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.browser.closeAll');
    expect(messages[messages.length - 1]).toEqual({ kind: 'panes', browser: false, terminal: false });
  });
  it('keeps a single preview: a second request closes the open browser before opening one', async () => {
    commands.executeCommand.mockClear();const { chat, webview } = host();
    await chat.dispatchMessage({kind:'openBrowser',url:'http://localhost:3000'},webview);
    await chat.dispatchMessage({kind:'openBrowser',url:'http://localhost:4000'},webview);
    expect(commands.executeCommand.mock.calls.map(([id]: [string]) => id).filter((id: string) => id !== 'setContext')).toEqual([
      'workbench.action.browser.closeAll','workbench.action.browser.open',
      'workbench.action.browser.closeAll','workbench.action.browser.open',
    ]);
  });
  it('keeps the browser to its chat: switching closes it, coming back reopens that chat\'s page', async () => {
    commands.executeCommand.mockClear();
    const { chat, webview } = host();
    const lastOpen = () => commands.executeCommand.mock.calls.filter(([id]: [string]) => id === 'workbench.action.browser.open').at(-1)?.[1];
    const store: Record<string, unknown> = {};
    chat.ctx.workspaceState = { get: (k: string) => store[k], update: async (k: string, v: unknown) => { store[k] = v; } };
    chat.replayAgent = vi.fn(); chat.pushWorkspace = vi.fn(); chat.sendConversations = vi.fn(); chat.pinnedMessage = () => ({});
    await chat.dispatchMessage({ kind: 'openBrowser', url: 'https://lernen.example/' }, webview);

    // Ein anderer Chat erbt weder den offenen Browser noch dessen Seite.
    chat.bindAgent('work');
    await vi.waitFor(() => expect(chat.sidePanes.browser).toBe(false));
    await chat.dispatchMessage({ kind: 'openBrowser' }, webview);
    expect(lastOpen()).toEqual({ url: undefined, openToSide: true });
    await chat.dispatchMessage({ kind: 'closeBrowser' }, webview);

    // Zurück im ersten Chat öffnet sich seine eigene Seite wieder.
    chat.bindAgent('personal');
    await vi.waitFor(() => expect(lastOpen()).toEqual({ url: 'https://lernen.example/', openToSide: true }));
  });
  it('opens the terminal below the chat and keeps the session across a toggle', async () => {
    commands.executeCommand.mockClear(); window.createTerminal.mockClear();
    const { chat, messages } = host();
    chat.conversationCwd = async () => '/personal';

    await chat.toggleTerminalDock();
    expect(window.createTerminal).toHaveBeenCalledTimes(1);
    // Unten, nicht daneben: ohne `location` legt Code-OSS es ins Panel.
    expect(window.createTerminal.mock.calls[0][0]).not.toHaveProperty('location');
    expect(messages).toContainEqual({ kind: 'panes', browser: false, terminal: true });

    // Zweiter Druck: das Panel geht zu, die Shell läuft weiter.
    await chat.toggleTerminalDock();
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.closePanel');
    expect(chat.sidePanes.terminal.dispose).not.toHaveBeenCalled();

    // Dritter Druck zeigt dieselbe Sitzung wieder, statt eine zweite anzulegen.
    await chat.toggleTerminalDock();
    expect(window.createTerminal).toHaveBeenCalledTimes(1);
    expect(chat.sidePanes.terminal.show).toHaveBeenCalledTimes(2);
  });
  it('honours cortex.terminalLocation "beside" for anyone who set it', async () => {
    window.createTerminal.mockClear();
    const { chat } = host();
    chat.conversationCwd = async () => '/personal';
    const { workspace } = await import('./vscodeStub.js');
    workspace.getConfiguration.mockReturnValueOnce({ get: () => 'beside', update: async () => {} });
    await chat.toggleTerminalDock();
    expect(window.createTerminal.mock.calls[0][0].location).toEqual({ viewColumn: -2 });
  });
  it('the × hides the terminal and reopening retains the same shell', async () => {
    const { chat, webview, messages } = host();
    chat.conversationCwd = async () => '/personal';
    await chat.toggleTerminalDock();
    const terminal = chat.sidePanes.terminal;
    await chat.dispatchMessage({ kind: 'closeTerminal' }, webview);
    expect(terminal.dispose).not.toHaveBeenCalled();
    expect(chat.sidePanes.terminal).toBe(terminal);
    expect(messages[messages.length - 1]).toEqual({ kind: 'panes', browser: false, terminal: false });
    await chat.toggleTerminalDock();
    expect(chat.sidePanes.terminal).toBe(terminal);
    expect(terminal.show).toHaveBeenCalledTimes(2);
  });
  it('rejects non-web protocols passed by a webview', async () => {
    commands.executeCommand.mockClear();const { chat, webview } = host();
    await chat.dispatchMessage({kind:'openBrowser',url:'file:///etc/passwd'},webview);
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
