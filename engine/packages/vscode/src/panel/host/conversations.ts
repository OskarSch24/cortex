import type * as vscode from 'vscode';
import { searchConversations } from '../conversationSearch.js';
import type { WebviewToHost } from '../protocol.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was die Chat-Knöpfe vom Provider brauchen. Die Chats selbst — anlegen,
 * binden, archivieren, verdichten — bleiben am Provider: Tests rufen und
 * ersetzen diese Methoden dort.
 */
export interface ConversationsHost extends PanelHost {
  newConversation(projectPath?: string): void;
  deleteConversation(id: string): void;
  bindAgent(id: string): void;
  openConversationTab(id: string): void;
  chatCommand(id: string, action: Extract<WebviewToHost, { kind: 'chatCommand' }>['action']): Promise<void>;
  restoreConversation(id: string): Promise<void>;
}

type ConversationKind =
  | 'getWidgetState' | 'setWidgetState' | 'searchConversations' | 'newConversation' | 'openConversation'
  | 'deleteConversation' | 'chatCommand' | 'restoreConversation' | 'rateAnswer';

const widgetState = async (msg: Extract<WebviewToHost, { kind: 'getWidgetState' | 'setWidgetState' }>, webview: vscode.Webview, host: ConversationsHost) => {
  const rec = host.conversations.get(msg.conversationId);
  if (!rec || !/^[\w.:/-]{1,240}$/.test(msg.key)) return;
  if (msg.kind === 'setWidgetState') {
    const encoded = JSON.stringify(msg.value);
    if (encoded === undefined || encoded.length > 16_000) return;
    rec.widgetStates = { ...rec.widgetStates, [msg.key]: JSON.parse(encoded) };
    await host.persistNow();
  }
  host.post(webview, { kind: 'widgetState', conversationId: rec.id, key: msg.key, value: rec.widgetStates?.[msg.key] });
};

/** Chats: öffnen, suchen, löschen, die Befehle aus dem Chat-Menü und der Zustand der Widgets im Verlauf. */
export const conversationTable = {
  getWidgetState: (msg, { webview }, host) => widgetState(msg, webview, host),
  setWidgetState: (msg, { webview }, host) => widgetState(msg, webview, host),
  searchConversations: (msg, { webview }, host) => {
    host.post(webview, { kind: 'conversationSearch', requestId: msg.requestId, hits: searchConversations([...host.conversations.values()], msg.query.slice(0, 2000), msg.excludedProjects) });
  },
  newConversation: (msg, _cx, host) => {
    host.newConversation(msg.projectPath);
  },
  openConversation: (msg, { surface }, host) => {
    if (surface.mode === 'agent') host.bindAgent(msg.id);
    else host.openConversationTab(msg.id);
  },
  deleteConversation: (msg, _cx, host) => {
    host.deleteConversation(msg.id);
  },
  chatCommand: async (msg, { surface }, host) => {
    if (surface.conversationId) await host.chatCommand(surface.conversationId, msg.action);
  },
  restoreConversation: async (msg, _cx, host) => {
    await host.restoreConversation(msg.id);
  },
  rateAnswer: async (msg, { surface }, host) => {
    // The verdict lives in the metric the router learns from, and in the
    // conversation log so reopening it still shows what you pressed.
    await host.metrics.markRatedPoor(msg.messageId, msg.poor);
    if (surface.conversationId) {
      host.toConversation(surface.conversationId, { kind: 'rated', messageId: msg.messageId, poor: msg.poor });
    }
  },
} satisfies DomainTable<ConversationKind, ConversationsHost>;
