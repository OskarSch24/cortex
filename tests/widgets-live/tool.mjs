// ../../engine/packages/core/src/context/providerBrief.ts
var UNIVERSAL = [
  {
    id: "assume-over-ask",
    text: "If a detail is ambiguous but a careful colleague would pick the obvious reading, pick it, state the assumption in one line, and continue. Only stop and ask when proceeding either way would be unsafe or would waste the work if wrong."
  },
  {
    id: "report-honestly",
    text: "Report what actually happened. If a command failed, show its output. If you skipped part of the task, say so and why. Never describe work as done that you did not verify."
  },
  {
    id: "match-surroundings",
    text: "Match the conventions of the code you are editing \u2014 its naming, comment density and idiom \u2014 rather than importing a different house style."
  },
  {
    id: "no-suppress",
    text: "Fix causes, not symptoms. Do not silence a failing check, swallow an error, widen a type, or weaken a test to make something pass \u2014 if the real fix is out of scope, say so instead."
  },
  // Beobachtet: Grok zählte YouTube-Videos falsch und wollte dann einen
  // sichtbaren Browser öffnen, statt die Tools des verbundenen Plugins zu nehmen.
  {
    id: "api-before-browser",
    text: "For data from a service with a connected MCP server or API (YouTube, Gmail, calendars, analytics), use that server's tools \u2014 including follow-up calls when a first result looks incomplete. Do not open a browser to read what an API can return; if the tools cannot answer, say which data is missing."
  }
];
var PER_PROVIDER = {
  claude: [],
  codex: [
    {
      id: "codex-read-first",
      text: "Read a file before you edit it. Do not patch from memory of what it probably contains."
    },
    {
      id: "codex-verify",
      text: "After changing code, run the project's own check (its test or build script) and report the real result."
    },
    // OpenAI's own Codex guidance: the model reads files one at a time unless
    // told otherwise, and a turn of serial reads is a turn of latency.
    {
      id: "codex-parallel",
      text: "Batch your file reads and searches into parallel calls. Do not walk the codebase one file per turn when you already know the several places you need to see."
    },
    // Its other documented default: answering a build request with a proposal.
    {
      id: "codex-deliver",
      text: "The deliverable is working code, not a plan. Unless you were asked only to investigate, make the change in this turn rather than describing what you would do."
    },
    {
      id: "codex-reuse",
      text: "Search for an existing helper before writing a new one, and prefer extending what is there to adding a parallel implementation."
    }
  ],
  copilot: [
    {
      id: "copilot-read-first",
      text: "Read a file before you edit it. Do not patch from memory of what it probably contains."
    },
    {
      id: "copilot-full-answer",
      text: "Finish the whole request before replying. Do not stop after the first step to ask whether to continue."
    }
  ],
  grok: [
    {
      id: "grok-read-first",
      text: "Read a file before you edit it. Do not patch from memory of what it probably contains."
    }
  ],
  // Reviews only, and the review prompt carries its own instructions — lines
  // about editing files would describe work this provider cannot do.
  openrouter: []
};
var PERMISSION_LINES = {
  safe: {
    id: "mode-safe",
    text: "You are in plan mode: investigate and propose, but do not modify files or run commands that change state. End with the plan you would carry out."
  },
  edits: {
    id: "mode-edits",
    text: "You may edit files in this workspace. Do not run destructive commands, push, or touch anything outside it without saying so first."
  },
  full: {
    id: "mode-full",
    text: "You may edit files and run commands. Still confirm before anything irreversible or outward-facing."
  }
};
function briefLinesFor(options) {
  const disabled = new Set(options.disabledLineIds ?? []);
  const lines = [
    ...UNIVERSAL,
    ...PER_PROVIDER[options.provider],
    PERMISSION_LINES[options.permissionMode]
  ].filter((line) => !disabled.has(line.id));
  for (const [i, preference] of (options.preferences ?? []).entries()) {
    if (preference.trim()) lines.push({ id: `pref-${i}`, text: preference.trim() });
  }
  return lines;
}
function buildProviderBrief(options) {
  const lines = briefLinesFor(options);
  if (lines.length === 0) return "";
  return lines.map((line) => `- ${line.text}`).join("\n");
}

// ../../engine/packages/core/src/context/locationBrief.ts
function locationBrief(home) {
  const place = home?.trim();
  if (place) {
    return `The user is based in ${place}. For anything local \u2014 weather, departures, routes, opening hours, local time \u2014 use ${place} unless the user names another place in this conversation. Never determine the location from the IP address.`;
  }
  return "You do not know where the user is. Never determine it from the IP address \u2014 that points at a provider or VPN node, not at the user. For anything local, use a place the user named, or ask once which place they mean.";
}

// ../../engine/packages/core/src/context/widgetBrief.ts
var WIDGET_BRIEF = [
  "Chat widgets: when a result is better seen than read, add one fenced code block with the language `cortex-widget` to your answer; Cortex draws it as a card. Good fits: weather, a timer, departures, a currency or unit conversion, a parcel, a to-do list, a route, a calendar, a price chart, world time, an agent run, test results, account quotas, server health, a deploy, a cross-platform verification, a scrape run, a workflow, a query result, a knowledge-graph node, a decision, naming a place, a day timeline, job matches, a design-vs-code diff, a colour palette, audio takes, campaign KPIs, a quiz question, a strategic situation. Do not use one for plain explanations or code.",
  `The block body is one JSON object with "type" and the fields below. Use only data you actually fetched, measured or computed in this turn \u2014 never invent a value to fill a field; leave out what you do not have. Keep prose around a widget to one or two sentences and do not repeat its numbers. Labels in the user's language. Times "HH:MM", dates "YYYY-MM-DD". Tones: pos, neg, warn, info, violet, mute.`,
  "No data, no widget: if a lookup failed or found nothing, say so in text only \u2014 never send a widget to show that nothing was found.",
  'Send display values as text with unit ("96.412 \u20AC", "+2,41 %", "3,2 mm"); plain numbers are accepted and Cortex formats them.',
  "Preferred sources, no key needed \u2014 use them directly instead of searching: weather api.open-meteo.com \xB7 exchange rates api.frankfurter.dev (ECB) \xB7 crypto api.kraken.com or api.coingecko.com \xB7 German rail and S-Bahn departures dbf.finalrewind.org/<Station>.json \xB7 places nominatim.openstreetmap.org \xB7 walking/cycling routes valhalla1.openstreetmap.de or router.project-osrm.org.",
  'Every widget also takes "source" (footer text, e.g. "Open-Meteo \xB7 14:05") and "actions": [{"label", "prompt" | "url" | "path", "primary"?}] \u2014 a prompt is put into the composer for the user to send.',
  "Types (? = optional):",
  "weather {location, date?, temp, condition, detail?, icon: sun|partly|cloud|rain|snow|storm|fog|night, high?, low?, wind?, rain?, hours?: [{time, temp, icon?, rain?: percent}]}",
  "timer {label, durationSec, endsAt?: ISO datetime, note?} \u2014 Cortex counts down live from endsAt.",
  "departures {station, subtitle?, rows: [{line, color?: hex, destination, platform?, minutes, delay?: minutes}]}",
  "converter {amount, from, to, rate, fromSymbol?, toSymbol?, rateNote?, presets?: [number]} \u2014 the user can change the amount.",
  "parcel {carrier, tracking?, status, eta?, sender?, steps: [{label, time?, place?, state: done|now|next}]}",
  "todo {title, items: [{text, done?, tag?, tone?}]}",
  "route {destination, subtitle?, origin?, modes?: [{label, minutes}], arrival?, url?}",
  "calendar {title, range?, days: [label], startHour?, endHour?, events: [{day: index into days, start, end, title, tone?}], legend?: [{label, tone}]}",
  "ticker {name, symbol, price, change, tone?, changeNote?, series: [number], reference?: number, referenceLabel?, axis?: [label], others?: [{name, symbol, price, change, tone?, series?}]}",
  "worldclock {cities: [{name, timezone: IANA name, home?: true, sunrise?, sunset?}]} \u2014 Cortex shows the live local times.",
  "agent-run {title, account?, elapsed?, steps: [{text, state: done|now|next|failed, duration?, added?, removed?}], note?}",
  'test-result {title, command?, duration?, groups: [{label, passed, total}], failures?: [{name, file?, detail?: lines starting with "- " or "+ " are coloured}]}',
  "quota {accounts: [{provider, name, plan?, percent: 0-100 or null if unknown, reset?, bound?: true}], note?}",
  "server {name, subtitle?, metrics?: [{label, value, unit?, percent?, series?}], containers?: [{name, state: ok|warn|down, note?}], alerts?: [{tone, text}]}",
  "deploy {title, ref?, message?, elapsed?, steps: [{label, state: done|now|next|failed, duration?}], log?}",
  "verification {title, subtitle?, rows: [{platform, evidence, expected, found, state: ok|warn|fail}], finding?: {tone, title, text}}",
  "scrape-run {title, subtitle?, done, total, unit?, eta?, stats?: [{label, value, tone?}], sample?: [{key, label, value}], dataset?}",
  "workflow {title, subtitle?, nodes: [{id, label, detail?, state: done|now|next|retry|failed}], edges: [[fromId, toId]]}",
  "query-result {title?, subtitle?, query?, columns: [string], rows: [[value]]}",
  "graph-node {name, kind, id?, neighbors?: [{label, kind?}], confirmed?: [string], confirmedSource?, observed?: [string], observedSource?, updated?}",
  "decision {id, title, status, project?, decision, rejected?: [string], wrongIf?, decided: date, review: date, gaps?: number}",
  "place-naming {id, count, span?, points?: [[lat, lon]], photos?: [date], hint?, suggestions?: [string], remaining?}",
  "timeline {title, subtitle?, startHour?, endHour?, lanes: [{label, tone?, total?, blocks: [{start, end, label?}]}]}",
  "jobs {title, subtitle?, jobs: [{score: 0-100, title, company, location?, salary?, source?, tags?: [string], url?}], note?}",
  "design-diff {title, subtitle?, diffs: [{label, design, code, designColor?: hex, codeColor?: hex, fixed?: true}]}",
  "palette {title, background?: hex, colors: [{name, hex}]} \u2014 Cortex computes the contrast.",
  "audio-takes {title, subtitle?, takes: [{label, note?, duration, path?, favorite?, peaks?: [0-1]}]}",
  "kpis {title, subtitle?, kpis: [{label, value, change?, tone?}], funnel?: [{label, value: number}], note?}",
  'quiz {topic, subtitle?, question, options: [string], answer: index, explanation?, progress?: {current, total, history?: "rrw\u2026" r=right w=wrong}}',
  "game-theory {title, subtitle?, actors: [{name, want, tone?, hidden?: true when this party is not visible yet}] (2-4), relations?: [{from: index, to: index, label, dashed?}], balance?: {value: -1..1, left, right, note?}, recommendation}",
  'Example:\n```cortex-widget\n{"type":"timer","label":"Fokus","durationSec":1500,"endsAt":"2026-09-13T15:07:00+02:00"}\n```'
].join("\n");

// ../../engine/packages/vscode/webview/components/widgets/spec.ts
var REQUIRED = {
  weather: [["location", "s"], ["temp", "s"], ["condition", "s"]],
  timer: [["label", "s"], ["durationSec", "n"]],
  departures: [["station", "s"], ["rows", "a"]],
  converter: [["amount", "n"], ["from", "s"], ["to", "s"], ["rate", "n"]],
  parcel: [["carrier", "s"], ["status", "s"], ["steps", "a"]],
  todo: [["title", "s"], ["items", "a"]],
  route: [["destination", "s"]],
  calendar: [["title", "s"], ["days", "a"], ["events", "a"]],
  ticker: [["name", "s"], ["symbol", "s"], ["price", "s"], ["change", "s"], ["series", "a"]],
  worldclock: [["cities", "a"]],
  "agent-run": [["title", "s"], ["steps", "a"]],
  "test-result": [["title", "s"], ["groups", "a"]],
  quota: [["accounts", "a"]],
  server: [["name", "s"]],
  deploy: [["title", "s"], ["steps", "a"]],
  verification: [["title", "s"], ["rows", "a"]],
  "scrape-run": [["title", "s"], ["done", "n"], ["total", "n"]],
  workflow: [["title", "s"], ["nodes", "a"]],
  "query-result": [["columns", "a"], ["rows", "a"]],
  "graph-node": [["name", "s"], ["kind", "s"]],
  decision: [["id", "s"], ["title", "s"], ["status", "s"], ["decision", "s"], ["decided", "s"], ["review", "s"]],
  "place-naming": [["id", "s"], ["count", "n"]],
  timeline: [["title", "s"], ["lanes", "a"]],
  jobs: [["title", "s"], ["jobs", "a"]],
  "design-diff": [["title", "s"], ["diffs", "a"]],
  palette: [["title", "s"], ["colors", "a"]],
  "audio-takes": [["title", "s"], ["takes", "a"]],
  kpis: [["title", "s"], ["kpis", "a"]],
  quiz: [["topic", "s"], ["question", "s"], ["options", "a"], ["answer", "n"]],
  "game-theory": [["title", "s"], ["actors", "a"], ["recommendation", "s"]]
};
function parseWidget(source) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    return { ok: false, error: "Kein g\xFCltiges JSON" };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Kein Objekt" };
  const obj = value;
  const type = obj.type;
  if (typeof type !== "string" || !REQUIRED[type]) return { ok: false, error: `Unbekannter Typ ${typeof type === "string" ? `\u201E${type}\u201C` : ""}`.trim() };
  for (const [field, kind] of REQUIRED[type]) {
    const v = obj[field];
    const fine = kind === "a" ? Array.isArray(v) && v.length > 0 : kind === "n" ? typeof v === "number" && Number.isFinite(v) : typeof v === "string" && v.trim() !== "" || typeof v === "number" && Number.isFinite(v);
    if (!fine) return { ok: false, error: `Feld \u201E${field}\u201C fehlt` };
  }
  if (obj.actions !== void 0 && !Array.isArray(obj.actions)) return { ok: false, error: "Feld \u201Eactions\u201C ist keine Liste" };
  return { ok: true, spec: normalize(type, obj, REQUIRED[type]) };
}
function displayNumber(value, maxDigits = 2) {
  if (Number.isInteger(value) && Math.abs(value) < 1e4) return String(value);
  return value.toLocaleString("de-DE", { maximumFractionDigits: maxDigits });
}
function signedPercent(value) {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "\xB1";
  return `${sign}${Math.abs(value).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;
}
function normalize(type, obj, required) {
  const out = { ...obj };
  const num = (v) => typeof v === "number" && Number.isFinite(v);
  if (type === "ticker") {
    const row = (r) => ({
      ...r,
      ...num(r.price) ? { price: displayNumber(r.price) } : {},
      ...num(r.change) ? { change: signedPercent(r.change), tone: r.tone ?? (r.change < 0 ? "neg" : r.change > 0 ? "pos" : "mute") } : {}
    });
    Object.assign(out, row(out));
    if (Array.isArray(out.others)) out.others = out.others.map((o) => o && typeof o === "object" ? row(o) : o);
  }
  if (type === "weather") {
    if (num(out.rain)) out.rain = `${displayNumber(out.rain, 1)} mm`;
    if (num(out.wind)) out.wind = `${displayNumber(out.wind, 1)} km/h`;
  }
  for (const [field, kind] of required) {
    if (kind === "s" && num(out[field])) out[field] = displayNumber(out[field]);
  }
  return out;
}

// entry.ts
import { readFileSync } from "node:fs";
var [cmd, arg] = process.argv.slice(2);
if (cmd === "brief") {
  process.stdout.write([buildProviderBrief({ provider: "claude", permissionMode: "full" }), locationBrief("Frankfurt"), WIDGET_BRIEF].join("\n\n"));
} else {
  const text = readFileSync(arg, "utf8");
  const blocks = [...text.matchAll(/```(?:cortex-widget|widget)\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
  process.stdout.write(JSON.stringify(blocks.map((b) => {
    const r = parseWidget(b.trim());
    return r.ok ? { ok: true, type: r.spec.type } : { ok: false, error: r.error, head: b.slice(0, 200) };
  })));
}
