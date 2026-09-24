import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import {
  MCP_TEMPLATE,
  OAuthError,
  parseClientJson,
  pluginFields,
  usesAgentLogin,
  usesLogin,
  withServer,
  withoutServer,
  type McpServerDef,
  type PluginEntry,
} from '@cortex/core';
import { claudeMcpLogin, codexMcpLogin } from '../../../plugins/agentLogin.js';
import { loginToServer, loginWithOwnClient, type LoginStep } from '../../../plugins/oauthLogin.js';
import type { PluginScope } from '../../protocol.js';
import type { PluginPanel, PluginPanelHost } from './pluginPanel.js';

/** mcp.json lesen (oder die Vorlage), ändern, zurückschreiben — der eine Weg, auf dem Cortex die Datei anfasst. */
async function rewriteMcp(path: string, change: (text: string) => string): Promise<void> {
  const before = existsSync(path) ? readFileSync(path, 'utf8') : MCP_TEMPLATE;
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirname(path)));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(path), Buffer.from(change(before), 'utf8'));
}

function connectedMessage(entry: PluginEntry, count: number): string {
  return `${entry.name} ist verbunden — ${count} ${count === 1 ? 'Werkzeug' : 'Werkzeuge'}. Neue Chats können es benutzen.`;
}

/** Einrichten, Entfernen und Anmelden eines Plugins — die Schritte hinter den Knöpfen der Plugin-Seite. */
export class PluginSetup {
  constructor(readonly panel: PluginPanel) {}

  get host(): PluginPanelHost {
    return this.panel.host;
  }

  /**
   * Die Anmeldung den CLIs überlassen — nacheinander, damit immer nur ein
   * Browserfenster auf Bestätigung wartet. Eine gelungene genügt.
   */
  async signInWithAgents(webview: vscode.Webview, entry: PluginEntry, account?: string): Promise<boolean> {
    const id = entry.id;
    const targets = this.panel.agentTargets(account);
    if (!targets.length) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: `${entry.name} meldet sich über Claude Code oder Codex an — lege dafür zuerst ein Konto an.` });
      return false;
    }
    if (this.panel.pluginLogins.has(entry.server)) return false;
    const abort = new AbortController();
    const login = { step: 'suche' as LoginStep['step'], message: 'Anmeldung wird vorbereitet …', abort, url: undefined as string | undefined, account: account as string | undefined };
    this.panel.pluginLogins.set(entry.server, login);
    this.panel.broadcastPluginLive();
    const done: string[] = [];
    const failed: string[] = [];
    try {
      for (const target of targets) {
        if (abort.signal.aborted) break;
        const who = `${target.provider === 'claude' ? 'Claude Code' : 'Codex'} (${target.label})`;
        login.account = target.account;
        login.step = 'suche';
        login.message = `${who} wird bei ${entry.name} angemeldet …`;
        login.url = undefined;
        this.panel.broadcastPluginLive();
        const deps = {
          signal: abort.signal,
          onUrl: (url: string, opensItself: boolean) => {
            login.step = 'browser';
            login.message = `Im Browser bei ${entry.name} bestätigen — für ${who}.`;
            login.url = url;
            this.panel.broadcastPluginLive();
            // Codex öffnet den Browser selbst; ein zweites Fenster verwirrt nur.
            if (!opensItself) void vscode.env.openExternal(url as unknown as vscode.Uri);
          },
        };
        const result = target.provider === 'claude'
          ? await claudeMcpLogin(target, entry.server, deps)
          : await codexMcpLogin(target, entry.server, deps);
        if (result.ok) done.push(who);
        else if (!result.cancelled) {
          failed.push(`${who}: ${result.message}`);
          this.host.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server} über ${who}: ${result.message}`);
        }
      }
    } finally {
      if (this.panel.pluginLogins.get(entry.server) === login) {
        this.panel.pluginLogins.delete(entry.server);
        this.panel.broadcastPluginLive();
      }
    }
    if (!done.length) {
      const message = abort.signal.aborted ? `Anmeldung bei ${entry.name} abgebrochen.` : `Anmeldung bei ${entry.name} nicht möglich — ${failed.join(' · ')}`;
      this.host.post(webview, { kind: 'pluginProgress', id, ok: abort.signal.aborted, message });
      return false;
    }
    if (failed.length) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: `${entry.name}: angemeldet für ${done.join(', ')} — nicht für ${failed.join(' · ')}` });
    }
    return true;
  }

  /**
   * Installieren heißt: erst verbinden, dann eintragen. Werte in den
   * Schlüsselbund, die Anmeldung im Browser, die Prüfung gegen die Definition
   * aus dem Katalog — und erst wenn der Server wirklich antwortet, die Zeile in
   * mcp.json und die Spiegelung in die Profile. Was nicht verbunden ist, steht
   * weder oben unter „Installiert“ noch in einem Profil.
   *
   * Nichts wird nur gemerkt: misslingt ein Schritt, sagt die Meldung das, und
   * mcp.json bleibt, wie sie war.
   */
  async changePlugin(
    webview: vscode.Webview,
    id: string,
    scope: PluginScope,
    install: boolean,
    values?: Record<string, string>,
  ): Promise<void> {
    const entry = this.panel.catalog().find(e => e.id === id);
    const place = this.panel.pluginScopes().find(s => s.id === scope);
    if (!entry || !place) return;
    const fail = (message: string) =>
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message });

    if (place.error) return fail(`${place.path} ist nicht lesbar: ${place.error}`);
    if (!install) return this.removePlugin(webview, entry, place.path);

    if (values && Object.keys(values).length) {
      try {
        await this.host.pluginCredentials.setValues(entry.server, values);
      } catch (e) {
        return fail(`Der Schlüsselbund hat die Werte nicht angenommen: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Schon eingetragen (etwa von Hand): dann gilt die Zeile in der Datei.
    const def = this.panel.definedServers()[entry.server] ?? entry.definition;
    if (entry.requires?.kind === 'oauth-client' && !this.host.pluginCredentials.client(entry.server)) {
      return fail(`Für ${entry.name} zuerst deinen OAuth-Client hinterlegen — danach meldet Cortex dich an und trägt es ein.`);
    }
    if (!this.panel.readyToCheck(entry, def) && !usesLogin(entry)) {
      return fail(`${entry.name}: es fehlt noch ${pluginFields(entry).length > 1 ? 'ein Wert' : 'der Schlüssel'}.`);
    }
    if (this.host.pluginSwitches.isDisabled(entry.server)) await this.host.pluginSwitches.set(entry.server, true);

    if (usesAgentLogin(entry)) return this.installWithAgents(webview, entry, place.path);

    if (usesLogin(entry) && !this.host.pluginCredentials.oauth(entry.server)) {
      const signedIn = await this.signIn(webview, entry, def);
      if (signedIn === false) return;
    }

    this.host.post(webview, { kind: 'pluginProgress', id, ok: true, message: `${entry.name}: Verbindung wird geprüft …` });
    await this.panel.checkPlugin(entry, true, def);
    const result = this.host.pluginConnections.get(entry.server);
    if (result?.status !== 'verbunden') {
      // Kein halber Eintrag: der Beleg einer gescheiterten Probe gehört zu
      // keinem installierten Plugin und würde beim nächsten Versuch nur stören.
      if (!this.panel.definedServers()[entry.server]) this.host.pluginConnections.forget(entry.server);
      const hint = entry.requires?.kind === 'app' ? ` ${entry.requires.hint}` : '';
      return fail(`${entry.name} ist nicht verbunden und wurde nicht eingetragen: ${result?.message ?? 'Der Server antwortet nicht.'}${hint}`);
    }

    try {
      await rewriteMcp(place.path, text => withServer(text, entry.server, entry.definition));
    } catch (e) {
      return fail(`${entry.name} ist verbunden, aber ${place.path} ließ sich nicht schreiben: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Erst jetzt spiegeln: der Bericht je Konto soll den neuen Stand zeigen.
    await this.panel.pushPlugins(webview, true);
    this.host.post(webview, {
      kind: 'pluginProgress', id, ok: true,
      message: connectedMessage(entry, result.tools?.length ?? 0),
    });
    void this.panel.sightInClis(entry.server);
  }

  /**
   * Hier geht es umgekehrt: die CLIs melden sich nur bei einem Server an, der in
   * ihrem Profil steht. Also erst eintragen und spiegeln, dann anmelden — und
   * gelingt keine Anmeldung, die Zeile wieder heraus.
   */
  async installWithAgents(webview: vscode.Webview, entry: PluginEntry, path: string): Promise<void> {
    const write = (change: (text: string) => string) => rewriteMcp(path, change);
    try {
      await write(text => withServer(text, entry.server, entry.definition));
    } catch (e) {
      this.host.post(webview, { kind: 'pluginProgress', id: entry.id, ok: false, message: `Konnte ${path} nicht schreiben: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    await this.panel.pushPlugins(webview, true);
    if (!(await this.signInWithAgents(webview, entry))) {
      await write(text => withoutServer(text, entry.server)).catch(() => undefined);
      this.host.pluginConnections.forget(entry.server);
      await this.panel.pushPlugins(webview, true);
      return;
    }
    await this.reportCheck(webview, entry);
  }

  async removePlugin(webview: vscode.Webview, entry: PluginEntry, path: string): Promise<void> {
    try {
      await rewriteMcp(path, text => withoutServer(text, entry.server));
    } catch (e) {
      this.host.post(webview, { kind: 'pluginProgress', id: entry.id, ok: false, message: `Konnte ${path} nicht schreiben: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    // Entfernen heißt auch: Schlüssel und Anmeldung weg. Ein Token, der
    // nirgends mehr gebraucht wird, soll nicht im Schlüsselbund liegen bleiben.
    this.panel.pluginLogins.get(entry.server)?.abort.abort();
    await this.host.pluginCredentials.clear(entry.server);
    this.host.pluginConnections.forget(entry.server);
    await this.panel.pushPlugins(webview, true);
    this.host.post(webview, { kind: 'pluginProgress', id: entry.id, ok: true, message: `${entry.name} entfernt.` });
  }

  /** Prüfen und das Ergebnis als Meldung sagen — der Abschluss jeder Einrichtung. */
  async reportCheck(webview: vscode.Webview, entry: PluginEntry): Promise<void> {
    this.host.post(webview, { kind: 'pluginProgress', id: entry.id, ok: true, message: `${entry.name}: Verbindung wird geprüft …` });
    await this.panel.checkPlugin(entry, true);
    const result = this.host.pluginConnections.get(entry.server);
    if (result?.status === 'verbunden') {
      this.host.post(webview, {
        kind: 'pluginProgress', id: entry.id, ok: true,
        message: connectedMessage(entry, result.tools?.length ?? 0),
      });
    } else if (result) {
      this.host.post(webview, {
        kind: 'pluginProgress', id: entry.id, ok: false,
        message: `${entry.name} ist eingetragen, antwortet aber nicht: ${result.message ?? 'unbekannter Fehler'}`,
      });
    }
  }

  async setPluginValues(webview: vscode.Webview, id: string, values: Record<string, string>): Promise<void> {
    const entry = this.panel.catalog().find(e => e.id === id);
    if (!entry) return;
    try {
      await this.host.pluginCredentials.setValues(entry.server, values);
    } catch (e) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: `Der Schlüsselbund hat die Werte nicht angenommen: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    if (!this.panel.definedServers()[entry.server]) return;
    this.panel.resyncProfiles();
    await this.reportCheck(webview, entry);
  }

  /** Neu anmelden bei einem eingetragenen Plugin — danach prüfen. */
  async loginPlugin(webview: vscode.Webview, id: string, account?: string): Promise<void> {
    const entry = this.panel.catalog().find(e => e.id === id);
    const def = entry && this.panel.definedServers()[entry.server];
    if (!entry || !def) return;
    if (account && usesAgentLogin(entry)) {
      // Grok meldet Cortex nirgends an: dort heißt die Zeile „Prüfen“.
      if (this.panel.cliTargets().some(t => t.provider === 'grok' && t.account === account)) return this.panel.checkGrokAccount(webview, entry, account);
      if (!(await this.signInWithAgents(webview, entry, account))) return;
      await this.reportCheck(webview, entry);
      return;
    }
    const signedIn = await this.signIn(webview, entry, def);
    if (signedIn === false) return;
    if (signedIn) {
      this.panel.resyncProfiles();
      await this.panel.pushPlugins(webview);
    }
    await this.reportCheck(webview, entry);
  }

  /**
   * Die Anmeldung im Browser bis zum Token im Schlüsselbund. `true`: angemeldet,
   * `undefined`: der Server verlangt gar keine, `false`: gescheitert — die
   * Meldung dazu ist dann schon gesagt.
   */
  async signIn(webview: vscode.Webview, entry: PluginEntry, def: McpServerDef): Promise<boolean | undefined> {
    if (usesAgentLogin(entry)) return this.signInWithAgents(webview, entry);
    const id = entry.id;
    const own = this.host.pluginCredentials.client(entry.server);
    // Ohne eigenen Client geht es nur über einen Remote-Server, der Cortex selbst registriert.
    if (!own && (!def.url || entry.requires?.kind === 'oauth-client')) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: `Für ${entry.name} zuerst Client-ID und Secret hinterlegen.` });
      return false;
    }
    if (this.panel.pluginLogins.has(entry.server)) return false;

    const abort = new AbortController();
    const login = { step: 'suche' as LoginStep['step'], message: 'Anmeldung wird vorbereitet …', abort, url: undefined as string | undefined };
    this.panel.pluginLogins.set(entry.server, login);
    this.panel.broadcastPluginLive();
    try {
      const deps = {
        // Als String, nicht als Uri: ein Uri-Objekt dekodiert VS Code und kodiert
        // die Query neu — ein `%26` oder `%2B` in einem Wert käme beim Anbieter
        // als Trennzeichen an. Einen String reicht der Host unverändert weiter,
        // so wie VS Codes eigene Anmeldung ihn übergibt.
        openExternal: (url: string) => vscode.env.openExternal(url as unknown as vscode.Uri),
        signal: abort.signal,
        onStep: (step: LoginStep) => {
          login.step = step.step;
          login.message = step.message;
          login.url = step.step === 'browser' ? step.url : undefined;
          this.panel.broadcastPluginLive();
        },
      };
      const stored = own
        ? await loginWithOwnClient({ url: def.url, client: own, delivery: entry.requires?.client }, deps)
        : await loginToServer(def.url!, deps);
      await this.host.pluginCredentials.setOAuth(entry.server, stored);
      return true;
    } catch (e) {
      const code = e instanceof OAuthError ? e.code : undefined;
      if (code === 'not_required') return undefined;
      if (code === 'registration_unsupported') {
        // Kein Fehler, den man wiederholen könnte: der Anbieter verlangt eine
        // eigene App. Die Seite bietet ab jetzt die Felder dafür an.
        await this.host.pluginCredentials.markClientRequired(entry.server);
        this.host.post(webview, {
          kind: 'pluginProgress', id, ok: false,
          message: `${entry.name} lässt keine automatische Registrierung zu. Lege in der Konsole des Anbieters eine App an und trage Client-ID und Secret ein.`,
        });
        return false;
      }
      if (code === 'registration_forbidden') {
        // Auch kein eigener Client hilft: der Anbieter wählt die Programme selbst
        // aus. Gibt es einen Zugang ohne diese Anmeldung, ist er der Ausweg.
        const other = this.panel.catalog().find(e => e.service && e.service === entry.service && e.id !== entry.id && !usesLogin(e));
        this.host.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server}: ${e instanceof Error ? e.message : String(e)}`);
        this.host.post(webview, {
          kind: 'pluginProgress', id, ok: false,
          message: `${entry.name} lässt über diesen Zugang nur Programme zu, die es selbst freigegeben hat — Cortex gehört nicht dazu.`,
          ...(other ? { action: { label: `Zu „${other.variantLabel ?? other.name}“`, open: other.id } } : {}),
        });
        return false;
      }
      const message = code === 'cancelled'
        ? `Anmeldung bei ${entry.name} abgebrochen.`
        : `Anmeldung bei ${entry.name} nicht möglich: ${e instanceof Error ? e.message : String(e)}`;
      this.host.output.appendLine(`[cortex] Plugin-Anmeldung ${entry.server}: ${e instanceof Error ? e.message : String(e)}`);
      this.host.post(webview, { kind: 'pluginProgress', id, ok: code === 'cancelled', message });
      return false;
    } finally {
      if (this.panel.pluginLogins.get(entry.server) === login) {
        this.panel.pluginLogins.delete(entry.server);
        this.panel.broadcastPluginLive();
      }
    }
  }

  /** Eine Client-Datei lesen — klein, JSON, sonst nichts. */
  async readPluginClientFile(webview: vscode.Webview, id: string, path: string): Promise<void> {
    const fail = (message: string) => this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message });
    if (!/\.json$/i.test(path)) return fail('Erwartet wird die JSON-Datei des OAuth-Clients.');
    try {
      const info = await stat(path);
      if (info.size > 64_000) return fail('Die Datei ist zu groß für eine Client-Datei.');
      const content = await readFile(path, 'utf8');
      await this.storePluginClient(webview, id, parseClientJson(content), basename(path));
    } catch (e) {
      fail(`Die Datei ließ sich nicht lesen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Den Client ablegen und — ist das Plugin installiert — gleich anmelden. Wer
   * Client-ID und Secret einträgt, will verbunden sein, nicht einen weiteren Knopf.
   */
  async storePluginClient(
    webview: vscode.Webview,
    id: string,
    parsed: ReturnType<typeof parseClientJson>,
    fileName?: string,
  ): Promise<void> {
    const entry = this.panel.catalog().find(e => e.id === id);
    if (!entry) return;
    if (!parsed.ok) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: parsed.error });
      return;
    }
    if (entry.requires?.client?.provider === 'google' && !/\.apps\.googleusercontent\.com$/.test(parsed.client.clientId)) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: 'Das ist keine Google-Client-ID — sie endet auf „.apps.googleusercontent.com“.' });
      return;
    }
    try {
      await this.host.pluginCredentials.setClient(entry.server, parsed.client, fileName);
    } catch (e) {
      this.host.post(webview, { kind: 'pluginProgress', id, ok: false, message: `Der Schlüsselbund hat den Client nicht angenommen: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    this.host.post(webview, {
      kind: 'pluginProgress', id, ok: true,
      message: `OAuth-Client${fileName ? ` aus ${fileName}` : ''} hinterlegt.`,
    });
    if (this.panel.definedServers()[entry.server] && !this.host.pluginCredentials.oauth(entry.server)) {
      await this.loginPlugin(webview, id);
    }
  }

  async logoutPlugin(webview: vscode.Webview, id: string): Promise<void> {
    const entry = this.panel.catalog().find(e => e.id === id);
    if (!entry) return;
    await this.host.pluginCredentials.clear(entry.server, 'anmeldung');
    this.host.pluginConnections.forget(entry.server);
    this.panel.resyncProfiles();
    this.host.post(webview, { kind: 'pluginProgress', id, ok: true, message: `Von ${entry.name} abgemeldet — der Token ist aus Cortex und allen Profilen entfernt.` });
  }
}
