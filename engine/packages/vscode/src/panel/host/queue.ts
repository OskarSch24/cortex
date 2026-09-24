import type { PermissionDecision, PermissionMode, Target } from '@cortex/core';
import { isImageProvider, sanitizeImageOptions } from '../images.js';
import type { MessageQueue, QueuedMessage } from '../messageQueue.js';
import { tagsOf } from '../tags.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was Senden, Warteschlange und Berechtigungen vom Provider brauchen. Die
 * Warteschlange, laufende Aufträge und alle Schritte eines Laufs bleiben am
 * Provider: Tests setzen und ersetzen sie dort.
 */
export interface QueueHost extends PanelHost {
  readonly queues: MessageQueue;
  readonly tasks: Map<string, AbortController>;
  readonly compactingChats: Map<string, AbortController>;
  handleSend(id: string, text: string, tags: string[], modes?: QueuedMessage['modes']): Promise<void>;
  shownTarget(id?: string): Target | undefined;
  markStopped(conversationId: string, reason?: string): void;
  steerQueuedMessage(id: string, itemId: string): Promise<void>;
  retryLast(conversationId: string): Promise<void>;
  answerPermission(conversationId: string, id: string, decision: PermissionDecision): void;
}

type QueueKind =
  | 'send' | 'cancel' | 'queueAction' | 'editQueuedMessage' | 'resumeQueue' | 'clearQueue' | 'retryLast' | 'permissionDecision';

/** Senden, Anhalten und die Warteschlange eines Chats — dazu die Antwort auf eine Berechtigungsfrage. */
export const queueTable = {
  permissionDecision: (msg, { surface }, host) => {
    // The surface knows which conversation it belongs to; the webview
    // never has to track it.
    if (surface.conversationId) {
      host.answerPermission(surface.conversationId, msg.id, msg.decision);
    }
  },
  cancel: (_msg, { surface }, host) => {
    if (surface.conversationId) {
      host.compactingChats.get(surface.conversationId)?.abort();
      host.queues.pause(surface.conversationId);
      host.tasks.get(surface.conversationId)?.abort();
      host.markStopped(surface.conversationId, 'stopped by you');
      host.toConversation(surface.conversationId, { kind: 'busy', running: false }, { log: false });
      host.sendConversations();
    }
  },
  queueAction: async (msg, { surface }, host) => {
    const id = surface.conversationId; if (!id) return;
    if (msg.action === 'remove') host.queues.remove(id, msg.id);
    else if (msg.action === 'up' || msg.action === 'down') host.queues.move(id, msg.id, msg.action === 'up' ? -1 : 1);
    else if (msg.action === 'steer') await host.steerQueuedMessage(id, msg.id);
    await host.persistNow();
  },
  editQueuedMessage: async (msg, { surface }, host) => {
    if (surface.conversationId) { host.queues.edit(surface.conversationId, msg.id, msg.text, tagsOf(msg.text)); await host.persistNow(); }
  },
  resumeQueue: (_msg, { surface }, host) => {
    if (surface.conversationId) host.queues.resume(surface.conversationId);
  },
  clearQueue: async (_msg, { surface }, host) => {
    if (surface.conversationId) { host.queues.clearPending(surface.conversationId); await host.persistNow(); }
  },
  retryLast: (_msg, { surface }, host) => {
    if (surface.conversationId) void host.retryLast(surface.conversationId);
  },
  send: async (msg, { surface }, host) => {
    if (surface.conversationId) {
      await host.handleSend(surface.conversationId, msg.text, msg.tags, {
        permissionMode: msg.permissionMode as PermissionMode | undefined,
        askPermission: msg.askPermission,
        effort: msg.effort,
        routingMode: msg.routingMode,
        attachments: msg.attachments,
        image: sanitizeImageOptions(msg.image),
        imageProvider: msg.image && isImageProvider(msg.imageProvider) ? msg.imageProvider : undefined,
        target: msg.image ? undefined : msg.target
          ? {
              provider: msg.target.provider as Target['provider'],
              account: msg.target.account,
              model: msg.target.model,
            }
          : host.shownTarget(surface.conversationId),
      });
    }
  },
} satisfies DomainTable<QueueKind, QueueHost>;
