import { isRecord } from '../util/guards.js';

/** Tolerant NDJSON parsing: returns undefined for non-JSON lines instead of throwing. */
export function tryParseJson(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Follows `path` through nested objects (arrays by index); undefined at a dead end. */
function walk(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

export function getString(obj: unknown, ...path: string[]): string | undefined {
  const value = walk(obj, path);
  return typeof value === 'string' ? value : undefined;
}

export function getNumber(obj: unknown, ...path: string[]): number | undefined {
  const value = walk(obj, path);
  return typeof value === 'number' ? value : undefined;
}

export function getObject(obj: unknown, ...path: string[]): Record<string, unknown> | undefined {
  const value = walk(obj, path);
  return isRecord(value) ? value : undefined;
}
