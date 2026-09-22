import type { SlashAction, SlashCommand } from '../../../core/src/commands/slashCommands.js';
import type { AccountStatusDto } from '../../src/panel/protocol.js';

export interface Suggestion {
  insert: string;
  label: string;
  detail?: string;
  provider?: string;
  icon?: string;
  command?: SlashCommand;
  disabled?: string;
}

const searchable = (value: string) => value.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '');

/** Custom commands shadow built-ins in the picker just as they do on the host. */
export function uniqueCommands(commands: SlashCommand[]): SlashCommand[] {
  return commands.filter((command, index) => commands.findIndex(c => c.name === command.name) === index);
}

export function computeSuggestions(
  token: string,
  accounts: AccountStatusDto[],
  tags: string[],
  commands: SlashCommand[],
  connectors: string[] = [],
  unavailable: Partial<Record<SlashAction, string>> = {},
  pinnedChat = false,
): Suggestion[] {
  if (token.startsWith('/')) {
    const query = searchable(token.slice(1));
    return uniqueCommands(commands).filter(command =>
      [command.name, command.label ?? '', ...(command.keywords ?? [])].some(value => searchable(value).includes(query)),
    ).sort((a, b) => {
      const rank = (command: SlashCommand) => !query || command.name === query ? 0 : command.name.startsWith(query) ? 1 : 2;
      return rank(a) - rank(b);
    }).map(command => ({
      insert: `/${command.name}`,
      label: command.action === 'pinChat' && pinnedChat ? 'Chat lösen' : command.label ?? command.usage ?? `/${command.name}`,
      detail: command.action === 'pinChat' && pinnedChat ? 'Diesen Chat aus den angehefteten Chats lösen' : command.description,
      icon: command.icon ?? (command.kind === 'prompt' ? 'code' : 'bolt'),
      command,
      disabled: command.action ? unavailable[command.action] : undefined,
    }));
  }
  if (token.startsWith('#')) {
    return tags.filter(tag => searchable(tag).startsWith(searchable(token.slice(1))))
      .map(tag => ({ insert: `#${tag}`, label: `#${tag}`, detail: 'Routing-Regel', icon: 'filter' }));
  }
  if (!token.startsWith('@')) return [];
  const query = token.slice(1).toLowerCase();
  const slash = query.indexOf('/');
  if (slash >= 0) {
    const account = accounts.find(a => !a.reviewOnly && a.authState !== 'expired' && a.available && `${a.provider}:${a.label}`.toLowerCase() === query.slice(0, slash));
    const modelQuery = query.slice(slash + 1);
    return (account?.models ?? []).filter(model => model.id.toLowerCase().includes(modelQuery) || model.label.toLowerCase().includes(modelQuery))
      .map(model => ({ insert: `@${account!.provider}:${account!.label}/${model.id}`, label: model.label, detail: model.id, provider: account!.provider }));
  }
  return [
    ...connectors.filter(name => name.toLowerCase().includes(query)).map(name => ({ insert: `@${name}`, label: `@${name}`, detail: 'Konnektor', icon: 'plug' })),
    ...accounts.filter(a => !a.reviewOnly && a.authState !== 'expired' && a.available && `${a.provider}:${a.label}`.toLowerCase().includes(query))
      .map(a => ({ insert: `@${a.provider}:${a.label}`, label: `${a.provider}:${a.label}`, detail: 'Konto · bereit', provider: a.provider })),
  ];
}
