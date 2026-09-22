import type { ConversationMeta } from './protocol.js';
export interface SearchableConversation { id: string; title: string; updatedAt: number; projectPath?: string; archived?: boolean; turns: Array<{ text: string }> }
export type ConversationHit = ConversationMeta & { snippet?: string };
export function searchConversations(records: SearchableConversation[], query: string, excludedProjects: string[] = []): ConversationHit[] {
  const needle = query.trim().toLocaleLowerCase();
  const excluded = new Set(excludedProjects);
  const hits: ConversationHit[] = [];
  for (const record of [...records].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (record.archived || (record.projectPath && excluded.has(record.projectPath))) continue;
    const titleMatch = record.title.toLocaleLowerCase().includes(needle);
    const turn = needle ? record.turns.find(t => t.text.toLocaleLowerCase().includes(needle)) : undefined;
    if (!titleMatch && !turn) continue;
    let snippet: string | undefined;
    if (turn) {
      const at = turn.text.toLocaleLowerCase().indexOf(needle), start = Math.max(0, at - 55);
      snippet = `${start ? '…' : ''}${turn.text.slice(start, start + 180).replace(/\s+/g, ' ')}${start + 180 < turn.text.length ? '…' : ''}`;
    }
    hits.push({ id: record.id, title: record.title, projectPath: record.projectPath, updatedAt: record.updatedAt, snippet });
    if (hits.length >= 60) break;
  }
  return hits;
}
