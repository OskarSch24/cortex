/** Was die Webview an den Host schickt. */
import type { ImageOptions } from '../imageOptions.js';
import type { HistoryRequest } from '../../history/types.js';
import type { Page } from './dtos.js';
import type { ExokortexAction } from './exokortex.js';
import type { PluginScope } from './plugins.js';
import type { PermissionDecision, Rule, RuleTarget } from '@cortex/core';

export type WebviewToHost =
  | HistoryRequest
  | { kind: 'getTeams' }
  | { kind: 'saveTeam'; team: import('../../teams/types.js').AgentTeam; revision: number; baseSignature?: string }
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
  /** OpenRouter: Schlüssel prüfen und im Schlüsselbund ablegen; mit `accountId` ersetzen. */
  | { kind: 'addApiKeyAccount'; provider: 'openrouter'; label?: string; key: string; accountId?: string }
  | { kind: 'getOpenRouterCatalog' }
  | { kind: 'setOpenRouterFavorites'; ids: string[] }
  | { kind: 'setOpenRouterDefault'; id?: string }
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
  /** Standort-Kontext: Adresse suchen, Namen zu Koordinaten, Kartenbild, Standort am Chat. */
  | { kind: 'geoSearch'; reqId: string; query: string }
  | { kind: 'geoReverse'; reqId: string; lat: number; lon: number }
  | { kind: 'geoMap'; reqId: string; lat: number; lon: number; radiusKm: number; width?: number; height?: number }
  /** „Mein Standort“: der Host fragt CoreLocation und benennt die Stelle. */
  | { kind: 'geoLocate'; reqId: string }
  | { kind: 'setChatLocation'; conversationId: string; location: import('@cortex/core').ChatLocation | null }
  /** Der Reiter „Video“ eines Chats ist auf- oder zugegangen (Remotion). */
  | { kind: 'remotionWatch'; conversationId: string; open: boolean }
  /** Knöpfe im Reiter „Video“; `file` ist relativ zum Videoordner des Chats. */
  | { kind: 'remotionAction'; conversationId: string; action: 'render' | 'restart' | 'reveal' | 'open' | 'saveAs'; file?: string }
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
