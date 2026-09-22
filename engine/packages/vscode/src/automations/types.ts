/** Saved trigger settings. Credentials and execution state are deliberately separate. */
export interface AgentAutomation {
  task: string;
  schedule?: { enabled: boolean; cron: string; timeZone: string };
  webhook?: { enabled: boolean };
}

export interface AutomationSource {
  kind: 'schedule' | 'webhook';
  id: string;
  scheduledAt?: number;
}

export interface AutomationEvent {
  at: number;
  source: 'schedule' | 'webhook';
  status: 'started' | 'skipped' | 'failed';
  message?: string;
  runId?: string;
}

export interface AutomationProfileState {
  nextRunAt?: number;
  lastEvent?: AutomationEvent;
  webhookUrl?: string;
  error?: string;
}

export interface AutomationRuntimeState {
  profiles: Record<string, AutomationProfileState>;
  owner: boolean;
  error?: string;
}

/** Browser-safe shape validation; cron/time-zone semantics are checked by the host. */
export function validateAutomationShape(value: unknown): AgentAutomation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige geplante Aktion.');
  const input = value as Record<string, unknown>;
  if (typeof input.task !== 'string' || input.task.length > 20_000) throw new Error('Der geplante Auftrag darf höchstens 20.000 Zeichen enthalten.');
  const result: AgentAutomation = { task: input.task.trim() };
  if (input.schedule !== undefined) {
    if (!input.schedule || typeof input.schedule !== 'object' || Array.isArray(input.schedule)) throw new Error('Ungültiger Zeitplan.');
    const schedule = input.schedule as Record<string, unknown>;
    if (typeof schedule.enabled !== 'boolean' || typeof schedule.cron !== 'string' || schedule.cron.length > 128 || typeof schedule.timeZone !== 'string' || schedule.timeZone.length > 100) throw new Error('Zeitplan, Cron-Ausdruck und Zeitzone sind ungültig.');
    result.schedule = { enabled: schedule.enabled, cron: schedule.cron.trim(), timeZone: schedule.timeZone.trim() };
  }
  if (input.webhook !== undefined) {
    if (!input.webhook || typeof input.webhook !== 'object' || Array.isArray(input.webhook) || typeof (input.webhook as Record<string, unknown>).enabled !== 'boolean') throw new Error('Ungültige Webhook-Einstellung.');
    result.webhook = { enabled: (input.webhook as { enabled: boolean }).enabled };
  }
  if ((result.schedule?.enabled || result.webhook?.enabled) && !result.task) throw new Error('Für einen Zeitplan oder Webhook ist ein gespeicherter Auftrag erforderlich.');
  return result;
}
