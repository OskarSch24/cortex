import { MessageQueue, type QueuedMessage } from './messageQueue.js';
import { ActiveClock } from './activeClock.js';
import { createForkWorkspace, workspaceRunKey } from './forkWorkspace.js';
import { NATIVE_SETTINGS, validNativeSetting } from './nativeSettings.js';
import { readFilePreview } from './filePreview.js';
import { compactionPlan, validCompactionSummary, workingHistory, type ContextCompaction } from './contextCompaction.js';
import { searchConversations } from './conversationSearch.js';
import { duplicateTemplate, readTemplateEntries, renameTemplate, type TemplateEntry } from './templates.js';
import { TeamStore } from '../teams/store.js';
import { TeamRunner } from '../teams/runner.js';
import { AutomationRuntime, AutomationSkippedError } from '../automations/runtime.js';
import type { AutomationSource } from '../automations/types.js';
import { MAX_TEAM_AGENTS, teamAgentEffort, teamAgentPrompt, validateTeam, type AgentTeam, type TeamAgent, type TeamJob, type TeamResources } from '../teams/types.js';
import { modelOption } from '../../../core/src/models/catalog.js';
import * as vscode from 'vscode';
import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { basename, relative, join, extname, dirname, isAbsolute } from 'node:path';
import { captureBaseline, captureTurnEnd, collectDiff, expandHome, inspectWorkspace, planRevert, projectFile, projectRelative, revertFingerprint, restoreRevertFile, safeRevertPath, validProject, type Baseline } from './workspace.js';
import { HtmlPreviewServer } from './htmlPreview.js';
import { IMAGE_FILE, imagePreviewData, saveImageData, stageImage } from './imageAttachments.js';
import { archiveGeneratedImage } from './imageArchive.js';
import { addAccountWizard, respondToConnection } from '../onboarding/addAccount.js';
import { installManagedClaude } from '../onboarding/installClaude.js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { asksForCanvas, canvasSections, touchesCanvas, CANVAS_LANG, MCP_TEMPLATE, OAuthError, ownClientRedirect, clientFromFields, parseClientJson, parseMcpFile, pluginFields, usesAgentLogin, usesLogin, spawnLines, syncMcpToProfile, parseCatalog, readSkills, withServer, withoutServer, type McpServerDef, type PluginEntry } from '@cortex/core';
import {
  CONNECTOR_NAME,
  connectorIdentity,
  currentStudioHost,
  STUDIO_WANTED_KEY,
  databaseStudioServer,
  loadConnectorIdentity,
  withBuiltInConnectors,
} from '../database/index.js';
import type { PluginCredentials } from '../plugins/credentials.js';
import type { PluginConnections } from '../plugins/connections.js';
import { loginToServer, loginWithOwnClient, type LoginStep } from '../plugins/oauthLogin.js';
import { AGENT_LOGIN_PROVIDERS, claudeMcpLogin, claudeMcpSight, codexMcpLogin, grokConnectorSight } from '../plugins/agentLogin.js';
import { profileServers } from '../plugins/profileServers.js';
import { effectiveMcp, readScopes } from '../plugins/scopes.js';
import type { PluginSwitches } from '../plugins/switches.js';
import { sightInClis, type CliTarget } from '../plugins/cliSight.js';
import type { CliSight } from '@cortex/core';
import {
  Orchestrator,
  SessionStore,
  QuotaTracker,
  AdapterRegistry,
  ClaudeAdapter,
  getAccountIdentity,
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
  type ResolvedAccount,
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
  ExokortexAction,
  HostToWebview,
  Page,
  PluginLiveState,
  PluginScope,
  PluginScopeState,
  ProjectDto,
  WebviewToHost,
  GalaxieKnoten,
} from './protocol.js';
import { compactLog } from './transcript.js';
import { composerText, latestCheckpoint, rewindPlan } from './rewind.js';

import { applyPinnedTarget } from './pinnedTarget.js';
import { XCODE_READINESS, xcodeTarget } from './xcode.js';
import { checkApp, checkApps } from '../plugins/appChecks.js';
import { imageAccountOrder, imagePrompt, imageRoots, isGeneratedImage, isImageProvider, sanitizeImageOptions, suggestedImageName, underRoot } from './images.js';
import { copyGeneratedImage, removeGeneratedImageBackground, resizeGeneratedImage } from './nativeImages.js';
import { ExokortexExport } from '../storage/exokortexExport.js';
import { leseStatus, profileAufDerPlatte, type ExokortexPfade } from '../exokortex/status.js';
import { fuehreAus } from '../exokortex/actions.js';
import { StatusWatch } from '../exokortex/watch.js';
import { Erinnerung, erinnerungsEinstellungen } from '../memory/host.js';
import { exokortexAbruf } from '../memory/exokortexAbruf.js';
import { schreibeMerkliste } from '../memory/merkliste.js';
import { trefferFuerAnzeige, type Helfer } from '../memory/erinnerung.js';
import { ComputerHistoryService } from '../history/service.js';
import { HistoryBridge } from '../history/bridge.js';
import type { HistorySettings } from '../history/types.js';

const REPLAYED_KINDS = new Set<HostToWebview['kind']>([
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

/** `#hashtags` become routing tags — the same thing the panel derives on send. */
function tagsOf(text: string): string[] {
  return [...text.matchAll(/(^|\s)#([\w-]+)/g)].map((m) => m[2]!);
}

interface ConversationRecord {
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
  /** User interactions belong to each concrete widget in this transcript. */
  widgetStates?: Record<string, unknown>;
  /** Provider protocols without an in-turn denial message receive these next turn. */
  pendingPermissionNotes?: string[];
  /** Team membership is frozen for this conversation, including its tool scope. */
  teamAgent?: TeamAgent;
  teamWorkspace?: string;
}

/** So viele Stände bleiben je Chat; ältere Aufträge lassen sich nicht mehr zurücknehmen. */
const MAX_BASELINES = 20;

interface Surface {
  mode: 'sidebar' | 'tab' | 'accounts' | 'rules' | 'analytics' | 'agent';
  conversationId?: string;
  /** Erst die Webview bestätigt ihre tatsächlich gerenderte Seite. */
  page?: Page;
}

const CONV_KEY = 'cortex.conversations';
const QUEUE_KEY = 'cortex.messageQueues';
const NATIVE_SESSIONS_KEY = 'cortex.nativeSessions';
const FORK_POINTS_KEY = 'cortex.forkPoints';
/** Wie viele Chatnachrichten jede Sitzung schon gelesen hat — für das Nachreichen nach Modellwechseln. */
const SEEN_TURNS_KEY = 'cortex.seenTurns';
const TASK_BRIEFS_KEY = 'cortex.taskBriefs';
const SYSTEM_BRIEFS_KEY = 'cortex.systemBriefs';
const PINNED_KEY = 'cortex.pinnedTarget';
const APP_SETTINGS_KEY = 'cortex.appSettings';
/** Vorgabe, solange im Modellknopf nichts gewählt ist. */
const DEFAULT_MODEL = 'claude-opus-5';
const MAX_CONVERSATIONS = 50;

/**
 * Claude-panel style layout: the sidebar webview is a session list only;
 * each conversation opens as its own editor tab (one tab per conversation,
 * revealed if already open). Conversations persist across reloads.
 */
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
  private providerInstallation = false;
  /** Durable copy of every chat, outside globalState and outside the cap. */
  private exokortex = new ExokortexExport();
  /** Läuft nur, solange jemand die Exokortex-Seite offen hat. */
  private exokortexWatch = new StatusWatch({
    intervallMinuten: Math.max(1, vscode.workspace.getConfiguration('cortex')
      .get<number>('exokortex.statusIntervalMinutes', 5)),
    tick: () => this.pushExokortex(),
  });
  private exokortexLaeuft = new Map<string, AbortController>();
  private onTargetChosen?: (target: Target) => void;
  private onPinnedChanged?: (target: Target | undefined) => void;
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
    einstellungen: () => erinnerungsEinstellungen(this.appSettings()),
    abrufen: (auftrag, signal) => exokortexAbruf(this.exokortexPfade())(auftrag, signal),
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
    pluginCredentials.setDeliveries(server => this.catalog().find(e => e.server === server)?.requires?.client);
    pluginCredentials.setRequirements(server => { const entry = this.catalog().find(e => e.server === server); return entry ? pluginFields(entry) : []; });
    ctx.subscriptions.push(
      // Prüfergebnisse und Anmeldungen kommen, während die Seite offen ist —
      // auch aus anderen Fenstern. Jede Fläche erfährt sie, nicht nur die, auf
      // der geklickt wurde.
      pluginCredentials.onDidChange(() => this.broadcastPluginLive()),
      pluginConnections.onDidChange(() => this.broadcastPluginLive()),
      // Ein- oder ausgeschaltet: sofort in die Profile, damit der nächste Zug es weiß.
      pluginSwitches.onDidChange(() => {
        this.resyncProfiles();
        this.broadcastPluginLive();
      }),
      { dispose: () => { for (const login of this.pluginLogins.values()) login.abort.abort(); } },
      vscode.workspace.onDidChangeConfiguration(event => {
        if (NATIVE_SETTINGS.some(setting => event.affectsConfiguration(setting.key))) {
          for (const [webview] of this.surfaces) this.pushNativeSettings(webview);
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.pushProjects()),
      vscode.window.onDidChangeWindowState(state => {
        if (state.focused) { this.pushProjects(); this.pushAccounts(); }
      }),
      accounts.onDidChange(() => {
        this.pushAccounts();
        // A freshly authed account gets its identity/usage without reopening.
        void this.loadIdentities();
        void this.usageRefresher?.();
      }),
      rules.onDidChange(() => {
        this.pushAccounts();
        this.pushRules();
      }),
      // An open analytics tab follows every recorded run live.
      metrics.onDidChange(() => this.pushAnalytics()),
      // Closed from the editor's own UI: drop the handle so the toolbar stops
      // offering to close something that is already gone.
      vscode.window.onDidCloseTerminal(terminal => {
        if (terminal !== this.sidePanes.terminal) return;
        this.sidePanes.terminal = undefined;
        this.terminalDockVisible = false;
        this.pushPanes();
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
  /**
   * Macht aus einer Schwarm-Karte ein Team und startet es.
   *
   * Der Schwarm wird als gewöhnliches Profil gespeichert: der Runner findet
   * einen Lauf nur über den Speicher, und so bleibt der Schwarm unter „Aktive
   * Agenten“ sicht-, stopp- und wiederholbar. Dieselbe Karte schreibt immer
   * dasselbe Profil, statt bei jedem Start ein neues anzulegen.
   */
  private async startSwarm(msg: Extract<WebviewToHost, { kind: 'startSwarm' }>, conversationProject?: string): Promise<void> {
    const task = msg.task.trim();
    if (!task) throw new Error('Gib einen Auftrag ein, bevor der Schwarm startet.');
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(msg.swarmId)) throw new Error('Ungültige Schwarmkennung.');
    const count = Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.floor(msg.count)));
    const store = this.teams();
    store.refresh();
    if (store.error) throw new Error(store.error);
    if (store.runs.some(run => run.teamId === msg.swarmId && run.status === 'running')) throw new Error('Dieser Schwarm arbeitet bereits.');
    // Dieselbe Prüfung wie im Executor, damit eine automatisch besetzte Rolle
    // nicht sofort an einem abgelaufenen oder erschöpften Konto scheitert.
    const usable = this.accounts.all().find(account => !account.disabled
      && ['claude', 'codex', 'grok', 'copilot'].includes(account.provider)
      && this.authHealth?.get(account.id) !== 'expired'
      && this.quota.availability(account.id).available);
    const chosen = msg.agentIds
      .map(id => store.teams.find(team => team.id === id && team.kind === 'agent'))
      .filter((team): team is AgentTeam => !!team);
    if (chosen.length < count && !usable) throw new Error('Für die automatisch besetzten Rollen ist kein Konto verfügbar.');
    const agents: TeamAgent[] = [];
    for (let slot = 0; slot < count; slot++) {
      const picked = chosen[slot];
      const role = picked?.agents[0];
      if (picked && role) {
        // Eigene Kopie wie bei „Gespeicherten Agenten hinzufügen“: eine spätere
        // Änderung am Profil soll einen laufenden Schwarm nicht verändern.
        agents.push({ ...structuredClone(role), id: `swarm-agent-${slot + 1}`, name: picked.name, dependsOn: [] });
        continue;
      }
      const proposed = msg.proposed[slot - chosen.length];
      agents.push({
        id: `swarm-agent-${slot + 1}`,
        name: (proposed?.name?.trim() || `Rolle ${slot + 1}`).slice(0, 80),
        role: (proposed?.role ?? '').slice(0, 200),
        instructions: (proposed?.instructions ?? '').slice(0, 20_000),
        target: { provider: usable!.provider, account: usable!.label },
        // Automatisch besetzte Rollen arbeiten nur lesend: sie sind ungeprüft,
        // und nur lesende Rollen dürfen sich den Arbeitsordner teilen.
        permissionMode: 'safe',
        skillPaths: [],
        dependsOn: [],
      });
    }
    const existing = store.teams.find(team => team.id === msg.swarmId);
    const project = conversationProject && this.projects().some(entry => entry.path === conversationProject)
      ? conversationProject : existing?.projectPath;
    const team = validateTeam({
      id: msg.swarmId,
      kind: 'team',
      name: `Schwarm · ${task.replace(/\s+/g, ' ').slice(0, 60)}`,
      description: 'Aus einer Schwarm-Karte im Chat gestartet.',
      instructions: '',
      ...(project ? { projectPath: project } : {}),
      agents,
      updatedAt: Date.now(),
    });
    store.save(team, store.revision);
    await this.startTeam(team.id, task);
  }

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
    const roots = [...this.skillRoots(), join(homedir(), '.agents', 'skills')];
    for (const root of [...new Set(roots)]) for (const name of readSkills([root])) {
      const path = join(root, name, 'SKILL.md');
      if (!skills.some(skill => skill.path === path)) skills.push({ name, path });
    }
    const servers = Object.entries(profileServers(this.definedServers())).map(([name, server]) => ({ name, title: this.catalog().find(entry => entry.server === name)?.name ?? name, providers: server.providers }));
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
    const available = profileServers(this.definedServers());
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
    // Nur lesende Rollen dürfen sich den Ordner teilen; wer schreiben darf, bekommt ihn allein.
    const writes = agent.permissionMode !== 'safe';
    while (!this.holdProject(lock, writes)) {
      update({ status: 'waiting', activity: writes ? 'Wartet auf den laufenden Auftrag im Projekt' : 'Wartet auf eine Schreibpause im Projekt' });
      if (signal.aborted) throw new Error('Auftrag angehalten.');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    if (signal.aborted) { this.releaseProject(lock, writes); throw new Error('Auftrag angehalten.'); }
    const rec: ConversationRecord = {
      id: shortId(), title: team.kind === 'agent' ? team.name : `${team.name} · ${agent.name}`, projectPath: team.projectPath,
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

  private historyBridge(): HistoryBridge<vscode.Webview> {
    if (this.computerHistoryBridge) return this.computerHistoryBridge;
    const indicator = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    indicator.name = 'Cortex Computerverlauf';
    indicator.command = 'cortex.pauseComputerHistory';
    let indicatorLive = true;
    let indicatorPending = false;
    const updateIndicator = async () => {
      if (!indicatorLive || indicatorPending) return;
      indicatorPending = true;
      try {
        const state = await service.state();
        if (!indicatorLive) return;
        if (!state.settings.enabled) { indicator.hide(); return; }
        indicator.text = state.running ? '$(record) Verlauf lokal' : '$(history) Verlauf wartet';
        indicator.tooltip = `${state.status} — Klicken, um die Erfassung zu pausieren.`;
        indicator.show();
      } catch { if (indicatorLive) indicator.hide(); }
      finally { indicatorPending = false; }
    };
    const service = new ComputerHistoryService({
      directory: join(this.ctx.globalStorageUri.fsPath, 'computer-history'),
      helperPath: join(this.ctx.extensionUri.fsPath, 'dist', 'history-tool'),
      secrets: this.ctx.secrets,
      loadSettings: () => this.ctx.globalState.get<HistorySettings>('cortex.computerHistory.v1'),
      saveSettings: settings => this.ctx.globalState.update('cortex.computerHistory.v1', settings),
      changed: () => { void this.computerHistoryBridge?.notify(); void updateIndicator(); },
    });
    this.ctx.subscriptions.push(
      { dispose: () => { indicatorLive = false; indicator.dispose(); } },
      vscode.commands.registerCommand('cortex.pauseComputerHistory', () => service.configure({ enabled: false })),
    );
    this.computerHistoryBridge = new HistoryBridge(service,
      (webview, message) => this.safePost(webview, message), webview => this.surfaces.has(webview));
    void service.start().then(async () => { await this.computerHistoryBridge?.notify(); await updateIndicator(); }).catch(() => {
      // No captured content or native-process diagnostics in the general output channel.
      this.output.appendLine('[computer-history] Lokaler Verlauf konnte nicht gestartet werden.');
    });
    return this.computerHistoryBridge;
  }

  setTargetListener(cb: (target: Target) => void): void {
    this.onTargetChosen = cb;
  }

  setPinnedListener(cb: (target: Target | undefined) => void): void {
    this.onPinnedChanged = cb;
    cb(this.shownTarget());
  }

  setAuthHealth(map: Map<string, 'ok' | 'expired' | 'unknown'>): void {
    this.authHealth = map;
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
    const directory = join(this.ctx.globalStorageUri.fsPath, 'projectless', id ?? 'scratch');
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

  /** Werte der Einstellungsseiten ohne eigenen `cortex.*`-Schalter. */
  private appSettings(): Record<string, unknown> {
    return this.ctx.globalState.get<Record<string, unknown>>(APP_SETTINGS_KEY, {});
  }

  private settingsWrites: Promise<void> = Promise.resolve();
  private settingsRevision = 0;

  private async storeAppSetting(key: string, value: unknown, requestId?: string): Promise<void> {
    const write = async () => {
      let error: string | undefined;
      try {
        if (!/^[a-zA-Z][\w.:/-]{0,160}$/.test(key)) throw new Error('Ungültiger Einstellungsschlüssel.');
        const next = { ...this.appSettings() };
        if (value === undefined || value === null) delete next[key];
        else {
          const encoded = JSON.stringify(value);
          if (encoded === undefined || encoded.length > 64_000) throw new Error('Einstellungswert ist zu groß.');
          next[key] = JSON.parse(encoded);
        }
        await this.ctx.globalState.update(APP_SETTINGS_KEY, next);
      } catch (failure) { error = String(failure); }
      const message: HostToWebview = { kind: 'appSettings', values: this.appSettings(), revision: ++this.settingsRevision, ack: requestId ? { key, requestId, error } : undefined };
      for (const [w] of this.surfaces) this.safePost(w, message);
      if (error) void vscode.window.showErrorMessage(error);
    };
    this.settingsWrites = this.settingsWrites.then(write, write);
    await this.settingsWrites;
  }

  private pushNativeSettings(webview: vscode.Webview, error?: string, ack?: { key: string; requestId: string; error?: string }): void {
    const config = vscode.workspace.getConfiguration();
    const values = Object.fromEntries(NATIVE_SETTINGS.map(setting => {
      const inspected = config.inspect(setting.key);
      return [setting.key, inspected?.globalValue ?? inspected?.defaultValue];
    }));
    this.safePost(webview, { kind: 'nativeSettings', values, error, revision: ++this.settingsRevision, ack });
  }

  private async pushWorkspace(webview: vscode.Webview, directory = ''): Promise<void> {
    const id = this.surfaces.get(webview)?.conversationId ?? '';
    const workspace = await inspectWorkspace(this.projectRoot(id), directory);
    if (this.surfaces.get(webview)?.conversationId === id) this.safePost(webview, { kind: 'workspace', conversationId: id, workspace });
  }

  pinnedTarget(id = this.visibleConversationId()): Target | undefined {
    const rec = id ? this.conversations.get(id) : undefined;
    return rec ? rec.pinnedTarget : this.ctx.globalState.get<Target>(PINNED_KEY);
  }

  /**
   * Was der Modellknopf zeigt und womit gesendet wird: die eigene Wahl, sonst
   * Opus 5 auf dem ersten Claude-Konto, das gerade Aufträge annehmen kann. Die
   * Vorgabe wird nicht gespeichert — `pinnedTarget` bleibt leer, damit eine
   * zweite Meinung weiter nur dann entfällt, wenn wirklich jemand gewählt hat.
   * Eine Wahl ohne Modell auf einem Claude-Konto bekommt ebenfalls Opus 5.
   */
  shownTarget(id = this.visibleConversationId()): Target | undefined {
    const pinned = this.pinnedTarget(id);
    if (pinned?.model || (pinned && pinned.provider !== 'claude')) return pinned;
    const usable = (a: AccountStatusDto) => a.provider === 'claude' && !a.reviewOnly && a.authState !== 'expired';
    const claude = pinned
      ? this.accountDtos().find(a => usable(a) && a.label === pinned.account)
      : this.accountDtos().find(a => usable(a) && a.available) ?? this.accountDtos().find(usable);
    return claude ? { provider: 'claude', account: claude.label, model: DEFAULT_MODEL } : pinned;
  }

  private pinnedMessage(id = this.visibleConversationId()): HostToWebview {
    return { kind: 'pinnedTarget', target: this.shownTarget(id), standard: !this.pinnedTarget(id) };
  }

  async setPinnedTarget(target: Target | undefined, id = this.visibleConversationId()): Promise<void> {
    const rec = id ? this.conversations.get(id) : undefined;
    if (rec) { rec.pinnedTarget = target; this.persistSoon(); }
    else await this.ctx.globalState.update(PINNED_KEY, target);
    const shown = this.shownTarget(id);
    this.onPinnedChanged?.(shown);
    for (const [webview, surface] of this.surfaces) {
      if ((surface.mode === 'tab' || surface.mode === 'agent') && (!id || surface.conversationId === id)) {
        this.safePost(webview, this.pinnedMessage(id));
      }
    }
  }

  private pushPinned(): void {
    for (const [webview, surface] of this.surfaces) {
      if (surface.mode === 'tab' || surface.mode === 'agent') this.safePost(webview, this.pinnedMessage(surface.conversationId));
    }
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
    void this.pushConnectors(webview);
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

  /** Opens (or reveals) the editor tab bound to a conversation. */
  openConversationTab(id: string): void {
    const rec = this.conversations.get(id);
    if (!rec) return;

    const existing = this.panels.get(id);
    if (this.safeReveal(existing)) return;
    if (existing) this.panels.delete(id);

    const panel = vscode.window.createWebviewPanel(
      'cortex.chatTab',
      rec.title || 'New chat',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'tab-icon.svg');
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
    const panel = vscode.window.createWebviewPanel(
      'cortex.accountsTab',
      'cortex · Accounts',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'tab-icon.svg');
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
    const panel = vscode.window.createWebviewPanel(
      'cortex.rulesTab',
      'cortex · Rules',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'tab-icon.svg');
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
    const panel = vscode.window.createWebviewPanel(
      'cortex.analyticsTab',
      'cortex · Analytics',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.resourceRoots(),
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'tab-icon.svg');
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

  /**
   * Das untere Dock: ein Terminal über die volle Breite rechts der Seitenleiste.
   *
   * Neben dem Chat hätte es keine Kopfzeile und keinen Weg heraus; das Panel
   * bringt beides mit. `cortex.terminalLocation: "beside"` bleibt als
   * ausdrückliche Ausnahme bestehen — wer sie gesetzt hat, hat sie gemeint.
   */
  private openTerminalDock(cwd?: string): void {
    const beside = vscode.workspace.getConfiguration('cortex').get<string>('terminalLocation', 'panel') === 'beside';
    const existing = this.sidePanes.terminal;
    // Ein zweiter Aufruf soll die laufende Sitzung zeigen, nicht ersetzen —
    // sonst verliert jedes Wiederöffnen den Verlauf der Shell.
    const terminal = existing ?? vscode.window.createTerminal({
      name: 'Cortex',
      cwd,
      ...(beside ? { location: { viewColumn: vscode.ViewColumn.Beside } } : {}),
    });
    terminal.show();
    this.sidePanes.terminal = terminal;
    this.terminalDockVisible = true;
    this.pushPanes();
    void this.pushDockContexts();
  }

  /** Verstecken, nicht beenden: `closePanel` lässt die Shell laufen. */
  private async hidePanel(): Promise<void> {
    const known = await vscode.commands.getCommands(true);
    if (known.includes('workbench.action.closePanel')) {
      await vscode.commands.executeCommand('workbench.action.closePanel');
    }
  }

  /**
   * Der Terminal-Knopf oben rechts. Zweimal drücken heißt auf und wieder zu —
   * und dazwischen bleibt die Sitzung stehen.
   */
  async toggleTerminalDock(): Promise<void> {
    if (this.sidePanes.terminal && this.terminalDockVisible) {
      this.terminalDockVisible = false;
      await this.hidePanel();
      this.pushPanes();
      await this.pushDockContexts();
      return;
    }
    const surface = this.agentPanel ? this.surfaces.get(this.agentPanel.webview) : undefined;
    this.openTerminalDock(await this.conversationCwd(surface?.conversationId));
  }

  /**
   * Was die Knöpfe der Titelleiste als aktiv zeichnen dürfen.
   *
   * Der Zustand des Datei-Docks liegt in der Webview; er kommt als `dockState`
   * herein. Browser und Terminal kennt der Provider selbst.
   */
  private dockOpen = false;

  /**
   * Diese Werkzeuge bedienen ausschließlich die Hauptfläche im Chatmodus.
   * Sichtbar statt aktiv: Browser und Terminal dürfen den Fokus übernehmen,
   * ohne dass dabei ihre Schließen-Schalter aus der Titelleiste verschwinden.
   */
  private pushTitlebarContext(): Thenable<unknown> {
    const panel = this.agentPanel;
    const chatVisible = Boolean(panel?.visible && this.surfaces.get(panel.webview)?.page === 'chat');
    return vscode.commands.executeCommand('setContext', 'cortex.chatToolsVisible', chatVisible);
  }

  private async pushDockContexts(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'cortex.filesOpen', this.dockOpen);
    await vscode.commands.executeCommand('setContext', 'cortex.browserOpen', this.sidePanes.browser);
    await vscode.commands.executeCommand('setContext', 'cortex.terminalOpen', Boolean(this.sidePanes.terminal) && this.terminalDockVisible);
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

  /** Legt den Text einer Nachricht wieder ins Eingabefeld des Chats. */
  private seedComposer(id: string, echo: Extract<HostToWebview, { kind: 'userEcho' }>): void {
    this.toConversation(id, { kind: 'composerSeed', text: composerText(echo.text), attachments: echo.attachments }, { log: false });
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

  toolbarAction(action: 'files' | 'changes' | 'canvas' | 'browser' | 'terminal' | 'sidebar' | 'project'): void {
    if (action === 'terminal') { void this.toggleTerminalDock(); return; }
    if (action === 'browser') { void this.openPreview(); return; }
    if (!this.agentPanel) return;
    this.safeReveal(this.agentPanel);
    this.safePost(this.agentPanel.webview, { kind: 'toolbar', action });
  }

  /** Real Office templates ship with their previews and instructions; personal text templates still work. */
  private templateEntries(webview: vscode.Webview): TemplateEntry[] {
    return readTemplateEntries(
      join(this.ctx.extensionUri.fsPath, 'templates'),
      join(homedir(), '.cortex', 'templates'),
      path => webview.asWebviewUri(vscode.Uri.file(path)).toString(),
    );
  }

  private readTemplates(webview: vscode.Webview): Extract<HostToWebview, { kind: 'templates' }>['items'] {
    return this.templateEntries(webview).map(entry => entry.item);
  }

  /**
   * Wo die Konnektoren definiert sind. Ein Projekt darf eine eigene Datei
   * mitbringen; sonst gilt die persönliche.
   */
  private connectorPaths(): string[] {
    const ws = vscode.workspace.workspaceFolders?.[0];
    return [
      ws ? join(ws.uri.fsPath, '.cortex', 'mcp.json') : undefined,
      join(homedir(), '.cortex', 'mcp.json'),
    ].filter((p): p is string => !!p);
  }

  /**
   * Der ausgelieferte Plugin-Katalog. Er ändert sich nur mit einem Build, wird
   * also einmal gelesen und behalten. Fällt er aus, bleibt die Seite leer statt
   * halb gefüllt — ein halber Katalog wäre schlechter als ein sichtbar leerer.
   */
  private catalogCache?: PluginEntry[];
  private catalog(): PluginEntry[] {
    if (this.catalogCache) return this.catalogCache;
    try {
      const file = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'plugins', 'catalog.json');
      const parsed = parseCatalog(readFileSync(file.fsPath, 'utf8'));
      this.catalogCache = parsed.ok ? parsed.catalog.entries : [];
    } catch {
      this.catalogCache = [];
    }
    return this.catalogCache;
  }

  /**
   * Beide möglichen Orte für mcp.json — nicht nur der gerade gewinnende. Wer
   * einen Server einträgt, muss sehen können, ob er im Projekt landet oder
   * überall gilt.
   */
  private pluginScopes(): PluginScopeState[] {
    return readScopes();
  }

  /** Wo Skills wirklich liegen: in den verwalteten Profilen und beim Nutzer selbst. */
  private skillRoots(): string[] {
    const roots = [join(homedir(), '.claude', 'skills'), join(homedir(), '.cortex', 'skills')];
    for (const account of this.accounts.all()) {
      if (account.homeDir) roots.push(join(account.homeDir, '.claude', 'skills'));
    }
    return [...new Set(roots)];
  }

  /**
   * Der Zustand der Plugin-Seite. Über die Leitung geht nur, was sich ändern
   * kann — der Katalog selbst liegt im Bündel des Webviews.
   */
  private async pushPlugins(webview: vscode.Webview, sync = false): Promise<void> {
    const scopes = this.pluginScopes();
    const effective = effectiveMcp(scopes);
    const defined = effective.servers;
    // Gespiegelt wird immer die volle Menge: `syncMcpToProfile` entfernt jeden
    // Server, der nicht im übergebenen Satz steht — den eingebauten hier
    // wegzulassen hieße, ihn bei jedem Übertragen aus den Profilen zu werfen.
    // Die Zugangsdaten gehen dabei mit; ohne sie nähme jede Spiegelung einem
    // verbundenen Plugin den Zugang.
    const servers = profileServers(defined);
    if (sync) void this.ctx.globalState.update(STUDIO_WANTED_KEY, true);
    const accounts = this.accounts.all().map(account => ({
      provider: account.provider,
      label: account.label,
      error: sync ? syncMcpToProfile(account, servers) : undefined,
    }));
    // Beim Öffnen: was lange nicht geprüft wurde, wird es jetzt — vor dem
    // Senden angestoßen, damit die Seite gleich „Prüfe …“ zeigt statt kurz
    // „Nicht geprüft“. Das Ergebnis kommt als `pluginLive` nach.
    if (!sync) this.checkStalePlugins();
    this.safePost(webview, {
      kind: 'plugins',
      scopes,
      builtIn: await this.builtInConnector(Object.keys(defined)),
      skills: [...readSkills(this.skillRoots())],
      accounts,
      apps: await checkApps(),
      origin: effective.origin,
      shadowed: effective.shadowed,
      ...this.pluginLive(),
    });
  }

  private pluginLogChannel?: vscode.OutputChannel;

  private pluginLogins = new Map<string, { step: LoginStep['step']; message: string; url?: string; account?: string; abort: AbortController }>();

  private pluginLive(): PluginLiveState {
    return {
      credentials: this.pluginCredentials.state(),
      connections: this.pluginConnections.all(),
      logins: Object.fromEntries(
        [...this.pluginLogins].map(([server, { step, message, url, account }]) => [server, { step, message, url, account }]),
      ),
      disabled: this.pluginSwitches.disabled(),
    };
  }

  private broadcastPluginLive(): void {
    const live = { kind: 'pluginLive' as const, ...this.pluginLive() };
    for (const [w] of this.surfaces) this.safePost(w, live);
  }

  /** Was aus beiden mcp.json gilt — dieselbe Zusammenführung wie beim Spiegeln. */
  private definedServers(): Record<string, McpServerDef> {
    return effectiveMcp().servers;
  }

  /** Die Profile neu schreiben, ohne dass eine bestimmte Fläche den Bericht braucht. */
  private resyncProfiles(): void {
    void this.ctx.globalState.update(STUDIO_WANTED_KEY, true);
    const servers = profileServers(this.definedServers());
    for (const account of this.accounts.all()) {
      const error = syncMcpToProfile(account, servers);
      if (error) this.output.appendLine(`[cortex] Plugin-Spiegelung (${account.label}): ${error}`);
    }
  }

  /**
   * Ob sich eine Prüfung überhaupt lohnt. Fehlt ein Pflichtwert oder die
   * Anmeldung, weiß die Seite schon, was zu tun ist — ein Prozess, der ohne
   * Schlüssel startet und stirbt, sagt nichts Neues.
   */
  private readyToCheck(entry: PluginEntry, def: McpServerDef): boolean {
    const values = this.pluginCredentials.values(entry.server);
    const missing = pluginFields(entry).some(f => !f.optional && !values[f.env] && !def.env?.[f.env]?.trim());
    if (missing) return false;
    if (usesLogin(entry) && !this.pluginCredentials.oauth(entry.server)) return false;
    if (entry.requires?.kind === 'oauth-client' && !this.pluginCredentials.client(entry.server)) return false;
    return true;
  }

  /**
   * Einen installierten Eintrag prüfen. `force` ist der ausdrückliche Klick:
   * er prüft auch frische Ergebnisse und auch Einträge, deren Programm beim
   * Start selbst nachfragt (Xcode) — die prüft das bloße Öffnen der Seite nie.
   */
  private async checkPlugin(entry: PluginEntry, force: boolean, def = this.definedServers()[entry.server]): Promise<void> {
    if (!def || !this.readyToCheck(entry, def) || this.pluginSwitches.isDisabled(entry.server)) return;
    if (usesAgentLogin(entry)) {
      await this.checkWithAgents(entry);
      return;
    }
    // Ein Programm, das beim Zugriff selbst nachfragt, spricht Cortex von sich
    // aus nur an, wenn es ohnehin läuft — gestartet wird es nie.
    if (!force && entry.requires?.kind === 'app') {
      const app = await checkApp(entry.requires.check);
      if (!app?.running) return;
    }
    this.pluginConnections.begin(entry.server);
    // Ein bald ablaufender Token wird vorher aufgefrischt — sonst prüfte die
    // Seite genau den Token, den der nächste Zug ohnehin nicht mehr benutzt.
    if (usesLogin(entry) && (await this.pluginCredentials.refresh(entry.server))) {
      this.resyncProfiles();
    }
    // npx lädt beim ersten Mal ein Paket; eine App-Brücke wie Xcode antwortet
    // sofort oder gar nicht — dort lohnt kein langes Warten.
    const timeout = def.command === 'npx' || def.command === 'docker' ? 180_000 : entry.requires?.kind === 'app' ? 30_000 : undefined;
    const readiness = entry.requires?.check === 'xcode' ? XCODE_READINESS : undefined;
    const result = await this.pluginConnections.check(entry.server, this.pluginCredentials.apply(entry.server, def), timeout, readiness);
    // Abgelehnt trotz Token: einmal auffrischen und nachprüfen, bevor die Seite
    // „Neu anmelden“ verlangt. Viele Anbieter widerrufen Tokens früher, als ihre
    // Laufzeit sagt.
    if (result.status === 'anmeldung' && this.pluginCredentials.oauth(entry.server)) {
      if (await this.pluginCredentials.refresh(entry.server, true)) {
        this.resyncProfiles();
        if (this.pluginCredentials.oauth(entry.server)) {
          await this.pluginConnections.check(entry.server, this.pluginCredentials.apply(entry.server, def));
        }
      }
    }
    if (force) await this.sightInClis(entry.server);
  }

  /**
   * Ein Server ohne Katalogeintrag — selbst in mcp.json geschrieben oder der
   * eingebaute Database-Studio-Konnektor. Er bekommt dieselbe Prüfung wie jedes
   * Plugin; die CLIs starten ihn in jedem Zug ohnehin.
   */
  private async checkServer(name: string, force: boolean): Promise<void> {
    const entry = this.catalog().find(e => e.server === name);
    if (entry) return this.checkPlugin(entry, force);
    if (this.pluginSwitches.isDisabled(name)) return;
    const def = profileServers(this.definedServers())[name];
    if (!def) return;
    this.pluginConnections.begin(name);
    const timeout = def.command === 'npx' || def.command === 'docker' ? 180_000 : undefined;
    await this.pluginConnections.check(name, def, timeout);
    if (force) await this.sightInClis(name);
  }

  private checkStalePlugins(): void {
    const defined = profileServers(this.definedServers());
    const catalogServers = new Set(this.catalog().map(e => e.server));
    for (const entry of this.catalog()) {
      if (defined[entry.server] && this.pluginConnections.isStale(entry.server)) void this.checkPlugin(entry, false);
    }
    for (const name of Object.keys(defined)) {
      if (!catalogServers.has(name) && this.pluginConnections.isStale(name)) void this.checkServer(name, false);
    }
  }

  /** Die CLIs der Konten, deren Profile Cortex beschreibt — mit genau der Umgebung, mit der Cortex sie startet. */
  private cliTargets(): CliTarget[] {
    return this.accounts.all().flatMap(account => {
      if (account.disabled || !account.homeDir) return [];
      if (account.provider !== 'claude' && account.provider !== 'codex' && account.provider !== 'grok') return [];
      if (account.provider === 'claude' && account.authMode !== 'managed-home') return [];
      const adapter = this.adapters.get(account.provider);
      if (!adapter) return [];
      const { command, env } = adapter.interactiveCommand({ ...account, secret: undefined } as ResolvedAccount);
      return command[0] ? [{ provider: account.provider, label: account.label, account: account.id, command: command[0], env }] : [];
    });
  }

  /** Nur nach einer erfolgreichen Prüfung: ein Server, der nicht antwortet, antwortet auch der CLI nicht. */
  private async sightInClis(server: string): Promise<void> {
    if (this.pluginConnections.get(server)?.status !== 'verbunden') return;
    const targets = this.cliTargets();
    if (!targets.length) return;
    this.pluginConnections.attachClis(server, targets.map(t => ({ provider: t.provider, label: t.label, state: 'eingetragen', detail: 'Wird gefragt …' })), true);
    const sights = await sightInClis(server, targets);
    this.pluginConnections.attachClis(server, sights);
  }

  /** Die CLIs, die sich selbst bei einem Anbieter anmelden können — auf Wunsch nur ein Konto. */
  private agentTargets(account?: string): CliTarget[] {
    return this.cliTargets().filter(t => AGENT_LOGIN_PROVIDERS.includes(t.provider) && (!account || t.account === account));
  }

  /** Was Grok zuletzt auf ausdrücklichen Klick über seine Konto-Konnektoren gesagt hat — je Server und Konto. */
  private grokSights = new Map<string, CliSight>();

  /**
   * Prüfen, wo nur die CLIs an den Server kommen: Cortex hat kein Token und
   * fragt jedes Konto einzeln. Verbunden heißt, mindestens eines ist es. Grok
   * wird hier nie gefragt (das kostet einen Modellaufruf) — seine Zeile trägt
   * das Ergebnis des letzten Klicks auf „Prüfen“.
   */
  private async checkWithAgents(entry: PluginEntry): Promise<void> {
    const targets = this.agentTargets();
    const groks = this.cliTargets().filter(t => t.provider === 'grok');
    const previous = this.pluginConnections.get(entry.server)?.clis ?? [];
    await this.pluginConnections.checkWith(entry.server, async () => {
      const checkedAt = Date.now();
      if (!targets.length && !groks.length) {
        return { status: 'fehler', checkedAt, message: `${entry.name} läuft über Claude Code, Codex oder Grok — dafür fehlt ein Konto.` };
      }
      const results = await Promise.all(targets.map(async target => {
        if (target.provider === 'claude') return claudeMcpSight(target, entry.server);
        const [sight] = await sightInClis(entry.server, [target]);
        // Für Codex heißt „angemeldet“ hier verbunden: prüfen kann es erst ein Zug.
        const loggedIn = sight!.state === 'eingetragen' && /angemeldet/.test(sight!.detail ?? '');
        return { sight: loggedIn ? { ...sight!, state: 'verbunden' as const, detail: 'In Codex angemeldet.' } : sight!, tools: undefined };
      }));
      const grokRows = groks.map(t =>
        this.grokSights.get(`${entry.server}:${t.account}`)
        ?? previous.find(c => c.account === t.account && c.provider === 'grok' && c.state !== 'eingetragen')
        ?? { provider: 'grok', label: t.label, account: t.account, state: 'eingetragen' as const, detail: `Noch nicht geprüft — Grok nutzt den ${entry.name}-Konnektor seines Kontos.` });
      const clis = [...results.map(r => r.sight), ...grokRows];
      const tools = results.find(r => r.tools?.length)?.tools;
      if (clis.some(c => c.state === 'verbunden')) {
        return { status: 'verbunden', checkedAt, tools: (tools ?? []).map(name => ({ name })), clis };
      }
      return { status: 'anmeldung', checkedAt, message: `In keinem Konto bei ${entry.name} angemeldet.`, clis };
    });
  }

  /** Grok einzeln fragen, ob der Konnektor in seinem Konto steckt — nur auf Klick. */
  private async checkGrokAccount(webview: vscode.Webview, entry: PluginEntry, account: string): Promise<void> {
    const target = this.cliTargets().find(t => t.provider === 'grok' && t.account === account);
    if (!target || this.pluginLogins.has(entry.server)) return;
    const login = { step: 'suche' as LoginStep['step'], message: `Grok (${target.label}) wird gefragt …`, account, abort: new AbortController(), url: undefined };
    this.pluginLogins.set(entry.server, login);
    this.broadcastPluginLive();
    try {
      const { sight } = await grokConnectorSight(target, entry.server);
      this.grokSights.set(`${entry.server}:${account}`, sight);
    } finally {
      if (this.pluginLogins.get(entry.server) === login) this.pluginLogins.delete(entry.server);
      this.broadcastPluginLive();
    }
    await this.checkWithAgents(entry);
    await this.pushPlugins(webview);
  }

  /**
   * Die Anmeldung den CLIs überlassen — nacheinander, damit immer nur ein
   * Browserfenster auf Bestätigung wartet. Eine gelungene genügt.
   */
  private async signInWithAgents(webview: vscode.Webview, entry: PluginEntry, account?: string): Promise<boolean> {
    const id = entry.id;
    const targets = this.agentTargets(account);
    if (!targets.length) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: `${entry.name} meldet sich über Claude Code oder Codex an — lege dafür zuerst ein Konto an.` });
      return false;
    }
    if (this.pluginLogins.has(entry.server)) return false;
    const abort = new AbortController();
    const login = { step: 'suche' as LoginStep['step'], message: 'Anmeldung wird vorbereitet …', abort, url: undefined as string | undefined, account: account as string | undefined };
    this.pluginLogins.set(entry.server, login);
    this.broadcastPluginLive();
    const done: string[] = [];
    const failed: string[] = [];
    try {
      for (const target of targets) {
        if (abort.signal.aborted) break;
        const who = `${target.provider === 'claude' ? 'Claude Code' : 'Codex'} (${target.label})`;
        login.account = target.account;
        login.step = 'suche';
        login.message = `${who} wird bei ${entry.name} angemeldet …`;
        login.url = undefined;
        this.broadcastPluginLive();
        const deps = {
          signal: abort.signal,
          onUrl: (url: string, opensItself: boolean) => {
            login.step = 'browser';
            login.message = `Im Browser bei ${entry.name} bestätigen — für ${who}.`;
            login.url = url;
            this.broadcastPluginLive();
            // Codex öffnet den Browser selbst; ein zweites Fenster verwirrt nur.
            if (!opensItself) void vscode.env.openExternal(url as unknown as vscode.Uri);
          },
        };
        const result = target.provider === 'claude'
          ? await claudeMcpLogin(target, entry.server, deps)
          : await codexMcpLogin(target, entry.server, deps);
        if (result.ok) done.push(who);
        else if (!result.cancelled) {
          failed.push(`${who}: ${result.message}`);
          this.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server} über ${who}: ${result.message}`);
        }
      }
    } finally {
      if (this.pluginLogins.get(entry.server) === login) {
        this.pluginLogins.delete(entry.server);
        this.broadcastPluginLive();
      }
    }
    if (!done.length) {
      const message = abort.signal.aborted ? `Anmeldung bei ${entry.name} abgebrochen.` : `Anmeldung bei ${entry.name} nicht möglich — ${failed.join(' · ')}`;
      this.safePost(webview, { kind: 'pluginProgress', id, ok: abort.signal.aborted, message });
      return false;
    }
    if (failed.length) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: `${entry.name}: angemeldet für ${done.join(', ')} — nicht für ${failed.join(' · ')}` });
    }
    return true;
  }

  /**
   * Database Studio ist kein Eintrag in mcp.json, sondern die Integration
   * selbst: sie wird beim Spiegeln dazugelegt und lässt sich nicht durch
   * Löschen aus der Datei entfernen, sondern nur über
   * `cortex.databaseStudio.enabled` abschalten. Genau so steht sie auf der
   * Seite — sichtbar, aber ohne Installieren-Knopf.
   *
   * Name, Beschreibung und Symbol kommen aus `studio-mcp` selbst, damit die
   * Plugin-Seite und der MCP-Handschlag nicht auseinanderlaufen.
   */
  private async builtInConnector(definedNames: string[]): Promise<import('./protocol.js').BuiltInConnectorDto | undefined> {
    const host = currentStudioHost();
    const server = databaseStudioServer(host);
    // Abgeschaltet oder nicht installiert: dann gibt es nichts zu melden.
    if (!server) return undefined;
    const identity = (await loadConnectorIdentity()) ?? connectorIdentity();
    return {
      name: CONNECTOR_NAME,
      title: identity?.title ?? 'Vektor',
      description: identity?.description ?? 'Datenbanken in Cortex öffnen und abfragen.',
      icon: identity?.icon,
      target: server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(' '),
      running: host?.running === true,
      sessions: host?.sessionCount ?? 0,
      overridden: definedNames.includes(CONNECTOR_NAME),
    };
  }

  /**
   * Installieren heißt: erst verbinden, dann eintragen. Werte in den
   * Schlüsselbund, die Anmeldung im Browser, die Prüfung gegen die Definition
   * aus dem Katalog — und erst wenn der Server wirklich antwortet, die Zeile in
   * mcp.json und die Spiegelung in die Profile. Was nicht verbunden ist, steht
   * weder oben unter „Installiert“ noch in einem Profil.
   *
   * Nichts wird nur gemerkt: misslingt ein Schritt, sagt die Meldung das, und
   * mcp.json bleibt, wie sie war.
   */
  private async changePlugin(
    webview: vscode.Webview,
    id: string,
    scope: PluginScope,
    install: boolean,
    values?: Record<string, string>,
  ): Promise<void> {
    const entry = this.catalog().find(e => e.id === id);
    const place = this.pluginScopes().find(s => s.id === scope);
    if (!entry || !place) return;
    const fail = (message: string) =>
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message });

    if (place.error) return fail(`${place.path} ist nicht lesbar: ${place.error}`);
    if (!install) return this.removePlugin(webview, entry, place.path);

    if (values && Object.keys(values).length) {
      try {
        await this.pluginCredentials.setValues(entry.server, values);
      } catch (e) {
        return fail(`Der Schlüsselbund hat die Werte nicht angenommen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Schon eingetragen (etwa von Hand): dann gilt die Zeile in der Datei.
    const def = this.definedServers()[entry.server] ?? entry.definition;
    if (entry.requires?.kind === 'oauth-client' && !this.pluginCredentials.client(entry.server)) {
      return fail(`Für ${entry.name} zuerst deinen OAuth-Client hinterlegen — danach meldet Cortex dich an und trägt es ein.`);
    }
    if (!this.readyToCheck(entry, def) && !usesLogin(entry)) {
      return fail(`${entry.name}: es fehlt noch ${pluginFields(entry).length > 1 ? 'ein Wert' : 'der Schlüssel'}.`);
    }
    if (this.pluginSwitches.isDisabled(entry.server)) await this.pluginSwitches.set(entry.server, true);

    if (usesAgentLogin(entry)) return this.installWithAgents(webview, entry, place.path);

    if (usesLogin(entry) && !this.pluginCredentials.oauth(entry.server)) {
      const signedIn = await this.signIn(webview, entry, def);
      if (signedIn === false) return;
    }

    this.safePost(webview, { kind: 'pluginProgress', id, ok: true, message: `${entry.name}: Verbindung wird geprüft …` });
    await this.checkPlugin(entry, true, def);
    const result = this.pluginConnections.get(entry.server);
    if (result?.status !== 'verbunden') {
      // Kein halber Eintrag: der Beleg einer gescheiterten Probe gehört zu
      // keinem installierten Plugin und würde beim nächsten Versuch nur stören.
      if (!this.definedServers()[entry.server]) this.pluginConnections.forget(entry.server);
      const hint = entry.requires?.kind === 'app' ? ` ${entry.requires.hint}` : '';
      return fail(`${entry.name} ist nicht verbunden und wurde nicht eingetragen: ${result?.message ?? 'Der Server antwortet nicht.'}${hint}`);
    }

    try {
      const before = existsSync(place.path) ? readFileSync(place.path, 'utf8') : MCP_TEMPLATE;
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(place.path)));
      await vscode.workspace.fs.writeFile(vscode.Uri.file(place.path), Buffer.from(withServer(before, entry.server, entry.definition), 'utf8'));
    } catch (e) {
      return fail(`${entry.name} ist verbunden, aber ${place.path} ließ sich nicht schreiben: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Erst jetzt spiegeln: der Bericht je Konto soll den neuen Stand zeigen.
    await this.pushPlugins(webview, true);
    const count = result.tools?.length ?? 0;
    this.safePost(webview, {
      kind: 'pluginProgress', id, ok: true,
      message: `${entry.name} ist verbunden — ${count} ${count === 1 ? 'Werkzeug' : 'Werkzeuge'}. Neue Chats können es benutzen.`,
    });
    void this.sightInClis(entry.server);
  }

  /**
   * Hier geht es umgekehrt: die CLIs melden sich nur bei einem Server an, der in
   * ihrem Profil steht. Also erst eintragen und spiegeln, dann anmelden — und
   * gelingt keine Anmeldung, die Zeile wieder heraus.
   */
  private async installWithAgents(webview: vscode.Webview, entry: PluginEntry, path: string): Promise<void> {
    const write = async (change: (text: string) => string) => {
      const before = existsSync(path) ? readFileSync(path, 'utf8') : MCP_TEMPLATE;
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(path)));
      await vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(change(before), 'utf8'));
    };
    try {
      await write(text => withServer(text, entry.server, entry.definition));
    } catch (e) {
      this.safePost(webview, { kind: 'pluginProgress', id: entry.id, ok: false, message: `Konnte ${path} nicht schreiben: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    await this.pushPlugins(webview, true);
    if (!(await this.signInWithAgents(webview, entry))) {
      await write(text => withoutServer(text, entry.server)).catch(() => undefined);
      this.pluginConnections.forget(entry.server);
      await this.pushPlugins(webview, true);
      return;
    }
    await this.reportCheck(webview, entry);
  }

  private async removePlugin(webview: vscode.Webview, entry: PluginEntry, path: string): Promise<void> {
    try {
      const before = existsSync(path) ? readFileSync(path, 'utf8') : MCP_TEMPLATE;
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(path)));
      await vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(withoutServer(before, entry.server), 'utf8'));
    } catch (e) {
      this.safePost(webview, { kind: 'pluginProgress', id: entry.id, ok: false, message: `Konnte ${path} nicht schreiben: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    // Entfernen heißt auch: Schlüssel und Anmeldung weg. Ein Token, der
    // nirgends mehr gebraucht wird, soll nicht im Schlüsselbund liegen bleiben.
    this.pluginLogins.get(entry.server)?.abort.abort();
    await this.pluginCredentials.clear(entry.server);
    this.pluginConnections.forget(entry.server);
    await this.pushPlugins(webview, true);
    this.safePost(webview, { kind: 'pluginProgress', id: entry.id, ok: true, message: `${entry.name} entfernt.` });
  }

  /** Prüfen und das Ergebnis als Meldung sagen — der Abschluss jeder Einrichtung. */
  private async reportCheck(webview: vscode.Webview, entry: PluginEntry): Promise<void> {
    this.safePost(webview, { kind: 'pluginProgress', id: entry.id, ok: true, message: `${entry.name}: Verbindung wird geprüft …` });
    await this.checkPlugin(entry, true);
    const result = this.pluginConnections.get(entry.server);
    if (result?.status === 'verbunden') {
      const count = result.tools?.length ?? 0;
      this.safePost(webview, {
        kind: 'pluginProgress', id: entry.id, ok: true,
        message: `${entry.name} ist verbunden — ${count} ${count === 1 ? 'Werkzeug' : 'Werkzeuge'}. Neue Chats können es benutzen.`,
      });
    } else if (result) {
      this.safePost(webview, {
        kind: 'pluginProgress', id: entry.id, ok: false,
        message: `${entry.name} ist eingetragen, antwortet aber nicht: ${result.message ?? 'unbekannter Fehler'}`,
      });
    }
  }

  private async setPluginValues(webview: vscode.Webview, id: string, values: Record<string, string>): Promise<void> {
    const entry = this.catalog().find(e => e.id === id);
    if (!entry) return;
    try {
      await this.pluginCredentials.setValues(entry.server, values);
    } catch (e) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: `Der Schlüsselbund hat die Werte nicht angenommen: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    if (!this.definedServers()[entry.server]) return;
    this.resyncProfiles();
    await this.reportCheck(webview, entry);
  }

  /** Neu anmelden bei einem eingetragenen Plugin — danach prüfen. */
  private async loginPlugin(webview: vscode.Webview, id: string, account?: string): Promise<void> {
    const entry = this.catalog().find(e => e.id === id);
    const def = entry && this.definedServers()[entry.server];
    if (!entry || !def) return;
    if (account && usesAgentLogin(entry)) {
      // Grok meldet Cortex nirgends an: dort heißt die Zeile „Prüfen“.
      if (this.cliTargets().some(t => t.provider === 'grok' && t.account === account)) return this.checkGrokAccount(webview, entry, account);
      if (!(await this.signInWithAgents(webview, entry, account))) return;
      await this.reportCheck(webview, entry);
      return;
    }
    const signedIn = await this.signIn(webview, entry, def);
    if (signedIn === false) return;
    if (signedIn) {
      this.resyncProfiles();
      await this.pushPlugins(webview);
    }
    await this.reportCheck(webview, entry);
  }

  /**
   * Die Anmeldung im Browser bis zum Token im Schlüsselbund. `true`: angemeldet,
   * `undefined`: der Server verlangt gar keine, `false`: gescheitert — die
   * Meldung dazu ist dann schon gesagt.
   */
  private async signIn(webview: vscode.Webview, entry: PluginEntry, def: McpServerDef): Promise<boolean | undefined> {
    if (usesAgentLogin(entry)) return this.signInWithAgents(webview, entry);
    const id = entry.id;
    const own = this.pluginCredentials.client(entry.server);
    // Ohne eigenen Client geht es nur über einen Remote-Server, der Cortex selbst registriert.
    if (!own && (!def.url || entry.requires?.kind === 'oauth-client')) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: `Für ${entry.name} zuerst Client-ID und Secret hinterlegen.` });
      return false;
    }
    if (this.pluginLogins.has(entry.server)) return false;

    const abort = new AbortController();
    const login = { step: 'suche' as LoginStep['step'], message: 'Anmeldung wird vorbereitet …', abort, url: undefined as string | undefined };
    this.pluginLogins.set(entry.server, login);
    this.broadcastPluginLive();
    try {
      const deps = {
        // Als String, nicht als Uri: ein Uri-Objekt dekodiert VS Code und kodiert
        // die Query neu — ein `%26` oder `%2B` in einem Wert käme beim Anbieter
        // als Trennzeichen an. Einen String reicht der Host unverändert weiter,
        // so wie VS Codes eigene Anmeldung ihn übergibt.
        openExternal: (url: string) => vscode.env.openExternal(url as unknown as vscode.Uri),
        signal: abort.signal,
        onStep: (step: LoginStep) => {
          login.step = step.step;
          login.message = step.message;
          login.url = step.step === 'browser' ? step.url : undefined;
          this.broadcastPluginLive();
        },
      };
      const stored = own
        ? await loginWithOwnClient({ url: def.url, client: own, delivery: entry.requires?.client }, deps)
        : await loginToServer(def.url!, deps);
      await this.pluginCredentials.setOAuth(entry.server, stored);
      return true;
    } catch (e) {
      const code = e instanceof OAuthError ? e.code : undefined;
      if (code === 'not_required') return undefined;
      if (code === 'registration_unsupported') {
        // Kein Fehler, den man wiederholen könnte: der Anbieter verlangt eine
        // eigene App. Die Seite bietet ab jetzt die Felder dafür an.
        await this.pluginCredentials.markClientRequired(entry.server);
        this.safePost(webview, {
          kind: 'pluginProgress', id, ok: false,
          message: `${entry.name} lässt keine automatische Registrierung zu. Lege in der Konsole des Anbieters eine App an und trage Client-ID und Secret ein.`,
        });
        return false;
      }
      if (code === 'registration_forbidden') {
        // Auch kein eigener Client hilft: der Anbieter wählt die Programme selbst
        // aus. Gibt es einen Zugang ohne diese Anmeldung, ist er der Ausweg.
        const other = this.catalog().find(e => e.service && e.service === entry.service && e.id !== entry.id && !usesLogin(e));
        this.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server}: ${e instanceof Error ? e.message : String(e)}`);
        this.safePost(webview, {
          kind: 'pluginProgress', id, ok: false,
          message: `${entry.name} lässt über diesen Zugang nur Programme zu, die es selbst freigegeben hat — Cortex gehört nicht dazu.`,
          ...(other ? { action: { label: `Zu „${other.variantLabel ?? other.name}“`, open: other.id } } : {}),
        });
        return false;
      }
      const message = code === 'cancelled'
        ? `Anmeldung bei ${entry.name} abgebrochen.`
        : `Anmeldung bei ${entry.name} nicht möglich: ${e instanceof Error ? e.message : String(e)}`;
      this.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server}: ${e instanceof Error ? e.message : String(e)}`);
      this.safePost(webview, { kind: 'pluginProgress', id, ok: code === 'cancelled', message });
      return false;
    } finally {
      if (this.pluginLogins.get(entry.server) === login) {
        this.pluginLogins.delete(entry.server);
        this.broadcastPluginLive();
      }
    }
  }

  /** Eine Client-Datei lesen — klein, JSON, sonst nichts. */
  private async readPluginClientFile(webview: vscode.Webview, id: string, path: string): Promise<void> {
    const fail = (message: string) => this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message });
    if (!/\.json$/i.test(path)) return fail('Erwartet wird die JSON-Datei des OAuth-Clients.');
    try {
      const info = await stat(path);
      if (info.size > 64_000) return fail('Die Datei ist zu groß für eine Client-Datei.');
      const content = await readFile(path, 'utf8');
      await this.storePluginClient(webview, id, parseClientJson(content), basename(path));
    } catch (e) {
      fail(`Die Datei ließ sich nicht lesen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Den Client ablegen und — ist das Plugin installiert — gleich anmelden. Wer
   * Client-ID und Secret einträgt, will verbunden sein, nicht einen weiteren Knopf.
   */
  private async storePluginClient(
    webview: vscode.Webview,
    id: string,
    parsed: ReturnType<typeof parseClientJson>,
    fileName?: string,
  ): Promise<void> {
    const entry = this.catalog().find(e => e.id === id);
    if (!entry) return;
    if (!parsed.ok) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: parsed.error });
      return;
    }
    if (entry.requires?.client?.provider === 'google' && !/\.apps\.googleusercontent\.com$/.test(parsed.client.clientId)) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: 'Das ist keine Google-Client-ID — sie endet auf „.apps.googleusercontent.com“.' });
      return;
    }
    try {
      await this.pluginCredentials.setClient(entry.server, parsed.client, fileName);
    } catch (e) {
      this.safePost(webview, { kind: 'pluginProgress', id, ok: false, message: `Der Schlüsselbund hat den Client nicht angenommen: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    this.safePost(webview, {
      kind: 'pluginProgress', id, ok: true,
      message: `OAuth-Client${fileName ? ` aus ${fileName}` : ''} hinterlegt.`,
    });
    if (this.definedServers()[entry.server] && !this.pluginCredentials.oauth(entry.server)) {
      await this.loginPlugin(webview, id);
    }
  }

  private async logoutPlugin(webview: vscode.Webview, id: string): Promise<void> {
    const entry = this.catalog().find(e => e.id === id);
    if (!entry) return;
    await this.pluginCredentials.clear(entry.server, 'anmeldung');
    this.pluginConnections.forget(entry.server);
    this.resyncProfiles();
    this.safePost(webview, { kind: 'pluginProgress', id, ok: true, message: `Von ${entry.name} abgemeldet — der Token ist aus Cortex und allen Profilen entfernt.` });
  }

  /**
   * Konnektoren sind MCP-Server: einmal beschrieben, in jedes Anbieterprofil
   * gespiegelt. `sync` schreibt sie neu — sonst wird nur berichtet, was da ist.
   */
  private async pushConnectors(webview: vscode.Webview, sync = false): Promise<void> {
    const path = this.connectorPaths().find(p => existsSync(p));
    const effective = effectiveMcp();
    const defined: Record<string, McpServerDef> = effective.servers;
    const error: string | undefined = effective.errors.length ? effective.errors.join(' · ') : undefined;

    // Database Studio is part of the product, not of anyone's mcp.json — and it
    // has to be synced together with the rest, because a profile drops every
    // server missing from the set it is given.
    const all = error ? defined : withBuiltInConnectors(defined, currentStudioHost());

    // Der eingebaute Konnektor beschreibt sich selbst — mit dem Icon und der
    // Wortwahl, die auch im MCP-Handshake stehen, damit die Plugin-Seite und
    // der Agent denselben Konnektor meinen.
    const studio = currentStudioHost();
    const identity = connectorIdentity();

    const servers = Object.entries(all).map(([name, def]) => {
      const server = {
        name,
        remote: !!def.url,
        target: def.url ?? [def.command, ...(def.args ?? [])].filter(Boolean).join(' '),
        providers: def.providers,
        kind: def.kind,
      };
      if (name !== CONNECTOR_NAME || name in defined) return server;

      const connected = Boolean(studio?.running);
      return {
        ...server,
        builtIn: true,
        title: identity?.title,
        description: identity?.description,
        icon: identity?.icon,
        connected,
        detail: connected
          ? `${studio!.sessionCount === 1 ? 'Eine Quelle' : `${studio!.sessionCount} Quellen`} in Cortex geöffnet`
          : 'Verbindet sich mit der Vektor-App, bis hier eine Quelle offen ist',
      };
    });
    // Ohne Spiegelung wüsste niemand, ob eine Definition auch ankommt — der
    // Bericht je Konto ist der eigentliche Wert dieser Ansicht.
    const accounts = this.accounts.all().map(account => ({
      provider: account.provider,
      label: account.label,
      error: sync ? syncMcpToProfile(account, error ? all : profileServers(defined)) : undefined,
    }));
    this.safePost(webview, { kind: 'connectors', path, error, servers, accounts });
  }

  /** Every open surface learns which side panes are visible. */
  private pushPanes(): void {
    const message = { kind: 'panes' as const, browser: this.sidePanes.browser, terminal: this.sidePanes.terminal !== undefined && this.terminalDockVisible };
    for (const [w] of this.surfaces) this.safePost(w, message);
    void this.pushDockContexts();
  }

  private modesMessage(): HostToWebview {
    const config = vscode.workspace.getConfiguration('cortex');
    return {
      kind: 'modes',
      permissionMode: config.get<string>('permissionMode', 'safe'),
      routingMode: config.get<'auto' | 'manual'>('routingMode', 'auto'),
      askPermission: config.get<boolean>('askPermission', false),
      pollUsage: config.get<boolean>('pollUsage', true),
    };
  }

  private rulesMessage(): HostToWebview {
    const state = this.rules.getState();
    return {
      kind: 'rules',
      rules: state.rules,
      path: state.path,
      exists: state.exists,
      error: state.error,
      customCommands: this.rules.getCustomCommands(),
    };
  }

  private pushRules(): void {
    const msg = this.rulesMessage();
    for (const [webview, surface] of this.surfaces) {
      // Chat tabs consume rules too (tag suggestions in the composer).
      if (surface.mode === 'rules' || surface.mode === 'tab' || surface.mode === 'agent') {
        this.safePost(webview, msg);
      }
    }
  }

  private pushAnalytics(webview?: vscode.Webview): void {
    const msg: HostToWebview = {
      kind: 'analytics',
      metrics: this.metrics.all(),
      accounts: this.accountDtos(),
    };
    if (webview) {
      this.safePost(webview, msg);
    } else {
      for (const [w, surface] of this.surfaces) {
        if (surface.mode === 'analytics') this.safePost(w, msg);
      }
    }
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
    if (previous !== id) void this.swapBrowser(id, this.agentPanel.webview);
    this.replayAgent(this.agentPanel.webview, id);
    this.safePost(this.agentPanel.webview, this.pinnedMessage(id));
    void this.pushWorkspace(this.agentPanel.webview);
    this.sendConversations();
  }

  /** Chatwechsel: den fremden Browser schließen, den eigenen wieder öffnen. */
  private async swapBrowser(id: string, webview: vscode.Webview): Promise<void> {
    if (this.sidePanes.browser) {
      const known = await vscode.commands.getCommands(true);
      if (known.includes('workbench.action.browser.closeAll')) {
        await vscode.commands.executeCommand('workbench.action.browser.closeAll');
      }
      this.sidePanes.browser = false;
      this.pushPanes();
    }
    if (this.browserChats.has(id)) await this.dispatchMessage({ kind: 'openBrowser' }, webview);
  }

  private previewUrls(): Record<string, string> {
    return this.ctx.workspaceState.get<Record<string, string>>('cortex.previewUrls') ?? {};
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
    this.canvasSeen.delete(id);
    this.canvasSaved.delete(id);
    const canvas = this.canvasFile(id);
    if (canvas) void rm(canvas, { force: true });
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

  /** Wo das Exokortex-Repo und welches Python. Absolut, nie nach Namen. */
  private exokortexPfade(): ExokortexPfade {
    const config = vscode.workspace.getConfiguration('cortex');
    return {
      python: config.get<string>('exokortex.pythonPath') || '/usr/bin/python3',
      repo: config.get<string>('exokortex.repoPath') || join(homedir(), 'dev', 'Exokortex'),
      // Rückfall-Symbole für Dienste ohne Anwendung auf diesem Rechner. Die
      // installierten holt `icons.ts` selbst aus ihrem Programmbündel.
      symbole: join(this.ctx.extensionUri.fsPath, 'media', 'icons'),
    };
  }

  /**
   * Der Zustand des Exokortex, an alle Oberflächen, die ihn zeigen.
   *
   * Ohne Argument ein Rundruf — so kommt das Ergebnis eines Wächter-Durchgangs
   * bei jeder offenen Seite an, nicht nur bei der, die zuletzt gefragt hat.
   */
  private async pushExokortex(webview?: vscode.Webview): Promise<void> {
    const profile = this.accounts.all()
      .filter(a => a.homeDir)
      .map(a => ({ provider: a.provider, label: a.label, homeDir: a.homeDir }));
    const status = await leseStatus(
      this.exokortexPfade(),
      profile.length ? profile : profileAufDerPlatte(),
    );
    const nachricht: HostToWebview = { kind: 'exokortex', status };
    if (webview) {
      this.safePost(webview, nachricht);
      return;
    }
    for (const [ziel, surface] of this.surfaces) {
      if (surface.mode === 'agent') this.safePost(ziel, nachricht);
    }
  }

  /**
   * Eine Aktion der Exokortex-Seite. Jede läuft für sich und ist abbrechbar;
   * ein zweiter Klick auf denselben Knopf bricht ab statt doppelt zu starten.
   */
  private async exokortexAktion(action: ExokortexAction, webview: vscode.Webview): Promise<void> {
    const laufend = this.exokortexLaeuft.get(action);
    if (laufend) {
      laufend.abort();
      return;
    }
    const melde = (state: 'running' | 'done' | 'error', extra: { output?: string; message?: string } = {}) =>
      this.safePost(webview, { kind: 'exokortexAktion', action, state, ...extra });

    if (action === 'pruefen') {
      melde('running');
      await this.exokortexWatch.jetzt();
      melde('done');
      return;
    }
    if (action === 'konnektorenSync') {
      // Der Weg, der die Profile beschreibt, existiert schon — ihn hier zu
      // wiederholen hieße, zwei Stellen zu haben, die MCP-Profile schreiben.
      melde('running');
      await this.pushConnectors(webview, true);
      await this.pushExokortex();
      melde('done');
      return;
    }

    const abbruch = new AbortController();
    this.exokortexLaeuft.set(action, abbruch);
    melde('running');
    try {
      const { code, ausgabe } = await fuehreAus(action, this.exokortexPfade(), abbruch.signal,
        zeile => melde('running', { output: zeile }));
      melde(code === 0 ? 'done' : 'error',
        { message: code === 0 ? undefined : `Beendet mit ${code}`, output: ausgabe });
    } catch (e) {
      melde('error', { message: (e as Error).message });
    } finally {
      this.exokortexLaeuft.delete(action);
      await this.pushExokortex();
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
      void this.loadIdentities();
      return;
    }
    if (surface.mode === 'rules') {
      this.safePost(webview, this.rulesMessage());
      this.safePost(webview, this.modesMessage());
      // The rule editor picks targets from the accounts that actually exist.
      this.safePost(webview, {
        kind: 'accounts',
        accounts: this.accountDtos(),
      } satisfies HostToWebview);
      return;
    }
    if (surface.mode === 'analytics') {
      this.pushAnalytics(webview);
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
      this.safePost(webview, this.rulesMessage());
      this.safePost(webview, this.modesMessage());
      this.replayAgent(webview, surface.conversationId ?? '');
      this.safePost(webview, this.pinnedMessage(surface.conversationId));
      void this.usageRefresher?.();
      void this.loadIdentities();
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
    this.safePost(webview, this.rulesMessage());
    this.safePost(webview, this.modesMessage());
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
    switch (msg.kind) {
      case 'pageChanged':
        // Andere Webviews dürfen den Kontext der Hauptfläche nicht ändern.
        if (surface.mode !== 'agent' || webview !== this.agentPanel?.webview) break;
        if (!['chat', 'accounts', 'settings', 'plugins', 'exokortex', 'agents', 'automations'].includes(msg.page)) break;
        surface.page = msg.page;
        await this.pushTitlebarContext();
        break;
      case 'getTeams':
        this.pushAccounts(); this.pushProjects();
        await this.startAutomations();
        this.pushTeams(webview);
        break;
      case 'copyTeamWebhook': {
        try {
          await this.startAutomations();
          await this.automationRuntime!.tick();
          const { url, token } = this.automationRuntime!.webhookCredentials(msg.teamId);
          // Credentials go to the clipboard only after this explicit action,
          // never to every webview in the shared status broadcast.
          const command = `curl --request POST '${url}' --header 'Authorization: Bearer ${token}' --header 'Content-Type: application/json' --data '{}'`;
          await vscode.env.clipboard.writeText(command);
          this.safePost(webview, { kind: 'teamAutomationNotice', message: 'Webhook-Aufruf mit Zugriffsschlüssel kopiert.' });
        } catch (error) {
          this.safePost(webview, { kind: 'teamError', message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
      case 'saveTeam': case 'deleteTeam': case 'startTeam': case 'startSwarm': case 'stopTeam': case 'importAgentMarkdown': case 'exportAgentMarkdown': {
        try {
          const store = this.teams();
          store.refresh();
          if (msg.kind === 'saveTeam') {
            const team = validateTeam(msg.team);
            if (team.projectPath && !this.projects().some(project => project.path === team.projectPath)) throw new Error('Wähle ein vorhandenes Cortex-Projekt.');
            store.save(team, msg.revision, msg.baseSignature);
            this.safePost(webview, { kind: 'teamSaved', id: team.id });
          } else if (msg.kind === 'deleteTeam') store.remove(msg.id, msg.revision);
          else if (msg.kind === 'startTeam') await this.startTeam(msg.teamId, msg.task);
          else if (msg.kind === 'startSwarm') await this.startSwarm(msg, this.conversations.get(surface.conversationId ?? '')?.projectPath);
          else if (msg.kind === 'stopTeam') this.teamRunner!.stop(msg.runId);
          else if (msg.kind === 'importAgentMarkdown') {
            const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Markdown: ['md', 'markdown', 'txt'] }, openLabel: 'Anweisungen übernehmen' });
            if (picked?.[0]) {
              const info = await stat(picked[0].fsPath);
              if (info.size > 100_000) throw new Error('Die Markdown-Datei darf höchstens 100 KB enthalten.');
              this.safePost(webview, { kind: 'agentMarkdown', requestId: msg.requestId, text: await readFile(picked[0].fsPath, 'utf8') });
            }
          } else {
            if (typeof msg.text !== 'string' || msg.text.length > 100_000) throw new Error('Ungültige Markdown-Anweisungen.');
            const name = msg.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'Agent';
            const picked = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(join(homedir(), `${name}.md`)), filters: { Markdown: ['md'] }, saveLabel: 'Markdown speichern' });
            if (picked) await writeFile(picked.fsPath, msg.text, 'utf8');
          }
          if (msg.kind === 'saveTeam' || msg.kind === 'deleteTeam') {
            await this.startAutomations();
            await this.automationRuntime!.tick();
          }
          this.pushTeams();
        } catch (error) {
          this.pushTeams(webview);
          this.safePost(webview, { kind: 'teamError', message: error instanceof Error ? error.message : String(error) });
        }
        break;
      }
      case 'computerHistory':
        await this.historyBridge().handle(msg, webview);
        break;
      case 'recoverProvider': {
        const rec = this.conversations.get(surface.conversationId ?? '');
        const failure = [...(rec?.log ?? [])].reverse().find(event => event.kind === 'error' && event.messageId === msg.messageId && event.recovery === msg.action);
        if (failure?.kind !== 'error') break;
        if (msg.action === 'install-claude') {
          if (this.providerInstallation) break;
          this.providerInstallation = true;
          const progress = (message: string) => {
            this.toConversation(rec!.id, { kind: 'notice', text: message });
            this.output.appendLine(`[installation] ${message}`);
          };
          try {
            const installed = await installManagedClaude(progress);
            await vscode.workspace.getConfiguration('cortex').update('cliPath.claude', installed.path, vscode.ConfigurationTarget.Global);
            this.adapters.register(new ClaudeAdapter(installed.path));
            progress(`Claude Code ist bereit (${installed.version}). Du kannst die Nachricht erneut senden.`);
            this.pushAccounts();
          } catch (error) { progress(error instanceof Error ? error.message : String(error)); }
          finally { this.providerInstallation = false; }
        } else {
          this.safePost(webview, { kind: 'showPage', page: 'accounts' });
          const account = this.accounts.all().find(account => account.id === failure.recoveryAccountId && account.provider === 'grok');
          if (account) await this.dispatchMessage({ kind: 'reconnectAccount', id: account.id }, webview);
          else this.safePost(webview, { kind: 'connectionProgress', provider: 'grok', state: 'error', message: 'Das betroffene Grok-Konto ist nicht mehr vorhanden. Wähle das gewünschte Konto unter Verbindungen.' });
        }
        break;
      }
      case 'getWidgetState':
      case 'setWidgetState': {
        const rec = this.conversations.get(msg.conversationId);
        if (!rec || !/^[\w.:/-]{1,240}$/.test(msg.key)) break;
        if (msg.kind === 'setWidgetState') {
          const encoded = JSON.stringify(msg.value);
          if (encoded === undefined || encoded.length > 16_000) break;
          rec.widgetStates = { ...rec.widgetStates, [msg.key]: JSON.parse(encoded) };
          await this.persistNow();
        }
        this.safePost(webview, { kind: 'widgetState', conversationId: rec.id, key: msg.key, value: rec.widgetStates?.[msg.key] });
        break;
      }
      case 'searchConversations':
        this.safePost(webview, { kind: 'conversationSearch', requestId: msg.requestId, hits: searchConversations([...this.conversations.values()], msg.query.slice(0, 2000), msg.excludedProjects) });
        break;
      case 'relinkProject':
        if (this.projects().some(p => p.path === msg.path)) await this.relinkProject(msg.path);
        break;
      case 'ready':
        this.hydrate(webview, surface);
        break;
      case 'newConversation':
        this.newConversation(msg.projectPath);
        break;
      case 'openConversation':
        if (surface.mode === 'agent') this.bindAgent(msg.id);
        else this.openConversationTab(msg.id);
        break;
      case 'deleteConversation':
        this.deleteConversation(msg.id);
        break;
      case 'chatCommand':
        if (surface.conversationId) await this.chatCommand(surface.conversationId, msg.action);
        break;
      case 'restoreConversation':
        await this.restoreConversation(msg.id);
        break;
      case 'openAccounts':
        this.openAccountsTab();
        break;
      case 'workbenchAction': {
        const commands = { split: 'workbench.action.splitEditor', close: 'workbench.action.closeActiveEditor', commands: 'workbench.action.showCommands' };
        const command = commands[msg.action];
        if (command) await vscode.commands.executeCommand(command);
        break;
      }
      case 'getNativeSettings':
        this.pushNativeSettings(webview);
        break;
      case 'setNativeSetting': {
        const write = async () => {
          let error: string | undefined;
          try {
            if (!validNativeSetting(msg.key, msg.value)) throw new Error('Ungültiger Einstellungswert.');
            await vscode.workspace.getConfiguration().update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
          } catch (failure) { error = String(failure); }
          const ack = msg.requestId ? { key: msg.key, requestId: msg.requestId, error } : undefined;
          for (const [w] of this.surfaces) this.pushNativeSettings(w, error, ack);
        };
        this.settingsWrites = this.settingsWrites.then(write, write);
        await this.settingsWrites;
        break;
      }
      case 'openNativeSettings':
        if (msg.query === '@extensions') await vscode.commands.executeCommand('workbench.view.extensions');
        else if (msg.query === '@keybindings') await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings');
        else if (msg.query === '@json') await vscode.commands.executeCommand('workbench.action.openSettingsJson');
        else await vscode.commands.executeCommand('workbench.action.openSettings', msg.query ?? '');
        break;
      case 'getAppSettings':
        this.safePost(webview, { kind: 'appSettings', values: this.appSettings(), revision: ++this.settingsRevision });
        break;
      case 'setAppSetting':
        await this.storeAppSetting(msg.key, msg.value, msg.requestId);
        break;
      case 'pickAppSettingFolder': {
        const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Auswählen' });
        if (picked?.[0]) await this.storeAppSetting(msg.key, picked[0].fsPath);
        break;
      }
      case 'openLicenses': {
        const license = vscode.Uri.joinPath(this.ctx.extensionUri, 'LICENSE');
        if (existsSync(license.fsPath)) await vscode.commands.executeCommand('vscode.open', license);
        else void vscode.window.showInformationMessage('Cortex steht unter der MIT-Lizenz. Die Hinweise zu gebündelten Abhängigkeiten liegen im Paket.');
        break;
      }
      case 'detectImports': {
        // Nur nachsehen, nichts lesen: ob der Ordner eines anderen Werkzeugs da ist.
        const candidates = [
          { id: 'claude-code', name: 'Claude Code', path: join(homedir(), '.claude') },
          { id: 'codex', name: 'Codex', path: join(homedir(), '.codex') },
          { id: 'cursor', name: 'Cursor', path: join(homedir(), '.cursor') },
          { id: 'grok', name: 'Grok', path: join(homedir(), '.grok') },
        ];
        this.safePost(webview, { kind: 'imports', found: candidates.filter(c => existsSync(c.path)) });
        break;
      }
      case 'getAnalytics':
        this.safePost(webview, { kind: 'analytics', metrics: this.metrics.all(), accounts: this.accountDtos() });
        break;
      case 'openKeybindings':
        await vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', msg.query ?? '');
        break;
      case 'openSettings':
        if (this.agentPanel) {
          this.safePost(this.agentPanel.webview, { kind: 'showPage', page: 'settings' });
          this.safeReveal(this.agentPanel);
        }
        break;
      case 'setSetting': {
        await vscode.workspace
          .getConfiguration('cortex')
          .update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        for (const [w] of this.surfaces) this.safePost(w, this.modesMessage());
        break;
      }
      case 'openRules':
        this.openRulesTab();
        break;
      case 'respondToConnection':
        respondToConnection(msg.provider as Target['provider'], msg.attemptId, msg.accept);
        break;
      case 'addAccount':
      case 'reconnectAccount': {
        const existing = msg.kind === 'reconnectAccount' ? this.accounts.all().find(a => a.id === msg.id) : undefined;
        if (msg.kind === 'reconnectAccount' && !existing) break;
        const provider = existing?.provider ?? (msg.kind === 'addAccount' ? msg.provider : undefined);
        await addAccountWizard(this.accounts, this.adapters, {
          provider: provider as Target['provider'],
          label: msg.kind === 'addAccount' ? msg.label : existing?.label,
          accountId: existing?.id,
          email: msg.kind === 'addAccount' ? msg.email : undefined,
          onProgress: (state, message, detail) => this.safePost(webview, { kind: 'connectionProgress', provider: provider ?? '', state, message, ...detail }),
        });
        this.pushAccounts();
        break;
      }
      case 'assignProject': {
        const rec = this.conversations.get(surface.conversationId ?? '');
        if (!rec) break;
        if (this.tasks.has(rec.id)) { void vscode.window.showInformationMessage('Bitte warte, bis die laufende Aufgabe beendet ist.'); break; }
        const choices = this.projects().map(p => ({ label: p.name, description: p.path, path: p.path }));
        const picked = await vscode.window.showQuickPick([...choices, { label: 'Ordner auswählen …', description: '', path: '' }], { placeHolder: 'Diesem Chat ein Projekt zuweisen' });
        if (!picked || this.tasks.has(rec.id)) break;
        let path = picked.path;
        if (!path) {
          const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Projekt zuweisen' });
          if (!folders?.[0] || this.tasks.has(rec.id)) break;
          path = (await validProject(folders[0].fsPath)).path;
        }
        rec.projectPath = path;
        for (const [w] of this.surfaces) this.safePost(w, { kind: 'projects', projects: this.projects() });
        this.sendConversations();
        await this.persistNow();
        await this.pushWorkspace(webview);
        break;
      }
      /**
       * Die Wahl aus der Liste über der Eingabe. Anders als `assignProject`
       * fragt hier nichts mehr nach — der Nutzer hat den Eintrag schon
       * angeklickt. Ohne Pfad läuft die Aufgabe ohne Projekt weiter.
       */
      case 'setConversationProject': {
        const rec = this.conversations.get(surface.conversationId ?? '');
        if (!rec) break;
        if (this.tasks.has(rec.id)) { void vscode.window.showInformationMessage('Bitte warte, bis die laufende Aufgabe beendet ist.'); break; }
        // Ein Pfad, den die Liste nicht kennt, kam nicht aus der Liste.
        if (msg.path && !this.projects().some(p => p.path === msg.path)) break;
        rec.projectPath = msg.path;
        for (const [w] of this.surfaces) this.safePost(w, { kind: 'projects', projects: this.projects() });
        this.sendConversations();
        await this.persistNow();
        await this.pushWorkspace(webview);
        break;
      }
      /**
       * „Projekt erstellen“ aus dem Dialog. Die Ordner kommen aus dem
       * Dateidialog des Systems, deshalb werden sie hier nur noch geprüft —
       * der erste ist der Kennordner, an dem die Aufgaben hängen.
       */
      case 'createProject': {
        const folders: string[] = [];
        for (const folder of msg.folders) {
          try {
            const valid = await validProject(folder);
            if (!folders.includes(valid.path)) folders.push(valid.path);
          } catch {
            // Ein Ordner, den es nicht mehr gibt, wird nicht zum Projekt.
          }
        }
        const anchor = folders[0];
        if (!anchor) break;
        const name = msg.name.trim() || basename(anchor);
        await this.writeProjects(saved => [...saved.filter(p => p.path !== anchor), { name, path: anchor, folders }]);
        this.newConversation(anchor);
        break;
      }
      case 'addProject': {
        const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Projekt hinzufügen' });
        if (!picked?.[0]) break;
        const project = await validProject(picked[0].fsPath);
        await this.writeProjects(saved => [...saved.filter(p => p.path !== project.path), project]);
        this.newConversation(project.path);
        break;
      }
      case 'saveProject': {
        const name = msg.name.trim();
        if (!name) break;
        // Der Kennpfad bleibt Kennpfad: an ihm hängen die bestehenden Chats.
        const folders = [msg.path, ...msg.folders.filter(f => f !== msg.path)];
        await this.writeProjects(saved => {
          const rest = saved.filter(p => p.path !== msg.path);
          const before = saved.find(p => p.path === msg.path);
          return [...rest, { ...before, name, path: msg.path, folders }];
        });
        break;
      }
      case 'removeProject': {
        const owned = [...this.conversations.values()].filter(c => c.projectPath === msg.path);
        if (owned.some(c => this.tasks.has(c.id) || this.queues.isWorking(c.id))) {
          void vscode.window.showInformationMessage('Bitte zuerst die laufenden Aufgaben dieses Projekts beenden.'); break;
        }
        let action = 'Archivieren';
        if (owned.length) {
          const choice = await vscode.window.showWarningMessage(
            `„${basename(msg.path)}“ hat ${owned.length === 1 ? 'noch eine Aufgabe' : `noch ${owned.length} Aufgaben`}.`,
            { modal: true, detail: 'Aufgaben archivieren oder Chatverläufe, Zeichnungen und Cortex-Exporte löschen? Projektdateien bleiben erhalten.' },
            'Archivieren', 'Verläufe löschen');
          if (!choice || owned.some(c => this.tasks.has(c.id) || this.queues.isWorking(c.id))) break;
          action = choice;
        }
        if (action === 'Verläufe löschen') {
          for (const rec of owned) this.exokortex.entferne(rec.id);
          // Bind an active view to a fresh projectless chat before removing its records.
          if (owned.some(c => c.id === this.visibleConversationId())) this.newConversation();
          for (const rec of owned) this.deleteConversation(rec.id);
        } else for (const rec of owned) { rec.archived = true; this.queues.pause(rec.id); }
        await this.ctx.globalState.update('cortex.removedProjects', [...new Set([...this.ctx.globalState.get<string[]>('cortex.removedProjects', []), msg.path])]);
        await this.writeProjects(saved => saved.filter(p => p.path !== msg.path));
        this.sendConversations(); await this.persistNow();
        break;
      }
      case 'pinProject': {
        const known = this.projects().find(p => p.path === msg.path);
        if (!known) break;
        await this.writeProjects(saved => {
          const rest = saved.filter(p => p.path !== msg.path);
          const { missing, ...rest0 } = { ...known, ...saved.find(p => p.path === msg.path) };
          return [...rest, { ...rest0, pinned: msg.pinned }];
        });
        break;
      }
      case 'pickProjectFolder': {
        const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Ordner hinzufügen' });
        if (!picked?.[0]) break;
        this.safePost(webview, { kind: 'pickedFolder', path: picked[0].fsPath });
        break;
      }
      case 'revealProject':
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(msg.path));
        break;
      case 'getDiff': {
        const root = this.projectRoot(surface.conversationId);
        const id = surface.conversationId ?? '';
        try {
          this.safePost(webview, { kind: 'diff', conversationId: id, files: await collectDiff(root) });
        } catch (error) {
          this.safePost(webview, { kind: 'diff', conversationId: id, files: [], error: (error as Error).message });
        }
        break;
      }
      case 'canvasAnswer':
        this.canvasRequests.get(msg.reqId)?.(msg);
        break;
      case 'canvasLoad':
      case 'canvasSave':
      case 'canvasVisible':
      case 'canvasExport':
        await this.canvasMessage(webview, msg);
        break;
      case 'readFileBody': {
        // Der Inhalt einer gelesenen Datei, damit die Prüfansicht sie zeigen
        // kann, ohne dass der Nutzer den Editor öffnen muss. Gedeckelt: eine
        // 40-MB-Datei gehört nicht durch die Nachrichtenbrücke.
        const root = this.projectRoot(surface.conversationId);
        if (!root) { this.safePost(webview, { kind: 'fileBody', path: msg.path, error: 'Kein Projektordner.' }); break; }
        try {
          const file = await projectFile(root, msg.path);
          this.safePost(webview, { kind: 'fileBody', path: msg.path, ...await readFilePreview(file, msg.maxLines) });
        } catch (error) {
          this.safePost(webview, { kind: 'fileBody', path: msg.path, error: (error as Error).message });
        }
        break;
      }
      case 'previewFile': {
        // Eine HTML-Datei zeigt das Dock als Seite. Sie geht nicht als Text
        // durch die Nachrichtenbrücke, sondern über den eigenen Server —
        // warum, steht in htmlPreview.ts.
        const root = this.projectRoot(surface.conversationId);
        if (!root) { this.safePost(webview, { kind: 'filePreview', path: msg.path, error: 'Kein Projektordner.' }); break; }
        try {
          this.safePost(webview, { kind: 'filePreview', path: msg.path, url: await this.htmlPreview.url(root, msg.path) });
        } catch (error) {
          this.safePost(webview, { kind: 'filePreview', path: msg.path, error: (error as Error).message });
        }
        break;
      }
      case 'fileAction': {
        // Der geteilte Knopf „Öffnen“ im Dock. Jeder Zweig verlässt Cortex —
        // deshalb steht der Pfad hier noch einmal durch `projectFile`, statt
        // dem zu vertrauen, was die Webview geschickt hat.
        const root = this.projectRoot(surface.conversationId);
        if (!root) break;
        let file: string;
        try { file = await projectFile(root, msg.path); } catch { break; }
        if (msg.action === 'default') {
          await vscode.env.openExternal(vscode.Uri.file(file));
        } else if (msg.action === 'reveal') {
          await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(file));
        } else if (msg.action === 'terminal') {
          this.openTerminalDock(dirname(file));
        } else if (msg.action === 'xcode') {
          // Das Projekt über der Datei, nicht die lose Datei: nur so baut Xcode sie auch.
          execFile('open', ['-a', 'Xcode', xcodeTarget(file, root)], (error) => {
            if (error) void vscode.window.showErrorMessage('Xcode ließ sich nicht öffnen. Liegt es unter Programme?');
          });
        } else {
          const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(join(homedir(), 'Downloads', basename(file))),
            saveLabel: 'Sichern',
          });
          if (target) await vscode.workspace.fs.copy(vscode.Uri.file(file), target, { overwrite: true });
        }
        break;
      }
      case 'openDiffFile': {
        const root = this.projectRoot(surface.conversationId);
        if (!root) break;
        const file = await projectFile(root, msg.path);
        await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: true });
        break;
      }
      case 'inspectWorkspace':
        await this.pushWorkspace(webview, msg.directory);
        break;
      case 'openWorkspaceFile': {
        const root = this.projectRoot(surface.conversationId);
        const record = surface.conversationId ? this.conversations.get(surface.conversationId) : undefined;
        const path = expandHome(msg.path);
        const attached = record?.log.some(event => event.kind === 'userEcho' && event.attachments?.includes(msg.path));
        // Was der Agent in diesem Chat selbst gelesen oder geschrieben hat, geht
        // auch außerhalb des Projekts auf — etwa ein Bildschirmfoto unter /tmp.
        const touched = isAbsolute(path) && record?.log.some(event => event.kind === 'toolUse' && event.path === msg.path);
        const file = attached || touched ? path : root ? await projectFile(root, path) : undefined;
        if (file) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.Beside, preview: true });
        break;
      }
      case 'openEditor': {
        await vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
        await vscode.commands.executeCommand('workbench.action.quickOpen');
        break;
      }
      case 'openTerminal':
        this.openTerminalDock(await this.conversationCwd(surface.conversationId));
        break;
      case 'openConnectors':
        if (this.agentPanel) this.safePost(this.agentPanel.webview, { kind: 'showPage', page: 'settings' });
        await this.pushConnectors(webview);
        break;
      case 'getTemplates':
        this.safePost(webview, { kind: 'templates', items: this.readTemplates(webview) });
        break;
      case 'templateAction': {
        const own = join(homedir(), '.cortex', 'templates');
        const found = this.templateEntries(webview).find(entry => msg.id ? entry.item.id === msg.id : entry.item.name === msg.name);
        if (!found) break;
        try {
          if (msg.action === 'duplicate') {
            duplicateTemplate(found, own);
          } else if (!found.item.own) {
            void vscode.window.showInformationMessage('Mitgelieferte Vorlagen lassen sich nicht ändern — dupliziere sie zuerst.');
          } else if (msg.action === 'delete') {
            await vscode.workspace.fs.delete(vscode.Uri.file(found.source), { useTrash: true, recursive: !!found.package });
          } else {
            const name = await vscode.window.showInputBox({ prompt: 'Neuer Name der Vorlage', value: found.item.name });
            if (name?.trim()) renameTemplate(found, name.trim());
          }
        } catch (error) {
          void vscode.window.showErrorMessage(`Vorlage konnte nicht geändert werden: ${error instanceof Error ? error.message : String(error)}`);
        }
        this.safePost(webview, { kind: 'templates', items: this.readTemplates(webview) });
        break;
      }
      case 'editTemplates': {
        const dir = join(homedir(), '.cortex', 'templates');
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(dir));
        break;
      }
      case 'getPlugins':
        await this.pushPlugins(webview);
        break;
      case 'installPlugin':
        await this.changePlugin(webview, msg.id, msg.scope, true, msg.values);
        break;
      case 'uninstallPlugin':
        await this.changePlugin(webview, msg.id, msg.scope, false);
        break;
      case 'setPluginValues':
        await this.setPluginValues(webview, msg.id, msg.values);
        break;
      case 'checkServer':
        void this.checkServer(msg.server, true);
        break;
      case 'setPluginEnabled':
        await this.pluginSwitches.set(msg.server, msg.enabled);
        if (msg.enabled) void this.checkServer(msg.server, false);
        break;
      case 'showPluginLog': {
        const result = this.pluginConnections.get(msg.server);
        const channel = this.pluginLogChannel ??= vscode.window.createOutputChannel('Cortex Plugins');
        channel.appendLine(`── ${msg.server} · ${result?.checkedAt ? new Date(result.checkedAt).toLocaleString('de-DE') : 'nie geprüft'} ──`);
        channel.appendLine(result?.message ? `Ergebnis: ${result.message}` : `Ergebnis: ${result?.status ?? 'kein'}`);
        if (result?.detail) channel.appendLine(result.detail);
        channel.appendLine(result?.log ? result.log : '(Der Server hat nichts auf stderr geschrieben.)');
        for (const cli of result?.clis ?? []) channel.appendLine(`${cli.provider}:${cli.label} → ${cli.state}${cli.detail ? ` — ${cli.detail}` : ''}`);
        channel.appendLine('');
        channel.show(true);
        break;
      }
      case 'checkPlugin': {
        const entry = this.catalog().find(e => e.id === msg.id);
        if (entry) void this.checkPlugin(entry, true);
        break;
      }
      case 'loginPlugin':
        await this.loginPlugin(webview, msg.id, msg.account);
        break;
      case 'cancelPluginLogin': {
        const entry = this.catalog().find(e => e.id === msg.id);
        if (entry) this.pluginLogins.get(entry.server)?.abort.abort();
        break;
      }
      case 'logoutPlugin':
        await this.logoutPlugin(webview, msg.id);
        break;
      case 'setPluginClient':
        await this.storePluginClient(webview, msg.id, clientFromFields(msg.clientId, msg.clientSecret));
        break;
      case 'pickPluginClientFile': {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'OAuth-Client (JSON)': ['json'] },
          defaultUri: vscode.Uri.file(join(homedir(), 'Desktop')),
          openLabel: 'Client-Datei verwenden',
        });
        if (picked?.[0]) await this.readPluginClientFile(webview, msg.id, picked[0].fsPath);
        break;
      }
      case 'pluginClientFile':
        await this.readPluginClientFile(webview, msg.id, msg.path);
        break;
      case 'clearPluginClient': {
        const entry = this.catalog().find(e => e.id === msg.id);
        if (!entry) break;
        await this.pluginCredentials.clear(entry.server, 'client');
        this.pluginConnections.forget(entry.server);
        this.resyncProfiles();
        this.safePost(webview, { kind: 'pluginProgress', id: msg.id, ok: true, message: `OAuth-Client für ${entry.name} entfernt — samt Anmeldung.` });
        break;
      }
      case 'copyPluginRedirect': {
        const redirect = ownClientRedirect(this.catalog().find(e => e.id === msg.id)?.requires?.client?.redirectHost);
        await vscode.env.clipboard.writeText(redirect);
        this.safePost(webview, { kind: 'pluginProgress', id: msg.id, ok: true, message: `Rückrufadresse kopiert: ${redirect}` });
        break;
      }
      case 'copyPluginDefinition': {
        const entry = this.catalog().find(e => e.id === msg.id);
        if (!entry) break;
        // Der teilbare Teil eines Plugins ist seine Definition, nicht ein Link
        // auf einen Marktplatz, den es nicht gibt.
        await vscode.env.clipboard.writeText(
          JSON.stringify({ servers: { [entry.server]: entry.definition } }, null, 2),
        );
        this.safePost(webview, {
          kind: 'pluginProgress', id: entry.id, ok: true,
          message: `Serverdefinition f\u00fcr ${entry.name} kopiert.`,
        });
        break;
      }
      case 'showDatabaseStudio':
        await vscode.commands.executeCommand('cortex.databaseStudio.status');
        break;
      case 'openExternal':
        // Nur http(s): eine Katalogangabe darf kein beliebiges Schema öffnen.
        if (/^https?:\/\//.test(msg.url)) await vscode.env.openExternal(vscode.Uri.parse(msg.url));
        break;
      case 'openUrlIn': {
        if (!/^https?:\/\//.test(msg.url)) break;
        if (msg.app === 'cortex') { await this.dispatchMessage({ kind: 'openBrowser', url: msg.url }, webview); break; }
        if (msg.app === 'default') { await vscode.env.openExternal(vscode.Uri.parse(msg.url)); break; }
        // Ein ausdrücklich gewählter Browser, auf Klick des Nutzers.
        const app = msg.app === 'chrome' ? 'Google Chrome' : 'Safari';
        spawn('open', ['-a', app, msg.url], { stdio: 'ignore', detached: true }).on('error', () => {
          void vscode.window.showWarningMessage(`${app} ließ sich nicht öffnen.`);
        }).unref();
        break;
      }
      case 'revertTurn':
        await this.revertTurn(surface.conversationId, msg.messageId, msg.paths);
        break;
      case 'getConnectors':
        await this.pushConnectors(webview);
        break;
      case 'getExokortex':
        await this.pushExokortex(webview);
        break;
      case 'exokortexPageOpen':
        this.exokortexWatch.setOffen(msg.open);
        break;
      case 'exokortexAction':
        await this.exokortexAktion(msg.action, webview);
        break;
      case 'exokortexGalaxie': {
        // Der Ausschnitt kommt fertig gekappt aus Python — welche Nachbarn
        // wichtig sind, weiss der Graph, nicht die Oberflaeche.
        const { python, repo } = this.exokortexPfade();
        const args = [join(repo, 'bruecke', 'galaxie.py')];
        args.push(...(msg.id ? ['nachbarn', msg.id] : ['start']));
        const zeilen: string[] = [];
        for await (const ereignis of spawnLines(python, args, {
          cwd: repo, env: process.env, signal: new AbortController().signal,
        })) {
          if (ereignis.kind === 'line' && ereignis.stream === 'stdout') zeilen.push(ereignis.line);
        }
        try {
          const d = JSON.parse(zeilen.join('\n')) as {
            knoten: GalaxieKnoten[];
            kanten: Array<{ von: string; nach: string; typ: string }>;
            hinweis: string;
          };
          this.safePost(webview, { kind: 'exokortexGalaxieDaten', um: msg.id, ...d });
        } catch {
          this.safePost(webview, {
            kind: 'exokortexGalaxieDaten', um: msg.id, knoten: [], kanten: [],
            hinweis: 'Der Ausschnitt liess sich nicht lesen.',
          });
        }
        break;
      }
      case 'exokortexSuche': {
        // Genau der Weg, den ein Modell nimmt. Eine eigene Suchfassung hier
        // wäre eine, die irgendwann etwas anderes findet als die KI.
        const { python, repo } = this.exokortexPfade();
        const zeilen: string[] = [];
        for await (const ereignis of spawnLines(
          python, [join(repo, 'bruecke', 'lesen.py'), '--suche', msg.frage],
          { cwd: repo, env: process.env, signal: new AbortController().signal })) {
          if (ereignis.kind === 'line' && ereignis.stream === 'stdout') zeilen.push(ereignis.line);
          if (ereignis.kind === 'spawn-error') zeilen.push(ereignis.message);
        }
        this.safePost(webview, { kind: 'exokortexTreffer', frage: msg.frage, text: zeilen.join('\n') });
        break;
      }
      case 'hideMemory':
        if (surface.conversationId) this.erinnerung.ausblenden(surface.conversationId, msg.id);
        break;
      case 'exokortexOpenPath': {
        const ziel = vscode.Uri.file(msg.path);
        const verzeichnis = (await vscode.workspace.fs.stat(ziel)).type === vscode.FileType.Directory;
        if (verzeichnis) await vscode.env.openExternal(ziel);
        else await vscode.window.showTextDocument(ziel, { preview: true });
        break;
      }
      case 'exokortexOeffneQuelle': {
        // App, Ordner oder URL — derselbe Klick wie auf ein Dock-Symbol.
        // `open` darf scheitern, ohne die Seite zu stören: eine nicht
        // installierte App (Telegram) ist geplant, kein Fehlerdialog.
        if (msg.url && /^https?:\/\//.test(msg.url)) {
          await vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
        }
        if (msg.pfad) {
          await vscode.env.openExternal(vscode.Uri.file(expandHome(msg.pfad)));
          break;
        }
        const args = msg.bundle ? ['-b', msg.bundle] : msg.app ? ['-a', msg.app] : null;
        if (args) spawn('open', args, { stdio: 'ignore', detached: true }).unref();
        break;
      }
      case 'syncConnectors':
        await this.pushConnectors(webview, true);
        break;
      case 'editConnectors': {
        const path = this.connectorPaths().find(p => existsSync(p)) ?? this.connectorPaths()[0]!;
        const uri = vscode.Uri.file(path);
        // Ohne Datei gibt es nichts zu bearbeiten — die Vorlage erklärt das Format.
        if (!existsSync(path)) await vscode.workspace.fs.writeFile(uri, Buffer.from(MCP_TEMPLATE, 'utf8'));
        await vscode.window.showTextDocument(uri);
        break;
      }
      case 'dockState':
        this.dockOpen = msg.open;
        await this.pushDockContexts();
        break;
      case 'closeTerminal':
        // Schließen räumt die Fläche frei; laufende Server bleiben erhalten.
        this.terminalDockVisible = false;
        await this.hidePanel();
        this.pushPanes();
        break;
      case 'closeBrowser': {
        const known = await vscode.commands.getCommands(true);
        if (known.includes('workbench.action.browser.closeAll')) {
          await vscode.commands.executeCommand('workbench.action.browser.closeAll');
        }
        this.sidePanes.browser = false;
        if (surface?.conversationId) this.browserChats.delete(surface.conversationId);
        this.pushPanes();
        break;
      }
      case 'openBrowser': {
        // Die zuletzt geöffnete Seite merkt sich jeder Chat selbst — nie die
        // eines anderen Chats oder Projekts.
        const chat = surface?.conversationId;
        const url = new URL(msg.url || (chat ? this.previewUrls()[chat] : undefined) || 'about:blank');
        if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.href !== 'about:blank') break;
        if (chat && url.href !== 'about:blank') {
          await this.ctx.workspaceState.update('cortex.previewUrls', { ...this.previewUrls(), [chat]: url.href });
        }
        if (chat) this.browserChats.add(chat);
        const commands = await vscode.commands.getCommands(true);
        if (commands.includes('workbench.action.browser.open')) {
          // Current Code-OSS has a real integrated browser. Simple Browser redirects
          // to it but drops viewColumn; use its side-by-side API explicitly.
          // A preview stays a single pane: close an open browser first instead of
          // stacking a second one next to the chat.
          if (commands.includes('workbench.action.browser.closeAll')) await vscode.commands.executeCommand('workbench.action.browser.closeAll');
          await vscode.commands.executeCommand('workbench.action.browser.open', { url: url.href === 'about:blank' ? undefined : url.href, openToSide: true });
          this.sidePanes.browser = true;
          this.pushPanes();
        } else {
          await vscode.commands.executeCommand('simpleBrowser.api.open', vscode.Uri.parse(url.toString()), { viewColumn: vscode.ViewColumn.Beside });
        }
        break;
      }
      case 'removeAccount':
        void vscode.commands.executeCommand('cortex.removeAccount', msg.id);
        break;
      case 'renameAccount':
        await this.renameAccount(msg.id);
        break;
      case 'editRules':
        void vscode.commands.executeCommand('cortex.editRules');
        break;
      case 'saveRule':
        void this.rules.saveRule(msg.rule, msg.ruleIndex);
        break;
      case 'deleteRule':
        void this.rules.deleteRule(msg.ruleId);
        break;
      case 'reorderRules':
        void this.rules.reorderRules(msg.order);
        break;
      case 'saveDefaultChain':
        void this.rules.saveDefaultChain(msg.chain);
        break;
      case 'openAnalytics':
        this.openAnalyticsTab();
        break;
      case 'rateAnswer':
        // The verdict lives in the metric the router learns from, and in the
        // conversation log so reopening it still shows what you pressed.
        await this.metrics.markRatedPoor(msg.messageId, msg.poor);
        if (surface.conversationId) {
          this.toConversation(surface.conversationId, { kind: 'rated', messageId: msg.messageId, poor: msg.poor });
        }
        return;
      case 'permissionDecision':
        // The surface knows which conversation it belongs to; the webview
        // never has to track it.
        if (surface.conversationId) {
          this.answerPermission(surface.conversationId, msg.id, msg.decision);
        }
        return;
      case 'setAskPermission':
        await vscode.workspace
          .getConfiguration('cortex')
          .update('askPermission', msg.ask, vscode.ConfigurationTarget.Global);
        // Every open surface reflects the switch, not just the one clicked.
        for (const [w] of this.surfaces) this.safePost(w, this.modesMessage());
        return;
      case 'clearAnalytics':
        void this.metrics.clear();
        break;
      case 'refreshUsage':
        void this.usageRefresher?.(true);
        break;
      case 'cancel':
        if (surface.conversationId) {
          this.compactingChats.get(surface.conversationId)?.abort();
          this.queues.pause(surface.conversationId);
          this.tasks.get(surface.conversationId)?.abort();
          this.markStopped(surface.conversationId, 'stopped by you');
          this.toConversation(surface.conversationId, { kind: 'busy', running: false }, { log: false });
          this.sendConversations();
        }
        break;
      case 'queueAction': {
        const id = surface.conversationId; if (!id) break;
        if (msg.action === 'remove') this.queues.remove(id, msg.id);
        else if (msg.action === 'up' || msg.action === 'down') this.queues.move(id, msg.id, msg.action === 'up' ? -1 : 1);
        else if (msg.action === 'steer') await this.steerQueuedMessage(id, msg.id);
        await this.persistNow();
        break;
      }
      case 'editQueuedMessage':
        if (surface.conversationId) { this.queues.edit(surface.conversationId, msg.id, msg.text, tagsOf(msg.text)); await this.persistNow(); }
        break;
      case 'resumeQueue':
        if (surface.conversationId) this.queues.resume(surface.conversationId);
        break;
      case 'clearQueue':
        if (surface.conversationId) { this.queues.clearPending(surface.conversationId); await this.persistNow(); }
        break;
      case 'openCode': {
        const aliases: Record<string, string> = { ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact', py: 'python', sh: 'shellscript', bash: 'shellscript', yml: 'yaml', md: 'markdown' };
        const requested = msg.language ? aliases[msg.language] ?? msg.language : 'plaintext';
        const language = (await vscode.languages.getLanguages()).includes(requested) ? requested : 'plaintext';
        const doc = await vscode.workspace.openTextDocument({ content: msg.text, language });
        await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true });
        break;
      }
      case 'retryLast':
        if (surface.conversationId) void this.retryLast(surface.conversationId);
        break;
      case 'rewindTo':
      case 'forkFrom': {
        if (!surface.conversationId) break;
        const done = await this.rewindConversation(surface.conversationId, msg.index, msg.kind === 'forkFrom' ? 'fork' : 'rewind');
        if (done) this.seedComposer(done.id, done.echo);
        break;
      }
      case 'editMessage': {
        if (!surface.conversationId || !msg.send.text.trim()) break;
        const done = await this.rewindConversation(surface.conversationId, msg.index, 'edit');
        // Die Anhänge der ursprünglichen Nachricht gehen mit, solange die Bearbeitung keine eigenen nennt.
        if (done) await this.dispatchMessage({ ...msg.send, attachments: msg.send.attachments?.length ? msg.send.attachments : done.echo.attachments }, webview);
        break;
      }
      case 'send':
        if (surface.conversationId) {
          await this.handleSend(surface.conversationId, msg.text, msg.tags, {
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
              : this.shownTarget(surface.conversationId),
          });
        }
        break;
      case 'setImageAccountOrder': {
        if (!isImageProvider(msg.provider) || !Array.isArray(msg.accounts)) break;
        const known = new Set(this.accounts.all().filter(a => a.provider === msg.provider).map(a => a.label));
        const config = vscode.workspace.getConfiguration('cortex');
        const current = config.get<Record<string, string[]>>('imageAccountOrder', {});
        await config.update('imageAccountOrder', { ...current, [msg.provider]: msg.accounts.filter(l => typeof l === 'string' && known.has(l)) }, vscode.ConfigurationTarget.Global);
        this.pushAccounts();
        break;
      }
      case 'resizeImage': {
        const id = surface.conversationId;
        if (!id || !isGeneratedImage(msg.path, this.imageRoots()) || !existsSync(msg.path)) break;
        const rec = this.conversations.get(id);
        const original = rec?.log.find((event): event is Extract<HostToWebview, { kind: 'image' }> => event.kind === 'image' && event.path === msg.path);
        if (!original) break;
        try {
          const resized = await resizeGeneratedImage(msg.path, msg.width, msg.height);
          const path = await archiveGeneratedImage(resized, this.imageArchiveRoot(), id);
          const src = await this.imageSrc(path);
          if (!src || !this.conversations.has(id)) break;
          const messageId = shortId();
          const target = rec?.log.find(event => event.kind === 'routing' && event.messageId === original.messageId);
          const text = `Bildgröße auf ${msg.width} × ${msg.height} Pixel ändern.`;
          this.toConversation(id, { kind: 'userEcho', text, attachments: [msg.path], at: Date.now() });
          if (target?.kind === 'routing') this.toConversation(id, { ...target, messageId });
          this.toConversation(id, { kind: 'image', messageId, path, src, prompt: original.prompt, edited: true });
          this.toConversation(id, { kind: 'delta', messageId, text: `${msg.width} × ${msg.height} Pixel.` });
          this.toConversation(id, { kind: 'done', messageId, at: Date.now(), durationMs: 0, turn: false });
          await this.persistNow();
        } catch (error) {
          this.toConversation(id, { kind: 'notice', text: `Bildgröße konnte nicht geändert werden: ${error instanceof Error ? error.message : String(error)}` });
        }
        break;
      }
      case 'imageAction': {
        // Der Pfad kommt aus der Webview: nur Bilder aus den Ordnern der
        // Bildwerkzeuge verlassen sie in Richtung Finder oder Projekt.
        if (!isGeneratedImage(msg.path, this.imageRoots()) || !existsSync(msg.path)) break;
        const source = vscode.Uri.file(msg.path);
        if (msg.action === 'copy') {
          try { await copyGeneratedImage(msg.path); }
          catch (error) { void vscode.window.showErrorMessage(`Bild konnte nicht kopiert werden: ${error instanceof Error ? error.message : String(error)}`); }
        } else if (msg.action === 'reveal') {
          await vscode.commands.executeCommand('revealFileInOS', source);
        } else if (msg.action === 'open') {
          await vscode.env.openExternal(source);
        } else if (msg.action === 'saveAll') {
          const roots = this.imageRoots();
          const paths = [...new Set([msg.path, ...(msg.paths ?? [])])].filter(p => isGeneratedImage(p, roots) && existsSync(p));
          const root = this.projectRoot(surface.conversationId);
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
            defaultUri: vscode.Uri.file(root ?? join(homedir(), 'Downloads')),
            openLabel: `${paths.length} Bilder hier speichern`,
          });
          const folder = picked?.[0];
          if (!folder) break;
          const base = suggestedImageName(msg.prompt, msg.path).replace(/\.[a-z]+$/i, '');
          let n = 0;
          for (const path of paths) {
            n++;
            let name = `${base}-${n}${extname(path).toLowerCase()}`;
            for (let k = 2; existsSync(join(folder.fsPath, name)); k++) name = `${base}-${n}-${k}${extname(path).toLowerCase()}`;
            await vscode.workspace.fs.copy(vscode.Uri.file(path), vscode.Uri.joinPath(folder, name), { overwrite: false });
          }
          void vscode.window.showInformationMessage(`${paths.length} Bilder gespeichert in ${root && !relative(root, folder.fsPath).startsWith('..') ? relative(root, folder.fsPath) || basename(root) : folder.fsPath}`);
        } else {
          const root = this.projectRoot(surface.conversationId);
          const name = suggestedImageName(msg.prompt, msg.path);
          const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(join(root ?? join(homedir(), 'Downloads'), name)),
            filters: { Bilder: [extname(msg.path).slice(1) || 'png'] },
            saveLabel: 'Speichern',
          });
          if (!target) break;
          await vscode.workspace.fs.copy(source, target, { overwrite: true });
          const shown = root && !relative(root, target.fsPath).startsWith('..') ? relative(root, target.fsPath) : target.fsPath;
          void vscode.window.showInformationMessage(`Bild gespeichert: ${shown}`);
        }
        break;
      }
      case 'saveAttachmentData': {
        // Ein Bild ohne Datei: aus der Zwischenablage oder aus macOS'
        // Screenshot-Vorschau gezogen. Es wird zur Datei in Cortex' Ablage.
        const path = typeof msg.dataUrl === 'string' ? await saveImageData(msg.dataUrl, String(msg.name ?? 'Bild.png'), this.attachmentDir()).catch(() => undefined) : undefined;
        this.output.appendLine(`[anhang] ${msg.name ?? 'Bild'} ohne Pfad → ${path ?? 'nicht gespeichert'}`);
        if (path) this.safePost(webview, { kind: 'attachments', paths: [path] });
        else void vscode.window.showWarningMessage('Das Bild konnte nicht übernommen werden (leer oder größer als 40 MB).');
        break;
      }
      case 'attachmentFailed': {
        this.output.appendLine(`[anhang] Ablegen ohne Ergebnis: ${msg.reason}`);
        void vscode.window.showWarningMessage(msg.reason === 'promise'
          ? 'Dieses Bildschirmfoto ist noch keine Datei. Warte, bis es auf dem Schreibtisch liegt, oder kopiere es (⌘C) und füge es mit ⌘V ein.'
          : 'Die abgelegte Datei konnte nicht übernommen werden.');
        break;
      }
      case 'pickAttachments': {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          openLabel: 'Attach',
          defaultUri: this.projectRoot(surface.conversationId) ? vscode.Uri.file(this.projectRoot(surface.conversationId)!) : undefined,
        });
        this.safePost(webview, {
          kind: 'attachments',
          paths: (picked ?? []).map((uri) => uri.fsPath),
        });
        break;
      }
      case 'attachmentPreview': {
        // Nur für die Vorschau im Eingabefeld. Sehr große Dateien bleiben
        // Textzeile, statt als Data-URI durch postMessage zu gehen.
        const size = await stat(msg.path).then(s => s.size, () => Infinity);
        const src = size <= 25 * 1024 * 1024 ? await this.imageSrc(msg.path) : undefined;
        this.safePost(webview, { kind: 'attachmentPreview', path: msg.path, src });
        break;
      }
      case 'setModes': {
        const config = vscode.workspace.getConfiguration('cortex');
        if (msg.permissionMode) {
          await config.update('permissionMode', msg.permissionMode, vscode.ConfigurationTarget.Global);
        }
        if (msg.routingMode) {
          await config.update('routingMode', msg.routingMode, vscode.ConfigurationTarget.Global);
        }
        // Stufe und Nachfragen kommen aus einem Menüpunkt, also in einer
        // Nachricht. Als zwei Nachrichten meldete die erste den Stand zurück,
        // bevor die zweite gespeichert war — das Menü sprang auf den alten
        // Modus, und man musste zweimal wählen.
        if (msg.ask !== undefined) {
          await config.update('askPermission', msg.ask, vscode.ConfigurationTarget.Global);
          for (const [w] of this.surfaces) this.safePost(w, this.modesMessage());
        }
        break;
      }
      case 'setPinnedTarget': {
        const next = msg.target
          ? {
              provider: msg.target.provider as Target['provider'],
              account: msg.target.account,
              model: msg.target.model,
            }
          : undefined;
        await this.setPinnedTarget(next, surface.conversationId);
        break;
      }
    }
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

  /**
   * „Rückgängig machen“ an der Änderungskarte: die Dateien dieses Auftrags auf
   * den Stand davor. Nur was der Auftrag selbst geschrieben hat, und erst nach
   * Rückfrage — ein Klick darf keine Arbeit wegwerfen, die man nicht sieht.
   * Neu angelegte Dateien gehen in den Papierkorb, nicht ins Nichts.
   */
  private async revertTurn(conversationId: string | undefined, messageId: string, paths: string[]): Promise<void> {
    const rec = conversationId ? this.conversations.get(conversationId) : undefined;
    if (!rec || !conversationId) return;
    const notice = (text: string) => this.toConversation(conversationId, { kind: 'notice', text });
    if (this.tasks.has(conversationId)) { notice('Rückgängig geht erst, wenn der Auftrag fertig ist.'); return; }
    const baseline = rec.baselines?.[messageId];
    if (!baseline) { notice('Für diesen Auftrag gibt es keinen gemerkten Stand — rückgängig machen geht nur in Git-Projekten und für die letzten Aufträge.'); return; }
    const root = await this.conversationCwd(conversationId);
    let plan: Awaited<ReturnType<typeof planRevert>>;
    try { plan = await planRevert(root, baseline, paths); }
    catch (error) { notice(`Der gespeicherte Stand ist nicht lesbar. Keine Datei wurde geändert: ${String(error)}`); return; }
    const count = plan.restore.length + plan.remove.length;
    if (!count) { notice('Keine der Dateien lässt sich zurücksetzen.'); return; }
    const detail = [
      plan.restore.length ? `${plan.restore.length} ${plan.restore.length === 1 ? 'Datei bekommt' : 'Dateien bekommen'} ihren alten Inhalt zurück.` : '',
      plan.remove.length ? `${plan.remove.length} neu angelegte ${plan.remove.length === 1 ? 'Datei geht' : 'Dateien gehen'} in den Papierkorb.` : '',
      plan.skipped.length ? `Unverändert bleiben: ${plan.skipped.join(', ')}` : '',
      plan.conflicts.length ? `Seit dem Auftrag verändert oder für ältere Aufträge nicht prüfbar: ${plan.conflicts.join(', ')}. Diese späteren Änderungen würden überschrieben.` : '',
    ].filter(Boolean).join('\n');
    const confirm = plan.conflicts.length ? 'Spätere Änderungen überschreiben' : 'Rückgängig machen';
    const choice = await vscode.window.showWarningMessage('Änderungen dieses Auftrags rückgängig machen?', { modal: true, detail }, confirm);
    if (choice !== confirm) return;
    if (this.tasks.has(conversationId)) { notice('Inzwischen läuft wieder ein Auftrag. Keine Datei wurde geändert.'); return; }
    // Recheck after the dialog, before changing anything. A newer edit needs a new decision.
    for (const rel of [...plan.restore.map(file => file.path), ...plan.remove]) {
      try {
        if (await revertFingerprint(root, rel) !== plan.expected[rel]) throw new Error('Inhalt geändert');
      } catch { notice(`„${rel}“ wurde während der Rückfrage verändert. Keine Datei wurde geändert.`); return; }
    }
    let changed = 0;
    try {
    for (const file of plan.restore) {
      const target = await safeRevertPath(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      await restoreRevertFile(root, file.path, file.content, plan.expected[file.path]!);
      changed++;
    }
    for (const rel of plan.remove) {
      if (await revertFingerprint(root, rel) !== plan.expected[rel]) throw new Error(`„${rel}“ wurde inzwischen geändert`);
      await vscode.workspace.fs.delete(vscode.Uri.file(await safeRevertPath(root, rel)), { useTrash: true });
      changed++;
    }
    } catch (error) { notice(`${changed} von ${count} Dateien zurückgesetzt. Angehalten: ${String(error)}`); return; }
    this.toConversation(conversationId, { kind: 'reverted', messageId });
    notice(`${count} ${count === 1 ? 'Datei' : 'Dateien'} auf den Stand vor dem Auftrag zurückgesetzt.`);
    this.persistSoon();
    for (const [webview, surface] of this.surfaces) {
      if (surface.conversationId === conversationId) void this.dispatchMessage({ kind: 'getDiff' }, webview);
    }
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
    const abweichung = ([
      ['effort', 'eine andere Reasoning-Stärke'],
      ['permissionMode', 'andere Berechtigungen'],
      ['askPermission', 'ein anderes Nachfragen bei Berechtigungen'],
    ] as const).find(([key]) => item.modes[key] !== undefined && item.modes[key] !== live.modes[key]);
    if (abweichung) return `Diese Nachricht hat ${abweichung[1]} als der laufende Auftrag. ${warten}`;
    const target = parseMention(item.text).mention ?? item.modes.target;
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
    if (!this.holdProject(key, true)) return false;
    try { await this.executeQueuedMessage(id, queued); }
    finally { this.releaseProject(key, true); this.queues.retryBlockedProjects(); }
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

    const taskRoot = rec.projectPath ?? rec.teamWorkspace ?? join(this.ctx.globalStorageUri.fsPath, 'projectless', conversationId);
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

    const headroom: Record<string, number> = {};
    for (const account of this.accounts.all()) {
      headroom[`${account.provider}:${account.label}`] = accountHeadroom(account.id, this.quota);
    }
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
    const review = await this.askOffThread(
      reviewer.target,
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

    const headroom: Record<string, number> = {};
    for (const account of this.accounts.all()) {
      headroom[`${account.provider}:${account.label}`] = accountHeadroom(account.id, this.quota);
    }
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

  /** Excalidraw-Flächen, die gerade im Dock offen sind: Chat → ihr Inhalt als Text. */
  private readonly canvasSeen = new Map<string, string>();

  /**
   * Die Zeichenfläche im Brief: nur solange sie offen ist, oder wenn der
   * Auftrag mit `/excalidraw` beginnt — dann geht sie gerade erst auf.
   */
  canvasAbschnitte(conversationId: string, prompt: string): import('@cortex/core').BriefSection[] {
    const seen = this.canvasSeen.get(conversationId);
    if (seen !== undefined) return canvasSections(seen, true);
    // Zu, aber mit Zeichnung: die Fläche gehört weiter zum Chat. Sonst baute
    // das Modell nach dem Schließen des Reiters (oder nach einem Neustart)
    // die nächste Ergänzung als HTML-Datei statt auf der Fläche.
    // Die Elementliste einer geschlossenen Fläche aber nur, wenn es um sie
    // geht — die Nachricht davon spricht oder die letzte Antwort gezeichnet hat.
    const saved = this.savedCanvasDescription(conversationId);
    if (saved !== undefined) {
      const lastAnswer = this.sessions.getHistory(conversationId).filter(t => t.role === 'assistant').at(-1)?.text ?? '';
      const onTopic = touchesCanvas(prompt) || lastAnswer.includes('```' + CANVAS_LANG);
      return canvasSections(saved, false, { noteOnly: !onTopic });
    }
    return asksForCanvas(prompt) ? canvasSections(undefined) : [];
  }

  /** Beschreibung der gespeicherten Zeichnung eines Chats, oder nichts, wenn er keine hat. */
  private readonly canvasSaved = new Map<string, string | null>();
  private savedCanvasDescription(conversationId: string): string | undefined {
    if (!this.canvasSaved.has(conversationId)) {
      const file = this.canvasFile(conversationId);
      let description: string | null = null;
      try {
        const stored = JSON.parse(readFileSync(file!, 'utf8')) as { description?: string; scene?: string };
        if (typeof stored.description === 'string') description = stored.description;
        // Ältere Ablagen ohne Beschreibung: dass es eine Zeichnung gibt, zählt.
        else if (typeof stored.scene === 'string' && /"elements":\s*\[\s*\{/.test(stored.scene)) description = '(drawing saved before Cortex kept a description — ask the user to open the canvas if you need its details)';
      } catch { /* keine Zeichnung */ }
      this.canvasSaved.set(conversationId, description);
    }
    return this.canvasSaved.get(conversationId) ?? undefined;
  }

  /** Eine Datei je Chat im Speicher der Erweiterung; die Kennung wird nie ungeprüft ein Pfad. */
  private canvasFile(conversationId: string): string | undefined {
    if (!/^[\w-]{1,80}$/.test(conversationId)) return undefined;
    return join(this.ctx.globalStorageUri.fsPath, 'canvas', `${conversationId}.json`);
  }

  /* ── Die Fläche für das Modell sichtbar ─────────────────────────────── */

  private readonly canvasRequests = new Map<string, (answer: Extract<WebviewToHost, { kind: 'canvasAnswer' }>) => void>();
  /** Beschreibung der Fläche, deren Bild zuletzt mit einer Nachricht ging — unverändert geht es nicht noch einmal mit. */
  private readonly canvasSentView = new Map<string, string>();

  /** Hat dieser Chat eine Zeichenfläche (offen oder gespeichert)? */
  canvasBelongs(conversationId: string): boolean {
    return this.canvasSeen.has(conversationId) || this.savedCanvasDescription(conversationId) !== undefined;
  }

  /**
   * Bild der Fläche, optional nachdem ein Block gezeichnet wurde — für die
   * Werkzeuge canvas_view / canvas_draw und für das Bild, das mit der
   * nächsten Nachricht geht. Die Webview zeichnet (offen im Dock oder im
   * Hintergrund); was im Hintergrund gezeichnet wurde, legt der Host ab.
   */
  async askCanvas(conversationId: string, code: string | undefined, timeoutMs = 60_000): Promise<{ png?: string; text: string; error?: string }> {
    const webview = this.agentPanel?.webview;
    if (!webview) return { text: '', error: 'Das Cortex-Fenster ist nicht offen — die Zeichenfläche kann gerade nicht gezeichnet werden.' };
    const file = this.canvasFile(conversationId);
    let scene: string | undefined;
    try { scene = file ? (JSON.parse(readFileSync(file, 'utf8')) as { scene?: string }).scene : undefined; } catch { /* noch keine */ }
    const reqId = shortId();
    const answer = await new Promise<Extract<WebviewToHost, { kind: 'canvasAnswer' }> | undefined>(resolve => {
      const timer = setTimeout(() => { this.canvasRequests.delete(reqId); resolve(undefined); }, timeoutMs);
      this.canvasRequests.set(reqId, a => { clearTimeout(timer); this.canvasRequests.delete(reqId); resolve(a); });
      this.safePost(webview, { kind: 'canvasRequest', reqId, conversationId, code, scene });
    });
    if (!answer) return { text: '', error: 'Die Zeichenfläche hat nicht rechtzeitig geantwortet.' };
    if (answer.error) return { text: answer.description, error: answer.error };
    if (answer.headless && code && answer.json && file && this.conversations.has(conversationId)) {
      await mkdir(dirname(file), { recursive: true });
      let applied: string[] = [];
      try { applied = (JSON.parse(readFileSync(file, 'utf8')) as { applied?: string[] }).applied ?? []; } catch { /* neu */ }
      await writeFile(file, JSON.stringify({ scene: answer.json, applied, description: answer.description }), 'utf8');
      this.canvasSaved.set(conversationId, answer.description.trim() ? answer.description : null);
    }
    if (this.canvasSeen.has(conversationId)) this.canvasSeen.set(conversationId, answer.description.slice(0, 20000));
    this.output.appendLine(`[zeichenflaeche] ${code ? 'gezeichnet' : 'angesehen'}${answer.headless ? ' (im Hintergrund)' : ''}, Bild ${answer.png ? `${Math.round(answer.png.length / 1024)} KB` : 'leer'}`);
    return { png: answer.png || undefined, text: answer.description };
  }

  /**
   * Das Bild der Fläche für die nächste Nachricht — nur, wenn der Chat eine
   * hat und sie sich seit dem letzten mitgeschickten Bild verändert hat.
   */
  private async canvasViewForTurn(conversationId: string): Promise<string | undefined> {
    if (!this.canvasBelongs(conversationId)) return undefined;
    const view = await this.askCanvas(conversationId, undefined, 6000).catch(() => undefined);
    if (!view?.png || this.canvasSentView.get(conversationId) === view.text) return undefined;
    const path = await saveImageData(view.png, 'Zeichenflaeche.png', this.attachmentDir()).catch(() => undefined);
    if (path) this.canvasSentView.set(conversationId, view.text);
    return path;
  }

  private async canvasMessage(webview: vscode.Webview, msg: Exclude<Extract<WebviewToHost, { kind: `canvas${string}` }>, { kind: 'canvasAnswer' }>): Promise<void> {
    const file = this.canvasFile(msg.conversationId);
    if (!file) return;
    switch (msg.kind) {
      case 'canvasLoad': {
        let stored: { scene?: string; applied?: string[] } = {};
        try { stored = JSON.parse(await readFile(file, 'utf8')) as typeof stored; } catch { /* noch keine Zeichnung */ }
        this.safePost(webview, { kind: 'canvasScene', conversationId: msg.conversationId, scene: typeof stored.scene === 'string' ? stored.scene : undefined, applied: Array.isArray(stored.applied) ? stored.applied.filter(k => typeof k === 'string') : [] });
        return;
      }
      case 'canvasVisible':
        if (msg.description === null) this.canvasSeen.delete(msg.conversationId);
        else this.canvasSeen.set(msg.conversationId, String(msg.description).slice(0, 20000));
        return;
      case 'canvasSave':
        // Erst der Text, dann die Platte: die nächste Nachricht soll den neuen
        // Stand sehen, auch wenn das Schreiben noch läuft.
        if (this.canvasSeen.has(msg.conversationId)) this.canvasSeen.set(msg.conversationId, String(msg.description ?? '').slice(0, 20000));
        if (!this.conversations.has(msg.conversationId) || typeof msg.scene !== 'string' || msg.scene.length > 30_000_000) return;
        await mkdir(dirname(file), { recursive: true });
        {
          const description = String(msg.description ?? '').slice(0, 20000);
          this.canvasSaved.set(msg.conversationId, description.trim() ? description : null);
          await writeFile(file, JSON.stringify({ scene: msg.scene, applied: (msg.applied ?? []).slice(-200), description }), 'utf8');
        }
        return;
      case 'canvasExport': {
        const title = (this.conversations.get(msg.conversationId)?.title || 'Zeichnung').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Zeichnung';
        const folder = this.projectRoot(msg.conversationId) ?? homedir();
        const target = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(join(folder, `${title}.${msg.format}`)),
          filters: msg.format === 'svg' ? { SVG: ['svg'] } : { Excalidraw: ['excalidraw'] },
          saveLabel: 'Sichern',
        });
        if (!target) return;
        await writeFile(target.fsPath, msg.content, 'utf8');
        void vscode.window.showInformationMessage(`Zeichnung gesichert: ${basename(target.fsPath)}`);
        return;
      }
    }
  }

  /** Die Zeile für den Systemprompt: wann das Modell selbst im Exokortex suchen soll. */
  erinnerungsHinweis(): string {
    const e = erinnerungsEinstellungen(this.appSettings());
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

  private async renameAccount(id: string): Promise<void> {
    const account = this.accounts.all().find((a) => a.id === id);
    if (!account) return;
    const label = await vscode.window.showInputBox({
      title: `cortex: rename ${account.provider}:${account.label}`,
      value: account.label,
      prompt: 'Label used in rules and @mentions',
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return 'Label is required';
        if (!/^[a-zA-Z0-9][\w-]*$/.test(trimmed)) {
          return 'Use letters, numbers, - or _ only';
        }
        if (
          this.accounts
            .all()
            .some((a) => a.id !== id && a.provider === account.provider && a.label === trimmed)
        ) {
          return `A ${account.provider} account labeled "${trimmed}" already exists`;
        }
        return undefined;
      },
    });
    if (!label || label.trim() === account.label) return;
    const oldLabel = account.label;
    await this.accounts.upsert({ ...account, label: label.trim() });
    void vscode.window.showInformationMessage(
      `cortex: renamed to ${account.provider}:${label.trim()}. If your rules reference "${oldLabel}", update them.`,
    );
  }

  private async loadIdentities(): Promise<void> {
    const cliPath = vscode.workspace
      .getConfiguration('cortex')
      .get<string>('cliPath.claude', 'claude');
    let changed = false;
    for (const account of this.accounts.all()) {
      if (this.identities.has(account.id)) continue;
      const identity = await getAccountIdentity(account, cliPath);
      if (identity) {
        this.identities.set(account.id, identity);
        changed = true;
      }
    }
    if (changed) this.pushAccounts();
  }

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
    // Die Vorgabe Opus 5 hängt an den Konten: kommen sie später an oder
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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource} data:; connect-src ${webview.cspSource}; worker-src ${webview.cspSource} blob:; script-src 'nonce-${nonce}'; frame-src http://127.0.0.1:*;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${cortexStyleUri}" rel="stylesheet">
  <link href="${composerStyleUri}" rel="stylesheet">
  <link href="${commandsStyleUri}" rel="stylesheet">
  <link href="${teamsStyleUri}" rel="stylesheet">
  <link href="${settingsStyleUri}" rel="stylesheet">
  <link href="${menusStyleUri}" rel="stylesheet">
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
