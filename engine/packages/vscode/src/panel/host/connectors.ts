import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { MCP_TEMPLATE, syncMcpToProfile, type McpServerDef } from '@cortex/core';
import { CONNECTOR_NAME, connectorIdentity, currentStudioHost, withBuiltInConnectors } from '../../database/index.js';
import { profileServers } from '../../plugins/profileServers.js';
import { effectiveMcp, mcpPaths } from '../../plugins/scopes.js';
import type { HandlerTable, PanelHost } from './dispatch.js';

/**
 * Wo die Konnektoren definiert sind. Ein Projekt darf eine eigene Datei
 * mitbringen; sonst gilt die persönliche.
 */
export function connectorPaths(): string[] {
  return mcpPaths(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath).map(({ path }) => path);
}

/**
 * Konnektoren sind MCP-Server: einmal beschrieben, in jedes Anbieterprofil
 * gespiegelt. `sync` schreibt sie neu — sonst wird nur berichtet, was da ist.
 */
export async function pushConnectors(host: PanelHost, webview: vscode.Webview, sync = false): Promise<void> {
  const path = connectorPaths().find(p => existsSync(p));
  const effective = effectiveMcp();
  const defined: Record<string, McpServerDef> = effective.servers;
  const error: string | undefined = effective.errors.length ? effective.errors.join(' · ') : undefined;

  // Database Studio is part of the product, not of anyone's mcp.json — and it
  // has to be synced together with the rest, because a profile drops every
  // server missing from the set it is given.
  const all = error ? defined : withBuiltInConnectors(defined, currentStudioHost());

  // Der eingebaute Konnektor beschreibt sich selbst — mit dem Icon und der
  // Wortwahl, die auch im MCP-Handshake stehen, damit die Plugin-Seite und
  // der Agent denselben Konnektor meinen.
  const studio = currentStudioHost();
  const identity = connectorIdentity();

  const servers = Object.entries(all).map(([name, def]) => {
    const server = {
      name,
      remote: !!def.url,
      target: def.url ?? [def.command, ...(def.args ?? [])].filter(Boolean).join(' '),
      providers: def.providers,
      kind: def.kind,
    };
    if (name !== CONNECTOR_NAME || name in defined) return server;

    const connected = Boolean(studio?.running);
    return {
      ...server,
      builtIn: true,
      title: identity?.title,
      description: identity?.description,
      icon: identity?.icon,
      connected,
      detail: connected
        ? `${studio!.sessionCount === 1 ? 'Eine Quelle' : `${studio!.sessionCount} Quellen`} in Cortex geöffnet`
        : 'Verbindet sich mit der Vektor-App, bis hier eine Quelle offen ist',
    };
  });
  // Ohne Spiegelung wüsste niemand, ob eine Definition auch ankommt — der
  // Bericht je Konto ist der eigentliche Wert dieser Ansicht.
  const accounts = host.accounts.all().map(account => ({
    provider: account.provider,
    label: account.label,
    error: sync ? syncMcpToProfile(account, error ? all : profileServers(defined)) : undefined,
  }));
  host.post(webview, { kind: 'connectors', path, error, servers, accounts });
}

export const connectorHandlers: HandlerTable<'openConnectors' | 'getConnectors' | 'syncConnectors' | 'editConnectors'> = {
  openConnectors: async (_msg, { host, webview }) => {
    if (host.agentPanel) host.post(host.agentPanel.webview, { kind: 'showPage', page: 'settings' });
    await pushConnectors(host, webview);
  },
  getConnectors: async (_msg, { host, webview }) => {
    await pushConnectors(host, webview);
  },
  syncConnectors: async (_msg, { host, webview }) => {
    await pushConnectors(host, webview, true);
  },
  editConnectors: async () => {
    const path = connectorPaths().find(p => existsSync(p)) ?? connectorPaths()[0]!;
    const uri = vscode.Uri.file(path);
    // Ohne Datei gibt es nichts zu bearbeiten — die Vorlage erklärt das Format.
    if (!existsSync(path)) await vscode.workspace.fs.writeFile(uri, Buffer.from(MCP_TEMPLATE, 'utf8'));
    await vscode.window.showTextDocument(uri);
  },
};
