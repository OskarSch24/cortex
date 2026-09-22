import { useState } from 'preact/hooks';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { Button, Empty, Search, Select } from '../ui.js';

/** Chat- und Projektarchive bleiben getrennt wiederherstellbar. */
export function ArchivPage({ ctx }: { ctx: SettingsContext }) {
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState('alle');
  const [project, setProject] = useState('alle');
  const archived = ctx.projects.filter(p => ctx.archived.includes(p.path));
  const q = query.trim().toLowerCase();
  const archivedChats = ctx.archivedChats ?? [];
  const matchingChats = archivedChats.filter(c => (project === 'alle' || c.projectPath === project) && chats === 'alle' && (!q || c.title.toLowerCase().includes(q)));
  const restore = (id: string) => vscode.postMessage({ kind: 'restoreConversation', id });
  const groups = archived
    .filter(p => project === 'alle' || p.path === project)
    .map(p => ({ project: p, list: ctx.conversations.filter(c => c.projectPath === p.path && (chats === 'alle' || (chats === 'laufend' && c.running))).filter(c => !q || c.title.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)) }))
    .filter(g => !q || g.list.length || g.project.name.toLowerCase().includes(q));
  return <div class="cxs-page">
    <header class="cxs-page-head">
      <div><h1>Archivierte Chats und Projekte</h1></div>
      <div class="cxs-page-actions"><Button icon="unarchive" disabled={!archived.length && !archivedChats.length} onClick={() => { archived.forEach(ctx.onArchive); archivedChats.forEach(c => restore(c.id)); }}>Alle dearchivieren</Button></div>
    </header>
    <div class="cxs-filterbar">
      <Search value={query} onInput={setQuery} placeholder="Archivierte Chats und Projekte durchsuchen" />
      <Select label="Chats" value={chats} onChange={setChats} align="left" width={144} icon={<Glyph name="filter" size={14} />} options={[{ value: 'alle', label: 'Alle Chats' }, { value: 'laufend', label: 'Laufende Chats' }]} />
      <Select label="Projekte" value={project} onChange={setProject} align="right" width={176} icon={<Glyph name="folder" size={14} />} options={[{ value: 'alle', label: 'Alle Projekte' }, ...ctx.projects.map(p => ({ value: p.path, label: p.name }))]} />
    </div>
    {matchingChats.length > 0 && <section class="cxs-archive-group" aria-label="Archivierte Chats">
      <div class="cxs-archive-head"><Glyph name="archive" size={16} /><strong>Chats</strong><span>{matchingChats.length}</span></div>
      <div class="cxs-card">{matchingChats.map(chat => <div class="cxs-archive-row" key={chat.id}>
        <div class="cxs-archive-open static"><strong>{chat.title || 'Neue Aufgabe'}</strong><small>{new Date(chat.updatedAt).toLocaleString('de-DE')}</small></div>
        <Button onClick={() => restore(chat.id)}>Chat wiederherstellen</Button>
      </div>)}</div>
    </section>}
    {groups.map(({ project: p, list }) => <section class="cxs-archive-group" key={p.path}>
      <div class="cxs-archive-head">
        <Glyph name="folder" size={16} />
        <strong>{p.name}</strong>
        <span>{list.length === 1 ? '1 Chat' : `${list.length} Chats`}</span>
        <button type="button" class="cxs-icon-button" aria-label={`${p.name} im Finder zeigen`} title="Im Finder zeigen" onClick={() => vscode.postMessage({ kind: 'revealProject', path: p.path })}><Glyph name="dots" size={15} /></button>
      </div>
      <div class="cxs-card">
        {list.map(c => <div class="cxs-archive-row" key={c.id}>
          <button type="button" class="cxs-archive-open" onClick={() => ctx.openTask(c.id)}><strong>{c.title === 'New chat' || !c.title ? 'Neue Aufgabe' : c.title}</strong><small>{new Date(c.updatedAt).toLocaleString('de-DE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></button>
          <button type="button" class="cxs-icon-button" aria-label={`Chat löschen: ${c.title}`} title="Chat löschen" onClick={() => vscode.postMessage({ kind: 'deleteConversation', id: c.id })}><Glyph name="trash" size={14} /></button>
          <Button onClick={() => ctx.onArchive(p)}>Dearchivieren</Button>
        </div>)}
        {!list.length && <div class="cxs-archive-row"><div class="cxs-archive-open static"><strong>Keine Chats</strong><small>Das Projekt ist archiviert, hat aber keine Aufgaben</small></div><Button onClick={() => ctx.onArchive(p)}>Dearchivieren</Button></div>}
      </div>
    </section>)}
    {!archived.length && !archivedChats.length && <Empty>Noch nichts archiviert. Chats lassen sich über /archive, Projekte über die Seitenleiste archivieren.</Empty>}
    {(archived.length > 0 || archivedChats.length > 0) && !groups.length && !matchingChats.length && <Empty>Keine Treffer</Empty>}
  </div>;
}
