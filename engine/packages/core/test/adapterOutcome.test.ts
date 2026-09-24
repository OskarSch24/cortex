import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  appendTail,
  exitOutcome,
  limitOrError,
  scopedMcpRefusal,
  setupFailure,
  usageOf,
} from '../src/adapters/outcome.js';
import { detectCodexLimit } from '../src/adapters/limits.js';
import { taskListTracker } from '../src/adapters/taskList.js';
import { describeToolUse, toolUseEvent } from '../src/adapters/toolDetail.js';
import { openRouterErrorMessage, openRouterHeaders, openRouterNoCredit } from '../src/adapters/openrouterHttp.js';
import { privateTempFile } from '../src/util/privateTempFile.js';
import { exitsZero } from '../src/util/process.js';

describe('Ausgang eines Laufs', () => {
  it('limitOrError erkennt ein Limit, sonst ein Fehler mit Wiederholungs-Einschätzung', () => {
    expect(limitOrError('usage limit reached', detectCodexLimit)).toMatchObject({ type: 'limit', scope: 'unknown' });
    expect(limitOrError('boom', detectCodexLimit)).toEqual({ type: 'error', message: 'boom', retryable: false });
    expect(limitOrError('socket hang up', detectCodexLimit)).toMatchObject({ type: 'error', retryable: true });
    const custom = limitOrError('x', () => undefined, (message) => ({ type: 'error', message: `!${message}`, retryable: false }));
    expect(custom).toEqual({ type: 'error', message: '!x', retryable: false });
  });

  it('exitOutcome: Limit vor Text vor stderr vor Rückfall', () => {
    expect(exitOutcome('', 'usage limit reached', detectCodexLimit, 'weg')).toMatchObject({ type: 'limit' });
    expect(exitOutcome('Antwort', 'x', detectCodexLimit, 'weg')).toEqual({ type: 'result', text: 'Antwort' });
    expect(exitOutcome('', '  stderr \n', detectCodexLimit, 'weg')).toEqual({ type: 'error', message: 'stderr', retryable: false });
    expect(exitOutcome('', '', detectCodexLimit, 'weg')).toEqual({ type: 'error', message: 'weg', retryable: false });
  });

  it('appendTail behält das Ende', () => {
    expect(appendTail('', 'a')).toBe('\na');
    expect(appendTail('abc', 'def', 4)).toBe('\ndef');
    expect(appendTail('x'.repeat(5000), 'y')).toHaveLength(4096);
  });

  it('usageOf lässt leere Felder weg', () => {
    expect(usageOf(0, 0, 0)).toEqual({});
    expect(usageOf(10, 2, 0)).toEqual({ inputTokens: 10, outputTokens: 2 });
    expect(usageOf(10, 0, 4)).toEqual({ inputTokens: 10, cachedInputTokens: 4 });
  });

  it('setupFailure und scopedMcpRefusal', () => {
    expect(setupFailure(new Error('kaputt'), 'Rückfall')).toEqual({ type: 'error', message: 'kaputt', retryable: false });
    expect(setupFailure('kein Error', 'Rückfall')).toEqual({ type: 'error', message: 'Rückfall', retryable: false });
    expect(scopedMcpRefusal('claude', {})).toBeUndefined();
    expect(scopedMcpRefusal('codex', undefined)).toBeUndefined();
    expect(scopedMcpRefusal('codex', {})).toMatchObject({ type: 'error', retryable: false });
  });
});

describe('Aufgabenliste und Werkzeugzeile', () => {
  it('taskListTracker meldet nur Änderungen und nie eine leere Liste', () => {
    const track = taskListTracker();
    const a = [{ text: 'a', status: 'pending' as const }];
    expect(track([])).toBeUndefined();
    expect(track(a)).toEqual({ type: 'tasks', items: a });
    expect(track([{ text: 'a', status: 'pending' }])).toBeUndefined();
    expect(track([])).toBeUndefined();
    expect(track([{ text: 'a', status: 'done' }])).toMatchObject({ type: 'tasks' });
  });

  it('toolUseEvent übernimmt die Beschreibung', () => {
    const info = describeToolUse('Read', { file_path: '/w/a.ts' }, '/w');
    expect(toolUseEvent('Read', info)).toEqual({ type: 'tool-use', name: 'Read', ...info });
  });
});

describe('OpenRouter-HTTP', () => {
  it('Header, Fehltext und 402-Satz', () => {
    expect(openRouterHeaders('k')).toMatchObject({ Authorization: 'Bearer k', 'X-Title': 'cortex' });
    expect(openRouterErrorMessage('{"error":{"message":"nope"}}')).toBe('nope');
    expect(openRouterErrorMessage('  roh  ')).toBe('roh');
    expect(openRouterErrorMessage('')).toBeUndefined();
    expect(openRouterNoCredit('x')).toBe('OpenRouter: kein Guthaben mehr für x — lade es unter openrouter.ai/credits auf.');
  });
});

describe('Prozess- und Dateihelfer', () => {
  it('privateTempFile schreibt privat und räumt den Ordner weg', () => {
    const file = privateTempFile('cortex-test-', 'mcp.json', '{}');
    expect(readFileSync(file.path, 'utf8')).toBe('{}');
    expect(statSync(file.path).mode & 0o777).toBe(0o600);
    file.dispose();
    expect(existsSync(dirname(file.path))).toBe(false);
    file.dispose();
  });

  it('exitsZero', async () => {
    expect(await exitsZero(process.execPath, ['-e', 'process.exit(0)'], process.env)).toBe(true);
    expect(await exitsZero(process.execPath, ['-e', 'process.exit(3)'], process.env)).toBe(false);
    expect(await exitsZero('/nicht/vorhanden/cortex-cli', [], process.env)).toBe(false);
  });
});
