export const NATIVE_SETTINGS = [
  { key: 'editor.fontSize', label: 'Schriftgröße im Editor', group: 'Editor', type: 'number', min: 6, max: 100 },
  { key: 'editor.fontFamily', label: 'Schriftart im Editor', group: 'Editor', type: 'string' },
  { key: 'editor.tabSize', label: 'Tabulatorbreite', group: 'Editor', type: 'number', min: 1, max: 16 },
  { key: 'editor.insertSpaces', label: 'Leerzeichen statt Tabulatoren', group: 'Editor', type: 'boolean' },
  { key: 'editor.wordWrap', label: 'Zeilenumbruch', group: 'Editor', type: 'enum', options: ['off', 'on', 'wordWrapColumn', 'bounded'] },
  { key: 'editor.minimap.enabled', label: 'Minimap anzeigen', group: 'Editor', type: 'boolean' },
  { key: 'editor.lineNumbers', label: 'Zeilennummern', group: 'Editor', type: 'enum', options: ['off', 'on', 'relative', 'interval'] },
  { key: 'editor.formatOnSave', label: 'Beim Speichern formatieren', group: 'Dateien', type: 'boolean' },
  { key: 'files.autoSave', label: 'Automatisch speichern', group: 'Dateien', type: 'enum', options: ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'] },
  { key: 'files.trimTrailingWhitespace', label: 'Leerzeichen am Zeilenende entfernen', group: 'Dateien', type: 'boolean' },
  { key: 'files.insertFinalNewline', label: 'Abschließenden Zeilenumbruch einfügen', group: 'Dateien', type: 'boolean' },
  { key: 'terminal.integrated.fontSize', label: 'Schriftgröße im Terminal', group: 'Terminal', type: 'number', min: 6, max: 100 },
  { key: 'terminal.integrated.cursorStyle', label: 'Terminal-Cursor', group: 'Terminal', type: 'enum', options: ['block', 'line', 'underline'] },
  { key: 'terminal.integrated.scrollback', label: 'Gespeicherte Terminalzeilen', group: 'Terminal', type: 'number', min: 0, max: 100000 },
  // Wie weit ein Agent den Desktop-Browser benutzen darf. Die Regel dahinter
  // steht in AGENTS.md; hier ist der Schalter dazu.
  {
    key: 'cortex.browserAccess',
    label: 'Desktop-Browser für Agenten',
    group: 'KI-Agenten',
    type: 'enum',
    options: ['nie', 'auf-ansage', 'immer'],
    labels: {
      'nie': 'Nie — auch nicht auf Ansage',
      'auf-ansage': 'Nur wenn ich es im Auftrag verlange',
      'immer': 'Immer, wenn der Agent ihn braucht',
    },
  },
  // Die Einstellungsseiten nach Codex schreiben diese Schalter direkt. Jeder
  // davon wirkt schon heute im Host — nur solche gehören in diese Liste.
  { key: 'cortex.terminalLocation', label: 'Standard-Terminalspeicherort', group: 'KI-Agenten', type: 'enum', options: ['panel', 'beside'] },
  { key: 'cortex.activityVerbosity', label: 'Details der Tätigkeiten', group: 'KI-Agenten', type: 'enum', options: ['minimal', 'compact', 'detailed'] },
  { key: 'cortex.pollUsage', label: 'Nutzungskontingente aktualisieren', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.autoPlanHeavyEdits', label: 'Schwere Änderungen erst planen', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.sizeReasoning', label: 'Denkaufwand je Schritt bemessen', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.codexIdleTimeoutSeconds', label: 'Codex: Wartezeit ohne Aktivität (Sekunden)', group: 'KI-Agenten', type: 'number', min: 30, max: 3600 },
  { key: 'cortex.sendWorkspaceContext', label: 'Arbeitskontext mitschicken', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.frameTasks', label: 'Aufträge rahmen', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.standingInstructions', label: 'Ständige Anweisungen', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.chatWidgets', label: 'Widgets im Chat', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.homeLocation', label: 'Heimatort', group: 'KI-Agenten', type: 'string' },
  { key: 'cortex.verifyChanges', label: 'Änderungen prüfen', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.secondOpinion', label: 'Zweitmeinung', group: 'KI-Agenten', type: 'enum', options: ['never', 'hard', 'always'] },
  { key: 'cortex.databaseStudio.enabled', label: 'Vektor', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.databaseStudio.allowWrites', label: 'Vektor schreibt', group: 'KI-Agenten', type: 'boolean' },
  { key: 'cortex.exokortex.statusIntervalMinutes', label: 'Exokortex-Abfrage', group: 'KI-Agenten', type: 'number', min: 1, max: 120 },
  { key: 'cortex.memory.notes', label: 'Notizzettel pro Chat', group: 'Erinnerung', type: 'boolean' },
  { key: 'cortex.memory.retrieval', label: 'Exokortex-Abruf', group: 'Erinnerung', type: 'enum', options: ['nie', 'erste', 'themenwechsel', 'jede'] },
  { key: 'cortex.memory.hits', label: 'Treffer', group: 'Erinnerung', type: 'number', min: 1, max: 10 },
  { key: 'cortex.memory.budget', label: 'Token-Budget', group: 'Erinnerung', type: 'number', min: 300, max: 4000 },
  { key: 'cortex.memory.threshold', label: 'Mindestrelevanz', group: 'Erinnerung', type: 'enum', options: ['locker', 'normal', 'streng'] },
  { key: 'cortex.memory.helper', label: 'Modell für Notizen', group: 'Erinnerung', type: 'enum', options: ['guenstig', 'aktuell'] },
] as const;
export function validNativeSetting(key: string, value: unknown): boolean {
 const setting = NATIVE_SETTINGS.find(s => s.key === key);
 if (!setting) return false;
 if (setting.type === 'number') return typeof value === 'number' && Number.isInteger(value) && value >= setting.min && value <= setting.max;
 if (setting.type === 'enum') return typeof value === 'string' && (setting.options as readonly string[]).includes(value);
 return typeof value === setting.type;
}
