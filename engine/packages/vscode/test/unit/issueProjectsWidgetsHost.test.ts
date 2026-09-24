import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { MessageQueue } from '../../src/panel/messageQueue.js';
import { window, Uri } from './vscodeStub.js';

const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  const data = new Map<string, unknown>([['cortex.projects', [{ name: 'Saved name', path: '/missing-project-fixture', folders: ['/missing-project-fixture', '/secondary'] }]]]);
  chat.ctx = { globalState: { get: (key: string, fallback: unknown) => data.get(key) ?? fallback, update: vi.fn(async (key: string, value: unknown) => { data.set(key, value); }) } };
  const rec = { id: 'one', title: 'One', projectPath: '/missing-project-fixture', updatedAt: 1, log: [], turns: [] };
  const other = { ...rec, id: 'two' };
  chat.conversations = new Map([['one', rec], ['two', other]]);
  chat.tasks = new Map();
  chat.queues = { pause: vi.fn(), isWorking: () => false };
  const webview = {}; chat.surfaces = new Map([[webview, { mode: 'agent', conversationId: 'one' }]]);
  chat.safePost = vi.fn(); chat.persistNow = vi.fn(async () => {}); chat.sendConversations = vi.fn(); chat.pushWorkspace = vi.fn(async () => {});
  return { chat, data, rec, other, webview };
}
it('cancelling missing-project recovery preserves and pauses the queued message', async () => {
  const { chat } = host(); chat.relinkProject = vi.fn(async () => false); chat.toConversation = vi.fn();
  chat.queues = new MessageQueue((id, item) => chat.runQueuedMessage(id, item), () => {}, () => {});
  chat.queues.enqueue('one', { id: 'keep', text: 'do work', tags: [], modes: {} });
  await vi.waitFor(() => expect(chat.queues.isPaused('one')).toBe(true));
  expect(chat.queues.items('one').map((item: any) => item.id)).toEqual(['keep']);
});
it('relinks all existing project tasks while retaining the saved name and secondary root', async () => {
  const { chat, rec, other, data } = host();
  const next = await mkdtemp(join(tmpdir(), 'cortex-relink-')); dirs.push(next);
  const canonicalNext = await realpath(next);
  vi.mocked(window.showWarningMessage).mockResolvedValueOnce('Neuen Ordner zuweisen');
  const later = { ...rec, id: 'later' };
  (window as any).showOpenDialog = vi.fn(async () => { chat.conversations.set(later.id, later); return [Uri.file(next)]; });
  expect(await chat.relinkProject(rec.projectPath)).toBe(true);
  expect(rec.projectPath).toBe(canonicalNext); expect(other.projectPath).toBe(canonicalNext);
  expect(later.projectPath).toBe(canonicalNext);
  expect(data.get('cortex.projects')).toEqual([{ name: 'Saved name', path: canonicalNext, folders: [canonicalNext, '/secondary'], missing: true }]);
  expect(chat.persistNow).toHaveBeenCalled();
});
it('serializes global-setting writes and merges different keys after the prior write completes', async () => {
  const { chat, data, webview } = host(); let release!: () => void;
  chat.ctx.globalState.update.mockImplementationOnce(async (key: string, value: unknown) => { await new Promise<void>(resolve => { release = resolve; }); data.set(key, value); });
  const a = chat.dispatchMessage({ kind: 'setAppSetting', key: 'a', value: true, requestId: '1' }, webview);
  const b = chat.dispatchMessage({ kind: 'setAppSetting', key: 'b', value: true, requestId: '2' }, webview);
  await vi.waitFor(() => expect(chat.ctx.globalState.update).toHaveBeenCalledTimes(1));
  release(); await Promise.all([a, b]);
  expect(data.get('cortex.appSettings')).toEqual({ a: true, b: true });
  expect(chat.safePost.mock.calls.map((call: any[]) => call[1].revision)).toEqual([1, 2]);
});
it('persists independent widget states and never echoes an earlier pending write over the newest value', async () => {
  const { chat, rec, other, webview } = host(); let release!: () => void;
  chat.persistNow.mockImplementationOnce(async () => new Promise<void>(resolve => { release = resolve; }));
  const first = chat.dispatchMessage({ kind: 'setWidgetState', conversationId: 'one', key: 'm/0/1', value: [true] }, webview);
  await chat.dispatchMessage({ kind: 'setWidgetState', conversationId: 'one', key: 'm/0/1', value: [false] }, webview);
  release(); await first;
  expect((rec as any).widgetStates).toEqual({ 'm/0/1': [false] }); expect((other as any).widgetStates).toBeUndefined();
  expect(chat.safePost.mock.calls.every((call: any[]) => call[1].value[0] === false)).toBe(true);
});
it('project removal archives histories, suppresses historical resurrection, and can restore a task', async () => {
  const { chat, rec, other, data, webview } = host();
  vi.mocked(window.showWarningMessage).mockResolvedValueOnce('Archivieren');
  await chat.dispatchMessage({ kind: 'removeProject', path: rec.projectPath }, webview);
  expect((rec as any).archived).toBe(true); expect((other as any).archived).toBe(true);
  expect(data.get('cortex.projects')).toEqual([]); expect(chat.projects()).toEqual([]);
  (rec as any).archived = false;
  expect(chat.projects()).toHaveLength(1);
});
