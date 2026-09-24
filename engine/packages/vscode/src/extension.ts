import * as vscode from 'vscode';
import { ClaudeCatalog } from './claudeCatalog.js';
import { OpenRouterCatalog } from './openrouterCatalog.js';
import { CanvasBridge } from './canvas/canvasBridge.js';
import { WebSearchBridge } from './websearch/websearchBridge.js';
import { BrowserBridge } from './browser/browserBridge.js';
import { join as joinPath } from 'node:path';
import {
  AdapterRegistry,
  ClaudeAdapter,
  CodexAdapter,
  CopilotAdapter,
  GrokAdapter,
  OpenRouterAdapter,
  Orchestrator,
  QuotaTracker,
  SessionStore,
  CLAUDE_USAGE_MIN_INTERVAL_MS,
} from '@cortex/core';
import { refreshUsage } from './usage.js';
import { AccountStore } from './storage/accountStore.js';
import { MetricsStore } from './storage/metricsStore.js';
import { PreferenceStore } from './storage/preferenceStore.js';
import { WorkspaceContext } from './context/workspaceContext.js';
import { Verifier } from './verify/verifier.js';
import { PermissionBridge } from './permission/bridge.js';
import { globalStateQuotaPersistence } from './storage/quotaPersistence.js';
import { RulesManager } from './rules/rulesFile.js';
import { ChatViewProvider } from './panel/chatViewProvider.js';
import { RouterStatusBar } from './views/statusBar.js';
import { registerCommands } from './commands.js';
import { startAuthWatch, type AuthHealth } from './authWatch.js';
import { PluginCredentials, setPluginCredentials } from './plugins/credentials.js';
import { PluginConnections } from './plugins/connections.js';
import { PluginSwitches, setPluginSwitches } from './plugins/switches.js';
import { setYoutubeKanalProxy } from './plugins/youtubeKanal.js';
import { startConnectorSync } from './plugins/connectorSync.js';
import { createCliPath, extendPath } from './runtime/cliPath.js';
import { orchestratorDeps } from './wiring/orchestratorDeps.js';
import { bootCortexShell, hideSecondarySidebarOnOldVSCode } from './vscodeShell.js';

export function activate(ctx: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Cortex');
  ctx.subscriptions.push(output);

  hideSecondarySidebarOnOldVSCode();

  extendPath();
  const cliPath = createCliPath(vscode.workspace.getConfiguration('cortex'));

  const adapters = new AdapterRegistry();
  adapters.register(new ClaudeAdapter(cliPath('claude', 'claude')));
  adapters.register(new CodexAdapter(cliPath('codex', 'codex')));
  adapters.register(new CopilotAdapter(cliPath('copilot', 'copilot')));
  adapters.register(new GrokAdapter(cliPath('grok', 'grok')));
  // No CLI and no subscription: an HTTP call with the user's own key. Reviews
  // run on free models; in chat it answers only when picked by hand.
  const openRouter = new OpenRouterAdapter();
  adapters.register(openRouter);

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
  // Der eingebaute Browser als Werkzeug der Agenten (cortex_browser) — nur in der Desktop-App.
  const browserBridge = new BrowserBridge(joinPath(ctx.extensionPath, 'dist', 'browserServer.js'));
  ctx.subscriptions.push(browserBridge);
  void browserBridge.available();
  // Exa-Instant-Suche der Agenten (Werkzeug web_search); Cortex sucht über OpenRouter.
  const webSearchBridge = new WebSearchBridge(
    joinPath(ctx.extensionPath, 'dist', 'websearchServer.js'),
    (conversationId, query, maxResults) => chatRef!.webSearchFor(conversationId, query, maxResults),
  );
  ctx.subscriptions.push(webSearchBridge);
  ctx.subscriptions.push(rules);

  // Declared before the orchestrator so routing can read thread memory.
  let chatRef: ChatViewProvider | undefined;

  const orchestrator = new Orchestrator(orchestratorDeps({
    adapters, quota, sessions, accounts, rules, metrics, preferences,
    workspaceContext, verifier, bridge, canvasBridge, browserBridge,
    chat: () => chatRef,
  }));

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
  chat.setWebSearchBridge(webSearchBridge);
  chat.setOpenRouterCatalog(new OpenRouterCatalog(ctx, openRouter, accounts, line => output.appendLine(line)));
  new ClaudeCatalog(ctx, accounts, () => chat.pushAccounts(), line => output.appendLine(line));
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

  startConnectorSync(ctx, { output, accounts, pluginCredentials, credentialsReady });

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

export function deactivate(): void {}
