import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnLines } from '@cortex/core';
import { fuehreAus } from '../../exokortex/actions.js';
import { leseStatus, profileAufDerPlatte, type ExokortexPfade } from '../../exokortex/status.js';
import type { StatusWatch } from '../../exokortex/watch.js';
import type { Erinnerung } from '../../memory/host.js';
import type { ExokortexAction, GalaxieKnoten, HostToWebview } from '../protocol.js';
import { expandHome } from '../workspace.js';
import type { DomainTable, PanelHost } from './dispatch.js';

export interface ExokortexPanelHost extends PanelHost {
  /** Läuft nur, solange jemand die Exokortex-Seite offen hat. */
  readonly exokortexWatch: StatusWatch;
  readonly erinnerung: Erinnerung;
  pushConnectors(webview: vscode.Webview, sync?: boolean): Promise<void>;
}

/** Wo das Exokortex-Repo und welches Python. Absolut, nie nach Namen. */
export function exokortexPfade(ctx: vscode.ExtensionContext): ExokortexPfade {
  const config = vscode.workspace.getConfiguration('cortex');
  return {
    python: config.get<string>('exokortex.pythonPath') || '/usr/bin/python3',
    repo: config.get<string>('exokortex.repoPath') || join(homedir(), 'dev', 'Exokortex'),
    // Rückfall-Symbole für Dienste ohne Anwendung auf diesem Rechner. Die
    // installierten holt `icons.ts` selbst aus ihrem Programmbündel.
    symbole: join(ctx.extensionUri.fsPath, 'media', 'icons'),
  };
}

/** Die Exokortex-Seite: Status, Aktionen, Galaxie und Suche. */
export class ExokortexPanel {
  private readonly laeuft = new Map<string, AbortController>();

  constructor(readonly host: ExokortexPanelHost) {}

  /**
   * Der Zustand des Exokortex, an alle Oberflächen, die ihn zeigen.
   *
   * Ohne Argument ein Rundruf — so kommt das Ergebnis eines Wächter-Durchgangs
   * bei jeder offenen Seite an, nicht nur bei der, die zuletzt gefragt hat.
   */
  async push(webview?: vscode.Webview): Promise<void> {
    const profile = this.host.accounts.all()
      .filter(a => a.homeDir)
      .map(a => ({ provider: a.provider, label: a.label, homeDir: a.homeDir }));
    const status = await leseStatus(
      exokortexPfade(this.host.ctx),
      profile.length ? profile : profileAufDerPlatte(),
    );
    const nachricht: HostToWebview = { kind: 'exokortex', status };
    if (webview) {
      this.host.post(webview, nachricht);
      return;
    }
    this.host.broadcast(nachricht, surface => surface.mode === 'agent');
  }

  /**
   * Eine Aktion der Exokortex-Seite. Jede läuft für sich und ist abbrechbar;
   * ein zweiter Klick auf denselben Knopf bricht ab statt doppelt zu starten.
   */
  async aktion(action: ExokortexAction, webview: vscode.Webview): Promise<void> {
    const laufend = this.laeuft.get(action);
    if (laufend) {
      laufend.abort();
      return;
    }
    const melde = (state: 'running' | 'done' | 'error', extra: { output?: string; message?: string } = {}) =>
      this.host.post(webview, { kind: 'exokortexAktion', action, state, ...extra });

    if (action === 'pruefen') {
      melde('running');
      await this.host.exokortexWatch.jetzt();
      melde('done');
      return;
    }
    if (action === 'konnektorenSync') {
      // Der Weg, der die Profile beschreibt, existiert schon — ihn hier zu
      // wiederholen hieße, zwei Stellen zu haben, die MCP-Profile schreiben.
      melde('running');
      await this.host.pushConnectors(webview, true);
      await this.push();
      melde('done');
      return;
    }

    const abbruch = new AbortController();
    this.laeuft.set(action, abbruch);
    melde('running');
    try {
      const { code, ausgabe } = await fuehreAus(action, exokortexPfade(this.host.ctx), abbruch.signal,
        zeile => melde('running', { output: zeile }));
      melde(code === 0 ? 'done' : 'error',
        { message: code === 0 ? undefined : `Beendet mit ${code}`, output: ausgabe });
    } catch (e) {
      melde('error', { message: (e as Error).message });
    } finally {
      this.laeuft.delete(action);
      await this.push();
    }
  }
}

type ExokortexKind =
  | 'getExokortex' | 'exokortexPageOpen' | 'exokortexAction' | 'exokortexGalaxie' | 'exokortexSuche'
  | 'hideMemory' | 'exokortexOpenPath' | 'exokortexOeffneQuelle';

export const exokortexTable = {
  getExokortex: async (_msg, { webview }, panel) => {
    await panel.push(webview);
  },
  exokortexPageOpen: (msg, _cx, panel) => {
    panel.host.exokortexWatch.setOffen(msg.open);
  },
  exokortexAction: async (msg, { webview }, panel) => {
    await panel.aktion(msg.action, webview);
  },
  exokortexGalaxie: async (msg, { webview }, panel) => {
    // Der Ausschnitt kommt fertig gekappt aus Python — welche Nachbarn
    // wichtig sind, weiss der Graph, nicht die Oberflaeche.
    const { python, repo } = exokortexPfade(panel.host.ctx);
    const args = [join(repo, 'bruecke', 'galaxie.py')];
    args.push(...(msg.id ? ['nachbarn', msg.id] : ['start']));
    const zeilen: string[] = [];
    for await (const ereignis of spawnLines(python, args, {
      cwd: repo, env: process.env, signal: new AbortController().signal,
    })) {
      if (ereignis.kind === 'line' && ereignis.stream === 'stdout') zeilen.push(ereignis.line);
    }
    try {
      const d = JSON.parse(zeilen.join('\n')) as {
        knoten: GalaxieKnoten[];
        kanten: Array<{ von: string; nach: string; typ: string }>;
        hinweis: string;
      };
      panel.host.post(webview, { kind: 'exokortexGalaxieDaten', um: msg.id, ...d });
    } catch {
      panel.host.post(webview, {
        kind: 'exokortexGalaxieDaten', um: msg.id, knoten: [], kanten: [],
        hinweis: 'Der Ausschnitt liess sich nicht lesen.',
      });
    }
  },
  exokortexSuche: async (msg, { webview }, panel) => {
    // Genau der Weg, den ein Modell nimmt. Eine eigene Suchfassung hier
    // wäre eine, die irgendwann etwas anderes findet als die KI.
    const { python, repo } = exokortexPfade(panel.host.ctx);
    const zeilen: string[] = [];
    for await (const ereignis of spawnLines(
      python, [join(repo, 'bruecke', 'lesen.py'), '--suche', msg.frage],
      { cwd: repo, env: process.env, signal: new AbortController().signal })) {
      if (ereignis.kind === 'line' && ereignis.stream === 'stdout') zeilen.push(ereignis.line);
      if (ereignis.kind === 'spawn-error') zeilen.push(ereignis.message);
    }
    panel.host.post(webview, { kind: 'exokortexTreffer', frage: msg.frage, text: zeilen.join('\n') });
  },
  hideMemory: (msg, { surface }, panel) => {
    if (surface.conversationId) panel.host.erinnerung.ausblenden(surface.conversationId, msg.id);
  },
  exokortexOpenPath: async msg => {
    const ziel = vscode.Uri.file(msg.path);
    const verzeichnis = (await vscode.workspace.fs.stat(ziel)).type === vscode.FileType.Directory;
    if (verzeichnis) await vscode.env.openExternal(ziel);
    else await vscode.window.showTextDocument(ziel, { preview: true });
  },
  exokortexOeffneQuelle: async msg => {
    // App, Ordner oder URL — derselbe Klick wie auf ein Dock-Symbol.
    // `open` darf scheitern, ohne die Seite zu stören: eine nicht
    // installierte App (Telegram) ist geplant, kein Fehlerdialog.
    if (msg.url && /^https?:\/\//.test(msg.url)) {
      await vscode.env.openExternal(vscode.Uri.parse(msg.url));
      return;
    }
    if (msg.pfad) {
      await vscode.env.openExternal(vscode.Uri.file(expandHome(msg.pfad)));
      return;
    }
    const args = msg.bundle ? ['-b', msg.bundle] : msg.app ? ['-a', msg.app] : null;
    if (args) spawn('open', args, { stdio: 'ignore', detached: true }).unref();
  },
} satisfies DomainTable<ExokortexKind, ExokortexPanel>;
