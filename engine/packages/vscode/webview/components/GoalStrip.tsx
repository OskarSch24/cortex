import type { ChatGoal } from '../../../core/src/goal/goal.js';
import { formatGoalDuration, goalPauseLabel, roundsLabel } from '../../../core/src/goal/goal.js';
import { vscode } from '../vscodeApi.js';
import { Glyph } from './CortexIcons.js';

/** Was die Leiste über den Stand sagt: Icon, Text, und ob es Aufmerksamkeit braucht. */
function state(goal: ChatGoal, running: boolean): { icon: string; text: string; tone: 'running' | 'attention' | 'quiet' } {
  switch (goal.status) {
    case 'active':
      return running
        ? { icon: 'play', text: `Runde ${goal.rounds + 1} läuft`, tone: 'running' }
        : { icon: 'clock', text: `Runde ${goal.rounds + 1} wartet`, tone: 'quiet' };
    case 'blocked':
      return { icon: 'warn', text: 'Wartet auf dich', tone: 'attention' };
    case 'done':
      return { icon: 'check', text: `Erreicht · ${roundsLabel(goal.rounds)} · ${formatGoalDuration(goal.workMs)}`, tone: 'quiet' };
    default:
      return {
        icon: 'pause',
        text: `Angehalten · ${goalPauseLabel(goal)}`,
        tone: goal.pause === 'user' || goal.pause === 'stopped' ? 'quiet' : 'attention',
      };
  }
}

/** Die Unterzeile: was als Nächstes kommt, was fehlt, oder was belegt, dass es fertig ist. */
function noteLine(goal: ChatGoal): string | undefined {
  if (!goal.note) return undefined;
  if (goal.status === 'done') return `Nachweis: ${goal.note}`;
  if (goal.status === 'blocked') return `Braucht: ${goal.note}`;
  return `Als Nächstes: ${goal.note}`;
}

/**
 * Das Ziel des Chats (`/goal`) über dem Eingabefeld: woran Cortex arbeitet,
 * wie weit es ist, und die drei Griffe — anhalten, weitermachen, beenden.
 */
export function GoalStrip({ goal, running }: { goal?: ChatGoal; running: boolean }) {
  if (!goal) return null;
  const shown = state(goal, running);
  const note = noteLine(goal);
  const act = (action: 'pause' | 'resume' | 'clear') => vscode.postMessage({ kind: 'goalAction', action });
  return (
    <section class={`cx-goal-strip is-${goal.status}`} aria-label="Ziel">
      <div class="cx-goal-row">
        <Glyph name="target" size={16} />
        <div class="cx-goal-text">
          <span class="cx-goal-objective" title={goal.objective}>{goal.objective}</span>
          {note && <span class="cx-goal-note" title={note}>{note}</span>}
        </div>
        <span class={`cx-goal-state tone-${shown.tone}`} role="status" title={shown.text}><Glyph name={shown.icon} size={13} /><span>{shown.text}</span></span>
        {goal.status === 'active' && (
          <button class="cx-goal-action" aria-label="Pausieren" title="Keine weiteren Runden, bis du fortsetzt — die laufende Runde endet noch" onClick={() => act('pause')}>
            <Glyph name="pause" size={14} /><span>Pausieren</span>
          </button>
        )}
        {(goal.status === 'paused' || goal.status === 'blocked') && (
          <button class="cx-goal-action" aria-label="Weiter" title={goal.status === 'blocked' ? 'Ohne Antwort weitermachen' : 'Das Ziel fortsetzen'} onClick={() => act('resume')}>
            <Glyph name="play" size={14} /><span>Weiter</span>
          </button>
        )}
        <button class="cx-icon" title={goal.status === 'done' ? 'Schließen' : 'Ziel beenden'} aria-label={goal.status === 'done' ? 'Ziel schließen' : 'Ziel beenden'} onClick={() => act('clear')}>
          <Glyph name="close" size={14} />
        </button>
      </div>
    </section>
  );
}
