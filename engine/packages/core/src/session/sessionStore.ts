import { createHash } from 'node:crypto';
import type { Target } from '../types.js';
import { targetKey } from '../types.js';
import type { BriefState } from '../context/brief.js';
import { estimateTokens, headWithinTokens, tailWithinTokens } from '../context/tokens.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Who answered — `formatTarget` of the run. Lets a model that was away see who did what. */
  by?: string;
}

/** What a live session has been told, and how much that is still worth trusting. */
interface SessionBrief {
  state: BriefState;
  /** Turns since it last heard the whole brief. */
  sinceFull: number;
  /** Context it reported last turn — a drop means the CLI compacted it. */
  contextTokens?: number;
}

/**
 * How many deltas a session may be sent before it hears everything again.
 *
 * A delta assumes the session still holds what it was told earlier, and every
 * CLI here compacts its own context when the window fills — summarizing older
 * turns, brief included, without telling anyone. Nothing we can read says when
 * that happened, so the assumption is refreshed on a fixed interval instead of
 * being trusted forever. Eight turns of savings, then one full brief.
 */
const FULL_BRIEF_EVERY = 8;

/**
 * A context this much smaller than last turn's did not shrink by itself. It is
 * the one compaction signature that shows up in numbers we are given.
 */
const COMPACTION_DROP = 0.6;

/**
 * Maps panel conversations to native CLI session ids (claude/codex resume) and
 * keeps turn history for providers without headless resume (copilot),
 * where prior turns are re-embedded into the prompt.
 */
export class SessionStore {
  private native = new Map<string, string>();
  private history = new Map<string, ConversationTurn[]>();
  private briefs = new Map<string, string>();
  private taskBriefs = new Map<string, SessionBrief>();
  /** Checkpoints the next run on a session has to fork at, rather than continue from its end. */
  private forkPoints = new Map<string, string>();
  /**
   * How many history turns each native session has read. A chat that moves
   * between models keeps one history but several sessions: whatever Grok said
   * while Claude was away is in the history and in no Claude session. Without
   * this count a returning session is resumed as if nothing had happened.
   */
  private seen = new Map<string, number>();

  private key(conversationId: string, target: Target, cwd: string): string {
    return `${conversationId}::${targetKey(target)}::${cwd}`;
  }

  getNativeSession(conversationId: string, target: Target, cwd: string): string | undefined {
    return this.native.get(this.key(conversationId, target, cwd));
  }

  setNativeSession(conversationId: string, target: Target, cwd: string, sessionId: string): void {
    this.native.set(this.key(conversationId, target, cwd), sessionId);
  }

  /**
   * Continue this conversation from inside an earlier session: the next run on
   * `target` resumes `sessionId`, cut after `checkpoint`. Everything the chat
   * knew natively is dropped first — every other session remembers turns that
   * no longer exist, and a target without a checkpoint rebuilds from history.
   */
  rewind(
    conversationId: string,
    turns: ConversationTurn[],
    at?: { target: Target; cwd: string; sessionId: string; checkpoint: string },
  ): void {
    this.clearConversation(conversationId);
    this.history.set(conversationId, turns.map((turn) => ({ ...turn })));
    if (!at) return;
    const key = this.key(conversationId, at.target, at.cwd);
    this.native.set(key, at.sessionId);
    this.forkPoints.set(key, at.checkpoint);
    // Cut at the checkpoint, the session holds exactly the history that is left.
    this.seen.set(key, turns.length);
  }

  /**
   * Turns this session has not read: everything appended since its last answer.
   * Empty when it is up to date — and when nobody recorded what it read (a
   * session restored from before this was tracked), because resending a whole
   * chat to a session that may well have it is the worse guess.
   */
  missedTurns(conversationId: string, target: Target, cwd: string): ConversationTurn[] {
    const read = this.seen.get(this.key(conversationId, target, cwd));
    if (read === undefined) return [];
    return this.getHistory(conversationId).slice(read);
  }

  /** The session has answered: it now holds the whole history as it stands. */
  markSeen(conversationId: string, target: Target, cwd: string): void {
    this.seen.set(this.key(conversationId, target, cwd), this.getHistory(conversationId).length);
  }

  forkPoint(conversationId: string, target: Target, cwd: string): string | undefined {
    return this.forkPoints.get(this.key(conversationId, target, cwd));
  }

  /** The fork happened (a new session id arrived) or cannot happen — continue normally. */
  clearForkPoint(conversationId: string, target: Target, cwd: string): void {
    this.forkPoints.delete(this.key(conversationId, target, cwd));
  }

  /** The session a fork point refers to is gone: that target starts cold, from history. */
  dropSession(conversationId: string, target: Target, cwd: string): void {
    const key = this.key(conversationId, target, cwd);
    for (const map of [this.native, this.briefs, this.taskBriefs, this.forkPoints, this.seen] as Array<Map<string, unknown>>) {
      map.delete(key);
    }
  }

  /**
   * The brief a session was last told. Transports without a system-prompt slot
   * only need to restate it when it actually changed.
   */
  briefChanged(conversationId: string, target: Target, cwd: string, brief: string): boolean {
    const key = this.key(conversationId, target, cwd);
    return this.briefs.get(key) !== briefHash(brief);
  }

  rememberBrief(conversationId: string, target: Target, cwd: string, brief: string): void {
    this.briefs.set(this.key(conversationId, target, cwd), briefHash(brief));
  }

  /**
   * Which task-brief sections this session has already been told, so the next
   * turn can send only what moved. Keyed like the native session id, because
   * that is exactly what it tracks: a context that still remembers.
   *
   * Undefined means "assume it knows nothing" — a target with no session, one
   * whose context was compacted, and one that has been living on deltas long
   * enough that it may have been.
   */
  taskBriefState(conversationId: string, target: Target, cwd: string): BriefState | undefined {
    const memory = this.taskBriefs.get(this.key(conversationId, target, cwd));
    if (!memory || memory.sinceFull >= FULL_BRIEF_EVERY) return undefined;
    return memory.state;
  }

  /**
   * Committed only once a run actually produced an answer. A brief sent into an
   * attempt that hit a limit was never read, and recording it would leave the
   * next turn silent about context the model never saw.
   */
  rememberTaskBrief(
    conversationId: string,
    target: Target,
    cwd: string,
    state: BriefState,
    info: { sentFull: boolean; contextTokens?: number },
  ): void {
    const key = this.key(conversationId, target, cwd);
    const previous = this.taskBriefs.get(key);
    const compacted =
      previous?.contextTokens !== undefined &&
      info.contextTokens !== undefined &&
      info.contextTokens < previous.contextTokens * COMPACTION_DROP;
    this.taskBriefs.set(key, {
      state,
      // A compacted session may have lost this very brief along with the turns
      // around it, so the next one starts over rather than building on it.
      sinceFull: compacted ? FULL_BRIEF_EVERY : info.sentFull ? 0 : (previous?.sinceFull ?? 0) + 1,
      contextTokens: info.contextTokens ?? previous?.contextTokens,
    });
  }

  /** This session is not the one we were talking to. Everything must be said again. */
  forgetTaskBrief(conversationId: string, target: Target, cwd: string): void {
    this.taskBriefs.delete(this.key(conversationId, target, cwd));
  }

  appendTurn(conversationId: string, turn: ConversationTurn): void {
    const turns = this.history.get(conversationId) ?? [];
    turns.push(turn);
    this.history.set(conversationId, turns);
  }

  getHistory(conversationId: string): ConversationTurn[] {
    return this.history.get(conversationId) ?? [];
  }

  clearConversation(conversationId: string): void {
    this.history.delete(conversationId);
    for (const map of [this.native, this.briefs, this.taskBriefs, this.forkPoints, this.seen] as Array<Map<string, unknown>>) {
      for (const key of [...map.keys()]) {
        if (key.startsWith(`${conversationId}::`)) map.delete(key);
      }
    }
  }

  /** Native CLI session ids survive host restarts via these two. */
  serializeNative(): Record<string, string> {
    return Object.fromEntries(this.native);
  }

  restoreNative(data: Record<string, string>): void {
    for (const [key, value] of Object.entries(data)) this.native.set(key, value);
  }

  /** A pending fork outlives a reload too — otherwise the next turn would resume the uncut session. */
  serializeForkPoints(): Record<string, string> {
    return Object.fromEntries(this.forkPoints);
  }

  restoreForkPoints(data: Record<string, string>): void {
    for (const [key, value] of Object.entries(data)) this.forkPoints.set(key, value);
  }

  /** What each session has read survives a reload with the session it belongs to. */
  serializeSeen(): Record<string, number> {
    return Object.fromEntries(this.seen);
  }

  restoreSeen(data: Record<string, number>): void {
    for (const [key, value] of Object.entries(data)) {
      if (Number.isInteger(value) && value >= 0) this.seen.set(key, value);
    }
  }

  /**
   * Which standing instructions each session heard, as a fingerprint. Without
   * it every restart restated them — thousands of tokens — to a Grok session
   * that still had them.
   */
  serializeBriefs(): Record<string, string> {
    return Object.fromEntries([...this.briefs].filter(([key]) => this.native.has(key)));
  }

  restoreBriefs(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data ?? {})) {
      if (typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)) this.briefs.set(key, value);
    }
  }

  /**
   * What each session was told survives a reload with it. Otherwise every
   * restart sent the whole brief again into a session that still held it.
   * Only for sessions that are themselves remembered.
   */
  serializeTaskBriefs(): Record<string, SessionBrief> {
    return Object.fromEntries([...this.taskBriefs].filter(([key]) => this.native.has(key)));
  }

  restoreTaskBriefs(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data ?? {})) {
      const brief = value as Partial<SessionBrief> | null;
      if (!brief || typeof brief.state !== 'object' || brief.state === null) continue;
      if (!Object.values(brief.state).every((body) => typeof body === 'string')) continue;
      if (!Number.isInteger(brief.sinceFull) || brief.sinceFull! < 0) continue;
      this.taskBriefs.set(key, {
        state: brief.state as BriefState,
        sinceFull: brief.sinceFull!,
        ...(typeof brief.contextTokens === 'number' ? { contextTokens: brief.contextTokens } : {}),
      });
    }
  }
}

/** Standing instructions are kilobytes; what a session heard only needs to be recognizable. */
function briefHash(brief: string): string {
  return createHash('sha1').update(brief).digest('hex');
}

const MAX_HANDOFF_TOKENS = 2_000;

/**
 * Hands an interrupted answer to whoever picks the task up next.
 *
 * Without this the replacement model starts blind at exactly the moment
 * continuity matters most — it asks "where were we?" while the user is
 * watching half an answer sitting above it.
 */
export function handoffPrompt(prompt: string, partial: string, from: string): string {
  const text = partial.trim();
  if (!text) return prompt;
  // The tail is what matters: it is where the work stopped.
  const trimmed = keepTail(text, MAX_HANDOFF_TOKENS);
  return (
    `${from} was working on the request below and got cut off mid-answer. ` +
    `This is everything it had produced:\n---\n${trimmed}\n---\n\n` +
    `Pick up from there: keep what is already correct, do not repeat finished work, ` +
    `and re-check anything the interrupted run may have left half-done. ` +
    `Do not ask where to resume — the text above is the state.\n\n` +
    `Original request:\n${prompt}`
  );
}

/** Same account, resumed session: it already has the partial answer in context. */
export function resumeInterruptedPrompt(prompt: string): string {
  return (
    'Your previous response to this request was cut off by a connection error. ' +
    'Continue from where you stopped instead of starting over.\n\n' +
    `Original request:\n${prompt}`
  );
}

/**
 * Keeps the last `maxTokens` worth of whole lines. Used where the *end* of a
 * text is the part that matters — an interrupted answer stops at its tail, and
 * that is exactly where the next model has to pick it up.
 */
function keepTail(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  const lines = text.split('\n');
  const kept: string[] = [];
  let spent = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const cost = estimateTokens(line) + 1;
    if (spent + cost > maxTokens) {
      // One line can outweigh the whole budget. Losing the end of the answer to
      // a line boundary would defeat the point of keeping the tail at all.
      if (kept.length === 0) kept.unshift(tailWithinTokens(line, maxTokens));
      break;
    }
    spent += cost;
    kept.unshift(line);
  }
  return '[...earlier output truncated]\n' + kept.join('\n');
}

/**
 * Token budget for history re-embedded into a cold target's first prompt.
 *
 * 6k used to be the figure, and it lost exactly what mattered in long working
 * chats: a decision made fifteen turns back was never reached. A cold start is
 * rare — it happens once per model per chat — so it can afford to read more.
 */
const MAX_EMBED_TOKENS = 12_000;
/** No single turn may eat more than this share of that budget. */
const MAX_TURN_TOKENS = 2_000;
/** What a returning session is told about the turns it missed. */
const MAX_CATCH_UP_TOKENS = 8_000;

/**
 * A turn as another model should read it: widgets as text, long answers cut in
 * the middle.
 *
 * A widget is one line of JSON, often thousands of tokens of it. Cut on line
 * boundaries it vanished whole — and a widget is usually where the table of
 * choices sits. The head of an answer says what it is about, the tail what was
 * concluded, so both are kept and the middle goes.
 */
export function condenseTurn(text: string, maxTokens: number = MAX_TURN_TOKENS): string {
  const flat = flattenWidgets(text);
  if (estimateTokens(flat) <= maxTokens) return flat;
  const lines = flat.split('\n');
  const headBudget = Math.floor(maxTokens * 0.6);
  const tailBudget = maxTokens - headBudget;
  const head: string[] = [];
  let spent = 0;
  let i = 0;
  for (; i < lines.length; i++) {
    const cost = estimateTokens(lines[i]!) + 1;
    if (spent + cost > headBudget) {
      if (head.length === 0) head.push(headWithinTokens(lines[i]!, headBudget));
      break;
    }
    spent += cost;
    head.push(lines[i]!);
  }
  const tail: string[] = [];
  spent = 0;
  for (let j = lines.length - 1; j > i; j--) {
    const cost = estimateTokens(lines[j]!) + 1;
    if (spent + cost > tailBudget) {
      if (tail.length === 0) tail.unshift(tailWithinTokens(lines[j]!, tailBudget));
      break;
    }
    spent += cost;
    tail.unshift(lines[j]!);
  }
  return `${head.join('\n')}\n[… middle of this message omitted …]\n${tail.join('\n')}`;
}

const WIDGET_BLOCK = /```cortex-widget\s*\n([\s\S]*?)\n```/g;

/** Every ```cortex-widget``` block as plain lines; a block that is not JSON stays as it was. */
export function flattenWidgets(text: string): string {
  return text.replace(WIDGET_BLOCK, (block, json: string) => {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      return block;
    }
    return widgetAsText(data);
  });
}

function widgetAsText(data: unknown): string {
  if (!data || typeof data !== 'object') return String(data);
  const w = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
  const out: string[] = [];
  const heading = [str(w.title), str(w.subtitle)].filter(Boolean).join(' — ');
  out.push(`[${str(w.type) || 'widget'}${heading ? `: ${heading}` : ''}]`);
  if (Array.isArray(w.columns) && Array.isArray(w.rows)) {
    out.push(w.columns.map(str).join(' | '));
    for (const row of w.rows) out.push(Array.isArray(row) ? row.map(str).join(' | ') : JSON.stringify(row));
  }
  if (Array.isArray(w.nodes)) {
    for (const n of w.nodes as Array<Record<string, unknown>>) {
      out.push(`- ${[str(n.label), str(n.detail)].filter(Boolean).join(': ')}${n.state ? ` (${str(n.state)})` : ''}`);
    }
  }
  // Whatever else the widget carries, minus the fields already shown and the
  // suggested follow-up prompts, which are offers rather than content.
  const shown = new Set(['type', 'title', 'subtitle', 'columns', 'rows', 'nodes', 'edges', 'actions']);
  const rest = Object.fromEntries(Object.entries(w).filter(([k]) => !shown.has(k)));
  if (Object.keys(rest).length > 0) out.push(JSON.stringify(rest));
  return out.join('\n');
}

function speaker(t: ConversationTurn): string {
  if (t.role === 'user') return 'User';
  return t.by ? `Assistant (${t.by})` : 'Assistant';
}

/**
 * Newest turns first until the budget is spent, returned oldest first, with a
 * note of how many older ones did not fit.
 */
function fitTurns(turns: ConversationTurn[], budget: number): { parts: string[]; omitted: number } {
  const parts: string[] = [];
  let i = turns.length - 1;
  for (; i >= 0; i--) {
    const t = turns[i]!;
    const chunk = `${speaker(t)}: ${condenseTurn(t.text)}`;
    budget -= estimateTokens(chunk);
    if (budget < 0) break;
    parts.unshift(chunk);
  }
  return { parts, omitted: i + 1 };
}

/**
 * The turns a resumed session missed, put in front of its prompt.
 *
 * The session remembers its own part of the chat; this is what happened while
 * another model had it. Told as what it is — earlier turns of this same chat —
 * so it neither repeats that work nor treats it as a new request.
 */
export function catchUpPrompt(missed: ConversationTurn[], prompt: string): string {
  if (missed.length === 0) return prompt;
  const { parts, omitted } = fitTurns(missed, MAX_CATCH_UP_TOKENS);
  const skipped = omitted > 0 ? `(${omitted} older messages from that stretch did not fit here.)\n\n` : '';
  return (
    'While you were away, this same chat continued with another model. ' +
    'These turns happened after your last answer — treat decisions in them as made, ' +
    'do not repeat their work:\n---\n' +
    skipped +
    parts.join('\n\n') +
    '\n---\n\nCurrent request:\n' +
    prompt
  );
}

/**
 * Prepends conversation history for a target that has no session yet — the
 * first turn on a provider without native resume, and every failover.
 *
 * This is the price of moving, paid in full at the far end where no cache
 * exists; `movePenalty` is what stops the router from paying it casually.
 */
export function embedHistory(turns: ConversationTurn[], prompt: string, budget: number = MAX_EMBED_TOKENS): string {
  if (turns.length === 0) return prompt;
  const { parts, omitted } = fitTurns(turns, budget);
  return (
    'Earlier conversation (for context, do not repeat):\n---\n' +
    (omitted > 0 ? `(${omitted} older messages did not fit here.)\n\n` : '') +
    parts.join('\n\n') +
    '\n---\n\nCurrent request:\n' +
    prompt
  );
}
