import { join } from 'node:path';
import type { ChatLocation, Target } from '@cortex/core';
import { latestClaudeModel } from '../../../core/src/models/catalog.js';
import type { TeamAgent } from '../teams/types.js';
import type { ContextCompaction } from './contextCompaction.js';
import type { HostToWebview, Page } from './protocol.js';
import type { Baseline } from './workspace.js';

export const REPLAYED_KINDS = new Set<HostToWebview['kind']>([
  'userEcho',
  'routing',
  'delta',
  'image',
  'toolUse',
  // A lane's opening and its verdict are worth keeping; the progress ticks in
  // between are live-only and would bloat every stored conversation.
  'agentStart',
  'agentEnd',
  'downgraded',
  'notice',
  'failover',
  'review',
  'tasks',
  'permission',
  'permissionResolved',
  'done',
  'stopped',
  'error',
  'rated',
]);

export interface ConversationRecord {
  id: string;
  title: string;
  /** Archiviert: bleibt gespeichert, erscheint aber nicht mehr in der Leiste. */
  archived?: boolean;
  pinned?: boolean;
  contextCompaction?: ContextCompaction;
  projectPath?: string;
  pinnedTarget?: Target;
  createdAt: number;
  updatedAt: number;
  /** Transcript messages, replayed to hydrate a (re)opened tab. */
  log: HostToWebview[];
  /** Plain turns used to seed engine history after a reload. */
  turns: Array<{ role: 'user' | 'assistant'; text: string; by?: string }>;
  /** Projektstand vor jedem Auftrag, je Antwort — für „Rückgängig machen“. */
  baselines?: Record<string, Baseline>;
  /** Notizzettel: was in diesem Chat feststeht, für jedes Modell, das hier antwortet. */
  notizen?: string;
  /** Standort-Kontext: Mittelpunkt und Radius, auf die sich Ortsfragen dieses Chats beziehen. */
  location?: ChatLocation;
  /** User interactions belong to each concrete widget in this transcript. */
  widgetStates?: Record<string, unknown>;
  /** Provider protocols without an in-turn denial message receive these next turn. */
  pendingPermissionNotes?: string[];
  /** Team membership is frozen for this conversation, including its tool scope. */
  teamAgent?: TeamAgent;
  teamWorkspace?: string;
}

/** So viele Stände bleiben je Chat; ältere Aufträge lassen sich nicht mehr zurücknehmen. */
export const MAX_BASELINES = 20;

export interface Surface {
  mode: 'sidebar' | 'tab' | 'accounts' | 'rules' | 'analytics' | 'agent';
  conversationId?: string;
  /** Erst die Webview bestätigt ihre tatsächlich gerenderte Seite. */
  page?: Page;
}

export const CONV_KEY = 'cortex.conversations';
export const QUEUE_KEY = 'cortex.messageQueues';
export const NATIVE_SESSIONS_KEY = 'cortex.nativeSessions';
export const FORK_POINTS_KEY = 'cortex.forkPoints';
/** Wie viele Chatnachrichten jede Sitzung schon gelesen hat — für das Nachreichen nach Modellwechseln. */
export const SEEN_TURNS_KEY = 'cortex.seenTurns';
export const TASK_BRIEFS_KEY = 'cortex.taskBriefs';
export const SYSTEM_BRIEFS_KEY = 'cortex.systemBriefs';
export const PINNED_KEY = 'cortex.pinnedTarget';
export const APP_SETTINGS_KEY = 'cortex.appSettings';
/** Vorgabe, solange im Modellknopf nichts gewählt ist: das neueste Opus. */
export const defaultModel = () => latestClaudeModel('opus') ?? 'claude-opus-5-5';
export const MAX_CONVERSATIONS = 50;

/** Eine Kennung, die gefahrlos Teil eines Pfads werden darf. */
export const SAFE_ID = /^[\w-]{1,80}$/;

/** Der Arbeitsordner eines Chats ohne Projekt, im Speicher der Erweiterung. */
export function projectlessDir(storage: string, id: string): string {
  return join(storage, 'projectless', id);
}
