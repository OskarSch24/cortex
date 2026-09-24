import * as vscode from 'vscode';
import type { RulesManager } from '../../rules/rulesFile.js';
import type { HostToWebview } from '../protocol.js';
import type { HandlerTable, PanelHost } from './dispatch.js';

/** Regeln und Auswertung: die Seiten „Rules“ und „Analytics“ samt ihren Knöpfen. */

export function rulesMessage(rules: RulesManager): HostToWebview {
  const state = rules.getState();
  return {
    kind: 'rules',
    rules: state.rules,
    path: state.path,
    exists: state.exists,
    error: state.error,
    customCommands: rules.getCustomCommands(),
  };
}

export function pushRules(host: PanelHost): void {
  const msg = rulesMessage(host.rules);
  // Chat tabs consume rules too (tag suggestions in the composer).
  host.broadcast(msg, surface => surface.mode === 'rules' || surface.mode === 'tab' || surface.mode === 'agent');
}

export function pushAnalytics(host: PanelHost, webview?: vscode.Webview): void {
  const msg: HostToWebview = {
    kind: 'analytics',
    metrics: host.metrics.all(),
    accounts: host.accountDtos(),
  };
  if (webview) {
    host.post(webview, msg);
  } else {
    host.broadcast(msg, surface => surface.mode === 'analytics');
  }
}

export const rulesAnalyticsHandlers: HandlerTable<'getAnalytics' | 'editRules' | 'saveRule' | 'deleteRule' | 'reorderRules' | 'saveDefaultChain' | 'clearAnalytics'> = {
  getAnalytics: (_msg, { host, webview }) => pushAnalytics(host, webview),
  editRules: () => {
    void vscode.commands.executeCommand('cortex.editRules');
  },
  saveRule: (msg, { host }) => {
    void host.rules.saveRule(msg.rule, msg.ruleIndex);
  },
  deleteRule: (msg, { host }) => {
    void host.rules.deleteRule(msg.ruleId);
  },
  reorderRules: (msg, { host }) => {
    void host.rules.reorderRules(msg.order);
  },
  saveDefaultChain: (msg, { host }) => {
    void host.rules.saveDefaultChain(msg.chain);
  },
  clearAnalytics: (_msg, { host }) => {
    void host.metrics.clear();
  },
};
