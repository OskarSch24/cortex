/**
 * Slash commands, Claude-style but provider-agnostic:
 * - kind 'action': handled by the host UI (open panels, clear chat...)
 * - kind 'prompt': routed to the model. When the target is Claude and the
 *   command is claudeNative, the raw "/name args" passes through so Claude
 *   Code runs its own richer built-in; every other provider gets the
 *   equivalent English template.
 */

export type SlashAction =
  | 'archiveChat'
  | 'pinChat'
  | 'forkChat'
  | 'exportChat'
  | 'openMemory'
  | 'openFeedback'
  | 'compactChat'
  | 'openConnectors'
  | 'openModel'
  | 'newChat'
  | 'openSettings'
  | 'openTemplates'
  | 'openDocumentTemplates'
  | 'openPresentationTemplates'
  | 'openSpreadsheetTemplates'
  | 'createImage'
  | 'openSearch'
  | 'clearChat'
  | 'openAccounts'
  | 'openRules'
  | 'refreshUsage'
  | 'openTerminal';

export interface SlashCommand {
  name: string;
  /** Human-readable picker title; the slash command itself keeps its stable name. */
  label?: string;
  description: string;
  /** Icon name understood by the host UI. */
  icon?: string;
  /** Additional search terms, independent of the command name and label. */
  keywords?: string[];
  kind: 'action' | 'prompt';
  action?: SlashAction;
  /** Provider-agnostic prompt; `{args}` is replaced with the user's arguments. */
  template?: string;
  /** Claude Code understands this natively — pass the raw slash text through. */
  claudeNative?: boolean;
  /** Hint shown in the picker, e.g. "/fix <description>". */
  usage?: string;
  /** Stands in for `{args}` when the command was sent without any. */
  emptyArgs?: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: 'archive', label: 'Archivieren', kind: 'action', action: 'archiveChat', icon: 'archive',
    description: 'Den aktuellen Chat ins Archiv verschieben', keywords: ['archiv', 'ablegen'],
  },
  {
    name: 'pin', label: 'Chat anpinnen', kind: 'action', action: 'pinChat', icon: 'pin',
    description: 'Den aktuellen Chat anheften oder lösen', keywords: ['anheften', 'lösen', 'favorit'],
  },
  {
    name: 'fork', label: 'Chat forken', kind: 'action', action: 'forkChat', icon: 'branch',
    description: 'Das Gespräch als eigenen Chat fortsetzen', keywords: ['abzweigen', 'kopieren'],
  },
  {
    name: 'export', label: 'Chat exportieren', kind: 'action', action: 'exportChat', icon: 'download',
    description: 'Den aktuellen Chat in eine Datei exportieren', keywords: ['speichern', 'datei'],
  },
  {
    name: 'memory', label: 'Erinnerungen', kind: 'action', action: 'openMemory', icon: 'book',
    description: 'Erinnerungen und persönliche Anweisungen verwalten', keywords: ['gedächtnis', 'wissen'],
  },
  {
    name: 'feedback', label: 'Feedback', kind: 'action', action: 'openFeedback', icon: 'chat',
    description: 'Feedback zu Cortex geben', keywords: ['rückmeldung', 'problem', 'vorschlag'],
  },
  {
    name: 'compact', label: 'Kompakt', kind: 'action', action: 'compactChat', icon: 'refresh',
    description: 'Den Kontext des aktuellen Chats zusammenfassen', keywords: ['komprimieren', 'kontext', 'zusammenfassung'],
  },
  {
    name: 'mcp', label: 'MCP', kind: 'action', action: 'openConnectors', icon: 'plug',
    description: 'Verbindungen zu externen Werkzeugen verwalten', keywords: ['verbindungen', 'konnektoren', 'werkzeuge'],
  },
  {
    name: 'model', label: 'Modell', kind: 'action', action: 'openModel', icon: 'bolt',
    description: 'Das Modell für diesen Chat auswählen', keywords: ['ki', 'anbieter', 'wechseln'],
  },
  {
    name: 'new', label: 'Neuer Chat', kind: 'action', action: 'newChat', icon: 'composeNew',
    description: 'Einen neuen Chat beginnen', keywords: ['neu', 'gespräch'],
  },
  {
    name: 'usage', label: 'Nutzung und Abrechnung', kind: 'action', action: 'refreshUsage', icon: 'gauge',
    description: 'Verbrauchsdaten aktualisieren und anzeigen', keywords: ['verbrauch', 'kosten', 'limits', 'kontingent'],
  },
  {
    name: 'settings', label: 'Einstellungen', kind: 'action', action: 'openSettings', icon: 'gear',
    description: 'Die Cortex-Einstellungen öffnen', keywords: ['konfiguration', 'präferenzen'],
  },
  {
    name: 'templates', label: 'Vorlagen', kind: 'action', action: 'openTemplates', icon: 'doc',
    description: 'Vorlagen für Dokumente, Tabellen und Präsentationen auswählen', keywords: ['dokument', 'tabelle', 'präsentation'],
  },
  {
    name: 'docs', label: 'Dokumente', kind: 'action', action: 'openDocumentTemplates', icon: 'doc',
    description: 'Dokumentvorlagen auswählen', keywords: ['dokument', 'vorlagen', 'documents', 'word', 'docx'],
  },
  {
    name: 'slides', label: 'Präsentationen', kind: 'action', action: 'openPresentationTemplates', icon: 'window',
    description: 'Präsentationsvorlagen auswählen', keywords: ['präsentation', 'folien', 'vorlagen', 'presentations', 'powerpoint', 'pptx'],
  },
  {
    name: 'sheets', label: 'Tabellen', kind: 'action', action: 'openSpreadsheetTemplates', icon: 'chart',
    description: 'Tabellenvorlagen auswählen', keywords: ['tabelle', 'vorlagen', 'spreadsheets', 'excel', 'xlsx'],
  },
  {
    name: 'image', label: 'Bild erstellen', kind: 'action', action: 'createImage', icon: 'image',
    description: 'Eine neue Bildanfrage vorbereiten', keywords: ['bild', 'foto', 'illustration'],
  },
  {
    name: 'search', label: 'Chats suchen', kind: 'action', action: 'openSearch', icon: 'search',
    description: 'Gespeicherte Chats durchsuchen', keywords: ['suche', 'finden', 'verlauf'],
  },
  {
    name: 'accounts', label: 'Konten', kind: 'action', action: 'openAccounts', icon: 'user',
    description: 'Die verbundenen KI-Konten verwalten', keywords: ['anbieter', 'anmeldung'],
  },
  {
    name: 'rules', label: 'Routing-Regeln', kind: 'action', action: 'openRules', icon: 'route',
    description: 'Regeln für die automatische Modellauswahl öffnen', keywords: ['routing', 'automatisch', 'zuordnung'],
  },
  {
    name: 'terminal', label: 'Terminal', kind: 'action', action: 'openTerminal', icon: 'terminal',
    description: 'Eine geroutete Sitzung im Terminal öffnen', keywords: ['konsole', 'shell'],
  },
  {
    name: 'clear', label: 'Chat leeren', kind: 'action', action: 'clearChat', icon: 'trash',
    description: 'Den aktuellen Gesprächsverlauf leeren', keywords: ['löschen', 'zurücksetzen'],
  },
  {
    name: 'init',
    label: 'Projekt einrichten',
    icon: 'folder',
    kind: 'prompt',
    claudeNative: true,
    description: 'Das Projekt analysieren und Arbeitsanweisungen dokumentieren',
    template:
      'Analyze this repository — structure, build/test/lint commands, architecture, conventions — and create or update an AGENTS.md file documenting how to work in it.',
  },
  {
    name: 'review',
    label: 'Änderungen prüfen',
    icon: 'check',
    kind: 'prompt',
    claudeNative: true,
    description: 'Offene Änderungen auf Fehler und Risiken prüfen',
    template:
      'Review the pending changes in this repository (inspect git status and git diff) and report bugs, risks and concrete improvements, ranked by severity.',
  },
  {
    name: 'security-review',
    label: 'Sicherheit prüfen',
    icon: 'shield',
    kind: 'prompt',
    claudeNative: true,
    description: 'Offene Änderungen auf Sicherheitslücken prüfen',
    template:
      'Perform a security review of the pending changes (git diff): injection, authorization gaps, secret leaks, unsafe deserialization, SSRF. Report findings with severity and concrete fixes.',
  },
  {
    name: 'commit',
    label: 'Änderungen committen',
    icon: 'branch',
    kind: 'prompt',
    description: 'Änderungen mit einer passenden Commit-Nachricht sichern',
    template:
      'Stage the appropriate files and create a git commit for the current changes with a clear, well-scoped commit message. Show the result.',
  },
  {
    name: 'test',
    label: 'Tests ausführen',
    icon: 'check',
    kind: 'prompt',
    description: 'Die Tests ausführen und gefundene Fehler beheben',
    template:
      "Run this project's test suite, report any failures, then fix them and re-run until green.",
  },
  {
    name: 'fix',
    label: 'Fehler beheben',
    icon: 'wrench',
    kind: 'prompt',
    usage: '/fix <Beschreibung>',
    description: 'Ein beschriebenes Problem finden und beheben',
    template: 'Fix the following issue in this codebase: {args}. Verify the fix.',
  },
  {
    name: 'explain',
    label: 'Code erklären',
    icon: 'book',
    kind: 'prompt',
    usage: '/explain <Bereich>',
    description: 'Aufbau und Funktionsweise von Code erklären',
    template: 'Explain how {args} works in this codebase: architecture, data flow and key functions.',
  },
  {
    name: 'refactor',
    label: 'Code überarbeiten',
    icon: 'refresh',
    kind: 'prompt',
    usage: '/refactor <Bereich>',
    description: 'Code verbessern, ohne sein Verhalten zu ändern',
    template:
      'Refactor {args} to improve clarity and maintainability without changing behavior. Run the tests afterwards if available.',
  },
  {
    name: 'documentation',
    label: 'Code dokumentieren',
    icon: 'doc',
    kind: 'prompt',
    usage: '/documentation <Bereich>',
    description: 'Dokumentation erstellen oder aktualisieren',
    keywords: ['code', 'dokumentation', 'documentation', 'readme'],
    template: 'Write or update documentation for {args}.',
  },
  {
    name: 'debug',
    label: 'Problem untersuchen',
    icon: 'search',
    kind: 'prompt',
    usage: '/debug <Fehler>',
    description: 'Die Ursache eines Problems ermitteln und beheben',
    template: 'Debug this problem: {args}. Find the root cause, explain it, then fix it.',
  },
  {
    name: 'excalidraw',
    label: 'Diagramm zeichnen',
    icon: 'image',
    kind: 'prompt',
    usage: '/excalidraw <Beschreibung>',
    description: 'Eine Mindmap oder ein Diagramm auf der Excalidraw-Zeichenfläche erstellen',
    template:
      'Draw this on the Excalidraw canvas in Cortex — answer with one cortex-excalidraw block as described in the brief, pick the layout that fits best: {args}',
  },
  {
    name: 'agent-swarm',
    label: 'Agenten-Schwarm',
    icon: 'swarm',
    kind: 'prompt',
    usage: '/agent-swarm <Auftrag>',
    description: 'Mehrere Agenten zugleich auf eine Aufgabe ansetzen',
    keywords: ['schwarm', 'swarm', 'agenten', 'team', 'parallel', 'rollen'],
    template:
      'Answer with exactly one cortex-widget block of type agent-swarm, as the brief describes, and at most one short sentence around it. '
      + 'Propose the roles that fit the task and set count. Do not start anything and do not do the work yourself — '
      + 'the user sets the number, picks the agents and presses Start in the card. Task: {args}',
    emptyArgs: '(none was given — leave the "task" field out so the card can ask for it)',
  },
];

export interface SlashMatch {
  cmd: SlashCommand;
  args: string;
}

/** Custom (user-defined) commands take precedence over built-ins. */
export function matchSlashCommand(text: string, custom: SlashCommand[] = []): SlashMatch | undefined {
  const m = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return undefined;
  const cmd =
    custom.find((c) => c.name === m[1]) ?? SLASH_COMMANDS.find((c) => c.name === m[1]);
  return cmd ? { cmd, args: m[2]?.trim() ?? '' } : undefined;
}

/** Parses a .cortex/commands.json file into prompt-kind slash commands. */
export function parseCommandsFile(
  content: string,
): { ok: true; commands: SlashCommand[] } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(content) as { commands?: unknown };
    if (!Array.isArray(parsed.commands)) return { ok: false, error: 'missing "commands" array' };
    const commands: SlashCommand[] = [];
    for (const entry of parsed.commands) {
      if (entry === null || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(e.name)) continue;
      if (typeof e.template !== 'string' || !e.template.trim()) continue;
      commands.push({
        name: e.name,
        label: typeof e.label === 'string' ? e.label : undefined,
        kind: 'prompt',
        template: e.template,
        description: typeof e.description === 'string' ? e.description : 'Eigener Befehl',
        icon: typeof e.icon === 'string' ? e.icon : undefined,
        keywords: Array.isArray(e.keywords)
          ? e.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
          : undefined,
        usage: typeof e.usage === 'string' ? e.usage : undefined,
      });
    }
    return { ok: true, commands };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export const COMMANDS_TEMPLATE = `{
  "commands": [
    {
      "name": "standup",
      "label": "Tagesrückblick",
      "description": "Die letzten Arbeiten im Projekt zusammenfassen",
      "template": "Summarize the last day of git history in this repository as a short standup update: what changed, what is in progress, any risks."
    },
    {
      "name": "perf",
      "label": "Leistung verbessern",
      "usage": "/perf <Bereich>",
      "description": "Die Leistung messen und optimieren",
      "template": "Analyze the performance of {args}, find the biggest bottleneck and optimize it. Measure before and after."
    }
  ]
}
`;

export function expandSlashCommand(cmd: SlashCommand, args: string): string {
  let template = cmd.template ?? '';
  if (template.includes('{args}')) {
    return template.replace('{args}', args || cmd.emptyArgs || 'the current changes');
  }
  return args ? `${template}\n\nAdditional context: ${args}` : template;
}
