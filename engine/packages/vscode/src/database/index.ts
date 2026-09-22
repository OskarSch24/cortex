import * as vscode from 'vscode';

import { StudioHost, StudioUnavailableError } from './studioHost.js';
import { StudioEditorProvider } from './studioEditor.js';
import { CONNECTOR_NAME, STUDIO_API_DIR, setStudioHost } from './connector.js';
import { existsSync, watch } from 'node:fs';

export { StudioHost, StudioUnavailableError } from './studioHost.js';
export {
  CONNECTOR_NAME,
  connectorIdentity,
  currentStudioHost,
  databaseStudioServer,
  STUDIO_WANTED_KEY,
  studioReachable,
  loadConnectorIdentity,
  withBuiltInConnectors,
  type ConnectorIdentity,
} from './connector.js';

/**
 * Cortex's database integration.
 *
 * Two things make Database Studio the integration rather than an app that
 * happens to be installed:
 *
 *   opening a database file in Cortex opens it in Database Studio, in a tab,
 *   and the agent's connector points at that same open database.
 *
 * Both go through one host per window. It is started on demand — the first
 * database opened — because a window that never touches one should not be
 * running a server.
 */
export function registerDatabaseStudio(
  ctx: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  syncConnectors: () => void,
): StudioHost {
  const host = new StudioHost(ctx, output);
  setStudioHost(host);
  ctx.subscriptions.push({ dispose: () => { setStudioHost(undefined); void host.dispose(); } });

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  status.command = 'cortex.databaseStudio.status';
  ctx.subscriptions.push(status);

  const render = () => {
    if (!host.running) {
      status.hide();
      return;
    }
    const count = host.sessionCount;
    status.text = `$(database) ${count}`;
    status.tooltip =
      `Vektor ist mit Cortex verbunden.\n` +
      `${count === 1 ? 'Eine Quelle' : `${count} Quellen`} geöffnet · ${host.url}\n\n` +
      `Der Agent liest dieselbe Datenbank, die hier offen ist.`;
    status.show();
  };

  // The agent's connector carries the host's address, so it is rewritten
  // whenever that address appears, changes or goes away.
  ctx.subscriptions.push(
    host.onDidChange(() => {
      render();
      syncConnectors();
    }),
  );
  // Die Vektor-App legt api.json an, wenn ihre API startet, und nimmt sie beim
  // Beenden weg. Beides ändert, ob der Konnektor in die Profile gehört.
  ctx.subscriptions.push(watchStudioApi(syncConnectors));
  render();

  ctx.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      StudioEditorProvider.viewType,
      new StudioEditorProvider(host, output),
      {
        // A database is expensive to load; a background tab must keep it.
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand('cortex.databaseStudio.open', async (uri?: vscode.Uri) => {
      const target = uri ?? (await pickDatabase());
      if (!target) return;
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        StudioEditorProvider.viewType,
      );
    }),

    vscode.commands.registerCommand('cortex.databaseStudio.status', async () => {
      if (!host.running) {
        void vscode.window.showInformationMessage(
          'Vektor läuft noch nicht. Es startet, sobald die erste Datenbank geöffnet wird.',
        );
        return;
      }
      const choice = await vscode.window.showInformationMessage(
        `Vektor ist verbunden — ${host.sessionCount} Quelle(n) offen.\n${host.url}`,
        'Konnektor neu spiegeln',
      );
      if (choice) {
        syncConnectors();
        void vscode.window.showInformationMessage(
          `„${CONNECTOR_NAME}" wurde in alle Anbieterprofile geschrieben.`,
        );
      }
    }),
  );

  return host;
}

async function pickDatabase(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'In Vektor öffnen',
    filters: {
      Datenbanken: ['sqlite', 'sqlite3', 'db', 'db3', 'graph', 'rdb', 'aof', 'amqrun'],
      Tabellen: ['csv', 'tsv', 'jsonl', 'ndjson', 'json', 'xlsx', 'xlsm'],
    },
  });
  return picked?.[0];
}

/** Beobachtet, ob die API der Vektor-App an- oder ausgeht. */
function watchStudioApi(onChange: () => void): vscode.Disposable {
  if (!existsSync(STUDIO_API_DIR)) return new vscode.Disposable(() => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = existsSync(`${STUDIO_API_DIR}/api.json`);
  try {
    const watcher = watch(STUDIO_API_DIR, (_event, file) => {
      if (file && file !== 'api.json') return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const now = existsSync(`${STUDIO_API_DIR}/api.json`);
        if (now !== last) {
          last = now;
          onChange();
        }
      }, 300);
    });
    return new vscode.Disposable(() => { clearTimeout(timer); watcher.close(); });
  } catch {
    return new vscode.Disposable(() => undefined);
  }
}
