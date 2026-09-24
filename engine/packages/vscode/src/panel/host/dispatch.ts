import type * as vscode from 'vscode';
import type { AccountStore } from '../../storage/accountStore.js';
import type { MetricsStore } from '../../storage/metricsStore.js';
import type { RulesManager } from '../../rules/rulesFile.js';
import type { AccountStatusDto, HostToWebview, ProjectDto, WebviewToHost } from '../protocol.js';
import type { ConversationRecord, Surface } from '../panelTypes.js';

/**
 * Die Nachrichten der Webview, aufgeteilt nach Bereichen.
 *
 * Absichtlich nicht in protocol.ts: die Webview lädt protocol.ts, und nichts
 * unter host/ darf in ihr Bündel geraten.
 */
export type Kind = WebviewToHost['kind'];
export type Msg<K extends Kind> = Extract<WebviewToHost, { kind: K }>;

/** Wer gefragt hat: die Fläche so, wie der Provider sie gespeichert hat — nie eine Kopie. */
export interface MessageContext {
  host: PanelHost;
  webview: vscode.Webview;
  surface: Surface;
}

export type Handler<K extends Kind> = (msg: Msg<K>, cx: MessageContext) => unknown;
export type HandlerTable<K extends Kind = Kind> = { [P in K]: Handler<P> };
/** Die Handler eines Bereichs, die ihren Bereich `d` als drittes Argument bekommen (siehe bindDomain). */
export type DomainTable<K extends Kind, D> = { [P in K]: (msg: Msg<P>, cx: MessageContext, d: D) => unknown };

/**
 * Was jeder Bereich vom Provider braucht.
 *
 * Der Provider baut dieses Objekt erst beim ersten Zugriff, und jedes Glied
 * liest `this` zum Zeitpunkt des Aufrufs. So greift ein später gesetzter
 * Test-Stub (`chat.safePost = vi.fn()`) auch hier — nichts hält eine alte
 * Methode fest.
 */
export interface PanelHost {
  readonly ctx: vscode.ExtensionContext;
  readonly output: vscode.OutputChannel;
  /** Alle offenen Flächen, in der Reihenfolge, in der sie dazukamen. */
  readonly surfaces: Map<vscode.Webview, Surface>;
  readonly conversations: Map<string, ConversationRecord>;
  readonly agentPanel: vscode.WebviewPanel | undefined;
  readonly rules: RulesManager;
  readonly accounts: AccountStore;
  readonly metrics: MetricsStore;
  post(webview: vscode.Webview, msg: HostToWebview): void;
  /** An jede Fläche, die `only` zulässt — ohne Filter an alle. */
  broadcast(msg: HostToWebview, only?: (surface: Surface) => boolean): void;
  reveal(panel: vscode.WebviewPanel | undefined): boolean;
  toConversation(id: string, msg: HostToWebview, opts?: { log: boolean }): void;
  /** Zurück durch die eigene Weiche, etwa wenn eine Nachricht eine andere auslöst. */
  dispatch(msg: WebviewToHost, webview: vscode.Webview): Promise<void>;
  visibleConversationId(): string | undefined;
  isRunning(id: string): boolean;
  persistNow(): Promise<void>;
  persistSoon(): void;
  sendConversations(): void;
  projectRoot(id?: string): string | undefined;
  conversationCwd(id?: string): Promise<string>;
  projects(): ProjectDto[];
  pushProjects(): void;
  pushAccounts(): void;
  accountDtos(): AccountStatusDto[];
}

/**
 * Hängt einem Bereich seine Handler an. `domain` wird bei jeder Nachricht neu
 * gefragt, damit ein Bereich erst entsteht, wenn er gebraucht wird.
 */
export function bindDomain<D, K extends Kind>(
  table: DomainTable<K, D>,
  domain: () => D,
): HandlerTable<K> {
  const bound: Partial<Record<Kind, (msg: WebviewToHost, cx: MessageContext) => unknown>> = {};
  for (const kind of Object.keys(table) as K[]) {
    const handle = table[kind] as unknown as (msg: WebviewToHost, cx: MessageContext, d: D) => unknown;
    bound[kind] = (msg, cx) => handle(msg, cx, domain());
  }
  return bound as unknown as HandlerTable<K>;
}

type Merged<T extends object[]> = T extends [infer First, ...infer Rest extends object[]] ? First & Merged<Rest> : unknown;

/**
 * Führt die Tabellen der Bereiche zusammen. Ein Spread würde eine doppelte
 * Nachricht still überschreiben; hier fällt sie beim ersten Zusammenbau auf.
 */
export function combineHandlers<T extends object[]>(...tables: T): Merged<T> {
  const combined: Record<string, unknown> = {};
  for (const table of tables) {
    for (const [kind, handle] of Object.entries(table)) {
      if (kind in combined) throw new Error(`Doppelter Handler für „${kind}“.`);
      combined[kind] = handle;
    }
  }
  return combined as Merged<T>;
}
