/**
 * Die Excalidraw-Zeichenfläche als Reiter im Dock.
 *
 * Jeder Chat hat seine eigene Zeichnung; der Host bewahrt sie auf
 * (`canvasLoad` / `canvasSave`). Solange die Fläche im Dock liegt, geht ihr
 * Inhalt als Text mit jeder Nachricht an das Modell — es sieht also auch, was
 * der Nutzer von Hand ergänzt hat. Wird der Reiter geschlossen, sieht es sie
 * nicht mehr.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { loadCanvasLib, onJobs, pageTheme, registerCanvas, reportResult, takeJobs, type CanvasHandle } from '../canvas/client.js';

export function CanvasView({ conversationId, hidden }: { conversationId: string; hidden?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const handle = useRef<CanvasHandle>();
  const applied = useRef<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | { error: string }>('loading');

  useEffect(() => {
    let alive = true;
    let mounted: CanvasHandle | undefined;
    let starting = false;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus('loading');
    const save = (scene: string, description: string) => {
      vscode.postMessage({ kind: 'canvasSave', conversationId, scene, description, applied: applied.current.slice(-200) });
    };
    // Ein Block gilt erst als gezeichnet, wenn er wirklich auf der Fläche
    // steht — `apply` wartet das Anordnen ab. Was dabei schiefgeht, steht
    // danach auf der Karte im Verlauf und geht nicht mehr stumm verloren.
    let draining = false;
    const drain = async () => {
      const board = mounted;
      if (!board || draining) return;
      draining = true;
      let drew = false;
      try {
        // Während des Wartens kommen neue Aufträge dazu: erst aufhören, wenn
        // die Warteschlange dieses Chats wirklich leer ist.
        for (let batch = takeJobs(conversationId); batch.length; batch = takeJobs(conversationId)) {
          for (const job of batch) {
            if (!job.force && applied.current.includes(job.key)) { reportResult(job.key, { state: 'stand-schon' }); continue; }
            const result = await board.apply(job.code);
            reportResult(job.key, result.ok ? { state: 'gezeichnet', count: result.count } : { state: 'fehler', error: result.error });
            if (result.ok) { applied.current = [...applied.current.filter(k => k !== job.key), job.key]; drew = true; }
          }
        }
      } finally {
        draining = false;
      }
      // Excalidraw meldet die Änderung selbst; gesichert wird hier trotzdem,
      // damit der gezeichnete Block als erledigt gilt, auch wenn sich nichts
      // sichtbar verschob.
      if (drew) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => mounted && save(mounted.json(), mounted.describe()), 900);
      }
    };
    const onMessage = async (event: MessageEvent<HostToWebview>) => {
      const msg = event.data;
      if (msg?.kind !== 'canvasScene' || msg.conversationId !== conversationId || mounted || starting) return;
      starting = true;
      try {
        const lib = await loadCanvasLib();
        if (!alive || !box.current) return;
        applied.current = msg.applied ?? [];
        mounted = lib.mount(box.current, { scene: msg.scene, theme: pageTheme(), onChange: save, onExport: format => void exportRef.current(format) });
        handle.current = mounted;
        registerCanvas(conversationId, mounted);
        setStatus('ready');
        // Ab jetzt sieht das Modell die Fläche — auch eine leere.
        vscode.postMessage({ kind: 'canvasVisible', conversationId, description: mounted.describe() });
        void drain();
      } catch (e) {
        if (alive) setStatus({ error: (e as Error).message });
      }
    };
    window.addEventListener('message', onMessage);
    const stop = onJobs(() => void drain());
    vscode.postMessage({ kind: 'canvasLoad', conversationId });
    // Ein Wechsel zwischen hellem und dunklem Thema kommt als Klasse am Body.
    const watch = new MutationObserver(() => mounted?.setTheme(pageTheme()));
    watch.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => {
      alive = false;
      stop();
      watch.disconnect();
      window.removeEventListener('message', onMessage);
      clearTimeout(saveTimer);
      if (mounted) {
        save(mounted.json(), mounted.describe());
        mounted.destroy();
      }
      handle.current = undefined;
      registerCanvas(conversationId, undefined);
      vscode.postMessage({ kind: 'canvasVisible', conversationId, description: null });
    };
  }, [conversationId]);

  const exportRef = useRef<(format: 'excalidraw' | 'svg') => Promise<void>>(async () => undefined);
  const exportAs = async (format: 'excalidraw' | 'svg') => {
    const h = handle.current;
    if (!h) return;
    const content = format === 'svg' ? await h.exportSvg() : h.json();
    if (content) vscode.postMessage({ kind: 'canvasExport', conversationId, format, content });
  };
  exportRef.current = exportAs;

  return <div class="cx-canvas" hidden={hidden}>
    <div class="cx-dock-head cx-canvas-head">
      {/* Emoji und SVG stehen als Werkzeuge in Excalidraws Leiste (canvas/toolbar.tsx). */}
      <span class="cx-canvas-seen" title="Solange dieser Reiter offen ist, geht die Zeichnung als Text mit jeder Nachricht an die KI.">
        <span class="cx-canvas-dot" aria-hidden="true" />KI sieht mit
      </span>
      <span class="cx-dock-gap" />
      <button class="cx-dock-text-btn" disabled={status !== 'ready'} onClick={() => void exportAs('excalidraw')}>Sichern unter …</button>
    </div>
    <div class="cx-canvas-stage">
      <div class="cx-canvas-host" ref={box} />
      {status === 'loading' && <p class="cx-dock-note cx-canvas-note">Zeichenfläche wird geladen …</p>}
      {typeof status === 'object' && <p class="cx-dock-note cx-canvas-note" role="alert">{status.error}</p>}
    </div>
  </div>;
}
