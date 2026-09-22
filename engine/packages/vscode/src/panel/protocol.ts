import type { ImageOptions } from './imageOptions.js';
import type { HistoryRequest, HistoryResponse } from '../history/types.js';
import type { AgentProgress, AgentStatus, ProviderId, RulesFile, SlashCommand, Target, TaskItem, ToolAction, PermissionRequest, PermissionDecision, UsageWindow, TaskMetric, Rule, RuleTarget, McpServerDef, PluginConnection, PluginCredentialState } from '@cortex/core';

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
  models: import('../../../core/src/models/catalog.js').ModelOption[];
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
}

export type WebviewToHost =
  | HistoryRequest
  | { kind: 'getTeams' }
  | { kind: 'saveTeam'; team: import('../teams/types.js').AgentTeam; revision: number; baseSignature?: string }
  | { kind: 'deleteTeam'; id: string; revision: number }
  | { kind: 'startTeam'; teamId: string; task: string }
  | { kind: 'startSwarm'; swarmId: string; task: string; count: number; agentIds: string[]; proposed: Array<{ name: string; role?: string; instructions?: string }> }
  | { kind: 'stopTeam'; runId: string }
  | { kind: 'copyTeamWebhook'; teamId: string }
  | { kind: 'importAgentMarkdown'; requestId: string }
  | { kind: 'exportAgentMarkdown'; name: string; text: string }
  | { kind: 'searchConversations'; query: string; excludedProjects: string[]; requestId: number }
  | { kind: 'relinkProject'; path: string }
  | { kind: 'getWidgetState'; conversationId: string; key: string }
  | { kind: 'setWidgetState'; conversationId: string; key: string; value: unknown }
  | { kind: 'ready' }
  /** Sichtbare Seite der Hauptfläche, einschließlich Zurück/Vorwärts. */
  | { kind: 'pageChanged'; page: Page }
  | {
      kind: 'send';
      effort?: import('@cortex/core').Effort;
      text: string;
      tags: string[];
      permissionMode?: string;
      askPermission?: boolean;
      routingMode?: 'auto' | 'manual';
      attachments?: string[];
      /** Pinned account+model from the composer picker. Mentions in the text still win. */
      target?: { provider: string; account: string; model?: string };
      /** „Bild erstellen“: die Felder unter dem Eingabefeld. */
      image?: ImageOptions;
      /** Im Bildmodus nur der Anbieter — das Konto wählt Cortex: das größere zuerst, bei Limit das nächste. */
      imageProvider?: string;
    }
  | { kind: 'pickAttachments' }
  /** Kleines Vorschaubild für eine angehängte Bilddatei; Antwort als `attachmentPreview`. */
  | { kind: 'attachmentPreview'; path: string }
  /** Die Kontofolge eines Anbieters für Bilder; landet in `cortex.imageAccountOrder`. */
  | { kind: 'setImageAccountOrder'; provider: string; accounts: string[] }
  /** Ein erzeugtes Bild: im Projekt speichern, im Finder zeigen oder im Standardprogramm öffnen. */
  | { kind: 'imageAction'; action: 'save' | 'saveAll' | 'reveal' | 'open' | 'copy'; path: string; prompt?: string; paths?: string[] }
  | { kind: 'resizeImage'; path: string; width: number; height: number }
  | { kind: 'setModes'; permissionMode?: string; routingMode?: 'auto' | 'manual'; ask?: boolean }
  | { kind: 'setPinnedTarget'; target?: { provider: string; account: string; model?: string } }
  | { kind: 'cancel' }
  | { kind: 'queueAction'; id: string; action: 'remove' | 'up' | 'down' | 'steer' }
  | { kind: 'editQueuedMessage'; id: string; text: string }
  | { kind: 'resumeQueue' }
  | { kind: 'clearQueue' }
  | { kind: 'newConversation'; projectPath?: string }
  | { kind: 'openConversation'; id: string }
  | { kind: 'deleteConversation'; id: string }
  /** Actions always apply to the conversation of the requesting surface. */
  | { kind: 'chatCommand'; action: 'archive' | 'pin' | 'fork' | 'export' | 'copy' | 'compact' | 'feedback' }
  | { kind: 'restoreConversation'; id: string }
  | { kind: 'openAccounts' }
  | { kind: 'recoverProvider'; action: 'install-claude' | 'reconnect-grok'; messageId: string }
  | { kind: 'openSettings' }
  | { kind: 'workbenchAction'; action: 'split' | 'close' | 'commands' }
  | { kind: 'getNativeSettings' }
  | { kind: 'setNativeSetting'; key: string; value: unknown; requestId?: string }
  | { kind: 'openNativeSettings'; query?: string }
  /**
   * Die Werte der Einstellungsseiten, für die Cortex keinen eigenen Schalter
   * in `cortex.*` hat. Sie liegen im globalState und gehen an jede Fläche.
   */
  | { kind: 'getAppSettings' }
  | { kind: 'setAppSetting'; key: string; value: unknown; requestId?: string }
  /** Einen Ordner wählen und ihn unter `key` ablegen. */
  | { kind: 'pickAppSettingFolder'; key: string }
  | { kind: 'openLicenses' }
  /** Welche anderen KI-Werkzeuge auf diesem Mac Spuren hinterlassen haben. */
  | { kind: 'detectImports' }
  /** Die Kennzahlen für Profil und Analysen in den Einstellungen. */
  | { kind: 'getAnalytics' }
  /** Den Tastenkürzel-Editor von Code-OSS öffnen, optional schon gefiltert. */
  | { kind: 'openKeybindings'; query?: string }
  | { kind: 'setSetting'; key: 'pollUsage'; value: boolean }
  | { kind: 'addAccount'; provider?: string; label?: string; email?: string }
  | { kind: 'respondToConnection'; provider: string; attemptId: string; accept: boolean }
  | { kind: 'reconnectAccount'; id: string }
  | { kind: 'addProject' }
  | { kind: 'assignProject' }
  /** Projektwahl aus der Leiste über der Eingabe. Ohne Pfad: Aufgabe ohne Projekt. */
  | { kind: 'setConversationProject'; path?: string }
  | { kind: 'createProject'; name: string; folders: string[] }
  | { kind: 'saveProject'; path: string; name: string; folders: string[] }
  | { kind: 'removeProject'; path: string }
  | { kind: 'pinProject'; path: string; pinned: boolean }
  | { kind: 'pickProjectFolder' }
  | { kind: 'revealProject'; path: string }
  | { kind: 'getDiff' }
  | { kind: 'openDiffFile'; path: string }
  /**
   * Der Inhalt einer Projektdatei. `maxLines` hebt den Deckel für das Dock,
   * das eine Datei ganz zeigt; die Prüfansicht bleibt bei ihrem Auszug.
   */
  | { kind: 'readFileBody'; path: string; maxLines?: number }
  /** Die Excalidraw-Fläche eines Chats (webview/components/CanvasView.tsx). */
  /** Ein Bild ohne Dateipfad (Zwischenablage, Screenshot-Vorschau) als Data-URL. */
  | { kind: 'saveAttachmentData'; name: string; dataUrl: string }
  /** Ein Ablegen, aus dem kein Anhang wurde — damit es nicht still verschwindet. */
  | { kind: 'attachmentFailed'; reason: 'promise' | 'unreadable' }
  | { kind: 'canvasLoad'; conversationId: string }
  | { kind: 'canvasSave'; conversationId: string; scene: string; description: string; applied: string[] }
  /** Die Fläche ist offen (ihr Inhalt als Text) oder zu (`null`) — nur offen sieht das Modell sie. */
  | { kind: 'canvasVisible'; conversationId: string; description: string | null }
  | { kind: 'canvasExport'; conversationId: string; format: 'excalidraw' | 'svg'; content: string }
  /** Antwort auf canvasRequest: Bild (Data-URL), Beschreibung, Stand; headless = im Hintergrund gezeichnet. */
  | { kind: 'canvasAnswer'; reqId: string; png: string; description: string; json: string; error?: string; headless: boolean }
  /** Eine HTML-Datei als Seite: der Host antwortet mit ihrer Adresse (`filePreview`). */
  | { kind: 'previewFile'; path: string }
  /** Was der geteilte Knopf „Öffnen“ im Dock anbietet. */
  | { kind: 'fileAction'; action: 'default' | 'terminal' | 'xcode' | 'reveal' | 'saveAs'; path: string }
  | { kind: 'inspectWorkspace'; directory?: string }
  | { kind: 'openWorkspaceFile'; path: string }
  | { kind: 'openCode'; text: string; language?: string }
  | { kind: 'openEditor' }
  | { kind: 'openTerminal' }
  | { kind: 'openBrowser'; url?: string }
  /** Close the preview Cortex opened, wherever the editor put it. */
  | { kind: 'closeBrowser' }
  | { kind: 'closeTerminal' }
  /**
   * Ob im Chat gerade ein Dock offen ist. Die Knöpfe liegen in der
   * Fenster-Titelleiste, also außerhalb der Webview — ohne diese Meldung
   * wüsste kein Knopf, ob er gerade aktiv aussehen muss.
   */
  | { kind: 'dockState'; open: boolean }
  /** Die MCP-Server, die Cortex in jedes Anbieterprofil spiegelt. */
  | { kind: 'openConnectors' }
  /** Den Stand der Konnektoren erfragen bzw. neu in die Profile spiegeln. */
  | { kind: 'getConnectors' }
  | { kind: 'getExokortex' }
  /** Die Seite ist offen oder wieder zu — nur solange läuft der Statusabruf. */
  | { kind: 'exokortexPageOpen'; open: boolean }
  | { kind: 'exokortexAction'; action: ExokortexAction }
  | { kind: 'exokortexOpenPath'; path: string }
  | { kind: 'hideMemory'; id: string }
  /** Eine Datenquelle öffnen: App, Ordner oder URL. */
  | { kind: 'exokortexOeffneQuelle'; bundle?: string | null; app?: string | null; url?: string; pfad?: string }
  | { kind: 'exokortexSuche'; frage: string }
  /** Ein Ausschnitt des Graphen. Ohne `id` die Projektebene, sonst die
   *  Nachbarn dieses Knotens. */
  | { kind: 'exokortexGalaxie'; id?: string }
  | { kind: 'syncConnectors' }
  | { kind: 'editConnectors' }
  /**
   * Plugins. Der Katalog selbst liegt im Bündel — er ändert sich nur mit einem
   * Build. Über die Leitung geht nur, was sich wirklich ändern kann: welche
   * Server in mcp.json stehen, welche Skills auf der Platte liegen, ob die
   * Spiegelung in die Profile geklappt hat.
   */
  | { kind: 'getPlugins' }
  /**
   * Installieren heißt: eintragen, Werte in den Schlüsselbund, in die Profile
   * spiegeln, dann prüfen — und bei einem Anmelde-Plugin gleich anmelden.
   */
  | { kind: 'installPlugin'; id: string; scope: PluginScope; values?: Record<string, string> }
  | { kind: 'uninstallPlugin'; id: string; scope: PluginScope }
  /** Schlüssel oder andere Werte setzen; ein leerer String löscht einen Wert. */
  | { kind: 'setPluginValues'; id: string; values: Record<string, string> }
  /** Jetzt prüfen, auch wenn das letzte Ergebnis noch frisch ist. */
  | { kind: 'checkPlugin'; id: string }
  | { kind: 'loginPlugin'; id: string; account?: string }
  | { kind: 'cancelPluginLogin'; id: string }
  | { kind: 'logoutPlugin'; id: string }
  /** Einen eigenen OAuth-Client aus zwei Feldern ablegen — und gleich anmelden. */
  | { kind: 'setPluginClient'; id: string; clientId: string; clientSecret: string }
  /** Die Client-JSON auswählen; gelesen wird sie im Host, nie auf der Seite. */
  | { kind: 'pickPluginClientFile'; id: string }
  /** Eine aus dem Finder gezogene Client-JSON. */
  | { kind: 'pluginClientFile'; id: string; path: string }
  | { kind: 'clearPluginClient'; id: string }
  /** Die feste Rückrufadresse für die Konsole des Anbieters in die Zwischenablage. */
  | { kind: 'copyPluginRedirect'; id: string }
  /** Einen Server prüfen, auch einen ohne Katalogeintrag. */
  | { kind: 'checkServer'; server: string }
  /** Ein- oder ausschalten, ohne zu entfernen. */
  | { kind: 'setPluginEnabled'; server: string; enabled: boolean }
  /** Das volle stderr der letzten Prüfung im Ausgabefenster. */
  | { kind: 'showPluginLog'; server: string }
  /** Die Serverdefinition in die Zwischenablage — der teilbare Teil eines Plugins. */
  | { kind: 'copyPluginDefinition'; id: string }
  /** Was Database Studio gerade tut — der eingebaute Konnektor erklärt sich selbst. */
  | { kind: 'showDatabaseStudio' }
  /** Projektseite oder Datenschutzerklärung im Browser des Nutzers. */
  | { kind: 'openExternal'; url: string }
  /** „Öffnen in“ an der Webvorschau: im Cortex-Browser, in Chrome, Safari oder dem Standardbrowser. */
  | { kind: 'openUrlIn'; url: string; app: 'cortex' | 'chrome' | 'safari' | 'default' }
  /** „Rückgängig machen“ an der Änderungskarte eines Auftrags. */
  | { kind: 'revertTurn'; messageId: string; paths: string[] }
  /** Vorlagen holen bzw. den Ordner öffnen, in dem eigene liegen. */
  | { kind: 'getTemplates' }
  | { kind: 'editTemplates' }
  /** Vorlagen verwalten: eigene umbenennen oder löschen, mitgelieferte kopieren. */
  | { kind: 'templateAction'; action: 'duplicate' | 'rename' | 'delete'; name: string; id?: string }
  | { kind: 'removeAccount'; id: string }
  | { kind: 'renameAccount'; id: string }
  | { kind: 'openRules' }
  | { kind: 'editRules' }
  | { kind: 'saveRule'; rule: Rule; ruleIndex?: number }
  | { kind: 'deleteRule'; ruleId: string }
  | { kind: 'reorderRules'; order: string[] }
  | { kind: 'saveDefaultChain'; chain: RuleTarget[] }
  | { kind: 'refreshUsage' }
  | { kind: 'openAnalytics' }
  | { kind: 'clearAnalytics' }
  | { kind: 'permissionDecision'; id: string; decision: PermissionDecision }
  | { kind: 'setAskPermission'; ask: boolean }
  /**
   * Zurück vor deine `index`-te Nachricht: alles ab ihr fällt aus dem Chat, auch
   * aus dem Kontext des Modells, und ihr Text liegt wieder im Eingabefeld.
   */
  | { kind: 'rewindTo'; index: number }
  /** Dasselbe, aber gleich mit dem geänderten Text abgeschickt. */
  | { kind: 'editMessage'; index: number; send: Extract<WebviewToHost, { kind: 'send' }> }
  /** Ein neuer Chat im selben Projekt mit dem Verlauf vor dieser Nachricht; ihr Text liegt im Eingabefeld. */
  | { kind: 'forkFrom'; index: number }
  /** Send the conversation's last user message again, after a failure. */
  | { kind: 'retryLast' }
  /** Mark one answer as poor, so the router stops treating that run as clean. */
  | { kind: 'rateAnswer'; messageId: string; poor: boolean };

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

export type HostToWebview =
  | HistoryResponse
  | { kind: 'teamsState'; state: import('../teams/types.js').TeamsState }
  | { kind: 'teamSaved'; id: string }
  | { kind: 'teamError'; message: string }
  | { kind: 'teamAutomationNotice'; message: string }
  | { kind: 'agentMarkdown'; requestId: string; text: string }
  | { kind: 'conversationSearch'; hits: import('./conversationSearch.js').ConversationHit[]; requestId: number }
  | { kind: 'widgetState'; conversationId: string; key: string; value: unknown }
  | { kind: 'messageQueue'; conversationId: string; items: QueuedMessageDto[]; paused: boolean; pauseReason?: import('./messageQueue.js').QueuePauseReason }
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
  | { kind: 'toolbar'; action: 'files' | 'changes' | 'canvas' | 'browser' | 'terminal' | 'sidebar' | 'project' }
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
  /** `standard`: nichts gewählt — der Knopf zeigt die Vorgabe (Opus 5), das Modellmenü hakt „Standard“ ab. */
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
  | { kind: 'projects'; projects: ProjectDto[] }
  | { kind: 'workspace'; conversationId: string; workspace: WorkspaceDto }
  | { kind: 'connectionProgress'; provider: string; state: 'connecting' | 'review' | 'connected' | 'error'; message: string; attemptId?: string; identity?: string; url?: string }
  | { kind: 'pickedFolder'; path: string }
  | { kind: 'diff'; conversationId: string; files: FileDiffDto[]; error?: string }
  | { kind: 'fileBody'; path: string; text?: string; truncated?: boolean; error?: string }
  | { kind: 'canvasScene'; conversationId: string; scene?: string; applied: string[] }
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

export interface GalaxieKnoten {
  id: string;
  /** Erste Bezeichnung — sie bestimmt Farbe und Rang beim Kappen. */
  art: string;
  name: string;
  projekt: string | null;
  /** Wie viele Kanten insgesamt an ihm hängen: Punktgröße und Hinweis darauf,
   *  ob sich das Aufklappen lohnt. */
  grad: number;
}

/** Was die Seite auslösen darf. Alles hier ist ungefährlich oder umkehrbar. */
export type ExokortexAction =
  | 'pruefen'
  | 'chatsEinspeisen'
  | 'nachmessen'
  | 'indexNeu'
  | 'konnektorenSync'
  | 'laufAn'
  | 'laufAus';

/**
 * Ein Projekt ist ein Name über einem oder mehreren Quellordnern. `path` bleibt
 * die Kennung — sie steht in jedem Chat und darf sich nicht ändern, wenn der
 * Nutzer den Namen umschreibt oder einen zweiten Ordner dazunimmt.
 */
/** Die Seiten, die die Hauptfläche neben der Sidebar zeigen kann. */
export type Page = 'chat' | 'accounts' | 'settings' | 'plugins' | 'exokortex' | 'agents' | 'automations';

/** Wie eine einzelne Prüfung ausgegangen ist. Bildet 1:1 `.cx-status` ab. */
export type ExokortexZustand = 'ok' | 'warnung' | 'fehler' | 'unbekannt';

export interface ExokortexPruefung {
  name: string;
  zustand: ExokortexZustand;
  wert: string;
  /** Was zu tun ist — nicht, was kaputt ist. Nur bei Bruch gefüllt. */
  hinweis: string;
}

/**
 * Was `bruecke/status.py --json` berichtet, plus die zwei Prüfungen, die nur
 * Cortex beantworten kann: ob der Konnektor in den Anbieterprofilen steht, und
 * ob gerade eine Aktion läuft.
 */
export interface ExokortexStatusDto {
  urteil: { zustand: ExokortexZustand; satz: string; hinweis: string };
  pruefungen: ExokortexPruefung[];
  graph?: { gebaut_am: string; knoten: number; kanten: number } | null;
  abnahme: {
    herkunft: 'abnahme' | 'lauf' | null;
    gerissen: number | null;
    gesamt: number | null;
    gemessen: string | null;
    /** Der Graph hat sich seit der Messung bewegt — der Wert gilt nicht mehr. */
    veraltet: boolean;
    befunde: Array<{ name: string; wert: string; hinweis: string }>;
  };
  arbeitsliste: {
    offene_entscheidungen: number;
    unbenannte_orte: number | null;
    fehlende_dateien: number;
    fehllisten: Array<{ datei: string; anzahl: number }>;
  };
  chronik: Array<{
    zeit: string | null;
    quellen: string[];
    dauer_s?: number | null;
    exitcode?: number | null;
    abgebrochen_in?: string | null;
    chats?: number;
    maskiert?: number;
  }>;
  pfade: { speicher: string; vault: string; chats: string; log: string };
  /**
   * Woher der Inhalt kommt. `bruecke/status.py` liefert die Quellen samt
   * Bundle-Kennung; das Symbol setzt die Extension dazu, weil nur sie an die
   * Programmbündel dieses Rechners kommt.
   */
  datenwege?: { arten: ExokortexQuellenart[] };
  /**
   * Woraus der Exokortex besteht — die drei Schichten und ihre Verteilung.
   * Die Verteilung zaehlt `graphindex` beim Bau; hier kostet sie nichts.
   */
  bestand?: {
    /** Notizen auf der Landkarte im Arbeits-Vault. */
    landkarte: number | null;
    /** Einheiten im Volltext. */
    einheiten: number | null;
    verteilung: {
      knoten: ExokortexAnteil[];
      kante: ExokortexAnteil[];
      projekt: ExokortexAnteil[];
    };
  };
  /** status.py selbst war nicht erreichbar. Dann steht oben nur diese Zeile. */
  fehler?: string;
}

export interface ExokortexAnteil {
  name: string;
  anzahl: number;
}

/**
 * Eine Quellenart — wie aus dem Zufluss ein Graph wird.
 *
 * Die Ebene darunter sind austauschbare Instanzen: ein vierter KI-Anbieter oder
 * ein zweites Aufnahmegerät folgt demselben Muster und ist eine Zeile mehr,
 * kein neuer Fall.
 */
export interface ExokortexQuellenart {
  kennung: string;
  name: string;
  /** Was im Graphen daraus wird, in einem Satz. */
  muster: string;
  /** Welches Skript sie hereinholt — `null`, solange keines existiert. */
  adapter: string | null;
  takt: string | null;
  knoten: number;
  hinweis?: string | null;
  /** Wie viele Instanzen tatsächlich angebunden sind. */
  aktive: number;
  instanzen: ExokortexInstanz[];
}

/** Wohin ein Klick auf eine Quelle oder eines ihrer Werkzeuge führt. */
export interface ExokortexQuelleZiel {
  name?: string;
  bundle?: string | null;
  app?: string | null;
  url?: string;
  pfad?: string;
}

export interface ExokortexInstanz {
  kennung: string;
  name: string;
  /** Bundle-Kennung der Anwendung. `null` bei Diensten ohne Anwendung hier. */
  bundle: string | null;
  /** Anzeigename — Rückfall, wenn Spotlight sie nicht kennt. */
  app?: string | null;
  /** Ordner, den ein Klick öffnet, wenn es keine Anwendung gibt. */
  pfad?: string;
  /** Website, falls die Quelle kein Programm auf diesem Rechner hat. */
  url?: string;
  /** Die Oberflächen eines Anbieters: Chat, Code, Cloud. */
  werkzeuge?: Array<string | ExokortexQuelleZiel>;
  hinweis?: string;
  zustand: 'aktiv' | 'geplant';
  /** data-URI des echten App-Symbols; von der Extension ergänzt. */
  symbol?: string | null;
}


/** Ein Projekt darf eigene MCP-Server mitbringen; sonst gilt die persönliche Datei. */
export interface BuiltInConnectorDto {
  name: string;
  title: string;
  description: string;
  /** Das Produktsymbol als data:-URI, wie es der MCP-Handschlag führt. */
  icon?: string;
  target: string;
  /** Läuft der Host in diesem Fenster gerade? */
  running: boolean;
  /** Wie viele Quellen dort offen sind. */
  sessions: number;
  /** Von Hand in mcp.json überschrieben — dann gilt der eigene Eintrag. */
  overridden: boolean;
}

export type PluginScope = 'projekt' | 'persoenlich';

export interface PluginLiveState {
  /** Je Server: welche Werte hinterlegt sind (nur Namen) und ob eine Anmeldung besteht. */
  credentials: Record<string, PluginCredentialState>;
  /** Je Server: das letzte Prüfergebnis. */
  connections: Record<string, PluginConnection>;
  /** Je Server: eine gerade laufende Anmeldung. */
  /** `account`: die Anmeldung gilt nur diesem Konto (Anmeldung über die CLIs). */
  logins: Record<string, { step: 'suche' | 'browser' | 'tausche'; message: string; url?: string; account?: string }>;
  /** In Cortex ausgeschaltete Server. */
  disabled: string[];
}

export interface PluginScopeState {
  id: PluginScope;
  path: string;
  exists: boolean;
  /** Was wirklich in dieser Datei steht. */
  servers: Record<string, McpServerDef>;
  /** Die Datei ist da, aber unlesbar — dann wird nichts behauptet. */
  error?: string;
}

export interface ProjectDto { name: string; path: string; folders?: string[]; pinned?: boolean; missing?: boolean; }
/** Eine geänderte Datei mit ihren Zeilen — die Grundlage für Karte und Prüfansicht. */
export interface FileDiffDto {
  path: string;
  added: number;
  removed: number;
  binary?: boolean;
  hunks?: Array<{ start: number; lines: Array<{ kind: 'add' | 'del' | 'ctx'; text: string; line?: number }> }>;
}

export interface WorkspaceDto {
  root?: string;
  directory: string;
  branch?: string;
  files: Array<{ name: string; path: string; directory: boolean }>;
  changes: Array<{ path: string; status: string }>;
  error?: string;
}

export interface MemoryHitDto {
  id: string;
  titel: string;
  quelle: 'chat' | 'dokument';
  ort?: string;
  datum?: string;
  auszug: string;
  passung: 'sehr' | 'gut';
}
