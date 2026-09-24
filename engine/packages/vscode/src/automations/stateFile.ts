import { chmodSync, readFileSync } from 'node:fs';
import type { AutomationEvent } from './types.js';
import { errorMessage } from '../util/errors.js';
import { writeFileAtomic } from '../util/atomicWrite.js';

/** Die Datei `agent-automations.json`: je Profil Zeitplan-Cursor, Webhook-Token und die letzten Auslösungen. */
export interface Claim {
  key: string;
  at: number;
  source: 'schedule' | 'webhook';
  status: 'claimed' | 'started' | 'skipped' | 'failed';
  message?: string;
  runId?: string;
}
export interface SavedProfile {
  signature: string;
  nextRunAt?: number;
  token?: string;
  lastEvent?: AutomationEvent;
  error?: string;
  claims: Claim[];
}
export interface SavedState {
  version: 1;
  port?: number;
  listening?: boolean;
  error?: string;
  profiles: Record<string, SavedProfile>;
}

export const CLAIM_LIMIT = 256;
export const profileIdPattern = /^[a-zA-Z0-9_-]{1,160}$/;
export const errorText = (error: unknown): string => errorMessage(error).slice(0, 1000);
export const initialState = (): SavedState => ({ version: 1, profiles: Object.create(null) as SavedState['profiles'] });

/** Liest und prüft den gespeicherten Stand; fehlt die Datei, ist es der leere. Setzt die Rechte auf 0600. */
export function readStateFile(path: string): SavedState {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState();
    // JSON parser diagnostics can quote a secret near the malformed byte.
    throw new Error(`Gespeicherte Auslöser konnten nicht gelesen werden: ${error instanceof SyntaxError ? 'Die Datei enthält ungültiges JSON.' : errorText(error)}`);
  }
  const state = parsed as SavedState;
  if (!state || state.version !== 1 || !state.profiles || typeof state.profiles !== 'object' || Array.isArray(state.profiles)) throw new Error('Die Datei der geplanten Aktionen ist beschädigt.');
  if (state.port !== undefined && (!Number.isInteger(state.port) || state.port < 1 || state.port > 65535)) throw new Error('Ungültiger gespeicherter Webhook-Port.');
  if ((state.listening !== undefined && typeof state.listening !== 'boolean') || (state.error !== undefined && typeof state.error !== 'string')) throw new Error('Der gespeicherte Webhook-Status ist beschädigt.');
  for (const [id, saved] of Object.entries(state.profiles)) {
    if (!profileIdPattern.test(id) || !saved || typeof saved.signature !== 'string' || !Array.isArray(saved.claims) || saved.claims.length > CLAIM_LIMIT || (saved.nextRunAt !== undefined && !Number.isFinite(saved.nextRunAt)) || (saved.token !== undefined && !/^[a-f0-9]{64}$/.test(saved.token))) throw new Error('Ein gespeicherter Auslöser ist beschädigt.');
    for (const claim of saved.claims) if (!claim || typeof claim.key !== 'string' || !Number.isFinite(claim.at) || !['schedule', 'webhook'].includes(claim.source) || !['claimed', 'started', 'skipped', 'failed'].includes(claim.status)) throw new Error('Ein gespeicherter Auslösungsverlauf ist beschädigt.');
    if (saved.lastEvent) {
      const event = saved.lastEvent;
      if (!Number.isFinite(event.at) || !['schedule', 'webhook'].includes(event.source) || !['started', 'skipped', 'failed'].includes(event.status) || (event.message !== undefined && typeof event.message !== 'string') || (event.runId !== undefined && typeof event.runId !== 'string')) throw new Error('Der gespeicherte Auslösungsstatus ist beschädigt.');
      saved.lastEvent = { at: event.at, source: event.source, status: event.status, ...(event.message ? { message: event.message } : {}), ...(event.runId ? { runId: event.runId } : {}) };
    }
  }
  state.profiles = Object.assign(Object.create(null), state.profiles) as SavedState['profiles'];
  chmodSync(path, 0o600);
  return state;
}

/** Schreibt den serialisierten Stand dauerhaft (fsync von Datei und Ordner). */
export function writeStateFile(path: string, serialized: string): void {
  writeFileAtomic(path, serialized, { mode: 0o600, fsync: true, syncDir: true });
}
