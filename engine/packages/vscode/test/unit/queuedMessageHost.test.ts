import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { MessageQueue } from '../../src/panel/messageQueue.js';
import { workspace, window, ViewColumn } from './vscodeStub.js';

function host() {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.conversations = new Map([['one', { id: 'one', title: '', projectPath: '/project', log: [], turns: [] }], ['two', { id: 'two', title: '', log: [], turns: [] }]]);
  chat.rules = { getCustomCommands: () => [] }; chat.persistNow = vi.fn(async () => {}); chat.detectRetry = vi.fn(); chat.toConversation = vi.fn();
  chat.tasks = new Map(); chat.liveRuns = new Map(); chat.steeredRuns = new Set();
  chat.compactingChats = new Map();
  chat.projectRuns = new Map();
  chat.conversationCwd = vi.fn(async () => '/project');
  chat.relinkProject = vi.fn(async () => true);
  chat.panels = new Map();
  chat.surfaces = new Map(); chat.sendConversations = vi.fn();
  // Bild-Anhänge werden vor dem Lauf in Cortex' Ablage kopiert (imageAttachments.ts).
  chat.ctx = { globalStorageUri: { fsPath: mkdtempSync(join(tmpdir(), 'cortex-queue-')) } };
  chat.output = { appendLine: vi.fn() };
  // The durable chat archive, stubbed: this suite is about the queue, and a
  // unit test has no business writing into ~/Cortex-Chats.
  chat.exokortex = { schreibe: vi.fn() };
  let finish!: () => void; chat.runTask = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  chat.queues = new MessageQueue((id, item) => chat.runQueuedMessage(id, item), vi.fn(), vi.fn());
  return { chat, finish: () => finish() };
}
const target = { provider: 'claude', account: 'private', model: 'sonnet' };
describe('queue host integration', () => {
  it('echoes only dispatched messages, and appends attachment paths exactly once', async () => {
    const { chat, finish } = host();
    await chat.handleSend('one', 'First', [], { target });
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledOnce());
    const image = join(mkdtempSync(join(tmpdir(), 'cortex-bild-')), 'image.png');
    writeFileSync(image, 'png');
    const attachments = [image];
    await chat.handleSend('one', 'Second', [], { target, attachments, permissionMode: 'safe' });
    attachments.push('/unexpected.png');
    expect(chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === 'userEcho')).toHaveLength(1);
    expect(chat.queues.items('one')[0].text).toBe('Second');
    finish();
    // Das Bild wird vorher kopiert — das dauert länger als ein Takt.
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledTimes(2));
    // Das Bild geht als Kopie aus der Ablage mit — genau einmal, das später angehängte nicht.
    const sent = chat.runTask.mock.calls[1][3].attachments as string[];
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatch(/anhaenge\/.*-image\.png$/);
    expect(chat.runTask.mock.calls[1][1]).toContain('Second\n\nAttached files:\n- ');
    expect(chat.runTask.mock.calls[1][1]).toContain('image.png');
    expect(chat.conversations.get('one').title).toBe('First');
  });
  it('steers a matching queued message once without starting a second task', async () => {
    const { chat } = host(); chat.queues.pause('one');
    chat.queues.enqueue('one', { id: 'q', text: 'Change course', tags: [], modes: { target, permissionMode: 'safe' } });
    const inject = vi.fn(() => true);
    chat.tasks.set('one', new AbortController());
    chat.liveRuns.set('one', { handle: { inject, injectMode: 'inline' }, lastTarget: target, modes: { permissionMode: 'safe' }, userTexts: ['Original'], messageIds: ['m'], turnIdx: 0 });
    await chat.steerQueuedMessage('one', 'q'); await chat.steerQueuedMessage('one', 'q');
    expect(inject).toHaveBeenCalledOnce(); expect(chat.queues.items('one')).toEqual([]); expect(chat.runTask).not.toHaveBeenCalled();
    expect(chat.liveRuns.get('one').userTexts[0]).toContain('Change course');
    expect(chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === 'userEcho')).toHaveLength(1);
  });
  it('retains queued messages if injection is rejected, crosses a chat, or changes permissions', async () => {
    const { chat } = host(); chat.queues.pause('one');
    chat.queues.enqueue('one', { id: 'q', text: 'Keep me', tags: [], modes: { target, permissionMode: 'safe' } });
    const inject = vi.fn(() => false); chat.tasks.set('one', new AbortController());
    const live = { handle: { inject }, lastTarget: target, modes: { permissionMode: 'full' } }; chat.liveRuns.set('one', live);
    await chat.steerQueuedMessage('two', 'q'); await chat.steerQueuedMessage('one', 'q'); expect(inject).not.toHaveBeenCalled();
    live.modes.permissionMode = 'safe'; await chat.steerQueuedMessage('one', 'q'); expect(inject).toHaveBeenCalledOnce(); expect(chat.queues.items('one')).toHaveLength(1);
  });
  it('waits for steering acknowledgement and prevents duplicate dispatch if the active run finishes first', async () => {
    const { chat } = host(); chat.queues.pause('one');
    chat.queues.enqueue('one', { id: 'q', text: 'Keep until accepted', tags: [], modes: { target } });
    let reject!: (accepted: boolean) => void;
    const inject = vi.fn(() => new Promise<boolean>(resolve => { reject = resolve; }));
    chat.tasks.set('one', new AbortController());
    chat.liveRuns.set('one', { handle: { inject }, lastTarget: target, modes: {} });
    const steering = chat.steerQueuedMessage('one', 'q');
    await chat.steerQueuedMessage('one', 'q');
    chat.tasks.delete('one'); chat.queues.resume('one');
    expect(chat.runTask).not.toHaveBeenCalled(); expect(inject).toHaveBeenCalledOnce();
    expect(chat.queues.items('one')).toHaveLength(1);
    reject(false); await steering;
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledOnce()); // Rejected message now runs normally.
  });
  it('saves pending messages and stopped state before restart without running them', async () => {
    const { chat } = host();
    const saved = new Map<string, unknown>();
    chat.ctx = { globalState: { update: vi.fn(async (key, value) => { saved.set(key, JSON.parse(JSON.stringify(value))); }) } };
    chat.sessions = { serializeNative: () => ({ 'one:claude:private': 'session-id' }), serializeForkPoints: () => ({}), serializeSeen: () => ({}), serializeTaskBriefs: () => ({}), serializeBriefs: () => ({}) };
    chat.sendConversations = vi.fn();
    chat.persistNow = (ChatViewProvider.prototype as any).persistNow.bind(chat);
    const controller = new AbortController(); chat.tasks.set('one', controller);
    chat.markStopped = vi.fn(id => chat.conversations.get(id).log.push({ kind: 'stopped', messageId: 'active' }));
    chat.queues.pause('one');
    chat.queues.enqueue('one', { id: 'pending', text: 'Keep after restart', tags: ['ui'], modes: { target, attachments: ['/project/image.png'], effort: 'high', permissionMode: 'safe' } });
    await chat.saveBeforeRestart();
    expect(controller.signal.aborted).toBe(true);
    expect((saved.get('cortex.conversations') as any[])[0].log).toContainEqual({ kind: 'stopped', messageId: 'active' });
    const restored = new MessageQueue(chat.runTask, vi.fn(), vi.fn());
    restored.restore(saved.get('cortex.messageQueues') as any);
    expect(restored.items('one')[0]?.modes.attachments).toEqual(['/project/image.png']);
    expect(restored.items('one')[0]?.modes.target).toEqual(target);
    expect(restored.isPaused('one')).toBe(true);
    expect(chat.runTask).not.toHaveBeenCalled();
  });
});

describe('queue issue regressions', () => {
  it('#36 opens the full code block beside the chat with a valid editor language', async () => {
    const { chat } = host(), view = {};
    chat.surfaces.set(view, { conversationId: 'one', mode: 'tab' });
    await chat.dispatchMessage({ kind: 'openCode', text: 'const value = 1;', language: 'ts' }, view);
    expect(workspace.openTextDocument).toHaveBeenLastCalledWith({ content: 'const value = 1;', language: 'typescript' });
    expect(window.showTextDocument).toHaveBeenLastCalledWith({ content: 'const value = 1;', language: 'typescript' }, { viewColumn: ViewColumn.Beside, preview: true });
  });
  it('#20 never publishes a stale asynchronous queue snapshot', async () => {
    const { chat } = host(); chat.queues.pause('one'); chat.queueVersions = new Map();
    chat.queues.enqueue('one', { id: 'a', text: 'a', tags: [], modes: { attachments: ['/a.png'] } });
    chat.queues.enqueue('one', { id: 'b', text: 'b', tags: [], modes: {} });
    let resolve!: (value: string) => void;
    chat.previewFor = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValue('latest');
    const stale = chat.pushQueue('one');
    chat.queues.move('one', 'b', -1);
    await chat.pushQueue('one'); resolve('old'); await stale;
    const snapshots = chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === 'messageQueue');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0][1].items.map((item: any) => item.id)).toEqual(['b', 'a']);
  });
  it('#21 recomputes tags at the host dispatch boundary', async () => {
    const { chat } = host(); chat.queues.pause('one');
    chat.queues.enqueue('one', { id: 'q', text: 'before #old', tags: ['old'], modes: { target } });
    const view = {}; chat.surfaces.set(view, { conversationId: 'one', mode: 'tab' });
    await chat.dispatchMessage({ kind: 'editQueuedMessage', id: 'q', text: 'after #frontend' }, view);
    expect(chat.queues.items('one')[0]).toMatchObject({ tags: ['frontend'], modes: { target } });
  });
  it('#22 honors a typed target over the picker before offering steering', () => {
    const { chat } = host(); chat.tasks.set('one', new AbortController());
    chat.liveRuns.set('one', { handle: { inject: vi.fn() }, lastTarget: target, modes: {} });
    const queued = { id: 'q', text: '@codex change', tags: [], modes: { target } };
    expect(chat.canSteer('one', queued)).toBe(false);
    expect(chat.canSteer('one', { ...queued, text: '@claude change' })).toBe(true);
    expect(chat.canSteer('one', { ...queued, text: '@claude:other change' })).toBe(false);
    expect(chat.canSteer('one', { ...queued, text: '@claude:private/opus change' })).toBe(false);
  });
  it('nennt den Grund, wenn Steuern nicht geht — abgeschaltet ohne Erklärung sieht aus wie ein Fehler', async () => {
    const { chat } = host(); chat.tasks.set('one', new AbortController());
    chat.liveRuns.set('one', { handle: { inject: vi.fn() }, lastTarget: target, modes: { effort: 'high', permissionMode: 'safe' } });
    const queued = { id: 'q', text: 'Mach weiter', tags: [], modes: { target, effort: 'high' as const, permissionMode: 'safe' as const } };
    expect(chat.steerReason('one', queued)).toBeUndefined();

    // Wer die Reasoning-Stärke nach dem Start ändert, bekommt sonst nur eine
    // graue Schaltfläche zu sehen.
    expect(chat.steerReason('one', { ...queued, modes: { ...queued.modes, effort: 'ultra' } }))
      .toMatch(/Reasoning-Stärke.*automatisch raus/s);
    expect(chat.steerReason('one', { ...queued, modes: { ...queued.modes, permissionMode: 'yolo' } }))
      .toMatch(/Berechtigungen/);
    expect(chat.steerReason('one', { ...queued, text: '@codex weiter' })).toMatch(/codex.*claude/s);
    expect(chat.steerReason('one', { ...queued, modes: { ...queued.modes, image: { ratio: '1:1', count: 1 } } }))
      .toMatch(/Bildaufträge/);

    // Ein Anbieter ohne Übergabe unterwegs: der Name gehört in den Grund.
    chat.liveRuns.set('one', { handle: {}, lastTarget: target, modes: {} });
    expect(chat.steerReason('one', queued)).toMatch(/claude.*keine Nachrichten/s);

    chat.tasks.delete('one');
    expect(chat.steerReason('one', queued)).toMatch(/nur, während ein Auftrag läuft/);
  });
  it('legt den Grund in die Warteschlangen-Nachricht ans Fenster', async () => {
    const { chat } = host(); chat.queues.pause('one'); chat.queueVersions = new Map();
    chat.queues.enqueue('one', { id: 'q', text: 'Wartet', tags: [], modes: { target } });
    await chat.pushQueue('one');
    const snapshot = chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === 'messageQueue').at(-1)[1];
    expect(snapshot.items[0]).toMatchObject({ canSteer: false });
    expect(snapshot.items[0].steerReason).toMatch(/nur, während ein Auftrag läuft/);
  });
  it('#47 retains a shared-folder message until the other chat finishes', async () => {
    const { chat, finish } = host();
    await chat.handleSend('one', 'First', []);
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledOnce());
    await chat.handleSend('two', 'Second', []);
    await vi.waitFor(() => expect(chat.queues.pauseReason('two')).toBe('project'));
    expect(chat.queues.items('two').map((item: any) => item.text)).toEqual(['Second']);
    expect(chat.runTask).toHaveBeenCalledOnce();
    finish();
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledTimes(2));
    expect(chat.queues.items('two')).toEqual([]);
  });
});

describe('Wiederholen nach einem Fehler', () => {
  it('schickt die gescheiterte Nachricht erneut, auch ohne Antwort davor', async () => {
    const { chat } = host();
    chat.shownTarget = () => target;
    const rec = chat.conversations.get('one');
    // Ein Lauf, der gescheitert ist: der Verlauf kennt die Nachricht, `turns` nicht.
    rec.log.push({ kind: 'userEcho', text: 'Mach mit der Karte weiter', at: 1 });
    rec.log.push({ kind: 'error', messageId: 'm', message: 'claude exited with code 143' });
    await chat.retryLast('one');
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledTimes(1));
    expect(String(chat.runTask.mock.calls[0][1])).toContain('Mach mit der Karte weiter');
  });
  it('nimmt die letzte Nachricht, nicht eine ältere aus einer früheren Antwort', async () => {
    const { chat } = host();
    chat.shownTarget = () => target;
    const rec = chat.conversations.get('one');
    rec.turns.push({ role: 'user', text: 'alte Frage' }, { role: 'assistant', text: 'alte Antwort' });
    rec.log.push({ kind: 'userEcho', text: 'neue Frage', at: 2 });
    await chat.retryLast('one');
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledTimes(1));
    expect(String(chat.runTask.mock.calls[0][1])).toContain('neue Frage');
    expect(String(chat.runTask.mock.calls[0][1])).not.toContain('alte Frage');
  });
  it('wiederholt nichts, solange der Auftrag noch läuft', async () => {
    const { chat } = host();
    chat.shownTarget = () => target;
    chat.conversations.get('one').log.push({ kind: 'userEcho', text: 'läuft schon', at: 3 });
    chat.tasks.set('one', new AbortController());
    await chat.retryLast('one');
    expect(chat.runTask).not.toHaveBeenCalled();
    expect(chat.queues.items('one')).toHaveLength(0);
  });
});

describe('Excalidraw im Brief', () => {
  it('bleibt beim Chat, wenn der Reiter zu ist, solange eine Zeichnung gespeichert ist', async () => {
    const chat = Object.create(ChatViewProvider.prototype) as any;
    const dir = mkdtempSync(join(tmpdir(), 'cortex-canvas-'));
    chat.ctx = { globalStorageUri: { fsPath: dir } };
    chat.canvasSeen = new Map(); chat.canvasSaved = new Map();
    const history: Array<{ role: string; text: string }> = [];
    chat.sessions = { getHistory: () => history };
    // Kein Reiter, keine Zeichnung, kein /excalidraw: nichts.
    expect(chat.canvasAbschnitte('c1', 'Erkläre mir die Bilanz')).toEqual([]);
    // Eine gespeicherte Zeichnung: der Folgeauftrag kennt die Fläche weiter.
    const { mkdirSync } = await import('node:fs');
    mkdirSync(join(dir, 'canvas'), { recursive: true });
    writeFileSync(join(dir, 'canvas', 'c1.json'), JSON.stringify({ scene: '{}', applied: [], description: '- r1 rectangle "Kt Karte"' }));
    chat.canvasSaved = new Map();
    const sections = chat.canvasAbschnitte('c1', 'Füge noch die Zeitachse hinzu');
    expect(sections.map((s: any) => s.id)).toEqual(['canvas', 'canvas-scene']);
    expect(sections[1].body).toMatch(/closed in the side panel/);
    // Ein fremdes Thema: nur der Hinweis, nicht die Elementliste.
    expect(sections[1].body).not.toContain('r1 rectangle');
    // Hat die letzte Antwort gezeichnet, gehört der Folgeauftrag zur Zeichnung.
    history.push({ role: 'assistant', text: '```cortex-excalidraw\n{}\n```' });
    expect(chat.canvasAbschnitte('c1', 'Mach das größer')[1].body).toContain('r1 rectangle');
    // Offen: der aktuelle Stand aus der Webview.
    chat.canvasSeen.set('c1', '- r2 ellipse "Frage"');
    expect(chat.canvasAbschnitte('c1', 'weiter')[1].body).toContain('r2 ellipse');
  });
});
