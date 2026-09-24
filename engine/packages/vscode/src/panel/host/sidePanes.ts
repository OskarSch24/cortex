import * as vscode from 'vscode';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was die Seitenflächen vom Provider brauchen. Der Zustand selbst liegt noch
 * am Provider — Tests lesen und setzen ihn dort (`sidePanes`, `browserChats`).
 */
export interface SidePaneHost extends PanelHost {
  /**
   * The panes Cortex opened beside the chat. The editor draws them without a
   * tab bar, so nothing else offers a way out of them — Cortex has to.
   */
  readonly sidePanes: { browser: boolean; terminal?: vscode.Terminal };
  /** Der Browser gehört einem Chat (siehe ChatViewProvider.browserChats). */
  readonly browserChats: Set<string>;
  /** Ob das untere Dock gerade sichtbar ist — Cortex merkt sich, was es selbst veranlasst hat. */
  terminalDockVisible: boolean;
  /** Ob das Datei-Dock der Webview offen ist; es meldet sich als `dockState`. */
  dockOpen: boolean;
}

/** Browser, Terminal und Datei-Dock neben dem Chat — und die Knöpfe der Titelleiste, die sie zeigen. */
export class SidePanes {
  constructor(readonly host: SidePaneHost) {}

  /**
   * Das untere Dock: ein Terminal über die volle Breite rechts der Seitenleiste.
   *
   * Neben dem Chat hätte es keine Kopfzeile und keinen Weg heraus; das Panel
   * bringt beides mit. `cortex.terminalLocation: "beside"` bleibt als
   * ausdrückliche Ausnahme bestehen — wer sie gesetzt hat, hat sie gemeint.
   */
  openTerminalDock(cwd?: string): void {
    const beside = vscode.workspace.getConfiguration('cortex').get<string>('terminalLocation', 'panel') === 'beside';
    const existing = this.host.sidePanes.terminal;
    // Ein zweiter Aufruf soll die laufende Sitzung zeigen, nicht ersetzen —
    // sonst verliert jedes Wiederöffnen den Verlauf der Shell.
    const terminal = existing ?? vscode.window.createTerminal({
      name: 'Cortex',
      cwd,
      ...(beside ? { location: { viewColumn: vscode.ViewColumn.Beside } } : {}),
    });
    terminal.show();
    this.host.sidePanes.terminal = terminal;
    this.host.terminalDockVisible = true;
    this.pushPanes();
    void this.pushDockContexts();
  }

  /** Verstecken, nicht beenden: `closePanel` lässt die Shell laufen. */
  async hidePanel(): Promise<void> {
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
    if (this.host.sidePanes.terminal && this.host.terminalDockVisible) {
      this.host.terminalDockVisible = false;
      await this.hidePanel();
      this.pushPanes();
      await this.pushDockContexts();
      return;
    }
    const surface = this.host.agentPanel ? this.host.surfaces.get(this.host.agentPanel.webview) : undefined;
    this.openTerminalDock(await this.host.conversationCwd(surface?.conversationId));
  }

  /**
   * Was die Knöpfe der Titelleiste als aktiv zeichnen dürfen.
   *
   * Der Zustand des Datei-Docks liegt in der Webview; er kommt als `dockState`
   * herein. Browser und Terminal kennt der Provider selbst.
   */
  async pushDockContexts(): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'cortex.filesOpen', this.host.dockOpen);
    await vscode.commands.executeCommand('setContext', 'cortex.browserOpen', this.host.sidePanes.browser);
    await vscode.commands.executeCommand('setContext', 'cortex.terminalOpen', Boolean(this.host.sidePanes.terminal) && this.host.terminalDockVisible);
  }

  /** Every open surface learns which side panes are visible. */
  pushPanes(): void {
    const message = { kind: 'panes' as const, browser: this.host.sidePanes.browser, terminal: this.host.sidePanes.terminal !== undefined && this.host.terminalDockVisible };
    for (const [w] of this.host.surfaces) this.host.post(w, message);
    void this.pushDockContexts();
  }

  /** Chatwechsel: den fremden Browser schließen, den eigenen wieder öffnen. */
  async swapBrowser(id: string, webview: vscode.Webview): Promise<void> {
    if (this.host.sidePanes.browser) {
      const known = await vscode.commands.getCommands(true);
      if (known.includes('workbench.action.browser.closeAll')) {
        await vscode.commands.executeCommand('workbench.action.browser.closeAll');
      }
      this.host.sidePanes.browser = false;
      this.pushPanes();
    }
    if (this.host.browserChats.has(id)) await this.host.dispatch({ kind: 'openBrowser' }, webview);
  }

  previewUrls(): Record<string, string> {
    return this.host.ctx.workspaceState.get<Record<string, string>>('cortex.previewUrls') ?? {};
  }
}

type PaneKind = 'openTerminal' | 'dockState' | 'closeTerminal' | 'closeBrowser' | 'openBrowser';

export const sidePaneTable = {
  openTerminal: async (_msg, { surface }, panes) => {
    panes.openTerminalDock(await panes.host.conversationCwd(surface.conversationId));
  },
  dockState: async (msg, _cx, panes) => {
    panes.host.dockOpen = msg.open;
    await panes.pushDockContexts();
  },
  closeTerminal: async (_msg, _cx, panes) => {
    // Schließen räumt die Fläche frei; laufende Server bleiben erhalten.
    panes.host.terminalDockVisible = false;
    await panes.hidePanel();
    panes.pushPanes();
  },
  closeBrowser: async (_msg, { surface }, panes) => {
    const known = await vscode.commands.getCommands(true);
    if (known.includes('workbench.action.browser.closeAll')) {
      await vscode.commands.executeCommand('workbench.action.browser.closeAll');
    }
    panes.host.sidePanes.browser = false;
    if (surface?.conversationId) panes.host.browserChats.delete(surface.conversationId);
    panes.pushPanes();
  },
  openBrowser: async (msg, { surface }, panes) => {
    // Die zuletzt geöffnete Seite merkt sich jeder Chat selbst — nie die
    // eines anderen Chats oder Projekts.
    const chat = surface?.conversationId;
    const url = new URL(msg.url || (chat ? panes.previewUrls()[chat] : undefined) || 'about:blank');
    if (url.protocol !== 'http:' && url.protocol !== 'https:' && url.href !== 'about:blank') return;
    if (chat && url.href !== 'about:blank') {
      await panes.host.ctx.workspaceState.update('cortex.previewUrls', { ...panes.previewUrls(), [chat]: url.href });
    }
    if (chat) panes.host.browserChats.add(chat);
    const commands = await vscode.commands.getCommands(true);
    if (commands.includes('workbench.action.browser.open')) {
      // Current Code-OSS has a real integrated browser. Simple Browser redirects
      // to it but drops viewColumn; use its side-by-side API explicitly.
      // A preview stays a single pane: close an open browser first instead of
      // stacking a second one next to the chat.
      if (commands.includes('workbench.action.browser.closeAll')) await vscode.commands.executeCommand('workbench.action.browser.closeAll');
      await vscode.commands.executeCommand('workbench.action.browser.open', { url: url.href === 'about:blank' ? undefined : url.href, openToSide: true });
      panes.host.sidePanes.browser = true;
      panes.pushPanes();
    } else {
      await vscode.commands.executeCommand('simpleBrowser.api.open', vscode.Uri.parse(url.toString()), { viewColumn: vscode.ViewColumn.Beside });
    }
  },
} satisfies DomainTable<PaneKind, SidePanes>;
