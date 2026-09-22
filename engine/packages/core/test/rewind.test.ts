import { describe, expect, it } from 'vitest';
import { AdapterRegistry } from '../src/adapters/adapter.js';
import { FakeAdapter } from '../src/adapters/fake.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';
import { QuotaTracker } from '../src/quota/quotaTracker.js';
import { SessionStore } from '../src/session/sessionStore.js';
import type { RulesFile } from '../src/rules/schema.js';
import type { AccountProfile, RunEvent, TaskRequest } from '../src/types.js';

const accounts: AccountProfile[] = [
  { id: 'claude-a', provider: 'claude', label: 'a', authMode: 'oauth-token', hasSecret: true, priority: 1 },
];
const rules: RulesFile = { version: 1, rules: [], defaultChain: [{ provider: 'claude', account: 'a' }] };
const target = { provider: 'claude' as const, account: 'a' };

function setup() {
  const fake = new FakeAdapter('claude');
  const registry = new AdapterRegistry();
  registry.register(fake);
  const sessions = new SessionStore();
  const orchestrator = new Orchestrator({
    adapters: registry,
    quota: new QuotaTracker(),
    sessions,
    getRules: () => rules,
    getAccounts: () => accounts,
    resolveAccount: async (t) => accounts.find((a) => a.provider === t.provider && a.label === t.account),
    getRoutingMode: () => 'manual',
    retryBackoffMs: [0, 0],
  });
  return { fake, sessions, orchestrator };
}

const task = (prompt: string): TaskRequest => ({ conversationId: 'c', prompt, cwd: '/tmp', permissionMode: 'safe', routingMode: 'manual' });

async function drain(gen: AsyncGenerator<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

describe('going back to an earlier message', () => {
  it('forks the provider session at the checkpoint and forgets later turns', async () => {
    const { fake, sessions, orchestrator } = setup();
    fake.script('claude-a', [{ type: 'session', sessionId: 's1' }, { type: 'result', text: 'eins', checkpoint: 'u1' }]);
    await drain(orchestrator.run(task('erste'), new AbortController().signal));
    fake.script('claude-a', [{ type: 'session', sessionId: 's1' }, { type: 'result', text: 'zwei', checkpoint: 'u2' }]);
    await drain(orchestrator.run(task('zweite'), new AbortController().signal));
    expect(sessions.getHistory('c')).toHaveLength(4);

    // Back before the second message: only the first exchange remains.
    sessions.rewind('c', sessions.getHistory('c').slice(0, 2), { target, cwd: '/tmp', sessionId: 's1', checkpoint: 'u1' });
    fake.script('claude-a', [{ type: 'session', sessionId: 's2' }, { type: 'result', text: 'neu', checkpoint: 'u3' }]);
    await drain(orchestrator.run(task('anders'), new AbortController().signal));

    const run = fake.runs.at(-1)!;
    expect(run.resumeSessionId).toBe('s1');
    expect(run.resumeAt).toBe('u1');
    // The fork is a live session: no replayed history in the message.
    expect(run.prompt).not.toContain('Earlier conversation');
    expect(sessions.forkPoint('c', target, '/tmp')).toBeUndefined();
    expect(sessions.getNativeSession('c', target, '/tmp')).toBe('s2');
    expect(sessions.getHistory('c').map((t) => t.text)).toEqual(['erste', 'eins', 'anders', 'neu']);

    // The turn after that continues the fork normally.
    fake.script('claude-a', [{ type: 'session', sessionId: 's2' }, { type: 'result', text: 'weiter' }]);
    await drain(orchestrator.run(task('weiter'), new AbortController().signal));
    expect(fake.runs.at(-1)!.resumeSessionId).toBe('s2');
    expect(fake.runs.at(-1)!.resumeAt).toBeUndefined();
  });

  it('starts cold from the shortened history when the fork fails', async () => {
    const { fake, sessions, orchestrator } = setup();
    sessions.rewind('c', [{ role: 'user', text: 'erste' }, { role: 'assistant', text: 'eins' }], { target, cwd: '/tmp', sessionId: 'gone', checkpoint: 'u1' });
    fake.script('claude-a', [{ type: 'error', message: 'No message found with message.uuid of: u1', retryable: false }]);
    fake.script('claude-a', [{ type: 'session', sessionId: 'fresh' }, { type: 'result', text: 'ok' }]);
    const events = await drain(orchestrator.run(task('anders'), new AbortController().signal));

    expect(events.some((e) => e.type === 'error')).toBe(false);
    const retry = fake.runs.at(-1)!;
    expect(retry.resumeSessionId).toBeUndefined();
    expect(retry.prompt).toContain('Earlier conversation');
    expect(retry.prompt).toContain('eins');
  });

  it('without a checkpoint drops every native session and rebuilds from history', () => {
    const sessions = new SessionStore();
    sessions.setNativeSession('c', target, '/tmp', 's1');
    sessions.appendTurn('c', { role: 'user', text: 'a' });
    sessions.rewind('c', []);
    expect(sessions.getNativeSession('c', target, '/tmp')).toBeUndefined();
    expect(sessions.getHistory('c')).toEqual([]);
  });
  it('#44 non-native providers receive the retained conversation in a fork', async () => {
    const { fake, sessions, orchestrator } = setup();
    Object.defineProperty(fake, 'supportsNativeResume', { value: false });
    sessions.rewind('branch', [{ role: 'user', text: 'retained question' }, { role: 'assistant', text: 'retained answer' }]);
    fake.script('claude-a', [{ type: 'result', text: 'continued' }]);
    await drain(orchestrator.run({ ...task('alternate request'), conversationId: 'branch' }, new AbortController().signal));
    expect(fake.runs.at(-1)!.prompt).toContain('retained question');
    expect(fake.runs.at(-1)!.prompt).toContain('retained answer');
    expect(fake.runs.at(-1)!.resumeSessionId).toBeUndefined();
  });
});
