import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { HtmlPreviewServer } from '../panel/htmlPreview.js';
import type { RemotionStateDto, RemotionVideoDto } from '../panel/protocol.js';
import { ensureCache, parseMaterialList, prepareProject, type MaterialItem } from './remotionTemplate.js';

/**
 * Das Video eines Chats, gebaut mit Remotion, gezeigt im Dock.
 *
 * Der Agent legt im Videoordner des Chats ein gewöhnliches Remotion-Projekt
 * an und schreibt dort seine Kompositionen. Cortex beobachtet den Ordner,
 * startet dazu Remotion Studio — dessen Vorschau lädt jede gespeicherte
 * Änderung sofort neu — und zeigt es im Reiter „Video“. Fertig gerenderte
 * Dateien unter `out/` erscheinen im selben Reiter als Player.
 *
 * Studio bindet sich von sich aus an alle Netzwerkschnittstellen; hier läuft
 * es mit `media/remotion/loopback.cjs` nur auf 127.0.0.1, sonst stünde das
 * Projekt im WLAN offen. Einen Browser öffnet es nie (`--no-open`).
 */

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|gif)$/i;
/** So lange läuft Studio weiter, nachdem der Reiter zu ist — ein Chatwechsel hin und zurück startet es nicht neu. */
const STUDIO_LINGER_MS = 60_000;
const POLL_MS = 1500;

interface Studio {
  process: ChildProcess;
  url?: string;
  error?: string;
  log: string;
  stopTimer?: ReturnType<typeof setTimeout>;
}

interface Render {
  process?: ChildProcess;
  running: boolean;
  label: string;
  error?: string;
}

interface RemotionStudioOptions {
  /** Wo die Erweiterung liegt — dort steht loopback.cjs. */
  extensionPath: string;
  preview: HtmlPreviewServer;
  /** Arbeitsordner des Chats (Projekt oder projektloser Ordner), ohne Seiteneffekt. */
  root: (conversationId: string) => string | undefined;
  post: (conversationId: string, state: RemotionStateDto) => void;
  /** Eine Zeile ins Cortex-Protokoll. */
  log?: (line: string) => void;
}

/** Der Videoordner eines Chats: `videos/<Kennung>` in seinem Arbeitsordner. */
export function videoFolder(root: string, conversationId: string): string {
  const id = conversationId.replace(/[^\w-]/g, '').slice(0, 12) || 'chat';
  return join(root, 'videos', `video-${id}`);
}

/** Die erste Adresse, die Studio als bereit meldet, auf 127.0.0.1 umgeschrieben. */
export function studioUrlFrom(output: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const plain = output.replace(/\[[0-9;]*m/g, '');
  const port = /Local:\s*http:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):(\d+)/.exec(plain)?.[1];
  return port ? `http://127.0.0.1:${port}/` : undefined;
}

/** Die erste Komposition aus `remotion compositions --quiet`. */
export function firstComposition(output: string): string | undefined {
  // Davor können Meldungen stehen („⚡️ Cached bundle …“); die Kennungen stehen in der letzten Zeile.
  const last = output.trim().split('\n').map(line => line.trim()).filter(Boolean).at(-1) ?? '';
  return last.split(/\s+/).find(part => /^[A-Za-z0-9-]+$/.test(part));
}

export class RemotionStudio {
  private readonly open = new Set<string>();
  private readonly studios = new Map<string, Studio>();
  private readonly renders = new Map<string, Render>();
  private readonly polls = new Map<string, ReturnType<typeof setInterval>>();
  private readonly last = new Map<string, string>();

  constructor(private readonly options: RemotionStudioOptions) {}

  folder(conversationId: string): string | undefined {
    const root = this.options.root(conversationId);
    return root ? videoFolder(root, conversationId) : undefined;
  }

  isOpen(conversationId: string): boolean {
    return this.open.has(conversationId);
  }

  /** Hat der Chat schon ein Videoprojekt? */
  hasProject(conversationId: string): boolean {
    const folder = this.folder(conversationId);
    return !!folder && existsSync(join(folder, 'package.json'));
  }

  /** Der Reiter „Video“ ist auf- oder zugegangen. */
  watch(conversationId: string, visible: boolean): void {
    if (!visible) {
      this.open.delete(conversationId);
      clearInterval(this.polls.get(conversationId));
      this.polls.delete(conversationId);
      const studio = this.studios.get(conversationId);
      if (studio && !studio.stopTimer) studio.stopTimer = setTimeout(() => this.stopStudio(conversationId), STUDIO_LINGER_MS);
      return;
    }
    this.open.add(conversationId);
    this.options.log?.(`Reiter offen (${conversationId}) → ${this.folder(conversationId) ?? 'kein Ordner'}`);
    // Den Paketvorrat schon jetzt anlegen: bis der Auftrag kommt, ist er meist fertig.
    void ensureCache(this.options.log).catch(error => this.options.log?.(`Paketvorrat fehlgeschlagen: ${String(error)}`));
    const studio = this.studios.get(conversationId);
    if (studio?.stopTimer) { clearTimeout(studio.stopTimer); studio.stopTimer = undefined; }
    this.last.delete(conversationId);
    void this.refresh(conversationId);
    if (!this.polls.has(conversationId)) this.polls.set(conversationId, setInterval(() => void this.refresh(conversationId), POLL_MS));
  }

  async action(conversationId: string, action: 'render' | 'restart'): Promise<void> {
    if (action === 'restart') {
      this.stopStudio(conversationId);
      this.last.delete(conversationId);
      await this.refresh(conversationId);
      return;
    }
    await this.render(conversationId);
  }

  /**
   * `/remotion` wurde abgeschickt: Projekt aus der Vorlage anlegen und die
   * Anhänge auf die Timeline legen, bevor der Agent loslegt — so steht die
   * Vorschau mit dem Material sofort im Reiter.
   */
  async prepare(conversationId: string, attachments: string[]): Promise<MaterialItem[]> {
    const folder = this.folder(conversationId);
    if (!folder) return [];
    const pending = prepareProject(folder, attachments, this.options.log);
    // Zwischenstand melden, sobald die Quelltexte liegen („wird eingerichtet“).
    setTimeout(() => void this.refresh(conversationId), 150);
    const result = await pending;
    this.last.delete(conversationId);
    await this.refresh(conversationId);
    return result.material;
  }

  /** Die Materialliste, wenn Cortex das Projekt angelegt hat. */
  material(conversationId: string): string[] | undefined {
    const folder = this.folder(conversationId);
    if (!folder) return undefined;
    try {
      return parseMaterialList(readFileSync(join(folder, 'src', 'materialList.ts'), 'utf8')).map(item => item.file);
    } catch { return undefined; }
  }

  /** Eine Videodatei des Chats als absoluter Pfad — nur, was wirklich in seinem Videoordner liegt. */
  videoPath(conversationId: string, file: string): string | undefined {
    const folder = this.folder(conversationId);
    if (!folder || !VIDEO_FILE.test(file)) return undefined;
    const full = join(folder, file);
    const rel = relative(folder, full);
    return !rel.startsWith('..') && existsSync(full) ? full : undefined;
  }

  dispose(): void {
    for (const poll of this.polls.values()) clearInterval(poll);
    this.polls.clear();
    for (const id of [...this.studios.keys()]) this.stopStudio(id);
    for (const render of this.renders.values()) render.process?.kill();
  }

  /** Stand ermitteln, bei Bedarf Studio starten, und nur Änderungen melden. */
  private async refresh(conversationId: string): Promise<void> {
    const state = await this.state(conversationId);
    if (state.phase === 'starting' && !this.studios.has(conversationId) && this.open.has(conversationId)) this.startStudio(conversationId, state.folder);
    const key = JSON.stringify(state);
    if (this.last.get(conversationId) === key) return;
    const before = this.last.get(conversationId);
    if (!before || JSON.parse(before).phase !== state.phase) this.options.log?.(`${conversationId}: ${state.phase}${state.studioUrl ? ` ${state.studioUrl}` : ''}${state.error ? ` — ${state.error}` : ''}`);
    this.last.set(conversationId, key);
    this.options.post(conversationId, state);
  }

  async state(conversationId: string): Promise<RemotionStateDto> {
    const folder = this.folder(conversationId) ?? '';
    const render = this.renders.get(conversationId);
    const base: RemotionStateDto = {
      folder,
      phase: 'empty',
      videos: folder ? await this.videos(folder) : [],
      ...(render ? { render: { running: render.running, label: render.label, ...(render.error ? { error: render.error } : {}) } } : {}),
    };
    if (!folder || !existsSync(join(folder, 'package.json'))) return base;
    if (!existsSync(join(folder, 'node_modules', 'remotion')) || !existsSync(join(folder, 'node_modules', '@remotion', 'cli'))) return { ...base, phase: 'installing' };
    const studio = this.studios.get(conversationId);
    if (studio?.error) return { ...base, phase: 'error', error: studio.error };
    if (studio?.url) return { ...base, phase: 'ready', studioUrl: studio.url };
    return { ...base, phase: 'starting' };
  }

  private async videos(folder: string): Promise<RemotionVideoDto[]> {
    const found: RemotionVideoDto[] = [];
    for (const dir of ['out', '.']) {
      const at = join(folder, dir);
      let names: string[];
      try { names = await readdir(at); } catch { continue; }
      for (const name of names) {
        if (!VIDEO_FILE.test(name) || name.startsWith('.')) continue;
        const file = dir === '.' ? name : `${dir}/${name}`;
        try {
          const info = await stat(join(folder, file));
          // Noch im Schreiben: Remotion legt die Datei an, bevor sie fertig ist.
          if (!info.isFile() || info.size === 0) continue;
          const url = await this.options.preview.url(folder, file);
          found.push({ name, file, url: `${url}?v=${Math.round(info.mtimeMs)}`, size: info.size, mtime: Math.round(info.mtimeMs) });
        } catch { /* verschwunden oder unlesbar */ }
      }
    }
    return found.sort((a, b) => b.mtime - a.mtime);
  }

  private env(): NodeJS.ProcessEnv {
    const preload = join(this.options.extensionPath, 'media', 'remotion', 'loopback.cjs');
    return {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require "${preload}"`.trim(),
      BROWSER: 'none',
      FORCE_COLOR: '0',
      CI: '1',
    };
  }

  /** `remotion <args>` aus dem Projekt, mit der Umgebung von `env()` und abgefangener Ausgabe. */
  private spawnRemotion(folder: string, args: string[]): ChildProcess {
    return spawn('npx', ['--no-install', 'remotion', ...args], { cwd: folder, env: this.env(), stdio: ['ignore', 'pipe', 'pipe'] });
  }

  private startStudio(conversationId: string, folder: string): void {
    this.options.log?.(`Studio startet in ${folder}`);
    const child = this.spawnRemotion(folder, ['studio', '--no-open']);
    const studio: Studio = { process: child, log: '' };
    this.studios.set(conversationId, studio);
    const read = (chunk: Buffer) => {
      studio.log = (studio.log + chunk.toString()).slice(-4000);
      if (!studio.url) {
        const url = studioUrlFrom(studio.log);
        if (url) { studio.url = url; void this.refresh(conversationId); }
      }
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.on('error', error => { studio.error = `Remotion Studio ließ sich nicht starten: ${error.message}`; void this.refresh(conversationId); });
    child.on('exit', code => {
      if (this.studios.get(conversationId) !== studio) return;
      if (code !== 0 && code !== null) {
        studio.error = `Remotion Studio wurde beendet (${code}). ${studio.log.trim().split('\n').slice(-3).join(' ')}`.trim();
        void this.refresh(conversationId);
      } else {
        this.studios.delete(conversationId);
      }
    });
  }

  private stopStudio(conversationId: string): void {
    const studio = this.studios.get(conversationId);
    if (!studio) return;
    this.studios.delete(conversationId);
    if (studio.stopTimer) clearTimeout(studio.stopTimer);
    studio.process.kill();
  }

  /** Rendert die erste Komposition nach `out/<Id>.mp4`; der Fortschritt steht im Reiter. */
  private async render(conversationId: string): Promise<void> {
    const folder = this.folder(conversationId);
    if (!folder || this.renders.get(conversationId)?.running) return;
    const render: Render = { running: true, label: 'Kompositionen werden gelesen …' };
    this.renders.set(conversationId, render);
    await this.refresh(conversationId);
    const run = (args: string[], onData?: (text: string) => void) => new Promise<{ code: number | null; output: string }>(resolve => {
      const child = this.spawnRemotion(folder, args);
      render.process = child;
      let output = '';
      const read = (chunk: Buffer) => { output = (output + chunk.toString()).slice(-8000); onData?.(chunk.toString()); };
      child.stdout?.on('data', read);
      child.stderr?.on('data', read);
      child.on('error', error => resolve({ code: 1, output: error.message }));
      child.on('exit', code => resolve({ code, output }));
    });
    const listed = await run(['compositions', '--quiet']);
    const id = listed.code === 0 ? firstComposition(listed.output) : undefined;
    if (!id) {
      Object.assign(render, { running: false, label: 'Rendern fehlgeschlagen', error: 'Keine Komposition gefunden.' });
      await this.refresh(conversationId);
      return;
    }
    render.label = `${id} wird gerendert …`;
    await this.refresh(conversationId);
    let lastPost = 0;
    const done = await run(['render', id, `out/${id}.mp4`, '--overwrite'], text => {
      // eslint-disable-next-line no-control-regex
      const match = /Rendered (\d+)\/(\d+)|Encoded (\d+)\/(\d+)/.exec(text.replace(/\[[0-9;]*m/g, ''));
      if (!match) return;
      render.label = match[1] ? `${id}: Bild ${match[1]} von ${match[2]}` : `${id}: kodiert ${match[3]} von ${match[4]}`;
      if (Date.now() - lastPost > 400) { lastPost = Date.now(); void this.refresh(conversationId); }
    });
    Object.assign(render, done.code === 0
      ? { running: false, label: `${id}.mp4 fertig`, error: undefined }
      : { running: false, label: 'Rendern fehlgeschlagen', error: done.output.trim().split('\n').slice(-4).join(' ') });
    render.process = undefined;
    this.options.log?.(`${conversationId}: ${render.label}${render.error ? ` — ${render.error}` : ''}`);
    await this.refresh(conversationId);
  }
}
