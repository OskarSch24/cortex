import { describe, expect, it } from 'vitest';
import { SLASH_COMMANDS, type SlashCommand } from '../../../core/src/commands/slashCommands.js';
import type { AccountStatusDto } from '../../src/panel/protocol.js';
import { computeSuggestions, uniqueCommands } from '../../webview/components/composerSuggestions.js';

const account = (label: string, overrides: Partial<AccountStatusDto> = {}): AccountStatusDto => ({
  id: label,
  provider: 'claude',
  label,
  authMode: 'managed-home',
  available: true,
  authState: 'ok',
  models: [{ id: 'claude-sonnet-5', label: 'Sonnet 5' }],
  ...overrides,
});

describe('composer suggestions', () => {
  it('offers the complete command registry beyond eight results', () => {
    const suggestions = computeSuggestions('/', [], [], SLASH_COMMANDS);
    expect(suggestions.length).toBeGreaterThan(8);
    expect(suggestions.map(item => item.insert)).toEqual(SLASH_COMMANDS.map(command => `/${command.name}`));
    expect(suggestions.at(-1)?.command).toBe(SLASH_COMMANDS.at(-1));
  });

  it('searches German labels and keywords regardless of capitalization or accents', () => {
    const matches = (query: string) => computeSuggestions(query, [], [], SLASH_COMMANDS).map(item => item.insert);
    expect(matches('/Erinnerungen')).toContain('/memory');
    expect(matches('/RÜCKMELDUNG')).toContain('/feedback');
    expect(matches('/ruckmeldung')).toContain('/feedback');
    expect(matches('/UBERARBEITEN')).toContain('/refactor');
    expect(matches('/u\u0308berarbeiten')).toContain('/refactor');
    expect(matches('/prasentation')).toContain('/templates');
  });

  it('retains the action object and presentation metadata for dispatch', () => {
    const command = SLASH_COMMANDS.find(item => item.name === 'export')!;
    const suggestion = computeSuggestions('/export', [], [], SLASH_COMMANDS)[0];
    expect(suggestion).toMatchObject({
      insert: '/export',
      label: 'Chat exportieren',
      detail: command.description,
      icon: 'download',
      command: { kind: 'action', action: 'exportChat' },
    });
    expect(suggestion?.command).toBe(command);
  });

  it('offers custom overrides once and keeps a custom /settings command a prompt', () => {
    const custom: SlashCommand = {
      name: 'settings', label: 'Konfiguration dokumentieren', description: 'Die Projektkonfiguration erklären',
      kind: 'prompt', template: 'Explain the settings for {args}', icon: 'book',
    };
    const commands = [custom, ...SLASH_COMMANDS, custom];
    expect(uniqueCommands(commands).filter(command => command.name === 'settings')).toEqual([custom]);
    const suggestions = computeSuggestions('/settings', [], [], commands, [], { openSettings: 'Gesperrt' });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.command).toBe(custom);
    expect(suggestions[0]?.command?.kind).toBe('prompt');
    expect(suggestions[0]?.command?.action).toBeUndefined();
    expect(suggestions[0]?.disabled).toBeUndefined();
  });

  it('falls back to usage or command name and a prompt icon for older custom commands', () => {
    const commands: SlashCommand[] = [
      { name: 'standup', kind: 'prompt', description: 'Tagesrückblick', usage: '/standup <Zeitraum>', template: 'Summarize {args}' },
      { name: 'hello', kind: 'prompt', description: 'Begrüßung', template: 'Hello' },
    ];
    expect(computeSuggestions('/', [], [], commands)).toMatchObject([
      { label: '/standup <Zeitraum>', icon: 'code' },
      { label: '/hello', icon: 'code' },
    ]);
  });

  it('excludes unavailable, expired and review-only accounts from account and model mentions', () => {
    const accounts = [
      account('ready'),
      account('limited', { available: false }),
      account('expired', { authState: 'expired' }),
      account('reviewer', { reviewOnly: true }),
    ];
    expect(computeSuggestions('@', accounts, [], [], ['Drive']).map(item => item.insert))
      .toEqual(['@Drive', '@claude:ready']);
    expect(computeSuggestions('@claude:ready/sonnet', accounts, [], [])).toMatchObject([
      { insert: '@claude:ready/claude-sonnet-5', label: 'Sonnet 5', provider: 'claude' },
    ]);
    for (const blocked of ['limited', 'expired', 'reviewer']) {
      expect(computeSuggestions(`@claude:${blocked}/`, accounts, [], [])).toEqual([]);
    }
  });

  it('shows pinned-chat state and explains actions that are temporarily unavailable', () => {
    const unavailable = { archiveChat: 'Warte, bis der laufende Auftrag beendet ist.' };
    const suggestions = computeSuggestions('/', [], [], SLASH_COMMANDS, [], unavailable, true);
    expect(suggestions.find(item => item.insert === '/pin')).toMatchObject({
      label: 'Chat lösen',
      command: { action: 'pinChat' },
      detail: 'Diesen Chat aus den angehefteten Chats lösen',
    });
    expect(suggestions.find(item => item.insert === '/archive')?.disabled).toBe(unavailable.archiveChat);
    expect(suggestions.find(item => item.insert === '/settings')?.disabled).toBeUndefined();
    expect(computeSuggestions('/pin', [], [], SLASH_COMMANDS)[0]?.label).toBe('Chat anpinnen');
  });
});
