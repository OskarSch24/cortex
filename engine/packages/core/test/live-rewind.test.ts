import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import type { ProviderAdapter, RunRequest } from '../src/adapters/adapter.js';
import type { AdapterEvent, ProviderId, ResolvedAccount } from '../src/types.js';

/**
 * Live check: going back to a message really resets the model's context.
 *
 * Two facts are told in two turns. The session is then forked at the first
 * turn's checkpoint and asked for both — it must know the first and not the
 * second. The original session is asked too and must still know both, because
 * a branch must never rewrite the chat it came from.
 *
 * Runs only with CORTEX_LIVE=1 against the Cortex profiles on this Mac;
 * CORTEX_LIVE_PROFILE_<PROVIDER> picks a profile folder under ~/.cortex/profiles.
 */

const LIVE = process.env.CORTEX_LIVE === '1';
const PROFILES = join(homedir(), '.cortex', 'profiles');

const account = (provider: ProviderId, dir: string): ResolvedAccount => ({
  id: dir,
  provider,
  label: 'live',
  authMode: 'managed-home',
  homeDir: join(PROFILES, dir),
  hasSecret: false,
  priority: 1,
});

const CASES: Array<{ provider: ProviderId; adapter: ProviderAdapter; account: ResolvedAccount; model?: string }> = [
  { provider: 'claude', adapter: new ClaudeAdapter(), account: account('claude', process.env.CORTEX_LIVE_PROFILE_CLAUDE ?? 'claude-p7ste5uu-qpokah5q'), model: 'haiku' },
  { provider: 'codex', adapter: new CodexAdapter(), account: account('codex', process.env.CORTEX_LIVE_PROFILE_CODEX ?? 'codex-mjtkz8sl-9p2f6i7k') },
];

async function turn(c: (typeof CASES)[number], cwd: string, prompt: string, extra: Partial<RunRequest> = {}) {
  let sessionId: string | undefined;
  let result: Extract<AdapterEvent, { type: 'result' }> | undefined;
  const events: AdapterEvent[] = [];
  for await (const ev of c.adapter.run({ prompt, cwd, model: c.model, permissionMode: 'safe', ...extra }, c.account, AbortSignal.timeout(170_000))) {
    events.push(ev);
    if (ev.type === 'session') sessionId ??= ev.sessionId;
    if (ev.type === 'result') result = ev;
  }
  if (!result) throw new Error(`no result: ${JSON.stringify(events.filter((e) => e.type !== 'text-delta')).slice(0, 800)}`);
  return { sessionId: sessionId!, text: result.text, checkpoint: result.checkpoint };
}

describe.skipIf(!LIVE)('live: rewind forks the session at a checkpoint', () => {
  for (const c of CASES) {
    it(`${c.provider}: the fork forgets later turns, the original keeps them`, async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'cortex-rewind-'));
      const ask = 'Nenne das Tier und die Farbe, die ich dir genannt habe. Antworte nur mit „Tier: X, Farbe: Y“ und schreibe „unbekannt“ für alles, was ich nicht genannt habe.';
      const first = await turn(c, cwd, 'Merke dir: Das Tier ist ein Okapi. Antworte nur mit OK.');
      expect(first.checkpoint).toBeTruthy();
      const second = await turn(c, cwd, 'Merke dir zusätzlich: Die Farbe ist Zinnober. Antworte nur mit OK.', { resumeSessionId: first.sessionId });

      const fork = await turn(c, cwd, ask, { resumeSessionId: second.sessionId, resumeAt: first.checkpoint });
      expect(fork.sessionId).not.toBe(second.sessionId);
      expect(fork.text.toLowerCase()).toContain('okapi');
      expect(fork.text.toLowerCase()).not.toContain('zinnober');

      const original = await turn(c, cwd, ask, { resumeSessionId: second.sessionId });
      expect(original.text.toLowerCase()).toContain('zinnober');
    }, 600_000);
  }
});
