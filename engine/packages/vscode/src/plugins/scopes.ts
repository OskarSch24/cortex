import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { effectiveServers, parseMcpFile, type EffectiveServers } from '@cortex/core';
import type { PluginScopeState } from '../panel/protocol.js';

/**
 * Die beiden mcp.json-Dateien, gelesen an genau einer Stelle. Vorher las jede
 * Spiegelung sie selbst — mit der Regel „die erste vorhandene gewinnt ganz“, und
 * die Plugin-Seite zeigte daneben eine Mischung aus beiden. Jetzt gilt überall
 * dieselbe Zusammenführung aus `effectiveServers`.
 */
export function readScopes(): PluginScopeState[] {
  const ws = vscode.workspace.workspaceFolders?.[0];
  const places: Array<{ id: PluginScopeState['id']; path: string }> = [];
  if (ws) places.push({ id: 'projekt', path: join(ws.uri.fsPath, '.cortex', 'mcp.json') });
  places.push({ id: 'persoenlich', path: join(homedir(), '.cortex', 'mcp.json') });
  return places.map(({ id, path }) => {
    if (!existsSync(path)) return { id, path, exists: false, servers: {} };
    try {
      const parsed = parseMcpFile(readFileSync(path, 'utf8'));
      return parsed.ok
        ? { id, path, exists: true, servers: parsed.servers }
        : { id, path, exists: true, servers: {}, error: parsed.error };
    } catch (e) {
      return { id, path, exists: true, servers: {}, error: String(e) };
    }
  });
}

export function effectiveMcp(scopes = readScopes()): EffectiveServers & { scopes: PluginScopeState[]; errors: string[] } {
  return {
    ...effectiveServers(scopes),
    scopes,
    errors: scopes.filter((s) => s.error).map((s) => `${s.path}: ${s.error}`),
  };
}
