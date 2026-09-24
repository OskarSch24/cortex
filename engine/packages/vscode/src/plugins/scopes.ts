import * as vscode from 'vscode';
import { existsSync, readFileSync } from 'node:fs';
import { effectiveServers, parseMcpFile, type EffectiveServers } from '@cortex/core';
import type { PluginScopeState } from '../panel/protocol.js';
import { personalMcpFile, projectMcpFile } from '../paths.js';

/** Die beiden Orte für mcp.json, das Projekt zuerst — ohne Projektordner nur die persönliche. */
export function mcpPaths(workspaceRoot?: string): Array<{ id: PluginScopeState['id']; path: string }> {
  const places: Array<{ id: PluginScopeState['id']; path: string }> = [];
  if (workspaceRoot !== undefined) places.push({ id: 'projekt', path: projectMcpFile(workspaceRoot) });
  places.push({ id: 'persoenlich', path: personalMcpFile() });
  return places;
}

/**
 * Die beiden mcp.json-Dateien, gelesen an genau einer Stelle. Vorher las jede
 * Spiegelung sie selbst — mit der Regel „die erste vorhandene gewinnt ganz“, und
 * die Plugin-Seite zeigte daneben eine Mischung aus beiden. Jetzt gilt überall
 * dieselbe Zusammenführung aus `effectiveServers`.
 */
export function readScopes(): PluginScopeState[] {
  const ws = vscode.workspace.workspaceFolders?.[0];
  return mcpPaths(ws?.uri.fsPath).map(({ id, path }) => {
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
