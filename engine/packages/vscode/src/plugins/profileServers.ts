import type { McpServerDef } from '@cortex/core';
import * as vscode from 'vscode';
import { readBrowserAccess, withBrowserPolicy } from './browserPolicy.js';
import { CONNECTOR_NAME, currentStudioHost, studioReachable, withBuiltInConnectors } from '../database/connector.js';
import { currentPluginCredentials } from './credentials.js';
import { currentPluginSwitches } from './switches.js';
import { withYoutubeVideoTools } from './youtubeKanal.js';

/**
 * Die Menge, die in ein Profil geht: was in mcp.json steht, der eingebaute
 * Konnektor dazu, und die hinterlegten Zugangsdaten eingesetzt.
 *
 * Jede Stelle, die spiegelt, geht hier durch. Eine, die es nicht täte, schriebe
 * die Server ohne Schlüssel und ohne Token zurück — und nähme damit einem eben
 * verbundenen Plugin den Zugang, ohne dass es jemand merkt.
 */
export function profileServers(defined: Record<string, McpServerDef>): Record<string, McpServerDef> {
  const all = { ...withBuiltInConnectors(defined, currentStudioHost()) };
  // Der eingebaute Konnektor geht nur in die Profile, wenn Vektor erreichbar ist —
  // sonst sähe der Agent 29 Werkzeuge, von denen keins etwas tut. Wird Vektor
  // erreichbar, spiegelt der Host neu (database/index.ts beobachtet beides).
  if (CONNECTOR_NAME in all && !(CONNECTOR_NAME in defined) && !studioReachable(currentStudioHost())) delete all[CONNECTOR_NAME];
  // Ausgeschaltet heißt: in kein Profil. Die Spiegelung nimmt ihn dort heraus.
  for (const name of currentPluginSwitches()?.disabled() ?? []) delete all[name];
  const withTools = withBrowserPolicy(withYoutubeVideoTools(all), readBrowserAccess(vscode.workspace.getConfiguration('cortex').get('browserAccess')));
  const credentials = currentPluginCredentials();
  if (!credentials) return withTools;
  const applied = credentials.applyAll(withTools);
  // Fehlt ein Pflichtschlüssel, bleibt der Server draußen: die Plugin-Seite
  // zeigt „Schlüssel eintragen“, und keine CLI startet einen Server, der sofort stirbt.
  for (const [name, def] of Object.entries(applied)) {
    if (credentials.missing(name, def).length) delete applied[name];
  }
  return applied;
}
