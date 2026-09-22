import { describe, expect, it } from 'vitest';
import {
  SLASH_COMMANDS,
  expandSlashCommand,
  matchSlashCommand,
  parseCommandsFile,
} from '../src/commands/slashCommands.js';

describe('slash commands', () => {
  it('matches a bare command', () => {
    const m = matchSlashCommand('/review');
    expect(m?.cmd.name).toBe('review');
    expect(m?.args).toBe('');
  });

  it('matches a command with arguments', () => {
    const m = matchSlashCommand('/fix the login button crashes on empty input');
    expect(m?.cmd.name).toBe('fix');
    expect(m?.args).toBe('the login button crashes on empty input');
  });

  it('ignores non-commands and unknown commands', () => {
    expect(matchSlashCommand('hello /review')).toBeUndefined();
    expect(matchSlashCommand('/definitely-not-a-command')).toBeUndefined();
    expect(matchSlashCommand('normal prompt')).toBeUndefined();
  });

  it('expands {args} templates', () => {
    const fix = SLASH_COMMANDS.find((c) => c.name === 'fix')!;
    expect(expandSlashCommand(fix, 'null pointer in parser')).toContain('null pointer in parser');
    expect(expandSlashCommand(fix, '')).toContain('the current changes');
  });

  it('appends args as context when the template has no placeholder', () => {
    const review = SLASH_COMMANDS.find((c) => c.name === 'review')!;
    const out = expandSlashCommand(review, 'focus on the auth module');
    expect(out).toContain('git diff');
    expect(out).toContain('focus on the auth module');
  });

  it('claude-native commands are flagged for passthrough', () => {
    for (const name of ['init', 'review', 'security-review']) {
      expect(SLASH_COMMANDS.find((c) => c.name === name)?.claudeNative).toBe(true);
    }
  });

  it('every action command has an action, every prompt command a template', () => {
    expect(new Set(SLASH_COMMANDS.map((cmd) => cmd.name)).size).toBe(SLASH_COMMANDS.length);
    for (const cmd of SLASH_COMMANDS) {
      if (cmd.kind === 'action') expect(cmd.action).toBeDefined();
      else expect(cmd.template).toBeTruthy();
    }
  });

  it('resolves chat controls as host actions instead of model prompts', () => {
    for (const [name, action] of [
      ['archive', 'archiveChat'],
      ['pin', 'pinChat'],
      ['fork', 'forkChat'],
      ['export', 'exportChat'],
      ['compact', 'compactChat'],
      ['model', 'openModel'],
      ['mcp', 'openConnectors'],
    ]) {
      const matched = matchSlashCommand(`/${name}`);
      expect(matched?.cmd.kind).toBe('action');
      expect(matched?.cmd.action).toBe(action);
      expect(matched?.cmd.template).toBeUndefined();
    }
    expect(matchSlashCommand('/share')).toBeUndefined();
    expect(matchSlashCommand('/excalidraw Ablauf')?.cmd.kind).toBe('prompt');
  });

  it('opens artifact template categories while retaining the code documentation prompt', () => {
    for (const [name, action] of [
      ['docs', 'openDocumentTemplates'],
      ['slides', 'openPresentationTemplates'],
      ['sheets', 'openSpreadsheetTemplates'],
    ]) {
      const match = matchSlashCommand(`/${name} Mein Entwurf`);
      expect(match?.cmd.kind).toBe('action');
      expect(match?.cmd.action).toBe(action);
      expect(match?.cmd.template).toBeUndefined();
      expect(match?.args).toBe('Mein Entwurf');
    }
    const documentation = matchSlashCommand('/documentation den Parser');
    expect(documentation?.cmd.kind).toBe('prompt');
    expect(documentation?.cmd.action).toBeUndefined();
    expect(documentation?.cmd.usage).toBe('/documentation <Bereich>');
    expect(expandSlashCommand(documentation!.cmd, documentation!.args))
      .toBe('Write or update documentation for den Parser.');
  });

  it('lets a custom /docs prompt override the document-template action', () => {
    const parsed = parseCommandsFile(JSON.stringify({
      commands: [{ name: 'docs', label: 'Eigene Dokumentation', template: 'Custom docs: {args}' }],
    }));
    if (!parsed.ok) throw new Error(parsed.error);
    const match = matchSlashCommand('/docs den Parser', parsed.commands);
    expect(match?.cmd.kind).toBe('prompt');
    expect(match?.cmd.action).toBeUndefined();
    expect(expandSlashCommand(match!.cmd, match!.args)).toBe('Custom docs: den Parser');
  });

  it('keeps custom picker metadata without allowing commands.json to register host actions', () => {
    const parsed = parseCommandsFile(JSON.stringify({
      commands: [{
        name: 'archive',
        label: 'Projektarchiv dokumentieren',
        description: 'Dateien beschreiben',
        icon: 'book',
        keywords: ['dokumentation', 123, null, 'archiv'],
        kind: 'action',
        action: 'archiveChat',
        claudeNative: true,
        template: 'Document {args}',
      }],
    }));
    if (!parsed.ok) throw new Error(parsed.error);
    const match = matchSlashCommand('/archive Projektdateien', parsed.commands);
    expect(match?.cmd).toMatchObject({
      label: 'Projektarchiv dokumentieren',
      icon: 'book',
      keywords: ['dokumentation', 'archiv'],
      kind: 'prompt',
    });
    expect(match?.cmd.action).toBeUndefined();
    expect(match?.cmd.claudeNative).toBeUndefined();
    expect(expandSlashCommand(match!.cmd, match!.args)).toBe('Document Projektdateien');
  });

  it('ignores invalid optional metadata and keeps older custom files usable', () => {
    const parsed = parseCommandsFile(JSON.stringify({
      commands: [{ name: 'hello', template: 'Hello', label: 42, icon: {}, keywords: 'wrong type' }],
    }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.commands[0]).toMatchObject({
      name: 'hello',
      description: 'Eigener Befehl',
      kind: 'prompt',
    });
    expect(parsed.commands[0]?.label).toBeUndefined();
    expect(parsed.commands[0]?.icon).toBeUndefined();
    expect(parsed.commands[0]?.keywords).toBeUndefined();
  });
});
