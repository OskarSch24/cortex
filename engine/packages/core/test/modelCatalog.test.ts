import { expect, it } from 'vitest';
import { CLAUDE_MODELS, CODEX_MODELS, claudeModelsFromCatalog, latestClaudeModel, modelOption, setClaudeModels, supportedEffort } from '../src/models/catalog.js';
it('excludes Haiku and uses versioned Claude model IDs', () => {
 expect(CLAUDE_MODELS.map(m => m.id)).toEqual(['claude-sonnet-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
 expect(latestClaudeModel('opus')).toBe('claude-opus-5-5');
 expect(modelOption('claude', 'opus')?.label).toBe('Opus 5.5');
});
it('takes new Claude releases from the public catalog, never older ones', () => {
 const found = claudeModelsFromCatalog([
  'anthropic/claude-opus-6', 'anthropic/claude-opus-6:batch', 'anthropic/claude-sonnet-5.2',
  'anthropic/claude-opus-4.8', 'anthropic/claude-haiku-5', 'anthropic/claude-3-haiku', 'openai/gpt-6',
 ]);
 expect(found.map(m => m.id)).toEqual(['claude-opus-6', 'claude-sonnet-5-2', 'claude-opus-4-8']);
 expect(setClaudeModels(found).map(m => m.label)).toEqual(['Opus 6', 'Sonnet 5.2']);
 expect(CLAUDE_MODELS.map(m => m.id)).toEqual(['claude-sonnet-5-2', 'claude-sonnet-5', 'claude-opus-6', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']);
 expect(latestClaudeModel('opus')).toBe('claude-opus-6');
 expect(setClaudeModels(found)).toEqual([]);
});
it('offers Terra, Sol and Astra and respects provider capabilities', () => {
 expect(CODEX_MODELS.map(m => m.id)).toEqual(['gpt-5.6-terra','gpt-5.6-sol','gpt-6-astra']);
 expect(supportedEffort('codex','gpt-6-astra','ultra')).toBe('ultra');
 expect(supportedEffort('claude','claude-fable-5-1','ultra')).toBe('high');
 expect(supportedEffort('grok','grok','max')).toBeUndefined();
 expect(supportedEffort('claude','unknown-model','max')).toBeUndefined();
});
