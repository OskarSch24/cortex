import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunRequest } from './adapter.js';
import type { OpenRouterKind } from './openrouter.js';
import { readImageBase64 } from './attachments.js';
import {
  OPENROUTER_DECISIONS_URL,
  OPENROUTER_IMAGES_URL,
  OPENROUTER_VIDEOS_URL,
  openRouterErrorMessage,
  openRouterHeaders,
  openRouterNoCredit,
} from './openrouterHttp.js';
import { isTransientFailure } from './limits.js';
import { earlierConversation } from '../session/historyPrompt.js';
import type { AdapterEvent } from '../types.js';

/**
 * OpenRouter models that do not chat: image models answer over the Image API,
 * video models over the asynchronous Video API, decision models such as Jev
 * over the Decisions API. None of them sees the conversation as a chat; each
 * gets the user's message as its task.
 *
 * What they make leaves as files in a folder outside the project; the host
 * archives them into the chat the way it archives Grok's and Codex's images.
 */

export interface MediaRun {
  fetchImpl: typeof fetch;
  key: string;
  model: string;
  req: RunRequest;
  signal: AbortSignal;
  /** Where made files land before the host archives them. */
  outDir?: string;
  /** Pause between two status requests of a video job. */
  pollMs?: number;
  /** How long a video job may take before the run gives up on it. */
  videoTimeoutMs?: number;
}

export async function* runOpenRouterMedia(kind: Exclude<OpenRouterKind, 'text'>, run: MediaRun): AsyncGenerator<AdapterEvent> {
  if (kind === 'image') yield* image(run);
  else if (kind === 'video') yield* video(run);
  else yield* decision(run);
}

/**
 * The user's own words for this turn. The host lists attached files under the
 * message for the chat models; an image or video model gets the files
 * themselves and would only read the list as part of its prompt.
 */
export function ownMessage(req: RunRequest): string {
  return (req.message ?? req.prompt).replace(/\n\nAttached files:\n(?:- .*(?:\n|$))+$/, '').trim();
}

/** US dollars the way the chat shows them: `0,04 $`, tiny amounts with more places. */
export function usd(value: number): string {
  return `${value.toFixed(value > 0 && value < 0.01 ? 5 : 2).replace('.', ',')} $`;
}

async function failure(response: Response, model: string, hint?: string): Promise<AdapterEvent> {
  const body = await response.text().catch(() => '');
  if (response.status === 402) return { type: 'error', message: openRouterNoCredit(model), retryable: false };
  const detail = openRouterErrorMessage(body) ?? `${response.status} ${response.statusText}`;
  return {
    type: 'error',
    message: `OpenRouter: ${detail}${hint ? ` — ${hint}` : ''}`,
    retryable: response.status === 429 || response.status >= 500,
  };
}

function unreachable(e: unknown): AdapterEvent {
  const message = (e as Error).message;
  return { type: 'error', message, retryable: isTransientFailure(message) };
}

/** Attached pictures as data URLs, the form both media APIs accept. */
function references(req: RunRequest): Array<{ type: 'image_url'; image_url: { url: string } }> {
  return (req.images ?? []).flatMap((img) => {
    const data = readImageBase64(img.path);
    return data ? [{ type: 'image_url' as const, image_url: { url: `data:${img.mediaType};base64,${data}` } }] : [];
  });
}

async function save(dir: string | undefined, bytes: Buffer, extension: string): Promise<string> {
  const folder = dir ?? join(tmpdir(), 'cortex-openrouter');
  await mkdir(folder, { recursive: true });
  const path = join(folder, `${randomUUID()}${extension}`);
  await writeFile(path, bytes);
  return path;
}

const IMAGE_EXTENSION: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg',
};

async function* image({ fetchImpl, key, model, req, signal, outDir }: MediaRun): AsyncGenerator<AdapterEvent> {
  const prompt = ownMessage(req);
  if (!prompt) {
    yield { type: 'error', message: 'Beschreib das Bild, das entstehen soll.', retryable: false };
    return;
  }
  const pictures = references(req);
  const options = req.imageOptions;
  yield { type: 'activity', text: pictures.length ? 'Bearbeitet das Bild …' : 'Erzeugt das Bild …' };
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_IMAGES_URL, {
      method: 'POST',
      signal,
      headers: openRouterHeaders(key),
      body: JSON.stringify({
        model,
        prompt,
        ...(options ? { aspect_ratio: options.ratio } : {}),
        ...(options && options.count > 1 ? { n: options.count } : {}),
        // An attached picture makes it an edit: the model works on it.
        ...(pictures.length ? { input_references: pictures } : {}),
      }),
    });
  } catch (e) {
    if (!signal.aborted) yield unreachable(e);
    return;
  }
  if (!response.ok) {
    yield await failure(response, model);
    return;
  }
  const body = (await response.json().catch(() => ({}))) as {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: { cost?: number };
  };
  let made = 0;
  for (const item of body.data ?? []) {
    if (!item.b64_json) continue;
    const path = await save(outDir, Buffer.from(item.b64_json, 'base64'), IMAGE_EXTENSION[item.media_type ?? ''] ?? '.png');
    made++;
    yield { type: 'image', path, prompt, ...(pictures.length ? { edited: true } : {}) };
  }
  yield { type: 'activity' };
  if (!made) {
    yield { type: 'error', message: 'OpenRouter hat kein Bild zurückgegeben.', retryable: true };
    return;
  }
  const cost = body.usage?.cost;
  const text = `${made === 1 ? 'Ein Bild' : `${made} Bilder`} ${pictures.length ? 'bearbeitet' : 'erzeugt'}${cost !== undefined ? ` · ${usd(cost)}` : ''}.`;
  yield { type: 'text-delta', text };
  yield { type: 'result', text, costUsd: cost ?? 0 };
}

const VIDEO_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3', '21:9', '9:21']);
const DONE = new Set(['completed', 'failed', 'cancelled', 'expired']);

interface VideoJob {
  id?: string;
  polling_url?: string;
  status?: string;
  error?: string;
  unsigned_urls?: string[];
  usage?: { cost?: number | null };
}

async function* video({ fetchImpl, key, model, req, signal, outDir, pollMs = 10_000, videoTimeoutMs = 30 * 60_000 }: MediaRun): AsyncGenerator<AdapterEvent> {
  const prompt = ownMessage(req);
  // An avatar model animates the attached photo; a text-to-video model takes
  // it as a reference. Both read it from the same field.
  const pictures = references(req);
  const ratio = req.imageOptions?.ratio;
  const headers = openRouterHeaders(key);
  yield { type: 'activity', text: 'Gibt das Video in Auftrag …' };
  let job: VideoJob;
  try {
    const response = await fetchImpl(OPENROUTER_VIDEOS_URL, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        model,
        ...(prompt ? { prompt } : {}),
        ...(pictures.length ? { input_references: pictures } : {}),
        ...(ratio && VIDEO_RATIOS.has(ratio) ? { aspect_ratio: ratio } : {}),
      }),
    });
    if (!response.ok) {
      yield await failure(response, model, pictures.length ? undefined : 'ein Avatar-Modell braucht ein angehängtes Foto');
      return;
    }
    job = (await response.json()) as VideoJob;
  } catch (e) {
    if (!signal.aborted) yield unreachable(e);
    return;
  }

  // The job runs on OpenRouter's side; this run only looks in on it.
  const pollUrl = new URL(job.polling_url ?? `${OPENROUTER_VIDEOS_URL}/${job.id ?? ''}`, 'https://openrouter.ai').toString();
  const started = Date.now();
  yield { type: 'activity', text: 'Erzeugt das Video …' };
  while (!DONE.has(job.status ?? '')) {
    if (Date.now() - started > videoTimeoutMs) {
      yield { type: 'error', message: `Das Video war nach ${Math.round(videoTimeoutMs / 60_000)} Minuten nicht fertig (Auftrag ${job.id ?? 'unbekannt'}).`, retryable: false };
      return;
    }
    if (!(await pause(pollMs, signal))) return;
    try {
      const response = await fetchImpl(pollUrl, { signal, headers });
      if (!response.ok) {
        // A status request can fail once without the job failing with it.
        if (response.status >= 500 || response.status === 429) continue;
        yield await failure(response, model);
        return;
      }
      job = { ...job, ...((await response.json()) as VideoJob) };
    } catch (e) {
      if (signal.aborted) return;
      if (isTransientFailure((e as Error).message)) continue;
      yield unreachable(e);
      return;
    }
  }
  if (job.status !== 'completed') {
    yield { type: 'error', message: `OpenRouter: Das Video wurde nicht erzeugt (${job.error ?? job.status}).`, retryable: false };
    return;
  }

  yield { type: 'activity', text: 'Lädt das Video …' };
  const contentUrl = job.unsigned_urls?.[0] ?? `${pollUrl}/content`;
  let path: string;
  try {
    const response = await fetchImpl(contentUrl, { signal, headers: { Authorization: headers.Authorization! } });
    if (!response.ok) {
      yield await failure(response, model);
      return;
    }
    const type = response.headers.get('content-type') ?? '';
    const extension = type.includes('webm') ? '.webm' : type.includes('quicktime') ? '.mov' : '.mp4';
    path = await save(outDir, Buffer.from(await response.arrayBuffer()), extension);
  } catch (e) {
    if (!signal.aborted) yield unreachable(e);
    return;
  }
  yield { type: 'activity' };
  yield { type: 'video', path, prompt };
  const cost = job.usage?.cost ?? undefined;
  const text = `Video erzeugt${cost !== undefined ? ` · ${usd(cost)}` : ''}.`;
  yield { type: 'text-delta', text };
  yield { type: 'result', text, costUsd: cost ?? 0 };
}

/** Waits `ms`, or returns false the moment the run is stopped. */
function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((done) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', stop); done(true); }, ms);
    const stop = () => { clearTimeout(timer); done(false); };
    signal.addEventListener('abort', stop, { once: true });
  });
}

/** A question Jev can answer, read from a chat message. */
export interface DecisionQuestion {
  type: 'choice' | 'score' | 'noul';
  instructions: string;
  /** Choice: the options; score: the levels, lowest first. */
  options: string[];
}

/**
 * Reads a decision question out of a message. A bulleted list (`- A`) is a
 * set of options to choose from, a numbered list (`1. …`) an ordered scale to
 * place the case on; without a list it is a yes-or-no question. The rest of
 * the message is the question itself.
 */
export function decisionQuestion(message: string): DecisionQuestion | undefined {
  const bullets: string[] = [];
  const levels: string[] = [];
  const text: string[] = [];
  for (const raw of message.split('\n')) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    const level = /^\d+[.)]\s+(.+)$/.exec(line);
    if (bullet) bullets.push(bullet[1]!.trim());
    else if (level) levels.push(level[1]!.trim());
    else if (line) text.push(line);
  }
  const instructions = text.join('\n');
  if (!instructions && bullets.length < 2 && levels.length < 2) return undefined;
  if (bullets.length >= 2) return { type: 'choice', instructions: instructions || 'Welche Option trifft zu?', options: bullets };
  if (levels.length >= 2) return { type: 'score', instructions: instructions || 'Wo liegt der Fall auf dieser Skala?', options: levels };
  return { type: 'noul', instructions: [instructions, ...bullets, ...levels].filter(Boolean).join('\n'), options: [] };
}

/** The request body for the Decisions API. */
export function decisionBody(model: string, question: DecisionQuestion, message: string, earlier?: string): Record<string, unknown> {
  const criteria =
    question.type === 'choice'
      ? Object.fromEntries(question.options.map((option, i) => [`option_${i + 1}`, option]))
      : question.type === 'score'
        ? question.options
        : { true: 'Ja, das trifft zu.', false: 'Nein, das trifft nicht zu.' };
  return {
    model,
    state: { nachricht: message, ...(earlier ? { bisheriger_chat: earlier } : {}) },
    questions: { antwort: { type: question.type, instructions: question.instructions, criteria } },
  };
}

interface DecisionAnswer {
  type?: string;
  noul?: number;
  choice?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
}

const percent = (value?: number) => `${Math.round((value ?? 0) * 100)} %`;

/** Jev's typed answer as a short reply: what it decided, then how sure it is. */
export function formatDecision(question: DecisionQuestion, answer: DecisionAnswer): string {
  if (question.type === 'noul') {
    const yes = answer.noul ?? 0;
    return `**${yes >= 0.5 ? 'Ja' : 'Nein'}** · Wahrscheinlichkeit für Ja: ${percent(yes)}`;
  }
  const rows = question.options.map((option, i) => {
    const key = question.type === 'choice' ? `option_${i + 1}` : String(i);
    return { option, p: answer.probabilities?.[key] ?? 0 };
  });
  const table = ['| Option | Wahrscheinlichkeit |', '| --- | --- |', ...rows.map((r) => `| ${r.option.replace(/\|/g, '\\|')} | ${percent(r.p)} |`)].join('\n');
  const sure = answer.confidence !== undefined ? ` · Sicherheit ${percent(answer.confidence)}` : '';
  if (question.type === 'choice') {
    const index = Number(/^option_(\d+)$/.exec(answer.choice ?? '')?.[1] ?? 0) - 1;
    const chosen = question.options[index] ?? answer.choice ?? '–';
    return `**Jev wählt: ${chosen}**${sure}\n\n${table}`;
  }
  const position = answer.score ?? 0;
  const level = question.options[Math.min(question.options.length - 1, Math.max(0, Math.round(position)))] ?? '–';
  return `**Einstufung: ${level}** · Position ${position.toFixed(2).replace('.', ',')} auf der Skala 0–${question.options.length - 1}${sure}\n\n${table}`;
}

async function* decision({ fetchImpl, key, model, req, signal }: MediaRun): AsyncGenerator<AdapterEvent> {
  const message = ownMessage(req);
  const question = decisionQuestion(message);
  if (!question) {
    yield {
      type: 'error',
      message: 'Jev beantwortet Entscheidungsfragen: Stell eine Ja/Nein-Frage, oder liste Optionen mit „- “ (Auswahl) bzw. „1. “ (Skala) auf.',
      retryable: false,
    };
    return;
  }
  let response: Response;
  try {
    response = await fetchImpl(OPENROUTER_DECISIONS_URL, {
      method: 'POST',
      signal,
      headers: openRouterHeaders(key),
      body: JSON.stringify(decisionBody(model, question, message, earlierConversation(req.prompt))),
    });
  } catch (e) {
    if (!signal.aborted) yield unreachable(e);
    return;
  }
  if (!response.ok) {
    yield await failure(response, model);
    return;
  }
  const body = (await response.json().catch(() => ({}))) as { answers?: Record<string, DecisionAnswer>; usage?: { cost?: number } };
  const answer = body.answers?.antwort;
  if (!answer) {
    yield { type: 'error', message: 'OpenRouter: Jev hat keine Antwort geliefert.', retryable: true };
    return;
  }
  const text = formatDecision(question, answer);
  yield { type: 'text-delta', text };
  yield { type: 'result', text, costUsd: body.usage?.cost ?? 0 };
}
