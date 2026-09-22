import { describe, expect, it } from 'vitest';
import {
  detectClaudeLimit,
  detectCodexLimit,
  detectCopilotLimit,
} from '../src/adapters/limits.js';

describe('claude limit detection', () => {
  it('parses the pipe-epoch form with reset time', () => {
    const info = detectClaudeLimit('Claude AI usage limit reached|1753970400');
    expect(info).toBeDefined();
    expect(info!.resetAt).toBe(1753970400 * 1000);
  });

  it('accepts millisecond epochs as-is', () => {
    const info = detectClaudeLimit('Claude AI usage limit reached|1753970400000');
    expect(info!.resetAt).toBe(1753970400000);
  });

  it('detects newer copy without epoch', () => {
    expect(detectClaudeLimit("You've reached your usage limit for this period")).toBeDefined();
    expect(detectClaudeLimit("You've hit your usage limit")).toBeDefined();
  });

  it('ignores unrelated errors', () => {
    expect(detectClaudeLimit('API error: overloaded')).toBeUndefined();
  });
});

describe('codex limit detection', () => {
  const NOW = new Date('2026-07-31T10:00:00').getTime();

  it('detects the standard message and parses "try again at"', () => {
    const info = detectCodexLimit(
      "You've hit your usage limit. Upgrade to Pro (https://openai.com/chatgpt/pricing), visit https://chatgpt.com/codex/settings/usage to purchase more credits, or try again at 5:30 PM.",
      () => NOW,
    );
    expect(info).toBeDefined();
    const reset = new Date(info!.resetAt!);
    expect(reset.getHours()).toBe(17);
    expect(reset.getMinutes()).toBe(30);
    expect(info!.resetAt!).toBeGreaterThan(NOW);
  });

  it('rolls to the next day when the stated time already passed', () => {
    const info = detectCodexLimit("You've hit your usage limit. Try again at 9:00 AM.", () => NOW);
    expect(new Date(info!.resetAt!).getDate()).not.toBe(new Date(NOW).getDate());
  });

  it('detects the wire error code', () => {
    expect(detectCodexLimit('{"type":"error","code":"usage_limit_reached"}')).toBeDefined();
  });

  it('ignores unrelated errors', () => {
    expect(detectCodexLimit('sandbox denied: git push')).toBeUndefined();
  });
});

describe('copilot limit detection', () => {
  it('detects quota_exceeded and no-quota copy', () => {
    expect(detectCopilotLimit('Error: quota_exceeded')).toBeDefined();
    expect(detectCopilotLimit('You have no quota')).toBeDefined();
  });

  it('marks scope as credits', () => {
    expect(detectCopilotLimit('You have no quota')?.scope).toBe('credits');
  });

  it('ignores unrelated errors', () => {
    expect(detectCopilotLimit('permission denied')).toBeUndefined();
  });
});
