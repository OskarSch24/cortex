import type { HistorySettings, NativeHistoryStatus } from './types.js';
import { LOCAL_ERROR } from './messages.js';

/** Steuerzeichen raus, getrimmt, gekürzt — und alles, was kein Text ist, wird leer. */
export const clean = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';

/** Gespeicherte Einstellungen, auf gültige Werte zurechtgestutzt. */
export function settings(value?: Partial<HistorySettings>): HistorySettings {
  return {
    enabled: value?.enabled === true,
    allowedApps: Array.isArray(value?.allowedApps) ? [...new Set(value.allowedApps.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9._-]{1,300}$/.test(id)))].slice(0, 100) : [],
    retentionDays: typeof value?.retentionDays === 'number' && Number.isFinite(value.retentionDays) ? Math.max(1, Math.min(90, Math.round(value.retentionDays))) : 30,
  };
}

/** Die Antwort des nativen Helfers auf `status`/`permission`, geprüft und gekürzt. */
export function nativeStatus(value: unknown): NativeHistoryStatus {
  const result = value as NativeHistoryStatus | undefined;
  if (!result || typeof result.permission !== 'boolean' || !['available', 'unavailable'].includes(result.model) || !Array.isArray(result.apps)) throw new Error(LOCAL_ERROR);
  return {
    permission: result.permission,
    model: result.model,
    modelReason: clean(result.modelReason, 500) || undefined,
    apps: result.apps.filter(app => app && typeof app.id === 'string' && typeof app.name === 'string' && typeof app.supported === 'boolean')
      .slice(0, 300).map(app => ({ id: clean(app.id, 300), name: clean(app.name, 300), supported: app.supported, reason: clean(app.reason, 300) || undefined })),
  };
}
