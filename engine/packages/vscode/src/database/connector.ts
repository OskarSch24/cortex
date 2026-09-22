import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { McpServerDef } from '@cortex/core';

import type { StudioHost } from './studioHost.js';

/**
 * Database Studio as a connector every account carries.
 *
 * The other connectors are things someone wrote into `.cortex/mcp.json`. This
 * one is not optional: it is the database integration, so it is defined here
 * and merged into whatever that file says. Removing it from mcp.json would
 * therefore not remove it — turning it off is `cortex.databaseStudio.enabled`.
 *
 * Which database it reaches follows what is actually open:
 *
 *   a database open in a Cortex tab → the host in this window, addressed by
 *     environment variables, which `studio-mcp` prefers over everything else
 *   nothing open in Cortex → no environment, so `studio-mcp` falls back to
 *     `api.json` and talks to the macOS app if that is running
 *
 * So the agent's view and the user's view are the same view, without either
 * side having to be told which one to use.
 */

export const CONNECTOR_NAME = 'database-studio';

/** How the connector presents itself — name, wording and the product's icon. */
export interface ConnectorIdentity {
  name: string;
  title: string;
  description: string;
  /** A 128px PNG as a data: URI, ready to put in an <img src>. */
  icon?: string;
}

let identity: ConnectorIdentity | undefined;

/**
 * Reads the connector's own description out of `studio-mcp`.
 *
 * The same values go into the MCP handshake, so taking them from there keeps
 * the plugins page and the agent's view of this connector from drifting apart.
 * Failure is not fatal: without it the list simply shows the plain name.
 */
export async function loadConnectorIdentity(): Promise<ConnectorIdentity | undefined> {
  if (identity) return identity;

  const entry = join(studioRoot(), 'studio-mcp', 'src', 'identity.js');
  if (!existsSync(entry)) return undefined;

  try {
    // `studio-mcp` carries the icon in the shape the MCP handshake wants —
    // `{ src, mimeType, sizes }` — while a webview only needs the URI.
    type Declared = {
      name: string;
      title: string;
      description: string;
      icon?: { src?: string };
    };
    const load = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<{ DATABASE_STUDIO_CONNECTOR: Declared }>;

    const { DATABASE_STUDIO_CONNECTOR: found } = await load(pathToFileURL(entry).href);
    identity = {
      name: found.name,
      title: found.title,
      description: found.description,
      icon: found.icon?.src,
    };
    return identity;
  } catch {
    return undefined;
  }
}

/** What was loaded, if anything — safe to call from synchronous render paths. */
export function connectorIdentity(): ConnectorIdentity | undefined {
  return identity;
}

/** Where `studio-mcp` lives, relative to the Database Studio root folder. */
function connectorEntry(root: string): string | undefined {
  const entry = join(root, 'studio-mcp', 'src', 'database-studio.js');
  return existsSync(entry) ? entry : undefined;
}

function studioRoot(): string {
  const configured = vscode.workspace
    .getConfiguration('cortex')
    .get<string>('databaseStudio.path', '')
    .trim();
  return configured || join(homedir(), 'dev', 'Database System');
}

/**
 * The connector definition, or undefined when the integration is off or
 * Database Studio is not installed where Cortex was told to look.
 */
export function databaseStudioServer(host: StudioHost | undefined): McpServerDef | undefined {
  const config = vscode.workspace.getConfiguration('cortex');
  if (!config.get<boolean>('databaseStudio.enabled', true)) return undefined;

  const entry = connectorEntry(studioRoot());
  if (!entry) return undefined;

  const env: Record<string, string> = {};
  if (host?.running && host.url && host.token) {
    env.DATABASE_STUDIO_URL = host.url;
    env.DATABASE_STUDIO_TOKEN = host.token;
  }

  // Not `process.execPath`: in an extension host that is Cortex's own Electron
  // binary, which would launch the editor rather than run a script. The CLIs
  // that start this server run on Node themselves, so `node` resolves for them
  // — and it stays readable, and valid, in a profile file that outlives this
  // installation path.
  return {
    command: 'node',
    args: [entry],
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };
}

/**
 * The user's connectors plus the built-in one.
 *
 * They have to be synced together: `syncMcpToProfile` removes every server a
 * profile carries that is not in the set it is given, so syncing the built-in
 * one on its own would take all the others back out.
 */
export function withBuiltInConnectors(
  servers: Record<string, McpServerDef>,
  host: StudioHost | undefined,
): Record<string, McpServerDef> {
  const studio = databaseStudioServer(host);
  if (!studio) return servers;
  // A hand-written entry of the same name wins: someone who wrote one meant it.
  return { [CONNECTOR_NAME]: studio, ...servers };
}

/**
 * The host of the running window.
 *
 * There is exactly one per extension host, and the connector sync happens in
 * places that have no reason to be handed a database object — the chat view and
 * the command palette. A module-level reference is the smaller price.
 */
let current: StudioHost | undefined;

export function setStudioHost(host: StudioHost | undefined): void {
  current = host;
}

export function currentStudioHost(): StudioHost | undefined {
  return current;
}

/**
 * Wo die Vektor-App ihre API-Adresse ablegt, solange die API läuft. Ohne die
 * Datei und ohne Cortex' eigenen Host scheitert jeder Aufruf des Konnektors
 * (beobachtet am 13.09.2026: 26 von 27 Funktionen „API nicht eingeschaltet“).
 */
export const STUDIO_API_DIR = join(homedir(), 'Library', 'Application Support', 'Database Studio');
export const STUDIO_API_FILE = join(STUDIO_API_DIR, 'api.json');

export function studioReachable(host: StudioHost | undefined): boolean {
  return Boolean(host?.running) || existsSync(STUDIO_API_FILE);
}

/** Merkt sich, dass der eingebaute Konnektor gespiegelt werden soll — auch während er wegen fehlender API draußen bleibt. */
export const STUDIO_WANTED_KEY = 'cortex.databaseStudio.mirrored';
