import type { ComputerHistoryService } from './service.js';
import type { HistoryRequest, HistoryResponse } from './types.js';

type HistoryBackend = Pick<ComputerHistoryService, 'state' | 'configure' | 'requestPermission' | 'delete' | 'clear' | 'ask' | 'dispose'>;
/** A separate UI channel: never write history messages into chat/session/export state. */
export class HistoryBridge<Client> {
  private clients = new Map<Client, { query?: string; from?: number; to?: number }>();
  private disposed = false;
  private notifying?: Promise<void>;
  constructor(private service: HistoryBackend, private post: (client: Client, response: HistoryResponse) => void, private alive: (client: Client) => boolean) {}

  async notify(): Promise<void> {
    if (this.disposed || this.notifying) return this.notifying;
    this.notifying = this.refresh().finally(() => { this.notifying = undefined; });
    return this.notifying;
  }

  private async refresh(error?: string): Promise<void> {
    for (const [client, filter] of this.clients) {
      if (!this.alive(client)) { this.clients.delete(client); continue; }
      try {
        const state = await this.service.state(filter.query, filter.from, filter.to);
        if (!this.disposed && this.clients.get(client) === filter && this.alive(client)) this.post(client, { kind: 'computerHistoryState', state: { ...state, error: state.error ?? error } });
      } catch { /* State reports service errors; never forward raw filesystem/process errors to a chat. */ }
    }
  }

  async handle(request: HistoryRequest, client: Client): Promise<void> {
    if (this.disposed) return;
    if (request.action === 'unsubscribe') { this.clients.delete(client); return; }
    if (request.action === 'state') this.clients.set(client, { query: request.query, from: request.from, to: request.to });
    else if (!this.clients.has(client)) this.clients.set(client, {});
    if (request.action === 'ask') {
      try {
        const result = await this.service.ask(request.question, request.from, request.to);
        if (!this.disposed && this.clients.has(client) && this.alive(client)) this.post(client, { kind: 'computerHistoryAnswer', result, requestId: request.requestId });
      } catch {
        if (!this.disposed && this.clients.has(client) && this.alive(client)) this.post(client, {
          kind: 'computerHistoryAnswer', requestId: request.requestId,
          result: { question: request.question, answer: '', sources: [], error: 'Die lokale Antwort konnte nicht erstellt werden. Es wurde kein Cloudmodell verwendet.' },
        });
      }
      return;
    }
    let error: string | undefined;
    try {
      switch (request.action) {
        case 'configure': await this.service.configure(request.settings); break;
        case 'permission': await this.service.requestPermission(); break;
        case 'delete': await this.service.delete(request.id); break;
        case 'clear': await this.service.clear(); break;
      }
    } catch {
      error = 'Die lokale Aktion konnte nicht abgeschlossen werden. Prüfe den Status und versuche es erneut.';
    }
    await this.refresh(error);
  }

  dispose(): void { this.disposed = true; this.clients.clear(); this.service.dispose(); }
}
