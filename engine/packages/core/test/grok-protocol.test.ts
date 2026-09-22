import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runAcp } from '../src/adapters/acp.js';
import { grokAcpArgs } from '../src/adapters/grok.js';
import type { AdapterEvent, Effort } from '../src/types.js';
async function run(model: string, resumeSessionId?: string, extra: { prompt?: string; effort?: Effort; env?: NodeJS.ProcessEnv } = {}) {
 const events: AdapterEvent[] = [];
 for await (const event of runAcp({ command: process.execPath, args: [fileURLToPath(new URL('./fixtures/fake-acp-agent.mjs', import.meta.url))], env: extra.env ?? process.env, configureGrokSession: true, req: { prompt: extra.prompt ?? 'MODEL_CHECK', cwd: process.cwd(), model, resumeSessionId, effort: extra.effort, permissionMode: 'safe' }, signal: new AbortController().signal, detectLimit: () => undefined })) events.push(event);
 return events;
}
it('never passes model arguments to the stdio subcommand', () => {
 expect(grokAcpArgs('grok-4.6')).toEqual(['agent','stdio']);
});
it('authenticates and selects the exact model for new and resumed sessions', async () => {
 for (const resume of [undefined, 'fake-session-1']) {
  const events = await run('grok-4.5', resume);
  expect(events.find(e => e.type === 'result')).toMatchObject({text:'grok-4.5'});
 }
});
it('does not silently run the default model if selection fails', async () => {
 const events = await run('unknown');
 expect(events.some(e => e.type === 'error')).toBe(true);
 expect(events.some(e => e.type === 'result')).toBe(false);
});

it('passes the reasoning effort as a session config option', async () => {
 const events = await run('grok-4.6', undefined, { prompt: 'CONFIG_CHECK', effort: 'high' });
 expect(events.find(e => e.type === 'result')).toMatchObject({ text: '{"reasoning_effort":"high"}' });
});
it('still answers when the CLI is too old for the effort option', async () => {
 // grok 1.0.13 has no session/set_config_option and answers -32601. Losing a
 // dial must not lose the turn — before this, every run with an effort set
 // died with the bare protocol text "Method not found".
 const events = await run('grok-4.6', undefined, { effort: 'high', env: { ...process.env, GROK_WITHOUT_CONFIG_OPTIONS: '1' } });
 expect(events.some(e => e.type === 'error')).toBe(false);
 expect(events.find(e => e.type === 'result')).toMatchObject({ text: 'grok-4.6' });
 expect(events.find(e => e.type === 'notice')).toMatchObject({ text: expect.stringContaining('Denk-Aufwand') });
});
it('names the outdated CLI instead of echoing "Method not found"', async () => {
 const events = await run('grok-4.6', undefined, { effort: 'high', env: { ...process.env, GROK_WITHOUT_CONFIG_OPTIONS: '1' } });
 expect(events.some(e => e.type === 'notice' && /Method not found/i.test(e.text))).toBe(false);
});
