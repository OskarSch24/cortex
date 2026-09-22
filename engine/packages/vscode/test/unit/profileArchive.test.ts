import { mkdtempSync, mkdirSync, existsSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveOrphanProfiles, orphanProfiles } from '../../src/storage/profileArchive.js';

describe('profile directories without an account', () => {
  it('moves them to the archive instead of deleting them, and leaves fresh ones alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'cortex-profiles-'));
    const archive = join(root, '..', `${root.split('/').pop()}-archiv`);
    const old = Date.now() / 1000 - 3 * 86400;
    for (const name of ['claude-aktiv', 'gemini-alt', 'grok-abgebrochen', 'grok-frisch']) {
      mkdirSync(join(root, name));
      writeFileSync(join(root, name, 'auth.json'), '{}');
      if (name !== 'grok-frisch') utimesSync(join(root, name), old, old);
    }
    expect(orphanProfiles(root, [join(root, 'claude-aktiv')]).map((d) => d.split('/').pop()).sort()).toEqual(['gemini-alt', 'grok-abgebrochen']);
    const moved = archiveOrphanProfiles([join(root, 'claude-aktiv')], root, archive);
    expect(moved).toHaveLength(2);
    expect(existsSync(join(root, 'gemini-alt'))).toBe(false);
    expect(existsSync(join(moved[0]!, 'auth.json'))).toBe(true);
    expect(existsSync(join(root, 'claude-aktiv'))).toBe(true);
    expect(existsSync(join(root, 'grok-frisch'))).toBe(true);
  });
});
