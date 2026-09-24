import { CronExpressionParser } from 'cron-parser';
import { validateAutomationShape, type AgentAutomation } from './types.js';
import { errorMessage } from '../util/errors.js';

/** Five-field, minute-resolution cron with Vixie day-of-month/day-of-week semantics. */
export function nextCronOccurrence(cron: string, timeZone: string, after: number = Date.now()): number {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some(field => !/^[\d*,/\-]+$/.test(field))) throw new Error('Cron benötigt fünf Felder: Minute Stunde Tag Monat Wochentag. Erlaubt sind Zahlen sowie *, /, - und Kommas.');
  if (!timeZone || timeZone.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(timeZone)) throw new Error('Bitte eine gültige IANA-Zeitzone angeben, zum Beispiel Europe/Berlin.');
  try { new Intl.DateTimeFormat('de-DE', { timeZone }).format(0); }
  catch { throw new Error(`Unbekannte Zeitzone: ${timeZone}`); }
  if (!Number.isFinite(after)) throw new Error('Ungültiger Zeitpunkt für den Zeitplan.');
  try {
    return CronExpressionParser.parse(cron, { currentDate: after, tz: timeZone }).next().getTime();
  } catch (error) {
    throw new Error(`Ungültiger Cron-Zeitplan: ${errorMessage(error)}`);
  }
}

export function validateAutomation(value: unknown): AgentAutomation {
  const result = validateAutomationShape(value);
  if (result.schedule?.enabled) nextCronOccurrence(result.schedule.cron, result.schedule.timeZone);
  return result;
}
