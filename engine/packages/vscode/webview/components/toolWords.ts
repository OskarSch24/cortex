/**
 * Was ein Werkzeug tut, das keine der festen Arten hat (lesen, schreiben,
 * suchen, ausführen, Web, Unteragent): Aufgabenliste, Hintergrundaufgaben,
 * Bilder, Plugins … Die Zeile nennt, was geschah — nicht bloß „Werkzeug
 * verwendet“, zehnmal untereinander.
 *
 * Zwei Zeitformen, weil zwei Stellen sie brauchen: die Zeile im Verlauf sagt,
 * was geschah („Aufgabenliste aktualisiert“), die Arbeitsanzeige, was gerade
 * geschieht („Plant die nächsten Schritte“).
 *
 * Reine Funktion, damit sie ohne Oberfläche prüfbar ist (test/unit/toolWords.test.ts).
 */
import type { ToolStep } from '../../src/panel/transcript.js';

export interface ToolWords {
  /** Die Zeile im Verlauf: „Bild erzeugt“. */
  done: string;
  /** Die Arbeitsanzeige: „Erzeugt ein Bild“. */
  now: string;
  /** Worauf es sich bezog — die Anfrage, der Skill, die Seite. */
  subject?: string;
  icon: string;
}

export const EXOKORTEX = /exokortex|vault|obsidian|graph_(query|node|nodes|edges)|\bwz_|lesen\.py|erinnerung|memory/i;
export const WEBSEARCH = /web_?search|search_?web|brave|tavily|perplexity|google_?search|serp|rag-web-browser|web-fetch/i;

/** `run_terminal_command` → „Run Terminal Command“. Was schon Wörter hat, bleibt, wie es ist. */
export const human = (id: string) =>
  /\s/.test(id.trim()) ? id.trim() : id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

/** Name ohne Schreibweise: `TodoWrite`, `todo_write` und `todo-write` sind dasselbe Werkzeug. */
const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

type Entry = [RegExp, string, string, string, boolean];

/** [Name, Verlauf, Arbeitsanzeige, Symbol, Argument zeigen] — Claude, Codex und Grok nennen dieselben Dinge verschieden. */
const WORDS: Entry[] = [
  [/^todo(write)?$/, 'Aufgabenliste aktualisiert', 'Plant die nächsten Schritte', 'text', false],
  [/^(getcommandorsubagentoutput|bashoutput|taskoutput)$/, 'Ausgabe einer Hintergrundaufgabe abgerufen', 'Wartet auf eine Hintergrundaufgabe', 'terminal', true],
  [/^(killcommandorsubagent|killshell|killbash|taskstop)$/, 'Hintergrundaufgabe beendet', 'Beendet eine Hintergrundaufgabe', 'terminal', true],
  [/^(searchtool|toolsearch)$/, 'Passende Werkzeuge nachgeschlagen', 'Schlägt passende Werkzeuge nach', 'search', true],
  [/^memorysearch$/, 'Im Gedächtnis nachgesehen', 'Sieht im Gedächtnis nach', 'book', true],
  [/^(imagegen|imagegeneration)$/, 'Bild erzeugt', 'Erzeugt ein Bild', 'images', true],
  [/^imageedit$/, 'Bild bearbeitet', 'Bearbeitet ein Bild', 'images', true],
  [/^(imagetovideo|referencetovideo)$/, 'Video erzeugt', 'Erzeugt ein Video', 'images', true],
  [/^viewimage$/, 'Bild angesehen', 'Sieht sich ein Bild an', 'images', true],
  [/^(askuserquestion|askuser)$/, 'Rückfrage gestellt', 'Stellt eine Rückfrage', 'text', false],
  [/^enterplanmode$/, 'Planmodus begonnen', 'Plant das Vorgehen', 'text', false],
  [/^exitplanmode$/, 'Plan vorgelegt', 'Legt den Plan vor', 'text', false],
  [/^(schedulercreate|croncreate|schedulewakeup)$/, 'Zeitplan angelegt', 'Legt einen Zeitplan an', 'rewind', true],
  [/^(schedulerdelete|crondelete)$/, 'Zeitplan gelöscht', 'Löscht einen Zeitplan', 'rewind', true],
  [/^(schedulerlist|cronlist)$/, 'Zeitpläne angesehen', 'Sieht die Zeitpläne an', 'rewind', false],
  [/^workflow$/, 'Workflow gestartet', 'Startet einen Workflow', 'agent', false],
  [/^sendfeedback$/, 'Rückmeldung an xAI geschickt', 'Schickt eine Rückmeldung an xAI', 'text', true],
  [/^(skill|useskill)$/, 'Skill geladen', 'Lädt einen Skill', 'book', true],
  [/^compact$/, 'Verlauf verdichtet', 'Verdichtet den Verlauf', 'text', false],
];

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Die erste Zeile des Arguments, gekürzt — das ganze steht in der
 * aufgeklappten Zeile. Argumente als JSON gehören nur dorthin; hier steht
 * dann ihr erster Text, etwa die Frage an den Exokortex, ohne die Syntax.
 */
export const subjectOf = (step: ToolStep) => {
  const line = step.detail?.trim().split('\n')[0];
  if (!line) return undefined;
  if (!/^[[{]/.test(line)) return short(line, 120);
  try {
    const text = Object.values(JSON.parse(line) as object).find((v): v is string => typeof v === 'string' && !!v.trim());
    return text ? short(text.trim().split('\n')[0]!, 120) : undefined;
  } catch {
    return undefined;
  }
};

/** Nur die Werkzeuge, die Cortex beim Namen kennt — ohne Rückfall. */
export function namedToolWords(step: ToolStep): ToolWords | undefined {
  const hit = WORDS.find(([pattern]) => pattern.test(key(step.name ?? '')));
  return hit && { done: hit[1], now: hit[2], subject: hit[4] ? subjectOf(step) : undefined, icon: hit[3] };
}

/** Die Worte für einen Schritt ohne feste Art. */
export function toolWords(step: ToolStep): ToolWords {
  const named = namedToolWords(step);
  if (named) return named;
  const name = step.name ?? '';
  const subject = subjectOf(step);
  if (EXOKORTEX.test(name)) return { done: 'Im Exokortex nachgesehen', now: 'Schaut im Exokortex nach', subject, icon: 'book' };
  if (WEBSEARCH.test(name)) return { done: 'Im Web gesucht', now: 'Recherchiert im Web', subject, icon: 'globe' };
  // Plugins (MCP): mcp__<server>__<werkzeug>.
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  if (mcp) {
    const server = human(mcp[1]!.replace(/^[0-9a-f-]{20,}$/i, 'Plugin'));
    const tool = human(mcp[2]!);
    return { done: `${server}: ${tool}`, now: `Nutzt ${server} · ${tool}`, subject, icon: 'wrench' };
  }
  const label = human(name.replace(/^mcp__/, ''));
  return label
    ? { done: `Werkzeug „${label}“ verwendet`, now: `Nutzt ${label}`, subject, icon: 'wrench' }
    : { done: 'Werkzeug verwendet', now: 'Nutzt ein Werkzeug', subject, icon: 'wrench' };
}
