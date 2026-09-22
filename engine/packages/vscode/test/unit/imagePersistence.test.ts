import { describe, expect, it, vi } from 'vitest';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.conversations = new Map([['one', { id: 'one', log: [], turns: [] }]]);
  chat.surfaces = new Map();
  chat.tasks = new Map();
  chat.runClocks = new Map();
  chat.imageRoots = () => ['/images'];
  chat.persistSoon = vi.fn();
  chat.pushQueue = vi.fn();
  chat.exokortex = { schreibe: vi.fn() };
  chat.sessions = { serializeNative: () => ({}), serializeForkPoints: () => ({}), serializeSeen: () => ({}), serializeTaskBriefs: () => ({}), serializeBriefs: () => ({}) };
  chat.queues = { items: () => [], snapshot: () => ({}) };
  const saved = new Map<string, any>();
  chat.ctx = { globalState: { update: async (key: string, value: unknown) => saved.set(key, JSON.parse(JSON.stringify(value))) } };
  return { chat, saved };
}

const image = { kind: 'image', messageId: 'm', path: '/images/beaver.png', src: 'https://old-surface/beaver.png', prompt: 'A beaver', options: { ratio: '1:1', count: 1 } };
const surface = (name: string) => ({ postMessage: vi.fn(), asWebviewUri: (uri: { fsPath: string }) => ({ toString: () => `https://${name}${uri.fsPath}` }) });

describe('generated image persistence', () => {
  it('migrates old provider paths before their profiles are removed (#71)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cx-image-migration-'));
    try {
      const profile = join(root, 'profile'), storage = join(root, 'storage');
      await mkdir(profile); const source = join(profile, 'old.png'); await writeFile(source, 'old image');
      const { chat, saved } = host();
      chat.ctx.globalStorageUri = { fsPath: storage };
      chat.output = { appendLine: vi.fn() };
      chat.imageSrc = async (path: string) => `file://${path}`;
      chat.conversations.get('one').log = [{ ...image, path: source }, { kind: 'userEcho', text: 'Edit', attachments: [source] }];
      await chat.migrateImageArchive(); await chat.persistNow();
      await rm(profile, { recursive: true });
      const restoredImage = saved.get('cortex.conversations')[0].log[0];
      expect(restoredImage.path).toContain(join(storage, 'bilder'));
      expect(await readFile(restoredImage.path, 'utf8')).toBe('old image');
      expect(saved.get('cortex.conversations')[0].log[1].attachments).toEqual([restoredImage.path]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('saves image events with the conversation and restores them into a fresh webview', async () => {
    const { chat, saved } = host();
    chat.toConversation('one', { kind: 'routing', messageId: 'm', target: { provider: 'grok', account: 'private' } });
    chat.toConversation('one', image);
    chat.toConversation('one', { kind: 'done', messageId: 'm', at: 1, durationMs: 100 });
    await chat.persistNow();
    const records = saved.get('cortex.conversations');
    expect(records[0].log.map((m: any) => m.kind)).toEqual(['routing', 'image', 'done']);
    const restored = host().chat;
    restored.conversations = new Map(records.map((r: any) => [r.id, r]));
    const webview = surface('restarted');
    restored.replayAgent(webview, 'one');
    expect(webview.postMessage).toHaveBeenCalledWith({ ...image, src: 'https://restarted/images/beaver.png' });
    expect(records[0].log[1]).toEqual(image);
  });

  it('addresses live images separately for each receiving panel', () => {
    const { chat } = host();
    const a = surface('agent'), b = surface('tab');
    chat.surfaces.set(a, { mode: 'agent', conversationId: 'one' });
    chat.surfaces.set(b, { mode: 'tab', conversationId: 'one' });
    chat.toConversation('one', image);
    expect(a.postMessage).toHaveBeenCalledWith({ ...image, src: 'https://agent/images/beaver.png' });
    expect(b.postMessage).toHaveBeenCalledWith({ ...image, src: 'https://tab/images/beaver.png' });
  });

  it('retains the data fallback for files outside the resource roots', () => {
    const { chat } = host();
    const external = { ...image, path: '/external/beaver.png', src: 'data:image/png;base64,aGVsbG8=' };
    expect(chat.replayable(external, undefined, surface('new'))).toEqual(external);
  });
});
