import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenRouterAdapter } from '../src/adapters/openrouter.js';
import { decisionQuestion, formatDecision, ownMessage } from '../src/adapters/openrouterMedia.js';
import { embedHistory } from '../src/session/historyPrompt.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';
import type { RunRequest } from '../src/adapters/adapter.js';

const account: ResolvedAccount = {
  id: 'openrouter-1', provider: 'openrouter', label: 'privat', authMode: 'api-key', hasSecret: true, priority: 9, secret: 'sk-or-test',
};

interface Call { url: string; method: string; body?: Record<string, unknown>; auth?: string }

/** Replies to each request with the next queued answer and records what was asked. */
function fakeFetch(replies: Array<(call: Call) => Response>) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = { url, method: init.method ?? 'GET', auth: headers.Authorization, ...(init.body ? { body: JSON.parse(init.body as string) } : {}) };
    calls.push(call);
    const reply = replies[calls.length - 1];
    if (!reply) throw new Error(`unexpected request ${url}`);
    return reply(call);
  }) as unknown as typeof fetch;
  return { fetch: impl, calls };
}

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status });

async function run(adapter: OpenRouterAdapter, req: RunRequest): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const event of adapter.run(req, account, new AbortController().signal)) events.push(event);
  return events;
}

let dir: string;
const made: string[] = [];
afterEach(() => {
  for (const path of made.splice(0)) rmSync(path, { force: true });
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function photo(): { path: string; mediaType: string } {
  dir = mkdtempSync(join(tmpdir(), 'cx-or-media-'));
  const path = join(dir, 'portrait.png');
  writeFileSync(path, Buffer.from('fake-png'));
  return { path, mediaType: 'image/png' };
}

describe('OpenRouter image models', () => {
  it('makes the picture over the Image API from the message alone', async () => {
    const { fetch, calls } = fakeFetch([json({ data: [{ b64_json: Buffer.from('PNG-BYTES').toString('base64'), media_type: 'image/png' }], usage: { cost: 0.04 } })]);
    const adapter = new OpenRouterAdapter(fetch);
    const events = await run(adapter, {
      prompt: embedHistory([{ role: 'user', text: 'früher' }], 'brief\n\n---\n\nEin Leuchtturm bei Sturm'),
      message: 'Ein Leuchtturm bei Sturm',
      model: 'openai/gpt-image-2.5-sunburst',
      imageOptions: { ratio: '16:9', count: 1 },
      cwd: '/tmp',
      permissionMode: 'safe',
    });
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/images');
    expect(calls[0]!.body).toEqual({ model: 'openai/gpt-image-2.5-sunburst', prompt: 'Ein Leuchtturm bei Sturm', aspect_ratio: '16:9' });
    const image = events.find((e) => e.type === 'image') as Extract<AdapterEvent, { type: 'image' }>;
    made.push(image.path);
    expect(image.path).toMatch(/\.png$/);
    expect(readFileSync(image.path, 'utf8')).toBe('PNG-BYTES');
    expect(image.prompt).toBe('Ein Leuchtturm bei Sturm');
    expect(events.at(-1)).toEqual({ type: 'result', text: 'Ein Bild erzeugt · 0,04 $.', costUsd: 0.04 });
    // While it works, the live line says what it is doing; afterwards that ends.
    expect(events.filter((e) => e.type === 'activity')).toEqual([{ type: 'activity', text: 'Erzeugt das Bild …' }, { type: 'activity' }]);
  });

  it('edits an attached picture and asks for several at once', async () => {
    const { fetch, calls } = fakeFetch([json({ data: [
      { b64_json: Buffer.from('A').toString('base64'), media_type: 'image/webp' },
      { b64_json: Buffer.from('B').toString('base64'), media_type: 'image/webp' },
    ] })]);
    const events = await run(new OpenRouterAdapter(fetch), {
      prompt: 'Mach den Himmel rot', message: 'Mach den Himmel rot\n\nAttached files:\n- /tmp/x/portrait.png',
      model: 'openai/gpt-image-2.5-sunburst', images: [photo()], imageOptions: { ratio: '1:1', count: 2 }, cwd: '/tmp', permissionMode: 'safe',
    });
    expect(calls[0]!.body).toMatchObject({ prompt: 'Mach den Himmel rot', n: 2, input_references: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}` } }] });
    const images = events.filter((e) => e.type === 'image') as Array<Extract<AdapterEvent, { type: 'image' }>>;
    made.push(...images.map((i) => i.path));
    expect(images.map((i) => [i.path.endsWith('.webp'), i.edited])).toEqual([[true, true], [true, true]]);
    expect(events.at(-1)).toMatchObject({ type: 'result', text: '2 Bilder bearbeitet.' });
  });

  it('says plainly when the credit is gone', async () => {
    const { fetch } = fakeFetch([json({ error: { message: 'Insufficient credits' } }, 402)]);
    const events = await run(new OpenRouterAdapter(fetch), { prompt: 'x', message: 'x', model: 'openai/gpt-image-2.5-sunburst', cwd: '/tmp', permissionMode: 'safe' });
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('kein Guthaben') });
  });
});

describe('OpenRouter video models', () => {
  it('orders the video, waits for the job and brings the file into the chat', async () => {
    const { fetch, calls } = fakeFetch([
      json({ id: 'gen-vid-1', polling_url: '/api/v1/videos/gen-vid-1', status: 'pending' }),
      json({ id: 'gen-vid-1', status: 'in_progress' }),
      json({ id: 'gen-vid-1', status: 'completed', unsigned_urls: ['https://openrouter.ai/api/v1/videos/gen-vid-1/content?index=0'], usage: { cost: 0.25 } }),
      () => new Response(Buffer.from('MP4-BYTES'), { status: 200, headers: { 'content-type': 'video/mp4' } }),
    ]);
    const adapter = new OpenRouterAdapter(fetch);
    adapter.setCatalog([{ id: 'heygen/avatar-iv', label: 'Avatar IV', free: false, kind: 'video' }]);
    const picture = photo();
    const events: AdapterEvent[] = [];
    const media = await import('../src/adapters/openrouterMedia.js');
    for await (const e of media.runOpenRouterMedia('video', {
      fetchImpl: fetch, key: 'sk-or-test', model: 'heygen/avatar-iv', signal: new AbortController().signal, pollMs: 1,
      req: { prompt: 'Hallo, ich bin Alex.', message: 'Hallo, ich bin Alex.', images: [picture], imageOptions: { ratio: '9:16', count: 1 }, cwd: '/tmp', permissionMode: 'safe' },
    })) events.push(e);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://openrouter.ai/api/v1/videos',
      'GET https://openrouter.ai/api/v1/videos/gen-vid-1',
      'GET https://openrouter.ai/api/v1/videos/gen-vid-1',
      'GET https://openrouter.ai/api/v1/videos/gen-vid-1/content?index=0',
    ]);
    expect(calls[0]!.body).toMatchObject({ model: 'heygen/avatar-iv', prompt: 'Hallo, ich bin Alex.', aspect_ratio: '9:16', input_references: [{ type: 'image_url' }] });
    // The file itself is fetched with the key, too.
    expect(calls[3]!.auth).toBe('Bearer sk-or-test');
    const video = events.find((e) => e.type === 'video') as Extract<AdapterEvent, { type: 'video' }>;
    made.push(video.path);
    expect(video.path).toMatch(/\.mp4$/);
    expect(readFileSync(video.path, 'utf8')).toBe('MP4-BYTES');
    expect(events.at(-1)).toEqual({ type: 'result', text: 'Video erzeugt · 0,25 $.', costUsd: 0.25 });
    expect(events.some((e) => e.type === 'activity' && e.text === 'Erzeugt das Video …')).toBe(true);
  });

  it('runs through the adapter when the catalog says the model makes videos', async () => {
    const { fetch, calls } = fakeFetch([json({ error: { message: 'An image is required' } }, 400)]);
    const adapter = new OpenRouterAdapter(fetch);
    const events = await run(adapter, { prompt: 'Hallo', message: 'Hallo', model: 'heygen/avatar-iv', cwd: '/tmp', permissionMode: 'safe' });
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/v1/videos');
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Foto') });
  });

  it('reports a job that failed on OpenRouter’s side', async () => {
    const { fetch } = fakeFetch([
      json({ id: 'gen-vid-2', polling_url: 'https://openrouter.ai/api/v1/videos/gen-vid-2', status: 'pending' }),
      json({ id: 'gen-vid-2', status: 'failed', error: 'content policy' }),
    ]);
    const media = await import('../src/adapters/openrouterMedia.js');
    const events: AdapterEvent[] = [];
    for await (const e of media.runOpenRouterMedia('video', {
      fetchImpl: fetch, key: 'k', model: 'heygen/avatar-iv', signal: new AbortController().signal, pollMs: 1,
      req: { prompt: 'x', message: 'x', cwd: '/tmp', permissionMode: 'safe' },
    })) events.push(e);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('content policy') });
  });
});

describe('Jev decisions', () => {
  it('reads options, a scale or a plain yes/no question out of a message', () => {
    expect(decisionQuestion('Welches Framework für das interne Tool?\n- React\n- Svelte\n- Vue')).toEqual({
      type: 'choice', instructions: 'Welches Framework für das interne Tool?', options: ['React', 'Svelte', 'Vue'],
    });
    expect(decisionQuestion('Wie dringend ist das?\n1. kann warten\n2. diese Woche\n3. sofort')).toMatchObject({ type: 'score', options: ['kann warten', 'diese Woche', 'sofort'] });
    expect(decisionQuestion('Ist das ein Fehler in der Software?')).toEqual({ type: 'noul', instructions: 'Ist das ein Fehler in der Software?', options: [] });
    expect(decisionQuestion('   ')).toBeUndefined();
  });

  it('asks the Decisions API with the chat as context and answers with its choice', async () => {
    const { fetch, calls } = fakeFetch([json({
      id: 'gen-dec-1', model: 'typesafe/jev-1.13-20260917',
      answers: { antwort: { type: 'choice', choice: 'option_2', confidence: 0.67, probabilities: { option_1: 0.2, option_2: 0.78, option_3: 0.02 } } },
      usage: { input_tokens: 120, output_tokens: 10, cost: 0.000005 },
    })]);
    const message = 'Welches Framework?\n- React\n- Svelte\n- Vue';
    const events = await run(new OpenRouterAdapter(fetch), {
      prompt: embedHistory([{ role: 'user', text: 'Wir bauen ein kleines Tool.' }], `brief\n\n---\n\n${message}`),
      message, model: '~typesafe/jev-latest', cwd: '/tmp', permissionMode: 'safe',
    });
    expect(calls[0]!.url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(calls[0]!.body).toMatchObject({
      model: '~typesafe/jev-latest',
      state: { nachricht: message, bisheriger_chat: expect.stringContaining('Wir bauen ein kleines Tool.') },
      questions: { antwort: { type: 'choice', instructions: 'Welches Framework?', criteria: { option_1: 'React', option_2: 'Svelte', option_3: 'Vue' } } },
    });
    const result = events.at(-1) as Extract<AdapterEvent, { type: 'result' }>;
    expect(result.text).toContain('**Jev wählt: Svelte** · Sicherheit 67 %');
    expect(result.text).toContain('| Svelte | 78 % |');
    expect(result.costUsd).toBe(0.000005);
  });

  it('tells how to ask when the message is no decision question', async () => {
    const { fetch, calls } = fakeFetch([]);
    const events = await run(new OpenRouterAdapter(fetch), { prompt: '', message: '', model: 'typesafe/jev-1.13', cwd: '/tmp', permissionMode: 'safe' });
    expect(calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: 'error', message: expect.stringContaining('Ja/Nein-Frage') });
  });

  it('words yes/no and scale answers', () => {
    expect(formatDecision({ type: 'noul', instructions: 'Bug?', options: [] }, { noul: 0.96 })).toBe('**Ja** · Wahrscheinlichkeit für Ja: 96 %');
    expect(formatDecision({ type: 'noul', instructions: 'Bug?', options: [] }, { noul: 0.1 })).toBe('**Nein** · Wahrscheinlichkeit für Ja: 10 %');
    expect(formatDecision({ type: 'score', instructions: 'Wie dringend?', options: ['kann warten', 'diese Woche', 'sofort'] }, { score: 1.99, confidence: 0.99, probabilities: { 0: 0, 1: 0.01, 2: 0.99 } }))
      .toContain('**Einstufung: sofort** · Position 1,99 auf der Skala 0–2 · Sicherheit 99 %');
  });
});

it('keeps only the user’s own words for a model that does not chat', () => {
  expect(ownMessage({ prompt: 'history…', message: 'Ein Hund\n\nAttached files:\n- /a/b.png\n- /a/c.png', cwd: '/', permissionMode: 'safe' })).toBe('Ein Hund');
  expect(ownMessage({ prompt: 'Nur der Prompt', cwd: '/', permissionMode: 'safe' })).toBe('Nur der Prompt');
});
