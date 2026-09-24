import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { quickLookStill } from '../../src/panel/chatViewProvider.js';

const haveTools = process.platform === 'darwin' && (() => { try { execFileSync('which', ['ffmpeg']); return true; } catch { return false; } })();

describe.skipIf(!haveTools)('Standbild für angehängte Videos', () => {
  it('liefert über QuickLook ein PNG als Data-URI und räumt auf', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-still-test-'));
    const video = join(dir, 'Kapitel 01 – Intro.mp4');
    try {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=1', '-pix_fmt', 'yuv420p', video]);
      const src = await quickLookStill(video);
      expect(src).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(src!.split(',')[1]!, 'base64').subarray(1, 4).toString()).toBe('PNG');
      expect(await quickLookStill(join(dir, 'fehlt.mp4'))).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
