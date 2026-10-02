import { describe, expect, it } from 'vitest';
import { ZAI_API_BASE, ZAI_CODING_API_BASE, ZaiAdapter, detectZaiLimit, verifyZaiKey, zaiResetAt } from '../src/adapters/zai.js';
import { buildChildEnv } from '../src/accounts/env.js';
import { isReviewOnly } from '../src/types.js';
import type { AdapterEvent, ResolvedAccount } from '../src/types.js';
import type { RunRequest } from '../src/adapters/adapter.js';

const account: ResolvedAccount = {
  id: 'zai-test', provider: 'zai', label: 'privat', authMode: 'api-key', hasSecret: true, priority: 5, secret: 'zai-test-key-0123456789.abcdef',
};
const request: RunRequest = { prompt: 'Hallo', cwd: '/tmp', permissionMode: 'safe', model: 'glm-5.3' };

function sse(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  }), { status: 200 });
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

async function collect(adapter: ZaiAdapter, req: RunRequest = request): Promise<AdapterEvent[]> {
  const events: AdapterEvent[] = [];
  for await (const ev of adapter.run(req, account, new AbortController().signal)) events.push(ev);
  return events;
}

describe('Z.ai', () => {
  it('antwortet nur von Hand, wie OpenRouter', () => {
    expect(isReviewOnly('zai')).toBe(true);
    expect(buildChildEnv(account, { ZAI_API_KEY: 'fremd' }).ZAI_API_KEY).toBe(account.secret);
  });

  it('streamt die Antwort über den Coding-Plan-Endpunkt', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];
    const adapter = new ZaiAdapter(async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), auth: String((init?.headers as Record<string, string>).Authorization) });
      return sse([
        { choices: [{ delta: { reasoning_content: 'denke …' } }] },
        { choices: [{ delta: { content: 'Hallo ' } }] },
        { choices: [{ delta: { content: 'zurück' } }], usage: { prompt_tokens: 12, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 4 } } },
      ]);
    });
    const events = await collect(adapter);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${ZAI_CODING_API_BASE}/chat/completions`);
    expect(calls[0]!.auth).toBe(`Bearer ${account.secret}`);
    expect(calls[0]!.body).toMatchObject({ model: 'glm-5.3', stream: true, messages: [{ role: 'user', content: 'Hallo' }] });
    expect(calls[0]!.body.reasoning_effort).toBeUndefined();
    expect(events.filter(e => e.type === 'text-delta').map(e => (e as { text: string }).text).join('')).toBe('Hallo zurück');
    expect(events.at(-1)).toEqual({ type: 'result', text: 'Hallo zurück', usage: { inputTokens: 12, outputTokens: 3, cachedInputTokens: 4 } });
  });

  it('schickt die gewählte Denkstufe mit', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const adapter = new ZaiAdapter(async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return sse([{ choices: [{ delta: { content: 'ok' } }] }]); });
    await collect(adapter, { ...request, effort: 'low' });
    await collect(adapter, { ...request, model: 'glm-5.3-flash', effort: 'high' });
    expect(bodies.map(b => b.reasoning_effort)).toEqual(['low', 'high']);
  });

  it('nimmt ohne Coding Plan das Guthaben (1113)', async () => {
    const urls: string[] = [];
    const adapter = new ZaiAdapter(async (url) => {
      urls.push(String(url));
      return urls.length === 1
        ? json(429, { error: { code: '1113', message: 'Insufficient balance or no resource package. Please recharge.' } })
        : sse([{ choices: [{ delta: { content: 'ok' } }] }]);
    });
    const events = await collect(adapter);
    expect(urls).toEqual([`${ZAI_CODING_API_BASE}/chat/completions`, `${ZAI_API_BASE}/chat/completions`]);
    expect(events.at(-1)).toMatchObject({ type: 'result', text: 'ok' });
  });

  it('meldet das 5-Stunden-Limit mit Reset in chinesischer Zeit', async () => {
    const adapter = new ZaiAdapter(async () => json(429, { error: { code: '1308', message: 'Usage limit reached for 5 hour. Your limit will reset at 2026-09-26 19:43:12' } }));
    const events = await collect(adapter);
    expect(events).toEqual([{ type: 'limit', scope: 'session', resetAt: Date.parse('2026-09-26T11:43:12Z'), raw: expect.stringContaining('1308') }]);
  });

  it('unterscheidet Limits von kurzen Ratenlimits', () => {
    expect(detectZaiLimit('1310', 'Weekly/Monthly Limit Exhausted. Your limit will reset at 2026-09-30 08:00:00')).toMatchObject({ scope: 'weekly', resetAt: Date.parse('2026-09-30T00:00:00Z') });
    expect(detectZaiLimit('1302', 'Rate limit reached for requests')).toBeUndefined();
    expect(zaiResetAt('nichts')).toBeUndefined();
  });

  it('sagt klar, wenn der Schlüssel abgelehnt wird', async () => {
    const events = await collect(new ZaiAdapter(async () => json(401, { error: { code: '1000', message: 'Authentication Failed' } })));
    expect(events).toEqual([{ type: 'error', message: expect.stringContaining('Schlüssel abgelehnt'), retryable: false }]);
  });

  it('prüft den Schlüssel an der Modellliste', async () => {
    const plan = await verifyZaiKey('k', async (url) => (String(url).startsWith(ZAI_CODING_API_BASE) ? json(200, { data: [] }) : json(200, { data: [] })));
    expect(plan).toEqual({ label: 'Z.ai-Schlüssel' });
    expect((await verifyZaiKey('0123456789abcdef.XYZ', async () => json(200, { data: [] }))).label).toBe('012345…XYZ');
    await expect(verifyZaiKey('k', async () => json(401, { error: { code: '1000', message: 'Authentication Failed' } }))).rejects.toThrow(/abgelehnt/);
  });
});
