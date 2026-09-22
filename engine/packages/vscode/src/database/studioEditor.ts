import * as vscode from 'vscode';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';

import { StudioHost, StudioUnavailableError } from './studioHost.js';

/**
 * The editor tab a database opens into.
 *
 * VS Code owns the tab; Database Studio owns everything inside it. The webview
 * is a frame around the host's own address, which is what keeps the interface
 * identical to the macOS app instead of a reimplementation that slowly drifts
 * from it.
 *
 * The document is deliberately not read through `vscode.workspace.fs`: a
 * SQLite file is not text, and the working copy the user edits lives in the
 * renderer, not in a `TextDocument`. Save behaviour stays Database Studio's —
 * autosave for graphs, an explicit export for tabular working copies.
 */
export class StudioEditorProvider implements vscode.CustomReadonlyEditorProvider {
  static readonly viewType = 'cortex.databaseStudio';

  constructor(
    private readonly host: StudioHost,
    private readonly output: vscode.OutputChannel,
  ) {}

  openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
    return { uri, dispose: () => {} };
  }

  async resolveCustomEditor(
    document: vscode.CustomDocument,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const sessionId = randomUUID();
    const path = document.uri.fsPath;
    const name = basename(path);

    let url: string;
    try {
      url = await this.host.openSession({
        id: sessionId,
        path,
        name,
        fileType: '',
      });
    } catch (err) {
      panel.webview.options = { enableScripts: false };
      panel.webview.html = failurePage(
        err instanceof StudioUnavailableError
          ? err.message
          : `Vektor konnte nicht starten:\n${(err as Error).message}`,
      );
      this.output.appendLine(`[database-studio] ${name}: ${(err as Error).message}`);
      return;
    }

    // The host serves the interface from loopback; the frame is allowed to
    // reach exactly that origin and nothing else.
    const origin = new URL(url).origin;
    panel.webview.options = { enableScripts: true, localResourceRoots: [] };
    panel.webview.html = framePage(origin, url);

    // The tab the user is looking at is the one the agent's questions are
    // answered by, so a database in the background never answers for the one
    // in front.
    if (panel.active) this.host.focusSession(sessionId);
    panel.onDidChangeViewState(() => {
      if (panel.active) this.host.focusSession(sessionId);
    });
    panel.onDidDispose(() => this.host.closeSession(sessionId));
  }
}

/** The frame around Database Studio's own address. */
function framePage(origin: string, url: string): string {
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline';"
    />
    <style>
      html, body { height: 100%; margin: 0; padding: 0; background: #0b0b0c; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe src="${url}" allow="clipboard-read; clipboard-write"></iframe>
  </body>
</html>`;
}

function failurePage(message: string): string {
  const escaped = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <style>
      body {
        margin: 0;
        padding: 2.5rem;
        font: 13px/1.6 -apple-system, BlinkMacSystemFont, sans-serif;
        color: var(--vscode-foreground, #ddd);
        background: var(--vscode-editor-background, #0b0b0c);
      }
      h1 { font-size: 15px; font-weight: 600; margin: 0 0 1rem; }
      pre { white-space: pre-wrap; font: 12px/1.7 ui-monospace, SFMono-Regular, monospace; opacity: .85; }
    </style>
  </head>
  <body>
    <h1>Vektor ist nicht erreichbar</h1>
    <pre>${escaped}</pre>
  </body>
</html>`;
}
