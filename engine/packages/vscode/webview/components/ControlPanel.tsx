import { useState } from 'preact/hooks';
import type { TranscriptItem } from '../../src/panel/transcript.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';
import { conversationImages, type WorkspaceImage } from './imageWorkspaceState.js';

/**
 * `onOpen` ist derselbe Weg wie ein Dateilink im Verlauf: Projektdateien gehen
 * rechts im Dock auf, HTML dort als echte Seite; der Rest im Editor daneben.
 */
/** Ab hier wird eine Liste zusammengefaltet, damit die Abschnitte darunter sichtbar bleiben. */
const VISIBLE = 5;

export function ControlPanel({ items, onOpen, onCreate, onClose, onImage }: { items: TranscriptItem[]; onOpen: (path: string) => void; onCreate: () => void; onClose: () => void; onImage?: (image: WorkspaceImage) => void }) {
  const [allSources, setAllSources] = useState(false);
  const [allOutputs, setAllOutputs] = useState(false);
  const images = conversationImages(items);
  const outputs = new Set<string>();
  const sources = new Set<string>();
  const agents = new Map<string, { label: string; activity?: string }>();
  for (const item of items) {
    if (item.kind === 'user') for (const path of item.attachments ?? []) sources.add(path);
    if (item.kind !== 'assistant') continue;
    for (const segment of item.segments) {
      if (segment.kind === 'tools') for (const step of segment.steps) {
        if (step.path && (step.action === 'write' || step.action === 'edit')) outputs.add(step.path);
        if (step.path && step.action === 'read') sources.add(step.path);
      }
      if (segment.kind === 'agents') for (const lane of segment.lanes) {
        // Ein Hintergrund-Agent überlebt die Antwort, die ihn gestartet hat —
        // genau dafür wurde er im Hintergrund gestartet. Das Ende des Turns
        // darf ihn hier also nicht ausblenden. Ein abgebrochener Lauf reißt
        // seine Kinder dagegen mit: dann ist die Zeile eine Lüge.
        if (lane.background && lane.status === 'running' && !item.stopped) {
          agents.set(lane.id, { label: lane.label, activity: lane.activity });
        }
      }
    }
  }
  const fileRow = (path: string) => <button class="cx-control-row" title={path} onClick={() => onOpen(path)}><Glyph name="file" size={17} /><span>{path.split('/').pop()}</span></button>;
  /**
   * Eine lange Liste schiebt sonst die Abschnitte darunter aus dem Panel: das
   * Panel scrollt zwar, aber niemand sucht dort nach den Hintergrundprozessen.
   */
  const moreRow = (count: number, expanded: boolean, toggle: () => void) => count > VISIBLE
    ? <button class="cx-control-row cx-control-more" onClick={toggle}><Glyph name="link" size={17} /><span>{expanded ? 'Weniger anzeigen' : `Alle anzeigen (${count})`}</span></button>
    : null;
  return <aside class={`cx-control-panel ${images.length ? 'has-images' : ''}`} aria-label="Chat-Control-Panel">
    <div class="cx-control-heading"><span>Ausgaben</span><button class="cx-icon" title="Datei oder Website erstellen" aria-label="Datei oder Website erstellen" onClick={onCreate}><Glyph name="plus" size={20} /></button><button class="cx-icon cx-control-close" aria-label="Control Panel schließen" onClick={onClose}><Glyph name="close" size={15} /></button></div>
    {[...outputs].slice(0, allOutputs ? undefined : VISIBLE).map(fileRow)}
    {moreRow(outputs.size, allOutputs, () => setAllOutputs(!allOutputs))}
    {images.map(image => <button key={image.path} class="cx-control-row" onClick={() => onImage?.(image)}><img class="cx-control-image" src={image.src} alt="" /><span>Generiertes Bild</span></button>)}
    {!outputs.size && !images.length && <button class="cx-control-empty-action" onClick={onCreate}>Datei oder Website erstellen</button>}
    {(!images.length || agents.size > 0) && <section><div class="cx-control-heading">Hintergrundprozesse</div>
      {[...agents].map(([id, agent]) => <div key={id} class="cx-control-row" title={agent.activity}><Glyph name="terminal" size={17} /><span>{agent.label}</span><span class="cx-dot" /></div>)}
      {!agents.size && <p class="cx-control-empty">Keine gemeldeten Hintergrundprozesse</p>}
    </section>}
    <section><div class="cx-control-heading"><span>Quellen</span><button class="cx-icon" title="Quellen hinzufügen" aria-label="Quellen hinzufügen" onClick={() => vscode.postMessage({ kind: 'pickAttachments' })}><Glyph name="plus" size={20} /></button></div>
      {[...sources].slice(0, allSources ? undefined : VISIBLE).map(fileRow)}
      {!sources.size && <p class="cx-control-empty">{images.length ? 'Dateien anhängen oder Apps verbinden' : 'Anhänge und gelesene Dateien erscheinen hier.'}</p>}
      {moreRow(sources.size, allSources, () => setAllSources(!allSources))}
    </section>
  </aside>;
}
