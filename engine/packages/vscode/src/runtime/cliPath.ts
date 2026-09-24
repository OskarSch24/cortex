import type * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { managedClaudeBin, runtimeBinDir } from '../paths.js';

/**
 * VS Code launched from the Dock inherits a minimal PATH; make sure the
 * usual CLI homes are reachable so `claude`/`codex`/... resolve.
 */
export function extendPath(): void {
  const extraDirs = [
    runtimeBinDir(),
    join(homedir(), '.local', 'bin'),
    join(homedir(), '.grok', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const pathEntries = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of extraDirs) {
    if (existsSync(dir) && !pathEntries.includes(dir)) pathEntries.push(dir);
  }
  process.env.PATH = pathEntries.join(delimiter);
}

export type CliPath = (provider: string, fallback: string) => string;

/**
 * Welche CLI ein Anbieter startet: ein eigener Pfad aus den Einstellungen, für
 * Claude sonst Cortex' eigene Laufzeit, falls installiert, sonst der Name im PATH.
 * `config` ist der Stand beim Aufruf dieser Funktion — Cortex liest ihn einmal beim Start.
 */
export function createCliPath(config: vscode.WorkspaceConfiguration): CliPath {
  return (provider, fallback) => {
    const configured = config.get<string>(`cliPath.${provider}`);
    if (configured && configured !== fallback) return configured;
    const managed = managedClaudeBin();
    return provider === 'claude' && existsSync(managed) ? managed : fallback;
  };
}
