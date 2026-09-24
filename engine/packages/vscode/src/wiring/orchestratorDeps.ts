import * as vscode from 'vscode';
import {
  asksForCanvas,
  browserBrief,
  briefLinesFor,
  buildProviderBrief,
  disqualifiedLines,
  locationBrief,
  swarmSections,
  WIDGET_BRIEF,
  type AdapterRegistry,
  type OrchestratorDeps,
  type QuotaTracker,
  type SessionStore,
} from '@cortex/core';
import type { AccountStore } from '../storage/accountStore.js';
import type { MetricsStore } from '../storage/metricsStore.js';
import type { PreferenceStore } from '../storage/preferenceStore.js';
import type { WorkspaceContext } from '../context/workspaceContext.js';
import { projectFolderSections } from '../context/projectFolders.js';
import type { Verifier } from '../verify/verifier.js';
import type { PermissionBridge } from '../permission/bridge.js';
import type { CanvasBridge } from '../canvas/canvasBridge.js';
import { BROWSER_ACT_TOOLS, BROWSER_READ_TOOLS, claudeBrowserTool, type BrowserBridge } from '../browser/browserBridge.js';
import type { RulesManager } from '../rules/rulesFile.js';
import type { ChatViewProvider } from '../panel/chatViewProvider.js';
import { readBrowserAccess } from '../plugins/browserPolicy.js';

export interface OrchestratorWiring {
  adapters: AdapterRegistry;
  quota: QuotaTracker;
  sessions: SessionStore;
  accounts: AccountStore;
  rules: RulesManager;
  metrics: MetricsStore;
  preferences: PreferenceStore;
  workspaceContext: WorkspaceContext;
  verifier: Verifier;
  bridge: PermissionBridge;
  canvasBridge: CanvasBridge;
  /** Der eingebaute Browser als Werkzeug; ohne Desktop-App bleibt er weg. */
  browserBridge: BrowserBridge;
  /** Der Chat entsteht erst nach dem Orchestrator; bis dahin `undefined`. */
  chat: () => ChatViewProvider | undefined;
}

/**
 * Hängt eine weitere Konfigurationsdatei an ein vorhandenes `--mcp-config`
 * an — mehrere Dateien gehen hinter ein einziges `--mcp-config` — oder setzt
 * ein neues ans Ende.
 */
export function mergeMcpConfigArg(args: string[], config: string): string[] {
  const at = args.indexOf('--mcp-config');
  return at >= 0 ? [...args.slice(0, at + 2), config, ...args.slice(at + 2)] : [...args, '--mcp-config', config];
}

/** Was der Orchestrator vom Host braucht: Einstellungen, Kontext, Briefe und die Zusatzargumente für Claude. */
export function orchestratorDeps(w: OrchestratorWiring): OrchestratorDeps {
  const { adapters, quota, sessions, accounts, rules, metrics, preferences, workspaceContext, verifier, bridge, canvasBridge, browserBridge } = w;

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

  return {
    adapters,
    quota,
    sessions,
    getMetrics: () => metrics.all(),
    getConversationContext: (id) => w.chat()?.conversationContext(id),
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
      const chatRef = w.chat();
      const config = vscode.workspace.getConfiguration('cortex');
      // Das Gedächtnis des Chats geht unabhängig vom Arbeitsbereich-Kontext mit:
      // wer den Editor-Kontext abschaltet, will nicht, dass Cortex vergisst.
      // Die Zeichenfläche ist Oberfläche, kein Arbeitsbereich-Kontext: sie
      // geht auch mit, wenn der Editor-Kontext abgeschaltet ist.
      const erinnerung = [
        ...(chatRef?.erinnerungsAbschnitte(task.conversationId) ?? []),
        ...(chatRef?.canvasAbschnitte(task.conversationId, task.prompt) ?? []),
        ...(chatRef?.remotionAbschnitte(task.conversationId, task.prompt) ?? []),
        ...(chatRef?.locationAbschnitte(task.conversationId) ?? []),
        // Eine Rolle im Schwarm startet keinen eigenen Schwarm, auch wenn ihr Auftrag ihn nennt.
        ...(config.get<boolean>('chatWidgets', true) && !chatRef?.isTeamConversation(task.conversationId) ? swarmSections(task.prompt) : []),
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
      // Der Genehmigungsserver nur, wenn gefragt wird — sonst stünde sein
      // Werkzeug ohne Zweck in jedem Lauf.
      let args = asking ? bridge.claudeArgs(task.conversationId, task.cwd) : undefined;
      if (asking && !args) throw new Error('Die Genehmigungsabfrage konnte nicht gestartet werden. Bitte erneut versuchen.');
      const add = (config: string, tools: string[]) => {
        const allow = tools.length ? ['--allowedTools', ...tools] : [];
        args = args ? { args: [...mergeMcpConfigArg(args.args, config), ...allow], env: args.env } : { args: ['--mcp-config', config, ...allow], env: {} };
      };
      // Hat der Chat eine Zeichenfläche (oder wird sie gerade verlangt), bekommt
      // Claude die Werkzeuge, mit denen es sie sehen und prüfen kann.
      if (w.chat()?.canvasBelongs(task.conversationId) || asksForCanvas(task.prompt)) {
        await canvasBridge.start().catch(() => undefined);
        const canvasConfig = canvasBridge.claudeConfig(task.conversationId);
        // Freigegeben, auch im Plan-Modus: die Werkzeuge ändern nur die Fläche, nie Projektdateien.
        if (canvasConfig) add(canvasConfig, ['mcp__cortex_canvas__canvas_view', 'mcp__cortex_canvas__canvas_draw']);
      }
      // Recherche im eingebauten Browser statt in einem Desktop-Browser. Lesen
      // und eigene Tabs öffnen ist freigegeben; Klicken, Tippen und Skripte
      // fragen im Genehmigungsmodus nach und bleiben im Plan-Modus aus.
      if (await browserBridge.available()) {
        await browserBridge.start().catch(() => undefined);
        const browserConfig = browserBridge.claudeConfig(task.conversationId);
        const tools = asking || task.permissionMode === 'safe' ? [...BROWSER_READ_TOOLS] : [...BROWSER_READ_TOOLS, ...BROWSER_ACT_TOOLS];
        if (browserConfig) add(browserConfig, tools.map(claudeBrowserTool));
      }
      return args;
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
      // Die Werkzeuge des eingebauten Browsers bekommt nur Claude (getHostArgs).
      const browser = browserBrief(readBrowserAccess(config.get('browserAccess')), provider === 'claude' && browserBridge.availableNow());
      const widgets = config.get<boolean>('chatWidgets', true) ? WIDGET_BRIEF : '';
      const erinnerung = w.chat()?.erinnerungsHinweis() ?? '';
      return { text: [standing.text, location, browser, widgets, erinnerung].filter(Boolean).join('\n\n'), lineIds: standing.lineIds };
    },
  };
}
