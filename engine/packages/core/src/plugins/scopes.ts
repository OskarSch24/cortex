import type { McpServerDef } from '../mcp/mcpSync.js';

/**
 * Welche Server gelten, wenn es eine persönliche und eine Projekt-mcp.json gibt.
 *
 * Früher gewann die ganze Datei: brachte ein Projekt eine eigene mit, fielen
 * alle persönlichen Server aus den Profilen — ein in „Persönlich“ verbundenes
 * Plugin verschwand, sobald man so ein Projekt öffnete. Jetzt gilt, was Cursor
 * macht: persönliche Server überall, das Projekt ergänzt sie und überschreibt
 * nur gleichnamige — und sagt, welche.
 *
 * Rein rechnend: dieselbe Regel gilt im Host beim Spiegeln und auf der Seite
 * beim Anzeigen.
 */
export type ScopeId = 'projekt' | 'persoenlich';

export interface ScopeServers {
  id: ScopeId;
  servers: Record<string, McpServerDef>;
  exists: boolean;
  error?: string;
}

export interface EffectiveServers {
  servers: Record<string, McpServerDef>;
  /** Aus welcher Datei jeder geltende Server stammt. */
  origin: Record<string, ScopeId>;
  /** Persönliche Server, die das Projekt mit eigenem Eintrag überschreibt. */
  shadowed: string[];
}

export function effectiveServers(scopes: ScopeServers[]): EffectiveServers {
  const usable = (id: ScopeId) => scopes.find((s) => s.id === id && s.exists && !s.error)?.servers ?? {};
  const personal = usable('persoenlich');
  const project = usable('projekt');
  const servers: Record<string, McpServerDef> = { ...personal, ...project };
  const origin: Record<string, ScopeId> = {};
  for (const name of Object.keys(personal)) origin[name] = 'persoenlich';
  for (const name of Object.keys(project)) origin[name] = 'projekt';
  return { servers, origin, shadowed: Object.keys(personal).filter((name) => name in project) };
}
