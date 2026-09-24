import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Wo Cortex unter `~/.cortex` ablegt. Alles Funktionen, keine beim Laden
 * festgelegten Werte: `homedir()` wird erst beim Aufruf gefragt, damit Tests
 * und isolierte Starts ein eigenes HOME setzen können.
 */
export const cortexHome = (): string => join(homedir(), '.cortex');

/** Ein Ordner je Konto, darin die Anmeldung der jeweiligen CLI. */
export const profilesRoot = (): string => join(cortexHome(), 'profiles');

/** Profilordner ohne Konto landen hier statt im Papierkorb. */
export const profilesArchiveRoot = (): string => join(cortexHome(), 'profiles-archiv');

/** Cortex’ eigene Laufzeit für Claude Code, installiert auf Knopfdruck. */
export const managedClaudeRoot = (): string => join(cortexHome(), 'runtime', 'claude');

/** Das `claude` aus dieser Laufzeit. */
export const managedClaudeBin = (): string => join(managedClaudeRoot(), 'node_modules', '.bin', 'claude');

/** Programme, die Cortex selbst mitbringt — kommt an den PATH. */
export const runtimeBinDir = (): string => join(cortexHome(), 'runtime', 'bin');

/** Die persönliche mcp.json. */
export const personalMcpFile = (): string => join(cortexHome(), 'mcp.json');

/** Die mcp.json eines Projekts. */
export const projectMcpFile = (workspaceRoot: string): string => join(workspaceRoot, '.cortex', 'mcp.json');
