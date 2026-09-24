import type { HistoryEntry } from './types.js';

/** Klein, ohne Akzente — damit „Müller“ auch „muller“ findet. */
export const fold = (text: string) => text.toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const STOPWORDS = new Set('was wie wo wann wer warum habe hab hast hat haben ich du wir der die das den dem des ein eine einen einem und oder mit von für zu an in im am ist war heute gestern what did i do the a to my on at'.split(' '));

/**
 * Die bis zu fünf Einträge, die zur Frage passen: nach Zahl der Treffer, bei
 * Gleichstand die jüngsten zuerst. Passt keiner, zählen die jüngsten.
 */
export function selectForQuestion(question: string, all: HistoryEntry[]): { selected: HistoryEntry[]; terms: string[] } {
  const terms = [...new Set(fold(question).match(/[\p{L}\p{N}]{3,}/gu) ?? [])].filter(term => !STOPWORDS.has(term));
  const ranked = all.map(entry => {
    const haystack = fold(`${entry.appName} ${entry.title} ${entry.summary ?? ''} ${entry.text}`);
    return { entry, score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) };
  }).sort((a, b) => b.score - a.score || b.entry.endedAt - a.entry.endedAt);
  const hasMatches = ranked.some(item => item.score > 0);
  const selected = ranked.filter(item => !hasMatches || item.score > 0).slice(0, 5).map(item => item.entry);
  return { selected, terms };
}

/** Der Kontext für das lokale Modell: je Eintrag Kopfzeile und Auszug, höchstens 5000 Zeichen. */
export function retrievalContext(selected: HistoryEntry[], terms: string[]): string {
  return selected.map((entry, index) => `[${index + 1}] ${new Date(entry.startedAt).toISOString()} · ${entry.appName.slice(0, 80)} · ${entry.title.slice(0, 160)}\n${relevantExcerpt(entry, terms)}`).join('\n\n').slice(0, 5000);
}

export function inRange(entry: HistoryEntry, from?: number, to?: number): boolean {
  return (!Number.isFinite(from) || entry.endedAt >= from!) && (!Number.isFinite(to) || entry.startedAt <= to!);
}

function relevantExcerpt(entry: HistoryEntry, terms: string[]): string {
  const summary = entry.summary ?? '';
  const folded = fold(entry.text);
  const matches = terms.map(term => folded.indexOf(term)).filter(index => index >= 0);
  if (!matches.length) return (summary || entry.text).slice(0, 680);
  // A summary can mention the topic while omitting the exact person/date asked
  // for. Always retain matching source text, even if the summary also matches.
  const prefix = summary ? `Zusammenfassung: ${summary.slice(0, 140)}\nQuelle: ` : '';
  const budget = 680 - prefix.length - 1;
  const candidates = matches.map(index => Math.max(0, index - 120));
  const score = (start: number) => terms.filter(term => folded.slice(start, start + budget).includes(term)).length;
  const start = candidates.sort((a, b) => score(b) - score(a))[0]!;
  return `${prefix}${start ? '…' : ''}${entry.text.slice(start, start + budget)}`;
}

export function relativeRange(question: string, now: number): { from: number; to: number } | undefined {
  const text = fold(question);
  let daysAgo: number | undefined;
  if (/\bvorgestern\b|\bday before yesterday\b/.test(text)) daysAgo = 2;
  else if (/\bgestern\b|\byesterday\b/.test(text)) daysAgo = 1;
  else if (/\bheute\b|\btoday\b/.test(text)) daysAgo = 0;
  if (daysAgo === undefined) return undefined;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysAgo);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { from: start.getTime(), to: end.getTime() - 1 };
}
