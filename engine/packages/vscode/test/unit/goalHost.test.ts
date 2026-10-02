import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GoalRound } from '@cortex/core';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import { MessageQueue, type QueuedMessage } from '../../src/panel/messageQueue.js';
import { restoredGoal, withoutGoalRounds } from '../../src/panel/host/goals.js';
import { queueTable } from '../../src/panel/host/queue.js';
import { window } from './vscodeStub.js';

const report = (body: string) => `Ich habe weitergearbeitet.\n\n\`\`\`cortex-goal\n${body}\n\`\`\``;
const round = (answer: string, over: Partial<GoalRound> = {}): GoalRound => ({
  answered: true, stopped: false, failed: false, toolUses: 2, answer, durationMs: 90_000, ...over,
});
const target = { provider: 'claude' as const, account: 'privat', model: 'claude-opus-5-5' };

/**
 * Der Provider ohne Konstruktor, wie in queuedMessageHost.test.ts: Warteschlange
 * und Ziel-Logik echt, der Lauf selbst eine Attrappe, die der Reihe nach die
 * vorbereiteten Runden zurückgibt.
 */
function host(answers: Array<GoalRound | undefined>) {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.conversations = new Map([['one', { id: 'one', title: '', projectPath: '/project', log: [], turns: [] }]]);
  chat.rules = { getCustomCommands: () => [] };
  chat.persistNow = vi.fn(async () => {}); chat.persistSoon = vi.fn();
  chat.detectRetry = vi.fn(); chat.toConversation = vi.fn();
  chat.tasks = new Map(); chat.liveRuns = new Map(); chat.steeredRuns = new Set();
  chat.compactingChats = new Map(); chat.projectRuns = new Map();
  chat.conversationCwd = vi.fn(async () => '/project');
  chat.relinkProject = vi.fn(async () => true);
  chat.panels = new Map(); chat.surfaces = new Map(); chat.sendConversations = vi.fn();
  chat.ctx = { globalStorageUri: { fsPath: mkdtempSync(join(tmpdir(), 'cortex-goal-')) } };
  chat.output = { appendLine: vi.fn() };
  chat.exokortex = { schreibe: vi.fn() };
  chat.runTask = vi.fn(async () => answers.shift());
  chat.queues = new MessageQueue((id, item) => chat.runQueuedMessage(id, item), vi.fn(), vi.fn());
  const sent = (kind: string) => chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === kind).map(([, msg]: any[]) => msg);
  const notices = () => sent('notice').map((msg: any) => msg.text as string);
  return { chat, sent, notices, goal: () => chat.conversations.get('one').goal };
}

describe('/goal im Host', () => {
  it('arbeitet Runde um Runde, bis das Modell es belegt — mit denselben Einstellungen', async () => {
    const { chat, goal, sent, notices } = host([
      round(report('{"status": "continue", "next": "Die übrigen Tests reparieren"}')),
      round(report('{"status": "continue", "next": "Lint aufräumen"}')),
      round(report('{"status": "done", "evidence": "npm test: 214 bestanden, Lint sauber"}'), { verified: 'passed' }),
    ]);
    await chat.handleSend('one', '/goal /test', [], { target, effort: 'high', permissionMode: 'full' });
    await vi.waitFor(() => expect(goal()?.status).toBe('done'));
    expect(chat.runTask).toHaveBeenCalledTimes(3);

    const [first, second, third] = chat.runTask.mock.calls;
    // Die erste Runde ist die Nachricht des Nutzers, so wie er sie schrieb.
    expect(first[1]).toContain('/goal /test');
    expect(first[3]).toMatchObject({ target, effort: 'high', permissionMode: 'full', planFirst: false });
    expect(first[3].continuation).toBeUndefined();
    // Die folgenden schickt Cortex selbst — gleiches Modell, gleiche Denkstufe, gleiche Rechte.
    expect(second[1]).toContain('Continue with the goal — round 2.');
    expect(second[3]).toMatchObject({ target, effort: 'high', permissionMode: 'full', planFirst: false, continuation: true });
    expect(third[1]).toContain('round 3');

    expect(goal()).toMatchObject({ objective: '/test', rounds: 3, note: 'npm test: 214 bestanden, Lint sauber', workMs: 270_000 });
    expect(notices().at(-1)).toBe('Ziel erreicht nach 3 Runden (5 Min.).');
    // Im Verlauf: die erste Runde als Nachricht des Nutzers, die übrigen als Runden von Cortex.
    const echoes = sent('userEcho');
    expect(echoes.map((msg: any) => msg.goal)).toEqual([
      { id: goal()!.id, round: 1, auto: false },
      { id: goal()!.id, round: 2, auto: true },
      { id: goal()!.id, round: 3, auto: true },
    ]);
    // Runden sind kein Nachhaken des Nutzers.
    expect(chat.detectRetry).toHaveBeenCalledTimes(1);
    expect(chat.queues.items('one')).toEqual([]);
  });

  it('gibt dem Modell das Ziel im Brief, solange es läuft — mit aufgelösten Befehlen', async () => {
    const { chat } = host([undefined]);
    chat.runTask = vi.fn(() => new Promise(() => {}));
    await chat.handleSend('one', '/goal /test die API', [], { target });
    const [section] = chat.zielAbschnitte('one');
    expect(section.body).toContain("Run this project's test suite");
    expect(section.body).toContain('die API');
    expect(chat.zielAuftrag('one')).toBe('/test die API');
    chat.goals.control('one', 'pause');
    expect(chat.zielAbschnitte('one')).toEqual([]);
  });

  it('wartet, wenn das Ziel den Nutzer braucht, und geht mit seiner Antwort weiter', async () => {
    const { chat, goal, notices } = host([
      round(report('{"status": "blocked", "reason": "Welche Domain soll die Seite bekommen?"}')),
      round(report('{"status": "done", "evidence": "Seite läuft unter example.org"}')),
    ]);
    await chat.handleSend('one', '/goal Richte die Landingpage ein', [], { target });
    await vi.waitFor(() => expect(goal()?.status).toBe('blocked'));
    expect(chat.runTask).toHaveBeenCalledOnce();
    expect(notices().at(-1)).toContain('Welche Domain soll die Seite bekommen?');
    // Nicht zu sehen: Cortex meldet sich.
    expect(window.showInformationMessage).toHaveBeenCalled();

    await chat.handleSend('one', 'Nimm example.org', [], { target });
    await vi.waitFor(() => expect(goal()?.status).toBe('done'));
    expect(chat.runTask).toHaveBeenCalledTimes(2);
    // Die Antwort des Nutzers ist selbst eine Runde des Ziels: sie plant nicht erst.
    expect(chat.runTask.mock.calls[1][3]).toMatchObject({ planFirst: false });
  });

  it('hält bei Stopp an, schickt nichts weiter und setzt auf „weiter“ fort', async () => {
    let finish!: (value: GoalRound) => void;
    const { chat, goal } = host([]);
    chat.runTask = vi.fn(() => new Promise<GoalRound>(resolve => { finish = resolve; }));
    await chat.handleSend('one', '/goal Baue die Suche', [], { target });
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledOnce());
    chat.tasks.set('one', new AbortController());
    queueTable.cancel({ kind: 'cancel' }, { surface: { mode: 'agent', conversationId: 'one' } } as any, chat.panelHost);
    expect(goal()).toMatchObject({ status: 'paused', pause: 'stopped' });
    chat.tasks.delete('one');
    finish(round('', { answered: false, stopped: true }));
    await vi.waitFor(() => expect(goal()?.rounds).toBe(1));
    expect(chat.runTask).toHaveBeenCalledOnce();
    expect(goal().status).toBe('paused');

    chat.runTask = vi.fn(async () => round(report('{"status": "done", "evidence": "Suche liefert Treffer"}')));
    await chat.handleSend('one', '/goal weiter', [], {});
    await vi.waitFor(() => expect(goal()?.status).toBe('done'));
    expect(chat.runTask).toHaveBeenCalledOnce();
    expect(chat.runTask.mock.calls[0][3]).toMatchObject({ continuation: true, target });
  });

  it('steuert mit /goal, /goal pause und /goal aus, ohne etwas an das Modell zu schicken', async () => {
    const { chat, goal, notices } = host([]);
    await chat.handleSend('one', '/goal', [], {});
    expect(notices().at(-1)).toContain('Kein Ziel gesetzt');
    chat.runTask = vi.fn(() => new Promise(() => {}));
    await chat.handleSend('one', '/goal Räume die Tests auf', [], { target });
    await vi.waitFor(() => expect(chat.runTask).toHaveBeenCalledOnce());
    await chat.handleSend('one', '/goal pause', [], {});
    expect(goal()).toMatchObject({ status: 'paused', pause: 'user' });
    await chat.handleSend('one', '/goal', [], {});
    expect(notices().at(-1)).toMatch(/^Ziel: Räume die Tests auf · angehalten \(von dir angehalten\)/);
    await chat.handleSend('one', '/goal aus', [], {});
    expect(goal()).toBeUndefined();
    expect(notices().at(-1)).toBe('Ziel beendet.');
    expect(chat.runTask).toHaveBeenCalledOnce();
  });

  it('hält nach einem Fehler an und nach zwei Runden ohne jeden Werkzeugaufruf', async () => {
    const failing = host([round('', { answered: false, failed: true })]);
    await failing.chat.handleSend('one', '/goal Baue X', [], { target });
    await vi.waitFor(() => expect(failing.goal()).toMatchObject({ status: 'paused', pause: 'error' }));

    const idle = host([round('Ich überlege noch.', { toolUses: 0 }), round('Weiter überlegt.', { toolUses: 0 })]);
    await idle.chat.handleSend('one', '/goal Baue Y', [], { target });
    await vi.waitFor(() => expect(idle.goal()).toMatchObject({ status: 'paused', pause: 'stalled' }));
    expect(idle.chat.runTask).toHaveBeenCalledTimes(2);
    // Die zweite Runde erfährt, dass die Statusmeldung fehlte.
    expect(idle.chat.runTask.mock.calls[1][1]).toContain('without the cortex-goal status block');
  });

  it('versteckt die automatischen Runden aus der Warteschlange und aus einem Neustart', async () => {
    const { chat } = host([]);
    const auto: QueuedMessage = { id: 'a', text: 'Continue with the goal — round 2.', tags: [], modes: {}, goal: { id: 'g', round: 2, auto: true } };
    const own: QueuedMessage = { id: 'b', text: 'Meine Nachricht', tags: [], modes: {} };
    expect(withoutGoalRounds([auto, own])).toEqual([own]);
    chat.queues.pause('one');
    chat.queues.enqueue('one', auto); chat.queues.enqueue('one', own);
    chat.queueVersions = new Map(); chat.queueCapabilities = new Map(); chat.queuePreviews = new Map();
    await chat.pushQueue('one');
    const [queue] = chat.toConversation.mock.calls.filter(([, msg]: any[]) => msg.kind === 'messageQueue').map(([, msg]: any[]) => msg);
    expect(queue.items.map((item: any) => item.id)).toEqual(['b']);

    const rec: any = { id: 'x', log: [], turns: [], goal: { id: 'g', objective: 'X', status: 'active', rounds: 2, maxRounds: 30, idle: 0, startedAt: 1, workMs: 0, modes: {}, tags: [] } };
    restoredGoal(rec);
    expect(rec.goal).toMatchObject({ status: 'paused', pause: 'restart' });
  });

  it('eine gescheiterte Runde wiederholen heißt: das Ziel fortsetzen', async () => {
    const { chat, goal } = host([round('', { answered: false, failed: true })]);
    await chat.handleSend('one', '/goal Baue X', [], { target });
    await vi.waitFor(() => expect(goal()?.status).toBe('paused'));
    const rec = chat.conversations.get('one');
    rec.log.push({ kind: 'userEcho', text: 'Continue with the goal — round 2.', goal: { id: goal().id, round: 2, auto: true } });
    chat.queues.resume('one');
    chat.runTask = vi.fn(async () => round(report('{"status": "done", "evidence": "fertig"}')));
    await chat.retryLast('one');
    await vi.waitFor(() => expect(goal()?.status).toBe('done'));
    expect(chat.runTask.mock.calls[0][1]).toContain('Continue with the goal');
  });
});

describe('/goal mit Erwähnung', () => {
  it('schickt jede Runde an das Modell, an das der /goal gerichtet war', async () => {
    const { chat, goal } = host([
      round(report('{"status": "continue", "next": "weiter"}')),
      round(report('{"status": "done", "evidence": "fertig"}')),
    ]);
    await chat.handleSend('one', '@codex:privat /goal Baue die Suche', [], { target });
    await vi.waitFor(() => expect(goal()?.status).toBe('done'));
    expect(goal().objective).toBe('Baue die Suche');
    expect(chat.runTask.mock.calls[0][1]).toMatch(/^@codex:privat \/goal Baue die Suche/);
    expect(chat.runTask.mock.calls[1][1]).toMatch(/^@codex:privat Continue with the goal — round 2\./);
  });
});
