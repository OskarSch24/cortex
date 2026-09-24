import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { databaseStudioRoot } from './studioRoot.js';

/**
 * Cortex's end of Database Studio.
 *
 * Database Studio ships a host package (`cortex-bridge`) that serves its own
 * built interface and answers the same HTTP contract the macOS app answers.
 * This class starts one of those per window, gives it the parts only an editor
 * can provide — dialogs, the workspace folders, where settings live — and hands
 * out the URLs the editor tabs load.
 *
 * The package is imported at runtime rather than bundled, for two reasons: it
 * reads files relative to its own location, which a bundle would flatten away,
 * and Database Studio can then be updated without rebuilding Cortex.
 */

interface StudioSessionInfo {
  id: string;
  path: string;
  name: string;
  fileType: string;
}

interface StudioHostModule {
  startStudioHost(options: unknown): Promise<StudioHostHandle>;
  DEFAULT_BUNDLE_DIR: string;
}

interface StudioHostHandle {
  readonly url: string;
  readonly token: string;
  readonly port: number;
  readonly sessionCount: number;
  openSession(id: string, info: { path: string; name: string; fileType: string }): string;
  focusSession(id: string): void;
  closeSession(id: string): void;
  showFile(id: string, file: { path: string; name: string; pendingWal?: boolean }): boolean;
  stop(): Promise<void>;
}

export class StudioUnavailableError extends Error {}

/**
 * What the host requires of its embedder.
 *
 * `cortex-bridge` checks the same names at startup, but a type error at build
 * time is the cheaper place to find a missing one — the runtime check only
 * fires once someone opens a database.
 */
interface StudioDelegate {
  pickSource(): Promise<string | null>;
  chooseSaveTarget(suggestedName: string): Promise<string | null>;
  chooseFolder(message: string): Promise<string | null>;
  reveal(path: string): Promise<void>;
  projectRoots(): Promise<string[]>;
  addProjectRoot(path: string): Promise<void>;
  removeProjectRoot(path: string): Promise<void>;
  loadSettings(): Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): Promise<void>;
  allowWrites(adapter: string): boolean;
  setAllowWrites(adapter: string, allowWrites: boolean): Promise<void>;
  descriptorPath(): string;
}

export class StudioHost implements vscode.Disposable {
  private handle: StudioHostHandle | undefined;
  private starting: Promise<StudioHostHandle> | undefined;
  private readonly changed = new vscode.EventEmitter<void>();

  /** Fires when the host starts, stops, or its session list changes. */
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  get running(): boolean {
    return Boolean(this.handle);
  }

  get url(): string | undefined {
    return this.handle?.url;
  }

  get token(): string | undefined {
    return this.handle?.token;
  }

  get sessionCount(): number {
    return this.handle?.sessionCount ?? 0;
  }

  /** The folder holding `database-studio/` and `cortex-bridge/`. */
  private root(): string {
    return databaseStudioRoot();
  }

  /**
   * Starts the host, or returns the running one.
   *
   * Concurrent callers share one attempt: two tabs opened in the same tick must
   * not race two listeners onto two ports, because only one of them would be
   * the address the agent was told about.
   */
  async start(): Promise<StudioHostHandle> {
    if (this.handle) return this.handle;
    if (this.starting) return this.starting;

    this.starting = this.launch().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private async launch(): Promise<StudioHostHandle> {
    const root = this.root();
    const entry = join(root, 'cortex-bridge', 'src', 'index.js');
    if (!existsSync(entry)) {
      throw new StudioUnavailableError(
        `Vektor wurde unter ${root} nicht gefunden.\n\n` +
          'Den Ordner in den Einstellungen unter „cortex.databaseStudio.path" eintragen.',
      );
    }

    // `import()` survives the CJS bundle only when esbuild cannot see it as a
    // static import; otherwise it is rewritten to `require`, and an ES module
    // package would fail to load.
    const load = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<StudioHostModule>;
    const module = await load(pathToFileURL(entry).href);

    const bundleDir = join(root, 'database-studio', 'dist');
    if (!existsSync(join(bundleDir, 'index.html'))) {
      throw new StudioUnavailableError(
        `Die Vektor-Oberfläche ist noch nicht gebaut.\n\n` +
          `So entsteht sie:\n  npm --prefix "${join(root, 'database-studio')}" install\n` +
          `  npm --prefix "${join(root, 'database-studio')}" run build`,
      );
    }

    const handle = await module.startStudioHost({
      bundleDir,
      delegate: this.delegate(),
      log: (line: string) => this.output.appendLine(`[database-studio] ${line}`),
    });

    this.handle = handle;
    this.output.appendLine(`[database-studio] verbunden auf ${handle.url}`);
    this.changed.fire();
    return handle;
  }

  /**
   * Everything the host deliberately does not know about editors.
   *
   * The workspace folders double as Database Studio's project list: a folder
   * open in Cortex is already the answer to "which projects are there", and
   * asking the user to register it a second time would be the integration
   * failing to integrate.
   */
  private delegate(): StudioDelegate {
    const settingsKey = 'cortex.databaseStudio.settings';

    return {
      pickSource: async (): Promise<string | null> => {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: 'Öffnen',
          filters: { Datenquellen: SOURCE_FILTERS },
        });
        return picked?.[0]?.fsPath ?? null;
      },

      chooseSaveTarget: async (suggestedName: string): Promise<string | null> => {
        const target = await vscode.window.showSaveDialog({
          saveLabel: 'Speichern',
          defaultUri: vscode.Uri.file(
            join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir(), suggestedName),
          ),
        });
        return target?.fsPath ?? null;
      },

      chooseFolder: async (message: string): Promise<string | null> => {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: message || 'Ordner wählen',
        });
        return picked?.[0]?.fsPath ?? null;
      },

      reveal: async (path: string): Promise<void> => {
        await vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path));
      },

      projectRoots: async (): Promise<string[]> =>
        (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),

      addProjectRoot: async (path: string): Promise<void> => {
        vscode.workspace.updateWorkspaceFolders(
          vscode.workspace.workspaceFolders?.length ?? 0,
          0,
          { uri: vscode.Uri.file(path) },
        );
      },

      removeProjectRoot: async (path: string): Promise<void> => {
        const index = (vscode.workspace.workspaceFolders ?? []).findIndex(
          (folder) => folder.uri.fsPath === path,
        );
        if (index >= 0) vscode.workspace.updateWorkspaceFolders(index, 1);
      },

      loadSettings: async (): Promise<Record<string, unknown>> =>
        this.ctx.globalState.get<Record<string, unknown>>(settingsKey) ?? {},

      saveSettings: async (settings: Record<string, unknown>): Promise<void> => {
        await this.ctx.globalState.update(settingsKey, settings);
      },

      /**
       * Writing through the API is off unless it was turned on deliberately.
       * A tool call that rewrites a table is not something to discover after
       * the fact, so the default is the safe one and the setting is per window.
       */
      allowWrites: (_adapter: string): boolean =>
        vscode.workspace
          .getConfiguration('cortex')
          .get<boolean>('databaseStudio.allowWrites', false),

      /** The switch in Database Studio's API tab is Cortex's setting. */
      setAllowWrites: async (_adapter: string, allowWrites: boolean): Promise<void> => {
        await vscode.workspace
          .getConfiguration('cortex')
          .update(
            'databaseStudio.allowWrites',
            allowWrites,
            vscode.ConfigurationTarget.Global,
          );
      },

      descriptorPath: (): string => '',
    };
  }

  async openSession(info: StudioSessionInfo): Promise<string> {
    const handle = await this.start();
    const url = handle.openSession(info.id, {
      path: info.path,
      name: info.name,
      fileType: info.fileType,
    });
    this.changed.fire();
    return url;
  }

  focusSession(id: string): void {
    this.handle?.focusSession(id);
    this.changed.fire();
  }

  closeSession(id: string): void {
    this.handle?.closeSession(id);
    this.changed.fire();
  }

  async dispose(): Promise<void> {
    const handle = this.handle;
    this.handle = undefined;
    this.changed.dispose();
    await handle?.stop();
  }
}

/** The extensions Database Studio can open, for the file dialog. */
const SOURCE_FILTERS = [
  'graph', 'amqrun', 'json', 'jsonl', 'ndjson', 'csv', 'tsv',
  'xlsx', 'xlsm', 'sqlite', 'sqlite2', 'sqlite3', 'db', 'db3',
  'rdb', 'aof',
];
