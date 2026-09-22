import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describeToolUse } from '../../../core/src/adapters/toolDetail.js';
import { applyHostMessage, type Segment, type ToolStep } from '../../src/panel/transcript.js';
import { captureBaseline, planRevert } from '../../src/panel/workspace.js';
const { formatStamp, formatWorked, groupSentence, localUrl, splitTurn, turnFiles } = await import('../../webview/components/chat.js');
import { composeMessage, isLongPaste } from '../../webview/components/paste.js';

const step = (action: ToolStep['action'], extra: Partial<ToolStep> = {}): ToolStep => ({ name: action ?? 'tool', action, ...extra });

describe('activity sentences like Codex', () => {
  it('reads a mixed group in the fixed Codex order', () => {
    const steps = [step('run'), step('other'), step('search'), step('read'), step('read')];
    expect(groupSentence(steps)).toBe('Hat ein Werkzeug verwendet, hat 3 Dateien gelesen und hat einen Befehl ausgeführt');
  });
  it('counts one and many', () => {
    expect(groupSentence([step('run'), step('run')])).toBe('Hat 2 Befehle ausgeführt');
    expect(groupSentence([step('edit'), step('write'), step('run')])).toBe('2 Dateien bearbeitet und hat einen Befehl ausgeführt');
    expect(groupSentence([step('read')])).toBe('Hat eine Datei gelesen');
  });
});

describe('a finished turn folds its work', () => {
  const text = (t: string): Segment => ({ kind: 'text', text: t });
  const tools: Segment = { kind: 'tools', steps: [step('read')] };
  it('keeps the text after the last step as the answer', () => {
    const { work, final } = splitTurn([text('a'), tools, text('b'), text('c')]);
    expect(work.map(([, i]) => i)).toEqual([0, 1]);
    expect(final.map(([, i]) => i)).toEqual([2, 3]);
  });
  it('keeps the last text as the answer when the turn ends with a step', () => {
    const { work, final } = splitTurn([text('a'), tools, text('b'), tools]);
    expect(final.map(([, i]) => i)).toEqual([2]);
    expect(work.map(([, i]) => i)).toEqual([0, 1, 3]);
  });
  it('writes the time worked the way Codex does', () => {
    expect(formatWorked(28_000)).toBe('28s');
    expect(formatWorked(718_000)).toBe('11m 58s');
    expect(formatWorked(3_780_000)).toBe('1h 3m');
  });
});

describe('dates, links and files', () => {
  const now = new Date(2026, 8, 11, 16, 40).getTime();
  it('stamps messages relative to today', () => {
    expect(formatStamp(new Date(2026, 8, 11, 16, 36).getTime(), now)).toBe('Heute, 16:36');
    expect(formatStamp(new Date(2026, 8, 10, 9, 5).getTime(), now)).toBe('Gestern, 09:05');
    expect(formatStamp(new Date(2026, 8, 8, 16, 36).getTime(), now)).toBe('Dienstag, 16:36');
    expect(formatStamp(new Date(2026, 7, 1, 16, 36).getTime(), now)).toBe('1. Aug., 16:36');
  });
  it('finds a local website in an answer', () => {
    expect(localUrl('Läuft unter http://127.0.0.1:8768/ausbauplan/index.html.')).toBe('http://127.0.0.1:8768/ausbauplan/index.html');
    expect(localUrl('Siehe https://example.com')).toBeUndefined();
  });
  it('sums the lines each file got in one turn', () => {
    const segments: Segment[] = [{ kind: 'tools', steps: [
      step('edit', { path: 'a.ts', added: 3, removed: 1 }),
      step('read', { path: 'b.ts' }),
      step('edit', { path: 'a.ts', added: 2, removed: 0 }),
      step('write', { path: 'c.ts', added: 68, removed: 0 }),
    ] }];
    expect(turnFiles(segments)).toEqual([{ path: 'a.ts', added: 5, removed: 1 }, { path: 'c.ts', added: 68, removed: 0 }]);
  });
});

describe('tool calls carry their line counts', () => {
  it('counts an edit and a new file', () => {
    expect(describeToolUse('Edit', { file_path: '/p/a.ts', old_string: 'x\ny', new_string: 'x\ny\nz' }, '/p')).toMatchObject({ added: 3, removed: 2 });
    expect(describeToolUse('Write', { file_path: '/p/b.ts', content: 'a\nb\n' }, '/p')).toMatchObject({ added: 2, removed: 0 });
    expect(describeToolUse('MultiEdit', { file_path: '/p/a.ts', edits: [{ old_string: 'a', new_string: 'b\nc' }, { old_string: 'd', new_string: 'e' }] }, '/p')).toMatchObject({ added: 3, removed: 2 });
  });
  it('keeps them on the transcript step and marks an undone turn', () => {
    let items = applyHostMessage([], { kind: 'toolUse', messageId: 'm', name: 'Edit', path: 'a.ts', action: 'edit', added: 4, removed: 1 });
    items = applyHostMessage(items, { kind: 'reverted', messageId: 'm' });
    const turn = items[0] as Extract<(typeof items)[number], { kind: 'assistant' }>;
    expect(turn.segments[0]).toEqual({ kind: 'tools', steps: [{ name: 'Edit', path: 'a.ts', action: 'edit', added: 4, removed: 1, detail: undefined, preview: undefined }] });
    expect(turn.reverted).toBe(true);
  });
});

describe('long pasted text', () => {
  it('becomes a block past 20 lines or 1500 characters', () => {
    expect(isLongPaste('kurz')).toBe(false);
    expect(isLongPaste(Array.from({ length: 21 }, () => 'x').join('\n'))).toBe(true);
    expect(isLongPaste('x'.repeat(1501))).toBe(true);
  });
  it('is sent after the instruction, in full', () => {
    expect(composeMessage('  Fasse zusammen ', ['Zeile 1\nZeile 2\n\n'])).toBe('Fasse zusammen\n\nZeile 1\nZeile 2');
    expect(composeMessage('', ['nur eingefügt'])).toBe('nur eingefügt');
  });
});

describe('undoing a turn with git', () => {
  let dir = '';
  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });

  it('restores changed files, removes new ones, and leaves the rest alone', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-revert-'));
    git('init', '-q');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.txt'), 'committed\n');
    git('add', '.');
    git('commit', '-qm', 'init');
    writeFileSync(join(dir, 'a.txt'), 'uncommitted before the turn\n');
    writeFileSync(join(dir, 'loose.txt'), 'untracked before the turn\n');

    const baseline = await captureBaseline(dir);
    expect(baseline).toBeDefined();
    // Die Baseline hat den Arbeitsstand nicht angefasst.
    expect(git('status', '--porcelain').toString()).toContain(' M a.txt');

    writeFileSync(join(dir, 'a.txt'), 'written by the agent\n');
    writeFileSync(join(dir, 'new.txt'), 'created by the agent\n');
    const plan = await planRevert(dir, baseline!, ['a.txt', 'new.txt', 'loose.txt', '../outside.txt', '/tmp/x.py']);
    expect(plan.restore.map((f) => [f.path, f.content.toString()])).toEqual([['a.txt', 'uncommitted before the turn\n']]);
    expect(plan.remove).toEqual(['new.txt']);
    expect(plan.skipped).toEqual(['loose.txt', '../outside.txt', '/tmp/x.py']);
  });

  it('has no baseline outside a repository', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cortex-norepo-'));
    expect(await captureBaseline(dir)).toBeUndefined();
  });
});

describe('Arbeitsuhr', () => {
  it('zählt ab deiner Nachricht, nicht ab dem Neuladen der Ansicht', async () => {
    const { runStart } = await import('../../webview/components/Transcript.js');
    const items = [
      { kind: 'user' as const, text: 'erste', at: 1_000 },
      { kind: 'assistant' as const, messageId: 'a', segments: [], done: true },
      { kind: 'user' as const, text: 'Google Earth einbauen', at: 5_000 },
      { kind: 'assistant' as const, messageId: 'b', segments: [], done: false },
      { kind: 'user' as const, text: 'nachgeschoben', at: 9_000 },
    ];
    expect(runStart(items)).toBe(5_000);
    expect(runStart(items.slice(0, 2))).toBeUndefined();
  });
});
