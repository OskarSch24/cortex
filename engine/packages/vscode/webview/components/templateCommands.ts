import type { SlashAction } from '../../../core/src/commands/slashCommands.js';

export type ArtifactTemplateCategory = 'dokument' | 'praesentation' | 'tabelle';

export function templateCategoryForAction(action?: SlashAction): ArtifactTemplateCategory | undefined {
  switch (action) {
    case 'openDocumentTemplates': return 'dokument';
    case 'openPresentationTemplates': return 'praesentation';
    case 'openSpreadsheetTemplates': return 'tabelle';
    default: return undefined;
  }
}
