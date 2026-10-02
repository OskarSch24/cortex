/**
 * Slash commands, Claude-style but provider-agnostic:
 * - kind 'action': handled by the host UI (open panels, clear chat...)
 * - kind 'prompt': routed to the model. When the target is Claude and the
 *   command is claudeNative, the raw "/name args" passes through so Claude
 *   Code runs its own richer built-in; every other provider gets the
 *   equivalent English template.
 * - kind 'goal': `/goal` — the host keeps sending rounds until the model
 *   proves the task done (see goal/goal.ts). It wraps whatever else the
 *   message asks for, commands included.
 *
 * A message may carry several commands: an action only at its very start,
 * prompt commands and `/goal` anywhere in its first paragraph (see
 * `parseSlashCommands`).
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
  | 'openTerminal'
  | 'mergeQueue';

export interface SlashCommand {
  name: string;
  /** Human-readable picker title; the slash command itself keeps its stable name. */
  label?: string;
  description: string;
  /** Icon name understood by the host UI. */
  icon?: string;
  /** Additional search terms, independent of the command name and label. */
  keywords?: string[];
  kind: 'action' | 'prompt' | 'goal';
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
    name: 'merge-queue', label: 'Zusammenführen', kind: 'action', action: 'mergeQueue', icon: 'branch',
    usage: '/merge-queue [Prüfbefehl … | übernehmen | aus]',
    description: 'Fertige Schwarm-Einheiten der Reihe nach zusammenführen und prüfen',
    keywords: ['merge', 'zusammenführen', 'schwarm', 'branches', 'warteschlange', 'übernehmen'],
  },
  {
    name: 'goal',
    label: 'Ziel verfolgen',
    icon: 'target',
    kind: 'goal',
    usage: '/goal <Aufgabe> · /goal pause · /goal weiter · /goal aus',
    description: 'An einer Aufgabe dranbleiben, bis sie nachweislich erledigt ist',
    keywords: ['ziel', 'dranbleiben', 'fertig', 'bis fertig', 'autonom', 'selbstständig', 'weiterarbeiten', 'schleife', 'loop', 'goal'],
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
    name: 'remotion',
    label: 'Video erstellen',
    icon: 'play',
    kind: 'prompt',
    usage: '/remotion <Beschreibung>',
    description: 'Ein Video mit Remotion bauen — live in der Seitenleiste, fertig als MP4',
    template:
      'Produce this video with Remotion in the video folder named in the brief — Cortex shows it live in the side panel. Build the scenes, then render it to out/: {args}',
    emptyArgs: 'a short, polished video from the attached material',
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

/**
 * A command word standing on its own: after the start, a space or an opening
 * bracket, and before a space, closing punctuation or the end — so neither
 * `src/test` nor `/test/unit` nor a URL counts.
 */
const COMMAND_WORD = /(^|[\s([{])\/([a-z][a-z0-9-]*)(?=$|[\s)\]}.,;:!?])/g;

/**
 * Where commands still count: the first paragraph. Pasted material — a log, a
 * list of routes — comes after a blank line, and its `GET /test` is text, not
 * an order. The composer offers the picker only here, too.
 */
export function commandZoneEnd(text: string): number {
  const blank = /\n[ \t]*\n/.exec(text);
  return blank ? blank.index : text.length;
}

/** Code the user marked as code keeps its slashes: `…` and ```…``` are blanked out before scanning. */
function blankCode(text: string): string {
  return text.replace(/```[\s\S]*?(?:```|$)|`[^`\n]*`/g, (code) => ' '.repeat(code.length));
}

interface CommandWord {
  start: number;
  end: number;
  cmd: SlashCommand;
}

function commandWords(text: string, custom: SlashCommand[]): CommandWord[] {
  const lookup = (name: string) => custom.find((c) => c.name === name) ?? SLASH_COMMANDS.find((c) => c.name === name);
  const lead = text.length - text.trimStart().length;
  const words: CommandWord[] = [];
  for (const m of blankCode(text.slice(0, commandZoneEnd(text))).matchAll(COMMAND_WORD)) {
    const start = m.index + m[1]!.length;
    const cmd = lookup(m[2]!);
    // An action (open a panel, archive …) only ever counted at the very start.
    if (!cmd || (cmd.kind === 'action' && start !== lead)) continue;
    words.push({ start, end: start + 1 + m[2]!.length, cmd });
  }
  return words;
}

/** The text without these command words, and without the gap each one leaves. */
function withoutWords(text: string, words: CommandWord[]): string {
  const zone = commandZoneEnd(text);
  let head = '';
  let at = 0;
  for (const word of words) {
    let { start, end } = word;
    if (text[end] === ' ' || text[end] === '\t') end++;
    else if (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
    head += text.slice(at, Math.max(start, at));
    at = end;
  }
  head += text.slice(at, zone);
  return (head.trim() + text.slice(zone)).trim();
}

export interface SlashParse {
  /** Every command the message carries, in order, each once. */
  commands: SlashCommand[];
  /** The message without its command words — what the commands are about. */
  rest: string;
}

/**
 * Every command a message carries. An action counts only at the very start,
 * as it always has; prompt commands and `/goal` count anywhere in the first
 * paragraph, so `/goal /test` and `Bitte /review und /security-review` both
 * work. Custom commands win over built-ins, as in `matchSlashCommand`.
 */
export function parseSlashCommands(text: string, custom: SlashCommand[] = []): SlashParse {
  const words = commandWords(text, custom);
  const commands = words.map((word) => word.cmd).filter((cmd, i, all) => all.findIndex((c) => c.name === cmd.name) === i);
  return { commands, rest: withoutWords(text, words) };
}

/** Does the message carry this command — as a command, not as a word in its text? */
export function hasSlashCommand(text: string, name: string, custom: SlashCommand[] = []): boolean {
  return commandWords(text, custom).some((word) => word.cmd.name === name);
}

/** The message with only the commands of one kind taken out — `/goal`'s task keeps its `/test`. */
export function withoutSlashKind(text: string, kind: SlashCommand['kind'], custom: SlashCommand[] = []): string {
  return withoutWords(text, commandWords(text, custom).filter((word) => word.cmd.kind === kind));
}

/** A command's template about `args`; says whether it had a place for them. */
function fillTemplate(cmd: SlashCommand, args: string): { text: string; tookArgs: boolean } {
  const template = cmd.template ?? '';
  return template.includes('{args}')
    ? { text: template.replace('{args}', args || cmd.emptyArgs || 'the current changes'), tookArgs: true }
    : { text: template, tookArgs: false };
}

/**
 * What the model is asked once the commands in a message are resolved.
 * - One command at the start and nothing else: as before — with `native`,
 *   Claude's own built-in where it has one, otherwise the template.
 * - Several: every template, in order, all about the rest of the message.
 * - `/goal` adds nothing here; the goal brief carries it (goal/goal.ts).
 */
export function expandSlashCommands(text: string, custom: SlashCommand[] = [], options: { native?: boolean } = {}): string {
  const { commands, rest } = parseSlashCommands(text, custom);
  const prompts = commands.filter((cmd) => cmd.kind === 'prompt');
  const goal = commands.some((cmd) => cmd.kind === 'goal');
  if (prompts.length === 0) return goal ? rest : text;
  if (prompts.length === 1 && !goal) {
    const single = matchSlashCommand(text, custom);
    if (single && single.cmd === prompts[0]) {
      return options.native && single.cmd.claudeNative ? text : expandSlashCommand(single.cmd, single.args);
    }
  }
  if (prompts.length === 1) return expandSlashCommand(prompts[0]!, rest);
  const steps = prompts.map((cmd) => fillTemplate(cmd, rest));
  return [
    'Several commands in one message — carry out all of them, in this order:',
    ...steps.map((step, i) => `${i + 1}. ${step.text}`),
    ...(rest && steps.some((step) => !step.tookArgs) ? ['', `The user's own words: ${rest}`] : []),
  ].join('\n');
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
