import * as vscode from 'vscode';
import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Hält den Mac wach, solange eine lange Aufgabe läuft.
 *
 * `caffeinate -dimsu` ist das Bordmittel dafür: kein Schlaf, kein Ruhezustand
 * des Bildschirms. Der Prozess hängt an dieser Sitzung — endet Cortex, endet
 * auch er, und der Mac darf wieder schlafen. Deshalb steht unter dem Eintrag
 * auch „nur für diese Sitzung“.
 */
class KeepAwake implements vscode.Disposable {
  private process?: ChildProcess;
  get on(): boolean { return this.process !== undefined; }
  toggle(): void {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
      void vscode.window.setStatusBarMessage('Der Mac darf wieder schlafen.', 3000);
    } else {
      this.process = spawn('caffeinate', ['-dimsu'], { stdio: 'ignore' });
      this.process.on('exit', () => { this.process = undefined; void this.sync(); });
      void vscode.window.setStatusBarMessage('Der Mac bleibt wach, solange Cortex läuft.', 3000);
    }
    void this.sync();
  }
  private sync(): Thenable<unknown> {
    return vscode.commands.executeCommand('setContext', 'cortex.awake', this.on);
  }
  dispose(): void { this.process?.kill(); this.process = undefined; }
}

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  MCP_TEMPLATE,
  isReviewOnly,
  parseMcpFile,
  syncMcpToProfile,
  type McpServerDef,
  type Target,
} from '@cortex/core';
import type { AdapterRegistry, QuotaTracker } from '@cortex/core';
import type { AccountStore } from './storage/accountStore.js';
import type { RulesManager } from './rules/rulesFile.js';
import type { ChatViewProvider } from './panel/chatViewProvider.js';
import type { RouterStatusBar } from './views/statusBar.js';
import { addAccountWizard } from './onboarding/addAccount.js';
import { openInTerminal } from './terminalMode.js';
import { profileServers } from './plugins/profileServers.js';
import { effectiveMcp } from './plugins/scopes.js';

export function registerCommands(
  ctx: vscode.ExtensionContext,
  deps: {
    accounts: AccountStore;
    adapters: AdapterRegistry;
    quota: QuotaTracker;
    rules: RulesManager;
    chat: ChatViewProvider;
    statusBar: RouterStatusBar;
  },
): void {
  const keepAwake = new KeepAwake();
  const { accounts, adapters, quota, rules, chat, statusBar } = deps;

  ctx.subscriptions.push(
    vscode.commands.registerCommand('cortex.restartApplication', async () => {
      const commands = await vscode.commands.getCommands(false);
      if (!commands.includes('_cortex.restartApplication')) {
        await vscode.window.showErrorMessage('Der vollständige Neustart benötigt die aktuelle Cortex-App.');
        return;
      }
      await chat.saveBeforeRestart();
      await vscode.commands.executeCommand('_cortex.restartApplication');
    }),
    vscode.commands.registerCommand('cortex.addAccount', (provider?: string) =>
      addAccountWizard(accounts, adapters, provider
        ? { provider: provider as import('@cortex/core').ProviderId, subscriptionOnly: true }
        : undefined),
    ),

    vscode.commands.registerCommand('cortex.reconnectAccount', (id: string) => {
      const account = accounts.all().find(a => a.id === id);
      if (account) return addAccountWizard(accounts, adapters, { provider: account.provider, accountId: id });
    }),

    vscode.commands.registerCommand('cortex.removeAccount', async (idArg?: string) => {
      let id = idArg;
      if (!id) {
        const pick = await vscode.window.showQuickPick(
          accounts.all().map((a) => ({ label: `${a.provider}:${a.label}`, id: a.id })),
          { title: 'cortex: remove which account?' },
        );
        id = pick?.id;
      }
      if (!id) return;
      const account = accounts.all().find((a) => a.id === id);
      if (!account) return;
      const confirmed = await vscode.window.showWarningMessage(
        `Remove ${account.provider}:${account.label}? Its stored secret is deleted; the profile directory is moved to ~/.cortex/profiles-archiv and can be restored from there.`,
        { modal: true },
        'Remove',
      );
      if (confirmed !== 'Remove') return;
      await accounts.remove(id);
    }),

    vscode.commands.registerCommand('cortex.editRules', () => rules.openOrCreate()),

    // Kept as an alias: the builder and the rules tab are one screen now.
    vscode.commands.registerCommand('cortex.openRulesBuilder', () => chat.openRulesTab()),

    vscode.commands.registerCommand('cortex.editCommands', () => rules.openOrCreateCommands()),

    vscode.commands.registerCommand('cortex.syncMcp', async () => {
      const ws = vscode.workspace.workspaceFolders?.[0];
      const candidates = [
        ws ? join(ws.uri.fsPath, '.cortex', 'mcp.json') : undefined,
        join(homedir(), '.cortex', 'mcp.json'),
      ].filter((c): c is string => !!c);
      const effective = effectiveMcp();
      if (effective.errors.length) {
        void vscode.window.showErrorMessage(`cortex: mcp.json invalid — ${effective.errors.join(' · ')}`);
        return;
      }
      const defined = effective.servers;

      // Database Studio ships with Cortex, so there is something to sync even
      // with no mcp.json at all — and it must travel with the rest, since a
      // profile drops every server missing from the set it is handed.
      const servers = profileServers(defined);
      const names = Object.keys(servers);
      if (names.length === 0) {
        const create = await vscode.window.showInformationMessage(
          'cortex: no MCP definition file yet. Define servers once — cortex syncs them into every provider profile.',
          'Create mcp.json',
        );
        if (create) {
          const target = vscode.Uri.file(candidates[0]!);
          await vscode.workspace.fs.writeFile(target, Buffer.from(MCP_TEMPLATE, 'utf8'));
          await vscode.window.showTextDocument(target);
        }
        return;
      }
      const results = accounts.all().map((account) => {
        const error = syncMcpToProfile(account, servers);
        return `${account.provider}:${account.label} ${error ? `✗ (${error})` : '✓'}`;
      });
      void vscode.window.showInformationMessage(
        `cortex: synced ${names.length} MCP server(s) → ${results.join(' · ')}. They load on each account's next run.`,
      );
    }),

    vscode.commands.registerCommand('cortex.newConversation', () => chat.newConversation()),

    vscode.commands.registerCommand('cortex.openChatInTab', () => chat.openAgentHome()),

    vscode.commands.registerCommand('cortex.openAccounts', () => chat.openAccountsTab()),

    vscode.commands.registerCommand('cortex.openRules', () => chat.openRulesTab()),

    vscode.commands.registerCommand('cortex.openAnalytics', () => chat.openAnalyticsTab()),
    vscode.commands.registerCommand('cortex.toggleAsk', async () => {
      const config = vscode.workspace.getConfiguration('cortex');
      const next = !config.get<boolean>('askPermission', false);
      await config.update('askPermission', next, vscode.ConfigurationTarget.Global);
      void vscode.window.showInformationMessage(
        next
          ? 'cortex will ask before each command or file change.'
          : 'cortex will decide from the permission mode again.',
      );
    }),

    vscode.commands.registerCommand('cortex.cancelTask', () => chat.cancelAll()),

    // Die Werkzeuge der Kopfleiste. Sie sitzen in der Fenster-Titelleiste, die
    // als Einzige über Chat und Terminal zugleich läuft.
    //
    // Drei Inhalte, drei Knöpfe: Dateien und Browser legen sich rechts neben
    // den Chat, das Terminal darunter. Jeder Knopf ist ein Umschalter — der
    // zweite Druck macht wieder zu, ohne die Sitzung wegzuwerfen. Die zweite
    // Fassung je Knopf existiert nur, damit die Leiste ein gefülltes Symbol
    // zeigen kann, solange der Bereich offen ist; ein Menüeintrag trägt sein
    // Symbol fest, nicht nach Zustand.
    vscode.commands.registerCommand('cortex.showFiles', () => chat.toolbarAction('files')),
    vscode.commands.registerCommand('cortex.hideFiles', () => chat.toolbarAction('files')),
    vscode.commands.registerCommand('cortex.showChanges', () => chat.toolbarAction('changes')),
    vscode.commands.registerCommand('cortex.showCanvas', () => chat.toolbarAction('canvas')),
    vscode.commands.registerCommand('cortex.showPreview', () => chat.openPreview()),
    vscode.commands.registerCommand('cortex.hidePreview', () => chat.openPreview()),
    vscode.commands.registerCommand('cortex.closeBrowser', () => chat.closeBrowser()),
    // Der Download-Knopf der Browser-Leiste (scripts/patch-browser-design.py):
    // Electron legt Downloads im Downloads-Ordner ab, also zeigt er den.
    vscode.commands.registerCommand('cortex.showDownloads', () => vscode.env.openExternal(vscode.Uri.file(`${process.env.HOME ?? ''}/Downloads`))),
    vscode.commands.registerCommand('cortex.showTerminal', () => chat.toggleTerminalDock()),
    vscode.commands.registerCommand('cortex.hideTerminal', () => chat.toggleTerminalDock()),
    keepAwake,
    vscode.commands.registerCommand('cortex.renameChat', () => chat.renameChat()),
    vscode.commands.registerCommand('cortex.showTranscript', () => chat.showTranscript()),
    vscode.commands.registerCommand('cortex.exportChat', () => chat.exportChat()),
    vscode.commands.registerCommand('cortex.copyChat', () => chat.copyChat()),
    vscode.commands.registerCommand('cortex.forkChat', () => chat.forkChat()),
    vscode.commands.registerCommand('cortex.archiveChat', () => chat.archiveChat()),
    vscode.commands.registerCommand('cortex.deleteChat', () => chat.deleteChat()),
    vscode.commands.registerCommand('cortex.outputStyle', async () => {
      // „Ausgabestil“ ist keine neue Einstellung, sondern der Aufwand, mit dem
      // geantwortet wird — dieselbe Stellschraube wie im Composer, hier nur von
      // der Kopfzeile aus erreichbar.
      const config = vscode.workspace.getConfiguration();
      const current = config.get<string>('cortex.sizeReasoning');
      const styles = [
        { label: 'Knapp', description: 'Kurze Antworten, wenig Vorrede', value: 'low' },
        { label: 'Ausgewogen', description: 'Der übliche Umfang', value: 'medium' },
        { label: 'Gründlich', description: 'Mehr Herleitung und Nachweis', value: 'high' },
      ].map(style => ({ ...style, picked: style.value === current }));
      const picked = await vscode.window.showQuickPick(styles, { placeHolder: 'Ausgabestil für neue Antworten' });
      if (picked) await config.update('cortex.sizeReasoning', picked.value, vscode.ConfigurationTarget.Global);
    }),
    vscode.commands.registerCommand('cortex.keepAwake', () => keepAwake.toggle()),

    vscode.commands.registerCommand('cortex.assignProject', () => chat.toolbarAction('project')),
    vscode.commands.registerCommand('cortex.toggleSidebar', () => chat.toolbarAction('sidebar')),

    vscode.commands.registerCommand('cortex.openInTerminal', () =>
      openInTerminal(accounts, adapters, (target) => statusBar.routed(target)),
    ),

    vscode.commands.registerCommand('cortex.pickModel', async () => {
      const pinned = chat.pinnedTarget();
      type Item = vscode.QuickPickItem & { target?: Target };
      const items: Item[] = [
        {
          label: 'Auto',
          description: 'Router picks across your subscriptions',
          picked: !pinned,
        },
      ];
      for (const account of accounts.all()) {
        if (isReviewOnly(account.provider)) continue;
        items.push({
          label: `${account.provider} · ${account.label}`,
          kind: vscode.QuickPickItemKind.Separator,
        });
        const models = adapters.get(account.provider)?.models ?? [];
        if (models.length === 0) {
          items.push({
            label: 'Default model',
            description: `${account.provider} · ${account.label}`,
            target: { provider: account.provider, account: account.label },
            picked:
              pinned?.provider === account.provider &&
              pinned.account === account.label &&
              !pinned.model,
          });
          continue;
        }
        for (const model of models) {
          items.push({
            label: model.label,
            description: `${account.provider} · ${account.label}`,
            detail: model.id,
            target: { provider: account.provider, account: account.label, model: model.id },
            picked:
              pinned?.provider === account.provider &&
              pinned.account === account.label &&
              pinned.model === model.id,
          });
        }
      }
      const pick = await vscode.window.showQuickPick(items, {
        title: 'cortex: which subscription and model?',
        matchOnDescription: true,
        matchOnDetail: true,
      });
      if (pick === undefined) return;
      await chat.setPinnedTarget(pick.target);
    }),

    vscode.commands.registerCommand('cortex.debug.simulateLimit', async () => {
      const pick = await vscode.window.showQuickPick(
        accounts.all().map((a) => ({ label: `${a.provider}:${a.label}`, id: a.id, provider: a.provider })),
        { title: 'cortex: simulate a usage limit on which account?' },
      );
      if (!pick) return;
      quota.markLimitHit(pick.id, {
        resetAt: Date.now() + 60 * 60 * 1000,
        scope: 'session',
        provider: pick.provider,
      });
      void vscode.window.showInformationMessage(
        `cortex: ${pick.label} marked as limited for 1 hour (use it to test failover).`,
      );
    }),
  );
}
