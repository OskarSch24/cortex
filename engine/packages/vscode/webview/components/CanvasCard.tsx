/**
 * Ein `cortex-excalidraw`-Block im Verlauf.
 *
 * Die Zeichnung selbst entsteht im Dock; hier steht nur, dass und was
 * gezeichnet wurde. Auf die Fläche bringt einen Block, der gerade eintrifft,
 * AgentApp — am Antworttext, nicht an dieser Karte, denn die wird beim
 * Abschluss der Antwort neu aufgebaut. Ein alter Block aus dem Verlauf wird
 * erst auf Knopfdruck noch einmal gezeichnet.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { blockKey, onResults, resultOf, type CanvasHost } from '../canvas/client.js';
import { parseCanvas, specSize, type CanvasSpec } from '../canvas/spec.js';
import { Glyph } from './CortexIcons.js';

function summary(spec: CanvasSpec): string {
  const n = specSize(spec);
  const verb = spec.mode === 'add' ? 'ergänzt' : '';
  const what = spec.layout === 'mindmap' ? `Mindmap · ${n} Knoten`
    : spec.layout === 'flow' ? `Diagramm · ${n} Knoten`
    : spec.layout === 'free' ? `Zeichnung · ${n} ${n === 1 ? 'Element' : 'Elemente'}`
    : spec.layout === 'map' ? `Karte · ${spec.region.join(', ')}${n ? ` · ${n} ${n === 1 ? 'Ort' : 'Orte'}` : ''}`
    : '';
  const removed = spec.remove.length ? `${spec.remove.length} entfernt` : '';
  return [what, verb, removed].filter(Boolean).join(' · ');
}

export function CanvasCard({ code, streaming, host, fallback }: {
  code: string;
  /** Der Block ist noch nicht geschlossen. */
  streaming: boolean;
  host: CanvasHost;
  fallback: (reason: string) => ComponentChildren;
}) {
  const body = code.trim();
  const key = useMemo(() => blockKey(body), [body]);
  const parsed = useMemo(() => (streaming ? undefined : parseCanvas(body)), [body, streaming]);
  const [, bump] = useState(0);
  useEffect(() => onResults(() => bump(n => n + 1)), []);

  if (streaming) {
    return <div class="cx-change-card cx-canvas-card pending" role="status">
      <div class="cx-change-head">
        <span class="cx-change-mark" aria-hidden="true"><Glyph name="canvas" size={14} /></span>
        <span class="cx-change-title"><strong>Zeichnung entsteht …</strong><span class="cx-change-sub">Excalidraw</span></span>
      </div>
    </div>;
  }
  if (!parsed?.ok) return <>{fallback(parsed?.error ?? 'Zeichnung unlesbar')}</>;
  const result = resultOf(key);
  // Was aus dem Block geworden ist, steht in der Unterzeile: gezeichnet,
  // wartend oder gescheitert. Nichts davon bleibt unsichtbar.
  const sub = result?.state === 'fehler' ? `Nicht gezeichnet: ${result.error}`
    : result?.state === 'wartet' ? <>{summary(parsed.spec)} · <span class="cx-canvas-waiting">wartet auf die Fläche</span></>
    : result ? <>{summary(parsed.spec)} · <span class="cx-canvas-on">auf der Fläche</span></>
    : summary(parsed.spec);
  return <div class="cx-change-card cx-canvas-card">
    <div class="cx-change-head">
      <span class="cx-change-mark" aria-hidden="true"><Glyph name="canvas" size={14} /></span>
      <span class="cx-change-title">
        <strong>{parsed.spec.title ?? 'Excalidraw'}</strong>
        <span class="cx-change-sub">{sub}</span>
      </span>
      <button class="cx-change-review cx-canvas-again" title="Diesen Stand noch einmal auf die Fläche zeichnen" onClick={() => host.draw(body, key, true)}>Neu zeichnen</button>
      <button class="cx-change-review" onClick={() => host.open()}>Ansehen</button>
    </div>
  </div>;
}
