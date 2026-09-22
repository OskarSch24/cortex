import { useState } from 'preact/hooks';
import type { QueuedMessageDto } from '../../src/panel/protocol.js';
import { vscode } from '../vscodeApi.js';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup.js';
import { Glyph } from './CortexIcons.js';

function QueueRow({ item, index, count }: { item: QueuedMessageDto; index: number; count: number }) {
  const [menu, setMenu] = useState(false);
  const [position, setPosition] = useState({ left: 0, bottom: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const menuRef = useDismissiblePopup<HTMLDivElement>(menu, () => setMenu(false));
  const action = (action: 'remove' | 'up' | 'down' | 'steer') => { setMenu(false); vscode.postMessage({ kind: 'queueAction', id: item.id, action }); };
  const edit = () => { setMenu(false); setDraft(item.text); setEditing(true); };
  const attachment = item.attachments[0];
  return <div class={`cx-queued-item ${editing ? 'editing' : ''}`} role="listitem" aria-label={`Wartende Nachricht ${index + 1}`}>
    <div class="cx-queued-row"><Glyph name="queue" size={16} />
      {attachment && <span class="cx-queued-attachment" title={item.attachments.map(a => a.name).join('\n')}>{attachment.preview ? <img src={attachment.preview} alt={attachment.name} /> : <Glyph name="file" size={19} />}{item.attachments.length > 1 && <small>+{item.attachments.length - 1}</small>}</span>}
      <button class="cx-queued-text" title={item.text} onClick={edit}>{item.text}</button>
      <button class="cx-queue-steer" title={item.canSteer ? 'Jetzt an den laufenden Agenten senden' : item.steerReason ?? 'Steuern erfordert einen laufenden Agenten mit demselben Modell und denselben Berechtigungen'} disabled={!item.canSteer} onClick={() => action('steer')}><Glyph name="steer" size={15} /><span>Steuern</span></button>
      <button class="cx-icon" title="Nachricht entfernen" aria-label="Nachricht entfernen" onClick={() => action('remove')}><Glyph name="trash" size={15} /></button>
      <div class="cx-queue-menu" ref={menuRef}><button class="cx-icon" aria-label="Weitere Nachrichtenaktionen" aria-haspopup="menu" aria-expanded={menu} onClick={e => { const box = e.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(12, Math.min(innerWidth - 232, box.right - 220)), bottom: innerHeight - box.top + 5 }); setMenu(!menu); }}><Glyph name="more" size={15} /></button>
        {menu && <div class="cx-tools-popup" style={position} role="menu" aria-label="Nachrichtenaktionen"><button role="menuitem" onClick={edit}><Glyph name="edit" /><span>Bearbeiten</span></button><button role="menuitem" disabled={index === 0} onClick={() => action('up')}>Nach oben</button><button role="menuitem" disabled={index === count - 1} onClick={() => action('down')}>Nach unten</button></div>}
      </div>
    </div>
    {editing && <form class="cx-queue-edit" onSubmit={e => { e.preventDefault(); if (!draft.trim()) return; vscode.postMessage({ kind: 'editQueuedMessage', id: item.id, text: draft }); setEditing(false); }}><textarea autoFocus aria-label="Wartende Nachricht bearbeiten" value={draft} onInput={e => setDraft(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditing(false); } }} /><div><button type="button" onClick={() => setEditing(false)}>Abbrechen</button><button type="submit" disabled={!draft.trim()}>Speichern</button></div></form>}
  </div>;
}
export function QueuedMessages({ items, paused, pauseReason }: { items: QueuedMessageDto[]; paused: boolean; pauseReason?: 'error' | 'stopped' | 'restored' | 'project' }) {
  if (!items.length) return null;
  const reason = pauseReason === 'project' ? 'Ein anderer Chat arbeitet in diesem Ordner. Danach geht es automatisch weiter' : pauseReason === 'restored' ? 'Nach dem Neustart' : pauseReason === 'error' ? 'Nach einem Fehler' : 'Nach dem Anhalten';
  return <section class="cx-message-queue" aria-label="Nachrichten-Warteschlange"><div class="cx-queued-list" role="list">{items.map((item, index) => <QueueRow key={item.id} item={item} index={index} count={items.length} />)}</div>{paused && <div class="cx-queue-paused" role="status"><span>{reason}: {items.length} {items.length === 1 ? 'Nachricht wartet' : 'Nachrichten warten'}.</span><button onClick={() => vscode.postMessage({ kind: 'resumeQueue' })}>Warteschlange fortsetzen<Glyph name="arrow" size={14} /></button><button onClick={() => vscode.postMessage({ kind: 'clearQueue' })}>Leeren</button></div>}</section>;
}
