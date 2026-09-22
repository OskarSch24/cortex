import { describe, expect, it } from 'vitest';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { composerText, latestCheckpoint, rewindPlan } from '../../src/panel/rewind.js';

const target = { provider: 'claude' as const, account: 'a' };
const cp = (anchor: string) => ({ target, cwd: '/p', sessionId: 's', anchor });

const log: HostToWebview[] = [
  { kind: 'userEcho', text: 'eins' },
  { kind: 'routing', messageId: 'm1', target, reason: '' },
  { kind: 'delta', messageId: 'm1', text: 'A1' },
  { kind: 'done', messageId: 'm1', turn: true, checkpoint: cp('u1') },
  { kind: 'userEcho', text: 'zwei\n\nAttached files:\n- a.png', attachments: ['/p/a.png'] },
  { kind: 'routing', messageId: 'm2', target, reason: '' },
  { kind: 'delta', messageId: 'm2', text: 'A2' },
  { kind: 'done', messageId: 'm2', turn: true, checkpoint: cp('u2') },
  { kind: 'userEcho', text: 'drei' },
  { kind: 'error', messageId: 'm3', message: 'kaputt' },
];
const turns = [
  { role: 'user' as const, text: 'eins' }, { role: 'assistant' as const, text: 'A1' },
  { role: 'user' as const, text: 'zwei' }, { role: 'assistant' as const, text: 'A2' },
];

describe('rewindPlan', () => {
  it('cuts log and turns before the chosen message and keeps the checkpoint before it', () => {
    const plan = rewindPlan(log, turns, 1)!;
    expect(plan.log).toEqual(log.slice(0, 4));
    expect(plan.turns).toEqual(turns.slice(0, 2));
    expect(plan.checkpoint?.anchor).toBe('u1');
    expect(plan.dropped).toBe(2);
    expect(composerText(plan.echo.text)).toBe('zwei');
    expect(plan.echo.attachments).toEqual(['/p/a.png']);
  });

  it('going back to the first message leaves an empty chat without a checkpoint', () => {
    const plan = rewindPlan(log, turns, 0)!;
    expect(plan.log).toEqual([]);
    expect(plan.turns).toEqual([]);
    expect(plan.checkpoint).toBeUndefined();
  });

  it('a failed message had no turn: going back to it keeps both answered turns', () => {
    const plan = rewindPlan(log, turns, 2)!;
    expect(plan.turns).toHaveLength(4);
    expect(plan.checkpoint?.anchor).toBe('u2');
    expect(plan.dropped).toBe(1);
  });

  it('an answer without a checkpoint hides older ones — that session never saw it', () => {
    const noCp: HostToWebview[] = [...log.slice(0, 8)];
    noCp[7] = { kind: 'done', messageId: 'm2', turn: true };
    expect(latestCheckpoint(noCp)).toBeUndefined();
  });

  it('does not count a local image resize as a turn', () => {
    const legacy: HostToWebview[] = [
      { kind: 'userEcho', text: 'bild' },
      { kind: 'done', messageId: 'm1' },
      { kind: 'userEcho', text: 'größe' },
      { kind: 'done', messageId: 'r1', durationMs: 0, turn: false },
      { kind: 'userEcho', text: 'weiter' },
    ];
    expect(rewindPlan(legacy, turns, 2)!.turns).toHaveLength(2);
  });

  it('returns nothing for an index past the end', () => {
    expect(rewindPlan(log, turns, 3)).toBeUndefined();
  });
});
