import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { describeMaterial, materialKind, materialSource, mp4Info, safeName } from '../../src/remotion/remotionTemplate.js';
import { firstComposition, RemotionStudio, videoFolder } from '../../src/remotion/remotionStudio.js';
import { HtmlPreviewServer } from '../../src/panel/htmlPreview.js';
import type { RemotionStateDto } from '../../src/panel/protocol.js';

describe('Vorlage für das Videoprojekt', () => {
  it('liest Länge und Größe aus dem MP4-Kopf, auch wenn moov am Ende liegt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cortex-mp4-'));
    try {
      const clip = join(dir, 'a.mp4');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=3', '-pix_fmt', 'yuv420p', clip]);
      const info = await mp4Info(clip);
      expect(info.seconds).toBeCloseTo(3, 1);
      expect(info).toMatchObject({ width: 640, height: 360 });
      const fast = join(dir, 'b.mov');
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=25:duration=2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', fast]);
      expect(await mp4Info(fast)).toMatchObject({ width: 1280, height: 720 });
      const item = await describeMaterial(clip, 'material/a.mp4');
      expect(item).toMatchObject({ kind: 'video', frames: 90, width: 640, height: 360 });
      expect(await mp4Info(join(dir, 'fehlt.mp4')).catch(() => ({}))).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('macht aus Anhängen sichere Namen und erkennt die Art', () => {
    expect(safeName('Chapter 01 – Introducing Module 01.mp4')).toBe('Chapter-01-Introducing-Module-01.mp4');
    expect(safeName('Größe & Übersicht.PNG')).toBe('Grosse-Ubersicht.png');
    expect(materialKind('a.mov')).toBe('video');
    expect(materialKind('a.webp')).toBe('image');
    expect(materialKind('a.m4a')).toBe('audio');
    expect(materialKind('a.pdf')).toBeUndefined();
  });

  it('schreibt eine Materialliste, die sich wieder lesen lässt', () => {
    const text = materialSource([{ file: 'material/a.mp4', kind: 'video', frames: 90, width: 1920, height: 1080 }]);
    expect(JSON.parse(/material: MaterialItem\[\] = ([\s\S]*);\s*$/.exec(text)![1]!)[0].frames).toBe(90);
  });
});

/*
 * Echt: Vorrat anlegen (einmalig, ~/.cortex/remotion), Projekt mit Video und
 * Bild vorbereiten, Studio zeigt es, „Material“ rendert. Nur mit CORTEX_REMOTION_LIVE=1.
 */
describe.skipIf(!process.env.CORTEX_REMOTION_LIVE)('Projekt vorbereiten (echt)', () => {
  it('legt Projekt und Timeline an, Studio startet, Material rendert', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cortex-prepare-'));
    const clip = join(root, 'Kapitel 01 – Intro.mp4');
    const still = join(root, 'Logo.png');
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30:duration=2', '-pix_fmt', 'yuv420p', clip]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=400x400', '-frames:v', '1', still]);
    // Spotlight kennt frische Dateien erst nach dem Indexieren; die Länge darf dann auf 10 s zurückfallen.
    const item = await describeMaterial(clip, 'material/x.mp4');
    expect(item?.kind).toBe('video');
    const states: RemotionStateDto[] = [];
    const preview = new HtmlPreviewServer();
    const studio = new RemotionStudio({ extensionPath: resolve(__dirname, '../..'), preview, root: () => root, post: (_, state) => states.push(state), log: line => console.log('[remotion]', line) });
    try {
      const started = Date.now();
      const material = await studio.prepare('live', [clip, still]);
      console.log('prepare ms', Date.now() - started);
      const folder = videoFolder(root, 'live');
      expect(material.map(m => m.file)).toEqual(['material/Kapitel-01-Intro.mp4', 'material/Logo.png']);
      expect(existsSync(join(folder, 'public', 'material', 'Kapitel-01-Intro.mp4'))).toBe(true);
      expect(existsSync(join(folder, 'node_modules', '@remotion', 'cli'))).toBe(true);
      expect(readFileSync(join(folder, 'src', 'materialList.ts'), 'utf8')).toContain('"kind": "image"');
      expect(studio.material('live')).toEqual(['material/Kapitel-01-Intro.mp4', 'material/Logo.png']);

      studio.watch('live', true);
      const ready = await waitFor(() => states.find(s => s.phase === 'ready' || s.phase === 'error'), 60_000);
      expect(ready.phase, ready.error).toBe('ready');
      console.log('ready ms', Date.now() - started);
      expect((await fetch(ready.studioUrl!)).status).toBe(200);

      const ids = execFileSync('npx', ['--no-install', 'remotion', 'compositions', '--quiet'], { cwd: folder }).toString();
      expect(firstComposition(ids)).toBe('Material');
      execFileSync('npx', ['--no-install', 'remotion', 'render', 'Material', 'out/Material.mp4', '--frames=0-45', '--log=error'], { cwd: folder, timeout: 240_000 });
      expect(existsSync(join(folder, 'out', 'Material.mp4'))).toBe(true);

      // Ein zweiter Auftrag mit neuem Anhang hängt an, statt neu anzulegen.
      const again = await studio.prepare('live', [still, clip]);
      expect(again).toHaveLength(2);
    } finally {
      studio.dispose();
      preview.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  }, 900_000);
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
