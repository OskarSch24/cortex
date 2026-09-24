import type { BriefSection } from './brief.js';
/**
 * Chat-Widgets: wann und wie ein Modell eine Karte statt Text ausgibt.
 *
 * Der Weg ist ein Codeblock mit der Sprache `cortex-widget` in der Antwort —
 * Claude, Codex und Grok schreiben ihn gleich, und ohne Cortex bleibt er als
 * lesbares JSON stehen. Die Webview zeichnet ihn (webview/components/widgets).
 * Die Typen hier und `WidgetSpec` dort müssen dieselben sein; `widgets/spec.ts`
 * prüft das beim Übersetzen, `widgets.test.ts` die Beispiele.
 */

export const WIDGET_LANG = 'cortex-widget';

export const WIDGET_TYPE_NAMES = [
  'weather', 'timer', 'departures', 'converter', 'parcel', 'todo', 'route', 'calendar', 'ticker', 'worldclock',
  'agent-run', 'agent-swarm', 'test-result', 'quota', 'server', 'deploy', 'verification', 'scrape-run', 'workflow', 'query-result',
  'graph-node', 'decision', 'place-naming', 'timeline', 'jobs', 'design-diff', 'palette', 'audio-takes', 'kpis',
  'quiz', 'game-theory',
] as const;

export const WIDGET_BRIEF = [
  'Chat widgets: when a result is better seen than read, add one fenced code block with the language `cortex-widget` to your answer; Cortex draws it as a card. ' +
    'Good fits: weather, a timer, departures, a currency or unit conversion, a parcel, a to-do list, a route, a calendar, a price chart, world time, ' +
    'an agent run, a swarm of agents, test results, account quotas, server health, a deploy, a cross-platform verification, a scrape run, a workflow, a query result, ' +
    'a knowledge-graph node, a decision, naming a place, a day timeline, job matches, a design-vs-code diff, a colour palette, audio takes, campaign KPIs, ' +
    'a quiz question, a strategic situation. Do not use one for plain explanations or code.',
  'The block body is one JSON object with "type" and the fields below. Use only data you actually fetched, measured or computed in this turn — never invent ' +
    'a value to fill a field; leave out what you do not have. Keep prose around a widget to one or two sentences and do not repeat its numbers. ' +
    "Labels in the user's language. Times \"HH:MM\", dates \"YYYY-MM-DD\". Tones: pos, neg, warn, info, violet, mute.",
  'No data, no widget: if a lookup failed or found nothing, say so in text only — never send a widget to show that nothing was found.',
  'Send display values as text with unit ("96.412 €", "+2,41 %", "3,2 mm"); plain numbers are accepted and Cortex formats them.',
  'Preferred sources, no key needed — use them directly instead of searching: weather api.open-meteo.com · exchange rates api.frankfurter.dev (ECB) · crypto api.kraken.com or api.coingecko.com · German rail and S-Bahn departures dbf.finalrewind.org/<Station>.json · places nominatim.openstreetmap.org · walking/cycling routes valhalla1.openstreetmap.de or router.project-osrm.org.',
  'Every widget also takes "source" (footer text, e.g. "Open-Meteo · 14:05") and "actions": [{"label", "prompt" | "url" | "path", "primary"?}] — a prompt is put into the composer for the user to send.',
  'Types (? = optional):',
  'weather {location, date?, temp, condition, detail?, icon: sun|partly|cloud|rain|snow|storm|fog|night, high?, low?, wind?, rain?, hours?: [{time, temp, icon?, rain?: percent}]}',
  'timer {label, durationSec, endsAt?: ISO datetime, note?} — Cortex counts down live from endsAt.',
  'departures {station, subtitle?, rows: [{line, color?: hex, destination, platform?, minutes, delay?: minutes}]}',
  'converter {amount, from, to, rate, fromSymbol?, toSymbol?, rateNote?, presets?: [number]} — the user can change the amount.',
  'parcel {carrier, tracking?, status, eta?, sender?, steps: [{label, time?, place?, state: done|now|next}]}',
  'todo {title, items: [{text, done?, tag?, tone?}]}',
  'route {destination, subtitle?, origin?, modes?: [{label, minutes}], arrival?, url?}',
  'calendar {title, range?, days: [label], startHour?, endHour?, events: [{day: index into days, start, end, title, tone?}], legend?: [{label, tone}]}',
  'ticker {name, symbol, price, change, tone?, changeNote?, series: [number], reference?: number, referenceLabel?, axis?: [label], others?: [{name, symbol, price, change, tone?, series?}]}',
  'worldclock {cities: [{name, timezone: IANA name, home?: true, sunrise?, sunset?}]} — Cortex shows the live local times.',
  'agent-run {title, account?, elapsed?, steps: [{text, state: done|now|next|failed, duration?, added?, removed?}], note?}',
  'agent-swarm {task?, count?: 1-20, project?, agents?: [{name, role?, instructions?}], note?, start?: true} — Cortex\'s agent swarm: Cortex starts every role as its own background agent with its own chat. Two cases. ' +
    '(1) The /agent-swarm command: propose — suggest the roles that fit the task (one line of `role` each, `instructions` when the role needs more than its name), set `count`, put the text behind the command into `task` (leave it out when there was none; the card asks), no `start`; the user adjusts and presses Start. ' +
    '(2) The user asks in their own words to start, spawn or continue an agent swarm ("starte einen Agent Swarm", "spawne einen Schwarm", "nächste Schwarm-Runde"): set `"start": true` — Cortex starts it at once. Split the work into independent parts, one role per part (for example one per country, lane or data source), each with a self-contained `instructions` text naming exactly its part, the files or folders it owns, what "done" means, and what it must not touch; `task` states the shared goal and constraints. ' +
    'In both cases the swarm does the work, not you: answer with this one widget and at most one short sentence, do not start the work yourself, and never use your own subagent, task or delegation tools for a swarm — their output would stream into this chat. Never claim results before the roles report.',
  'test-result {title, command?, duration?, groups: [{label, passed, total}], failures?: [{name, file?, detail?: lines starting with "- " or "+ " are coloured}]}',
  'quota {accounts: [{provider, name, plan?, percent: 0-100 or null if unknown, reset?, bound?: true}], note?}',
  'server {name, subtitle?, metrics?: [{label, value, unit?, percent?, series?}], containers?: [{name, state: ok|warn|down, note?}], alerts?: [{tone, text}]}',
  'deploy {title, ref?, message?, elapsed?, steps: [{label, state: done|now|next|failed, duration?}], log?}',
  'verification {title, subtitle?, rows: [{platform, evidence, expected, found, state: ok|warn|fail}], finding?: {tone, title, text}}',
  'scrape-run {title, subtitle?, done, total, unit?, eta?, stats?: [{label, value, tone?}], sample?: [{key, label, value}], dataset?}',
  'workflow {title, subtitle?, nodes: [{id, label, detail?, state: done|now|next|retry|failed}], edges: [[fromId, toId]]}',
  'query-result {title?, subtitle?, query?, columns: [string], rows: [[value]]}',
  'graph-node {name, kind, id?, neighbors?: [{label, kind?}], confirmed?: [string], confirmedSource?, observed?: [string], observedSource?, updated?}',
  'decision {id, title, status, project?, decision, rejected?: [string], wrongIf?, decided: date, review: date, gaps?: number}',
  'place-naming {id, count, span?, points?: [[lat, lon]], photos?: [date], hint?, suggestions?: [string], remaining?}',
  'timeline {title, subtitle?, startHour?, endHour?, lanes: [{label, tone?, total?, blocks: [{start, end, label?}]}]}',
  'jobs {title, subtitle?, jobs: [{score: 0-100, title, company, location?, salary?, source?, tags?: [string], url?}], note?}',
  'design-diff {title, subtitle?, diffs: [{label, design, code, designColor?: hex, codeColor?: hex, fixed?: true}]}',
  'palette {title, background?: hex, colors: [{name, hex}]} — Cortex computes the contrast.',
  'audio-takes {title, subtitle?, takes: [{label, note?, duration, path?, favorite?, peaks?: [0-1]}]}',
  'kpis {title, subtitle?, kpis: [{label, value, change?, tone?}], funnel?: [{label, value: number}], note?}',
  'quiz {topic, subtitle?, question, options: [string], answer: index, explanation?, progress?: {current, total, history?: "rrw…" r=right w=wrong}}',
  'game-theory {title, subtitle?, actors: [{name, want, tone?, hidden?: true when this party is not visible yet}] (2-4), relations?: [{from: index, to: index, label, dashed?}], balance?: {value: -1..1, left, right, note?}, recommendation}',
  'Example:\n```cortex-widget\n{"type":"timer","label":"Fokus","durationSec":1500,"endsAt":"2026-09-13T15:07:00+02:00"}\n```',
].join('\n');

/**
 * Nennt die Nachricht einen Schwarm („spawne einen Agent Swarm“, „nächste
 * Schwarm-Runde“)? `/agent-swarm` bringt seine Anweisung selbst mit.
 */
export function mentionsSwarm(prompt: string): boolean {
  return !/^\s*(?:@\S+\s+)?\/agent-swarm\b/i.test(prompt) && /agent(?:s|en)?[\s-]*s(?:w|ch)arm|\bschwarm/i.test(prompt);
}

/**
 * Ein Hinweis nur in diesem Zug: am 24.09.2026 hatte Grok auf „spawne einen
 * Agent Swarm“ eigene Sub-Agenten gestartet, deren Ausgaben ineinander
 * verschachtelt im Chat landeten — ein Cortex-Schwarm lief nie.
 */
export function swarmSections(prompt: string): BriefSection[] {
  if (!mentionsSwarm(prompt)) return [];
  return [{
    id: 'swarm-request',
    title: 'Agent swarm',
    body: 'This message is about an agent swarm. If the user wants one started, spawned or continued, answer ONLY with one cortex-widget block of type agent-swarm with "start": true and one role per independent part (see the widget description) — Cortex runs the roles as background agents with their own chats and shows them in the overview. ' +
      'Do not do the work in this chat and do not use your own subagent, task or delegation tools. If the user only asks about a swarm, answer normally.',
  }];
}
