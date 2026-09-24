import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  parseCatalog,
  pluginFields,
  readSkills,
  syncMcpToProfile,
  usesAgentLogin,
  usesLogin,
  type AdapterRegistry,
  type CliSight,
  type McpServerDef,
  type PluginEntry,
  type ResolvedAccount,
} from '@cortex/core';
import {
  CONNECTOR_NAME,
  connectorIdentity,
  currentStudioHost,
  STUDIO_WANTED_KEY,
  databaseStudioServer,
  loadConnectorIdentity,
} from '../../../database/index.js';
import { AGENT_LOGIN_PROVIDERS, claudeMcpSight, grokConnectorSight } from '../../../plugins/agentLogin.js';
import { checkApp, checkApps } from '../../../plugins/appChecks.js';
import { sightInClis, type CliTarget } from '../../../plugins/cliSight.js';
import type { PluginConnections } from '../../../plugins/connections.js';
import type { PluginCredentials } from '../../../plugins/credentials.js';
import type { LoginStep } from '../../../plugins/oauthLogin.js';
import { mirrorToProfiles, profileServers } from '../../../plugins/profileServers.js';
import { effectiveMcp, readScopes } from '../../../plugins/scopes.js';
import type { PluginSwitches } from '../../../plugins/switches.js';
import type { BuiltInConnectorDto, PluginLiveState, PluginScopeState } from '../../protocol.js';
import { XCODE_READINESS } from '../../xcode.js';
import type { PanelHost } from '../dispatch.js';

export interface PluginPanelHost extends PanelHost {
  readonly adapters: AdapterRegistry;
  readonly pluginCredentials: PluginCredentials;
  readonly pluginConnections: PluginConnections;
  readonly pluginSwitches: PluginSwitches;
}

/**
 * Die Plugin-Seite: Katalog, beide mcp.json, der Live-Zustand von Anmeldung
 * und Prüfung, und die Prüfungen selbst. Einrichten, Entfernen und Anmelden
 * stehen in pluginSetup.ts.
 */
export class PluginPanel {
  constructor(readonly host: PluginPanelHost) {}

  /**
   * Der ausgelieferte Plugin-Katalog. Er ändert sich nur mit einem Build, wird
   * also einmal gelesen und behalten. Fällt er aus, bleibt die Seite leer statt
   * halb gefüllt — ein halber Katalog wäre schlechter als ein sichtbar leerer.
   */
  private catalogCache?: PluginEntry[];
  catalog(): PluginEntry[] {
    if (this.catalogCache) return this.catalogCache;
    try {
      const file = vscode.Uri.joinPath(this.host.ctx.extensionUri, 'media', 'plugins', 'catalog.json');
      const parsed = parseCatalog(readFileSync(file.fsPath, 'utf8'));
      this.catalogCache = parsed.ok ? parsed.catalog.entries : [];
    } catch {
      this.catalogCache = [];
    }
    return this.catalogCache;
  }

  /**
   * Beide möglichen Orte für mcp.json — nicht nur der gerade gewinnende. Wer
   * einen Server einträgt, muss sehen können, ob er im Projekt landet oder
   * überall gilt.
   */
  pluginScopes(): PluginScopeState[] {
    return readScopes();
  }

  /** Wo Skills wirklich liegen: in den verwalteten Profilen und beim Nutzer selbst. */
  skillRoots(): string[] {
    const roots = [join(homedir(), '.claude', 'skills'), join(homedir(), '.cortex', 'skills')];
    for (const account of this.host.accounts.all()) {
      if (account.homeDir) roots.push(join(account.homeDir, '.claude', 'skills'));
    }
    return [...new Set(roots)];
  }

  /**
   * Der Zustand der Plugin-Seite. Über die Leitung geht nur, was sich ändern
   * kann — der Katalog selbst liegt im Bündel des Webviews.
   */
  async pushPlugins(webview: vscode.Webview, sync = false): Promise<void> {
    const scopes = this.pluginScopes();
    const effective = effectiveMcp(scopes);
    const defined = effective.servers;
    // Gespiegelt wird immer die volle Menge: `syncMcpToProfile` entfernt jeden
    // Server, der nicht im übergebenen Satz steht — den eingebauten hier
    // wegzulassen hieße, ihn bei jedem Übertragen aus den Profilen zu werfen.
    // Die Zugangsdaten gehen dabei mit; ohne sie nähme jede Spiegelung einem
    // verbundenen Plugin den Zugang.
    const servers = profileServers(defined);
    if (sync) void this.host.ctx.globalState.update(STUDIO_WANTED_KEY, true);
    const accounts = this.host.accounts.all().map(account => ({
      provider: account.provider,
      label: account.label,
      error: sync ? syncMcpToProfile(account, servers) : undefined,
    }));
    // Beim Öffnen: was lange nicht geprüft wurde, wird es jetzt — vor dem
    // Senden angestoßen, damit die Seite gleich „Prüfe …“ zeigt statt kurz
    // „Nicht geprüft“. Das Ergebnis kommt als `pluginLive` nach.
    if (!sync) this.checkStalePlugins();
    this.host.post(webview, {
      kind: 'plugins',
      scopes,
      builtIn: await this.builtInConnector(Object.keys(defined)),
      skills: [...readSkills(this.skillRoots())],
      accounts,
      apps: await checkApps(),
      origin: effective.origin,
      shadowed: effective.shadowed,
      ...this.pluginLive(),
    });
  }

  pluginLogChannel?: vscode.OutputChannel;

  pluginLogins = new Map<string, { step: LoginStep['step']; message: string; url?: string; account?: string; abort: AbortController }>();

  pluginLive(): PluginLiveState {
    return {
      credentials: this.host.pluginCredentials.state(),
      connections: this.host.pluginConnections.all(),
      logins: Object.fromEntries(
        [...this.pluginLogins].map(([server, { step, message, url, account }]) => [server, { step, message, url, account }]),
      ),
      disabled: this.host.pluginSwitches.disabled(),
    };
  }

  broadcastPluginLive(): void {
    const live = { kind: 'pluginLive' as const, ...this.pluginLive() };
    this.host.broadcast(live);
  }

  /** Was aus beiden mcp.json gilt — dieselbe Zusammenführung wie beim Spiegeln. */
  definedServers(): Record<string, McpServerDef> {
    return effectiveMcp().servers;
  }

  /** Die Profile neu schreiben, ohne dass eine bestimmte Fläche den Bericht braucht. */
  resyncProfiles(): void {
    void this.host.ctx.globalState.update(STUDIO_WANTED_KEY, true);
    const servers = profileServers(this.definedServers());
    for (const { account, error } of mirrorToProfiles(this.host.accounts.all(), servers)) {
      if (error) this.host.output.appendLine(`[cortex] Plugin-Spiegelung (${account.label}): ${error}`);
    }
  }

  /**
   * Ob sich eine Prüfung überhaupt lohnt. Fehlt ein Pflichtwert oder die
   * Anmeldung, weiß die Seite schon, was zu tun ist — ein Prozess, der ohne
   * Schlüssel startet und stirbt, sagt nichts Neues.
   */
  readyToCheck(entry: PluginEntry, def: McpServerDef): boolean {
    const values = this.host.pluginCredentials.values(entry.server);
    const missing = pluginFields(entry).some(f => !f.optional && !values[f.env] && !def.env?.[f.env]?.trim());
    if (missing) return false;
    if (usesLogin(entry) && !this.host.pluginCredentials.oauth(entry.server)) return false;
    if (entry.requires?.kind === 'oauth-client' && !this.host.pluginCredentials.client(entry.server)) return false;
    return true;
  }

  /**
   * Einen installierten Eintrag prüfen. `force` ist der ausdrückliche Klick:
   * er prüft auch frische Ergebnisse und auch Einträge, deren Programm beim
   * Start selbst nachfragt (Xcode) — die prüft das bloße Öffnen der Seite nie.
   */
  async checkPlugin(entry: PluginEntry, force: boolean, def = this.definedServers()[entry.server]): Promise<void> {
    if (!def || !this.readyToCheck(entry, def) || this.host.pluginSwitches.isDisabled(entry.server)) return;
    if (usesAgentLogin(entry)) {
      await this.checkWithAgents(entry);
      return;
    }
    // Ein Programm, das beim Zugriff selbst nachfragt, spricht Cortex von sich
    // aus nur an, wenn es ohnehin läuft — gestartet wird es nie.
    if (!force && entry.requires?.kind === 'app') {
      const app = await checkApp(entry.requires.check);
      if (!app?.running) return;
    }
    this.host.pluginConnections.begin(entry.server);
    // Ein bald ablaufender Token wird vorher aufgefrischt — sonst prüfte die
    // Seite genau den Token, den der nächste Zug ohnehin nicht mehr benutzt.
    if (usesLogin(entry) && (await this.host.pluginCredentials.refresh(entry.server))) {
      this.resyncProfiles();
    }
    // npx lädt beim ersten Mal ein Paket; eine App-Brücke wie Xcode antwortet
    // sofort oder gar nicht — dort lohnt kein langes Warten.
    const timeout = def.command === 'npx' || def.command === 'docker' ? 180_000 : entry.requires?.kind === 'app' ? 30_000 : undefined;
    const readiness = entry.requires?.check === 'xcode' ? XCODE_READINESS : undefined;
    const result = await this.host.pluginConnections.check(entry.server, this.host.pluginCredentials.apply(entry.server, def), timeout, readiness);
    // Abgelehnt trotz Token: einmal auffrischen und nachprüfen, bevor die Seite
    // „Neu anmelden“ verlangt. Viele Anbieter widerrufen Tokens früher, als ihre
    // Laufzeit sagt.
    if (result.status === 'anmeldung' && this.host.pluginCredentials.oauth(entry.server)) {
      if (await this.host.pluginCredentials.refresh(entry.server, true)) {
        this.resyncProfiles();
        if (this.host.pluginCredentials.oauth(entry.server)) {
          await this.host.pluginConnections.check(entry.server, this.host.pluginCredentials.apply(entry.server, def));
        }
      }
    }
    if (force) await this.sightInClis(entry.server);
  }

  /**
   * Ein Server ohne Katalogeintrag — selbst in mcp.json geschrieben oder der
   * eingebaute Database-Studio-Konnektor. Er bekommt dieselbe Prüfung wie jedes
   * Plugin; die CLIs starten ihn in jedem Zug ohnehin.
   */
  async checkServer(name: string, force: boolean): Promise<void> {
    const entry = this.catalog().find(e => e.server === name);
    if (entry) return this.checkPlugin(entry, force);
    if (this.host.pluginSwitches.isDisabled(name)) return;
    const def = profileServers(this.definedServers())[name];
    if (!def) return;
    this.host.pluginConnections.begin(name);
    const timeout = def.command === 'npx' || def.command === 'docker' ? 180_000 : undefined;
    await this.host.pluginConnections.check(name, def, timeout);
    if (force) await this.sightInClis(name);
  }

  checkStalePlugins(): void {
    const defined = profileServers(this.definedServers());
    const catalogServers = new Set(this.catalog().map(e => e.server));
    for (const entry of this.catalog()) {
      if (defined[entry.server] && this.host.pluginConnections.isStale(entry.server)) void this.checkPlugin(entry, false);
    }
    for (const name of Object.keys(defined)) {
      if (!catalogServers.has(name) && this.host.pluginConnections.isStale(name)) void this.checkServer(name, false);
    }
  }

  /** Die CLIs der Konten, deren Profile Cortex beschreibt — mit genau der Umgebung, mit der Cortex sie startet. */
  cliTargets(): CliTarget[] {
    return this.host.accounts.all().flatMap(account => {
      if (account.disabled || !account.homeDir) return [];
      if (account.provider !== 'claude' && account.provider !== 'codex' && account.provider !== 'grok') return [];
      if (account.provider === 'claude' && account.authMode !== 'managed-home') return [];
      const adapter = this.host.adapters.get(account.provider);
      if (!adapter) return [];
      const { command, env } = adapter.interactiveCommand({ ...account, secret: undefined } as ResolvedAccount);
      return command[0] ? [{ provider: account.provider, label: account.label, account: account.id, command: command[0], env }] : [];
    });
  }

  /** Nur nach einer erfolgreichen Prüfung: ein Server, der nicht antwortet, antwortet auch der CLI nicht. */
  async sightInClis(server: string): Promise<void> {
    if (this.host.pluginConnections.get(server)?.status !== 'verbunden') return;
    const targets = this.cliTargets();
    if (!targets.length) return;
    this.host.pluginConnections.attachClis(server, targets.map(t => ({ provider: t.provider, label: t.label, state: 'eingetragen', detail: 'Wird gefragt …' })), true);
    const sights = await sightInClis(server, targets);
    this.host.pluginConnections.attachClis(server, sights);
  }

  /** Die CLIs, die sich selbst bei einem Anbieter anmelden können — auf Wunsch nur ein Konto. */
  agentTargets(account?: string): CliTarget[] {
    return this.cliTargets().filter(t => AGENT_LOGIN_PROVIDERS.includes(t.provider) && (!account || t.account === account));
  }

  /** Was Grok zuletzt auf ausdrücklichen Klick über seine Konto-Konnektoren gesagt hat — je Server und Konto. */
  private grokSights = new Map<string, CliSight>();

  /**
   * Prüfen, wo nur die CLIs an den Server kommen: Cortex hat kein Token und
   * fragt jedes Konto einzeln. Verbunden heißt, mindestens eines ist es. Grok
   * wird hier nie gefragt (das kostet einen Modellaufruf) — seine Zeile trägt
   * das Ergebnis des letzten Klicks auf „Prüfen“.
   */
  async checkWithAgents(entry: PluginEntry): Promise<void> {
    const targets = this.agentTargets();
    const groks = this.cliTargets().filter(t => t.provider === 'grok');
    const previous = this.host.pluginConnections.get(entry.server)?.clis ?? [];
    await this.host.pluginConnections.checkWith(entry.server, async () => {
      const checkedAt = Date.now();
      if (!targets.length && !groks.length) {
        return { status: 'fehler', checkedAt, message: `${entry.name} läuft über Claude Code, Codex oder Grok — dafür fehlt ein Konto.` };
      }
      const results = await Promise.all(targets.map(async target => {
        if (target.provider === 'claude') return claudeMcpSight(target, entry.server);
        const [sight] = await sightInClis(entry.server, [target]);
        // Für Codex heißt „angemeldet“ hier verbunden: prüfen kann es erst ein Zug.
        const loggedIn = sight!.state === 'eingetragen' && /angemeldet/.test(sight!.detail ?? '');
        return { sight: loggedIn ? { ...sight!, state: 'verbunden' as const, detail: 'In Codex angemeldet.' } : sight!, tools: undefined };
      }));
      const grokRows = groks.map(t =>
        this.grokSights.get(`${entry.server}:${t.account}`)
        ?? previous.find(c => c.account === t.account && c.provider === 'grok' && c.state !== 'eingetragen')
        ?? { provider: 'grok', label: t.label, account: t.account, state: 'eingetragen' as const, detail: `Noch nicht geprüft — Grok nutzt den ${entry.name}-Konnektor seines Kontos.` });
      const clis = [...results.map(r => r.sight), ...grokRows];
      const tools = results.find(r => r.tools?.length)?.tools;
      if (clis.some(c => c.state === 'verbunden')) {
        return { status: 'verbunden', checkedAt, tools: (tools ?? []).map(name => ({ name })), clis };
      }
      return { status: 'anmeldung', checkedAt, message: `In keinem Konto bei ${entry.name} angemeldet.`, clis };
    });
  }

  /** Grok einzeln fragen, ob der Konnektor in seinem Konto steckt — nur auf Klick. */
  async checkGrokAccount(webview: vscode.Webview, entry: PluginEntry, account: string): Promise<void> {
    const target = this.cliTargets().find(t => t.provider === 'grok' && t.account === account);
    if (!target || this.pluginLogins.has(entry.server)) return;
    const login = { step: 'suche' as LoginStep['step'], message: `Grok (${target.label}) wird gefragt …`, account, abort: new AbortController(), url: undefined };
    this.pluginLogins.set(entry.server, login);
    this.broadcastPluginLive();
    try {
      const { sight } = await grokConnectorSight(target, entry.server);
      this.grokSights.set(`${entry.server}:${account}`, sight);
    } finally {
      if (this.pluginLogins.get(entry.server) === login) this.pluginLogins.delete(entry.server);
      this.broadcastPluginLive();
    }
    await this.checkWithAgents(entry);
    await this.pushPlugins(webview);
  }

  /**
   * Database Studio ist kein Eintrag in mcp.json, sondern die Integration
   * selbst: sie wird beim Spiegeln dazugelegt und lässt sich nicht durch
   * Löschen aus der Datei entfernen, sondern nur über
   * `cortex.databaseStudio.enabled` abschalten. Genau so steht sie auf der
   * Seite — sichtbar, aber ohne Installieren-Knopf.
   *
   * Name, Beschreibung und Symbol kommen aus `studio-mcp` selbst, damit die
   * Plugin-Seite und der MCP-Handschlag nicht auseinanderlaufen.
   */
  async builtInConnector(definedNames: string[]): Promise<BuiltInConnectorDto | undefined> {
    const host = currentStudioHost();
    const server = databaseStudioServer(host);
    // Abgeschaltet oder nicht installiert: dann gibt es nichts zu melden.
    if (!server) return undefined;
    const identity = (await loadConnectorIdentity()) ?? connectorIdentity();
    return {
      name: CONNECTOR_NAME,
      title: identity?.title ?? 'Vektor',
      description: identity?.description ?? 'Datenbanken in Cortex öffnen und abfragen.',
      icon: identity?.icon,
      target: server.url ?? [server.command, ...(server.args ?? [])].filter(Boolean).join(' '),
      running: host?.running === true,
      sessions: host?.sessionCount ?? 0,
      overridden: definedNames.includes(CONNECTOR_NAME),
    };
  }
}
