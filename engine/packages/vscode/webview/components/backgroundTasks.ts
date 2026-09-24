import type { ConversationMeta } from '../../src/panel/protocol/dtos.js';

/**
 * Rollen-Chats eines Schwarms stehen direkt unter dem Chat, der ihn gestartet
 * hat — sie sind Hintergrundprozesse, keine eigenen Aufgaben. Ist der
 * Ursprungs-Chat nicht in derselben Liste, bleibt die Rolle an ihrem Platz.
 */
export function nestBackground<T extends Pick<ConversationMeta, 'id' | 'parentId'>>(list: T[]): Array<T & { nested?: boolean }> {
  const ids = new Set(list.map(entry => entry.id));
  const children = new Map<string, T[]>();
  for (const entry of list) {
    if (entry.parentId && entry.parentId !== entry.id && ids.has(entry.parentId)) children.set(entry.parentId, [...(children.get(entry.parentId) ?? []), entry]);
  }
  const out: Array<T & { nested?: boolean }> = [];
  for (const entry of list) {
    if (entry.parentId && ids.has(entry.parentId) && entry.parentId !== entry.id) continue;
    out.push(entry);
    for (const child of children.get(entry.id) ?? []) out.push({ ...child, nested: true });
  }
  return out;
}
