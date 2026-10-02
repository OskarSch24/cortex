import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import type { ProviderAdapter } from '../src/adapters/adapter.js';
import { briefDelta, withBrief } from '../src/context/brief.js';
import { expandSlashCommands } from '../src/commands/slashCommands.js';
import { afterGoalRound, goalCommand, goalContinuation, goalSections, parseGoalReport, startGoal, type ChatGoal } from '../src/goal/goal.js';
import type { ProviderId, ResolvedAccount } from '../src/types.js';

/**
 * Live: a real model works a `/goal` to its end, round by round, the way the
 * host drives it — the goal in the brief, a status block at the end of every
 * answer, automatic rounds until the model reports it done.
 *
 * The task has a check the model has to write and run itself, so "done" can
 * be tested against the folder afterwards rather than taken on trust.
 *
 * Runs only with CORTEX_LIVE=1 against the logged-in Cortex profiles in
 * ~/.cortex/profiles; CORTEX_LIVE_PROVIDER=claude|codex picks one. Works in a
 * fresh temporary folder, nowhere else.
 */

const LIVE = process.env.CORTEX_LIVE === '1';
const only = process.env.CORTEX_LIVE_PROVIDER;
const PROFILES = join(homedir(), '.cortex', 'profiles');
const MAX_ROUNDS = 4;

function profile(provider: ProviderId): ResolvedAccount | undefined {
  const id = existsSync(PROFILES) ? readdirSync(PROFILES).find(name => name.startsWith(`${provider}-`)) : undefined;
  return id ? { id, provider, label: 'live', authMode: 'managed-home', homeDir: join(PROFILES, id), hasSecret: false, priority: 1 } : undefined;
}

const CASES: Array<{ provider: ProviderId; adapter: ProviderAdapter }> = [
  { provider: 'claude', adapter: new ClaudeAdapter() },
  { provider: 'codex', adapter: new CodexAdapter() },
];

const TASK = '/goal Lege in diesem Ordner die Datei quadrate.txt an: die Quadratzahlen von 1 bis 12, eine je Zeile. '
  + 'Schreibe außerdem pruefe.sh, das die Datei prüft — genau 12 Zeilen, Zeile n enthält n·n — und nur dann mit Exit-Code 0 endet. '
  + 'Fertig ist es, wenn `sh pruefe.sh` erfolgreich läuft.';

describe.skipIf(!LIVE)('live: /goal runs to a proven end', () => {
  for (const entry of CASES) {
    const account = profile(entry.provider);
    it.skipIf((!!only && only !== entry.provider) || !account)(`${entry.provider} works the goal until it reports done`, async () => {
      const cwd = mkdtempSync(join(tmpdir(), 'cortex-goal-live-'));
      const command = goalCommand(TASK);
      if (command?.kind !== 'start') throw new Error('no goal in the task');
      let goal: ChatGoal = startGoal('live', command.objective, Date.now());
      const brief = briefDelta(undefined, goalSections(goal, expandSlashCommands(goal.objective))).text;
      let sessionId: string | undefined;
      let prompt = withBrief(expandSlashCommands(TASK), brief);
      const answers: string[] = [];

      for (let round = 1; round <= MAX_ROUNDS && goal.status === 'active'; round++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 280_000);
        const startedAt = Date.now();
        let answer = '';
        let toolUses = 0;
        let failed = false;
        for await (const ev of entry.adapter.run(
          { prompt, cwd, permissionMode: 'full', ...(sessionId ? { resumeSessionId: sessionId } : {}) },
          account!,
          controller.signal,
        )) {
          if (ev.type === 'session') sessionId = ev.sessionId;
          if (ev.type === 'tool-use') toolUses++;
          if (ev.type === 'result') answer += ev.text;
          if (ev.type === 'error' || ev.type === 'limit') { failed = true; console.log(`[${entry.provider}] ${ev.type}:`, 'message' in ev ? ev.message : ev.raw); }
        }
        clearTimeout(timer);
        answers.push(answer);
        console.log(`\n[${entry.provider} · Runde ${round}] ${answer.trim().slice(-600)}`);
        goal = afterGoalRound(goal, { answered: !!answer, stopped: false, failed, toolUses, answer, durationMs: Date.now() - startedAt }).goal;
        // Die nächste Runde kennt den Brief schon — sie hört nur „weiter“, wie im Host.
        prompt = goalContinuation(goal);
      }

      expect(goal.status, `status after ${goal.rounds} rounds`).toBe('done');
      // Jede Antwort endet mit einer lesbaren Statusmeldung.
      for (const answer of answers) expect(parseGoalReport(answer), answer.slice(-400)).toBeDefined();
      expect(goal.note, 'no evidence in the done report').toBeTruthy();
      // Und „fertig“ stimmt: die Datei ist da, die Prüfung des Modells läuft grün.
      const lines = readFileSync(join(cwd, 'quadrate.txt'), 'utf8').trim().split(/\r?\n/);
      expect(lines.map(line => Number(line.trim()))).toEqual(Array.from({ length: 12 }, (_, i) => (i + 1) ** 2));
      execFileSync('sh', ['pruefe.sh'], { cwd, stdio: 'pipe' });
    }, 1_200_000);
  }
});
