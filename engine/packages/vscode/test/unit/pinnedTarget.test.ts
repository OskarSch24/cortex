import { describe, expect, it } from 'vitest';
import { applyPinnedTarget } from '../../src/panel/pinnedTarget.js';

describe('applyPinnedTarget', () => {
  it('prefixes a structured picker choice', () => {
    expect(
      applyPinnedTarget('fix the tests', {
        provider: 'claude',
        account: 'personal',
        model: 'opus',
      }),
    ).toBe('@claude:personal/opus fix the tests');
  });

  it('leaves an explicit @mention alone', () => {
    expect(
      applyPinnedTarget('@codex:work/gpt-5 do this', {
        provider: 'claude',
        account: 'personal',
        model: 'opus',
      }),
    ).toBe('@codex:work/gpt-5 do this');
  });

  it('is a no-op without a pin', () => {
    expect(applyPinnedTarget('hello')).toBe('hello');
  });
});
