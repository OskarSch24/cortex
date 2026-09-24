import { MessageQueue, type QueuedMessage } from './messageQueue.js';
import { ActiveClock } from './activeClock.js';
import { createForkWorkspace, workspaceRunKey } from './forkWorkspace.js';
import { NATIVE_SETTINGS } from './nativeSettings.js';
import { compactionPlan, validCompactionSummary, workingHistory } from './contextCompaction.js';
import { TeamStore } from '../teams/store.js';
import { TeamRunner } from '../teams/runner.js';
import { AutomationRuntime, AutomationSkippedError } from '../automations/runtime.js';
import type { AutomationSource } from '../automations/types.js';
import { teamAgentEffort, teamAgentPrompt, type AgentTeam, type TeamAgent, type TeamJob, type TeamResources } from '../teams/types.js';
import { modelOption } from '../../../core/src/models/catalog.js';
import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { basename, relative, join, dirname } from 'node:path';
import { captureBaseline, captureTurnEnd, inspectWorkspace, projectRelative, validProject, type Baseline } from './workspace.js';
import { HtmlPreviewServer } from './htmlPreview.js';
import { IMAGE_FILE, imagePreviewData, stageImage } from './imageAttachments.js';
import { archiveGeneratedImage } from './imageArchive.js';
import type { OpenRouterCatalog } from '../openrouterCatalog.js';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { asksForVideo, pluginFields, readSkills, type McpServerDef } from '@cortex/core';
import type { PluginCredentials } from '../plugins/credentials.js';
import type { PluginConnections } from '../plugins/connections.js';
import { profileServers } from '../plugins/profileServers.js';
import type { PluginSwitches } from '../plugins/switches.js';
import { openRouterExaSearch, type WebSearchResult, type WebSearchSetup } from '@cortex/core';
import type { WebSearchBridge } from '../websearch/websearchBridge.js';
import {
  Orchestrator,
  SessionStore,
  QuotaTracker,
  AdapterRegistry,
  formatTarget,
  matchSlashCommand,
  parseMention,
  shortId,
  observedBurn,
  isRetry,
  isTransientFailure,
  accountHeadroom,
  assessThread,
  describeReport,
  isMetered,
  repairPrompt,
  pickReviewer,
  reviewPrompt,
  revisionPrompt,
  isClean,
  isReviewOnly,
  scopedMcpUnsupportedMessage,
  parsePlan,
  type PermissionDecision,
  type PermissionRequest,
  pickExecutor,
  executePrompt,
  executorTier,
  AUTO_TIER_MODELS,
  type ConversationContext,
  type LiveRunHandle,
  type PermissionMode,
  type Target,
  type TaskMetric,
} from '@cortex/core';
import type { AccountStore } from '../storage/accountStore.js';
import type { MetricsStore } from '../storage/metricsStore.js';
import type { PreferenceStore } from '../storage/preferenceStore.js';
import type { WorkspaceContext } from '../context/workspaceContext.js';
import type { Verifier } from '../verify/verifier.js';
import type { RulesManager } from '../rules/rulesFile.js';
import type {
  AccountStatusDto,
  ConversationMeta,
  HostToWebview,
  ProjectDto,
  WebviewToHost,
} from './protocol.js';
import { compactLog } from './transcript.js';
import { latestCheckpoint, rewindPlan } from './rewind.js';

import { applyPinnedTarget } from './pinnedTarget.js';
import { imageAccountOrder, imagePrompt, imageRoots, isGeneratedImage, isImageProvider, underRoot } from './images.js';
import { removeGeneratedImageBackground } from './nativeImages.js';
import { ExokortexExport } from '../storage/exokortexExport.js';
import { StatusWatch } from '../exokortex/watch.js';
import { Erinnerung, erinnerungsEinstellungen } from '../memory/host.js';
import { exokortexAbruf } from '../memory/exokortexAbruf.js';
import { schreibeMerkliste } from '../memory/merkliste.js';
import { trefferFuerAnzeige, type Helfer } from '../memory/erinnerung.js';
import type { HistoryBridge } from '../history/bridge.js';
import type { HistorySettings } from '../history/types.js';
import { tagsOf } from './tags.js';
import {
  CONV_KEY,
  FORK_POINTS_KEY,
  MAX_BASELINES,
  MAX_CONVERSATIONS,
  NATIVE_SESSIONS_KEY,
  QUEUE_KEY,
  REPLAYED_KINDS,
  projectlessDir,
  SEEN_TURNS_KEY,
  SYSTEM_BRIEFS_KEY,
  TASK_BRIEFS_KEY,
  type ConversationRecord,
  type Surface,
} from './panelTypes.js';
import { bindDomain, combineHandlers, type HandlerTable, type MessageContext } from './host/dispatch.js';
import { pushAnalytics, pushRules, rulesAnalyticsHandlers, rulesMessage } from './host/rulesAnalytics.js';
import { shellTable, titlebarContext, type ShellHost } from './host/shell.js';
import { templateHandlers } from './host/templateHandlers.js';
import { locationBrief, locationHandlers } from './host/location.js';
import { RemotionHost, remotionTable, type RemotionPanelHost } from './host/remotion.js';
import { ExokortexPanel, exokortexPfade, exokortexTable, type ExokortexPanelHost } from './host/exokortex.js';
import { connectorHandlers, pushConnectors } from './host/connectors.js';
import { PluginPanel, type PluginPanelHost } from './host/plugins/pluginPanel.js';
import { PluginSetup } from './host/plugins/pluginSetup.js';
import { pluginTable } from './host/plugins/pluginHandlers.js';
import { SettingsHost, modesMessage, settingsTable } from './host/settings.js';
import { AccountsPanel, accountTable, openRouterCatalogMessage, type AccountsPanelHost } from './host/accounts.js';
import { fileTable, type FilesHost } from './host/files.js';
import { SidePanes, sidePaneTable, type SidePaneHost } from './host/sidePanes.js';
import { imageTable, type ImagesHost } from './host/images.js';
import { projectTable, type ProjectsHost } from './host/projects.js';
import { CanvasHost, canvasTable, type CanvasPanelHost } from './host/canvas.js';
import { historyTable, startHistoryBridge, type HistoryHost } from './host/computerHistory.js';
import { teamTable, type TeamsHost } from './host/teams.js';
import { conversationTable, type ConversationsHost } from './host/conversations.js';
import { rewindTable, type RewindHost } from './host/rewind.js';
import { queueTable, type QueueHost } from './host/queue.js';

/** Alles, was die Bereiche unter host/ vom Provider erreichen. */
type ProviderBridge = ShellHost & RemotionPanelHost & ExokortexPanelHost & PluginPanelHost & AccountsPanelHost & FilesHost & SidePaneHost & ImagesHost & ProjectsHost & CanvasPanelHost & HistoryHost & TeamsHost & ConversationsHost & RewindHost & QueueHost;

/**
 * Claude-panel style layout: the sidebar webview is a session list only;
 * each conversation opens as its own editor tab (one tab per conversation,
 * revealed if already open). Conversations persist across reloads.
 */
/** Ein Lauf, der am Nutzungslimit eines Kontos endete — dann lohnt ein anderes Konto. */
export function isLimitError(message: string | undefined): boolean {
  return /usage limit|rate.?limit|quota|limit reached|hit limits|kontingent|limit erreicht|insufficient.?credit/i.test(message ?? '');
}

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'cortex.chat';
  /** Same list, docked in the secondary side bar (top right) instead. */
  static readonly secondaryViewType = 'cortex.chatSecondary';

  private surfaces = new Map<vscode.Webview, Surface>();
  private panels = new Map<string, vscode.WebviewPanel>();
  private accountsPanel?: vscode.WebviewPanel;
  private rulesPanel?: vscode.WebviewPanel;
  private analyticsPanel?: vscode.WebviewPanel;
  private agentPanel?: vscode.WebviewPanel;
  private conversations = new Map<string, ConversationRecord>();
  private tasks = new Map<string, AbortController>();
  /**
   * The panes Cortex opened beside the chat. The editor draws them without a
   * tab bar, so nothing else offers a way out of them — Cortex has to.
   */
  private sidePanes: { browser: boolean; terminal?: vscode.Terminal } = { browser: false };
  /**
   * Der Browser gehört einem Chat. Wer den Chat wechselt, sieht nicht die Seite
   * eines anderen Projekts; kehrt er zurück, geht seine eigene wieder auf.
   */
  private browserChats = new Set<string>();
  /**
   * Ob das untere Dock gerade sichtbar ist.
   *
   * Eine Erweiterung kann das Panel nicht fragen, nur bewegen. Der Knopf
   * oben rechts braucht die Antwort aber, um umzuschalten statt immer neu
   * zu öffnen — also merkt Cortex sich, was es selbst veranlasst hat.
   */
  private terminalDockVisible = false;
  /** Liefert HTML-Dateien für das Dock als Seiten aus — ein Server je Projekt. */
  private htmlPreview = new HtmlPreviewServer();
  /** Das Video eines Chats (host/remotion.ts) — erst beim ersten Zugriff angelegt. */
  private remotionHost?: RemotionHost;
  private get remotion(): RemotionHost {
    return this.remotionHost ??= new RemotionHost(this.panelHost);
  }
  private computerHistoryBridge?: HistoryBridge<vscode.Webview>;
  private queues = new MessageQueue(
    (id, message) => this.runQueuedMessage(id, message),
    id => { void this.pushQueue(id); this.persistSoon(); },
    (id, error) => this.toConversation(id, { kind: 'notice', text: `Nachricht konnte nicht ausgeführt werden: ${String(error)}. Die Warteschlange ist pausiert.` }),
  );
  private queueVersions = new Map<string, number>();
  private runClocks = new Map<string, ActiveClock>();
  /** Je Arbeitsordner: viele lesende Rollen zugleich oder genau eine schreibende. */
  private projectRuns = new Map<string, { writers: number; readers: number }>();
  private queueCapabilities = new Map<string, string>();
  private queuePreviews = new Map<string, Promise<string | undefined>>();
  private liveRuns = new Map<
    string,
    { handle: LiveRunHandle; messageIds: string[]; turnIdx: number; userTexts: string[]; lastTarget?: Target; modes: QueuedMessage['modes'] }
  >();
  private persistTimer?: NodeJS.Timeout;
  private disposing = false;
  /** Durable copy of every chat, outside globalState and outside the cap. */
  private exokortex = new ExokortexExport();
  /** Läuft nur, solange jemand die Exokortex-Seite offen hat. */
  private exokortexWatch = new StatusWatch({
    intervallMinuten: Math.max(1, vscode.workspace.getConfiguration('cortex')
      .get<number>('exokortex.statusIntervalMinutes', 5)),
    tick: () => this.exokortexPanel.push(),
  });
  /** Die Exokortex-Seite (host/exokortex.ts) — erst beim ersten Zugriff angelegt. */
  private exokortexPanelInstance?: ExokortexPanel;
  private get exokortexPanel(): ExokortexPanel {
    return this.exokortexPanelInstance ??= new ExokortexPanel(this.panelHost);
  }
  /** Die Plugin-Seite (host/plugins/) — erst beim ersten Zugriff angelegt, auch vom Schlüsselbund aus. */
  private pluginSetupInstance?: PluginSetup;
  private get pluginSetup(): PluginSetup {
    return this.pluginSetupInstance ??= new PluginSetup(new PluginPanel(this.panelHost));
  }
  private get plugins(): PluginPanel {
    return this.pluginSetup.panel;
  }
  /** Einstellungen, Modi und gewähltes Modell (host/settings.ts) — erst beim ersten Zugriff angelegt. */
  private settingsInstance?: SettingsHost;
  private get settings(): SettingsHost {
    return this.settingsInstance ??= new SettingsHost(this.panelHost);
  }
  /** Konten und Anbieter (host/accounts.ts) — erst beim ersten Zugriff angelegt. */
  private accountsHostInstance?: AccountsPanel;
  private get accountsHost(): AccountsPanel {
    return this.accountsHostInstance ??= new AccountsPanel(this.panelHost);
  }
  /** Browser, Terminal und Datei-Dock (host/sidePanes.ts); ihr Zustand bleibt am Provider. */
  private panesInstance?: SidePanes;
  private get panes(): SidePanes {
    return this.panesInstance ??= new SidePanes(this.panelHost);
  }
  /** Die Zeichenfläche (host/canvas.ts); was offen und gespeichert ist, bleibt am Provider. */
  private canvasInstance?: CanvasHost;
  private get canvas(): CanvasHost {
    return this.canvasInstance ??= new CanvasHost(this.panelHost);
  }
  private onTargetChosen?: (target: Target) => void;
  private authHealth?: Map<string, 'ok' | 'expired' | 'unknown'>;
  private usageRefresher?: (live?: boolean) => Promise<void>;
  private identities = new Map<string, string>();
  /** What the router needs to keep a thread on one model: where it ran and how heavy it got. */
  /** Conversations the user had to interject into — a signal the model was off track. */
  private steeredRuns = new Set<string>();
  /** Claude's bridge answers arrive outside any adapter, so they wait here. */
  private pendingBridge = new Map<string, (decision: PermissionDecision) => void>();
  private threadContext = new Map<
    string,
    {
      lastTarget?: Target;
      /** Complexity of the last few turns, newest first — a window, not a peak. */
      recentComplexity?: string[];
      /** Task kind of the most recent turn, for attributing a correction. */
      lastKind?: string;
      turnCount: number;
      /** Last finished run, so a quick re-ask can be attributed back to it. */
      lastPrompt?: string;
      lastFinishedAt?: number;
      lastMetricId?: string;
      /**
       * Everything the last run read. This is the size of what another account
       * would have to rebuild from cold, so it is what makes moving expensive.
       */
      lastContextTokens?: number;
      /** Files this thread has touched, and what last went wrong — brief material. */
      touchedFiles?: string[];
      lastFailure?: string;
      /** Evidence the thread is circling: runs steered, checks left red. */
      corrections?: number;
      failedVerifications?: number;
    }
  >();
  /** Threads already told they are crowded — said once, not every turn. */
  private crowdedThreads = new Set<string>();
  /** Notizzettel und Exokortex-Abruf — das Gedächtnis über Modellwechsel und Chats hinweg. */
  private erinnerung = new Erinnerung({
    einstellungen: () => erinnerungsEinstellungen(this.settings.appSettings()),
    abrufen: (auftrag, signal) => exokortexAbruf(exokortexPfade(this.ctx))(auftrag, signal),
    fragen: (target, prompt, signal) => this.askOffThread(target, prompt, signal),
    helfer: (modus, zuletzt) => this.erinnerungsHelfer(modus, zuletzt),
    notizLesen: id => this.conversations.get(id)?.notizen,
    notizSchreiben: (id, text) => {
      const rec = this.conversations.get(id);
      if (!rec || rec.notizen === text) return;
      rec.notizen = text;
      this.persistSoon();
    },
    merken: eintrag => schreibeMerkliste(eintrag),
    log: zeile => this.output.appendLine(zeile),
  });

  constructor(
    private ctx: vscode.ExtensionContext,
    private orchestrator: Orchestrator,
    private sessions: SessionStore,
    private accounts: AccountStore,
    private quota: QuotaTracker,
    private adapters: AdapterRegistry,
    private rules: RulesManager,
    private metrics: MetricsStore,
    private preferences: PreferenceStore,
    private workspaceContext: WorkspaceContext,
    private verifier: Verifier,
    private output: vscode.OutputChannel,
    private pluginCredentials: PluginCredentials,
    private pluginConnections: PluginConnections,
    private pluginSwitches: PluginSwitches,
  ) {
    const offQuota = quota.onDidChange(() => this.pushAccounts());
    // Wie ein Server Client und Token bekommt, steht im Katalog — die Spiegelung
    // braucht es auch dann, wenn die Plugin-Seite nie geöffnet wurde.
    pluginCredentials.setDeliveries(server => this.plugins.catalog().find(e => e.server === server)?.requires?.client);
    pluginCredentials.setRequirements(server => { const entry = this.plugins.catalog().find(e => e.server === server); return entry ? pluginFields(entry) : []; });
    ctx.subscriptions.push(
      // Prüfergebnisse und Anmeldungen kommen, während die Seite offen ist —
      // auch aus anderen Fenstern. Jede Fläche erfährt sie, nicht nur die, auf
      // der geklickt wurde.
      pluginCredentials.onDidChange(() => this.plugins.broadcastPluginLive()),
      pluginConnections.onDidChange(() => this.plugins.broadcastPluginLive()),
      // Ein- oder ausgeschaltet: sofort in die Profile, damit der nächste Zug es weiß.
      pluginSwitches.onDidChange(() => {
        this.plugins.resyncProfiles();
        this.plugins.broadcastPluginLive();
      }),
      { dispose: () => { for (const login of this.pluginSetupInstance?.panel.pluginLogins.values() ?? []) login.abort.abort(); } },
      vscode.workspace.onDidChangeConfiguration(event => {
        if (NATIVE_SETTINGS.some(setting => event.affectsConfiguration(setting.key))) {
          for (const [webview] of this.surfaces) this.settings.pushNativeSettings(webview);
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.pushProjects()),
      vscode.window.onDidChangeWindowState(state => {
        if (state.focused) { this.pushProjects(); this.pushAccounts(); }
      }),
      accounts.onDidChange(() => {
        this.pushAccounts();
        // A freshly authed account gets its identity/usage without reopening.
        void this.accountsHost.loadIdentities();
        void this.usageRefresher?.();
      }),
      rules.onDidChange(() => {
        this.pushAccounts();
        pushRules(this.panelHost);
      }),
      // An open analytics tab follows every recorded run live.
      metrics.onDidChange(() => pushAnalytics(this.panelHost)),
      // Closed from the editor's own UI: drop the handle so the toolbar stops
      // offering to close something that is already gone.
      vscode.window.onDidCloseTerminal(terminal => {
        if (terminal !== this.sidePanes.terminal) return;
        this.sidePanes.terminal = undefined;
        this.terminalDockVisible = false;
        this.panes.pushPanes();
      }),
      { dispose: offQuota },
      {
        dispose: () => {
          // Flush pending writes so a window close never loses the last turn.
          // Cancellation itself can schedule persistence; stop that debounce
          // before flushing, while the desktop store is still available.
          this.disposing = true;
          this.cancelAll();
          if (this.persistTimer) clearTimeout(this.persistTimer);
          this.persistTimer = undefined;
          void this.persistNow().catch(error => this.output.appendLine(`[shutdown] ${String(error)}`));
        },
      },
      { dispose: () => this.exokortexWatch.dispose() },
      { dispose: () => this.htmlPreview.dispose() },
      { dispose: () => this.remotionHost?.dispose() },
      { dispose: () => this.computerHistoryBridge?.dispose() },
      { dispose: () => this.automationRuntime?.dispose() },
    );
    void this.pushTitlebarContext();

    for (const rec of ctx.globalState.get<ConversationRecord[]>(CONV_KEY, [])) {
      this.conversations.set(rec.id, rec);
      // Old conversations keep their context after a reload.
      for (const turn of workingHistory(rec.turns, rec.contextCompaction)) sessions.appendTurn(rec.id, turn);
    }
    this.queues.restore(Object.fromEntries(Object.entries(ctx.globalState.get<Record<string, QueuedMessage[]>>(QUEUE_KEY, {})).filter(([id]) => this.conversations.has(id))));
    sessions.restoreNative(ctx.globalState.get<Record<string, string>>(NATIVE_SESSIONS_KEY, {}));
    sessions.restoreForkPoints(ctx.globalState.get<Record<string, string>>(FORK_POINTS_KEY, {}));
    sessions.restoreSeen(ctx.globalState.get<Record<string, number>>(SEEN_TURNS_KEY, {}));
    sessions.restoreTaskBriefs(ctx.globalState.get<Record<string, unknown>>(TASK_BRIEFS_KEY, {}));
    sessions.restoreBriefs(ctx.globalState.get<Record<string, unknown>>(SYSTEM_BRIEFS_KEY, {}));
    void this.migrateImageArchive();
    // The old preview flag is intentionally ignored: it never granted real capture consent.
    if (ctx.globalState.get<HistorySettings>('cortex.computerHistory.v1')?.enabled) this.historyBridge();
  }

  private teamStore?: TeamStore;
  private teamRunner?: TeamRunner;
  private automationRuntime?: AutomationRuntime;
  private automationReady?: Promise<void>;
  private lastTeamBroadcast?: string;
  private teamUpdates = new Map<string, (change: Partial<TeamJob>) => void>();

  private teams(): TeamStore {
    if (!this.teamStore) {
      this.teamStore = new TeamStore(join(this.ctx.globalStorageUri.fsPath, 'agent-teams.json'));
      this.teamRunner = new TeamRunner(this.teamStore, (team, agent, task, upstream, signal, update) => this.runTeamAgent(team, agent, task, upstream, signal, update), () => this.pushTeams());
    }
    return this.teamStore;
  }

  /** Start independently of the agents page, so saved schedules survive reloads. */
  startAutomations(): Promise<void> {
    if (!this.automationReady) {
      const store = this.teams();
      this.automationRuntime = new AutomationRuntime({
        directory: join(this.ctx.globalStorageUri.fsPath, 'automations'),
        profiles: () => {
          store.refresh();
          this.teamRunner?.syncStops();
          // Another Cortex window may have finished a run or edited a profile.
          // Publish store revisions as well as trigger-state changes.
          if (this.lastTeamBroadcast !== `${store.revision}:${store.error ?? ''}`) this.pushTeams();
          if (store.error) throw new Error(store.error);
          return store.teams;
        },
        start: (id, task, source) => this.startTeam(id, task, source),
        changed: () => this.pushTeams(),
      });
      this.automationReady = this.automationRuntime.start();
    }
    return this.automationReady;
  }

  /** Manual, scheduled and webhook runs use exactly the same saved profile. */
  private async startTeam(id: string, task: string, source?: AutomationSource) {
    const store = this.teams(); store.refresh();
    if (store.error) throw new Error(store.error);
    const team = store.teams.find(team => team.id === id);
    if (!team) throw new Error('Dieses Profil wurde nicht gefunden.');
    if (source && !team.automation?.[source.kind === 'schedule' ? 'schedule' : 'webhook']?.enabled) throw new Error('Dieser Auslöser wurde deaktiviert.');
    if (team.projectPath && (!this.projects().some(project => project.path === team.projectPath) || !existsSync(team.projectPath))) throw new Error('Der zugewiesene Projektordner ist nicht mehr verfügbar. Wähle ein vorhandenes Projekt.');
    if (source && store.runs.some(run => run.teamId === id && run.status === 'running')) throw new AutomationSkippedError('Der Agent oder das Team arbeitet bereits.');
    if (source) {
      const workspace = team.projectPath ?? join(this.ctx.globalStorageUri.fsPath, 'team-workspaces', team.id);
      if (this.projectBusy(await workspaceRunKey(workspace))) throw new AutomationSkippedError('Im zugewiesenen Projekt läuft bereits ein Auftrag.');
    }
    const skillPaths = new Set(this.teamResources().skills.map(skill => skill.path));
    for (const agent of team.agents) {
      teamAgentEffort(agent);
      const account = this.accounts.all().find(account => account.provider === agent.target.provider && account.label === agent.target.account && !account.disabled);
      if (!account) throw new Error(`Verbinde zuerst das Konto von ${agent.name}.`);
      if (this.authHealth?.get(account.id) === 'expired' || !this.quota.availability(account.id).available) throw new Error(`Das Konto von ${agent.name} ist momentan nicht verfügbar.`);
      if (agent.skillPaths.some(path => !skillPaths.has(path))) throw new Error(`Ein Skill von ${agent.name} ist nicht mehr installiert.`);
      this.teamMcpServers(agent);
    }
    return this.teamRunner!.start(id, task, source, team);
  }

  private teamResources(): TeamResources {
    const skills: TeamResources['skills'] = [];
    const roots = [...this.plugins.skillRoots(), join(homedir(), '.agents', 'skills')];
    for (const root of [...new Set(roots)]) for (const name of readSkills([root])) {
      const path = join(root, name, 'SKILL.md');
      if (!skills.some(skill => skill.path === path)) skills.push({ name, path });
    }
    const servers = Object.entries(profileServers(this.plugins.definedServers())).map(([name, server]) => ({ name, title: this.plugins.catalog().find(entry => entry.server === name)?.name ?? name, providers: server.providers }));
    return { servers, skills };
  }

  private pushTeams(webview?: vscode.Webview): void {
    const store = this.teams();
    store.refresh();
    const message: HostToWebview = { kind: 'teamsState', state: { teams: store.teams, runs: store.runs, revision: store.revision, error: store.error, automations: this.automationRuntime?.snapshot(), ...this.teamResources() } };
    if (webview) this.safePost(webview, message);
    else {
      this.lastTeamBroadcast = `${store.revision}:${store.error ?? ''}`;
      for (const [surface] of this.surfaces) this.safePost(surface, message);
    }
  }

  private teamMcpServers(agent: TeamAgent): Record<string, McpServerDef> | undefined {
    if (agent.mcpServers === undefined) return undefined;
    const unsupported = scopedMcpUnsupportedMessage(agent.target.provider, {});
    if (unsupported) throw new Error(unsupported);
    const available = profileServers(this.plugins.definedServers());
    return Object.fromEntries(agent.mcpServers.map(name => {
      const definition = available[name];
      if (!definition || (definition.providers && !definition.providers.includes(agent.target.provider))) throw new Error(`Der MCP „${name}“ ist für ${agent.name} nicht verfügbar. Prüfe Verbindung und Anbieterzuordnung.`);
      return [name, definition];
    }));
  }

  private teamConversationEffort(agent: TeamAgent, target: Target, override?: import('@cortex/core').Effort): import('@cortex/core').Effort | undefined {
    const assignedModel = modelOption(agent.target.provider, agent.target.model)?.id ?? agent.target.model;
    const selectedModel = modelOption(target.provider, target.model)?.id ?? target.model;
    const sameModel = target.provider === agent.target.provider && selectedModel === assignedModel;
    return teamAgentEffort({ target, effort: override ?? (sameModel ? agent.effort : undefined) });
  }

  private teamExecutionTarget(target: Target): Target {
    const model = target.model ?? modelOption(target.provider)?.id;
    return model ? { ...target, model } : { ...target };
  }

  /** Läuft im Ordner überhaupt etwas — egal ob lesend oder schreibend. */
  private projectBusy(key: string): boolean {
    const held = this.projectRuns.get(key);
    return !!held && (held.writers > 0 || held.readers > 0);
  }

  /**
   * Nimmt den Ordner in Anspruch, wenn er frei genug ist. Lesende Rollen stören
   * einander nicht; eine schreibende braucht ihn allein. Gibt false zurück,
   * wenn der Aufrufer warten muss — er belegt dann nichts.
   */
  private holdProject(key: string, writes: boolean): boolean {
    const held = this.projectRuns.get(key) ?? { writers: 0, readers: 0 };
    if (writes ? held.writers > 0 || held.readers > 0 : held.writers > 0) return false;
    if (writes) held.writers++; else held.readers++;
    this.projectRuns.set(key, held);
    return true;
  }

  private releaseProject(key: string, writes: boolean): void {
    const held = this.projectRuns.get(key);
    if (!held) return;
    if (writes) held.writers = Math.max(0, held.writers - 1);
    else held.readers = Math.max(0, held.readers - 1);
    if (!held.writers && !held.readers) this.projectRuns.delete(key);
  }

  /** Ein Chat, den eine Rolle eines Teams oder Schwarms führt (Hintergrundprozess). */
  isTeamConversation(id: string | undefined): boolean {
    return !!(id && this.conversations.get(id)?.teamAgent);
  }

  /**
   * Zu welchem Schwarm ein Rollen-Chat gehört: der Lauf kennt den Chat der
   * Rolle, die Schwarmkennung `swarm-<Ursprungs-Chat>-…` den Chat, der ihn
   * gestartet hat. So gilt es auch für Rollen, die vor dieser Zuordnung liefen.
   */
  private swarmOf(conversationId: string): { origin?: string; shared: boolean } | undefined {
    if (!this.conversations.get(conversationId)?.teamAgent) return undefined;
    const store = this.teams();
    const run = store.runs.find(entry => entry.jobs.some(job => job.conversationId === conversationId));
    if (!run) return undefined;
    const team = store.teams.find(entry => entry.id === run.teamId);
    const origin = /^swarm-([a-zA-Z0-9]+)-/.exec(run.teamId)?.[1];
    return { ...(origin && this.conversations.has(origin) ? { origin } : {}), shared: !!team?.sharedWorkspace };
  }

  private async runTeamAgent(team: AgentTeam, agent: TeamAgent, task: string, upstream: TeamJob[], signal: AbortSignal, update: (change: Partial<TeamJob>) => void): Promise<string> {
    const effort = teamAgentEffort(agent);
    // Pin the catalog default so a local CLI configuration cannot change the
    // model behind the profile's advertised default reasoning capability.
    const target = this.teamExecutionTarget(agent.target);
    const account = this.accounts.all().find(account => account.provider === agent.target.provider && account.label === agent.target.account && !account.disabled);
    if (!account || this.authHealth?.get(account.id) === 'expired' || !this.quota.availability(account.id).available) throw new Error(`Das Konto von ${agent.name} ist nicht verfügbar.`);
    this.teamMcpServers(agent); // Check assignments before creating a conversation.
    const availableSkills = new Set(this.teamResources().skills.map(skill => skill.path));
    const skills = await Promise.all(agent.skillPaths.map(async path => {
      if (!availableSkills.has(path)) throw new Error(`Der Skill „${basename(dirname(path))}“ ist nicht mehr installiert.`);
      const info = await stat(path);
      if (info.size > 500_000) throw new Error(`Der Skill „${basename(dirname(path))}“ ist zu groß.`);
      return { name: basename(dirname(path)), text: `Datei: ${path}\nRelative Verweise in diesem Skill beziehen sich auf ${dirname(path)}.\n\n${await readFile(path, 'utf8')}` };
    }));
    if (signal.aborted) throw new Error('Auftrag angehalten.');
    const workspace = team.projectPath ?? join(this.ctx.globalStorageUri.fsPath, 'team-workspaces', team.id);
    if (!team.projectPath) await mkdir(workspace, { recursive: true });
    else if (!existsSync(workspace)) throw new Error('Der zugewiesene Projektordner fehlt.');
    const lock = await workspaceRunKey(workspace);
    // Nur lesende Rollen dürfen sich den Ordner teilen; wer schreiben darf, bekommt ihn allein —
    // außer im Schwarm, dessen Rollen je ihren eigenen Teil bearbeiten.
    const writes = agent.permissionMode !== 'safe' && !team.sharedWorkspace;
    while (!this.holdProject(lock, writes)) {
      update({ status: 'waiting', activity: writes ? 'Wartet auf den laufenden Auftrag im Projekt' : 'Wartet auf eine Schreibpause im Projekt' });
      if (signal.aborted) throw new Error('Auftrag angehalten.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (signal.aborted) { this.releaseProject(lock, writes); throw new Error('Auftrag angehalten.'); }
    const rec: ConversationRecord = {
      // Im Schwarm zählt die Rolle: die Chats stehen unter ihrem Ursprungs-Chat, und der Teamname wäre bei allen gleich.
      id: shortId(), title: team.kind === 'agent' ? team.name : team.sharedWorkspace ? `${agent.name} · Schwarm` : `${team.name} · ${agent.name}`, projectPath: team.projectPath,
      teamWorkspace: workspace, teamAgent: structuredClone(agent), pinnedTarget: target,
      createdAt: Date.now(), updatedAt: Date.now(), log: [], turns: [],
    };
    const cancel = () => this.tasks.get(rec.id)?.abort();
    try {
      this.conversations.set(rec.id, rec);
      update({ status: 'running', startedAt: Date.now(), conversationId: rec.id, activity: 'Bereitet den Auftrag vor' });
      this.teamUpdates.set(rec.id, update);
      this.persistNow(); this.sendConversations();
      signal.addEventListener('abort', cancel, { once: true });
      const prompt = teamAgentPrompt(team, agent, task, upstream, skills);
      this.toConversation(rec.id, { kind: 'userEcho', text: prompt, at: Date.now() });
      await this.runTask(rec.id, applyPinnedTarget(prompt, target), [], { target, effort, permissionMode: agent.permissionMode, routingMode: 'manual' });
      // Im Schwarm weicht eine Rolle, deren Konto mitten im Lauf ins Limit
      // läuft, auf das nächste freie Konto aus, statt zu scheitern.
      const tried = new Set([`${agent.target.provider}\n${agent.target.account}`]);
      for (;;) {
        if (signal.aborted) throw new Error('Auftrag angehalten.');
        const last = [...rec.log].reverse().find(message => ['done', 'error', 'stopped'].includes(message.kind));
        if (!team.sharedWorkspace || last?.kind !== 'error' || !isLimitError(last.message)) break;
        const next = this.accounts.all().find(account => !account.disabled
          && ['claude', 'codex', 'grok', 'copilot'].includes(account.provider)
          && !tried.has(`${account.provider}\n${account.label}`)
          && this.authHealth?.get(account.id) !== 'expired'
          && this.quota.availability(account.id).available);
        if (!next) break;
        tried.add(`${next.provider}\n${next.label}`);
        const fallback = this.teamExecutionTarget({ provider: next.provider, account: next.label });
        rec.pinnedTarget = fallback;
        if (rec.teamAgent) rec.teamAgent = { ...rec.teamAgent, target: { provider: next.provider, account: next.label }, effort: undefined };
        update({ activity: `Limit erreicht · weiter mit ${next.label}` });
        this.toConversation(rec.id, { kind: 'notice', text: `Das Konto hat sein Limit erreicht. ${agent.name} arbeitet mit ${next.label} (${next.provider}) weiter.` });
        const resume = `Dein vorheriges Konto hat mitten im Auftrag sein Nutzungslimit erreicht. Prüfe zuerst, was im Ordner von deinem Teil schon erledigt ist, und mach dort weiter.\n\n${prompt}`;
        await this.runTask(rec.id, applyPinnedTarget(resume, fallback), [], { target: fallback, effort: teamAgentEffort({ target: fallback }), permissionMode: agent.permissionMode, routingMode: 'manual' });
      }
      if (signal.aborted) throw new Error('Auftrag angehalten.');
      const terminal = [...rec.log].reverse().find(message => ['done', 'error', 'stopped'].includes(message.kind));
      if (terminal?.kind === 'error') throw new Error(terminal.message);
      if (terminal?.kind === 'stopped') throw new Error('Der Agent wurde im Chat angehalten.');
      const answer = [...rec.turns].reverse().find(turn => turn.role === 'assistant')?.text;
      if (!answer) throw new Error('Der Agent hat kein abgeschlossenes Ergebnis geliefert. Öffne seinen Chat für Details.');
      return answer;
    } finally {
      signal.removeEventListener('abort', cancel);
      this.teamUpdates.delete(rec.id);
      this.releaseProject(lock, writes);
      this.queues.retryBlockedProjects();
    }
  }

  /** Der lokale Computerverlauf (host/computerHistory.ts) — erst beim ersten Bedarf gestartet. */
  private historyBridge(): HistoryBridge<vscode.Webview> {
    return this.computerHistoryBridge ?? startHistoryBridge(this.panelHost);
  }

  setTargetListener(cb: (target: Target) => void): void {
    this.onTargetChosen = cb;
  }

  setPinnedListener(cb: (target: Target | undefined) => void): void {
    this.settings.onPinnedChanged = cb;
    cb(this.shownTarget());
  }

  setAuthHealth(map: Map<string, 'ok' | 'expired' | 'unknown'>): void {
    this.authHealth = map;
  }

  private webSearchBridge?: WebSearchBridge;
  setWebSearchBridge(bridge: WebSearchBridge): void {
    this.webSearchBridge = bridge;
  }

  /**
   * Die Websuche eines Agenten für einen Lauf. Ein Agent sucht immer mit der
   * Wahl aus seinem Profil (fehlt sie, mit der eigenen Suche des Anbieters);
   * Exa Instant läuft über OpenRouter und braucht dafür ein OpenRouter-Konto.
   */
  private async teamWebSearch(agent: TeamAgent, conversationId: string): Promise<WebSearchSetup> {
    const mode = agent.webSearch ?? 'standard';
    if (mode !== 'exa-instant') return { mode };
    if (!this.openRouterSearchAccount()) throw new Error(`${agent.name} sucht mit Exa Instant über OpenRouter — dafür fehlt ein OpenRouter-Konto mit Schlüssel (Einstellungen → Konto).`);
    if (!this.webSearchBridge) throw new Error('Die Exa-Suche ist in diesem Fenster nicht verfügbar.');
    return { mode, server: await this.webSearchBridge.serverFor(conversationId) };
  }

  /** Das OpenRouter-Konto, über das Exa-Suchen der CLI-Agenten laufen. */
  private openRouterSearchAccount() {
    return this.accounts.all().find(account => account.provider === 'openrouter' && !account.disabled && account.hasSecret);
  }

  /** Eine Exa-Instant-Suche für den Suchserver eines Agenten (websearchBridge.ts). */
  async webSearchFor(_conversationId: string, query: string, maxResults: number | undefined): Promise<WebSearchResult[]> {
    const account = this.openRouterSearchAccount();
    const key = account ? (await this.accounts.getSecret(account.id))?.trim() : undefined;
    if (!key) throw new Error('Für die Exa-Suche fehlt ein OpenRouter-Konto mit Schlüssel (Einstellungen → Konto).');
    return (await openRouterExaSearch(key, query, { maxResults, signal: AbortSignal.timeout(40_000) })).results;
  }

  private openRouter?: OpenRouterCatalog;
  setOpenRouterCatalog(catalog: OpenRouterCatalog): void {
    this.openRouter = catalog;
    // Neue Liste oder andere Favoriten: Modellmenü und Kontoseite ziehen nach.
    catalog.onDidChange(() => {
      this.pushAccounts();
      for (const [webview] of this.surfaces) this.safePost(webview, openRouterCatalogMessage(this.openRouter));
    });
  }

  private visibleConversationId(): string | undefined {
    return this.agentPanel ? this.surfaces.get(this.agentPanel.webview)?.conversationId : undefined;
  }

  private projectRoot(id?: string): string | undefined {
    const record = id ? this.conversations.get(id) : undefined;
    return record?.projectPath ?? record?.teamWorkspace;
  }

  private async conversationCwd(id?: string): Promise<string> {
    const project = this.projectRoot(id);
    if (project) {
      if (!existsSync(project)) throw new Error('Projektordner nicht gefunden. Weise dem Projekt über die Projektauswahl einen neuen Ordner zu.');
      return project;
    }
    const directory = projectlessDir(this.ctx.globalStorageUri.fsPath, id ?? 'scratch');
    await mkdir(directory, { recursive: true });
    return directory;
  }

  private projectFolders(id?: string): string[] {
    const root = this.projectRoot(id);
    if (!root) return [];
    const project = this.projects().find(p => p.path === root);
    return [...new Set([root, ...(project?.folders ?? [])])];
  }

  private async relinkProject(oldPath: string): Promise<boolean> {
    const ownedTasks = () => [...this.conversations.values()].filter(c => c.projectPath === oldPath);
    const busy = () => ownedTasks().some(c => this.tasks.has(c.id));
    if (busy()) { void vscode.window.showInformationMessage('Bitte zuerst die laufenden Aufgaben dieses Projekts beenden.'); return false; }
    const choice = await vscode.window.showWarningMessage('Projektordner nicht gefunden.', { modal: true, detail: `${oldPath}\nWähle den umbenannten oder verschobenen Projektordner. Die Aufgaben bleiben erhalten.` }, 'Neuen Ordner zuweisen');
    if (choice !== 'Neuen Ordner zuweisen') return false;
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Projektordner zuweisen' });
    if (!picked?.[0] || busy()) return false;
    const next = await validProject(picked[0].fsPath);
    if (busy()) return false;
    const owned = ownedTasks();
    const before = this.projects().find(p => p.path === oldPath);
    for (const rec of owned) rec.projectPath = next.path;
    await this.writeProjects(saved => [...saved.filter(p => p.path !== oldPath && p.path !== next.path), { ...before, ...next, name: before?.name ?? next.name, folders: [...new Set([next.path, ...(before?.folders ?? []).filter(path => path !== oldPath)])] }]);
    this.sendConversations(); await this.persistNow();
    for (const [view, surface] of this.surfaces) if (owned.some(c => c.id === surface.conversationId)) await this.pushWorkspace(view);
    return true;
  }

  /**
   * Die Projektliste der Seitenleiste.
   *
   * Drei Quellen fließen zusammen: was der Nutzer selbst angelegt hat, was aus
   * alten Chats hervorgeht, und die geöffneten Arbeitsordner des Fensters. Der
   * gespeicherte Eintrag gewinnt jedes Mal — sonst würde ein umbenanntes
   * Projekt beim nächsten Öffnen wieder den Ordnernamen tragen.
   *
   * `missing` sagt nur, dass der Ordner gerade nicht da ist. Der Eintrag bleibt:
   * eine ausgehängte Platte ist kein Grund, die Aufgaben eines Projekts aus der
   * Leiste zu nehmen.
   */
  private projects(): ProjectDto[] {
    const saved = this.ctx.globalState.get<ProjectDto[]>('cortex.projects', []);
    const current = (vscode.workspace.workspaceFolders ?? []).map(f => ({ name: f.name, path: f.uri.fsPath }));
    const historical = [...this.conversations.values()].flatMap(c => c.projectPath && !c.archived ? [{ name: basename(c.projectPath), path: c.projectPath }] : []);
    const merged = new Map<string, ProjectDto>();
    for (const project of [...historical, ...current, ...saved]) merged.set(project.path, { ...merged.get(project.path), ...project });
    const removed = new Set(this.ctx.globalState.get<string[]>('cortex.removedProjects', []));
    return [...merged.values()].filter(project => !removed.has(project.path) || saved.some(p => p.path === project.path) || historical.some(p => p.path === project.path)).map(project => ({
      ...project,
      missing: !existsSync(project.path),
    }));
  }

  /** Nur der gespeicherte Teil — abgeleitete Einträge gehören nicht in den Zustand. */
  private async writeProjects(update: (saved: ProjectDto[]) => ProjectDto[]) {
    const saved = this.ctx.globalState.get<ProjectDto[]>('cortex.projects', []);
    await this.ctx.globalState.update('cortex.projects', update(saved));
    this.pushProjects();
  }

  private pushProjects(): void {
    const projects = this.projects();
    for (const [webview] of this.surfaces) this.safePost(webview, { kind: 'projects', projects });
  }

  private async pushWorkspace(webview: vscode.Webview, directory = ''): Promise<void> {
    const id = this.surfaces.get(webview)?.conversationId ?? '';
    const workspace = await inspectWorkspace(this.projectRoot(id), directory);
    if (this.surfaces.get(webview)?.conversationId === id) this.safePost(webview, { kind: 'workspace', conversationId: id, workspace });
  }

  pinnedTarget(id = this.visibleConversationId()): Target | undefined {
    return this.settings.pinnedTarget(id);
  }

  /** Was der Modellknopf zeigt und womit gesendet wird — siehe SettingsHost.shownTarget. */
  shownTarget(id = this.visibleConversationId()): Target | undefined {
    return this.settings.shownTarget(id);
  }

  private pinnedMessage(id = this.visibleConversationId()): HostToWebview {
    return this.settings.pinnedMessage(id);
  }

  setPinnedTarget(target: Target | undefined, id = this.visibleConversationId()): Promise<void> {
    return this.settings.setPinnedTarget(target, id);
  }

  private pushPinned(): void {
    this.settings.pushPinned();
  }

  /** True when this account pays per token, so a reported cost is real money. */
  private isMetered(target: Target | undefined): boolean {
    if (!target) return false;
    const profile = this.accounts
      .all()
      .find((a) => a.provider === target.provider && a.label === target.account);
    return profile ? isMetered(profile) : false;
  }

  /** What this thread has already done, for the workspace brief. */
  threadFiles(conversationId: string): { touchedFiles?: string[]; lastFailure?: string } {
    const ctx = this.threadContext.get(conversationId);
    return { touchedFiles: ctx?.touchedFiles, lastFailure: ctx?.lastFailure };
  }

  /**
   * Say once, when the evidence is there, that this chat is now working against
   * itself. It is advice, not a mode: the user keeps typing either way.
   */
  private warnIfCrowded(
    conversationId: string,
    ctx: { turnCount: number; corrections?: number; failedVerifications?: number },
    post: (msg: HostToWebview) => void,
  ): void {
    if (this.crowdedThreads.has(conversationId)) return;
    const verdict = assessThread({
      turnCount: ctx.turnCount,
      corrections: ctx.corrections ?? 0,
      failedVerifications: ctx.failedVerifications ?? 0,
    });
    if (!verdict.crowded) return;
    this.crowdedThreads.add(conversationId);
    post({ kind: 'notice', text: `${verdict.reason} — ${verdict.advice}` });
  }

  /** Conversation memory for the router: same thread → same model unless work escalates. */
  conversationContext(conversationId: string): ConversationContext | undefined {
    const ctx = this.threadContext.get(conversationId);
    if (!ctx) return undefined;
    return {
      lastTarget: ctx.lastTarget,
      recentComplexity: ctx.recentComplexity as ConversationContext['recentComplexity'],
      turnCount: ctx.turnCount,
      // How warm that target still is, and how much a move would cost.
      lastRunAt: ctx.lastFinishedAt,
      lastContextTokens: ctx.lastContextTokens,
    };
  }

  setUsageRefresher(cb: (live?: boolean) => Promise<void>): void {
    this.usageRefresher = cb;
  }

  // ── surfaces ─────────────────────────────────────────────────────

  resolveWebviewView(view: vscode.WebviewView): void {
    this.attach(view.webview, { mode: 'sidebar' });
    view.onDidDispose(() => this.surfaces.delete(view.webview));
  }

  private static readonly ACCOUNT_MODES: ReadonlySet<Surface['mode']> = new Set([
    'sidebar',
    'tab',
    'accounts',
    'rules',
    'analytics',
    'agent',
  ]);

  /**
   * `media/` und die Ordner, in die Codex und Grok erzeugte Bilder schreiben.
   * Nur so kann die Bildkarte die Datei zeigen, ohne sie als Base64 durch die
   * Leitung zu schicken.
   */
  private resourceRoots(): vscode.Uri[] {
    return [
      vscode.Uri.joinPath(this.ctx.extensionUri, 'media'),
      vscode.Uri.joinPath(this.ctx.extensionUri, 'templates'),
      vscode.Uri.file(join(homedir(), '.cortex', 'templates')),
      ...this.imageRoots().map(root => vscode.Uri.file(root)),
    ];
  }

  private imageRoots(): string[] {
    return imageRoots(this.accounts.all().map(a => a.homeDir), [this.imageArchiveRoot()]);
  }

  private imageArchiveRoot(): string { return join(this.ctx.globalStorageUri.fsPath, 'bilder'); }

  private async migrateImageArchive(): Promise<void> {
    let changed = false;
    for (const rec of this.conversations.values()) {
      for (const event of rec.log) {
        if (event.kind !== 'image' || underRoot(event.path, [this.imageArchiveRoot()])) continue;
        const oldPath = event.path;
        try {
          const archived = await archiveGeneratedImage(oldPath, this.imageArchiveRoot(), rec.id);
          // A cleared/deleted conversation should not be resurrected by migration.
          if (this.conversations.get(rec.id) !== rec || !rec.log.includes(event)) continue;
          event.path = archived;
          event.src = await this.imageSrc(archived) ?? event.src;
          for (const entry of rec.log) {
            if (entry.kind === 'userEcho' && entry.attachments) entry.attachments = entry.attachments.map(path => path === oldPath ? archived : path);
          }
          changed = true;
        } catch {
          this.output.appendLine(`[bilder] Älteres Bild nicht mehr verfügbar: ${oldPath}`);
          const text = 'Ein älteres Bild ist nicht mehr verfügbar, weil seine ursprüngliche Datei fehlt. Neue Bilder werden dauerhaft im Chat gesichert.';
          if (!existsSync(oldPath) && !rec.log.some(entry => entry.kind === 'notice' && entry.text === text)) {
            rec.log.push({ kind: 'notice', text });
            changed = true;
          }
        }
      }
    }
    if (changed) this.persistSoon();
  }

  /** Die Adresse, unter der eine Webview das Bild lädt; außerhalb der Wurzeln als Data-URI. */
  private async imageSrc(path: string): Promise<string | undefined> {
    const webview = this.surfaces.keys().next().value as vscode.Webview | undefined;
    if (webview && underRoot(path, this.imageRoots())) return webview.asWebviewUri(vscode.Uri.file(path)).toString();
    return imagePreviewData(path, 25 * 1024 * 1024);
  }

  private attach(webview: vscode.Webview, surface: Surface): void {
    webview.options = {
      enableScripts: true,
      localResourceRoots: this.resourceRoots(),
    };
    webview.html = this.html(webview, surface.mode);
    webview.onDidReceiveMessage((msg: WebviewToHost) => this.onMessage(msg, webview));
    this.surfaces.set(webview, surface);
    if (surface.mode === 'agent') void this.pushTitlebarContext();
    // Die Eingabeleiste schlägt Konnektoren als Erwähnung vor — dafür muss sie
    // ihre Namen kennen, ohne danach fragen zu müssen.
    void pushConnectors(this.panelHost, webview);
  }

  /**
   * postMessage throws (sync or async) once a webview is disposed; disposal
   * can race our quota/rules listeners, so every send goes through here and
   * a dead surface is dropped instead of surfacing "Webview is disposed".
   */
  private safePost(webview: vscode.Webview, msg: HostToWebview): void {
    try {
      Promise.resolve(webview.postMessage(msg)).then(undefined, () => {
        this.surfaces.delete(webview);
        void this.pushTitlebarContext();
      });
    } catch {
      this.surfaces.delete(webview);
      void this.pushTitlebarContext();
    }
  }

  /** reveal() throws once a panel is disposed under us; treat that as gone. */
  private safeReveal(panel: vscode.WebviewPanel | undefined): boolean {
    if (!panel) return false;
    try {
      panel.reveal();
      return true;
    } catch {
      return false;
    }
  }

  /** Ein Editor-Reiter für eine der Cortex-Seiten, mit dem Cortex-Symbol. */
  private createTab(viewType: string, title: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
      viewType,
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'tab-icon.svg');
    return panel;
  }

  /** Opens (or reveals) the editor tab bound to a conversation. */
  openConversationTab(id: string): void {
    const rec = this.conversations.get(id);
    if (!rec) return;

    const existing = this.panels.get(id);
    if (this.safeReveal(existing)) return;
    if (existing) this.panels.delete(id);

    const panel = this.createTab('cortex.chatTab', rec.title || 'New chat');
    this.panels.set(id, panel);
    this.attach(panel.webview, { mode: 'tab', conversationId: id });
    panel.onDidDispose(() => {
      this.surfaces.delete(panel.webview);
      this.panels.delete(id);
      // A never-used chat vanishes when its tab closes.
      const record = this.conversations.get(id);
      if (record && record.log.length === 0 && this.queues.items(id).length === 0) {
        this.conversations.delete(id);
        this.sessions.clearConversation(id);
      }
      this.sendConversations();
    });
    this.sendConversations();
  }

  /** Opens (or reveals) the clean accounts management tab. */
  openAccountsTab(): void {
    if (this.agentPanel) {
      this.safePost(this.agentPanel.webview, { kind: 'showPage', page: 'accounts' });
      this.safeReveal(this.agentPanel);
      return;
    }
    if (this.safeReveal(this.accountsPanel)) return;
    this.accountsPanel = undefined;
    const panel = this.createTab('cortex.accountsTab', 'cortex · Accounts');
    this.accountsPanel = panel;
    this.attach(panel.webview, { mode: 'accounts' });
    panel.onDidDispose(() => {
      this.surfaces.delete(panel.webview);
      this.accountsPanel = undefined;
    });
  }

  /** Opens (or reveals) the routing-rules tab. */
  openRulesTab(): void {
    if (this.safeReveal(this.rulesPanel)) return;
    this.rulesPanel = undefined;
    const panel = this.createTab('cortex.rulesTab', 'cortex · Rules');
    this.rulesPanel = panel;
    this.attach(panel.webview, { mode: 'rules' });
    panel.onDidDispose(() => {
      this.surfaces.delete(panel.webview);
      this.rulesPanel = undefined;
    });
  }

  /** Opens (or reveals) the analytics tab. */
  openAnalyticsTab(): void {
    if (this.safeReveal(this.analyticsPanel)) return;
    this.analyticsPanel = undefined;
    const panel = this.createTab('cortex.analyticsTab', 'cortex · Analytics');
    this.analyticsPanel = panel;
    this.attach(panel.webview, { mode: 'analytics' });
    panel.onDidDispose(() => {
      this.surfaces.delete(panel.webview);
      this.analyticsPanel = undefined;
    });
  }

  /**
   * Ein Werkzeug, das aus der Fenster-Titelleiste kommt. Die Leiste liegt über
   * allen Editor-Gruppen und damit außerhalb der Webview — der Weg dorthin
   * führt deshalb über einen echten Befehl statt über einen Knopf im Chat.
   */
  /** Vorschau aus der Titelleiste: offen → schließen, sonst öffnen. */
  async openPreview(): Promise<void> {
    const surface = this.agentPanel ? this.surfaces.get(this.agentPanel.webview) : undefined;
    if (!surface) return;
    await this.dispatchMessage(
      this.sidePanes.browser ? { kind: 'closeBrowser' } : { kind: 'openBrowser' },
      this.agentPanel!.webview,
    );
  }

  /** „Browser schließen“ aus dem Chat-Menü: schließt nur, öffnet nie. */
  async closeBrowser(): Promise<void> {
    const webview = this.agentPanel?.webview;
    if (!webview || !this.surfaces.get(webview)) return;
    await this.dispatchMessage({ kind: 'closeBrowser' }, webview);
  }

  /** Excalidraw-Flächen, die gerade im Dock offen sind: Chat → ihr Inhalt als Text. */
  private readonly canvasSeen = new Map<string, string>();
  /** Beschreibung der gespeicherten Zeichnung eines Chats; `null` heißt: keine. */
  private readonly canvasSaved = new Map<string, string | null>();

  /** Der Terminal-Knopf oben rechts — siehe SidePanes.toggleTerminalDock. */
  toggleTerminalDock(): Promise<void> {
    return this.panes.toggleTerminalDock();
  }

  /** Ob das Datei-Dock der Webview offen ist; es meldet sich als `dockState`. */
  private dockOpen = false;

  /** Siehe titlebarContext in host/shell.ts. */
  private pushTitlebarContext(): Thenable<unknown> {
    return titlebarContext(this.panelHost);
  }

  /**
   * Die Aktionen hinter den drei Punkten der Kopfzeile.
   *
   * Alle beziehen sich auf den gerade sichtbaren Chat. Sie liegen hier und
   * nicht in `commands.ts`, weil nur der Provider die Aufzeichnung besitzt —
   * Titel, Verlauf und die Zuordnung zum Projekt.
   */
  private visibleRecord(): ConversationRecord | undefined {
    const id = this.visibleConversationId();
    return id ? this.conversations.get(id) : undefined;
  }

  async renameChat(): Promise<void> {
    const rec = this.visibleRecord();
    if (!rec) return;
    const title = await vscode.window.showInputBox({
      prompt: 'Wie soll dieser Chat heißen?',
      value: rec.title === 'New chat' ? '' : rec.title,
      placeHolder: 'Kurzer Name',
    });
    if (title === undefined) return;
    rec.title = title.trim() || rec.title;
    this.sendConversations();
    await this.persistNow();
  }

  /**
   * Der Verlauf als Klartext.
   *
   * Er öffnet als Reiter im Dock, nicht als Editor daneben: Cortex blendet die
   * Reiterleiste der Workbench aus, ein Editor ließe sich also mit der Maus
   * nicht mehr schließen. Im Dock trägt der Reiter sein × wie jeder andere.
   */
  private transcriptText(rec: ConversationRecord): string {
    return rec.turns.length
      ? rec.turns.map(turn => `## ${turn.role === 'user' ? 'Du' : 'Cortex'}\n\n${turn.text.trim()}`).join('\n\n')
      : '_Dieser Chat hat noch keinen Verlauf._';
  }

  showTranscript(): void {
    const rec = this.visibleRecord();
    if (!rec) { void vscode.window.showInformationMessage('Kein offener Chat.'); return; }
    if (!this.agentPanel) return;
    this.safeReveal(this.agentPanel);
    this.safePost(this.agentPanel.webview, {
      kind: 'transcript',
      title: rec.title,
      turns: rec.turns.map(turn => ({ role: turn.role, text: turn.text })),
    });
  }

  /**
   * Der ganze Chat als JSON-Datei — für ein Archiv oder als Übergabe an ein
   * anderes Werkzeug. Gespeichert wird, was den Chat ausmacht: Titel, Projekt,
   * Zeitpunkte und die Wortwechsel in ihrer Reihenfolge; nicht der interne
   * Protokollstrom der Oberfläche.
   */
  async exportChat(conversationId = this.visibleConversationId()): Promise<void> {
    const rec = conversationId ? this.conversations.get(conversationId) : undefined;
    if (!rec) { void vscode.window.showInformationMessage('Kein offener Chat.'); return; }
    const daten = {
      app: 'Cortex',
      exportiert: new Date().toISOString(),
      chat: {
        id: rec.id,
        titel: rec.title,
        projekt: rec.projectPath,
        erstellt: new Date(rec.createdAt).toISOString(),
        geändert: new Date(rec.updatedAt).toISOString(),
      },
      verlauf: rec.turns.map(turn => ({ rolle: turn.role === 'user' ? 'du' : 'cortex', text: turn.text })),
    };
    const name = (rec.title || 'Chat').replace(/[\\/:*?"<>|]/g, '-').slice(0, 60).trim() || 'Chat';
    const ziel = await vscode.window.showSaveDialog({
      title: 'Chat exportieren',
      saveLabel: 'Exportieren',
      defaultUri: vscode.Uri.file(join(rec.projectPath ?? homedir(), `${name}.json`)),
      filters: { JSON: ['json'] },
    });
    if (!ziel) return;
    await vscode.workspace.fs.writeFile(ziel, Buffer.from(JSON.stringify(daten, null, 2) + '\n', 'utf8'));
    void vscode.window.showInformationMessage(`Chat exportiert: ${basename(ziel.fsPath)}`);
  }

  /** Der ganze Chat in der Zwischenablage — zum Weitergeben an einen anderen Agenten. */
  async copyChat(conversationId = this.visibleConversationId()): Promise<void> {
    const rec = conversationId ? this.conversations.get(conversationId) : undefined;
    if (!rec) { void vscode.window.showInformationMessage('Kein offener Chat.'); return; }
    await vscode.env.clipboard.writeText(`# ${rec.title}\n\n${this.transcriptText(rec)}\n`);
    const n = rec.turns.length;
    void vscode.window.showInformationMessage(n ? `Chat kopiert — ${n} Beiträge.` : 'Chat kopiert — noch ohne Verlauf.');
  }

  /**
   * Eine Kopie ab dem jetzigen Stand. Der Verlauf wird geteilt, nicht bewegt:
   * am ursprünglichen Chat ändert sich nichts, die Abzweigung führt ihn weiter.
   */
  async forkChat(conversationId = this.visibleConversationId()): Promise<void> {
    const rec = conversationId ? this.conversations.get(conversationId) : undefined;
    if (!rec) return;
    await this.branchConversation(rec, rec.log, rec.turns);
    await this.persistNow();
  }

  /**
   * Ein neuer Chat im selben Projekt mit diesem Verlauf. Er nimmt den Kontext
   * mit: seine erste Nachricht zweigt die Sitzung des Anbieters an der letzten
   * Antwort ab, statt dem Modell den Verlauf neu zu erzählen. Der ursprüngliche
   * Chat und seine Sitzung bleiben, wie sie sind.
   */
  private async branchConversation(
    rec: ConversationRecord,
    log: HostToWebview[],
    turns: ConversationRecord['turns'],
  ): Promise<string | undefined> {
    const cwd = await this.conversationCwd(rec.id);
    const choice = await vscode.window.showWarningMessage('Wie soll der Chat abzweigen?', { modal: true, detail: 'Ein eigener Git-Arbeitsordner trennt die Dateien beider Chats. Er übernimmt versionierte und neue nicht ignorierte Dateien; Abhängigkeiten müssen dort gegebenenfalls neu installiert werden. Im gemeinsamen Ordner sehen beide dieselben Änderungen; Cortex führt ihre Aufträge nacheinander aus.' }, 'Eigener Git-Arbeitsordner', 'Gemeinsamer Ordner');
    if (!choice) return undefined;
    let projectPath = rec.projectPath;
    const isolated = choice === 'Eigener Git-Arbeitsordner';
    if (isolated) {
      try { projectPath = await createForkWorkspace(cwd, join(this.ctx.globalStorageUri.fsPath, 'abzweige')); }
      catch (error) { this.toConversation(rec.id, { kind: 'notice', text: `Abzweig nicht erstellt: ${String(error)}. Für Ordner ohne Git kannst du „Gemeinsamer Ordner“ wählen.` }); return undefined; }
    }
    const id = shortId();
    this.conversations.set(id, {
      ...rec,
      id,
      projectPath,
      archived: undefined,
      pinned: undefined,
      contextCompaction: rec.contextCompaction && rec.contextCompaction.throughTurns <= turns.length ? { ...rec.contextCompaction } : undefined,
      title: `${rec.title || 'Chat'} (Abzweig)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      log: log.filter(msg => !isolated || (msg.kind !== 'revertState' && msg.kind !== 'reverted')).map(msg => ({ ...msg })),
      turns: turns.map(turn => ({ ...turn })),
      baselines: isolated ? undefined : rec.baselines && { ...rec.baselines },
      pendingPermissionNotes: rec.pendingPermissionNotes && [...rec.pendingPermissionNotes],
    });
    const compact = this.conversations.get(id)?.contextCompaction;
    this.sessions.rewind(id, workingHistory(turns, compact), isolated || compact ? undefined : this.forkTarget(latestCheckpoint(log)));
    if (this.agentPanel) this.bindAgent(id); else this.openConversationTab(id);
    return id;
  }

  private forkTarget(checkpoint: import('./protocol.js').TurnCheckpoint | undefined) {
    return checkpoint && { target: checkpoint.target, cwd: checkpoint.cwd, sessionId: checkpoint.sessionId, checkpoint: checkpoint.anchor };
  }

  /**
   * Zurück vor deine `index`-te Nachricht. Sie und alles danach verlassen den
   * Chat — die Anzeige und den Kontext des Modells: die Sitzung des Anbieters
   * zweigt an der letzten Antwort davor ab, andere fangen mit dem gekürzten
   * Verlauf neu an. Dateien bleiben unberührt; dafür gibt es „Rückgängig
   * machen“ an der Änderungskarte.
   *
   * `fork` lässt den Chat selbst stehen und macht dasselbe in einer Kopie.
   */
  private async rewindConversation(
    id: string,
    index: number,
    mode: 'rewind' | 'edit' | 'fork',
  ): Promise<{ id: string; echo: Extract<HostToWebview, { kind: 'userEcho' }> } | undefined> {
    const rec = this.conversations.get(id);
    if (!rec) return undefined;
    if (mode !== 'fork' && (this.tasks.has(id) || this.queues.isWorking(id))) {
      this.toConversation(id, { kind: 'notice', text: 'Zurückgehen geht erst, wenn der Auftrag fertig oder angehalten ist.' }, { log: false });
      return undefined;
    }
    const plan = rewindPlan(rec.log, rec.turns, index);
    if (!plan) return undefined;
    if (mode === 'fork') {
      const branch = await this.branchConversation(rec, plan.log, plan.turns);
      if (!branch) return undefined;
      await this.persistNow();
      return { id: branch, echo: plan.echo };
    }
    const later = plan.dropped - 1;
    if (later > 0) {
      const choice = await vscode.window.showWarningMessage(
        mode === 'edit' ? 'Nachricht bearbeiten und neu senden?' : 'Zu dieser Nachricht zurückgehen?',
        {
          modal: true,
          detail: `${later === 1 ? 'Die Nachricht danach und ihre Antwort verschwinden' : `Die ${later} Nachrichten danach und ihre Antworten verschwinden`} aus diesem Chat und aus dem Kontext des Modells. Geänderte Dateien bleiben, wie sie sind. Den bisherigen Verlauf behältst du mit „Abzweigen“.`,
        },
        mode === 'edit' ? 'Neu senden' : 'Zurückgehen',
      );
      if (!choice) return undefined;
      // Während der Rückfrage kann ein Auftrag losgelaufen sein.
      if (this.tasks.has(id) || this.queues.isWorking(id) || this.conversations.get(id) !== rec) return undefined;
    }
    rec.log = plan.log;
    rec.turns = plan.turns;
    if (rec.contextCompaction && rec.contextCompaction.throughTurns > plan.turns.length) rec.contextCompaction = undefined;
    rec.updatedAt = Date.now();
    // Der Zettel kann Entscheidungen aus den zurückgenommenen Runden tragen;
    // mit der nächsten Antwort entsteht er neu aus dem, was übrig ist.
    rec.notizen = undefined;
    this.erinnerung.vergiss(id);
    this.sessions.rewind(id, workingHistory(plan.turns, rec.contextCompaction), rec.contextCompaction ? undefined : this.forkTarget(plan.checkpoint));
    this.threadContext.delete(id);
    this.crowdedThreads.delete(id);
    for (const [webview, surface] of this.surfaces) {
      if (surface.conversationId !== id) continue;
      if (surface.mode === 'agent') this.replayAgent(webview, id);
      else if (surface.mode === 'tab') this.hydrate(webview, surface);
    }
    this.sendConversations();
    await this.persistNow();
    return { id, echo: plan.echo };
  }

  /** Archiviert bleibt der Chat erhalten, verschwindet aber aus der Leiste. */
  async archiveChat(conversationId = this.visibleConversationId()): Promise<void> {
    const rec = conversationId ? this.conversations.get(conversationId) : undefined;
    if (!rec) return;
    rec.archived = true;
    this.queues.pause(rec.id);
    if (this.visibleConversationId() === rec.id) {
      const next = [...this.conversations.values()].filter(c => c.id !== rec.id && !c.archived).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)[0];
      if (next) this.bindAgent(next.id); else this.newConversation(rec.projectPath);
    }
    this.sendConversations();
    await this.persistNow();
    const undo = await vscode.window.showInformationMessage(`„${rec.title}“ archiviert.`, 'Rückgängig');
    if (undo === 'Rückgängig') await this.restoreConversation(rec.id);
  }

  private async restoreConversation(id: string): Promise<void> {
    const rec = this.conversations.get(id);
    if (!rec?.archived) return;
    rec.archived = false;
    this.sendConversations();
    await this.persistNow();
  }

  private async pinChat(id: string): Promise<void> {
    const rec = this.conversations.get(id);
    if (!rec) return;
    rec.pinned = !rec.pinned;
    this.sendConversations();
    await this.persistNow();
  }

  private compactingChats = new Map<string, AbortController>();

  /** Only the model's working context shrinks; exports and the visible transcript stay whole. */
  private async compactChat(id: string): Promise<void> {
    const rec = this.conversations.get(id);
    if (!rec) return;
    const notice = (text: string) => this.toConversation(id, { kind: 'notice', text });
    if (this.compactingChats.has(id)) { notice('Der Kontext wird bereits verdichtet.'); return; }
    if (this.tasks.has(id) || this.queues.isWorking(id) || this.queues.items(id).length) { notice('Kontext verdichten geht erst, wenn der Auftrag und seine Warteschlange beendet sind.'); return; }
    const target = this.shownTarget(id);
    if (!target) { notice('Wähle zuerst ein verbundenes Modell für die Zusammenfassung.'); return; }
    let plan: ReturnType<typeof compactionPlan>;
    try { plan = compactionPlan(rec.turns, rec.contextCompaction); }
    catch (error) { notice((error as Error).message); return; }
    if (!plan) { notice('Der bisherige Kontext ist noch kurz; es gibt keine älteren Beiträge zu verdichten.'); return; }
    const source = JSON.stringify(rec.turns);
    const before = rec.contextCompaction;
    const abort = new AbortController();
    this.compactingChats.set(id, abort);
    notice('Der bisherige Kontext wird zusammengefasst. Der vollständige Chat bleibt erhalten.');
    const timeout = setTimeout(() => abort.abort(), 120_000);
    try {
      const cwd = await this.conversationCwd(id);
      const summary = await this.askOffThread(target, plan.prompt, abort.signal, undefined, { cwd, teamAgent: rec.teamAgent });
      if (abort.signal.aborted || !validCompactionSummary(summary, plan.sourceTokens)) { notice('Der Kontext konnte nicht zuverlässig verdichtet werden. Der bisherige Kontext bleibt erhalten.'); return; }
      if (this.conversations.get(id) !== rec || JSON.stringify(rec.turns) !== source || rec.contextCompaction !== before || this.tasks.has(id) || this.queues.isWorking(id) || this.queues.items(id).length) { notice('Der Chat hat sich inzwischen geändert. Der bisherige Kontext bleibt erhalten.'); return; }
      const owned = <T>(data: Record<string, T>) => Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith(`${id}::`)));
      const native = owned(this.sessions.serializeNative()), forkPoints = owned(this.sessions.serializeForkPoints()), seen = owned(this.sessions.serializeSeen());
      const briefs = owned(this.sessions.serializeBriefs()), taskBriefs = owned(this.sessions.serializeTaskBriefs());
      const history = this.sessions.getHistory(id).map(turn => ({ ...turn }));
      rec.contextCompaction = { summary: summary.trim(), throughTurns: plan.throughTurns };
      this.sessions.rewind(id, workingHistory(rec.turns, rec.contextCompaction));
      try { await this.persistNow(); }
      catch (error) {
        rec.contextCompaction = before;
        this.sessions.rewind(id, history);
        this.sessions.restoreNative(native); this.sessions.restoreForkPoints(forkPoints); this.sessions.restoreSeen(seen);
        this.sessions.restoreBriefs(briefs); this.sessions.restoreTaskBriefs(taskBriefs);
        await this.persistNow().catch(() => undefined);
        throw error;
      }
      this.threadContext.delete(id);
      this.crowdedThreads.delete(id);
      notice('Kontext verdichtet: Zusammenfassung und die letzten vier Beiträge bilden den nächsten Modellkontext. Der vollständige Chat bleibt erhalten.');
    } catch (error) {
      this.output.appendLine(`[compact] ${(error as Error).message}`);
      notice('Der Kontext konnte nicht verdichtet werden. Der vollständige Chat und der bisherige Kontext bleiben erhalten.');
    } finally {
      clearTimeout(timeout);
      this.compactingChats.delete(id);
    }
  }

  private async chatCommand(id: string, action: Extract<WebviewToHost, { kind: 'chatCommand' }>['action']): Promise<void> {
    if (!this.conversations.has(id)) return;
    switch (action) {
      case 'archive': await this.archiveChat(id); break;
      case 'pin': await this.pinChat(id); break;
      case 'fork': await this.forkChat(id); break;
      case 'export': await this.exportChat(id); break;
      case 'copy': await this.copyChat(id); break;
      case 'compact': await this.compactChat(id); break;
      case 'feedback': {
        const available = await vscode.commands.getCommands(true);
        if (available.includes('workbench.action.openIssueReporter')) await vscode.commands.executeCommand('workbench.action.openIssueReporter', { extensionId: this.ctx.extension.id });
        else this.toConversation(id, { kind: 'notice', text: 'Die interne Feedback-Ansicht ist in dieser Cortex-Installation nicht verfügbar.' });
        break;
      }
    }
  }

  async deleteChat(): Promise<void> {
    const rec = this.visibleRecord();
    if (!rec) return;
    const yes = await vscode.window.showWarningMessage(
      `„${rec.title}“ löschen?`, { modal: true, detail: 'Der Verlauf ist danach fort. Archivieren behält ihn.' }, 'Löschen');
    if (yes !== 'Löschen') return;
    await this.deleteConversation(rec.id);
  }

  toolbarAction(action: 'files' | 'dock' | 'changes' | 'canvas' | 'video' | 'browser' | 'terminal' | 'sidebar' | 'project' | 'overview'): void {
    if (action === 'terminal') { void this.toggleTerminalDock(); return; }
    if (action === 'browser') { void this.openPreview(); return; }
    if (!this.agentPanel) return;
    this.safeReveal(this.agentPanel);
    this.safePost(this.agentPanel.webview, { kind: 'toolbar', action });
  }

  // ── conversations ────────────────────────────────────────────────

  newConversation(projectPath?: string): void {
    if (projectPath && !this.projects().some(p => p.path === projectPath)) return;
    const rec: ConversationRecord = {
      id: shortId(),
      title: '',
      projectPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      log: [],
      turns: [],
    };
    this.conversations.set(rec.id, rec);
    if (this.agentPanel) this.bindAgent(rec.id);
    else this.openConversationTab(rec.id);
  }

  /** Full-window ChatGPT-style shell — the Cortex home screen. */
  /**
   * Beim Start steht ein leeres Blatt, nicht das zuletzt Gelesene.
   *
   * Vorher wurde die jüngste Unterhaltung wieder aufgeschlagen — wer Cortex
   * öffnet, landete mitten in einem alten, langen Verlauf, statt anfangen zu
   * können. Ein *bestehender* leerer Chat wird dabei wiederverwendet: sonst
   * sammelte jeder Neustart eine weitere „Neue Aufgabe" in der Seitenleiste an.
   */
  openAgentHome(): void {
    if (this.safeReveal(this.agentPanel)) return;
    const blank = [...this.conversations.values()]
      .filter(c => c.turns.length === 0 && c.log.length === 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const id = blank?.id ?? shortId();
    if (!this.conversations.has(id)) {
      this.conversations.set(id, {
        id,
        title: '',
        projectPath: this.projectRoot(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        log: [],
        turns: [],
      });
    }
    const panel = vscode.window.createWebviewPanel(
      'kortex.agent',
      'Cortex',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    const webview = panel.webview;
    this.agentPanel = panel;
    this.attach(webview, { mode: 'agent', conversationId: id });
    panel.onDidChangeViewState(() => { void this.pushTitlebarContext(); });
    panel.onDidDispose(() => {
      // The panel's webview getter throws once disposal has begun.
      this.surfaces.delete(webview);
      if (this.agentPanel === panel) this.agentPanel = undefined;
      void this.pushTitlebarContext();
    });
  }

  private bindAgent(id: string): void {
    if (!this.agentPanel) return;
    const surface = this.surfaces.get(this.agentPanel.webview);
    const previous = surface?.conversationId;
    if (surface) surface.conversationId = id;
    if (previous !== id) void this.panes.swapBrowser(id, this.agentPanel.webview);
    this.replayAgent(this.agentPanel.webview, id);
    this.safePost(this.agentPanel.webview, this.pinnedMessage(id));
    this.safePost(this.agentPanel.webview, { kind: 'chatLocation', conversationId: id, ...(this.conversations.get(id)?.location ? { location: this.conversations.get(id)!.location } : {}) });
    void this.pushWorkspace(this.agentPanel.webview);
    this.sendConversations();
  }

  private replayAgent(webview: vscode.Webview, id: string): void {
    const rec = this.conversations.get(id);
    this.safePost(webview, { kind: 'conversationReset' });
    void this.pushQueue(id);
    if (rec) {
      for (const msg of rec.log) this.safePost(webview, this.replayable(msg, rec.projectPath, webview));
      for (const messageId of Object.keys(rec.baselines ?? {})) this.safePost(webview, { kind: 'revertState', messageId, available: true });
      this.safePost(webview, { kind: 'busy', running: this.tasks.has(id) });
      this.safePost(webview, { kind: 'runClock', elapsedMs: this.runClocks.get(id)?.elapsed() ?? 0 });
    }
    this.safePost(webview, { kind: 'conversationReady' });
  }

  /** Ein gespeicherter Eintrag so, wie das Panel ihn heute bekäme. */
  private replayable(msg: HostToWebview, root?: string, webview?: vscode.Webview): HostToWebview {
    // Webview resource addresses belong to the receiving surface. Rebuild them
    // after a restart or when the same conversation opens in another panel.
    if (msg.kind === 'image' && webview && underRoot(msg.path, this.imageRoots())) {
      return { ...msg, src: webview.asWebviewUri(vscode.Uri.file(msg.path)).toString() };
    }
    return root && msg.kind === 'toolUse' && msg.path ? { ...msg, path: projectRelative(msg.path, root) } : msg;
  }

  /** Most recent conversation, or a fresh one. */
  openMostRecent(): void {
    const newest = [...this.conversations.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (newest) this.openConversationTab(newest.id);
    else this.newConversation();
  }

  /** /clear — wipe transcript + engine context of one conversation, keep the tab. */
  clearConversation(id: string): void {
    const rec = this.conversations.get(id);
    if (!rec) return;
    this.compactingChats.get(id)?.abort();
    this.queues.delete(id);
    this.tasks.get(id)?.abort();
    this.tasks.delete(id);
    rec.log = [];
    rec.turns = [];
    rec.contextCompaction = undefined;
    rec.title = '';
    this.sessions.clearConversation(id);
    this.threadContext.delete(id);
    // A cleared chat is the fresh start the warning asked for.
    this.crowdedThreads.delete(id);
    const panel = this.panels.get(id);
    if (panel) panel.title = 'New chat';
    for (const [webview, surface] of this.surfaces) {
      if (surface.mode === 'tab' && surface.conversationId === id) {
        this.safePost(webview, { kind: 'conversationReset' });
        this.safePost(webview, { kind: 'busy', running: false });
        this.safePost(webview, { kind: 'conversationReady' });
      }
    }
    this.sendConversations();
    this.persistSoon();
  }

  deleteConversation(id: string): void {
    const rec = this.conversations.get(id);
    if (!rec) return;
    this.compactingChats.get(id)?.abort();
    this.queues.delete(id);
    this.tasks.get(id)?.abort();
    this.tasks.delete(id);
    this.panels.get(id)?.dispose();
    this.conversations.delete(id);
    this.sessions.clearConversation(id);
    // Die Zeichnung gehört zum Chat und geht mit ihm.
    this.canvas.forget(id);
    if (this.visibleConversationId() === id) {
      const next = [...this.conversations.values()].find(c => c.projectPath === rec.projectPath);
      if (next) this.bindAgent(next.id); else this.newConversation(rec.projectPath);
    }
    this.sendConversations();
    this.persistSoon();
  }

  cancelAll(): void {
    this.teamRunner?.dispose();
    for (const controller of this.compactingChats.values()) controller.abort();
    this.compactingChats.clear();
    for (const id of this.conversations.keys()) this.queues.pause(id);
    for (const [id, controller] of this.tasks) {
      controller.abort();
      this.markStopped(id, 'stopped');
      this.toConversation(id, { kind: 'busy', running: false }, { log: false });
    }
    this.tasks.clear();
    this.sendConversations();
  }

  /**
   * Closes off whatever was streaming. A cancelled run never reaches `result`,
   * so nothing else ever marks that turn finished: the answer would keep a
   * blinking cursor and its agents would look like they were still working,
   * every time the conversation is reopened.
   */
  private markStopped(conversationId: string, reason?: string): void {
    const live = this.liveRuns.get(conversationId);
    const messageId = live?.messageIds[Math.min(live.turnIdx, live.messageIds.length - 1)];
    if (!messageId) return;
    this.toConversation(conversationId, { kind: 'stopped', messageId, reason });
  }

  private metas(archived = false): ConversationMeta[] {
    return [...this.conversations.values()]
      .filter((c) => {
        const agentId = this.agentPanel
          ? this.surfaces.get(this.agentPanel.webview)?.conversationId
          : undefined;
        if (!!c.archived !== archived) return false;
        return c.pinned || c.archived || c.log.length > 0 || this.queues.items(c.id).length > 0 || this.panels.has(c.id) || c.id === agentId;
      })
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
      .map((c) => ({
        id: c.id,
        title: c.title || 'New chat',
        updatedAt: c.updatedAt,
        running: this.tasks.has(c.id),
        projectPath: c.projectPath,
        target: c.pinnedTarget,
        pinned: c.pinned,
        archived: c.archived,
        ...(c.teamAgent ? { background: true, ...(this.swarmOf(c.id)?.origin ? { parentId: this.swarmOf(c.id)!.origin } : {}) } : {}),
      }));
  }

  private sendConversations(): void {
    const list = this.metas();
    for (const [webview, surface] of this.surfaces) {
      if (surface.mode === 'sidebar' || surface.mode === 'agent') {
        this.safePost(webview, {
          kind: 'conversations',
          list,
          archivedList: this.metas(true),
          activeId: surface.conversationId ?? '',
        });
      }
    }
  }

  async saveBeforeRestart(): Promise<void> {
    this.cancelAll();
    if (this.persistTimer) clearTimeout(this.persistTimer);
    await this.persistNow();
  }

  private async persistNow(): Promise<void> {
    // Before the cap, and over every conversation: the one about to be dropped
    // is precisely the one that has to reach disk.
    this.exokortex.schreibe(this.conversations.values());
    const list = [...this.conversations.values()]
      .filter((c) => c.pinned || c.archived || c.log.length > 0 || this.queues.items(c.id).length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .filter((c, index) => index < MAX_CONVERSATIONS || c.pinned || c.archived || this.queues.items(c.id).length > 0);
    await Promise.all([this.ctx.globalState.update(CONV_KEY, list),
      this.ctx.globalState.update(NATIVE_SESSIONS_KEY, this.sessions.serializeNative()),
      this.ctx.globalState.update(FORK_POINTS_KEY, this.sessions.serializeForkPoints()),
      this.ctx.globalState.update(SEEN_TURNS_KEY, this.sessions.serializeSeen()),
      this.ctx.globalState.update(TASK_BRIEFS_KEY, this.sessions.serializeTaskBriefs()),
      this.ctx.globalState.update(SYSTEM_BRIEFS_KEY, this.sessions.serializeBriefs()),
      this.ctx.globalState.update(QUEUE_KEY, this.queues.snapshot())]);
  }

  private persistSoon(): void {
    if (this.disposing) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => { void this.persistNow().catch(error => this.output.appendLine(`[persist] ${String(error)}`)); }, 800);
  }

  // ── messaging ────────────────────────────────────────────────────

  private toConversation(
    conversationId: string,
    msg: HostToWebview,
    opts: { log: boolean } = { log: true },
  ): void {
    const updateTeam = this.teamUpdates?.get(conversationId);
    if (updateTeam) {
      if (msg.kind === 'activity') updateTeam({ activity: msg.text });
      if (msg.kind === 'toolUse') updateTeam({ activity: `${msg.name}${msg.detail ? ` · ${msg.detail}` : ''}`.slice(0, 250) });
    }
    if (opts.log && REPLAYED_KINDS.has(msg.kind)) {
      const rec = this.conversations.get(conversationId);
      if (rec) {
        rec.log.push(msg);
        rec.updatedAt = Date.now();
        this.persistSoon();
      }
    }
    for (const [webview, surface] of this.surfaces) {
      if (
        (surface.mode === 'tab' || surface.mode === 'agent') &&
        surface.conversationId === conversationId
      ) {
        this.safePost(webview, msg.kind === 'image' ? this.replayable(msg, undefined, webview) : msg);
      }
    }
  }

  private hydrate(webview: vscode.Webview, surface: Surface): void {
    if (surface.mode === 'sidebar') {
      this.safePost(webview, { kind: 'conversations', list: this.metas(), archivedList: this.metas(true), activeId: '' });
      this.safePost(webview, {
        kind: 'accounts',
        accounts: this.accountDtos(),
      } satisfies HostToWebview);
      return;
    }
    if (surface.mode === 'accounts') {
      this.safePost(webview, {
        kind: 'accounts',
        accounts: this.accountDtos(),
      } satisfies HostToWebview);
      // Fresh usage + identities on open; results fan out via listeners.
      void this.usageRefresher?.();
      void this.accountsHost.loadIdentities();
      return;
    }
    if (surface.mode === 'rules') {
      this.safePost(webview, rulesMessage(this.rules));
      this.safePost(webview, modesMessage());
      // The rule editor picks targets from the accounts that actually exist.
      this.safePost(webview, {
        kind: 'accounts',
        accounts: this.accountDtos(),
      } satisfies HostToWebview);
      return;
    }
    if (surface.mode === 'analytics') {
      pushAnalytics(this.panelHost, webview);
      return;
    }
    if (surface.mode === 'agent') {
      this.safePost(webview, { kind: 'projects', projects: this.projects() });
      void this.pushWorkspace(webview);
      this.safePost(webview, {
        kind: 'conversations',
        list: this.metas(),
        archivedList: this.metas(true),
        activeId: surface.conversationId ?? '',
      });
      this.safePost(webview, { kind: 'accounts', accounts: this.accountDtos() });
      this.safePost(webview, rulesMessage(this.rules));
      this.safePost(webview, modesMessage());
      this.replayAgent(webview, surface.conversationId ?? '');
      this.safePost(webview, this.pinnedMessage(surface.conversationId));
      void this.usageRefresher?.();
      void this.accountsHost.loadIdentities();
      return;
    }
    const rec = surface.conversationId
      ? this.conversations.get(surface.conversationId)
      : undefined;
    this.safePost(webview, { kind: 'conversationReset' } satisfies HostToWebview);
    this.safePost(webview, {
      kind: 'accounts',
      accounts: this.accountDtos(),
    } satisfies HostToWebview);
    this.safePost(webview, rulesMessage(this.rules));
    this.safePost(webview, modesMessage());
    this.safePost(webview, this.pinnedMessage(surface.conversationId));
    if (rec) {
      void this.pushQueue(rec.id);
      this.safePost(webview, { kind: 'runClock', elapsedMs: this.runClocks.get(rec.id)?.elapsed() ?? 0 });
      for (const msg of rec.log) this.safePost(webview, this.replayable(msg, rec.projectPath, webview));
      for (const messageId of Object.keys(rec.baselines ?? {})) this.safePost(webview, { kind: 'revertState', messageId, available: true });
      this.safePost(webview, {
        kind: 'busy',
        running: this.tasks.has(rec.id),
      } satisfies HostToWebview);
    }
    this.safePost(webview, { kind: 'conversationReady' } satisfies HostToWebview);
  }

  /** Der Zugang der Bereiche unter host/ — erst beim ersten Zugriff gebaut, siehe PanelHost. */
  private _panelHost?: ProviderBridge;
  private get panelHost(): ProviderBridge {
    if (this._panelHost) return this._panelHost;
    const provider = this;
    return this._panelHost = {
      get ctx() { return provider.ctx; },
      get output() { return provider.output; },
      get surfaces() { return provider.surfaces; },
      get conversations() { return provider.conversations; },
      get agentPanel() { return provider.agentPanel; },
      get rules() { return provider.rules; },
      get metrics() { return provider.metrics; },
      get htmlPreview() { return provider.htmlPreview; },
      get accounts() { return provider.accounts; },
      get exokortexWatch() { return provider.exokortexWatch; },
      get erinnerung() { return provider.erinnerung; },
      get adapters() { return provider.adapters; },
      get pluginCredentials() { return provider.pluginCredentials; },
      get pluginConnections() { return provider.pluginConnections; },
      get pluginSwitches() { return provider.pluginSwitches; },
      get identities() { return provider.identities; },
      get openRouter() { return provider.openRouter; },
      get usageRefresher() { return provider.usageRefresher; },
      openTerminalDock: (...args) => this.panes.openTerminalDock(...args),
      get sidePanes() { return provider.sidePanes; },
      get browserChats() { return provider.browserChats; },
      get terminalDockVisible() { return provider.terminalDockVisible; },
      set terminalDockVisible(visible) { provider.terminalDockVisible = visible; },
      get dockOpen() { return provider.dockOpen; },
      set dockOpen(open) { provider.dockOpen = open; },
      imageRoots: () => this.imageRoots(),
      imageArchiveRoot: () => this.imageArchiveRoot(),
      imageSrc: (...args) => this.imageSrc(...args),
      attachmentDir: () => this.attachmentDir(),
      get queues() { return provider.queues; },
      get exokortex() { return provider.exokortex; },
      relinkProject: (...args) => this.relinkProject(...args),
      writeProjects: (...args) => this.writeProjects(...args),
      newConversation: (...args) => this.newConversation(...args),
      deleteConversation: (...args) => this.deleteConversation(...args),
      get canvasSeen() { return provider.canvasSeen; },
      get canvasSaved() { return provider.canvasSaved; },
      get sessions() { return provider.sessions; },
      get computerHistoryBridge() { return provider.computerHistoryBridge; },
      set computerHistoryBridge(bridge) { provider.computerHistoryBridge = bridge; },
      historyBridge: () => this.historyBridge(),
      get quota() { return provider.quota; },
      get authHealth() { return provider.authHealth; },
      get automationRuntime() { return provider.automationRuntime; },
      get teamRunner() { return provider.teamRunner; },
      teams: () => this.teams(),
      startAutomations: () => this.startAutomations(),
      startTeam: (...args) => this.startTeam(...args),
      pushTeams: (...args) => this.pushTeams(...args),
      bindAgent: (...args) => this.bindAgent(...args),
      openConversationTab: (...args) => this.openConversationTab(...args),
      chatCommand: (...args) => this.chatCommand(...args),
      restoreConversation: (...args) => this.restoreConversation(...args),
      rewindConversation: (...args) => this.rewindConversation(...args),
      get tasks() { return provider.tasks; },
      get compactingChats() { return provider.compactingChats; },
      handleSend: (...args) => this.handleSend(...args),
      shownTarget: (...args) => this.shownTarget(...args),
      markStopped: (...args) => this.markStopped(...args),
      steerQueuedMessage: (...args) => this.steerQueuedMessage(...args),
      retryLast: (...args) => this.retryLast(...args),
      answerPermission: (...args) => this.answerPermission(...args),
      pushWorkspace: (...args) => this.pushWorkspace(...args),
      post: (...args) => this.safePost(...args),
      broadcast: (msg, only) => {
        for (const [webview, surface] of this.surfaces) if (!only || only(surface)) this.safePost(webview, msg);
      },
      reveal: (...args) => this.safeReveal(...args),
      toConversation: (...args) => this.toConversation(...args),
      dispatch: (...args) => this.dispatchMessage(...args),
      visibleConversationId: () => this.visibleConversationId(),
      isRunning: id => this.tasks.has(id),
      persistNow: () => this.persistNow(),
      persistSoon: () => this.persistSoon(),
      sendConversations: () => this.sendConversations(),
      projectRoot: (...args) => this.projectRoot(...args),
      conversationCwd: (...args) => this.conversationCwd(...args),
      projects: () => this.projects(),
      pushProjects: () => this.pushProjects(),
      pushAccounts: () => this.pushAccounts(),
      accountDtos: () => this.accountDtos(),
      hydrate: (...args) => this.hydrate(...args),
      pushTitlebarContext: () => this.pushTitlebarContext(),
      openAccountsTab: () => this.openAccountsTab(),
      openRulesTab: () => this.openRulesTab(),
      openAnalyticsTab: () => this.openAnalyticsTab(),
      pushConnectors: (...args) => pushConnectors(this.panelHost, ...args),
    };
  }

  /** Die Handler je Nachricht. Erst beim ersten Zugriff gebaut: Tests erzeugen den Provider ohne Konstruktor. */
  private _handlers?: HandlerTable;
  private get handlers(): HandlerTable {
    return this._handlers ??= combineHandlers(
      rulesAnalyticsHandlers,
      bindDomain(shellTable, () => this.panelHost),
      templateHandlers,
      locationHandlers,
      bindDomain(remotionTable, () => this.remotion),
      bindDomain(exokortexTable, () => this.exokortexPanel),
      connectorHandlers,
      bindDomain(pluginTable, () => this.pluginSetup),
      bindDomain(settingsTable, () => this.settings),
      bindDomain(accountTable, () => this.accountsHost),
      bindDomain(fileTable, () => this.panelHost),
      bindDomain(sidePaneTable, () => this.panes),
      bindDomain(imageTable, () => this.panelHost),
      bindDomain(projectTable, () => this.panelHost),
      bindDomain(canvasTable, () => this.canvas),
      bindDomain(historyTable, () => this.panelHost),
      bindDomain(teamTable, () => this.panelHost),
      bindDomain(conversationTable, () => this.panelHost),
      bindDomain(rewindTable, () => this.panelHost),
      bindDomain(queueTable, () => this.panelHost),
    );
  }

  private async onMessage(msg: WebviewToHost, webview: vscode.Webview): Promise<void> {
    try {
      await this.dispatchMessage(msg, webview);
    } catch (e) {
      this.output.appendLine(`[ui] ${msg.kind} failed: ${(e as Error).stack ?? e}`);
      void vscode.window.showErrorMessage(`Cortex: Die Aktion konnte nicht abgeschlossen werden. ${(e as Error).message}`);
    }
  }

  private async dispatchMessage(msg: WebviewToHost, webview: vscode.Webview): Promise<void> {
    const surface = this.surfaces.get(webview);
    if (!surface) return;
    // Die einzige Umwandlung: jede Nachricht trifft genau ihren Handler.
    const handle = this.handlers[msg.kind] as ((msg: WebviewToHost, cx: MessageContext) => unknown) | undefined;
    // Eine Art, die keiner kennt, bleibt folgenlos — wie zuvor in der Weiche.
    if (!handle) return;
    // Ein Handler ohne Promise bleibt synchron, wie zuvor der Zweig der Weiche.
    const done = handle(msg, { host: this.panelHost, webview, surface });
    if (done instanceof Promise) await done;
  }

  // ── task lifecycle ───────────────────────────────────────────────

  private async performAction(conversationId: string, action: import('@cortex/core').SlashAction): Promise<void> {
    const notice = (t: string) => this.toConversation(conversationId, { kind: 'notice', text: t });
    switch (action) {
      case 'newChat':
        this.newConversation(this.conversations.get(conversationId)?.projectPath);
        break;
      case 'clearChat':
        this.clearConversation(conversationId);
        break;
      case 'openAccounts':
        this.openAccountsTab();
        notice('opened accounts');
        break;
      case 'openRules':
        this.openRulesTab();
        notice('opened routing rules');
        break;
      case 'refreshUsage':
        void this.usageRefresher?.(true);
        notice('refreshing usage…');
        break;
      case 'openTerminal':
        void vscode.commands.executeCommand('cortex.openInTerminal');
        break;
      case 'archiveChat': await this.chatCommand(conversationId, 'archive'); break;
      case 'pinChat': await this.chatCommand(conversationId, 'pin'); break;
      case 'forkChat': await this.chatCommand(conversationId, 'fork'); break;
      case 'exportChat': await this.chatCommand(conversationId, 'export'); break;
      case 'compactChat': await this.chatCommand(conversationId, 'compact'); break;
      case 'openFeedback': await this.chatCommand(conversationId, 'feedback'); break;
      case 'openMemory': case 'openConnectors': case 'openModel': case 'openSettings': case 'openTemplates': case 'createImage': case 'openSearch':
      case 'openDocumentTemplates': case 'openPresentationTemplates': case 'openSpreadsheetTemplates':
        this.toConversation(conversationId, { kind: 'slashAction', action }, { log: false });
        break;
    }
    this.sendConversations();
  }

  private async previewFor(path: string): Promise<string | undefined> {
    if (this.queuePreviews.size >= 24 && !this.queuePreviews.has(path)) this.queuePreviews.delete(this.queuePreviews.keys().next().value!);
    if (!this.queuePreviews.has(path)) this.queuePreviews.set(path, imagePreviewData(path, 2 * 1024 * 1024));
    return this.queuePreviews.get(path);
  }

  private canSteer(id: string, item: QueuedMessage): boolean {
    return !this.steerReason(id, item);
  }

  /**
   * Warum diese Nachricht nicht in den laufenden Auftrag darf — oder
   * `undefined`, wenn sie darf. Der Grund steht an der Schaltfläche: „geht
   * nicht“ allein sieht aus wie ein Fehler, obwohl die Nachricht ganz normal
   * nach dem laufenden Auftrag rausgeht.
   */
  private steerReason(id: string, item: QueuedMessage): string | undefined {
    const warten = 'Sie geht automatisch raus, sobald der laufende Auftrag fertig ist.';
    if (item.modes.image) return `Bildaufträge lassen sich nicht in einen laufenden Auftrag geben. ${warten}`;
    const task = this.tasks.get(id);
    if (!task || task.signal.aborted) return 'Steuern geht nur, während ein Auftrag läuft.';
    const live = this.liveRuns.get(id);
    if (!live) return `Der laufende Auftrag nimmt gerade nichts entgegen. ${warten}`;
    if (this.queues.isHeld(id)) return 'Eine andere Nachricht wird gerade übergeben.';
    if (!live.handle.inject) {
      return live.lastTarget?.provider
        ? `Der laufende Auftrag (${live.lastTarget.provider}) nimmt unterwegs keine Nachrichten an. ${warten}`
        : `Der laufende Auftrag nimmt noch keine Nachrichten an. ${warten}`;
    }
    // Modell und Reasoning-Stärke aus der Auswahl unten zählen hier nicht: wer
    // steuert, gibt die Nachricht dem laufenden Agenten, mit dessen Einstellungen.
    // Andere Berechtigungen dagegen schon — eine Nachricht mit engeren Rechten
    // darf nicht in einem Lauf mit weiteren landen.
    const abweichung = ([
      ['permissionMode', 'andere Berechtigungen'],
      ['askPermission', 'ein anderes Nachfragen bei Berechtigungen'],
    ] as const).find(([key]) => item.modes[key] !== undefined && item.modes[key] !== live.modes[key]);
    if (abweichung) return `Diese Nachricht hat ${abweichung[1]} als der laufende Auftrag. ${warten}`;
    // Nur ein im Text genanntes Ziel (@codex …) ist eine Absicht, die Auswahl unten nicht.
    const target = parseMention(item.text).mention;
    if (target && target.provider !== live.lastTarget?.provider) return `Diese Nachricht ist an ${target.provider} gerichtet, es läuft aber ${live.lastTarget?.provider ?? 'ein anderer Anbieter'}. ${warten}`;
    if (target?.account && target.account !== live.lastTarget?.account) return `Diese Nachricht ist an das Konto „${target.account}“ gerichtet, es läuft „${live.lastTarget?.account ?? 'ein anderes'}“. ${warten}`;
    if (target?.model && target.model !== live.lastTarget?.model) return `Diese Nachricht ist an ${target.model} gerichtet, es läuft ${live.lastTarget?.model ?? 'ein anderes Modell'}. ${warten}`;
    return undefined;
  }

  private async pushQueue(id: string): Promise<void> {
    const version = (this.queueVersions.get(id) ?? 0) + 1; this.queueVersions.set(id, version);
    const items = await Promise.all(this.queues.items(id).map(async item => {
      const reason = this.steerReason(id, item);
      return { id: item.id, text: item.text, canSteer: !reason, ...(reason ? { steerReason: reason } : {}), attachments: await Promise.all((item.modes.attachments ?? []).map(async path => ({ path, name: basename(path), preview: await this.previewFor(path) }))) };
    }));
    if (version !== this.queueVersions.get(id)) return;
    this.toConversation(id, { kind: 'messageQueue', conversationId: id, items, paused: this.queues.isPaused(id), pauseReason: this.queues.pauseReason(id) }, { log: false });
  }

  private preparedMessage(id: string, item: QueuedMessage): string {
    const root = this.projectRoot(id);
    const paths = item.modes.attachments ?? [];
    const shown = paths.map(path => root && !relative(root, path).startsWith('..') ? relative(root, path) : path);
    return item.text + (shown.length ? `\n\nAttached files:\n${shown.map(path => `- ${path}`).join('\n')}` : '');
  }

  private async handleSend(id: string, text: string, tags: string[], modes: QueuedMessage['modes'] = {}): Promise<void> {
    if (!text.trim() || !this.conversations.has(id)) return;
    if (modes.image && !isImageProvider(modes.imageProvider)) {
      this.toConversation(id, { kind: 'notice', text: 'Bilder erzeugen nur ChatGPT (Codex) und Grok. Wähle im Bildmodus eines dieser Konten.' });
      return;
    }
    const slash = modes.image ? undefined : matchSlashCommand(text, this.rules.getCustomCommands());
    if (slash?.cmd.kind === 'action' && slash.cmd.action) {
      await this.performAction(id, slash.cmd.action); return;
    }
    // `/remotion`: das Projekt entsteht jetzt, der Lauf wartet darauf (RemotionHost.prepare).
    if (!modes.image && asksForVideo(text)) this.remotion.prepare(id, modes.attachments ?? []);
    if (!this.queues.isWorking(id) && !this.queues.items(id).length) this.queues.resume(id);
    const config = vscode.workspace.getConfiguration('cortex');
    this.queues.enqueue(id, { id: shortId(), text: text.trim(), tags: [...tags], modes: { ...modes, permissionMode: modes.permissionMode ?? config.get<PermissionMode>('permissionMode', 'safe'), askPermission: modes.askPermission ?? config.get<boolean>('askPermission', false), routingMode: modes.routingMode ?? config.get<'auto' | 'manual'>('routingMode', 'auto'), target: modes.target && { ...modes.target }, attachments: modes.attachments && [...modes.attachments], ...(modes.image ? { image: { ...modes.image }, imageProvider: modes.imageProvider, target: undefined, permissionMode: 'safe' as PermissionMode } : {}) } });
    await this.persistNow();
  }

  private async removeImageBackground(id: string, queued: QueuedMessage): Promise<void> {
    const rec = this.conversations.get(id);
    const source = queued.modes.attachments?.[0];
    const original = rec?.log.find((event): event is Extract<HostToWebview, { kind: 'image' }> => event.kind === 'image' && event.path === source);
    if (!source || !original || !isGeneratedImage(source, this.imageRoots())) throw new Error('Wähle zuerst ein Bild aus diesem Chat zum Freistellen.');
    const abort = new AbortController(), messageId = shortId(), startedAt = Date.now();
    this.tasks.set(id, abort);
    this.toConversation(id, { kind: 'busy', running: true });
    this.toConversation(id, { kind: 'runClock', elapsedMs: 0 });
    this.toConversation(id, { kind: 'userEcho', text: queued.text, attachments: [source], at: startedAt });
    try {
      const output = await removeGeneratedImageBackground(source, join(this.ctx.extensionUri.fsPath, 'dist', 'cortex-image-tool'), abort.signal);
      if (abort.signal.aborted || this.conversations.get(id) !== rec) return;
      const path = await archiveGeneratedImage(output, this.imageArchiveRoot(), id);
      const src = await this.imageSrc(path);
      if (!src) throw new Error('Das freigestellte Bild konnte nicht geladen werden.');
      this.toConversation(id, { kind: 'image', messageId, path, src, prompt: original.prompt, edited: true, options: queued.modes.image });
      this.toConversation(id, { kind: 'delta', messageId, text: 'Hintergrund lokal entfernt. Das Bild hat einen transparenten Hintergrund.' });
      this.toConversation(id, { kind: 'done', messageId, at: Date.now(), durationMs: Date.now() - startedAt, turn: false });
    } catch (error) {
      if (!abort.signal.aborted) throw error;
    } finally {
      if (abort.signal.aborted && this.conversations.get(id) === rec) this.toConversation(id, { kind: 'stopped', messageId, reason: 'Freistellen angehalten.' });
      if (this.tasks.get(id) === abort) {
        this.tasks.delete(id);
        this.toConversation(id, { kind: 'busy', running: false });
      }
      await this.persistNow();
    }
  }

  /** Cortex' eigene Ablage für Bild-Anhänge (imageAttachments.ts). */
  private attachmentDir(): string {
    return join(this.ctx.globalStorageUri.fsPath, 'anhaenge', new Date().toISOString().slice(0, 10));
  }

  private async runQueuedMessage(id: string, queued: QueuedMessage): Promise<void | false> {
    if (!this.conversations.has(id)) return;
    const project = this.projectRoot(id);
    if (project && !existsSync(project) && !await this.relinkProject(project)) {
      this.queues.pause(id, 'stopped');
      this.toConversation(id, { kind: 'notice', text: 'Projektordner fehlt. Die Nachricht bleibt in der Warteschlange, bis du den Ordner neu zuweist und fortsetzt.' });
      return false;
    }
    if (!this.conversations.has(id)) return;
    const cwd = await this.conversationCwd(id);
    const key = await workspaceRunKey(cwd);
    if (!this.conversations.has(id)) return;
    if (this.queues.isPaused(id)) return false;
    // Ein Chatauftrag darf jede Datei ändern — er bekommt den Ordner allein.
    // Nur der Chat einer Schwarm-Rolle teilt ihn mit den anderen Rollen:
    // allein bekäme er ihn nie, solange sie arbeiten.
    const writes = !(this.conversations.get(id)?.teamAgent && this.swarmOf(id)?.shared);
    if (!this.holdProject(key, writes)) return false;
    try { await this.executeQueuedMessage(id, queued); }
    finally { this.releaseProject(key, writes); this.queues.retryBlockedProjects(); }
  }

  private async executeQueuedMessage(id: string, queued: QueuedMessage): Promise<void> {
    if (!this.conversations.has(id)) return;
    if (queued.modes.image?.edit?.kind === 'background') {
      await this.removeImageBackground(id, queued);
      return;
    }
    let item = queued;
    // Bilder vor dem Lauf in Cortex' Ablage: ein Bildschirmfoto aus der
    // Vorschau ist sonst fort, bis das Modell es lesen will.
    if (!item.modes.image && item.modes.attachments?.length) try {
      const dir = this.attachmentDir();
      const staged: string[] = [], missing: string[] = [];
      const ablage = join(this.ctx.globalStorageUri.fsPath, 'anhaenge');
      for (const path of item.modes.attachments) {
        // Schon in der Ablage (eingefügt oder aus der Vorschau gezogen): bleibt, wie es ist.
        const done = path.startsWith(ablage) && existsSync(path) ? path : await stageImage(path, dir).catch(() => undefined);
        if (done) staged.push(done); else missing.push(path);
      }
      if (missing.length) {
        this.output.appendLine(`[anhang] nicht mehr vorhanden: ${missing.join(', ')}`);
        this.toConversation(id, { kind: 'notice', text: `Nicht angehängt, die Datei ist nicht mehr da: ${missing.map(p => basename(p)).join(', ')}` });
      }
      item = { ...item, modes: { ...item.modes, attachments: staged } };
    } catch (err) {
      // Ablage gescheitert: der Auftrag geht trotzdem, mit den ursprünglichen Pfaden.
      this.output?.appendLine(`[anhang] Ablage übersprungen: ${(err as Error).message}`);
    }
    const image = item.modes.image;
    const provider = item.modes.imageProvider;
    const text = image ? item.text : this.preparedMessage(id, item);
    const rec = this.conversations.get(id)!;
    if (!rec.title) {
      rec.title = item.text.split('\n')[0]!.slice(0, 60);
      const panel = this.panels.get(id); if (panel) panel.title = rec.title;
    }
    this.toConversation(id, { kind: 'userEcho', text, attachments: item.modes.attachments, at: Date.now(), ...(image ? { image } : {}) });
    this.detectRetry(id, text);
    // `/remotion`: erst wenn Vorlage, Pakete und Material liegen, bekommt der Agent den Auftrag.
    const preparing = this.remotionHost?.pending(id);
    if (preparing) {
      this.toConversation(id, { kind: 'activity', text: 'Videoprojekt wird eingerichtet …' });
      await preparing;
      this.toConversation(id, { kind: 'activity' });
    }
    if (image && isImageProvider(provider)) {
      // Nur der Anbieter wird genannt; welches Konto zuerst drankommt, sagt die Folge.
      const accountOrder = this.imageOrder(provider);
      await this.runTask(id, `@${provider} ${imagePrompt(item.text, image, provider, item.modes.attachments)}`, item.tags, { ...item.modes, accountOrder });
      return;
    }
    await this.runTask(id, applyPinnedTarget(text, item.modes.target), item.tags, item.modes);
  }

  private async steerQueuedMessage(id: string, itemId: string): Promise<void> {
    const item = this.queues.items(id).find(m => m.id === itemId);
    if (!item || !this.canSteer(id, item)) return;
    const live = this.liveRuns.get(id)!;
    const text = this.preparedMessage(id, item);
    const turnIdx = live.turnIdx;
    const release = this.queues.hold(id); if (!release) return;
    try {
      const result = live.handle.inject?.(text);
      const accepted = typeof result === 'boolean' ? result : await result;
      if (!accepted || !this.conversations.has(id) || !this.queues.items(id).some(m => m.id === itemId)) return;
      this.queues.remove(id, itemId);
      this.toConversation(id, { kind: 'userEcho', text, attachments: item.modes.attachments, at: Date.now() });
      this.steeredRuns.add(id);
      if (live.handle.injectMode === 'inline') {
        live.userTexts[turnIdx] = `${live.userTexts[turnIdx] ?? ''}\n\n${text}`;
        // The provider can finish the turn just before acknowledging steering.
        if (turnIdx < live.turnIdx) {
          for (const turns of [this.conversations.get(id)!.turns, this.sessions.getHistory(id)]) {
            const user = [...turns].reverse().find(turn => turn.role === 'user');
            if (user) user.text += `\n\n${text}`;
          }
        }
      }
      else {
        const messageId = shortId(); live.messageIds.push(messageId); live.userTexts.push(text);
        if (live.lastTarget) this.toConversation(id, { kind: 'routing', messageId, target: live.lastTarget, reason: 'An den laufenden Agenten übergeben' });
      }
    } finally { release(); }
  }

  /**
   * Sends the last thing the user asked for again. The text comes from the
   * host's own record rather than the panel, so a retry after a failure asks
   * for exactly what was asked before — and it routes fresh, which is the
   * point: the account that just failed is on cooldown and gets skipped.
   */
  private async retryLast(conversationId: string): Promise<void> {
    if (this.tasks.has(conversationId)) return;
    const rec = this.conversations.get(conversationId);
    // Aus dem Verlauf, nicht aus `turns`: dort steht eine Nachricht erst, wenn
    // eine Antwort ankam — und genau die fehlt nach einem Fehler. Der Knopf tat
    // deshalb nichts, oder er hätte in einem älteren Chat schweigend die
    // vorletzte Nachricht noch einmal geschickt statt der gescheiterten.
    const echo = [...(rec?.log ?? [])]
      .reverse()
      .find((event): event is Extract<HostToWebview, { kind: 'userEcho' }> => event.kind === 'userEcho');
    const last = [...(rec?.turns ?? [])].reverse().find((turn) => turn.role === 'user');
    // Der Echo-Text trägt die Anhänge schon als Liste in sich; sie noch einmal
    // mitzugeben, hängte sie ein zweites Mal an.
    const text = (echo?.text ?? last?.text)?.trim();
    if (!text) return;
    await this.handleSend(conversationId, text, tagsOf(text), { target: this.shownTarget(conversationId) });
  }

  /**
   * A near-identical prompt right after an answer means that answer did not
   * land — the run counts as friction even though it technically succeeded.
   */
  private detectRetry(conversationId: string, text: string): void {
    const ctx = this.threadContext.get(conversationId);
    if (!ctx?.lastMetricId || !ctx.lastPrompt || !ctx.lastFinishedAt) return;
    if (!isRetry(ctx.lastPrompt, text, Date.now() - ctx.lastFinishedAt)) return;
    void this.metrics.markRetried(ctx.lastMetricId);
    // Only the run that was actually re-asked is penalized.
    ctx.lastMetricId = undefined;
  }

  private async runTask(
    conversationId: string,
    text: string,
    tags: string[],
    modes: {
      effort?: import('@cortex/core').Effort;
      permissionMode?: PermissionMode;
        askPermission?: boolean;
      routingMode?: 'auto' | 'manual';
      attachments?: string[];
      target?: Target;
      image?: import('./images.js').ImageOptions;
      accountOrder?: string[];
    } = {},
  ): Promise<void> {
    const rec = this.conversations.get(conversationId);
    if (!rec) return;
    if (this.tasks.has(conversationId)) return;

    // A role's saved setting survives follow-up turns, retries and native resume.
    // An explicit model/provider switch gets that model's own default unless the
    // user also chose a reasoning level for this turn.
    if (rec.teamAgent && !modes.image) {
      const parsed = parseMention(text);
      const selected = parsed.mention ?? modes.target ?? rec.pinnedTarget ?? rec.teamAgent.target;
      const target = this.teamExecutionTarget({ ...selected, account: selected.account ?? rec.teamAgent.target.account });
      modes = { ...modes, target, effort: this.teamConversationEffort(rec.teamAgent, target, modes.effort) };
      text = applyPinnedTarget(parsed.mention ? parsed.cleaned : text, target);
    }

    const taskRoot = rec.projectPath ?? rec.teamWorkspace ?? projectlessDir(this.ctx.globalStorageUri.fsPath, conversationId);
    const editorSnapshot = this.workspaceContext.forRoot(taskRoot).editorContext();
    const workspaceFolders = [...this.projectFolders(conversationId)];
    const permissionNotes = [...(rec.pendingPermissionNotes ?? [])];
    let permissionNotesConsumed = false;
    const idleSeconds = vscode.workspace.getConfiguration('cortex').get<number>('codexIdleTimeoutSeconds', 180);

    // Safety net for actions that were queued before handleSend intercepted them.
    const slash = matchSlashCommand(text, this.rules.getCustomCommands());
    if (slash?.cmd.kind === 'action' && slash.cmd.action) {
      await this.performAction(conversationId, slash.cmd.action);
      return;
    }
    if (!rec.title) {
      rec.title = text.split('\n')[0]!.slice(0, 60);
      this.panels.get(conversationId)?.title !== undefined &&
        (this.panels.get(conversationId)!.title = rec.title);
    }

    const controller = new AbortController();
    this.tasks.set(conversationId, controller);
    this.toConversation(conversationId, { kind: 'busy', running: true }, { log: false });
    let cwd: string;
    let filesBefore: Set<string>;
    let baseline: Baseline | undefined;
    try {
      cwd = await this.conversationCwd(conversationId);
      await this.workspaceContext.forRoot(cwd).refresh();
      filesBefore = new Set(await this.verifier.forRoot(cwd).changedFiles());
      baseline = await captureBaseline(cwd);
      if (controller.signal.aborted) return;
    } catch (error) {
      this.tasks.delete(conversationId);
      this.toConversation(conversationId, { kind: 'busy', running: false }, { log: false });
      throw error;
    } finally {
      if (controller.signal.aborted) this.tasks.delete(conversationId);
    }

    const messageId = shortId();
    const clock = new ActiveClock();
    this.runClocks.set(conversationId, clock);
    const clockTimer = setInterval(() => this.toConversation(conversationId, { kind: 'runClock', elapsedMs: clock.elapsed() }, { log: false }), 1000);
    this.toConversation(conversationId, { kind: 'runClock', elapsedMs: 0 }, { log: false });
    let gotResult = false;
    let escalated = false;
    let briefLineIds: string[] | undefined;
    let answerText = '';
    let autoPlanned = false;
    const usageBefore = this.accountUsagePct(conversationId);
    const live = {
      handle: {} as LiveRunHandle,
      messageIds: [messageId],
      turnIdx: 0,
      userTexts: [text],
      lastTarget: undefined as Target | undefined,
      /** The provider session answering right now — where a checkpoint lives. */
      sessionId: undefined as string | undefined,
      modes,
    };
    this.liveRuns.set(conversationId, live);
    const currentId = () => live.messageIds[Math.min(live.turnIdx, live.messageIds.length - 1)]!;
    const post = (msg: HostToWebview) => this.toConversation(conversationId, msg);
    this.toConversation(conversationId, { kind: 'busy', running: true }, { log: false });
    this.sendConversations();

    const activeFile = editorSnapshot.activeFile;

    const permissionMode =
      modes.permissionMode ??
      vscode.workspace.getConfiguration('cortex').get<PermissionMode>('permissionMode', 'safe');
    const routingMode =
      modes.routingMode ??
      vscode.workspace.getConfiguration('cortex').get<'auto' | 'manual'>('routingMode', 'auto');

    // Erinnerungen vor dem Lauf. Wartet höchstens ein paar Sekunden und
    // scheitert nie laut: ohne Exokortex antwortet das Modell eben ohne.
    // Die Arbeitsanzeige sagt, dass gerade gesucht wird — sonst stünde dort
    // „Bereitet vor“, während Cortex im Exokortex liest.
    this.toConversation(conversationId, { kind: 'activity', text: 'Schaut im Exokortex nach Erinnerungen' }, { log: false });
    const erinnert = await this.erinnerung.vorbereiten(conversationId, text, {
      cwd,
      erste: rec.turns.length === 0,
      ohnePfad: `--${conversationId.slice(0, 8)}.md`,
      // Was dieser Chat schon als Erinnerung gezeigt hat — auch vor einem Neustart.
      bekannt: rec.log.flatMap(ev => (ev.kind === 'memories' ? ev.treffer.map(t => t.id) : [])),
    });
    if (!modes.image && this.canvasBelongs(conversationId)) this.toConversation(conversationId, { kind: 'activity', text: 'Sieht sich die Zeichenfläche an' }, { log: false });
    const canvasView = modes.image ? undefined : await this.canvasViewForTurn(conversationId);
    this.toConversation(conversationId, { kind: 'activity' }, { log: false });
    if (erinnert.neu && erinnert.neueTreffer.length > 0) {
      this.toConversation(conversationId, {
        kind: 'memories',
        bereiche: erinnert.bereiche,
        treffer: erinnert.neueTreffer.map(trefferFuerAnzeige),
      });
    }

    let metric: Partial<TaskMetric> = { id: messageId, timestamp: Date.now(), conversationId };
    try {
      const events = this.orchestrator.run(
        {
          conversationId,
          prompt: text,
          mcpServers: rec.teamAgent ? this.teamMcpServers(rec.teamAgent) : undefined,
          webSearch: rec.teamAgent ? await this.teamWebSearch(rec.teamAgent, conversationId) : undefined,
          permissionNotes,
          // Bilder gehen als Bild mit, nicht nur als Pfad im Text — und das
          // Bild der Zeichenfläche, wenn sie sich seit dem letzten verändert hat:
          // so sieht jedes Modell, was dort wirklich steht.
          images: modes.image ? undefined : [...(modes.attachments?.filter(path => IMAGE_FILE.test(path)) ?? []), ...(canvasView ? [canvasView] : [])],
          cwd,
          workspaceFolders,
          editorSnapshot,
          idleTimeoutMs: (Number.isFinite(idleSeconds) ? Math.min(3600, Math.max(30, idleSeconds)) : 180) * 1000,
          activeFile,
          languageId: activeFile ? editorSnapshot.languageId : undefined,
          // Im Bildmodus bleibt der Wechsel beim Anbieter: vom größeren aufs kleinere Konto, nie zu Claude.
          allowAccountFailover: modes.image ? false : !modes.target,
          accountOrder: modes.accountOrder,
          effort: modes.effort,
          tags,
          permissionMode,
          askPermission: modes.askPermission ?? vscode.workspace.getConfiguration('cortex').get<boolean>('askPermission', false),
          routingMode,
        },
        controller.signal,
        live.handle,
      );

      for await (const ev of events) {
        // A failed delivery keeps the notes for retry. New reasons raised during
        // this run remain queued even when the preceding notes were delivered.
        if (ev.type === 'result' && !permissionNotesConsumed) {
          rec.pendingPermissionNotes = (rec.pendingPermissionNotes ?? []).slice(permissionNotes.length);
          permissionNotesConsumed = true;
          this.persistNow();
        }
        const capabilities = JSON.stringify(this.queues.items(conversationId).map(item => this.canSteer(conversationId, item)));
        if (this.queueCapabilities.get(conversationId) !== capabilities) { this.queueCapabilities.set(conversationId, capabilities); void this.pushQueue(conversationId); }
        switch (ev.type) {
          case 'deferred-instruction':
            (rec.pendingPermissionNotes ??= []).push(ev.text);
            this.persistNow();
            break;
          case 'notice':
            post({ kind: 'notice', text: ev.text });
            break;
          case 'routing': {
            const cls = ev.decision.classification;
            metric = {
              ...metric,
              kind: cls?.kind,
              complexity: cls?.complexity,
              tier: ev.decision.tier,
              effort: ev.decision.effort,
              routingReason: ev.decision.reason,
              ruleId: ev.decision.ruleId,
            };
            if (cls?.complexity) {
              const ctx = this.threadContext.get(conversationId) ?? { turnCount: 0 };
              // Newest first, and only the last few kept: the router sizes a
              // turn from what the thread has been doing lately, not from the
              // heaviest thing it ever did.
              ctx.recentComplexity = [cls.complexity, ...(ctx.recentComplexity ?? [])].slice(0, 4);
              ctx.lastKind = cls.kind;
              this.threadContext.set(conversationId, ctx);
            }
            autoPlanned = ev.decision.suggestPermission === 'safe';
            if (ev.decision.escalated) {
              escalated = true;
              post({
                kind: 'notice',
                text: `work got heavier — moving this thread up to the ${ev.decision.escalated.to} tier`,
              });
            }
            if (ev.decision.suggestPermission === 'safe') {
              post({
                kind: 'notice',
                text: 'heavy change — planning first; switch to Edit to let it write',
              });
            }
            const first = ev.decision.chain[0];
            if (first) {
              metric = { ...metric, provider: first.provider, account: first.account, model: first.model };
              metric.ruleId = ev.decision.ruleId;
              metric.routingReason = ev.decision.reason;
              post({
                kind: 'routing',
                messageId: currentId(),
                target: first,
                ruleId: ev.decision.ruleId,
                reason: ev.decision.reason,
              });
            } else {
              const skipped = ev.decision.skipped
                .map((s) => `${s.target.provider}:${s.target.account} (${s.reason})`)
                .join(', ');
              post({
                kind: 'error',
                messageId: currentId(),
                message: skipped
                  ? `No account available. Skipped: ${skipped}`
                  : 'No accounts configured yet — run "cortex: Add Account" first.',
              });
            }
            for (const s of ev.decision.skipped) {
              this.output.appendLine(
                `[routing] skipped ${s.target.provider}:${s.target.account}: ${s.reason}`,
              );
            }
            break;
          }
          case 'attempt':
            live.lastTarget = ev.target;
            this.onTargetChosen?.(ev.target);
            if (ev.attempt > 1) {
              post({
                kind: 'notice',
                text: `connection dropped — retrying on ${formatTarget(ev.target)} (attempt ${ev.attempt})`,
              });
            }
            break;
          case 'text-delta':
            post({ kind: 'delta', messageId: currentId(), text: ev.text });
            break;
          case 'tool-use':
            post({
              kind: 'toolUse',
              messageId: currentId(),
              name: ev.name,
              detail: ev.detail,
              preview: ev.preview,
              path: ev.path,
              action: ev.action,
              added: ev.added,
              removed: ev.removed,
              agentId: ev.agentId,
            });
            break;
          case 'agent-start':
            post({
              kind: 'agentStart',
              messageId: currentId(),
              id: ev.id,
              label: ev.label,
              agentKind: ev.agentKind,
              prompt: ev.prompt,
              background: ev.background,
            });
            break;
          case 'agent-progress':
            post({
              kind: 'agentProgress',
              messageId: currentId(),
              id: ev.id,
              activity: ev.activity,
              lastTool: ev.lastTool,
              toolUses: ev.toolUses,
              tokens: ev.tokens,
              durationMs: ev.durationMs,
            });
            break;
          case 'agent-end':
            post({
              kind: 'agentEnd',
              messageId: currentId(),
              id: ev.id,
              status: ev.status,
              summary: ev.summary,
              toolUses: ev.toolUses,
              tokens: ev.tokens,
              durationMs: ev.durationMs,
            });
            break;
          case 'image': {
            const messageId = currentId();
            try {
              const path = await archiveGeneratedImage(ev.path, this.imageArchiveRoot(), conversationId);
              const src = await this.imageSrc(path);
              if (src) post({ kind: 'image', messageId, path, src, prompt: ev.prompt, edited: ev.edited, options: modes.image });
            } catch {
              post({ kind: 'notice', text: 'Das erzeugte Bild konnte nicht dauerhaft im Chat gesichert werden. Bitte den freien Speicherplatz prüfen.' });
            }
            break;
          }
          case 'model-downgraded':
            post({ kind: 'downgraded', messageId: currentId(), from: ev.from, to: ev.to });
            // Whatever the CLI picked for itself, we no longer know its weight
            // class — so this run is not evidence about one. Clearing the tier
            // keeps it out of the per-tier capability probes instead of filing
            // it under a tier it may not have run on.
            metric.model = undefined;
            metric.tier = undefined;
            metric.effort = undefined;
            break;
          case 'failover': {
            // The account that could not finish is recorded on its own, or the
            // learning loop would only ever see whoever cleaned up after it.
            if (metric.provider && metric.account) {
              void this.metrics.record({
                id: `${metric.id}-${metric.provider}-${metric.account}`,
                timestamp: metric.timestamp!,
                conversationId,
                provider: metric.provider,
                account: metric.account,
                model: metric.model,
                ruleId: metric.ruleId,
                routingReason: metric.routingReason,
                kind: metric.kind,
                complexity: metric.complexity,
                tier: metric.tier,
                effort: metric.effort,
                durationMs: clock.elapsed(),
                status: 'failover',
                failoverReason: ev.reason,
                transient: isTransientFailure(ev.reason),
              });
            }
            metric = {
              ...metric,
              provider: ev.to.provider,
              account: ev.to.account,
              model: ev.to.model,
              status: undefined,
              errorMessage: undefined,
              failedFrom: { provider: ev.from.provider, account: ev.from.account, model: ev.from.model },
              failoverReason: ev.reason,
            };
            post({
              kind: 'failover',
              messageId: currentId(),
              from: ev.from,
              to: ev.to,
              reason: ev.reason,
              resetAt: ev.resetAt,
            });
            break;
          }
          case 'brief':
            briefLineIds = ev.lineIds;
            break;
          case 'tasks':
            post({ kind: 'tasks', messageId: currentId(), items: ev.items });
            break;
          case 'permission':
            // The CLI is blocked until the user answers, so this cannot be a
            // toast that scrolls away — it goes into the transcript.
            post({
              kind: 'permission',
              messageId: currentId(),
              request: ev.request,
              target: live.lastTarget,
            });
            this.notifyPermission(conversationId, ev.request);
            break;
          case 'permission-resolved':
            post({ kind: 'permissionResolved', id: ev.id, allowed: ev.allowed });
            break;
          case 'result': {
            answerText = ev.text;
            const turnUser = live.userTexts[live.turnIdx] ?? text;
            const by = live.lastTarget ? formatTarget(live.lastTarget) : undefined;
            rec.turns.push({ role: 'user', text: turnUser }, { role: 'assistant', text: ev.text, by });
            if (live.handle.injectMode === 'inline' && turnUser !== text) {
              const user = [...this.sessions.getHistory(conversationId)].reverse().find(turn => turn.role === 'user');
              if (user) user.text = turnUser;
            }
            if (live.turnIdx > 0) {
              // Injected turns: keep the engine history in sync too (the
              // orchestrator records only the first pair).
              this.sessions.appendTurn(conversationId, { role: 'user', text: turnUser });
              this.sessions.appendTurn(conversationId, { role: 'assistant', text: ev.text, by });
            }
            gotResult = true;
            const durationMs = clock.elapsed();
            // Whether that dollar figure is a bill or a hypothetical depends on
            // how the account authenticates, which only the host knows.
            const metered = this.isMetered(live.lastTarget);
            metric = {
              ...metric,
              inputTokens: ev.usage?.inputTokens,
              outputTokens: ev.usage?.outputTokens,
              cachedInputTokens: ev.usage?.cachedInputTokens,
              costUsd: ev.costUsd,
              metered,
              durationMs,
              status: 'success',
            };
            post({
              kind: 'done',
              messageId: currentId(),
              costUsd: ev.costUsd,
              metered,
              durationMs,
              at: Date.now(),
              turn: true,
              ...(ev.checkpoint && live.sessionId && live.lastTarget
                ? { checkpoint: { target: live.lastTarget, cwd, sessionId: live.sessionId, anchor: ev.checkpoint } }
                : {}),
            });
            live.turnIdx++;
            break;
          }
          case 'limit': {
            const reset = ev.resetAt ? ` Resets ${new Date(ev.resetAt).toLocaleString()}.` : '';
            post({ kind: 'error', messageId: currentId(), message: `Usage limit reached.${reset}` });
            break;
          }
          case 'error':
            metric = {
              ...metric,
              status: 'error',
              errorMessage: ev.message,
              transient: isTransientFailure(ev.message),
            };
            post({ kind: 'error', messageId: currentId(), message: ev.message,
              ...(ev.recovery ? { recovery: ev.recovery, recoveryAccountId: this.accounts.all().find(account => account.provider === live.lastTarget?.provider && account.label === live.lastTarget?.account)?.id } : {}),
            });
            break;
          case 'chain-exhausted':
            if (ev.tried.length > 0) {
              post({
                kind: 'error',
                messageId: currentId(),
                message: `All ${ev.tried.length} account(s) in the chain failed or hit limits.`,
              });
            }
            break;
          case 'session':
            live.sessionId = ev.sessionId;
            break;
        }
      }
      // Notizzettel nachführen — im Hintergrund, der Chat wartet nicht darauf.
      if (gotResult && !rec.teamAgent) {
        void this.erinnerung.nachAntwort(conversationId, {
          frage: text,
          antwort: answerText,
          von: live.lastTarget,
          verlauf: this.sessions.getHistory(conversationId),
        });
      }
      // The run produced an answer; now find out whether it is true.
      // A team owns its review/handoff graph. Hidden helper runs would inherit
      // different tool scopes and could change the answer after its handoff.
      if (gotResult && !controller.signal.aborted && !rec.teamAgent) {
        const outcome = await this.checkAndImprove({
          conversationId,
          task: text,
          answer: answerText,
          target: live.lastTarget,
          kind: metric.kind,
          complexity: metric.complexity,
          permissionMode,
          filesBefore,
          post,
          messageId: currentId(),
          signal: controller.signal,
        });
        metric = { ...metric, verified: outcome.verified, reviewedBy: outcome.reviewedBy };
      }
    } catch (e) {
      metric = { ...metric, status: 'error', errorMessage: (e as Error).message };
      post({ kind: 'error', messageId: currentId(), message: (e as Error).message });
      this.output.appendLine(`[error] ${(e as Error).stack ?? e}`);
      const ctx = this.threadContext.get(conversationId) ?? { turnCount: 0 };
      ctx.lastFailure = (e as Error).message.slice(0, 300);
      this.threadContext.set(conversationId, ctx);
    } finally {
      clearInterval(clockTimer);
      this.runClocks.delete(conversationId);
      if (!controller.signal.aborted && (!gotResult || metric.status === 'error')) this.queues.pause(conversationId, 'error');
      const steered = this.steeredRuns.delete(conversationId);
      if (metric.status && metric.provider && metric.account) {
        const target = live.lastTarget;
        const usageAfter = target ? this.usagePctForTarget(target) : undefined;
        void this.metrics.record({
          id: metric.id!,
          timestamp: metric.timestamp!,
          conversationId: metric.conversationId!,
          provider: metric.provider,
          account: metric.account,
          model: metric.model,
          ruleId: metric.ruleId,
          routingReason: metric.routingReason,
          kind: metric.kind,
          complexity: metric.complexity,
          tier: metric.tier,
          effort: metric.effort,
          inputTokens: metric.inputTokens,
          outputTokens: metric.outputTokens,
          cachedInputTokens: metric.cachedInputTokens,
          costUsd: metric.costUsd,
          metered: metric.metered,
          durationMs: metric.durationMs,
          burnPct: observedBurn(usageBefore, usageAfter),
          status: metric.status as 'success' | 'error' | 'failover',
          errorMessage: metric.errorMessage,
          transient: metric.transient,
          failedFrom: metric.failedFrom,
          failoverReason: metric.failoverReason,
          steered,
          escalated,
          briefLineIds,
          verified: metric.verified,
          reviewedBy: metric.reviewedBy,
        });
      }
      // Remember where this thread ran so the next turn stays put, and what it
      // was asked, so a quick re-ask can be recognized as friction.
      if (live.lastTarget) {
        const ctx = this.threadContext.get(conversationId) ?? { turnCount: 0 };
        ctx.lastTarget = live.lastTarget;
        ctx.turnCount += 1;
        ctx.lastPrompt = text;
        ctx.lastFinishedAt = Date.now();
        ctx.lastMetricId = metric.status ? metric.id : undefined;
        // Keep the last known figure when a run did not report one — a silent
        // turn does not mean the conversation suddenly became free to move.
        if (metric.inputTokens) ctx.lastContextTokens = metric.inputTokens;
        if (steered) ctx.corrections = (ctx.corrections ?? 0) + 1;
        if (metric.verified === 'failed') {
          ctx.failedVerifications = (ctx.failedVerifications ?? 0) + 1;
        }
        this.threadContext.set(conversationId, ctx);
        this.warnIfCrowded(conversationId, ctx, post);
      }
      if (this.tasks.get(conversationId) === controller) this.tasks.delete(conversationId);
      if (this.liveRuns.get(conversationId) === live) this.liveRuns.delete(conversationId);
      if (baseline) {
        const paths = rec.log.flatMap(msg => msg.kind === 'toolUse' && live.messageIds.includes(msg.messageId) && msg.path && (msg.action === 'write' || msg.action === 'edit') ? [msg.path] : []);
        await captureTurnEnd(cwd, baseline, paths);
        // Jede Antwort dieses Laufs — auch nach einem Wechsel des Kontos — geht
        // auf denselben Stand zurück.
        const kept = Object.entries(rec.baselines ?? {}).filter(([id]) => !live.messageIds.includes(id));
        rec.baselines = Object.fromEntries([...kept, ...live.messageIds.map(id => [id, baseline!] as const)].slice(-MAX_BASELINES));
        for (const [messageId] of kept) if (!rec.baselines[messageId]) this.toConversation(conversationId, { kind: 'revertState', messageId, available: false, reason: 'Der gespeicherte Stand wurde durch neuere Aufträge ersetzt.' });
      }
      for (const messageId of live.messageIds) this.toConversation(conversationId, { kind: 'revertState', messageId, available: !!rec.baselines?.[messageId], reason: baseline ? undefined : 'Kein Git-Stand gespeichert. Rückgängig ist für diesen Auftrag nicht verfügbar.' });
      // Asked between runs, never during one.
      if (autoPlanned && gotResult && live.lastTarget && !controller.signal.aborted) {
        void this.offerPlanExecution(conversationId, text, answerText, live.lastTarget);
      } else {
        void this.preferences.offerTopSuggestion();
      }
      rec.log = compactLog(rec.log);
      this.toConversation(conversationId, { kind: 'busy', running: false }, { log: false });
      this.pushAccounts();
      this.sendConversations();
      this.persistSoon();
    }
  }

  /**
   * After an answer arrives: check it against reality, let the model fix what
   * the checks caught, and — for hard work — have a different provider look
   * for what the checks cannot see.
   *
   * Every step is skippable and none of them may block the user seeing the
   * answer: the answer is already on screen when this runs.
   */
  private async checkAndImprove(args: {
    conversationId: string;
    task: string;
    answer: string;
    target?: Target;
    kind?: string;
    complexity?: string;
    permissionMode: PermissionMode;
    filesBefore: Set<string>;
    post: (msg: HostToWebview) => void;
    messageId: string;
    signal: AbortSignal;
  }): Promise<{ verified?: 'passed' | 'repaired' | 'failed'; reviewedBy?: string }> {
    const config = vscode.workspace.getConfiguration('cortex');
    const outcome: { verified?: 'passed' | 'repaired' | 'failed'; reviewedBy?: string } = {};
    if (!args.target) return outcome;

    const verifier = this.verifier.forRoot(await this.conversationCwd(args.conversationId));
    const changedNow = await verifier.changedFiles();
    const touched = changedNow.filter((f) => !args.filesBefore.has(f));
    if (touched.length > 0) {
      const ctx = this.threadContext.get(args.conversationId) ?? { turnCount: 0 };
      ctx.touchedFiles = [...new Set([...(ctx.touchedFiles ?? []), ...touched])].slice(-20);
      this.threadContext.set(args.conversationId, ctx);
    }

    // ── verification ────────────────────────────────────────
    if (config.get<boolean>('verifyChanges', true) && !args.signal.aborted) {
      const report = await verifier.verify(
        {
          kind: args.kind,
          complexity: args.complexity,
          wroteCode: touched.length > 0,
          permissionMode: args.permissionMode,
        },
        args.signal,
      );
      if (report) {
        if (report.ok) {
          outcome.verified = 'passed';
          args.post({ kind: 'notice', text: `verified — ${describeReport(report)}` });
        } else {
          args.post({
            kind: 'notice',
            text: `${describeReport(report)} — asking ${formatTarget(args.target)} to fix it`,
          });
          const repaired = await this.followUp(
            args.conversationId,
            repairPrompt(report, touched),
            args.target,
            args.messageId,
            args.signal,
          );
          if (repaired) {
            const recheck = await verifier.verify(
              {
                kind: args.kind,
                complexity: args.complexity,
                wroteCode: true,
                permissionMode: args.permissionMode,
              },
              args.signal,
            );
            outcome.verified = !recheck || recheck.ok ? 'repaired' : 'failed';
            args.post({
              kind: 'notice',
              text:
                outcome.verified === 'repaired'
                  ? 'fixed itself — checks pass now'
                  : 'still failing after one repair attempt; over to you',
            });
          } else {
            outcome.verified = 'failed';
          }
          if (outcome.verified === 'failed') {
            const ctx = this.threadContext.get(args.conversationId) ?? { turnCount: 0 };
            ctx.lastFailure = report.failureText?.slice(0, 300);
            this.threadContext.set(args.conversationId, ctx);
          }
        }
      }
    }

    // ── second opinion ──────────────────────────────────────
    const policy = config.get<'never' | 'hard' | 'always'>('secondOpinion', 'hard');
    if (policy === 'never' || args.signal.aborted || this.pinnedTarget(args.conversationId)) return outcome;

    const headroom = this.headroomByAccount();
    const candidates: Target[] = this.accounts
      .all()
      .filter((a) => !a.disabled)
      .map((a) => ({ provider: a.provider, account: a.label }));

    const reviewer = pickReviewer({
      author: args.target,
      candidates,
      classification: {
        kind: (args.kind ?? 'edit') as never,
        complexity: (args.complexity ?? 'moderate') as never,
        writesCode: touched.length > 0,
        signals: [],
      },
      headroom,
      policy,
    });
    if (!reviewer) return outcome;

    args.post({ kind: 'notice', text: reviewer.reason });
    const diff = touched.length > 0 ? await this.diffFor(touched, args.conversationId) : undefined;
    // Die Zweitmeinung über OpenRouter bleibt kostenlos — auch wenn in den
    // Einstellungen ein bezahltes Standardmodell gewählt ist.
    const freeReviewer = reviewer.target.provider === 'openrouter'
      ? (this.adapters.get('openrouter') as { freeChain?: Array<{ id: string }> } | undefined)?.freeChain?.[0]?.id
      : undefined;
    const review = await this.askOffThread(
      freeReviewer ? { ...reviewer.target, model: freeReviewer } : reviewer.target,
      reviewPrompt({
        task: args.task,
        answer: args.answer,
        diff,
        authorProvider: args.target.provider,
      }),
      args.signal,
    );
    if (!review) return outcome;
    outcome.reviewedBy = `${reviewer.target.provider}:${reviewer.target.account}`;

    if (isClean(review)) {
      args.post({ kind: 'notice', text: `${outcome.reviewedBy} found no problems` });
      return outcome;
    }
    args.post({ kind: 'review', messageId: args.messageId, by: outcome.reviewedBy, text: review });
    await this.followUp(
      args.conversationId,
      revisionPrompt(review),
      args.target,
      args.messageId,
      args.signal,
    );
    return outcome;
  }

  /**
   * The other half of auto-plan: a plan specific enough to follow does not
   * need the model that wrote it. Authoring the plan was the hard part — the
   * typing can go to a cheaper account, which is the whole reason to own
   * several subscriptions.
   */
  private async offerPlanExecution(
    conversationId: string,
    task: string,
    planText: string,
    planner: Target,
  ): Promise<void> {
    const plan = parsePlan(planText);
    if (!plan.executable) return;

    const headroom = this.headroomByAccount();
    const candidates: Target[] = this.accounts
      .all()
      .filter((a) => !a.disabled)
      .sort((a, b) => a.priority - b.priority)
      .map((a) => ({ provider: a.provider, account: a.label }));

    const executor = pickExecutor(planner, candidates, headroom);
    if (!executor) return;

    const tier = executorTier('heavy');
    const target: Target = { ...executor, model: AUTO_TIER_MODELS[executor.provider][tier] };
    const label = formatTarget(target);
    const choice = await vscode.window.showInformationMessage(
      `${plan.steps.length}-step plan ready. Carry it out on ${label} and keep ${formatTarget(planner)} free?`,
      'Run it',
      'Not now',
    );
    if (choice !== 'Run it') return;

    // An @mention is how the router is told to obey; it is stripped before the
    // model sees the prompt, so no plumbing is needed to force the target.
    const mention = `@${target.provider}:${target.account}${target.model ? `/${target.model}` : ''}`;
    await this.handleSend(
      conversationId,
      `${mention} ${executePrompt(task, plan, formatTarget(planner))}`,
      [],
      {
        permissionMode: vscode.workspace
          .getConfiguration('cortex')
          .get<PermissionMode>('permissionMode', 'edits'),
      },
    );
  }

  /** Wie viel Luft jedes Konto noch hat, unter `anbieter:konto` — für Zweitmeinung und Planausführung. */
  private headroomByAccount(): Record<string, number> {
    const headroom: Record<string, number> = {};
    for (const account of this.accounts.all()) {
      headroom[`${account.provider}:${account.label}`] = accountHeadroom(account.id, this.quota);
    }
    return headroom;
  }

  /** `git diff` for the files a run touched, budgeted for a prompt. */
  private async diffFor(files: string[], conversationId?: string): Promise<string | undefined> {
    const cwd = this.projectRoot(conversationId);
    if (!cwd) return undefined;
    return new Promise((resolve) => {
      execFile(
        'git',
        ['diff', '--', ...files.slice(0, 20)],
        { cwd, timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => resolve(err || !stdout.trim() ? undefined : stdout.slice(0, 12_000)),
      );
    });
  }

  /**
   * Continues the same conversation on the same account — the model keeps its
   * session, so a repair or revision costs one turn, not a fresh context.
   */
  private async followUp(
    conversationId: string,
    prompt: string,
    target: Target,
    messageId: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    const text = await this.askOffThread(target, prompt, signal, conversationId);
    if (!text) return false;
    this.toConversation(conversationId, { kind: 'delta', messageId, text: `\n\n${text}` });
    return true;
  }

  /** Notizzettel und Exokortex-Treffer eines Chats, als Brief-Abschnitte für den nächsten Lauf. */
  erinnerungsAbschnitte(conversationId: string): import('@cortex/core').BriefSection[] {
    return this.erinnerung.abschnitte(conversationId);
  }

  /**
   * Das Video im Brief: wenn der Auftrag mit `/remotion` beginnt, der Reiter
   * „Video“ offen ist, oder der Chat schon ein Videoprojekt hat und die
   * Nachricht davon handelt.
   */
  remotionAbschnitte(conversationId: string, prompt: string): import('@cortex/core').BriefSection[] {
    return this.remotion.brief(conversationId, prompt);
  }

  /** Der Standort-Kontext des Chats im Brief — solange er am Chat hängt. */
  locationAbschnitte(conversationId: string): import('@cortex/core').BriefSection[] {
    return locationBrief(this.conversations.get(conversationId));
  }

  /**
   * Die Zeichenfläche im Brief: nur solange sie offen ist, oder wenn der
   * Auftrag mit `/excalidraw` beginnt — siehe CanvasHost.canvasAbschnitte.
   */
  canvasAbschnitte(conversationId: string, prompt: string): import('@cortex/core').BriefSection[] {
    return this.canvas.canvasAbschnitte(conversationId, prompt);
  }

  /** Hat dieser Chat eine Zeichenfläche (offen oder gespeichert)? */
  canvasBelongs(conversationId: string): boolean {
    return this.canvas.canvasBelongs(conversationId);
  }

  /** Bild der Fläche, optional nachdem ein Block gezeichnet wurde — siehe CanvasHost.askCanvas. */
  askCanvas(conversationId: string, code: string | undefined, timeoutMs = 60_000): Promise<{ png?: string; text: string; error?: string }> {
    return this.canvas.askCanvas(conversationId, code, timeoutMs);
  }

  private canvasViewForTurn(conversationId: string): Promise<string | undefined> {
    return this.canvas.canvasViewForTurn(conversationId);
  }

  /** Die Zeile für den Systemprompt: wann das Modell selbst im Exokortex suchen soll. */
  erinnerungsHinweis(): string {
    const e = erinnerungsEinstellungen(this.settings.appSettings());
    return e.abruf === 'nie' ? '' : e.promptSuche;
  }

  /**
   * Wer den Notizzettel schreibt. „Günstig“ heißt Haiku auf dem ersten freien
   * Claude-Konto: der Zettel entsteht nach jeder Antwort, und ein großes Modell
   * dafür kostet Kontingent, das für die eigentliche Arbeit fehlt. Ohne freies
   * Claude-Konto schreibt ihn das Modell, das gerade geantwortet hat.
   */
  private erinnerungsHelfer(modus: Helfer, zuletzt: Target | undefined): Target | undefined {
    if (modus === 'guenstig') {
      const claude = this.accounts
        .all()
        .filter(a => a.provider === 'claude' && this.quota.availability(a.id).available)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0];
      if (claude) return { provider: 'claude', account: claude.label, model: 'haiku' };
    }
    return zuletzt;
  }

  /**
   * One-shot request to a specific account, outside the visible turn loop.
   * Reuses the conversation's session when one is given so the model has the
   * context; otherwise it is a clean, cheap ask.
   */
  private async askOffThread(
    target: Target,
    prompt: string,
    signal: AbortSignal,
    conversationId?: string,
    options?: { cwd?: string; teamAgent?: TeamAgent },
  ): Promise<string | undefined> {
    const adapter = this.adapters.get(target.provider);
    if (!adapter) return undefined;
    const account = await this.accounts.resolve(target);
    if (!account) return undefined;
    const cwd = options?.cwd ?? await this.conversationCwd(conversationId);
    const teamAgent = options?.teamAgent ?? (conversationId ? this.conversations.get(conversationId)?.teamAgent : undefined);
    if (teamAgent) target = this.teamExecutionTarget(target);
    const resumeSessionId =
      conversationId && adapter.supportsNativeResume
        ? this.sessions.getNativeSession(conversationId, target, cwd)
        : undefined;

    try {
      let text = '';
      for await (const ev of adapter.run(
        {
          prompt,
          cwd,
          model: target.model,
          effort: teamAgent ? this.teamConversationEffort(teamAgent, target) : undefined,
          resumeSessionId,
          mcpServers: teamAgent ? this.teamMcpServers(teamAgent) : undefined,
          webSearch: teamAgent && conversationId ? await this.teamWebSearch(teamAgent, conversationId) : undefined,
          // A reviewer must never edit; a repair runs under the user's own mode.
          permissionMode: !conversationId ? 'safe' : teamAgent ? teamAgent.permissionMode : conversationId
            ? vscode.workspace
                .getConfiguration('cortex')
                .get<PermissionMode>('permissionMode', 'safe')
            : 'safe',
        },
        account,
        signal,
      )) {
        if (signal.aborted) return undefined;
        if (ev.type === 'result') text = ev.text;
        if (ev.type === 'limit') {
          // A free reviewer runs out most days. Park the account so the next
          // task picks a different one instead of paying for the round trip.
          this.quota.markLimitHit(account.id, {
            resetAt: ev.resetAt,
            scope: ev.scope,
            provider: target.provider,
          });
          return undefined;
        }
        if (ev.type === 'error') return undefined;
      }
      return text.trim() || undefined;
    } catch (e) {
      this.output.appendLine(`[off-thread] ${formatTarget(target)}: ${(e as Error).message}`);
      return undefined;
    }
  }

  /**
   * A blocked run is worth a notification: the model is idle until the user
   * answers, and the tab may not even be visible. Answering from the toast
   * saves a trip back to the panel.
   */
  private notifyPermission(conversationId: string, request: PermissionRequest): void {
    if (this.isVisible(conversationId)) return;
    const title = request.title.length > 70 ? request.title.slice(0, 70) + '…' : request.title;
    void vscode.window
      .showWarningMessage(`cortex is waiting: ${title}`, 'Allow', 'Allow always', 'Deny')
      .then((choice) => {
        if (!choice) return;
        const decision: PermissionDecision =
          choice === 'Deny'
            ? { outcome: 'deny' }
            : choice === 'Allow always'
              ? { outcome: 'allow-always' }
              : { outcome: 'allow' };
        this.answerPermission(conversationId, request.id, decision);
      });
  }

  /** Releases the waiting CLI with the user's answer. */
  answerPermission(conversationId: string, id: string, decision: PermissionDecision): void {
    const live = this.liveRuns.get(conversationId);
    if (live?.handle.respondPermission) {
      live.handle.respondPermission(id, decision);
      return;
    }
    // Claude's prompt runs through the bridge, which is not tied to a run.
    this.pendingBridge.get(id)?.(decision);
    this.pendingBridge.delete(id);
  }

  /** Claude asks through the MCP bridge, outside the adapter event stream. */
  async askViaBridge(request: PermissionRequest, conversationId?: string): Promise<PermissionDecision> {
    if (!conversationId || !this.tasks.has(conversationId)) return { outcome: 'deny', reason: 'no active conversation' };
    const live = this.liveRuns.get(conversationId);
    this.toConversation(conversationId, {
      kind: 'permission',
      messageId: live?.messageIds[live.turnIdx] ?? shortId(),
      request,
      target: live?.lastTarget,
    });
    this.notifyPermission(conversationId, request);
    const decision = await new Promise<PermissionDecision>((resolve) => {
      this.pendingBridge.set(request.id, resolve);
    });
    this.toConversation(conversationId, {
      kind: 'permissionResolved',
      id: request.id,
      allowed: decision.outcome !== 'deny',
    });
    return decision;
  }

  private isVisible(conversationId: string): boolean {
    return this.panels.get(conversationId)?.active === true || (this.agentPanel?.active === true && this.visibleConversationId() === conversationId);
  }

  // ── accounts ─────────────────────────────────────────────────────

  /** Tightest window fill for the account a thread last used, if known. */
  private usagePctForTarget(target: Target): number | undefined {
    const account = this.accounts
      .all()
      .find((a) => a.provider === target.provider && a.label === target.account);
    if (!account) return undefined;
    const windows = this.quota.snapshot([account.id])[0]?.usage ?? [];
    return windows.length > 0 ? Math.max(...windows.map((w) => w.utilizationPct)) : undefined;
  }

  private accountUsagePct(conversationId: string): number | undefined {
    const target = this.threadContext.get(conversationId)?.lastTarget;
    return target ? this.usagePctForTarget(target) : undefined;
  }

  /** Die Kontofolge des Bildmodus für einen Anbieter (siehe `imageAccountOrder`). */
  private imageOrder(provider: string): string[] {
    const configured = vscode.workspace.getConfiguration('cortex').get<Record<string, string[]>>('imageAccountOrder', {});
    return imageAccountOrder(this.accounts.all(), provider, configured[provider] ?? []);
  }

  private accountDtos(): AccountStatusDto[] {
    const all = this.accounts.all();
    const imageRanks = new Map<string, number>();
    for (const provider of ['codex', 'grok']) this.imageOrder(provider).forEach((label, i) => imageRanks.set(`${provider}:${label}`, i));
    const snapshots = this.quota.snapshot(all.map((a) => a.id));
    return all
      .sort((a, b) => a.priority - b.priority)
      .map((a) => {
        const snap = snapshots.find((s) => s.accountId === a.id);
        return {
          id: a.id,
          provider: a.provider,
          label: a.label,
          authMode: a.authMode,
          available: !a.disabled && this.authHealth?.get(a.id) !== 'expired' && (snap?.available ?? true),
          resetAt: snap?.resetAt,
          usage: snap?.usage,
          models: this.adapters.get(a.provider)?.models ?? [],
          identity: a.identity ?? this.identities.get(a.id),
          homeDir: a.homeDir,
          reviewOnly: isReviewOnly(a.provider),
          defaultModel: a.provider === 'openrouter' ? this.openRouter?.defaultModel() : undefined,
          authState: this.authHealth?.get(a.id) ?? 'unknown',
          imageRank: imageRanks.get(`${a.provider}:${a.label}`),
        };
      });
  }

  pushAccounts(): void {
    const msg: HostToWebview = { kind: 'accounts', accounts: this.accountDtos() };
    for (const [webview, surface] of this.surfaces) {
      if (ChatViewProvider.ACCOUNT_MODES.has(surface.mode)) this.safePost(webview, msg);
    }
    // Die Opus-Vorgabe hängt an den Konten: kommen sie später an oder
    // ändert sich eins, muss der Modellknopf nachziehen.
    this.pushPinned();
  }

  private html(webview: vscode.Webview, mode: Surface['mode']): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'webview.css'),
    );
    const cortexStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'cortex.css'));
    const composerStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'codex-composer.css'));
    const commandsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'codex-commands.css'));
    const menusStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'cortex-menus.css'));
    const lookStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'cortex-look.css'));
    const teamsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'agent-teams.css'));
    const settingsStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'settings.css'));
    // Die Plugin-Logos sind Dateien, keine eingebetteten Pfade: die CSP lässt
    // `img-src ${webview.cspSource}` zu, entfernte Bilder nie. Ohne diese Basis
    // wüsste das Webview nicht, unter welcher URI `media/` erreichbar ist.
    const mediaBase = `${webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media'))}/`;
    const nonce = shortId(16);
    // `frame-src` gilt allein der HTML-Vorschau im Dock: ein Rahmen auf den
    // eigenen Server unter 127.0.0.1 (htmlPreview.ts). Er bindet auch jede
    // Navigation darin — ein Link ins Netz bleibt dort stehen.
    // `font-src`, `connect-src`, `worker-src` und `blob:` braucht die
    // Excalidraw-Fläche: ihre Schriften liegen unter media/excalidraw, beim
    // Export liest sie sie ein und rechnet in einem Worker. Alles nur aus der
    // Erweiterung selbst — ins Netz darf sie nicht.
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; connect-src ${webview.cspSource}; worker-src ${webview.cspSource} blob:; script-src 'nonce-${nonce}'; frame-src http://127.0.0.1:*; media-src http://127.0.0.1:*;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${cortexStyleUri}" rel="stylesheet">
  <link href="${composerStyleUri}" rel="stylesheet">
  <link href="${commandsStyleUri}" rel="stylesheet">
  <link href="${teamsStyleUri}" rel="stylesheet">
  <link href="${settingsStyleUri}" rel="stylesheet">
  <link href="${menusStyleUri}" rel="stylesheet">
  <link href="${lookStyleUri}" rel="stylesheet">
  <title>Cortex</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__CORTEX_MODE__ = '${mode}'; window.__CORTEX_MEDIA__ = '${mediaBase}';</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

/** Lag früher hier; attachmentStill.test.ts importiert es weiter von hier. */
export { quickLookStill } from './host/images.js';
