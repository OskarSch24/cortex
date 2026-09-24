import type { BriefSection } from './brief.js';
import { clipLines, clipToTokens, estimateTokens, formatTokens } from './tokens.js';

/** Per-file `+added −removed` tallies, parsed out of a unified diff. */
function diffFileStats(diff: string): Array<{ path: string; added: number; removed: number }> {
  const files: Array<{ path: string; added: number; removed: number }> = [];
  let current: { path: string; added: number; removed: number } | undefined;
  for (const line of diff.split('\n')) {
    const header = /^\+\+\+ (?:b\/)?(.+)$/.exec(line);
    if (header) {
      const path = header[1]!.trim();
      current = path === '/dev/null' ? undefined : { path, added: 0, removed: 0 };
      if (current) files.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) current.added++;
    else if (line.startsWith('-')) current.removed++;
  }
  return files;
}

/**
 * The diff section, or — when the diff is too big to be worth its window — the
 * map that replaces it. Just-in-time retrieval: hand over the identifiers and
 * let the model pull what it actually needs.
 */
export function diffSection(diff: string, budget: number): BriefSection {
  const trimmed = diff.trim();
  const tokens = estimateTokens(trimmed);
  if (tokens <= budget) {
    return { id: 'diff', title: 'Current diff', body: '```diff\n' + clipLines(trimmed, 120) + '\n```' };
  }
  const files = diffFileStats(trimmed);
  if (files.length === 0) {
    return {
      id: 'diff',
      title: 'Current diff',
      body: '```diff\n' + clipToTokens(trimmed, budget) + '\n```',
    };
  }
  const lines = files
    .slice(0, 40)
    .map((f) => `- ${f.path} (+${f.added} −${f.removed})`)
    .join('\n');
  const extra = files.length > 40 ? `\n… +${files.length - 40} more files` : '';
  return {
    id: 'diff',
    title: 'Uncommitted work',
    body:
      `The working tree has ${files.length} changed file${files.length === 1 ? '' : 's'} — about ` +
      `${formatTokens(tokens)} tokens of diff, too much to send. Read the ones you need with ` +
      '`git diff -- <path>`:\n' +
      lines +
      extra,
  };
}
