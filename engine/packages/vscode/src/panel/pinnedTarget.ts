import { parseMention, type Target } from '@cortex/core';

/** Prefix `@provider:account/model` so the router treats the picker as an explicit mention. */
export function applyPinnedTarget(text: string, target?: Target): string {
  if (!target) return text;
  if (parseMention(text).mention) return text;
  const mention = `@${target.provider}:${target.account}${target.model ? `/${target.model}` : ''}`;
  return `${mention} ${text}`;
}
