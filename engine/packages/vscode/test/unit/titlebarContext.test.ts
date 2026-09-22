import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';

vi.mock('vscode', async importOriginal => {
  const actual = await importOriginal<typeof import('vscode')>();
  return { ...actual, window: { ...actual.window, createWebviewPanel: vi.fn() } };
});

beforeEach(() => vi.clearAllMocks());

function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const webview = { postMessage: vi.fn(async () => true) };
  let viewState = () => {};
  let dispose = () => {};
  const panel = {
    webview, visible: true, active: true, reveal: vi.fn(),
    onDidChangeViewState: vi.fn(callback => { viewState = callback; }),
    onDidDispose: vi.fn(callback => { dispose = callback; }),
  };
  vi.mocked(vscode.window.createWebviewPanel).mockReturnValue(panel as any);
  chat.surfaces = new Map();
  chat.conversations = new Map([['blank', { id: 'blank', log: [], turns: [], updatedAt: 1 }]]);
  chat.resourceRoots = () => [];
  chat.attach = (webview: object, surface: object) => chat.surfaces.set(webview, surface);
  chat.exokortexWatch = { setOffen: vi.fn() };
  chat.openAgentHome();
  return { chat, panel, webview, viewState: () => viewState(), dispose: () => dispose() };
}

function expected(visible: boolean) {
  expect(vscode.commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'cortex.chatToolsVisible', visible);
}

it('hides uninitialized surfaces and follows all actual pages without discarding the selected chat', async () => {
  const { chat, webview } = host();
  await chat.pushTitlebarContext(); expected(false);
  for (const page of ['chat', 'agents', 'accounts', 'plugins', 'settings', 'exokortex', 'automations', 'chat']) {
    await chat.dispatchMessage({ kind: 'pageChanged', page }, webview);
    expected(page === 'chat');
    expect(chat.surfaces.get(webview).conversationId).toBe('blank');
  }
  chat.agentPanel = undefined;
  await chat.pushTitlebarContext(); expected(false);
});

it('keeps controls when a side pane takes focus, hides them behind another editor and restores only the current page', async () => {
  const { chat, panel, webview, viewState } = host();
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'chat' }, webview);
  panel.active = false; viewState(); expected(true);
  panel.visible = false; viewState(); expected(false);
  panel.visible = true; viewState(); expected(true);
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'agents' }, webview);
  panel.visible = false; viewState(); expected(false);
  panel.visible = true; panel.active = true; viewState(); expected(false);
});

it('ignores other surfaces, invalid pages and Exokortex cleanup from the previous page', async () => {
  const { chat, webview } = host();
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'settings' }, webview); expected(false);
  for (const mode of ['sidebar', 'tab', 'accounts', 'agent']) {
    const other = {};
    chat.surfaces.set(other, { mode });
    await chat.dispatchMessage({ kind: 'pageChanged', page: 'chat' }, other);
  }
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'unknown' }, webview);
  await chat.dispatchMessage({ kind: 'exokortexPageOpen', open: false }, webview);
  expect(vscode.commands.executeCommand).toHaveBeenCalledTimes(1);
  expected(false);
  expect(chat.exokortexWatch.setOffen).toHaveBeenCalledWith(false);
});

it('clears titlebar actions on disposal without reading a disposed panel webview', async () => {
  const { chat, panel, webview, dispose } = host();
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'chat' }, webview); expected(true);
  Object.defineProperty(panel, 'webview', { get() { throw new Error('Webview is disposed'); } });
  dispose(); expected(false);
  expect(chat.surfaces.has(webview)).toBe(false);
});

it.each(['sync', 'async'])('clears titlebar actions when posting discovers a dead surface (%s)', async kind => {
  const { chat, webview } = host();
  await chat.dispatchMessage({ kind: 'pageChanged', page: 'chat' }, webview); expected(true);
  webview.postMessage.mockImplementation(() => {
    if (kind === 'sync') throw new Error('disposed');
    return Promise.reject(new Error('disposed'));
  });
  chat.safePost(webview, { kind: 'showPage', page: 'accounts' });
  await Promise.resolve();
  expected(false);
  expect(chat.surfaces.has(webview)).toBe(false);
});

it('requires a confirmed visible chat for every contributed titlebar action and preserves open-state pairs', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const items = manifest.contributes.menus.titleBar;
  // Evaluate the existing conjunction-only conditions just as their context keys
  // would be resolved, including undefined keys before the extension starts.
  const shown = (context: Record<string, boolean>) => items.filter((item: { when: string }) => item.when.split(' && ').every(term => term.startsWith('!') ? !context[term.slice(1)] : Boolean(context[term]))).map((item: any) => item.command ?? item.submenu);
  expect(shown({})).toEqual([]);
  expect(shown({ 'cortex.chatToolsVisible': false, 'cortex.browserOpen': true, 'cortex.filesOpen': true, 'cortex.terminalOpen': true })).toEqual([]);
  expect(shown({ 'cortex.chatToolsVisible': true })).toEqual(['cortex.showPreview', 'cortex.showFiles', 'cortex.showTerminal', 'cortex.chatMenu']);
  expect(shown({ 'cortex.chatToolsVisible': true, 'cortex.browserOpen': true, 'cortex.filesOpen': true, 'cortex.terminalOpen': true })).toEqual(['cortex.hidePreview', 'cortex.hideFiles', 'cortex.hideTerminal', 'cortex.chatMenu']);
});
