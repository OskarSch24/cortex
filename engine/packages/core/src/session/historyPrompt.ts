import type { ConversationTurn } from './sessionStore.js';
import { estimateTokens, headWithinTokens, tailWithinTokens } from '../context/tokens.js';
import { WIDGET_LANG } from '../context/widgetBrief.js';

/**
 * Wie der Verlauf eines Chats einem anderen Modell erzählt wird: eine
 * abgebrochene Antwort zum Weitermachen, verpasste Züge für eine
 * zurückkehrende Sitzung, der ganze Verlauf für ein kaltes Ziel.
 */

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
  return '[...earlier output truncated]\n' + tailLines(text.split('\n'), maxTokens).join('\n');
}

/**
 * The last lines that fit `maxTokens`, never reaching back to index `after`.
 * One line can outweigh the whole budget; losing the end to a line boundary
 * would defeat the point of keeping the tail, so that line is cut instead.
 */
function tailLines(lines: string[], maxTokens: number, after = -1): string[] {
  const kept: string[] = [];
  let spent = 0;
  for (let j = lines.length - 1; j > after; j--) {
    const cost = estimateTokens(lines[j]!) + 1;
    if (spent + cost > maxTokens) {
      if (kept.length === 0) kept.unshift(tailWithinTokens(lines[j]!, maxTokens));
      break;
    }
    spent += cost;
    kept.unshift(lines[j]!);
  }
  return kept;
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
  const tail = tailLines(lines, tailBudget, i);
  return `${head.join('\n')}\n[… middle of this message omitted …]\n${tail.join('\n')}`;
}

const WIDGET_BLOCK = new RegExp('```' + WIDGET_LANG + '\\s*\\n([\\s\\S]*?)\\n```', 'g');

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
