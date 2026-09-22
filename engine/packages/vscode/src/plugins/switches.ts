/**
 * Plugins ausschalten, ohne sie zu entfernen — wie in Cursor und VS Code.
 *
 * Der Schalter liegt in Cortex, nicht in mcp.json: die Datei kann in einem
 * Projekt liegen und mit anderen geteilt werden, und ob du ein Plugin gerade
 * benutzen willst, ist deine Sache. Schlüssel und Anmeldung bleiben dabei, wo
 * sie sind; ein ausgeschalteter Server geht nur in kein Profil.
 */
export interface SwitchMemory {
  get<T>(key: string, fallback: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

const KEY = 'cortex.plugins.disabled';

export class PluginSwitches {
  private listeners: Array<() => void> = [];

  constructor(private memory: SwitchMemory) {}

  disabled(): string[] {
    return this.memory.get<string[]>(KEY, []);
  }

  isDisabled(server: string): boolean {
    return this.disabled().includes(server);
  }

  async set(server: string, enabled: boolean): Promise<void> {
    const next = new Set(this.disabled());
    if (enabled) next.delete(server);
    else next.add(server);
    await this.memory.update(KEY, [...next].sort());
    for (const listener of this.listeners) listener();
  }

  onDidChange(listener: () => void): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => (this.listeners = this.listeners.filter((l) => l !== listener)) };
  }
}

let current: PluginSwitches | undefined;
export const setPluginSwitches = (switches: PluginSwitches | undefined) => (current = switches);
export const currentPluginSwitches = () => current;
