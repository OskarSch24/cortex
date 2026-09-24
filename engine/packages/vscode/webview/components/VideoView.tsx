import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview, RemotionStateDto, RemotionVideoDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

/**
 * Der Reiter „Video“: das Remotion-Video des Chats.
 *
 * Solange der Agent baut, zeigt er Remotion Studio als Live-Vorschau — jede
 * gespeicherte Datei erscheint dort sofort. Fertig gerenderte Dateien aus
 * `out/` stehen unter „Fertig“ als Player. Kommt ein neues Video hinzu,
 * wechselt der Reiter von selbst dorthin.
 */

type View = 'live' | 'done';

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function action(conversationId: string, kind: 'render' | 'restart' | 'reveal' | 'open' | 'saveAs', file?: string) {
  vscode.postMessage({ kind: 'remotionAction', conversationId, action: kind, ...(file ? { file } : {}) });
}

function Waiting({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div class="cx-dock-empty">
    <Glyph name={icon} size={26} />
    <strong>{title}</strong>
    <span>{text}</span>
  </div>;
}

function Live({ state }: { state?: RemotionStateDto }) {
  if (!state) return <Waiting icon="play" title="Video wird geladen …" text="Cortex sieht im Videoordner des Chats nach." />;
  if (state.phase === 'empty') return <Waiting icon="play" title="Noch kein Video" text="Schreib „/remotion“ und beschreib das Video — der Agent baut es hier, du siehst jede Szene sofort." />;
  if (state.phase === 'installing') return <Waiting icon="download" title="Projekt wird eingerichtet …" text="Der Agent installiert Remotion. Danach startet die Vorschau von selbst." />;
  if (state.phase === 'starting') return <Waiting icon="refresh" title="Vorschau startet …" text="Remotion Studio wird gestartet." />;
  if (state.phase === 'error') return <div class="cx-dock-empty">
    <Glyph name="warn" size={26} />
    <strong>Vorschau gestoppt</strong>
    <span>{state.error}</span>
  </div>;
  return <div class="cx-dock-file page cx-video-live">
    <iframe src={state.studioUrl} title="Remotion Studio — Live-Vorschau" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" />
  </div>;
}

function Done({ conversationId, videos, chosen, onChoose }: {
  conversationId: string;
  videos: RemotionVideoDto[];
  chosen?: string;
  onChoose: (file: string) => void;
}) {
  if (!videos.length) return <Waiting icon="play" title="Noch nichts gerendert" text="Sobald der Agent rendert oder du auf „Rendern“ drückst, steht das Video hier." />;
  const current = videos.find(video => video.file === chosen) ?? videos[0]!;
  return <div class="cx-video-done">
    <div class="cx-video-player">
      {/\.gif$/i.test(current.name)
        ? <img src={current.url} alt={current.name} />
        : <video key={current.url} src={current.url} controls autoPlay={false} playsInline preload="metadata" />}
    </div>
    <div class="cx-video-list" role="list" aria-label="Gerenderte Videos">
      {videos.map(video => <div role="listitem" key={video.file} class={`cx-video-row ${video.file === current.file ? 'selected' : ''}`}>
        <button class="cx-video-pick" onClick={() => onChoose(video.file)} title={video.file}>
          <Glyph name="play" size={13} />
          <span>{video.name}</span>
          <small>{size(video.size)}</small>
        </button>
        <button class="cx-icon" title="Im Standardprogramm öffnen" aria-label={`${video.name} öffnen`} onClick={() => action(conversationId, 'open', video.file)}><Glyph name="arrowUpRight" size={13} /></button>
        <button class="cx-icon" title="Im Finder zeigen" aria-label={`${video.name} im Finder zeigen`} onClick={() => action(conversationId, 'reveal', video.file)}><Glyph name="folder" size={13} /></button>
        <button class="cx-icon" title="Sichern unter …" aria-label={`${video.name} sichern`} onClick={() => action(conversationId, 'saveAs', video.file)}><Glyph name="download" size={13} /></button>
      </div>)}
    </div>
  </div>;
}

export function VideoView({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<RemotionStateDto>();
  const [view, setView] = useState<View>('live');
  const [chosen, setChosen] = useState<string>();
  const newest = useRef<string>();

  useEffect(() => {
    setState(undefined);
    newest.current = undefined;
    const onMessage = (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind !== 'remotionState' || msg.conversationId !== conversationId) return;
      setState(msg.state);
      // Ein neues fertiges Video holt den Reiter nach „Fertig“ — dafür wurde gerendert.
      const top = msg.state.videos[0];
      const key = top ? `${top.file}:${top.mtime}` : '';
      if (newest.current !== undefined && key && key !== newest.current) { setView('done'); setChosen(top!.file); }
      newest.current = key;
    };
    window.addEventListener('message', onMessage);
    vscode.postMessage({ kind: 'remotionWatch', conversationId, open: true });
    return () => {
      window.removeEventListener('message', onMessage);
      vscode.postMessage({ kind: 'remotionWatch', conversationId, open: false });
    };
  }, [conversationId]);

  const rendering = state?.render?.running;
  const canRender = !!state && (state.phase === 'ready' || state.phase === 'starting') && !rendering;
  return <div class="cx-video">
    <div class="cx-dock-head cx-video-head">
      <div class="cx-video-switch" role="tablist" aria-label="Ansicht">
        <button role="tab" aria-selected={view === 'live'} onClick={() => setView('live')}><Glyph name="eye" size={13} />Live</button>
        <button role="tab" aria-selected={view === 'done'} onClick={() => setView('done')}><Glyph name="play" size={13} />Fertig{state?.videos.length ? ` · ${state.videos.length}` : ''}</button>
      </div>
      <span class="cx-video-status" title={state?.render?.error}>
        {state?.render && <><Glyph name={rendering ? 'refresh' : state.render.error ? 'warn' : 'check'} size={12} />{state.render.label}</>}
      </span>
      <button class="cx-dock-text-btn" disabled={!canRender} onClick={() => action(conversationId, 'render')} title="Erste Komposition als MP4 nach out/ rendern">
        <Glyph name="download" size={12} /> Rendern
      </button>
      {view === 'live' && state?.phase === 'error' && <button class="cx-icon" title="Vorschau neu starten" aria-label="Vorschau neu starten" onClick={() => action(conversationId, 'restart')}><Glyph name="refresh" size={14} /></button>}
      <button class="cx-icon" title={state?.folder ? `Videoordner im Finder zeigen\n${state.folder}` : 'Videoordner im Finder zeigen'} aria-label="Videoordner im Finder zeigen" disabled={!state || state.phase === 'empty'} onClick={() => action(conversationId, 'reveal')}><Glyph name="folderOpen" size={14} /></button>
    </div>
    <div class="cx-video-body">
      {view === 'live' ? <Live state={state} /> : <Done conversationId={conversationId} videos={state?.videos ?? []} chosen={chosen} onChoose={setChosen} />}
    </div>
  </div>;
}
