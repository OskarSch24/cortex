/** Die Plugin-Seite: eingebaute Konnektoren und Gültigkeitsbereiche. */
import type { McpServerDef, PluginConnection, PluginCredentialState } from '@cortex/core';

/** Ein Projekt darf eigene MCP-Server mitbringen; sonst gilt die persönliche Datei. */
export interface BuiltInConnectorDto {
  name: string;
  title: string;
  description: string;
  /** Das Produktsymbol als data:-URI, wie es der MCP-Handschlag führt. */
  icon?: string;
  target: string;
  /** Läuft der Host in diesem Fenster gerade? */
  running: boolean;
  /** Wie viele Quellen dort offen sind. */
  sessions: number;
  /** Von Hand in mcp.json überschrieben — dann gilt der eigene Eintrag. */
  overridden: boolean;
}

export type PluginScope = 'projekt' | 'persoenlich';

export interface PluginLiveState {
  /** Je Server: welche Werte hinterlegt sind (nur Namen) und ob eine Anmeldung besteht. */
  credentials: Record<string, PluginCredentialState>;
  /** Je Server: das letzte Prüfergebnis. */
  connections: Record<string, PluginConnection>;
  /** Je Server: eine gerade laufende Anmeldung. */
  /** `account`: die Anmeldung gilt nur diesem Konto (Anmeldung über die CLIs). */
  logins: Record<string, { step: 'suche' | 'browser' | 'tausche'; message: string; url?: string; account?: string }>;
  /** In Cortex ausgeschaltete Server. */
  disabled: string[];
}

export interface PluginScopeState {
  id: PluginScope;
  path: string;
  exists: boolean;
  /** Was wirklich in dieser Datei steht. */
  servers: Record<string, McpServerDef>;
  /** Die Datei ist da, aber unlesbar — dann wird nichts behauptet. */
  error?: string;
}
