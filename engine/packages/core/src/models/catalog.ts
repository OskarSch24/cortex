import type { Effort } from '../types.js';

export interface ModelOption { id: string; label: string; efforts?: Effort[]; defaultEffort?: Effort }
const claudeEfforts: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
// Codex subscription CLI capabilities (model catalog), not the API's effort scale.
const codexEfforts: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5', efforts: claudeEfforts, defaultEffort: 'high' },
  { id: 'claude-opus-5', label: 'Opus 5', efforts: claudeEfforts, defaultEffort: 'high' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', efforts: claudeEfforts, defaultEffort: 'high' },
];
export const CODEX_MODELS: ModelOption[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', efforts: codexEfforts, defaultEffort: 'medium' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', efforts: codexEfforts, defaultEffort: 'low' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', efforts: codexEfforts, defaultEffort: 'medium' },
];
export const GROK_MODELS: ModelOption[] = [
  { id: 'grok-4.6', label: 'Grok 4.6', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
  { id: 'grok-4.5', label: 'Grok 4.5', efforts: ['low', 'medium', 'high'], defaultEffort: 'high' },
];
export function modelsFor(provider: string): ModelOption[] {
  return provider === 'claude' ? CLAUDE_MODELS : provider === 'codex' ? CODEX_MODELS : provider === 'grok' ? GROK_MODELS : [];
}
export function modelOption(provider: string, model?: string): ModelOption | undefined {
  const list = modelsFor(provider);
  const aliases: Record<string, string> = { sonnet: 'claude-sonnet-5', opus: 'claude-opus-5', fable: 'claude-fable-5-1' };
  return list.find(m => m.id === (model && (aliases[model] ?? model))) ?? (!model ? list[0] : undefined);
}
/**
 * Whether this provider actually offers that model name.
 *
 * A provider Cortex has no catalog for cannot be judged, so anything passes:
 * refusing a model only because we have not listed it would be worse than
 * letting the CLI answer. Where there is a catalog, a name outside it is
 * almost always a typo in a hand-written rule — worth saying before the run.
 */
export function knownModel(provider: string, model?: string): boolean {
  if (!model) return true;
  return modelsFor(provider).length === 0 || modelOption(provider, model) !== undefined;
}
export function supportedEffort(provider: string, model: string | undefined, effort?: Effort): Effort | undefined {
  const spec = modelOption(provider, model);
  if (!spec?.efforts?.length || !effort) return undefined;
  return spec.efforts.includes(effort) ? effort : spec.defaultEffort;
}
export const EFFORT_LABELS: Record<Effort, string> = { minimal: 'Minimal', low: 'Niedrig', medium: 'Mittel', high: 'Hoch', xhigh: 'Sehr hoch', max: 'Maximal', ultra: 'Ultra' };
