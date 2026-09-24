import type { TranscriptItem } from '../../../src/panel/transcript.js';
import { useAutoOpen } from '../steps.js';

/**
 * The model's checklist, closed. The summary carries what you actually need
 * mid-run — how far along it is and what it is on — and the rows themselves
 * are one click away for when you want them.
 */
export function TaskGroup({ item }: { item: Extract<TranscriptItem, { kind: 'tasks' }> }) {
  const done = item.items.filter((t) => t.status === 'done').length;
  const active = item.items.find((t) => t.status === 'active');
  const { open, onSummaryClick } = useAutoOpen(false);
  return (
    <details class={`tl tl-tasks ${active ? 'tl-live' : ''} task-block`} open={open}>
      <summary class="task-summary" onClick={onSummaryClick}>
        <span class="task-label">tasks</span>
        <span class="task-count">
          {done}/{item.items.length}
        </span>
        <span class="task-bar">
          <span
            class="task-fill"
            style={{ width: `${(done / Math.max(item.items.length, 1)) * 100}%` }}
          />
        </span>
        {active && <span class="task-current">{active.text}</span>}
      </summary>
      <ol class="task-items">
        {item.items.map((task, j) => (
          <li key={j} class={`task-item ${task.status}`}>
            <span class="task-mark">
              {task.status === 'done' ? '✓' : task.status === 'active' ? '▸' : '○'}
            </span>
            <span class="task-text">{task.text}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
