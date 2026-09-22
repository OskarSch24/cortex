import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnLines, type SpawnEvent } from '../src/adapters/spawn.js';

const temporary: string[] = [];
let previousElectron: PropertyDescriptor | undefined;
beforeEach(() => { previousElectron = Object.getOwnPropertyDescriptor(process.versions, 'electron'); });
afterEach(() => {
  if (previousElectron) Object.defineProperty(process.versions, 'electron', previousElectron);
  else delete process.versions.electron;
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});
const root = () => { const value = mkdtempSync(join(tmpdir(), 'cortex-electron-spawn-')); temporary.push(value); return value; };
async function collect(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const events: SpawnEvent[] = [];
  for await (const event of spawnLines(command, args, { cwd, env, signal: new AbortController().signal })) events.push(event);
  expect(events.some(event => event.kind === 'spawn-error')).toBe(false);
  expect(events.find(event => event.kind === 'exit')).toMatchObject({ code: 0 });
  return events.filter((event): event is Extract<SpawnEvent, { kind: 'line' }> => event.kind === 'line' && event.stream === 'stdout').map(event => event.line);
}

describe('standalone Electron provider subprocesses', () => {
  it.each(['mjs', 'cjs', 'js'])('sets RunAsNode when a configured .%s provider runs from Electron', async extension => {
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: '44-test' });
    const cwd = root(), file = join(cwd, `provider.${extension}`);
    writeFileSync(file, 'console.log(JSON.stringify({ mode: process.env.ELECTRON_RUN_AS_NODE, argument: process.argv[2], marker: process.env.CORTEX_FIXTURE, cwd: process.cwd() }));');
    const env = { PATH: '/usr/bin:/bin', ELECTRON_RUN_AS_NODE: '0', CORTEX_FIXTURE: 'isolated-provider-test' };
    const lines = await collect(file, ['argument with spaces'], cwd, env);
    expect(JSON.parse(lines[0]!)).toEqual({ mode: '1', argument: 'argument with spaces', marker: 'isolated-provider-test', cwd: realpathSync(cwd) });
    expect(env.ELECTRON_RUN_AS_NODE).toBe('0');
  });

  it('does not change native CLI environments just because the host is Electron', async () => {
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: '44-test' });
    const lines = await collect('/bin/sh', ['-c', 'printf "%s\\n" "${ELECTRON_RUN_AS_NODE-unset}"'], root(), { PATH: '/usr/bin:/bin' });
    expect(lines).toEqual(['unset']);
  });

  it('leaves ordinary Node script execution unchanged outside Electron', async () => {
    delete process.versions.electron;
    const cwd = root(), file = join(cwd, 'provider.mjs');
    writeFileSync(file, 'console.log(process.env.ELECTRON_RUN_AS_NODE ?? "unset");');
    const lines = await collect(file, [], cwd, { PATH: '/usr/bin:/bin' });
    expect(lines).toEqual(['unset']);
  });
});
