import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asksForVideo, expandSlashCommand, matchSlashCommand, remotionSections, touchesVideo } from '@cortex/core';
import { HtmlPreviewServer } from '../../src/panel/htmlPreview.js';
import { firstComposition, RemotionStudio, studioUrlFrom, videoFolder } from '../../src/remotion/remotionStudio.js';
import type { RemotionStateDto } from '../../src/panel/protocol.js';

describe('Remotion im Brief', () => {
  it('geht bei /remotion mit, auch hinter einer Konto-Erwähnung', () => {
    expect(asksForVideo('/remotion Intro für den Kanal')).toBe(true);
    expect(asksForVideo('@claude /remotion 10 Sekunden Logo')).toBe(true);
    expect(asksForVideo('Erklär mir Remotion')).toBe(false);
    expect(touchesVideo('Mach die zweite Szene langsamer')).toBe(true);
    expect(touchesVideo('Wie spät ist es?')).toBe(false);
  });

  it('nennt den Videoordner und verbietet Studio und Browser', () => {
    const [section] = remotionSections({ folder: '/p/videos/video-abc', exists: false, open: true });
    expect(section!.id).toBe('remotion');
    expect(section!.body).toContain('"/p/videos/video-abc"');
    expect(section!.body).toContain('npx create-video@latest --yes --blank --no-tailwind .');
    expect(section!.body).toContain('Do not run `remotion studio`');
    expect(section!.body).toContain('npx remotion render <CompositionId> out/<CompositionId>.mp4');
    const [again] = remotionSections({ folder: '/p/videos/video-abc', exists: true, open: false });
    expect(again!.body).toContain('already exists');
    expect(again!.body).not.toContain('create-video');
  });

  it('/remotion ist ein Slash-Befehl mit Auftrag', () => {
    const m = matchSlashCommand('/remotion Ein Intro');
    expect(m?.cmd.name).toBe('remotion');
    expect(expandSlashCommand(m!.cmd, m!.args)).toContain('Ein Intro');
    // Auch nach dem Aufklappen erkennt der Brief, dass es um das Video geht.
    expect(touchesVideo(expandSlashCommand(m!.cmd, m!.args))).toBe(true);
  });
});

describe('Remotion Studio', () => {
  it('liest die Adresse aus der Startmeldung und schreibt sie auf 127.0.0.1 um', () => {
    expect(studioUrlFrom('[1mServer ready - Local: [4mhttp://localhost:3001[24m, Network: http://192.168.1.2:3001')).toBe('http://127.0.0.1:3001/');
    expect(studioUrlFrom('Building...')).toBeUndefined();
  });

  it('nimmt die erste Komposition', () => {
    expect(firstComposition('Intro Outro\n')).toBe('Intro');
    expect(firstComposition('⚡️ Cached bundle. Subsequent renders will be faster.\nMaterial Intro\n')).toBe('Material');
    expect(firstComposition('\n')).toBeUndefined();
  });

  it('legt den Videoordner je Chat an und macht aus der Kennung nie einen fremden Pfad', () => {
    expect(videoFolder('/p', 'conv-123')).toBe('/p/videos/video-conv-123');
    expect(videoFolder('/p', '../../etc')).toBe('/p/videos/video-etc');
  });
});

/*
 * Echter Lauf gegen ein installiertes Remotion-Projekt: Studio startet nur auf
 * 127.0.0.1, der Rendern-Knopf erzeugt eine MP4, und die Datei erscheint mit
 * Adresse. Nur mit CORTEX_REMOTION_PROJECT=<Projektordner mit node_modules>.
 */
const project = process.env.CORTEX_REMOTION_PROJECT;
describe.skipIf(!project)('Remotion Studio (echt)', () => {
  it('startet abgeschottet, zeigt die Vorschau und rendert', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cortex-remotion-'));
    const folder = videoFolder(root, 'live');
    mkdirSync(join(root, 'videos'), { recursive: true });
    symlinkSync(resolve(project!), folder);
    const states: RemotionStateDto[] = [];
    const preview = new HtmlPreviewServer();
    const studio = new RemotionStudio({ extensionPath: resolve(__dirname, '../..'), preview, root: () => root, post: (_, state) => states.push(state) });
    try {
      studio.watch('live', true);
      const ready = await waitFor(() => states.find(s => s.phase === 'ready' || s.phase === 'error'), 90_000);
      expect(ready.phase, ready.error).toBe('ready');
      const port = new URL(ready.studioUrl!).port;
      const listening = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']).toString();
      expect(listening).toContain(`127.0.0.1:${port}`);
      expect(listening).not.toMatch(/\*:\d+|\[::\]/);
      expect((await fetch(ready.studioUrl!)).status).toBe(200);

      rmSync(join(folder, 'out'), { recursive: true, force: true });
      await studio.action('live', 'render');
      const done = await waitFor(() => states.at(-1)?.render && !states.at(-1)!.render!.running ? states.at(-1) : undefined, 240_000);
      expect(done.render!.error).toBeUndefined();
      const video = await waitFor(() => states.at(-1)?.videos[0] ? states.at(-1)!.videos[0] : (studio.watch('live', true), undefined), 10_000);
      expect(video.file).toMatch(/^out\/.+\.mp4$/);
      expect(existsSync(join(folder, video.file))).toBe(true);
      const head = await fetch(video.url, { headers: { Range: 'bytes=0-15' } });
      expect(head.status).toBe(206);
    } finally {
      studio.dispose();
      preview.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  }, 360_000);
});

async function waitFor<T>(probe: () => T | undefined, ms: number): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > until) throw new Error('Zeitüberschreitung');
    await new Promise(r => setTimeout(r, 250));
  }
}
