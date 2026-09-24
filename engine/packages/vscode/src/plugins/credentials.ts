import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  authorizationHeader,
  expiresWithin,
  googleClientJson,
  googleTokenJson,
  missingRequired,
  OAuthError,
  refreshTokens,
  withCredentials,
  type ClientDelivery,
  type McpServerDef,
  type OwnClient,
  type PluginCredentialState,
  type PluginField,
  type StoredOAuth,
} from '@cortex/core';
import type { SecretBackend } from '../storage/secrets.js';

/**
 * Was ein Plugin an Zugangsdaten braucht, liegt im Schlüsselbund — nicht in
 * mcp.json. Die Datei kann in einem Projekt liegen und mit ihm geteilt werden;
 * ein API-Schlüssel oder ein Refresh-Token darf das nie.
 *
 * Beim Übertragen in die Profile unter ~/.cortex/profiles (0700) werden die
 * Werte eingesetzt: dort liest jede CLI sie so, wie sie es gewohnt ist. Das ist
 * derselbe Weg, auf dem Database Studio seinen Token bekommt.
 *
 * Gehalten wird ein einziger Eintrag. SecretStorage kann nicht aufzählen, und
 * ein Index daneben würde irgendwann von dem abweichen, was wirklich gespeichert
 * ist.
 */

export type { SecretBackend } from '../storage/secrets.js';

interface ServerCredentials {
  values?: Record<string, string>;
  oauth?: StoredOAuth & { expired?: boolean };
  /** Ein eigener OAuth-Client, aus zwei Feldern oder einer hochgeladenen Datei. */
  client?: OwnClient & { fileName?: string };
  /** Der Anbieter hat die Selbstregistrierung abgelehnt. */
  clientRequired?: boolean;
}

/**
 * Wo die Dateien liegen, die ein Server als Pfad erwartet. Außerhalb der
 * Profile, weil mehrere Profile denselben Server bekommen; nur für dich lesbar.
 */
const PLUGIN_FILES = join(homedir(), '.cortex', 'plugin-files');

const KEY = 'cortex.plugins.credentials';
/** So lange vor Ablauf wird aufgefrischt: ein Zug, der jetzt beginnt, soll nicht mittendrin scheitern. */
const REFRESH_WINDOW_MS = 15 * 60_000;

export class PluginCredentials {
  private data: Record<string, ServerCredentials> = {};
  private listeners: Array<() => void> = [];
  private refreshing = new Map<string, Promise<boolean>>();
  private subscription: { dispose(): void };

  /** Wie ein Server Client und Token bekommt — aus dem Katalog, vom Host gesetzt. */
  private deliveries: (server: string) => ClientDelivery | undefined = () => undefined;

  constructor(
    private secrets: SecretBackend,
    private doFetch: typeof fetch = fetch,
    private filesRoot = PLUGIN_FILES,
  ) {
    // Ein anderes Fenster hat angemeldet oder aufgefrischt: dann gilt dessen Stand.
    this.subscription = secrets.onDidChange((event) => {
      if (event.key === KEY) void this.load().then(() => this.emit());
    });
  }

  setDeliveries(lookup: (server: string) => ClientDelivery | undefined): void {
    this.deliveries = lookup;
  }

  /** Welche Werte ein Server braucht — aus dem Katalog, vom Host gesetzt. */
  private requirements: (server: string) => PluginField[] = () => [];

  setRequirements(lookup: (server: string) => PluginField[]): void {
    this.requirements = lookup;
  }

  /** Pflichtwerte, die nach dem Einsetzen der hinterlegten Werte noch fehlen. */
  missing(server: string, applied: McpServerDef): string[] {
    return missingRequired(applied, this.requirements(server));
  }

  dispose(): void {
    this.subscription.dispose();
    this.listeners = [];
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  async load(): Promise<void> {
    const raw = await this.secrets.get(KEY);
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      this.data = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, ServerCredentials>)
        : {};
    } catch {
      this.data = {};
    }
  }

  private async save(): Promise<void> {
    // Leere Einträge räumen sich selbst weg.
    for (const [name, entry] of Object.entries(this.data)) {
      if (!entry.oauth && !entry.client && !entry.clientRequired && !Object.keys(entry.values ?? {}).length) {
        delete this.data[name];
      }
    }
    await this.secrets.store(KEY, JSON.stringify(this.data));
    this.emit();
  }

  /** Nur Namen und Zeitpunkte — nichts davon ist geheim, alles davon geht an die Oberfläche. */
  state(): Record<string, PluginCredentialState> {
    return Object.fromEntries(
      Object.entries(this.data).map(([name, entry]) => [
        name,
        {
          fields: Object.keys(entry.values ?? {}),
          oauth: entry.oauth
            ? {
                connectedAt: entry.oauth.connectedAt,
                expiresAt: entry.oauth.tokens.expiresAt,
                refreshable: !!entry.oauth.tokens.refreshToken,
                expired: entry.oauth.expired || undefined,
              }
            : undefined,
          client: entry.client
            ? {
                clientId: entry.client.clientId,
                hasSecret: !!entry.client.clientSecret,
                fileName: entry.client.fileName,
                projectId: entry.client.projectId,
              }
            : undefined,
          clientRequired: entry.clientRequired || undefined,
        },
      ]),
    );
  }

  values(server: string): Record<string, string> {
    return { ...(this.data[server]?.values ?? {}) };
  }

  oauth(server: string): StoredOAuth | undefined {
    const stored = this.data[server]?.oauth;
    return stored && !stored.expired ? stored : undefined;
  }

  /**
   * Werte setzen. Ein leerer String löscht den Wert — so kann die Oberfläche
   * ein Feld leeren, ohne die anderen anzufassen.
   */
  async setValues(server: string, values: Record<string, string>): Promise<void> {
    await this.load();
    const next = { ...(this.data[server]?.values ?? {}) };
    for (const [name, value] of Object.entries(values)) {
      const trimmed = value.trim();
      if (trimmed) next[name] = trimmed;
      else delete next[name];
    }
    this.data[server] = { ...this.data[server], values: next };
    await this.save();
  }

  client(server: string): OwnClient | undefined {
    return this.data[server]?.client;
  }

  /**
   * Einen eigenen Client ablegen. Ein neuer Client macht die alte Anmeldung
   * wertlos — ihr Refresh-Token gehört zum alten —, also geht sie mit.
   */
  async setClient(server: string, client: OwnClient, fileName?: string): Promise<void> {
    await this.load();
    const previous = this.data[server];
    const same = previous?.client?.clientId === client.clientId && previous.client.clientSecret === client.clientSecret;
    this.data[server] = {
      ...previous,
      client: { ...client, ...(fileName ? { fileName } : {}) },
      ...(same ? {} : { oauth: undefined }),
    };
    await this.save();
  }

  async markClientRequired(server: string): Promise<void> {
    await this.load();
    this.data[server] = { ...this.data[server], clientRequired: true };
    await this.save();
  }

  async setOAuth(server: string, stored: StoredOAuth): Promise<void> {
    await this.load();
    this.data[server] = { ...this.data[server], oauth: stored };
    await this.save();
  }

  async clear(server: string, what: 'alles' | 'anmeldung' | 'client' = 'alles'): Promise<void> {
    await this.load();
    const entry = this.data[server];
    if (what === 'alles') {
      delete this.data[server];
      rmSync(join(this.filesRoot, safeName(server)), { recursive: true, force: true });
    } else if (entry && what === 'anmeldung') {
      delete entry.oauth;
      rmSync(join(this.filesRoot, safeName(server), 'token.json'), { force: true });
    } else if (entry && what === 'client') {
      delete entry.client;
      delete entry.oauth;
      rmSync(join(this.filesRoot, safeName(server)), { recursive: true, force: true });
    }
    await this.save();
  }

  /** Die Definition, wie eine CLI sie bekommen soll. */
  apply(name: string, def: McpServerDef): McpServerDef {
    const oauth = this.oauth(name);
    const delivered = def.command ? this.deliver(name) : {};
    // Ein lokaler Server bekommt den Token so, wie der Katalog es sagt — nie als
    // HTTP-Header, den er gar nicht lesen würde.
    const header = def.url && oauth ? authorizationHeader(oauth.tokens) : undefined;
    return withCredentials(def, { ...this.values(name), ...delivered }, header);
  }

  /**
   * Client und Token für einen lokalen Server: Variablen setzen, Dateien
   * schreiben. Geschrieben wird nur, was sich geändert hat — die Spiegelung
   * läuft oft, und ein Server, der die Datei gerade liest, soll keine halbe sehen.
   */
  private deliver(server: string): Record<string, string> {
    const delivery = this.deliveries(server);
    const client = this.data[server]?.client;
    if (!delivery || !client) return {};
    const oauth = this.oauth(server);
    const env: Record<string, string> = {};
    const dir = join(this.filesRoot, safeName(server));
    const write = (file: string, content: string) => {
      const path = join(dir, file);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      chmodSync(dir, 0o700);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
        writeFileSync(`${path}.neu`, content, { mode: 0o600 });
        // Umbenennen ist atomar: der Server sieht die alte oder die neue Datei.
        renameSync(`${path}.neu`, path);
      }
      chmodSync(path, 0o600);
      return path;
    };
    if (delivery.clientFile) env[delivery.clientFile] = write('client.json', googleClientJson(client));
    if (delivery.clientIdEnv) env[delivery.clientIdEnv] = client.clientId;
    if (delivery.clientSecretEnv && client.clientSecret) env[delivery.clientSecretEnv] = client.clientSecret;
    if (oauth) {
      if (delivery.tokenFile) env[delivery.tokenFile] = write('token.json', googleTokenJson(oauth.tokens));
      if (delivery.accessTokenEnv) env[delivery.accessTokenEnv] = oauth.tokens.accessToken;
      if (delivery.refreshTokenEnv && oauth.tokens.refreshToken) env[delivery.refreshTokenEnv] = oauth.tokens.refreshToken;
    }
    return env;
  }

  applyAll(servers: Record<string, McpServerDef>): Record<string, McpServerDef> {
    return Object.fromEntries(Object.entries(servers).map(([name, def]) => [name, this.apply(name, def)]));
  }

  /**
   * Frischt einen Token auf. Zwei Fenster können das gleichzeitig wollen; wer
   * zu spät kommt, findet beim Neuladen den frischen Token des anderen und
   * erklärt die Anmeldung nicht wegen eines schon verbrauchten Refresh-Tokens
   * für abgelaufen.
   *
   * Gibt zurück, ob sich etwas geändert hat.
   */
  refresh(server: string, force = false): Promise<boolean> {
    const running = this.refreshing.get(server);
    if (running) return running;
    const task = (async () => {
      await this.load();
      const stored = this.oauth(server);
      if (!stored) return false;
      if (!force && !expiresWithin(stored.tokens, REFRESH_WINDOW_MS)) return false;
      try {
        const tokens = await refreshTokens(stored, this.doFetch);
        await this.load();
        this.data[server] = { ...this.data[server], oauth: { ...stored, tokens } };
        await this.save();
        return true;
      } catch (error) {
        await this.load();
        const now = this.data[server]?.oauth;
        if (now && now.tokens.accessToken !== stored.tokens.accessToken) return true;
        if (error instanceof OAuthError && (error.code === 'invalid_grant' || error.code === 'invalid_client')) {
          if (now) {
            now.expired = true;
            await this.save();
          }
          return true;
        }
        // Netzwerk oder Serverfehler: der alte Token bleibt, der nächste Durchlauf versucht es wieder.
        return false;
      }
    })().finally(() => this.refreshing.delete(server));
    this.refreshing.set(server, task);
    return task;
  }

  /** Alle bald ablaufenden Tokens. Gibt zurück, ob sich irgendetwas geändert hat. */
  async refreshDue(): Promise<boolean> {
    const results = await Promise.all(Object.keys(this.data).map((server) => this.refresh(server)));
    return results.some(Boolean);
  }
}

// ---------------------------------------------------------------------------

/** Ein Servername als Ordnername — ohne Pfadtrenner, ohne `..`. */
function safeName(server: string): string {
  return server.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/^\.+/, '_');
}

let current: PluginCredentials | undefined;

export function setPluginCredentials(credentials: PluginCredentials | undefined): void {
  current = credentials;
}

/**
 * Wie beim Studio-Host: die Spiegelung passiert an Stellen, die keinen Grund
 * haben, einen Schlüsselbund gereicht zu bekommen — die Chat-Ansicht, die
 * Befehlspalette, der Start. Eine Modulreferenz ist der kleinere Preis.
 */
export function currentPluginCredentials(): PluginCredentials | undefined {
  return current;
}
