import { useState } from 'preact/hooks';
import { Button } from '../settings/ui.js';
import { useHostMessage } from '../hooks/useHostMessage.js';
import { useTeamsState } from '../hooks/useTeamsState.js';
import { automationDate, automationScheduleLabel } from './AgentAutomationEditor.js';
import { Glyph } from './CortexIcons.js';

export function AgentAutomationsView({ onOpenProfile, onManageAgents }: {
  onOpenProfile: (id: string) => void; onManageAgents: () => void;
}) {
  const state = useTeamsState({ newestOnly: true });
  const [error, setError] = useState('');
  useHostMessage('teamError', msg => setError(msg.message));
  const profiles = state?.teams.filter(team => team.automation?.schedule || team.automation?.webhook) ?? [];
  const active = profiles.filter(team => team.automation?.schedule?.enabled || team.automation?.webhook?.enabled).length;
  const issue = error || state?.automations?.error || state?.error;

  return <main class="cx-teams cx-settings-mode cx-automations-page" aria-label="Geplante Aktionen">
    <div class="cx-teams-page">
      <header class="cx-teams-header"><div><h1>Geplante Aktionen</h1><p>Agenten und Teams nach Zeitplan oder per Webhook ausführen.</p></div><Button kind="primary" icon="plus" onClick={onManageAgents}>Aktion einrichten</Button></header>
      <div class="cx-teams-overview"><span><i class={active ? 'active' : ''} />{active} aktiv</span><span>{profiles.length - active} pausiert</span><button onClick={onManageAgents}><Glyph name="user" size={14} />Agenten verwalten</button></div>
      <p class="cx-automation-availability">Cortex führt Aktionen auf diesem Mac aus, solange die App geöffnet und der Mac wach ist. Webhooks sind nur lokal erreichbar.</p>
      {issue && <div class="cx-team-notice error" role="alert"><Glyph name="shield" size={16} /><span>{issue}</span></div>}
      {!state ? <div class="cx-team-empty" role="status">Geplante Aktionen werden geladen …</div> : profiles.length === 0 ? <div class="cx-team-empty"><Glyph name="clock" size={32} /><h2>Deine nächste Aktion, automatisch</h2><p>Wähle einen Agenten oder ein Team und hinterlege unter „Automatisierung“ einen Auftrag mit Zeitplan oder Webhook.</p><Button onClick={onManageAgents}>Agenten und Teams öffnen</Button></div> : <div class="cx-automation-list">
        {profiles.map(team => {
          const automation = team.automation!;
          const runtime = state.automations?.profiles[team.id];
          const enabled = !!automation.schedule?.enabled || !!automation.webhook?.enabled;
          const event = runtime?.lastEvent;
          const run = state.runs.find(run => run.id === event?.runId);
          return <article class="cx-automation-card" key={team.id} aria-label={`Automatisierung ${team.name}`}>
            <header><span class="cx-automation-card-icon"><Glyph name={team.kind === 'agent' ? 'user' : 'worktree'} size={18} /></span><div><h2>{team.name}</h2><span>{team.kind === 'agent' ? 'Agent' : 'Team'}</span></div><span class={`cx-automation-state ${enabled ? 'active' : ''}`}>{enabled ? 'Aktiv' : 'Pausiert'}</span><Button title={`Automatisierung von ${team.name} bearbeiten`} onClick={() => onOpenProfile(team.id)}>Bearbeiten</Button></header>
            <p class="cx-automation-card-task">{automation.task || 'Kein automatischer Auftrag hinterlegt.'}</p>
            <dl><div><dt>Zeitplan</dt><dd>{automationScheduleLabel(automation.schedule)}{automation.schedule && <small>{automation.schedule.timeZone}</small>}</dd></div><div><dt>Nächste Ausführung</dt><dd>{automation.schedule?.enabled ? runtime?.nextRunAt ? automationDate(runtime.nextRunAt, automation.schedule.timeZone) : 'Wird ermittelt' : '—'}</dd></div><div><dt>Webhook</dt><dd>{automation.webhook?.enabled ? runtime?.webhookUrl ? 'Lokal erreichbar' : 'Wird vorbereitet' : 'Pausiert'}</dd></div><div><dt>Letzte Ausführung</dt><dd>{event ? automationDate(event.at) : 'Noch keine'}{event && <small>{event.source === 'schedule' ? 'Zeitplan' : 'Webhook'} · {run?.status === 'completed' ? 'Abgeschlossen' : run?.status === 'failed' ? 'Fehlgeschlagen' : run?.status === 'cancelled' ? 'Gestoppt' : event.status === 'started' ? 'Gestartet' : event.status === 'skipped' ? 'Übersprungen' : 'Fehlgeschlagen'}</small>}</dd></div></dl>
            {(runtime?.error || event?.message) && <p class={`cx-automation-event ${runtime?.error || event?.status === 'failed' ? 'error' : ''}`}>{runtime?.error || event?.message}</p>}
          </article>;
        })}
      </div>}
    </div>
  </main>;
}
