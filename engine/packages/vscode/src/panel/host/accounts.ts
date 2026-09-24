import * as vscode from 'vscode';
import { ClaudeAdapter, getAccountIdentity, type AdapterRegistry, type Target } from '@cortex/core';
import { addAccountWizard, addOpenRouterAccount, respondToConnection } from '../../onboarding/addAccount.js';
import { installManagedClaude } from '../../onboarding/installClaude.js';
import type { OpenRouterCatalog } from '../../openrouterCatalog.js';
import type { HostToWebview } from '../protocol.js';
import type { DomainTable, Msg, PanelHost } from './dispatch.js';

export interface AccountsPanelHost extends PanelHost {
  readonly adapters: AdapterRegistry;
  /** Geladene Identitäten je Konto; accountDtos liest sie. */
  readonly identities: Map<string, string>;
  readonly openRouter: OpenRouterCatalog | undefined;
  readonly usageRefresher: ((live?: boolean) => Promise<void>) | undefined;
}

export function openRouterCatalogMessage(openRouter: OpenRouterCatalog | undefined): HostToWebview {
  return { kind: 'openRouterCatalog', models: openRouter?.models() ?? [], favorites: openRouter?.favorites() ?? [], defaultModel: openRouter?.defaultModel() };
}

/** Konten: verbinden, umbenennen, wiederherstellen — und was die Kontoseite dazu anzeigt. */
export class AccountsPanel {
  /** Läuft gerade die Installation von Claude Code aus einer Fehlermeldung heraus? */
  private providerInstallation = false;

  constructor(readonly host: AccountsPanelHost) {}

  async renameAccount(id: string): Promise<void> {
    const account = this.host.accounts.all().find((a) => a.id === id);
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
          this.host.accounts
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
    await this.host.accounts.upsert({ ...account, label: label.trim() });
    void vscode.window.showInformationMessage(
      `cortex: renamed to ${account.provider}:${label.trim()}. If your rules reference "${oldLabel}", update them.`,
    );
  }

  async loadIdentities(): Promise<void> {
    const cliPath = vscode.workspace
      .getConfiguration('cortex')
      .get<string>('cliPath.claude', 'claude');
    let changed = false;
    for (const account of this.host.accounts.all()) {
      if (this.host.identities.has(account.id)) continue;
      const identity = await getAccountIdentity(account, cliPath);
      if (identity) {
        this.host.identities.set(account.id, identity);
        changed = true;
      }
    }
    if (changed) this.host.pushAccounts();
  }

  /** Die Schaltfläche an einer Fehlermeldung: Claude Code einrichten oder das betroffene Grok-Konto neu verbinden. */
  async recoverProvider(msg: Msg<'recoverProvider'>, webview: vscode.Webview, conversationId: string | undefined): Promise<void> {
    const host = this.host;
    const rec = host.conversations.get(conversationId ?? '');
    const failure = [...(rec?.log ?? [])].reverse().find(event => event.kind === 'error' && event.messageId === msg.messageId && event.recovery === msg.action);
    if (failure?.kind !== 'error') return;
    if (msg.action === 'install-claude') {
      if (this.providerInstallation) return;
      this.providerInstallation = true;
      const progress = (message: string) => {
        host.toConversation(rec!.id, { kind: 'notice', text: message });
        host.output.appendLine(`[installation] ${message}`);
      };
      try {
        const installed = await installManagedClaude(progress);
        await vscode.workspace.getConfiguration('cortex').update('cliPath.claude', installed.path, vscode.ConfigurationTarget.Global);
        host.adapters.register(new ClaudeAdapter(installed.path));
        progress(`Claude Code ist bereit (${installed.version}). Du kannst die Nachricht erneut senden.`);
        host.pushAccounts();
      } catch (error) { progress(error instanceof Error ? error.message : String(error)); }
      finally { this.providerInstallation = false; }
    } else {
      host.post(webview, { kind: 'showPage', page: 'accounts' });
      const account = host.accounts.all().find(account => account.id === failure.recoveryAccountId && account.provider === 'grok');
      if (account) await host.dispatch({ kind: 'reconnectAccount', id: account.id }, webview);
      else host.post(webview, { kind: 'connectionProgress', provider: 'grok', state: 'error', message: 'Das betroffene Grok-Konto ist nicht mehr vorhanden. Wähle das gewünschte Konto unter Verbindungen.' });
    }
  }
}

type AccountKind =
  | 'recoverProvider' | 'respondToConnection' | 'addApiKeyAccount' | 'getOpenRouterCatalog' | 'setOpenRouterFavorites'
  | 'setOpenRouterDefault' | 'addAccount' | 'reconnectAccount' | 'removeAccount' | 'renameAccount' | 'refreshUsage';

const connectAccount = async (msg: Msg<'addAccount' | 'reconnectAccount'>, webview: vscode.Webview, panel: AccountsPanel) => {
  const host = panel.host;
  const existing = msg.kind === 'reconnectAccount' ? host.accounts.all().find(a => a.id === msg.id) : undefined;
  if (msg.kind === 'reconnectAccount' && !existing) return;
  const provider = existing?.provider ?? (msg.kind === 'addAccount' ? msg.provider : undefined);
  await addAccountWizard(host.accounts, host.adapters, {
    provider: provider as Target['provider'],
    label: msg.kind === 'addAccount' ? msg.label : existing?.label,
    accountId: existing?.id,
    email: msg.kind === 'addAccount' ? msg.email : undefined,
    onProgress: (state, message, detail) => host.post(webview, { kind: 'connectionProgress', provider: provider ?? '', state, message, ...detail }),
  });
  host.pushAccounts();
};

export const accountTable = {
  recoverProvider: async (msg, { webview, surface }, panel) => {
    await panel.recoverProvider(msg, webview, surface.conversationId);
  },
  respondToConnection: msg => {
    respondToConnection(msg.provider as Target['provider'], msg.attemptId, msg.accept);
  },
  addApiKeyAccount: async (msg, { webview }, panel) => {
    await addOpenRouterAccount(panel.host.accounts, {
      key: msg.key,
      label: msg.label,
      accountId: msg.accountId,
      onProgress: (state, message, detail) => panel.host.post(webview, { kind: 'connectionProgress', provider: 'openrouter', state, message, ...detail }),
    });
    panel.host.pushAccounts();
  },
  getOpenRouterCatalog: (_msg, { webview }, panel) => {
    panel.host.post(webview, openRouterCatalogMessage(panel.host.openRouter));
    void panel.host.openRouter?.refresh();
  },
  setOpenRouterFavorites: async (msg, _cx, panel) => {
    await panel.host.openRouter?.setFavorites(msg.ids);
  },
  setOpenRouterDefault: async (msg, _cx, panel) => {
    await panel.host.openRouter?.setDefaultModel(msg.id);
  },
  addAccount: (msg, { webview }, panel) => connectAccount(msg, webview, panel),
  reconnectAccount: (msg, { webview }, panel) => connectAccount(msg, webview, panel),
  removeAccount: msg => {
    void vscode.commands.executeCommand('cortex.removeAccount', msg.id);
  },
  renameAccount: async (msg, _cx, panel) => {
    await panel.renameAccount(msg.id);
  },
  refreshUsage: (_msg, _cx, panel) => {
    void panel.host.usageRefresher?.(true);
  },
} satisfies DomainTable<AccountKind, AccountsPanel>;
