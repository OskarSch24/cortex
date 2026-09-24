/** Datenformen, die beide Richtungen der Panel-Nachrichten teilen. */
import type { ProviderId, Target, UsageWindow } from '@cortex/core';

export interface QueuedMessageDto {
  id: string;
  text: string;
  canSteer: boolean;
  /** Warum „Steuern“ gerade nicht geht — Klartext für die Schaltfläche. */
  steerReason?: string;
  attachments: Array<{ name: string; path: string; preview?: string }>;
}

export interface AccountStatusDto {
  id: string;
  provider: ProviderId;
  label: string;
  authMode: string;
  available: boolean;
  resetAt?: number;
  usage?: UsageWindow[];
  models: import('../../../../core/src/models/catalog.js').ModelOption[];
  /** Login identity (email/username) when detectable from CLI state. */
  identity?: string;
  homeDir?: string;
  /** Watchdog: isolated CLI profile still signed in. */
  authState?: 'ok' | 'expired' | 'unknown';
  /**
   * Reviews other providers' work but is never routed a task. The panel keeps
   * these out of anything that implies "send this here" — pills, @mentions.
   */
  reviewOnly?: boolean;
  /** Nur OpenRouter: das Modell, das antwortet, wenn Chat oder Agent keins nennen. */
  defaultModel?: string;
  /** Nur Codex und Grok: Platz in der Kontofolge des Bildmodus, 0 kommt zuerst. */
  imageRank?: number;
}

/** Die Stelle in der Sitzung eines Anbieters, an der eine Antwort endete. */
export interface TurnCheckpoint {
  target: Target;
  cwd: string;
  sessionId: string;
  /** Claude: uuid der letzten Antwortnachricht. Codex: die Kennung des Zugs. */
  anchor: string;
}

export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: number;
  running?: boolean;
  projectPath?: string;
  target?: Target;
  pinned?: boolean;
  archived?: boolean;
  /** Von einer Team- oder Schwarm-Rolle geführt: ein Hintergrundprozess, kein Hauptchat. */
  background?: boolean;
  /** Der Chat, der den Schwarm dieser Rolle gestartet hat. */
  parentId?: string;
}

/** Ein fertig gerendertes Video im Videoordner eines Chats. */
export interface RemotionVideoDto {
  name: string;
  /** Relativ zum Videoordner, etwa `out/Intro.mp4`. */
  file: string;
  /** Ausgeliefert über den Vorschau-Server auf 127.0.0.1. */
  url: string;
  size: number;
  mtime: number;
}

/**
 * Wie weit das Video eines Chats ist: noch kein Projekt, Pakete fehlen noch,
 * Studio startet, Studio läuft (mit Adresse) oder ist gescheitert.
 */
export interface RemotionStateDto {
  folder: string;
  phase: 'empty' | 'installing' | 'starting' | 'ready' | 'error';
  studioUrl?: string;
  error?: string;
  videos: RemotionVideoDto[];
  render?: { running: boolean; label: string; error?: string };
}

export interface TemplateDto {
  id?: string;
  name: string;
  kind: string;
  body: string;
  own: boolean;
  /** Human-facing composer text; body remains the complete standalone instruction. */
  prompt?: string;
  previewUrl?: string;
  aspectRatio?: 'portrait' | 'landscape';
  artifactPath?: string;
  instructionPath?: string;
}

/** Die Seiten, die die Hauptfläche neben der Sidebar zeigen kann. */
export type Page = 'chat' | 'accounts' | 'settings' | 'plugins' | 'exokortex' | 'agents' | 'automations';
