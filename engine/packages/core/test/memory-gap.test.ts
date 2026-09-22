import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/adapters/adapter.js';
import { FakeAdapter } from '../src/adapters/fake.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { QuotaTracker } from '../src/quota/quotaTracker.js';
import { SessionStore, condenseTurn, embedHistory, flattenWidgets } from '../src/session/sessionStore.js';
import type { RulesFile } from '../src/rules/schema.js';
import type { AccountProfile, RunEvent, TaskRequest } from '../src/types.js';

/**
 * The Apify chat of 15.–17.09.2026: Grok picked the actors, Opus joined later,
 * and from then on the two took turns — each resuming its own session and
 * missing what the other had said in between.
 */

const accounts: AccountProfile[] = [
  { id: 'grok-side', provider: 'grok', label: 'side', authMode: 'oauth-token', hasSecret: true, priority: 1 },
  { id: 'claude-biz', provider: 'claude', label: 'biz', authMode: 'oauth-token', hasSecret: true, priority: 2 },
];

const rules: RulesFile = { version: 1, rules: [], defaultChain: [{ provider: 'claude', account: 'biz' }] };

const ACTOR_WIDGET =
  'Günstigste Variante je Plattform:\n\n```cortex-widget\n' +
  JSON.stringify({
    type: 'query-result',
    title: 'Günstigste Profil+Posts-Actors',
    columns: ['Plattform', 'Actor', 'Preis'],
    rows: [
      ['Instagram', 'apidojo/instagram-scraper', '0,0005 USD/Post'],
      ['TikTok', 'apidojo/tiktok-scraper', '0,0003 USD/Post'],
      ['X', 'apidojo/twitter-scraper-lite', '0,016 USD/Kanal'],
    ],
    actions: [{ label: 'Umstellen', prompt: 'Stelle WF-E.10 um …' }],
  }) +
  '\n```\n\nFünf Kanäle kosten etwa 0,12 USD.';

function setup() {
  const grok = new FakeAdapter('grok');
  const claude = new FakeAdapter('claude');
  const registry = new AdapterRegistry();
  registry.register(grok);
  registry.register(claude);
  const sessions = new SessionStore();
  const orchestrator = new Orchestrator({
    adapters: registry,
    quota: new QuotaTracker(),
    sessions,
    getRules: () => rules,
    getAccounts: () => accounts,
    resolveAccount: async (t) => accounts.find((a) => a.provider === t.provider && a.label === t.account),
    retryBackoffMs: [0],
  });
  return { grok, claude, sessions, orchestrator };
}

async function send(orchestrator: Orchestrator, prompt: string): Promise<RunEvent[]> {
  const task: TaskRequest = { conversationId: 'apify', prompt, cwd: '/tmp', permissionMode: 'safe' };
  const events: RunEvent[] = [];
  for await (const ev of orchestrator.run(task, new AbortController().signal)) events.push(ev);
  return events;
}

describe('memory across model switches', () => {
  it('a returning model hears what the other one said while it was away', async () => {
    const { grok, claude, orchestrator } = setup();

    grok.script('grok-side', [{ type: 'session', sessionId: 'g1' }, { type: 'result', text: ACTOR_WIDGET }]);
    await send(orchestrator, '@grok:side Finde die günstigsten Actors');

    // Opus joins cold: the actor table reaches it as text, not as a dropped JSON line.
    claude.script('claude-biz', [{ type: 'session', sessionId: 'c1' }, { type: 'result', text: 'Tabellen stehen in social.' }]);
    await send(orchestrator, '@claude:biz Wo sind die Tabellen?');
    const cold = claude.runs.at(-1)!.prompt;
    expect(cold).toContain('apidojo/instagram-scraper');
    expect(cold).toContain('Instagram | apidojo/instagram-scraper | 0,0005 USD/Post');
    expect(cold).not.toContain('"rows"');

    // Grok comes back: it resumes g1 and must be told what Opus answered.
    grok.script('grok-side', [{ type: 'session', sessionId: 'g1' }, { type: 'result', text: 'Überblick liegt in Nordwind Engine.' }]);
    await send(orchestrator, '@grok:side Mach den Überblick');
    const grokBack = grok.runs.at(-1)!;
    expect(grokBack.resumeSessionId).toBe('g1');
    expect(grokBack.prompt).toContain('While you were away');
    expect(grokBack.prompt).toContain('Tabellen stehen in social.');
    // Its own earlier answer is in its session already — not sent again.
    expect(grokBack.prompt).not.toContain('apidojo/tiktok-scraper');

    // Opus comes back: it gets Grok's latest turn, not its own.
    claude.script('claude-biz', [{ type: 'session', sessionId: 'c1' }, { type: 'result', text: 'ok' }]);
    await send(orchestrator, '@claude:biz Welche Actors hatten wir gewählt?');
    const claudeBack = claude.runs.at(-1)!.prompt;
    expect(claudeBack).toContain('Überblick liegt in Nordwind Engine.');
    expect(claudeBack).toContain('Assistant (grok:side');
    expect(claudeBack).not.toContain('Tabellen stehen in social.');
  });

  it('a model that answered last is not told anything extra', async () => {
    const { claude, orchestrator } = setup();
    claude.script('claude-biz', [{ type: 'session', sessionId: 'c1' }, { type: 'result', text: 'eins' }]);
    await send(orchestrator, '@claude:biz erste Frage');
    claude.script('claude-biz', [{ type: 'session', sessionId: 'c1' }, { type: 'result', text: 'zwei' }]);
    await send(orchestrator, '@claude:biz zweite Frage');
    expect(claude.runs.at(-1)!.prompt).not.toContain('While you were away');
  });

  it('what each session read survives a reload', () => {
    const a = new SessionStore();
    const target = { provider: 'claude' as const, account: 'biz' };
    a.appendTurn('c', { role: 'user', text: 'q' });
    a.appendTurn('c', { role: 'assistant', text: 'a' });
    a.markSeen('c', target, '/tmp');
    a.appendTurn('c', { role: 'user', text: 'q2' });
    a.appendTurn('c', { role: 'assistant', text: 'a2', by: 'grok:side' });

    const b = new SessionStore();
    for (const t of a.getHistory('c')) b.appendTurn('c', t);
    b.restoreSeen(a.serializeSeen());
    expect(b.missedTurns('c', target, '/tmp').map((t) => t.text)).toEqual(['q2', 'a2']);
  });

  it('a session nobody tracked is not flooded with the whole chat', () => {
    const s = new SessionStore();
    s.appendTurn('c', { role: 'user', text: 'q' });
    expect(s.missedTurns('c', { provider: 'claude', account: 'biz' }, '/tmp')).toEqual([]);
  });
});

describe('condensing turns', () => {
  it('turns a widget into readable lines and drops its suggested prompts', () => {
    const flat = flattenWidgets(ACTOR_WIDGET);
    expect(flat).toContain('[query-result: Günstigste Profil+Posts-Actors]');
    expect(flat).toContain('Plattform | Actor | Preis');
    expect(flat).toContain('X | apidojo/twitter-scraper-lite | 0,016 USD/Kanal');
    expect(flat).not.toContain('Stelle WF-E.10');
  });

  it('leaves a block that is not JSON alone', () => {
    const text = '```cortex-widget\nnot json\n```';
    expect(flattenWidgets(text)).toBe(text);
  });

  it('keeps the start and the end of a long answer', () => {
    const lines = ['ANFANG: worum es geht'];
    for (let i = 0; i < 400; i++) lines.push(`Zeile ${i} mit etwas Fülltext, damit es lang wird`);
    lines.push('ENDE: das Ergebnis');
    const out = condenseTurn(lines.join('\n'), 500);
    expect(out).toContain('ANFANG');
    expect(out).toContain('ENDE: das Ergebnis');
    expect(out).toContain('middle of this message omitted');
  });

  it('reaches a decision fifteen turns back', () => {
    const turns = [
      { role: 'user' as const, text: 'Welche Actors?' },
      { role: 'assistant' as const, text: ACTOR_WIDGET },
    ];
    for (let i = 0; i < 15; i++) {
      turns.push({ role: 'user', text: `Frage ${i}` });
      turns.push({ role: 'assistant', text: `Antwort ${i} `.repeat(120) });
    }
    expect(embedHistory(turns, 'jetzt')).toContain('apidojo/tiktok-scraper');
  });
});
