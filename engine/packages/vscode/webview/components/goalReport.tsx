import type { GoalReport } from '../../../core/src/goal/goal.js';
import { Glyph } from './CortexIcons.js';

const LABEL: Record<GoalReport['status'], string> = { continue: 'Als Nächstes', done: 'Ziel erreicht', blocked: 'Braucht dich' };
const ICON: Record<GoalReport['status'], string> = { continue: 'arrow', done: 'check', blocked: 'warn' };

export function goalReportLabel(status: GoalReport['status']): string {
  return LABEL[status];
}

/**
 * Die Statusmeldung am Ende einer Ziel-Runde (`cortex-goal`), als eine Zeile im
 * Text der Antwort: was als Nächstes kommt, was belegt, dass es fertig ist,
 * oder was nur der Nutzer geben kann.
 */
export function GoalReportLine({ report }: { report: GoalReport }) {
  return (
    <div class={`md-goal-report is-${report.status}`} role="status">
      <Glyph name={ICON[report.status]} size={14} />
      <strong>{LABEL[report.status]}</strong>
      {report.note && <span>{report.note}</span>}
    </div>
  );
}
