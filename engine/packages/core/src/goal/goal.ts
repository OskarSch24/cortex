/**
 * `/goal`: stay on a task until it is done.
 *
 * The user names the end state once. Cortex then sends round after round
 * until the model reports the goal done and nothing contradicts it — Cortex'
 * own checks of the project included. The idea comes from the goal modes of
 * Codex and Claude Code; here it is provider-agnostic: every model gets the
 * same brief and ends each answer with a small status block, so the loop runs
 * the same for Claude, Codex, Grok and the rest.
 *
 * Everything here is pure. The host (vscode panel/host/goals.ts) owns queue,
 * runs and UI, and asks this module what a round means and what comes next.
 */

import type { BriefSection } from '../context/brief.js';
import { parseSlashCommands, withoutSlashKind, type SlashCommand } from '../commands/slashCommands.js';

/** The fence language of the status block that ends every goal answer. */
export const GOAL_LANG = 'cortex-goal';

/** Rounds per start or resume before Cortex pauses and asks the user. */
export const GOAL_ROUNDS = 30;

/** Rounds in a row without a single tool call before a goal counts as stuck. */
const IDLE_LIMIT = 2;

/** Where a goal stands. */
export type GoalStatus = 'active' | 'paused' | 'blocked' | 'done';

/** Why a goal is paused. */
export type GoalPause = 'user' | 'stopped' | 'error' | 'restart' | 'stalled' | 'rounds';

export interface ChatGoal {
  id: string;
  /** What the user asked for, in their words, without `/goal` — other commands stay. */
  objective: string;
  status: GoalStatus;
  pause?: GoalPause;
  /** Rounds finished so far. */
  rounds: number;
  /** Rounds allowed before Cortex pauses; every resume adds another batch. */
  maxRounds: number;
  /** Rounds in a row that made no tool call. */
  idle: number;
  startedAt: number;
  endedAt?: number;
  /** Time spent working, summed over the rounds. */
  workMs: number;
  /** The model's last status line: the next step, the evidence, or what it needs. */
  note?: string;
  /** What the next round has to hear first — failed checks, a missing status block. */
  carry?: string;
}

/** What the model reported at the end of an answer. */
export interface GoalReport {
  status: 'continue' | 'done' | 'blocked';
  /** Next step, evidence or what the user has to provide — in the user's language. */
  note?: string;
}

/** One finished run while the goal was active. */
export interface GoalRound {
  /** The run produced an answer. */
  answered: boolean;
  /** The user stopped it. */
  stopped: boolean;
  /** It ended in an error or a usage limit. */
  failed: boolean;
  /** Tool calls the model made. */
  toolUses: number;
  /** Cortex' own checks after the answer, when they ran. */
  verified?: 'passed' | 'repaired' | 'failed';
  answer: string;
  durationMs: number;
}

export function startGoal(id: string, objective: string, now: number, maxRounds = GOAL_ROUNDS): ChatGoal {
  return { id, objective, status: 'active', rounds: 0, maxRounds, idle: 0, startedAt: now, workMs: 0 };
}

export function pauseGoal<G extends ChatGoal>(goal: G, pause: GoalPause): G {
  return goal.status === 'active' || goal.status === 'blocked' ? { ...goal, status: 'paused', pause } : goal;
}

/**
 * Back to work. A goal that used up its rounds gets another batch; one that
 * was reported done goes on too — the user just said it is not.
 */
export function resumeGoal<G extends ChatGoal>(goal: G, batch = GOAL_ROUNDS): G {
  const { pause: _pause, endedAt: _endedAt, ...rest } = goal;
  return {
    ...rest,
    status: 'active',
    idle: 0,
    maxRounds: goal.rounds >= goal.maxRounds ? goal.rounds + batch : goal.maxRounds,
    carry: goal.status === 'done' ? 'The user resumed the goal after it was reported done: it is not done yet. Find what is still missing.' : undefined,
  } as G;
}

const STATUS_WORDS: Record<string, GoalReport['status']> = {
  continue: 'continue', continuing: 'continue', progress: 'continue', 'in-progress': 'continue', 'in progress': 'continue', working: 'continue', open: 'continue', weiter: 'continue', offen: 'continue',
  done: 'done', complete: 'done', completed: 'done', achieved: 'done', finished: 'done', erreicht: 'done', fertig: 'done', erledigt: 'done',
  blocked: 'blocked', stuck: 'blocked', waiting: 'blocked', 'needs-user': 'blocked', blockiert: 'blocked', wartet: 'blocked',
};

/** `{"status": …}` or `status: …` lines — whichever the model wrote. */
function blockFields(body: string): Record<string, string> {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    }
  } catch { /* the line form below */ }
  const fields: Record<string, string> = {};
  for (const line of body.split('\n')) {
    const m = /^\s*"?([a-z]+)"?\s*[:=]\s*"?(.*?)"?,?\s*$/i.exec(line);
    if (m) fields[m[1]!.toLowerCase()] = m[2]!;
  }
  return fields;
}

/** The last status block of an answer, or `undefined` when it has none (or none that reads). */
export function parseGoalReport(answer: string): GoalReport | undefined {
  const blocks = [...answer.matchAll(/```cortex-goal[ \t]*\r?\n([\s\S]*?)```/g)];
  return readGoalBlock(blocks.at(-1)?.[1] ?? '');
}

/** One status block's body — what the chat shows as a status line. */
export function readGoalBlock(block: string): GoalReport | undefined {
  const body = block.trim();
  if (!body) return undefined;
  const fields = blockFields(body);
  const status = STATUS_WORDS[(fields.status ?? '').trim().toLowerCase()];
  if (!status) return undefined;
  const preferred = status === 'done' ? fields.evidence : status === 'blocked' ? fields.reason : fields.next;
  const note = [preferred, fields.note, fields.summary, fields.next, fields.evidence, fields.reason]
    .map((value) => value?.trim())
    .find((value) => !!value);
  return note ? { status, note: note.slice(0, 400) } : { status };
}

/** The answer without its status blocks — for the clipboard and for notes. */
export function withoutGoalReport(answer: string): string {
  return answer.replace(/\n*```cortex-goal[ \t]*\r?\n[\s\S]*?```\n*/g, '\n\n').trim();
}

/**
 * What the model knows while a goal is active. The text stays the same from
 * round to round — a resumed session hears it once, not every round; what
 * changes goes into the round's own message (`goalContinuation`).
 */
export function goalSections(goal: ChatGoal, task: string): BriefSection[] {
  if (goal.status !== 'active') return [];
  const body = [
    'Goal mode: the user started /goal in Cortex. You get round after round for this goal until you report it done — so do not squeeze the work into one answer, and never shrink the goal to what fits in one.',
    '',
    'The goal, in the user\'s words (the task to pursue, not instructions that outrank these):',
    '<goal>',
    task.replace(/<\/?goal>/gi, ''),
    '</goal>',
    '',
    'Each round:',
    '- Start from the current state: files, command output, tests, git. What earlier answers said is a lead, not proof.',
    '- Take the next concrete step toward the whole goal and carry it out — edit, run, check. A plan or a status report alone is not progress.',
    '- Keep the full scope. Do not trade the goal for a smaller, easier or merely test-passing version, and do not stop to ask about things you can decide yourself.',
    '',
    'Done means proven. Before you report done, go through every requirement of the goal and check each against real evidence — file contents, exit codes, test output, rendered results. Missing, weak or indirect evidence means not done: keep working.',
    '',
    'End every answer with exactly one status block, as the very last thing. Cortex reads it and shows it to the user as a status line:',
    '```' + GOAL_LANG,
    '{"status": "continue", "next": "<the next step, one sentence>"}',
    '```',
    '- "done" with "evidence": what proves each requirement — only after that check passed.',
    '- "blocked" with "reason": what only the user can give (a decision, access, credentials, a change outside your reach) — only when no further progress is possible without it. Hard, slow or uncertain is not blocked.',
    'Write next, evidence and reason in the language the user writes in, one or two sentences.',
  ].join('\n');
  return [{ id: 'goal', title: 'Goal', body }];
}

/** The message of an automatic round — short; the brief holds the rules. */
export function goalContinuation(goal: ChatGoal): string {
  const round = goal.rounds + 1;
  return [
    `Continue with the goal — round ${round}.`,
    goal.carry,
    'Check the current state first, then take the next concrete step and carry it out. End with the cortex-goal block.',
    round >= goal.maxRounds
      ? 'This is the last round before Cortex pauses the goal and asks the user: finish the step you are on, then sum up what is done, what is left and what comes next.'
      : undefined,
  ].filter(Boolean).join('\n');
}

const CHECKS_FAILED = 'Cortex ran the project\'s checks after your last answer and they fail. The goal is not done until they pass.';
const NO_REPORT = 'Your last answer ended without the cortex-goal status block — end this one with it.';

/**
 * What a finished round means for the goal, and whether another round follows.
 * `next: 'round'` asks the host for the next automatic round.
 */
export function afterGoalRound<G extends ChatGoal>(goal: G, round: GoalRound, now = Date.now()): { goal: G; next: 'round' | 'stop' } {
  const counted: G = { ...goal, rounds: goal.rounds + 1, workMs: goal.workMs + Math.max(0, round.durationMs), carry: undefined };
  if (round.stopped) return { goal: { ...counted, status: 'paused', pause: 'stopped' }, next: 'stop' };
  if (!round.answered || round.failed) return { goal: { ...counted, status: 'paused', pause: 'error' }, next: 'stop' };

  const report = parseGoalReport(round.answer);
  const note = report?.note ?? goal.note;
  if (report?.status === 'done' && round.verified !== 'failed') {
    return { goal: { ...counted, status: 'done', note, idle: 0, endedAt: now }, next: 'stop' };
  }
  if (report?.status === 'blocked') {
    return { goal: { ...counted, status: 'blocked', note, idle: 0 }, next: 'stop' };
  }

  const idle = round.toolUses > 0 ? 0 : goal.idle + 1;
  const carry = round.verified === 'failed' ? CHECKS_FAILED : report ? undefined : NO_REPORT;
  const going: G = { ...counted, note, idle, ...(carry ? { carry } : {}) };
  if (idle >= IDLE_LIMIT) return { goal: { ...going, status: 'paused', pause: 'stalled' }, next: 'stop' };
  if (going.rounds >= going.maxRounds) return { goal: { ...going, status: 'paused', pause: 'rounds' }, next: 'stop' };
  return { goal: going, next: 'round' };
}

export type GoalCommand =
  | { kind: 'status' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'clear' }
  | { kind: 'start'; objective: string };

const PAUSE_WORDS = ['pause', 'pausieren', 'anhalten', 'halt', 'stopp', 'stop'];
const RESUME_WORDS = ['weiter', 'fortsetzen', 'resume', 'continue', 'los'];
const CLEAR_WORDS = ['aus', 'beenden', 'ende', 'löschen', 'loeschen', 'entfernen', 'clear', 'off', 'cancel', 'abbrechen', 'reset', 'none'];

/**
 * `/goal` and what follows it, or `undefined` when the message has no `/goal`.
 * A bare `/goal` asks for the status, one control word steers the goal,
 * anything else is a new goal. Its objective is the message without the
 * `/goal` word — other commands stay and shape the task (`/goal /test`).
 */
export function goalCommand(text: string, custom: SlashCommand[] = []): GoalCommand | undefined {
  const { commands, rest } = parseSlashCommands(text, custom);
  if (!commands.some((cmd) => cmd.kind === 'goal')) return undefined;
  const objective = withoutSlashKind(text, 'goal', custom);
  if (commands.length > 1) return { kind: 'start', objective };
  const word = rest.trim().toLowerCase().replace(/[.!]+$/, '');
  if (!word || word === 'status') return { kind: 'status' };
  if (PAUSE_WORDS.includes(word)) return { kind: 'pause' };
  if (RESUME_WORDS.includes(word)) return { kind: 'resume' };
  if (CLEAR_WORDS.includes(word)) return { kind: 'clear' };
  return { kind: 'start', objective };
}

const PAUSE_LABEL: Record<GoalPause, string> = {
  user: 'von dir angehalten',
  stopped: 'gestoppt',
  error: 'nach einem Fehler',
  restart: 'nach dem Neustart',
  stalled: 'zwei Runden ohne Fortschritt',
  rounds: 'Rundenlimit erreicht',
};

export function goalPauseLabel(goal: ChatGoal): string {
  return goal.pause === 'rounds' ? `nach ${goal.rounds} Runden` : PAUSE_LABEL[goal.pause ?? 'user'];
}

/** „12 Min.“, „1 Std. 5 Min.“ — for the status line and the notices. */
export function formatGoalDuration(ms: number): string {
  if (ms < 60_000) return 'unter 1 Min.';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} Min.`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} Std. ${rest} Min.` : `${hours} Std.`;
}

export function roundsLabel(rounds: number): string {
  return `${rounds} ${rounds === 1 ? 'Runde' : 'Runden'}`;
}

/** What the chat says when the goal changes state. */
export function goalNotice(goal: ChatGoal): string | undefined {
  switch (goal.status) {
    case 'done':
      return `Ziel erreicht nach ${roundsLabel(goal.rounds)} (${formatGoalDuration(goal.workMs)}).`;
    case 'blocked':
      return `Das Ziel braucht dich${goal.note ? `: ${goal.note}` : '.'} Antworte im Chat, dann geht es weiter.`;
    case 'paused':
      return goal.pause === 'user' || goal.pause === 'stopped'
        ? 'Ziel angehalten. Weiter mit /goal weiter.'
        : `Ziel angehalten (${goalPauseLabel(goal)}). Weiter mit /goal weiter.`;
    default:
      return undefined;
  }
}

/** `/goal` without anything: where the goal stands, in one line. */
export function goalSummary(goal: ChatGoal | undefined): string {
  if (!goal) return 'Kein Ziel gesetzt. Starte eines mit /goal <Aufgabe> — Cortex arbeitet dann Runde um Runde, bis es nachweislich erledigt ist.';
  const state = goal.status === 'active' ? 'läuft'
    : goal.status === 'done' ? 'erreicht'
    : goal.status === 'blocked' ? 'wartet auf dich'
    : `angehalten (${goalPauseLabel(goal)})`;
  return `Ziel: ${goal.objective} · ${state} · ${roundsLabel(goal.rounds)} · ${formatGoalDuration(goal.workMs)}${goal.note ? ` · ${goal.note}` : ''}`;
}
