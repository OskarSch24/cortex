import * as vscode from 'vscode';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The folder holding `database-studio/`, `cortex-bridge/` and `studio-mcp/`.
 * Read fresh on every call: the setting may change while Cortex runs.
 */
export function databaseStudioRoot(): string {
  const configured = vscode.workspace
    .getConfiguration('cortex')
    .get<string>('databaseStudio.path', '')
    .trim();
  // Where Database Studio lives when nothing says otherwise.
  return configured || join(homedir(), 'dev', 'Database System');
}
