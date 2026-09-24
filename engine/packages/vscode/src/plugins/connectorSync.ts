import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONNECTOR_NAME, loadConnectorIdentity, registerDatabaseStudio } from '../database/index.js';
import { STUDIO_WANTED_KEY } from '../database/connector.js';
import type { AccountStore } from '../storage/accountStore.js';
import { archiveOrphanProfiles } from '../storage/profileArchive.js';
import type { PluginCredentials } from './credentials.js';
import { mirrorToProfiles, profileServers } from './profileServers.js';
import { effectiveMcp } from './scopes.js';

export interface ConnectorSyncDeps {
  output: vscode.OutputChannel;
  accounts: AccountStore;
  pluginCredentials: PluginCredentials;
  /** Erst danach wird gespiegelt — vorher fehlten Schlüssel und Tokens. */
  credentialsReady: Promise<void>;
}

/**
 * Hält die Konnektoren in den Anbieterprofilen aktuell: beim Start, beim
 * Auffrischen der Anmelde-Tokens, bei geänderter Browser-Freigabe und wenn
 * Database Studio erreichbar wird. Räumt dabei Profilordner ohne Konto ins
 * Archiv. Die Reihenfolge der Schritte ist die des Starts.
 */
export function startConnectorSync(ctx: vscode.ExtensionContext, { output, accounts, pluginCredentials, credentialsReady }: ConnectorSyncDeps): void {
  // Database Studio is Cortex's database integration: a source opens as a tab,
  // and the agent's connector points at that same open source.
  //
  // Nothing is written into a profile on its own. The connector appears on the
  // plugins page, and mirroring it is a decision made there. Once it has been
  // mirrored, though, it is kept current: the host's address changes with every
  // Cortex start, and a profile left holding the old one would send the agent
  // to a port that is no longer listening.
  const syncConnectorsNow = (withStudio = true) => {
    // Beide Dateien zusammen: persönliche Server gelten überall, das Projekt
    // ergänzt und überschreibt gleichnamige.
    const effective = effectiveMcp();
    for (const error of effective.errors) output.appendLine(`[cortex] mcp.json ungültig — ${error}`);
    const defined = effective.servers;

    const servers = profileServers(defined);
    if (!withStudio && !(CONNECTOR_NAME in defined)) delete servers[CONNECTOR_NAME];
    for (const { account, error } of mirrorToProfiles(accounts.all(), servers)) {
      if (error) output.appendLine(`[cortex] Konnektor-Spiegelung (${account.label}): ${error}`);
    }
  };
  const syncConnectors = () => void credentialsReady.then(() => syncConnectorsNow());

  // Anmelde-Tokens laufen ab, oft nach einer Stunde. Cortex frischt sie vorher
  // auf und schreibt sie neu in die Profile: jeder Zug startet seine CLI frisch
  // und liest dabei den gültigen Token. Einen Browser öffnet das nie — ist das
  // Auffrischen endgültig gescheitert, steht das Plugin auf „Neu anmelden“.
  const refreshPluginTokens = async () => {
    await credentialsReady;
    if (await pluginCredentials.refreshDue()) syncConnectorsNow();
  };
  void refreshPluginTokens();
  // Was schon in den Profilen steht, wird beim Start auf den Stand dieser
  // Fassung gebracht: ein Update kann eine Definition ändern — etwa den
  // Zwischenserver vor YouTube —, und ohne diesen Lauf käme sie erst beim
  // nächsten Token-Auffrischen an. Den eingebauten Konnektor trägt das nicht
  // ungefragt ein; ob er gespiegelt wird, entscheidet die Plugin-Seite.
  // Einmal gespiegelt heißt: gewollt — auch wenn der Konnektor gerade draußen
  // bleibt, weil Vektor nicht läuft. Sonst käme er nie mehr zurück.
  const studioWanted = () => ctx.globalState.get<boolean>(STUDIO_WANTED_KEY) === true || connectorWasMirrored(accounts.all());
  if (connectorWasMirrored(accounts.all())) void ctx.globalState.update(STUDIO_WANTED_KEY, true);
  void credentialsReady.then(() => syncConnectorsNow(studioWanted()));
  const tokenTimer = setInterval(() => void refreshPluginTokens(), 5 * 60_000);
  ctx.subscriptions.push({ dispose: () => clearInterval(tokenTimer) });

  // Browser-Freigabe geändert: die Browser-Plugins laufen ab dem nächsten Zug
  // mit oder ohne Fenster, also sofort neu in die Profile.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cortex.browserAccess')) void credentialsReady.then(() => syncConnectorsNow(studioWanted()));
    }),
  );

  // Profilordner ohne Konto ins Archiv — nicht löschen, die Anmeldung darin bleibt wiederherstellbar.
  for (const moved of archiveOrphanProfiles(accounts.all().map((a) => a.homeDir).filter((d): d is string => !!d))) {
    output.appendLine(`[cortex] Profil ohne Konto archiviert: ${moved}`);
  }

  registerDatabaseStudio(ctx, output, () => {
    if (studioWanted()) syncConnectors();
  });
  void loadConnectorIdentity();
}

/**
 * Whether the built-in connector already sits in at least one profile.
 *
 * `syncMcpToProfile` leaves a manifest of what it wrote, which makes this
 * answerable without keeping a second record that could fall out of step with
 * the profiles themselves.
 */
function connectorWasMirrored(accounts: Array<{ homeDir?: string }>): boolean {
  return accounts.some((account) => {
    if (!account.homeDir) return false;
    try {
      const raw = readFileSync(join(account.homeDir, '.cortex-mcp.json'), 'utf8');
      const parsed = JSON.parse(raw) as { servers?: unknown };
      return Array.isArray(parsed.servers) && parsed.servers.includes(CONNECTOR_NAME);
    } catch {
      return false;
    }
  });
}
