/**
 * Was ein laufender Auftrag gerade tut, in einem Satz — statt eines bloßen
 * „Arbeitet“. Grundlage ist der letzte Werkzeugaufruf der laufenden Antwort:
 * Exokortex, Web-Recherche, interne Dokumentation, Tests, Dateien …
 *
 * Reine Funktion, damit sie ohne Oberfläche prüfbar ist (test/unit/activity.test.ts).
 */
import type { AgentLane, Segment, ToolStep } from '../../src/panel/transcript.js';

const file = (path?: string, detail?: string) => (path || detail || '').split('/').filter(Boolean).pop() ?? '';
const short = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const human = (id: string) => id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();

/** Interne Dokumentation: Markdown und die bekannten Ordner und Dateien dafür. */
const DOCS = /(^|\/)(docs?|dokumentation|handbuch|wiki)\/|(^|\/)(readme|agents|claude|contributing|changelog)[^/]*$|\.(md|mdx|markdown|rst|adoc)$/i;
const EXOKORTEX = /exokortex|vault|obsidian|graph_(query|node|nodes|edges)|\bwz_|lesen\.py|erinnerung|memory/i;
const WEBSEARCH = /web_?search|search_?web|brave|tavily|perplexity|google_?search|serp|rag-web-browser|web-fetch/i;

export function describeStep(step: ToolStep): string {
  const name = step.name ?? '';
  const detail = (step.detail ?? '').trim();
  const lower = name.toLowerCase();
  if (EXOKORTEX.test(name) || (step.path && EXOKORTEX.test(step.path))) return detail ? `Schaut im Exokortex nach · ${short(detail, 36)}` : 'Schaut im Exokortex nach';
  if (WEBSEARCH.test(name)) return detail ? `Recherchiert im Web · „${short(detail, 36)}“` : 'Recherchiert im Web';
  if (step.action === 'fetch' || /webfetch|fetch_?url|browse|navigate/.test(lower)) {
    const host = /https?:\/\/([^/\s]+)/.exec(detail)?.[1]?.replace(/^www\./, '');
    return host ? `Liest eine Webseite · ${host}` : 'Liest eine Webseite';
  }
  if (/^(skill|use_?skill)$/.test(lower)) return detail ? `Lädt den Skill ${short(detail, 32)}` : 'Lädt einen Skill';
  if (/todo|task_?list|plan/.test(lower) && step.action !== 'task') return 'Plant die nächsten Schritte';
  if (step.action === 'task' || /^(task|agent)$/.test(lower)) return 'Startet einen Hilfsagenten';
  if (step.action === 'read') {
    const f = file(step.path, detail);
    return DOCS.test(step.path || detail) ? `Liest interne Dokumentation · ${f}` : f ? `Liest ${f}` : 'Liest Dateien';
  }
  if (step.action === 'search') return detail ? `Durchsucht das Projekt nach „${short(detail, 32)}“` : 'Durchsucht das Projekt';
  if (step.action === 'edit') return `Bearbeitet ${file(step.path, detail) || 'eine Datei'}`;
  if (step.action === 'write') return `Schreibt ${file(step.path, detail) || 'eine Datei'}`;
  if (step.action === 'run') {
    if (/\b(test|vitest|jest|pytest|playwright|spec)\b/i.test(detail)) return 'Führt Tests aus';
    if (/\b(build|esbuild|tsc|compile|assemble)\b/i.test(detail)) return 'Baut das Projekt';
    if (/\b(git)\b/.test(detail)) return 'Arbeitet mit Git';
    if (/\b(npm|pnpm|pip|brew)\s+(i|install|add)\b/.test(detail)) return 'Installiert Abhängigkeiten';
    return detail ? `Führt aus · ${short(detail.split('\n')[0]!, 40)}` : 'Führt einen Befehl aus';
  }
  // Plugins (MCP): mcp__<server>__<werkzeug>.
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/.exec(name);
  if (mcp) {
    const server = mcp[1]!.replace(/^[0-9a-f-]{20,}$/i, 'Plugin');
    return `Nutzt ${human(server)} · ${human(mcp[2]!)}`;
  }
  return `Nutzt ${human(name) || 'ein Werkzeug'}`;
}

function describeAgents(lanes: AgentLane[]): string {
  const running = lanes.filter(l => l.status === 'running');
  if (running.length === 1) return `Hilfsagent: ${short(running[0]!.label, 40)}`;
  if (running.length > 1) return `${running.length} Hilfsagenten arbeiten parallel`;
  return 'Wertet die Hilfsagenten aus';
}

/**
 * Die Tätigkeit einer laufenden Antwort. Ohne Antwort bisher gilt, was der
 * Host meldet (Erinnerungen suchen), sonst „Denkt nach“.
 */
export function currentActivity(segments: Segment[] | undefined, host?: string): string {
  const last = segments?.[segments.length - 1];
  if (!last) return host ?? 'Denkt nach';
  if (last.kind === 'text') return last.text.trim() ? 'Schreibt die Antwort' : host ?? 'Denkt nach';
  if (last.kind === 'agents') return describeAgents(last.lanes);
  const step = last.steps[last.steps.length - 1];
  return step ? describeStep(step) : 'Denkt nach';
}
