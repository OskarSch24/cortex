import type { Effort } from '../types.js';

export interface ModelOption {
  id: string;
  label: string;
  efforts?: Effort[];
  defaultEffort?: Effort;
  /** A model that does not chat but makes images, videos or typed decisions — the picker says which. */
  output?: 'image' | 'video' | 'decisions';
}
const claudeEfforts: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
// Codex subscription CLI capabilities (model catalog), not the API's effort scale.
const codexEfforts: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
/**
 * Claude models Cortex knows without looking anything up. Newer ones join at
 * runtime through `setClaudeModels` — the array is changed in place, so the
 * adapter and every `modelOption` caller see them without a rebuild.
 */
export const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5', efforts: claudeEfforts, defaultEffort: 'high' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5', efforts: claudeEfforts, defaultEffort: 'high' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1', efforts: claudeEfforts, defaultEffort: 'high' },
];
/** Families the picker offers, in picker order. Haiku stays out on purpose. */
const CLAUDE_FAMILIES = ['sonnet', 'opus', 'fable'] as const;
type ClaudeFamily = (typeof CLAUDE_FAMILIES)[number];
const CLAUDE_ID = /^claude-(sonnet|opus|fable)-(\d+)(?:-(\d+))?$/;

function claudeVersion(id: string): { family: ClaudeFamily; major: number; minor: number } | undefined {
  const m = CLAUDE_ID.exec(id);
  return m ? { family: m[1] as ClaudeFamily, major: Number(m[2]), minor: Number(m[3] ?? 0) } : undefined;
}

/**
 * Turns public catalog ids (OpenRouter writes `anthropic/claude-opus-5.5`)
 * into Anthropic's own (`claude-opus-5-5`). Anything that is not a plain
 * Sonnet, Opus or Fable release is skipped.
 */
export function claudeModelsFromCatalog(ids: string[]): ModelOption[] {
  const out: ModelOption[] = [];
  for (const raw of ids) {
    const id = raw.replace(/^anthropic\//, '').replace(/\./g, '-');
    const v = claudeVersion(id);
    if (!v) continue;
    const name = v.family[0]!.toUpperCase() + v.family.slice(1);
    out.push({ id, label: `${name} ${v.major}${v.minor ? `.${v.minor}` : ''}`, efforts: claudeEfforts, defaultEffort: 'high' });
  }
  return out;
}

/**
 * Adds newly released models to the Claude list. Per family only releases at
 * least as new as the newest one already listed join, so a lookup never drags
 * old generations back in; known models are never removed. Returns the
 * models that joined.
 */
export function setClaudeModels(found: ModelOption[]): ModelOption[] {
  const newest = new Map<ClaudeFamily, number>();
  for (const m of CLAUDE_MODELS) {
    const v = claudeVersion(m.id);
    if (v) newest.set(v.family, Math.max(newest.get(v.family) ?? 0, v.major * 1000 + v.minor));
  }
  const fresh = found.filter((m) => {
    const v = claudeVersion(m.id);
    return v && newest.has(v.family) && v.major * 1000 + v.minor >= newest.get(v.family)! && !CLAUDE_MODELS.some((k) => k.id === m.id);
  });
  if (!fresh.length) return fresh;
  const rank = (m: ModelOption) => {
    const v = claudeVersion(m.id);
    return v ? CLAUDE_FAMILIES.indexOf(v.family) * 1e6 - (v.major * 1000 + v.minor) : 1e9;
  };
  const all = [...CLAUDE_MODELS, ...fresh].sort((a, b) => rank(a) - rank(b));
  CLAUDE_MODELS.splice(0, CLAUDE_MODELS.length, ...all);
  return fresh;
}

/** The newest listed model of a Claude family — `opus` answers Opus 5.5 today. */
export function latestClaudeModel(family: ClaudeFamily): string | undefined {
  return CLAUDE_MODELS.find((m) => claudeVersion(m.id)?.family === family)?.id;
}

export const CODEX_MODELS: ModelOption[] = [
  { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', efforts: codexEfforts, defaultEffort: 'medium' },
  { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', efforts: codexEfforts, defaultEffort: 'low' },
  { id: 'gpt-6-astra', label: 'GPT-6 Astra', efforts: codexEfforts, defaultEffort: 'medium' },
];
export const GROK_MODELS: ModelOption[] = [
  { id: 'grok-4.7', label: 'Grok 4.7', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
  { id: 'grok-4.7-build-fast', label: 'Grok 4.7 Build Fast', efforts: ['low', 'medium', 'high', 'xhigh'], defaultEffort: 'high' },
];
/**
 * GLM über die Z.ai-API. Beide denken immer; `reasoning_effort` kennt nur diese
 * drei Stufen, Z.ais Vorgabe ist `max`.
 */
const glmEfforts: Effort[] = ['low', 'high', 'max'];
export const ZAI_MODELS: ModelOption[] = [
  { id: 'glm-5.3', label: 'GLM-5.3', efforts: glmEfforts, defaultEffort: 'max' },
  { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash', efforts: glmEfforts, defaultEffort: 'max' },
];
/**
 * Models taken out of the picker, and what a saved chat, rule or team that
 * still names one runs instead — so an old choice keeps working rather than
 * failing validation or quietly running a model nobody can pick anymore.
 */
const RETIRED_MODELS: Record<string, Record<string, string>> = {
  claude: { 'claude-opus-5': 'claude-opus-5-5' },
  grok: { 'grok-4.6': 'grok-4.7', 'grok-4.5': 'grok-4.7' },
};
/** The model a run actually uses: a retired name becomes its successor. */
export function currentModel(provider: string, model: string): string;
export function currentModel(provider: string, model: string | undefined): string | undefined;
export function currentModel(provider: string, model: string | undefined): string | undefined {
  return (model && RETIRED_MODELS[provider]?.[model]) || model;
}
export function modelsFor(provider: string): ModelOption[] {
  return provider === 'claude' ? CLAUDE_MODELS : provider === 'codex' ? CODEX_MODELS : provider === 'grok' ? GROK_MODELS : provider === 'zai' ? ZAI_MODELS : [];
}
export function modelOption(provider: string, model?: string): ModelOption | undefined {
  const list = modelsFor(provider);
  const alias = provider === 'claude' && (CLAUDE_FAMILIES as readonly string[]).includes(model ?? '') ? latestClaudeModel(model as ClaudeFamily) : undefined;
  return list.find(m => m.id === (alias ?? currentModel(provider, model))) ?? (!model ? list[0] : undefined);
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
