import { useEffect, useRef, useState } from 'preact/hooks';
import type { ConversationMeta, HostToWebview } from '../../src/panel/protocol.js';
import type { ConversationHit } from '../../src/panel/conversationSearch.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

export function ConversationSearch({ conversations, archived, onChoose, onClose }: { conversations: ConversationMeta[]; archived: string[]; onChoose: (id: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ConversationHit[]>([]);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const id = ++sequence.current;
    setHits([]);
    setPending(!!query.trim());
    const receive = (event: MessageEvent<HostToWebview>) => {
      if (event.data?.kind === 'conversationSearch' && event.data.requestId === id && sequence.current === id) {
        setHits(event.data.hits); setPending(false);
      }
    };
    window.addEventListener('message', receive);
    const timer = setTimeout(() => vscode.postMessage({ kind: 'searchConversations', query, excludedProjects: archived, requestId: id }), 160);
    return () => { clearTimeout(timer); window.removeEventListener('message', receive); };
  }, [query, archived.join('\n')]);
  const visible = query.trim() ? hits : conversations.filter(c => !c.projectPath || !archived.includes(c.projectPath));
  return <div class="cx-modal-backdrop" onClick={onClose}><section class="cx-search-dialog" role="dialog" aria-modal="true" aria-label="Aufgaben suchen" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <div class="cx-search-input"><Glyph name="search" size={18} /><input ref={input} aria-label="Suchbegriff" placeholder="Titel, Nachrichten und Code durchsuchen …" value={query} onInput={e => setQuery(e.currentTarget.value)} /><button class="cx-icon" aria-label="Suche schließen" onClick={onClose}>Esc</button></div>
    <div class="cx-search-results" aria-busy={pending}>{visible.map(c => <button key={c.id} onClick={() => onChoose(c.id)}><Glyph name="chat" /><span>{c.title || 'Neue Aufgabe'}<small>{('snippet' in c && c.snippet) || c.projectPath?.split('/').pop() || 'Kein Projekt'}</small></span>{c.running && <span class="cx-dot" />}</button>)}{!pending && !visible.length && <p>Keine passende Aufgabe gefunden.</p>}{pending && <p role="status">Nachrichten werden durchsucht …</p>}</div>
  </section></div>;
}
