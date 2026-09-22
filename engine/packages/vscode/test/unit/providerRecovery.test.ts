import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { installManagedClaude, CLAUDE_PACKAGE } from '../../src/onboarding/installClaude.js';
import { addAccountWizard } from '../../src/onboarding/addAccount.js';

vi.mock('../../src/onboarding/addAccount.js', () => ({ addAccountWizard: vi.fn(async () => {}), respondToConnection: vi.fn() }));
const folders: string[] = [];
const temp = async () => { const path = await mkdtemp(join(tmpdir(), 'cx-recovery-')); folders.push(path); return path; };
afterEach(async () => { for (const path of folders.splice(0)) await rm(path, { recursive: true, force: true }); });
beforeEach(() => vi.clearAllMocks());

describe('explicit isolated Claude installer (#51)', () => {
  it('installs only the pinned package into the supplied runtime and checks its version', async () => {
    const root = await temp(), progress = vi.fn();
    const execute = vi.fn(async (_file: string, args: string[]) => ({ stdout: args[0] === '--version' ? '2.1.263 (Claude Code)' : '', stderr: '' }));
    const result = await installManagedClaude(progress, execute, root);
    expect(execute).toHaveBeenNthCalledWith(1, 'npm', ['install', '--prefix', root, '--no-audit', '--no-fund', CLAUDE_PACKAGE], expect.objectContaining({ timeout: 300_000 }));
    expect(execute).toHaveBeenNthCalledWith(2, join(root, 'node_modules/.bin/claude'), ['--version'], expect.objectContaining({ timeout: 20_000 }));
    expect(result.version).toBe('2.1.263 (Claude Code)');
    expect(progress).toHaveBeenCalledTimes(2);
  });
  it('surfaces installation failure without claiming success or running version checks', async () => {
    const root = await temp();
    const execute = vi.fn(async () => { throw Object.assign(new Error('not found'), { code: 'ENOENT' }); });
    await expect(installManagedClaude(() => {}, execute, root)).rejects.toThrow('npm');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('provider recovery is bound to the original failure (#62)', () => {
  const host = () => {
    const chat = Object.create(ChatViewProvider.prototype) as any, webview = {};
    chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'chat' }]]);
    chat.conversations = new Map([['chat', { id: 'chat', log: [{ kind: 'error', messageId: 'failure', recovery: 'reconnect-grok', recoveryAccountId: 'grok-original' }] }]]);
    chat.accounts = { all: () => [{ id: 'grok-other', provider: 'grok', label: 'other' }, { id: 'grok-original', provider: 'grok', label: 'original' }] };
    chat.adapters = {}; chat.safePost = vi.fn(); chat.pushAccounts = vi.fn();
    return { chat, webview };
  };
  it('does nothing until an explicit matching button action and reconnects the failing account', async () => {
    const { chat, webview } = host();
    expect(addAccountWizard).not.toHaveBeenCalled();
    await chat.dispatchMessage({ kind: 'recoverProvider', action: 'reconnect-grok', messageId: 'unrelated' }, webview);
    expect(addAccountWizard).not.toHaveBeenCalled();
    await chat.dispatchMessage({ kind: 'recoverProvider', action: 'reconnect-grok', messageId: 'failure' }, webview);
    expect(chat.safePost).toHaveBeenCalledWith(webview, { kind: 'showPage', page: 'accounts' });
    expect(addAccountWizard).toHaveBeenCalledWith(chat.accounts, chat.adapters, expect.objectContaining({ provider: 'grok', accountId: 'grok-original', label: 'original' }));
  });
});

describe('image save destination (#70)', () => {
  it('opens the native save dialog without a project and never copies on cancellation', async () => {
    const root = await temp(), source = join(root, 'image.png'); await writeFile(source, 'image');
    const chat = Object.create(ChatViewProvider.prototype) as any, webview = {};
    chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'chat' }]]);
    chat.imageRoots = () => [root]; chat.projectRoot = () => undefined;
    const copy = vi.fn(async () => {}); (vscode.workspace.fs as any).copy = copy;
    vi.mocked(vscode.window.showSaveDialog).mockResolvedValueOnce(undefined);
    await chat.dispatchMessage({ kind: 'imageAction', action: 'save', path: source }, webview);
    expect(vscode.window.showSaveDialog).toHaveBeenCalledOnce(); expect(copy).not.toHaveBeenCalled();
    const chosen = vscode.Uri.file(join(root, 'chosen.png'));
    vi.mocked(vscode.window.showSaveDialog).mockResolvedValueOnce(chosen);
    await chat.dispatchMessage({ kind: 'imageAction', action: 'save', path: source }, webview);
    expect(copy).toHaveBeenCalledWith(vscode.Uri.file(source), chosen, { overwrite: true });
  });
});
