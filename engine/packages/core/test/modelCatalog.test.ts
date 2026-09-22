import { expect, it } from 'vitest';
import { CLAUDE_MODELS, CODEX_MODELS, supportedEffort } from '../src/models/catalog.js';
it('excludes Haiku and uses versioned Claude model IDs', () => {
 expect(CLAUDE_MODELS.map(m => m.id)).toEqual(['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5-1']);
});
it('offers Terra, Sol and Astra and respects provider capabilities', () => {
 expect(CODEX_MODELS.map(m => m.id)).toEqual(['gpt-5.6-terra','gpt-5.6-sol','gpt-6-astra']);
 expect(supportedEffort('codex','gpt-6-astra','ultra')).toBe('ultra');
 expect(supportedEffort('claude','claude-fable-5-1','ultra')).toBe('high');
 expect(supportedEffort('grok','grok','max')).toBeUndefined();
 expect(supportedEffort('claude','unknown-model','max')).toBeUndefined();
});
