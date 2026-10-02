import { describe, expect, it } from 'vitest';
import {
  GOAL_ROUNDS,
  afterGoalRound,
  formatGoalDuration,
  goalCommand,
  goalContinuation,
  goalNotice,
  goalSections,
  goalSummary,
  parseGoalReport,
  pauseGoal,
  resumeGoal,
  startGoal,
  withoutGoalReport,
  type ChatGoal,
  type GoalRound,
} from '../src/goal/goal.js';

const block = (body: string) => `Erledigt.\n\n\`\`\`cortex-goal\n${body}\n\`\`\``;
const round = (over: Partial<GoalRound> = {}): GoalRound => ({
  answered: true, stopped: false, failed: false, toolUses: 3, answer: block('{"status": "continue", "next": "Tests anpassen"}'), durationMs: 60_000, ...over,
});
const fresh = (over: Partial<ChatGoal> = {}): ChatGoal => ({ ...startGoal('g1', 'Alle Tests grün', 1_000), ...over });

describe('/goal command', () => {
  it('reads status, control words and new goals', () => {
    expect(goalCommand('/goal')).toEqual({ kind: 'status' });
    expect(goalCommand('/goal status')).toEqual({ kind: 'status' });
    expect(goalCommand('/goal pause')).toEqual({ kind: 'pause' });
    expect(goalCommand('/goal anhalten')).toEqual({ kind: 'pause' });
    expect(goalCommand('/goal weiter')).toEqual({ kind: 'resume' });
    expect(goalCommand('/goal Weiter!')).toEqual({ kind: 'resume' });
    expect(goalCommand('/goal aus')).toEqual({ kind: 'clear' });
    expect(goalCommand('/goal beenden')).toEqual({ kind: 'clear' });
    expect(goalCommand('/goal Baue die Startseite fertig')).toEqual({ kind: 'start', objective: 'Baue die Startseite fertig' });
    expect(goalCommand('/goal /test')).toEqual({ kind: 'start', objective: '/test' });
    expect(goalCommand('Bring den Build zum Laufen /goal')).toEqual({ kind: 'start', objective: 'Bring den Build zum Laufen' });
    expect(goalCommand('/test')).toBeUndefined();
    expect(goalCommand('Was ist ein goal?')).toBeUndefined();
  });

  it('a control word next to another command is part of a goal, not a control', () => {
    expect(goalCommand('/goal /test weiter')).toEqual({ kind: 'start', objective: '/test weiter' });
  });
});

describe('goal status block', () => {
  it('reads JSON and line forms, with the note that fits the status', () => {
    expect(parseGoalReport(block('{"status": "done", "evidence": "npm test: 214 bestanden"}'))).toEqual({ status: 'done', note: 'npm test: 214 bestanden' });
    expect(parseGoalReport(block('status: blocked\nreason: Es fehlt der API-Schlüssel'))).toEqual({ status: 'blocked', note: 'Es fehlt der API-Schlüssel' });
    expect(parseGoalReport(block('{"status": "continue", "next": "Lint-Fehler beheben"}'))).toEqual({ status: 'continue', note: 'Lint-Fehler beheben' });
    expect(parseGoalReport(block('{"status": "complete"}'))).toEqual({ status: 'done' });
  });

  it('takes the last block and ignores answers without a readable one', () => {
    const two = `${block('{"status": "continue"}')}\n${block('{"status": "done", "evidence": "fertig"}')}`;
    expect(parseGoalReport(two)?.status).toBe('done');
    expect(parseGoalReport('Keine Meldung.')).toBeUndefined();
    expect(parseGoalReport(block('{"status": "vielleicht"}'))).toBeUndefined();
  });

  it('can be taken out of an answer', () => {
    expect(withoutGoalReport(block('{"status": "done"}'))).toBe('Erledigt.');
  });
});

describe('goal brief and rounds', () => {
  it('briefs only an active goal, with the task and the block format, the same text every round', () => {
    const goal = fresh();
    const [section] = goalSections(goal, 'Run the test suite and fix failures.');
    expect(section?.id).toBe('goal');
    expect(section?.body).toContain('Run the test suite and fix failures.');
    expect(section?.body).toContain('```cortex-goal');
    expect(section?.body).toContain('"done" with "evidence"');
    expect(goalSections({ ...goal, rounds: 5 }, 'Run the test suite and fix failures.')[0]?.body).toBe(section?.body);
    expect(goalSections(pauseGoal(goal, 'user'), 'x')).toEqual([]);
  });

  it('numbers the rounds and warns before the last one', () => {
    expect(goalContinuation(fresh({ rounds: 2 }))).toMatch(/^Continue with the goal — round 3\./);
    expect(goalContinuation(fresh({ rounds: 29, maxRounds: 30 }))).toContain('last round');
    expect(goalContinuation(fresh({ carry: 'Checks fail.' }))).toContain('Checks fail.');
  });

  it('goes on while the model reports progress', () => {
    const { goal, next } = afterGoalRound(fresh(), round());
    expect(next).toBe('round');
    expect(goal).toMatchObject({ status: 'active', rounds: 1, workMs: 60_000, note: 'Tests anpassen', idle: 0 });
  });

  it('ends when the model proves it done', () => {
    const { goal, next } = afterGoalRound(fresh(), round({ answer: block('{"status": "done", "evidence": "alle grün"}'), verified: 'passed' }), 9_000);
    expect(next).toBe('stop');
    expect(goal).toMatchObject({ status: 'done', note: 'alle grün', endedAt: 9_000 });
    expect(goalNotice(goal)).toMatch(/^Ziel erreicht nach 1 Runde/);
  });

  it('does not accept "done" while Cortex\' own checks fail', () => {
    const { goal, next } = afterGoalRound(fresh(), round({ answer: block('{"status": "done"}'), verified: 'failed' }));
    expect(next).toBe('round');
    expect(goal.status).toBe('active');
    expect(goal.carry).toContain('checks');
  });

  it('waits for the user when blocked', () => {
    const { goal, next } = afterGoalRound(fresh(), round({ answer: block('{"status": "blocked", "reason": "Welche Domain?"}') }));
    expect(next).toBe('stop');
    expect(goal).toMatchObject({ status: 'blocked', note: 'Welche Domain?' });
    expect(goalNotice(goal)).toContain('Welche Domain?');
  });

  it('asks for the block when it is missing, and stops after two rounds without any tool call', () => {
    const first = afterGoalRound(fresh(), round({ answer: 'Ich plane jetzt.', toolUses: 0 }));
    expect(first.next).toBe('round');
    expect(first.goal.carry).toContain('cortex-goal');
    const second = afterGoalRound(first.goal, round({ answer: 'Immer noch Plan.', toolUses: 0 }));
    expect(second.next).toBe('stop');
    expect(second.goal).toMatchObject({ status: 'paused', pause: 'stalled' });
    // A round with tool calls resets the count.
    expect(afterGoalRound({ ...first.goal }, round()).goal.idle).toBe(0);
  });

  it('pauses on errors, on stop and after its rounds', () => {
    expect(afterGoalRound(fresh(), round({ failed: true })).goal).toMatchObject({ status: 'paused', pause: 'error' });
    expect(afterGoalRound(fresh(), round({ answered: false })).goal).toMatchObject({ status: 'paused', pause: 'error' });
    expect(afterGoalRound(fresh(), round({ stopped: true })).goal).toMatchObject({ status: 'paused', pause: 'stopped' });
    const last = afterGoalRound(fresh({ rounds: GOAL_ROUNDS - 1 }), round());
    expect(last).toMatchObject({ next: 'stop', goal: { status: 'paused', pause: 'rounds', rounds: GOAL_ROUNDS } });
    expect(goalNotice(last.goal)).toContain(`nach ${GOAL_ROUNDS} Runden`);
  });

  it('resumes with another batch of rounds, and reopens a goal reported done', () => {
    const tired = resumeGoal(fresh({ status: 'paused', pause: 'rounds', rounds: 30, maxRounds: 30, idle: 1 }));
    expect(tired).toMatchObject({ status: 'active', maxRounds: 30 + GOAL_ROUNDS, idle: 0 });
    expect(tired.pause).toBeUndefined();
    const reopened = resumeGoal(fresh({ status: 'done', endedAt: 5 }));
    expect(reopened.status).toBe('active');
    expect(reopened.endedAt).toBeUndefined();
    expect(reopened.carry).toContain('not done yet');
  });

  it('pausing leaves a finished goal alone', () => {
    const done = fresh({ status: 'done' });
    expect(pauseGoal(done, 'user')).toBe(done);
    expect(pauseGoal(fresh(), 'user')).toMatchObject({ status: 'paused', pause: 'user' });
  });

  it('sums a goal up in one German line', () => {
    expect(goalSummary(undefined)).toContain('/goal <Aufgabe>');
    expect(goalSummary(fresh({ rounds: 3, workMs: 125 * 60_000, note: 'Lint beheben' }))).toBe('Ziel: Alle Tests grün · läuft · 3 Runden · 2 Std. 5 Min. · Lint beheben');
    expect(formatGoalDuration(10_000)).toBe('unter 1 Min.');
    expect(formatGoalDuration(60 * 60_000)).toBe('1 Std.');
  });
});
