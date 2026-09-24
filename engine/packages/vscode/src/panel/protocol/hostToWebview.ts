/** Was der Host an die Webview schickt. */
import type { ImageOptions } from '../imageOptions.js';
import type { HistoryResponse } from '../../history/types.js';
import type { QueuedMessageDto, AccountStatusDto, TurnCheckpoint, ConversationMeta, RemotionStateDto, TemplateDto, Page } from './dtos.js';
import type { GalaxieKnoten, ExokortexAction, ExokortexStatusDto } from './exokortex.js';
import type { BuiltInConnectorDto, PluginScope, PluginLiveState, PluginScopeState } from './plugins.js';
import type { ProjectDto, FileDiffDto, WorkspaceDto, MemoryHitDto } from './workspace.js';
import type { AgentProgress, AgentStatus, RulesFile, SlashCommand, Target, TaskItem, ToolAction, PermissionRequest, TaskMetric } from '@cortex/core';

export type HostToWebview =
  | HistoryResponse
  | { kind: 'teamsState'; state: import('../../teams/types.js').TeamsState }
  | { kind: 'teamSaved'; id: string }
  | { kind: 'teamError'; message: string }
  | { kind: 'teamAutomationNotice'; message: string }
  | { kind: 'agentMarkdown'; requestId: string; text: string }
  | { kind: 'conversationSearch'; hits: import('../conversationSearch.js').ConversationHit[]; requestId: number }
  | { kind: 'widgetState'; conversationId: string; key: string; value: unknown }
  | { kind: 'messageQueue'; conversationId: string; items: QueuedMessageDto[]; paused: boolean; pauseReason?: import('../messageQueue.js').QueuePauseReason }
  | { kind: 'nativeSettings'; values: Record<string, unknown>; error?: string; revision?: number; ack?: { key: string; requestId: string; error?: string } }
  | { kind: 'appSettings'; values: Record<string, unknown>; revision?: number; ack?: { key: string; requestId: string; error?: string } }
  | { kind: 'imports'; found: Array<{ id: string; name: string; path: string }> }
  /** Which side panes Cortex has open, so the toolbar can offer to close them. */
  | { kind: 'panes'; browser: boolean; terminal: boolean }
  | { kind: 'templates'; items: TemplateDto[] }
  | {
      kind: 'connectors';
      /** Wo die Definition liegt — fehlt sie, gibt es noch keine Datei. */
      path?: string;
      /** Die Datei ist da, aber unlesbar. */
      error?: string;
      servers: Array<{
        name: string;
        remote: boolean;
        target: string;
        providers?: string[];
        kind?: string;
        /** Gehört zum Produkt und steht in keiner mcp.json — Database Studio. */
        builtIn?: boolean;
        /** Anzeigename und Beschreibung, wenn der Konnektor sich selbst beschreibt. */
        title?: string;
        description?: string;
        /** Das eigene Icon als `data:`-URI, 128px — sonst gilt der Glyph. */
        icon?: string;
        /** Bei eingebauten: ob die Verbindung steht, und woran sie hängt. */
        connected?: boolean;
        detail?: string;
      }>;
      /** Je Konto: hat die Spiegelung geklappt? */
      accounts: Array<{ provider: string; label: string; error?: string }>;
    }
  | {
      kind: 'plugins';
      /**
       * Beide möglichen Orte für mcp.json, nicht nur der gerade gewinnende:
       * ein Projekt darf eigene Server mitbringen, und der Nutzer muss sehen
       * können, welcher Eintrag von wo kommt.
       */
      scopes: PluginScopeState[];
      /**
       * Der eingebaute Konnektor. Er steht in keiner mcp.json — er ist die
       * Datenbankintegration selbst und wird beim Spiegeln dazugelegt. Deshalb
       * gehört er auf die Seite, aber nicht in die Liste der Dateieinträge.
       */
      builtIn?: BuiltInConnectorDto;
      /** Skill-Ordner, die es auf dieser Platte wirklich gibt. */
      skills: string[];
      /** Je Konto: ist die letzte Spiegelung angekommen? */
      accounts: Array<{ provider: string; label: string; error?: string }>;
      /** Programmprüfungen für Einträge mit `requires.kind === 'app'`, z. B. `xcode`. */
      apps?: Record<string, { ok: boolean; detail: string; running?: boolean }>;
      /** Aus welcher Datei jeder geltende Server stammt. */
      origin?: Record<string, PluginScope>;
      /** Persönliche Server, die die Projektdatei überschreibt. */
      shadowed?: string[];
    } & PluginLiveState
  /**
   * Nur das, was sich während einer offenen Seite von selbst ändert:
   * Prüfergebnisse, Anmeldungen, hinterlegte Werte. Geht an jede Fläche.
   */
  | ({ kind: 'pluginLive' } & PluginLiveState)
  /** Ergebnis eines Installations- oder Entfernungsversuchs. */
  /** `action`: ein Knopf in der Meldung, der die Produktseite eines anderen Eintrags öffnet. */
  | { kind: 'pluginProgress'; id: string; ok: boolean; message: string; action?: { label: string; open: string } }
  /** Ein Werkzeug aus der Fenster-Titelleiste — dort liegen die Knöpfe jetzt. */
  | { kind: 'toolbar'; action: 'files' | 'dock' | 'changes' | 'canvas' | 'video' | 'browser' | 'terminal' | 'sidebar' | 'project' | 'overview' }
  | { kind: 'userEcho'; text: string; attachments?: string[]; at?: number; image?: ImageOptions }
  /** Ein Bildwerkzeug hat eine Datei geschrieben. `src` ist die Webview-Adresse dazu. */
  | { kind: 'image'; messageId: string; path: string; src: string; prompt?: string; edited?: boolean; options?: ImageOptions }
  | { kind: 'routing'; messageId: string; target: Target; ruleId?: string; reason: string }
  | { kind: 'delta'; messageId: string; text: string }
  | {
      kind: 'toolUse';
      messageId: string;
      name: string;
      detail?: string;
      preview?: string;
      path?: string;
      action?: ToolAction;
      added?: number;
      removed?: number;
      /** Set when a subagent did this — it belongs in that agent's lane. */
      agentId?: string;
    }
  | {
      kind: 'agentStart';
      messageId: string;
      id: string;
      label: string;
      agentKind?: string;
      prompt?: string;
      background?: boolean;
    }
  | ({ kind: 'agentProgress'; messageId: string; id: string } & AgentProgress)
  | ({
      kind: 'agentEnd';
      messageId: string;
      id: string;
      status: Exclude<AgentStatus, 'running'>;
      summary?: string;
    } & AgentProgress)
  | { kind: 'failover'; messageId: string; from: Target; to: Target; reason: string; resetAt?: number }
  | { kind: 'downgraded'; messageId: string; from: string; to: string }
  | { kind: 'notice'; text: string }
  /** Erinnerungen aus dem Exokortex, die mit der Nachricht gingen — zugeklappt im Verlauf. */
  | { kind: 'memories'; bereiche: string[]; treffer: MemoryHitDto[] }
  /** Was der Host gerade vor dem Lauf tut (Erinnerungen suchen); ohne Text: fertig. */
  | { kind: 'activity'; text?: string }
  | {
      kind: 'done';
      messageId: string;
      costUsd?: number;
      metered?: boolean;
      durationMs?: number;
      at?: number;
      /** Ein echter Wortwechsel mit einem Modell — nicht bloß eine lokale Aktion wie eine Bildgrößenänderung. */
      turn?: boolean;
      /** Wo diese Antwort in der Sitzung des Anbieters endet — dort kann ein Chat später abzweigen. */
      checkpoint?: TurnCheckpoint;
    }
  /** Text (und Anhänge) ins Eingabefeld legen — nach dem Zurückgehen zu einer Nachricht. */
  | { kind: 'composerSeed'; text: string; attachments?: string[] }
  /** The user's verdict on one answer, replayed with the conversation. */
  | { kind: 'rated'; messageId: string; poor: boolean }
  /** Die Dateien dieses Auftrags stehen wieder auf dem Stand davor. */
  | { kind: 'reverted'; messageId: string }
  | { kind: 'revertState'; messageId: string; available: boolean; reason?: string }
  /** The run ended without an answer — cancelled, restarted or shut down. */
  | { kind: 'stopped'; messageId: string; reason?: string }
  | { kind: 'error'; messageId: string; message: string; recovery?: 'install-claude' | 'reconnect-grok'; recoveryAccountId?: string }
  | { kind: 'busy'; running: boolean }
  | { kind: 'runClock'; elapsedMs: number }
  | { kind: 'accounts'; accounts: AccountStatusDto[] }
  | { kind: 'conversations'; list: ConversationMeta[]; archivedList?: ConversationMeta[]; activeId: string }
  | { kind: 'rules'; rules: RulesFile; path: string; exists: boolean; error?: string; customCommands: SlashCommand[] }
  | { kind: 'modes'; permissionMode: string; routingMode: 'auto' | 'manual'; askPermission?: boolean; pollUsage?: boolean }
  /** `standard`: nichts gewählt — der Knopf zeigt die Vorgabe (neuestes Opus), das Modellmenü hakt „Standard“ ab. */
  | { kind: 'pinnedTarget'; target?: { provider: string; account: string; model?: string }; standard?: boolean }
  | { kind: 'attachments'; paths: string[] }
  /** Ohne `src`, wenn die Datei kein lesbares Bild ist — dann bleibt die Textzeile. */
  | { kind: 'attachmentPreview'; path: string; src?: string }
  | { kind: 'conversationReset' }
  /** Nach dem Einspielen des Verlaufs: die Oberfläche darf den Chat zeigen, unten. */
  | { kind: 'conversationReady' }
  | { kind: 'review'; messageId: string; by: string; text: string }
  | { kind: 'tasks'; messageId: string; items: TaskItem[] }
  | { kind: 'permission'; messageId: string; request: PermissionRequest; target?: Target }
  | { kind: 'permissionResolved'; id: string; allowed: boolean }
  | { kind: 'analytics'; metrics: TaskMetric[]; accounts: AccountStatusDto[] }
  | { kind: 'openRouterCatalog'; models: import('@cortex/core').OpenRouterModel[]; favorites: string[]; defaultModel?: string }
  | { kind: 'projects'; projects: ProjectDto[] }
  | { kind: 'workspace'; conversationId: string; workspace: WorkspaceDto }
  | { kind: 'connectionProgress'; provider: string; state: 'connecting' | 'review' | 'connected' | 'error'; message: string; attemptId?: string; identity?: string; url?: string }
  | { kind: 'pickedFolder'; path: string }
  | { kind: 'diff'; conversationId: string; files: FileDiffDto[]; error?: string }
  | { kind: 'fileBody'; path: string; text?: string; truncated?: boolean; error?: string }
  | { kind: 'canvasScene'; conversationId: string; scene?: string; applied: string[] }
  | { kind: 'remotionState'; conversationId: string; state: RemotionStateDto }
  | { kind: 'geoResult'; reqId: string; places?: Array<{ label: string; lat: number; lon: number }>; label?: string; position?: { lat: number; lon: number; accuracy: number; label: string }; map?: { zoom: number; tiles: Array<{ src: string; dx: number; dy: number }>; radiusPx: number; attribution: string }; error?: string }
  /** Der Standort-Kontext des Chats; ohne `location`: keiner. */
  | { kind: 'chatLocation'; conversationId: string; location?: import('@cortex/core').ChatLocation }
  /** Das Modell will die Fläche sehen (ohne code) oder einen Block zeichnen und das Ergebnis sehen. */
  | { kind: 'canvasRequest'; reqId: string; conversationId: string; code?: string; scene?: string }
  /** Vom Workbench-Drop (patch-webview-drop.py): Dateien ohne Pfad, als Inhalt oder als Fehlschlag. */
  | { kind: 'attachmentData'; name: string; dataUrl: string }
  | { kind: 'attachmentDropFailed'; reason: 'promise' | 'unreadable' }
  | { kind: 'filePreview'; path: string; url?: string; error?: string }
  /**
   * Der Verlauf eines Chats als Klartext. Er öffnet als Reiter im Dock und
   * nicht als Editor daneben: dort ließe er sich ohne Reiterleiste nicht mehr
   * schließen, und die Kopfzeile eines Editors liegt unter den Werkzeug-Icons.
   */
  | { kind: 'transcript'; title: string; turns: Array<{ role: 'user' | 'assistant'; text: string }> }
  | { kind: 'showPage'; page: Page }
  | { kind: 'slashAction'; action: import('@cortex/core').SlashAction }
  | { kind: 'exokortex'; status: ExokortexStatusDto }
  /**
   * Eine laufende Aktion. `output` wächst zeilenweise, damit ein Sechs-Minuten-
   * Lauf sichtbar arbeitet statt stumm zu warten.
   */
  | {
      kind: 'exokortexAktion';
      action: ExokortexAction;
      state: 'running' | 'done' | 'error';
      output?: string;
      message?: string;
    }
  /** Fertiger Text aus `lesen.py`, so wie ihn auch ein Modell bekäme. */
  | { kind: 'exokortexTreffer'; frage: string; text: string }
  /** Antwort auf `exokortexGalaxie` — schon gekappt auf eine lesbare Menge. */
  | {
      kind: 'exokortexGalaxieDaten';
      /** Der Knoten, dessen Nachbarn das sind — leer bei der Projektebene. */
      um?: string;
      knoten: GalaxieKnoten[];
      kanten: Array<{ von: string; nach: string; typ: string }>;
      hinweis: string;
    };
