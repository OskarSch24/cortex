import * as vscode from 'vscode';
import { asksForCanvas } from '@cortex/core';
import { CanvasBridge } from './canvas/canvasBridge.js';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join as joinPath } from 'node:path';
import {
  AdapterRegistry,
  buildProviderBrief,
  WIDGET_BRIEF,
  locationBrief,
  browserBrief,
  briefLinesFor,
  disqualifiedLines,
  ClaudeAdapter,
  CodexAdapter,
  CopilotAdapter,
  GrokAdapter,
  OpenRouterAdapter,
  Orchestrator,
  QuotaTracker,
  SessionStore,
  CLAUDE_USAGE_MIN_INTERVAL_MS,
  parseMcpFile,
  syncMcpToProfile,
} from '@cortex/core';
import { refreshUsage } from './usage.js';
import { AccountStore } from './storage/accountStore.js';
import { MetricsStore } from './storage/metricsStore.js';
import { PreferenceStore } from './storage/preferenceStore.js';
import { WorkspaceContext } from './context/workspaceContext.js';
import { projectFolderSections } from './context/projectFolders.js';
import { Verifier } from './verify/verifier.js';
import { PermissionBridge } from './permission/bridge.js';
import { globalStateQuotaPersistence } from './storage/quotaPersistence.js';
import { RulesManager } from './rules/rulesFile.js';
import { ChatViewProvider } from './panel/chatViewProvider.js';
import { RouterStatusBar } from './views/statusBar.js';
import { registerCommands } from './commands.js';
import { startAuthWatch, type AuthHealth } from './authWatch.js';
import {
  CONNECTOR_NAME,
  loadConnectorIdentity,
  registerDatabaseStudio,
} from './database/index.js';
import { PluginCredentials, setPluginCredentials } from './plugins/credentials.js';
import { PluginConnections } from './plugins/connections.js';
import { profileServers } from './plugins/profileServers.js';
import { readBrowserAccess } from './plugins/browserPolicy.js';
import { archiveOrphanProfiles } from './storage/profileArchive.js';
import { STUDIO_WANTED_KEY } from './database/connector.js';
import { effectiveMcp } from './plugins/scopes.js';
import { PluginSwitches, setPluginSwitches } from './plugins/switches.js';
import { setYoutubeKanalProxy } from './plugins/youtubeKanal.js';

export function activate(ctx: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cortex');
  ctx.subscriptions.push(output);

  hideSecondarySidebarOnOldVSCode();

  // VS Code launched from the Dock inherits a minimal PATH; make sure the
  // usual CLI homes are reachable so `claude`/`codex`/... resolve.
  const extraDirs = [
    joinPath(homedir(), '.cortex', 'runtime', 'bin'),
    joinPath(homedir(), '.local', 'bin'),
    joinPath(homedir(), '.grok', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of extraDirs) {
    if (existsSync(dir) && !pathEntries.includes(dir)) pathEntries.push(dir);
  }
  process.env.PATH = pathEntries.join(delimiter);

  const config = vscode.workspace.getConfiguration('cortex');
  const cliPath = (provider: string, fallback: string) => {
    const configured = config.get<string>(`cliPath.${provider}`);
    if (configured && configured !== fallback) return configured;
    const managed = joinPath(homedir(), '.cortex', 'runtime', 'claude', 'node_modules', '.bin', 'claude');
    return provider === 'claude' && existsSync(managed) ? managed : fallback;
  };

  const adapters = new AdapterRegistry();
  adapters.register(new ClaudeAdapter(cliPath('claude', 'claude')));
  adapters.register(new CodexAdapter(cliPath('codex', 'codex')));
  adapters.register(new CopilotAdapter(cliPath('copilot', 'copilot')));
  adapters.register(new GrokAdapter(cliPath('grok', 'grok')));
  // No CLI and no subscription: an HTTP call to free open-weight models, used
  // only to review what the others wrote.
  adapters.register(new OpenRouterAdapter());

  const accounts = new AccountStore(ctx);
  // Zugangsdaten der Plugins. Geladen wird sofort; gespiegelt wird erst danach —
  // eine Spiegelung vorher schriebe die Server ohne Schlüssel und Token in die
  // Profile und nähme verbundenen Plugins still den Zugang.
  const pluginCredentials = new PluginCredentials(ctx.secrets);
  setPluginCredentials(pluginCredentials);
  const credentialsReady = pluginCredentials.load().catch((e) => {
    output.appendLine(`[cortex] Plugin-Zugangsdaten nicht lesbar — ${(e as Error).message}`);
  });
  ctx.subscriptions.push({ dispose: () => pluginCredentials.dispose() });
  const pluginConnections = new PluginConnections(ctx.globalState);
  const pluginSwitches = new PluginSwitches(ctx.globalState);
  setPluginSwitches(pluginSwitches);
  setYoutubeKanalProxy(joinPath(ctx.extensionPath, 'dist', 'youtubeKanalServer.js'));
  const quota = new QuotaTracker(globalStateQuotaPersistence(ctx));
  const sessions = new SessionStore();
  const rules = new RulesManager(ctx.workspaceState);
  const metrics = new MetricsStore(ctx);
  const preferences = new PreferenceStore(ctx);
  const workspaceContext = new WorkspaceContext(output);
  const verifier = new Verifier(output);
  // Claude asks through a local MCP server it spawns itself; the bridge is the
  // host end of that conversation.
  const bridge = new PermissionBridge(
    joinPath(ctx.extensionPath, 'dist', 'permissionServer.js'),
    (request, conversationId) => chatRef!.askViaBridge(request, conversationId),
    output,
  );
  ctx.subscriptions.push(bridge);
  // Die Zeichenfläche als Werkzeug für das Modell (canvas_view / canvas_draw).
  const canvasBridge = new CanvasBridge(
    joinPath(ctx.extensionPath, 'dist', 'canvasServer.js'),
    (conversationId, code) => chatRef!.askCanvas(conversationId, code),
  );
  ctx.subscriptions.push(canvasBridge);
  ctx.subscriptions.push(rules);

  /** Standing instructions, minus any line the evidence says to stop sending. */
  const providerBrief = (provider: Parameters<typeof buildProviderBrief>[0]['provider'], mode: 'safe' | 'edits' | 'full') => {
    const all = briefLinesFor({ provider, permissionMode: mode });
    const disabled = disqualifiedLines(all.map((l) => l.id), metrics.all());
    const options = {
      provider,
      permissionMode: mode,
      preferences: preferences.preferences(),
      disabledLineIds: disabled,
    };
    return { text: buildProviderBrief(options), lineIds: briefLinesFor(options).map((l) => l.id) };
  };

  // Declared before the orchestrator so routing can read thread memory.
  let chatRef: ChatViewProvider | undefined;

  const orchestrator = new Orchestrator({
    adapters,
    quota,
    sessions,
    getMetrics: () => metrics.all(),
    getConversationContext: (id) => chatRef?.conversationContext(id),
    getAutoPlan: () =>
      vscode.workspace.getConfiguration('cortex').get<boolean>('autoPlanHeavyEdits', true),
    getSizeReasoning: () =>
      vscode.workspace.getConfiguration('cortex').get<boolean>('sizeReasoning', true),
    getRules: () => rules.getRules(),
    getCustomCommands: () => rules.getCustomCommands(),
    getRoutingMode: () =>
      vscode.workspace.getConfiguration('cortex').get<'auto' | 'manual'>('routingMode', 'auto'),
    getAccounts: () => accounts.all(),
    resolveAccount: (target) => accounts.resolve(target),
    getBrief: (task, provider) => {
      const config = vscode.workspace.getConfiguration('cortex');
      // Das Gedächtnis des Chats geht unabhängig vom Arbeitsbereich-Kontext mit:
      // wer den Editor-Kontext abschaltet, will nicht, dass Cortex vergisst.
      // Die Zeichenfläche ist Oberfläche, kein Arbeitsbereich-Kontext: sie
      // geht auch mit, wenn der Editor-Kontext abgeschaltet ist.
      const erinnerung = [
        ...(chatRef?.erinnerungsAbschnitte(task.conversationId) ?? []),
        ...(chatRef?.canvasAbschnitte(task.conversationId, task.prompt) ?? []),
      ];
      if (!config.get<boolean>('sendWorkspaceContext', true)) return erinnerung;
      return [...erinnerung, ...projectFolderSections(task), ...workspaceContext.forRoot(task.cwd).buildFor(task, provider, {
        preferences: preferences.preferences(),
        // The same commands verification would run, so the model is told the
        // check it is about to be judged by — and told it even when we are not
        // running it ourselves, which is when it matters most.
        checks: verifier.forRoot(task.cwd).available(),
        shapeTasks: config.get<boolean>('frameTasks', true),
        ...chatRef?.threadFiles(task.conversationId),
      })];
    },
    getAskPermission: () =>
      vscode.workspace.getConfiguration('cortex').get<boolean>('askPermission', false),
    getHostArgs: async (provider, task) => {
      if (provider !== 'claude') return undefined;
      const asking = task.askPermission ?? vscode.workspace.getConfiguration('cortex').get<boolean>('askPermission', false);
      if (asking) await bridge.start();
      const args = bridge.claudeArgs(task.conversationId, task.cwd);
      if (asking && !args) throw new Error('Die Genehmigungsabfrage konnte nicht gestartet werden. Bitte erneut versuchen.');
      // Hat der Chat eine Zeichenfläche (oder wird sie gerade verlangt), bekommt
      // Claude die Werkzeuge, mit denen es sie sehen und prüfen kann.
      if (!chatRef?.canvasBelongs(task.conversationId) && !asksForCanvas(task.prompt)) return args;
      await canvasBridge.start().catch(() => undefined);
      const canvasConfig = canvasBridge.claudeConfig(task.conversationId);
      if (!canvasConfig) return args;
      // Freigegeben, auch im Plan-Modus: die Werkzeuge ändern nur die Fläche, nie Projektdateien.
      const allow = ['--allowedTools', 'mcp__cortex_canvas__canvas_view', 'mcp__cortex_canvas__canvas_draw'];
      if (!args) return { args: ['--mcp-config', canvasConfig, ...allow], env: {} };
      // Mehrere Konfigurationen gehen hinter ein einziges --mcp-config.
      const at = args.args.indexOf('--mcp-config');
      const merged = at >= 0 ? [...args.args.slice(0, at + 2), canvasConfig, ...args.args.slice(at + 2)] : [...args.args, '--mcp-config', canvasConfig];
      return { args: [...merged, ...allow], env: args.env };
    },
    getProviderBrief: (provider, mode) => {
      const config = vscode.workspace.getConfiguration('cortex');
      const standing = config.get<boolean>('standingInstructions', true) ? providerBrief(provider, mode) : { text: '', lineIds: [] };
      // Die Widget-Anweisung ist eine Fähigkeit der Oberfläche, keine
      // Verhaltenskorrektur: sie hängt am eigenen Schalter und bleibt aus der
      // Lernschleife heraus, damit sie nicht als „Zeile“ abgewählt wird.
      // Der Ort ist Kontext, keine Verhaltensregel: er geht immer mit, auch
      // ohne ständige Anweisungen — sonst rät das Modell ihn über die IP.
      const location = locationBrief(config.get<string>('homeLocation', ''));
      const browser = browserBrief(readBrowserAccess(config.get('browserAccess')));
      const widgets = config.get<boolean>('chatWidgets', true) ? WIDGET_BRIEF : '';
      const erinnerung = chatRef?.erinnerungsHinweis() ?? '';
      return { text: [standing.text, location, browser, widgets, erinnerung].filter(Boolean).join('\n\n'), lineIds: standing.lineIds };
    },
  });

  const statusBar = new RouterStatusBar();
  ctx.subscriptions.push(statusBar);

  const chat = new ChatViewProvider(
    ctx,
    orchestrator,
    sessions,
    accounts,
    quota,
    adapters,
    rules,
    metrics,
    preferences,
    workspaceContext,
    verifier,
    output,
    pluginCredentials,
    pluginConnections,
    pluginSwitches,
  );
  chatRef = chat;
  chat.setTargetListener((target) => statusBar.routed(target));
  chat.setPinnedListener((target) => statusBar.setPinned(target));
  const authHealth = new Map<string, AuthHealth>();
  chat.setAuthHealth(authHealth);
  void credentialsReady.then(() => chat.startAutomations()).catch(error => output.appendLine(`[automations] ${String(error)}`));
  startAuthWatch(ctx, accounts, cliPath, authHealth, () => chat.pushAccounts(), output);
  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(ChatViewProvider.secondaryViewType, chat, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  registerCommands(ctx, { accounts, adapters, quota, rules, chat, statusBar });

  // Database Studio is Cortex's database integration: a source opens as a tab,
  // and the agent's connector points at that same open source.
  //
  // Nothing is written into a profile on its own. The connector appears on the
  // plugins page, and mirroring it is a decision made there. Once it has been
  // mirrored, though, it is kept current: the host's address changes with every
  // Cortex start, and a profile left holding the old one would send the agent
  // to a port that is no longer listening.
  const syncConnectorsNow = (withStudio = true) => {
    // Beide Dateien zusammen: persönliche Server gelten überall, das Projekt
    // ergänzt und überschreibt gleichnamige.
    const effective = effectiveMcp();
    for (const error of effective.errors) output.appendLine(`[cortex] mcp.json ungültig — ${error}`);
    const defined = effective.servers;

    const servers = profileServers(defined);
    if (!withStudio && !(CONNECTOR_NAME in defined)) delete servers[CONNECTOR_NAME];
    for (const account of accounts.all()) {
      const error = syncMcpToProfile(account, servers);
      if (error) output.appendLine(`[cortex] Konnektor-Spiegelung (${account.label}): ${error}`);
    }
  };
  const syncConnectors = () => void credentialsReady.then(() => syncConnectorsNow());

  // Anmelde-Tokens laufen ab, oft nach einer Stunde. Cortex frischt sie vorher
  // auf und schreibt sie neu in die Profile: jeder Zug startet seine CLI frisch
  // und liest dabei den gültigen Token. Einen Browser öffnet das nie — ist das
  // Auffrischen endgültig gescheitert, steht das Plugin auf „Neu anmelden“.
  const refreshPluginTokens = async () => {
    await credentialsReady;
    if (await pluginCredentials.refreshDue()) syncConnectorsNow();
  };
  void refreshPluginTokens();
  // Was schon in den Profilen steht, wird beim Start auf den Stand dieser
  // Fassung gebracht: ein Update kann eine Definition ändern — etwa den
  // Zwischenserver vor YouTube —, und ohne diesen Lauf käme sie erst beim
  // nächsten Token-Auffrischen an. Den eingebauten Konnektor trägt das nicht
  // ungefragt ein; ob er gespiegelt wird, entscheidet die Plugin-Seite.
  // Einmal gespiegelt heißt: gewollt — auch wenn der Konnektor gerade draußen
  // bleibt, weil Vektor nicht läuft. Sonst käme er nie mehr zurück.
  const studioWanted = () => ctx.globalState.get<boolean>(STUDIO_WANTED_KEY) === true || connectorWasMirrored(accounts.all());
  if (connectorWasMirrored(accounts.all())) void ctx.globalState.update(STUDIO_WANTED_KEY, true);
  void credentialsReady.then(() => syncConnectorsNow(studioWanted()));
  const tokenTimer = setInterval(() => void refreshPluginTokens(), 5 * 60_000);
  ctx.subscriptions.push({ dispose: () => clearInterval(tokenTimer) });

  // Browser-Freigabe geändert: die Browser-Plugins laufen ab dem nächsten Zug
  // mit oder ohne Fenster, also sofort neu in die Profile.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cortex.browserAccess')) void credentialsReady.then(() => syncConnectorsNow(studioWanted()));
    }),
  );

  // Profilordner ohne Konto ins Archiv — nicht löschen, die Anmeldung darin bleibt wiederherstellbar.
  for (const moved of archiveOrphanProfiles(accounts.all().map((a) => a.homeDir).filter((d): d is string => !!d))) {
    output.appendLine(`[cortex] Profil ohne Konto archiviert: ${moved}`);
  }

  registerDatabaseStudio(ctx, output, () => {
    if (studioWanted()) syncConnectors();
  });
  void loadConnectorIdentity();

  // Only listen once asking is actually on; a socket nobody uses is waste.
  const applyAsk = () => {
    if (vscode.workspace.getConfiguration('cortex').get<boolean>('askPermission', false)) {
      void bridge.start();
    }
  };
  applyAsk();
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cortex.askPermission')) applyAsk();
    }),
  );

  const usageRefresher = (live = false) => refreshUsage(accounts, quota, (line) => output.appendLine(line), live ? { cliPath } : undefined);
  chat.setUsageRefresher(usageRefresher);
  startUsagePolling(ctx, usageRefresher, output);

  output.appendLine('[kortex] activated');
  void bootCortexShell(chat);
}

async function bootCortexShell(chat: ChatViewProvider): Promise<void> {
  // Appearance defaults belong to the bundled product, never overwrite user preferences on every boot.
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  // Erst den Chat aufmachen, dann aufräumen: so ist die Fläche nie leer.
  // Umgekehrt blitzte zwischen Schließen und Öffnen der leere Editorbereich auf.
  chat.openAgentHome();
  await closeRestoredEditors();
}

/** Cortex' eigene Flächen bleiben stehen — sie sind ja das Ziel. */
function isCortexSurface(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputWebview &&
    (input.viewType.includes('kortex') || input.viewType.includes('cortex'))
  );
}

/**
 * Cortex startet auf einem leeren Chat, nicht auf dem, was zuletzt offen war.
 *
 * Die Workbench stellt ihre Editor-Tabs wieder her — wer einmal „mcp.json
 * bearbeiten" gedrückt hat, bekam die Datei danach bei *jedem* Start wieder
 * aufgeschlagen, in derselben Spalte, in der der Chat aufgeht. Das ist ein
 * Editor-Zustand, den niemand bewusst angelegt hat.
 *
 * Geschlossen wird nur, was nichts verliert: ein Tab mit ungesicherten
 * Änderungen bleibt stehen, statt beim Hochfahren nach einer Entscheidung zu
 * fragen.
 */
async function closeRestoredEditors(): Promise<void> {
  const clean = vscode.window.tabGroups.all
    .flatMap(group => group.tabs)
    .filter(tab => !tab.isDirty && !isCortexSurface(tab));
  if (clean.length === 0) return;
  try {
    await vscode.window.tabGroups.close(clean, true);
  } catch {
    // Ein Tab, der sich nicht schließen lässt, ist kein Grund, den Start abzubrechen.
  }
}

/**
 * View containers may live in the secondary side bar — the strip at the top
 * right — only from VS Code 1.106 on. Older builds would spill that copy of
 * the chat list into the Explorer, so hide it there and keep the activity bar.
 */
function hideSecondarySidebarOnOldVSCode(): void {
  const [major = 0, minor = 0] = vscode.version.split('.').map(Number);
  if (major > 1 || (major === 1 && minor >= 106)) return;
  void vscode.commands.executeCommand('setContext', 'cortex.noSecondarySidebar', true);
}

/** Opt-in continuous polling (cortex.pollUsage); on-demand refresh always works. */
function startUsagePolling(
  ctx: vscode.ExtensionContext,
  tick: () => Promise<void>,
  output: vscode.OutputChannel,
): void {
  let timer: NodeJS.Timeout | undefined;

  const apply = () => {
    const enabled = vscode.workspace.getConfiguration('cortex').get<boolean>('pollUsage', true);
    if (enabled && !timer) {
      output.appendLine('[cortex] usage polling enabled');
      void tick();
      timer = setInterval(() => void tick(), CLAUDE_USAGE_MIN_INTERVAL_MS);
    } else if (!enabled && timer) {
      clearInterval(timer);
      timer = undefined;
      output.appendLine('[cortex] usage polling disabled');
    }
  };

  apply();
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cortex.pollUsage')) apply();
    }),
    { dispose: () => timer && clearInterval(timer) },
  );
}

/**
 * Whether the built-in connector already sits in at least one profile.
 *
 * `syncMcpToProfile` leaves a manifest of what it wrote, which makes this
 * answerable without keeping a second record that could fall out of step with
 * the profiles themselves.
 */
function connectorWasMirrored(accounts: Array<{ homeDir?: string }>): boolean {
  return accounts.some((account) => {
    if (!account.homeDir) return false;
    try {
      const raw = readFileSync(joinPath(account.homeDir, '.cortex-mcp.json'), 'utf8');
      const parsed = JSON.parse(raw) as { servers?: unknown };
      return Array.isArray(parsed.servers) && parsed.servers.includes(CONNECTOR_NAME);
    } catch {
      return false;
    }
  });
}

export function deactivate(): void {}
