import type { AdapterEvent } from '../types.js';
import type { RunRequest } from './adapter.js';
import type { EventQueue } from './jsonRpc.js';
import { PermissionGate } from './permission.js';

/**
 * Die Freigaben eines Laufs, so wie Codex und die ACP-Agenten sie brauchen:
 * offene Fragen landen als Ereignis im Lauf, die Antwort des Nutzers kommt
 * über `req.handle.respondPermission` zurück — aber nur für eine Frage, die
 * noch offen ist, und nur solange der Lauf nicht beendet ist.
 */

export const DENIAL_DEFERRED_NOTICE = 'Die Aktion wurde abgelehnt. Deine Begründung wird mit der nächsten Nachricht an den Agenten übergeben.';

/** Die Begründung einer Ablehnung geht mit der nächsten Nachricht an den Agenten. */
export function deferDenial(events: EventQueue<AdapterEvent>, reason: string): void {
  events.push({ type: 'deferred-instruction', text: reason });
  events.push({ type: 'notice', text: DENIAL_DEFERRED_NOTICE });
}

export interface RunGate {
  gate: PermissionGate;
  /** Beim Laufende: nichts mehr annehmen, offene Fragen schließen. */
  close(): void;
}

export function createRunGate(options: {
  req: RunRequest;
  events: EventQueue<AdapterEvent>;
  /** Ob der Nutzer gefragt wird (sonst entscheidet der Modus). */
  ask: boolean;
  finished: () => boolean;
  /** Eine Ablehnung mit Begründung — getrimmt, nie leer. */
  onDenialReason: (id: string, reason: string) => void;
}): RunGate {
  const { req, events } = options;
  const pendingUserPermissions = new Set<string>();
  const gate = new PermissionGate({
    mode: req.permissionMode,
    ask: options.ask,
    emit: (request) => { pendingUserPermissions.add(request.id); events.push({ type: 'permission', request }); },
    resolved: (id, allowed) => { pendingUserPermissions.delete(id); events.push({ type: 'permission-resolved', id, allowed }); },
  });
  if (req.handle) req.handle.respondPermission = (id, decision) => {
    if (options.finished() || !pendingUserPermissions.delete(id)) return;
    // Capture only a real user response, synchronously before a possible Stop.
    // Automatic safe-mode/closed-gate reasons are not user instructions.
    if (decision.outcome === 'deny' && decision.reason?.trim()) {
      options.onDenialReason(id, decision.reason.trim());
    }
    gate.respond(id, decision);
  };
  return {
    gate,
    close: () => {
      pendingUserPermissions.clear();
      gate.close();
    },
  };
}
