import type { AgentAutomation, AutomationRuntimeState } from '../../src/automations/types.js';
import { useEffect, useState } from 'preact/hooks';
import type { AgentTeam } from '../../src/teams/types.js';
import { Button, Select, Toggle } from '../settings/ui.js';
import { vscode } from '../vscodeApi.js';

type Preset = 'hourly' | 'daily' | 'weekdays' | 'weekly' | 'custom';
const PRESETS = [
  { value: 'hourly', label: 'Stündlich' }, { value: 'daily', label: 'Täglich' },
  { value: 'weekdays', label: 'Werktags' }, { value: 'weekly', label: 'Wöchentlich' },
  { value: 'custom', label: 'Eigener Cron-Ausdruck' },
];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'].map((label, day) => ({ value: String(day), label }));
const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';

function presetFor(cron: string): Preset {
  const [minute, hour, day, month, week] = cron.trim().split(/\s+/);
  if (!/^\d+$/.test(minute ?? '') || day !== '*' || month !== '*') return 'custom';
  if (hour === '*' && week === '*') return 'hourly';
  if (!/^\d+$/.test(hour ?? '')) return 'custom';
  return week === '*' ? 'daily' : week === '1-5' ? 'weekdays' : /^[0-6]$/.test(week ?? '') ? 'weekly' : 'custom';
}

/** Fast form feedback; the host remains authoritative for cron and time-zone validation. */
export function automationFormError(value?: AgentAutomation): string {
  if (!value?.schedule?.enabled && !value?.webhook?.enabled) return '';
  if (!value.task.trim()) return 'Gib einen Auftrag für die Automatisierung ein.';
  if (value.schedule?.enabled) {
    const fields = value.schedule.cron.trim().split(/\s+/);
    if (fields.length !== 5 || fields.some(field => !/^[\d*,/\-]+$/.test(field))) return 'Der Cron-Ausdruck braucht fünf Felder: Minute, Stunde, Tag, Monat und Wochentag.';
    try { new Intl.DateTimeFormat('de-DE', { timeZone: value.schedule.timeZone }).format(); }
    catch { return 'Gib eine gültige Zeitzone ein, zum Beispiel Europe/Berlin.'; }
  }
  return '';
}

export function automationDate(value?: number, timeZone?: string): string {
  if (!value) return 'Noch nicht geplant';
  try { return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(value); }
  catch { return new Date(value).toLocaleString('de-DE'); }
}

export function automationScheduleLabel(schedule?: AgentAutomation['schedule']): string {
  if (!schedule?.enabled) return 'Pausiert';
  const [minute = '0', hour = '0', , , day = '1'] = schedule.cron.trim().split(/\s+/);
  const time = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  switch (presetFor(schedule.cron)) {
    case 'hourly': return `Stündlich zur Minute ${minute.padStart(2, '0')}`;
    case 'daily': return `Täglich um ${time}`;
    case 'weekdays': return `Werktags um ${time}`;
    case 'weekly': return `${WEEKDAYS[Number(day)]?.label ?? 'Wöchentlich'} um ${time}`;
    default: return schedule.cron;
  }
}

export function AgentAutomationEditor({ team, saved, runtime, dirty, onChange }: {
  team: AgentTeam; saved?: AgentTeam; runtime?: AutomationRuntimeState; dirty: boolean;
  onChange: (automation: AgentAutomation) => void;
}) {
  const value = team.automation ?? { task: '' };
  const schedule = value.schedule ?? { enabled: false, cron: '0 9 * * *', timeZone: localZone() };
  const preset = presetFor(schedule.cron);
  const [custom, setCustom] = useState(preset === 'custom');
  useEffect(() => { setCustom(presetFor(team.automation?.schedule?.cron ?? '0 9 * * *') === 'custom'); }, [team.id]);
  const [minute = '0', hour = '9', , , weekday = '1'] = schedule.cron.trim().split(/\s+/);
  const profile = runtime?.profiles[team.id];
  const savedSchedule = saved?.automation?.schedule;
  const savedWebhook = saved?.automation?.webhook;
  const update = (changes: Partial<AgentAutomation>) => onChange({ ...value, ...changes });
  const updateSchedule = (changes: Partial<typeof schedule>) => update({ schedule: { ...schedule, ...changes } });
  const buildCron = (next: Preset, at = `${/^\d+$/.test(hour) ? hour.padStart(2, '0') : '09'}:${/^\d+$/.test(minute) ? minute.padStart(2, '0') : '00'}`, day = /^[0-6]$/.test(weekday) ? weekday : '1') => {
    const [h, m] = at.split(':').map(Number);
    return next === 'hourly' ? `${m || 0} * * * *` : `${m || 0} ${h || 0} * * ${next === 'weekdays' ? '1-5' : next === 'weekly' ? day : '*'}`;
  };
  // A custom expression can equal a preset; retain an explicit editing choice until
  // the user selects another preset or switches profiles.
  const customMode = custom || preset === 'custom';
  const issue = automationFormError(value);
  const active = !!savedSchedule?.enabled || !!savedWebhook?.enabled;
  const lastEvent = profile?.lastEvent;

  return <section class="cx-team-automation" aria-label="Automatisierung">
    <div class="cx-team-section-heading"><div><h3>Automatisierung</h3><p>Lass diesen {team.kind === 'agent' ? 'Agenten' : 'Teamauftrag'} nach Zeitplan oder per Webhook starten.</p></div><span class={`cx-automation-state ${active ? 'active' : ''}`}>{active ? 'Gespeichert aktiv' : 'Pausiert'}</span></div>
    <p class="cx-automation-availability">Läuft, solange Cortex auf diesem Mac geöffnet ist. Der Mac muss wach sein. Webhooks sind lokal auf diesem Mac erreichbar.</p>
    <label class="cx-team-field"><span>Auftrag für die Automatisierung</span><textarea rows={3} maxLength={20000} value={value.task} placeholder="Was soll bei jeder geplanten Aktion oder jedem Webhook erledigt werden?" onInput={event => update({ task: event.currentTarget.value })} /></label>
    <div class="cx-team-control-row"><div><strong>Zeitplan</strong><small>Startet den gespeicherten Auftrag zu festen Zeiten.</small></div><Toggle label="Zeitplan aktivieren" on={!!value.schedule?.enabled} onChange={enabled => updateSchedule({ enabled })} /></div>
    {value.schedule && <div class="cx-automation-schedule">
      <div class="cx-team-fields">
        <div class="cx-team-field"><span>Wiederholung</span><Select label="Wiederholung der Automatisierung" value={customMode ? 'custom' : preset} options={PRESETS} onChange={next => { setCustom(next === 'custom'); updateSchedule({ cron: next === 'custom' ? schedule.cron : buildCron(next as Preset) }); }} /></div>
        <label class="cx-team-field"><span>Zeitzone</span><input aria-label="Zeitzone der Automatisierung" value={schedule.timeZone} placeholder="Europe/Berlin" onInput={event => updateSchedule({ timeZone: event.currentTarget.value })} /></label>
        {customMode ? <label class="cx-team-field cx-automation-cron"><span>Cron-Ausdruck</span><input aria-label="Cron-Ausdruck" value={schedule.cron} placeholder="0 9 * * 1-5" spellcheck={false} onInput={event => updateSchedule({ cron: event.currentTarget.value })} /><small>Minute · Stunde · Tag · Monat · Wochentag</small></label>
          : preset === 'hourly' ? <label class="cx-team-field"><span>Minute der Stunde</span><input aria-label="Minute der Automatisierung" type="number" min="0" max="59" value={minute} onInput={event => updateSchedule({ cron: `${event.currentTarget.value || '0'} * * * *` })} /></label>
          : <label class="cx-team-field"><span>Uhrzeit</span><input aria-label="Uhrzeit der Automatisierung" type="time" value={`${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`} onInput={event => updateSchedule({ cron: buildCron(preset, event.currentTarget.value) })} /></label>}
        {!customMode && preset === 'weekly' && <div class="cx-team-field"><span>Wochentag</span><Select label="Wochentag der Automatisierung" value={weekday} options={WEEKDAYS} onChange={day => updateSchedule({ cron: buildCron('weekly', undefined, day) })} /></div>}
      </div>
      <div class="cx-automation-saved-status"><span>Gespeicherter Zeitplan</span><strong>{savedSchedule?.enabled ? `Nächste Ausführung: ${profile?.nextRunAt ? automationDate(profile.nextRunAt, savedSchedule.timeZone) : 'wird ermittelt'}` : 'Pausiert'}</strong>{savedSchedule?.enabled && <small>{savedSchedule.timeZone}</small>}</div>
    </div>}
    <div class="cx-team-control-row"><div><strong>Webhook</strong><small>Ein authentifizierter HTTP-Aufruf startet den gespeicherten Auftrag.</small></div><Toggle label="Webhook aktivieren" on={!!value.webhook?.enabled} onChange={enabled => update({ webhook: { enabled } })} /></div>
    {(value.webhook || savedWebhook?.enabled) && <div class="cx-automation-webhook">
      {savedWebhook?.enabled && profile?.webhookUrl ? <label class="cx-team-field"><span>Lokale Webhook-Adresse</span><input aria-label="Lokale Webhook-Adresse" readOnly value={profile.webhookUrl} /></label> : <p>{value.webhook?.enabled ? 'Die Adresse wird nach dem Speichern angezeigt.' : 'Webhook ist pausiert.'}</p>}
      <Button icon="copy" disabled={!savedWebhook?.enabled || !profile?.webhookUrl || dirty} onClick={() => vscode.postMessage({ kind: 'copyTeamWebhook', teamId: team.id })}>Webhook-Aufruf kopieren</Button>
      <small>Der kopierte Aufruf enthält den geheimen Zugriffsschlüssel. Änderungen greifen nach dem Speichern.</small>
    </div>}
    {lastEvent && <p class={`cx-automation-event ${lastEvent.status === 'failed' ? 'error' : ''}`}>Zuletzt {lastEvent.source === 'schedule' ? 'per Zeitplan' : 'per Webhook'}: {automationDate(lastEvent.at)} · {lastEvent.status === 'started' ? 'gestartet' : lastEvent.status === 'skipped' ? 'übersprungen' : 'fehlgeschlagen'}{lastEvent.message ? ` — ${lastEvent.message}` : ''}</p>}
    {(profile?.error || runtime?.error) && <p class="cx-automation-error" role="alert">{profile?.error || runtime?.error}</p>}
    {dirty && <p class="cx-automation-dirty">Änderungen werden erst mit „{team.kind === 'agent' ? 'Agent' : 'Team'} speichern“ übernommen. Bis dahin gilt die gespeicherte Automatisierung.</p>}
    {issue && <p class="cx-automation-error" role="alert">{issue}</p>}
  </section>;
}
