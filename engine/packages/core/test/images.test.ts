import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAcp } from '../src/adapters/acp.js';
import { acpImageEvent, codexImageEvent } from '../src/adapters/images.js';
import { detectGrokLimit } from '../src/adapters/limits.js';
import type { AdapterEvent } from '../src/types.js';

const AGENT = fileURLToPath(new URL('./fixtures/fake-acp-agent.mjs', import.meta.url));
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Bilder aus Codex', () => {
  it('nimmt savedPath, wenn die Datei existiert', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cx-img-'));
    const file = join(dir, 'a.png');
    writeFileSync(file, Buffer.from(PNG_1PX, 'base64'));
    const ev = codexImageEvent(
      { type: 'imageGeneration', id: 'ig_1', status: 'completed', result: PNG_1PX, savedPath: file, revisedPrompt: 'a cube' },
      dir,
      'thr',
    );
    expect(ev).toEqual({ type: 'image', path: file, prompt: 'a cube' });
  });

  it('schreibt das Base64 selbst, wenn savedPath fehlt', () => {
    const home = mkdtempSync(join(tmpdir(), 'cx-codex-home-'));
    const ev = codexImageEvent({ type: 'imageGeneration', id: 'ig_2', status: 'completed', result: PNG_1PX, savedPath: null }, home, 'thr');
    expect(ev?.path).toBe(join(home, 'generated_images', 'thr', 'ig_2.png'));
    expect(readFileSync(ev!.path).toString('base64')).toBe(PNG_1PX);
  });

  it('ignoriert andere Einträge und Fehlschläge', () => {
    expect(codexImageEvent({ type: 'commandExecution', id: 'x' }, '/tmp', 't')).toBeUndefined();
    expect(codexImageEvent({ type: 'imageGeneration', id: 'x', result: '', failure: { kind: 'x' } }, '/tmp', 't')).toBeUndefined();
  });
});

describe('Bilder aus Grok (ACP)', () => {
  it('liest rawOutput und merkt sich den Prompt des Aufrufs', () => {
    const prompts = new Map([['c1', 'A red cube']]);
    const ev = acpImageEvent(
      { sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'completed', rawOutput: { type: 'ImageGen', path: '/x/images/1.jpg' } },
      prompts,
    );
    expect(ev).toEqual({ type: 'image', path: '/x/images/1.jpg', prompt: 'A red cube', edited: undefined });
  });

  it('meldet nichts für laufende oder fremde Werkzeuge', () => {
    const prompts = new Map<string, string>();
    expect(acpImageEvent({ toolCallId: 'c', rawOutput: { type: 'ImageGen', path: '/x/1.jpg' } }, prompts)).toBeUndefined();
    expect(acpImageEvent({ toolCallId: 'c', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: '{"path":"/x/a.txt"}' } }] }, prompts)).toBeUndefined();
  });

  it('kommt über den echten ACP-Weg als image-Ereignis an', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'cx-grok-')), '1.jpg');
    const events: AdapterEvent[] = [];
    for await (const ev of runAcp({
      command: process.execPath,
      args: [AGENT],
      env: process.env,
      req: { prompt: `IMAGE:${file}`, cwd: process.cwd(), permissionMode: 'edits' },
      signal: new AbortController().signal,
      detectLimit: detectGrokLimit,
    })) events.push(ev);
    const image = events.find((e) => e.type === 'image');
    expect(image).toEqual({ type: 'image', path: file, prompt: 'A red cube', edited: undefined });
    expect(events.some((e) => e.type === 'tool-use' && e.name === 'image_gen')).toBe(true);
    expect(existsSync(file)).toBe(false);
  });
});
