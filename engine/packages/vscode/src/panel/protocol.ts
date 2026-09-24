/**
 * Die Nachrichten zwischen Panel und Host. Die Typen liegen nach Thema in
 * `protocol/`; diese Datei bündelt sie, damit Webview und Host weiter nur
 * `./protocol.js` einbinden. Alles hier bleibt frei von node- und
 * vscode-Importen — die Webview bündelt es mit.
 */
export type { QueuedMessageDto, AccountStatusDto, TurnCheckpoint, ConversationMeta, RemotionVideoDto, RemotionStateDto, TemplateDto, Page } from './protocol/dtos.js';
export type { WebviewToHost } from './protocol/webviewToHost.js';
export type { HostToWebview } from './protocol/hostToWebview.js';
export type { GalaxieKnoten, ExokortexAction, ExokortexZustand, ExokortexPruefung, ExokortexStatusDto, ExokortexAnteil, ExokortexQuelleZiel, ExokortexInstanz } from './protocol/exokortex.js';
export type { BuiltInConnectorDto, PluginScope, PluginLiveState, PluginScopeState } from './protocol/plugins.js';
export type { ProjectDto, FileDiffDto, WorkspaceDto, MemoryHitDto } from './protocol/workspace.js';
