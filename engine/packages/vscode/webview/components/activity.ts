/**
 * Was ein laufender Auftrag gerade tut, in einem Satz — statt eines bloßen
 * „Arbeitet“. Grundlage ist der letzte Werkzeugaufruf der laufenden Antwort:
 * Exokortex, Web-Recherche, interne Dokumentation, Tests, Dateien …
 *
 * Reine Funktion, damit sie ohne Oberfläche prüfbar ist (test/unit/activity.test.ts).
 */
import type { AgentLane, Segment, ToolStep } from '../../src/panel/transcript.js';
import { EXOKORTEX, WEBSEARCH, namedToolWords, subjectOf, toolWords } from './toolWords.js';

const file = (path?: string, detail?: string) => (path || detail || '').split('/').filter(Boolean).pop() ?? '';
const short = (text: string, max = 48) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const withSubject = (text: string, subject?: string) => (subject ? `${text} · ${short(subject, 40)}` : text);

/** Interne Dokumentation: Markdown und die bekannten Ordner und Dateien dafür. */
const DOCS = /(^|\/)(docs?|dokumentation|handbuch|wiki)\/|(^|\/)(readme|agents|claude|contributing|changelog)[^/]*$|\.(md|mdx|markdown|rst|adoc)$/i;

export function describeStep(step: ToolStep): string {
  const name = step.name ?? '';
  const detail = (step.detail ?? '').trim();
  const lower = name.toLowerCase();
  // Werkzeuge mit eigenem Namen — Aufgabenliste, Hintergrundaufgaben, Bilder —
  // sagen selbst, was sie tun. Groks `memory_search` ist sein eigenes
  // Gedächtnis, nicht der Exokortex.
  const named = (step.action ?? 'other') === 'other' ? namedToolWords(step) : undefined;
  if (named) return withSubject(named.now, named.subject);
  const subject = subjectOf(step);
  if (EXOKORTEX.test(name) || (step.path && EXOKORTEX.test(step.path))) return subject ? `Schaut im Exokortex nach · ${short(subject, 36)}` : 'Schaut im Exokortex nach';
  if (WEBSEARCH.test(name)) return subject ? `Recherchiert im Web · „${short(subject, 36)}“` : 'Recherchiert im Web';
  if (step.action === 'fetch' || /webfetch|fetch_?url|browse|navigate/.test(lower)) {
    const host = /https?:\/\/([^/\s]+)/.exec(detail)?.[1]?.replace(/^www\./, '');
    return host ? `Liest eine Webseite · ${host}` : 'Liest eine Webseite';
  }
  if (/todo|task_?list|plan/.test(lower) && step.action !== 'task') return 'Plant die nächsten Schritte';
  if (step.action === 'task' || /^(task|agent)$/.test(lower)) return 'Startet einen Hilfsagenten';
  if (step.action === 'read') {
    const f = file(step.path, detail);
    return DOCS.test(step.path || detail) ? `Liest interne Dokumentation · ${f}` : f ? `Liest ${f}` : 'Liest Dateien';
  }
  // Eine Suche trägt ihren Ort im Detail; nur ein aufgelisteter Ordner setzt `path`.
  if (step.action === 'search' && step.path) {
    const f = file(step.path);
    return f ? `Sieht sich den Ordner ${f} an` : 'Sieht sich einen Ordner an';
  }
  if (step.action === 'search') return detail ? `Durchsucht das Projekt nach „${short(detail, 32)}“` : 'Durchsucht das Projekt';
  if (step.action === 'edit') return `Bearbeitet ${file(step.path, detail) || 'eine Datei'}`;
  if (step.action === 'write') return `Schreibt ${file(step.path, detail) || 'eine Datei'}`;
  if (step.action === 'run') {
    const kind =
      /\b(test|vitest|jest|pytest|playwright|spec)\b/i.test(detail) ? 'Führt Tests aus'
        : /\b(build|esbuild|tsc|compile|assemble)\b/i.test(detail) ? 'Baut das Projekt'
        : /\b(git)\b/.test(detail) ? 'Arbeitet mit Git'
        : /\b(npm|pnpm|pip|brew)\s+(i|install|add)\b/.test(detail) ? 'Installiert Abhängigkeiten'
        : undefined;
    // Wozu der Befehl läuft, sagt der Agent selbst — genauer als die Befehlszeile.
    const why = step.description?.trim();
    if (why) return withSubject(kind ?? 'Führt aus', why);
    if (kind) return kind;
    return detail ? `Führt aus · ${short(detail.split('\n')[0]!, 40)}` : 'Führt einen Befehl aus';
  }
  const words = toolWords(step);
  return withSubject(words.now, words.subject);
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
