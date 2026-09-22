import { afterEach, describe, expect, it, vi } from 'vitest';
import { commands, window } from './vscodeStub.js';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';

const panelWindow = window as typeof window & { createWebviewPanel?: ReturnType<typeof vi.fn> };
afterEach(() => { delete panelWindow.createWebviewPanel; vi.clearAllMocks(); });

function fixture() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.conversations = new Map([['blank', { id: 'blank', log: [], turns: [], updatedAt: 1 }]]);
  chat.surfaces = new Map();
  chat.resourceRoots = () => [];
  chat.attach = (webview: object, surface: unknown) => chat.surfaces.set(webview, surface);
  const webview = {};
  let disposed = false;
  let onDispose: () => void = () => {};
  let onViewState: (event: { webviewPanel: unknown }) => void = () => {};
  const panel = {
    active: true,
    visible: true,
    get webview() { if (disposed) throw new Error('Webview is disposed'); return webview; },
    reveal() { if (disposed) throw new Error('Webview is disposed'); },
    onDidChangeViewState(listener: typeof onViewState) { onViewState = listener; return { dispose: () => { onViewState = () => {}; } }; },
    onDidDispose(listener: () => void) { onDispose = listener; return { dispose: () => { onDispose = () => {}; } }; },
    dispose() { disposed = true; panel.active = false; panel.visible = false; onDispose(); },
    setVisible(visible: boolean) { panel.visible = visible; panel.active = visible; onViewState({ webviewPanel: panel }); },
  };
  panelWindow.createWebviewPanel = vi.fn(() => panel);
  return { chat, panel, webview };
}

describe('agent home panel disposal', () => {
  it('clears the surface and panel after the host invalidates its webview getter', () => {
    const { chat, panel, webview } = fixture();
    chat.openAgentHome();
    expect(chat.surfaces.has(webview)).toBe(true);
    expect(chat.agentPanel).toBe(panel);
    expect(() => panel.dispose()).not.toThrow();
    expect(chat.surfaces.has(webview)).toBe(false);
    expect(chat.agentPanel).toBeUndefined();
    expect(() => panel.webview).toThrow('Webview is disposed');
    expect(commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'cortex.chatToolsVisible', false);
  });

  it('does not clear a replacement panel when the old panel finishes disposing', () => {
    const { chat, panel, webview } = fixture();
    chat.openAgentHome();
    const replacement = { visible: true, webview: {} };
    chat.surfaces.set(replacement.webview, { mode: 'agent', page: 'chat' });
    chat.agentPanel = replacement;
    panel.dispose();
    expect(chat.surfaces.has(webview)).toBe(false);
    expect(chat.agentPanel).toBe(replacement);
    expect(chat.surfaces.has(replacement.webview)).toBe(true);
    expect(commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'cortex.chatToolsVisible', true);
  });

  it('refreshes titlebar context when the live panel changes visibility', () => {
    const { chat, panel, webview } = fixture();
    chat.openAgentHome();
    chat.surfaces.get(webview).page = 'chat';
    panel.setVisible(false);
    expect(commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'cortex.chatToolsVisible', false);
    panel.setVisible(true);
    expect(commands.executeCommand).toHaveBeenLastCalledWith('setContext', 'cortex.chatToolsVisible', true);
    expect(chat.surfaces.has(webview)).toBe(true);
  });
});
