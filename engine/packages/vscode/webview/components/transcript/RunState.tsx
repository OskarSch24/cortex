import type { Segment, TranscriptItem } from '../../../src/panel/transcript.js';
import { currentActivity } from '../activity.js';
import { useEffect, useState } from 'preact/hooks';
import { formatElapsed } from '../../format/duration.js';

// Keep the host clock across component remounts; never reconstruct sleep time from Date.now.
let activeElapsed = 0;
if (typeof window !== 'undefined') window.addEventListener('message', event => {
  if (event.data?.kind === 'runClock') activeElapsed = event.data.elapsedMs;
  else if (event.data?.kind === 'conversationReset') activeElapsed = 0;
});

/**
 * What the run is doing, and how long it has been doing it — once.
 *
 * The state was being drawn twice: a `thinking` row where the answer was going
 * to appear, and a pinned bar saying the same word again above the composer.
 * It belongs at the head of the reply being written, and it carries the clock
 * so nothing else has to. Which of thinking, writing or working it is doing is
 * the activity line's job one row below — this line only has to say that the
 * run is alive and how long you have been waiting.
 */
export function RunState({ items, segments, activity }: {
  items: TranscriptItem[];
  /** Die laufende Antwort — ihr letzter Schritt sagt, was gerade geschieht. */
  segments?: Segment[];
  /** Was der Host vor dem Lauf meldet (Erinnerungen suchen). */
  activity?: string;
}) {
  const [elapsed, setElapsed] = useState(() => activeElapsed);
  useEffect(() => {
    const update = (event: MessageEvent) => { if (event.data?.kind === 'runClock') setElapsed(event.data.elapsedMs); };
    window.addEventListener('message', update);
    return () => window.removeEventListener('message', update);
  }, []);

  // A pending question outranks everything: nothing is running until it is
  // answered. Only one raised since the latest reply counts — an older one was
  // left behind by a run that already ended.
  let blocked = false;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.kind === 'permission' && !item.answered) {
      blocked = true;
      break;
    }
    if (item?.kind === 'assistant') break;
  }

  return (
    // The transcript is a log, so this is the one place a screen reader is told
    // what is going on — state changes only, never the streamed text.
    <div class={`run-state ${blocked ? 'blocked' : ''}`} role="status">
      {blocked ? 'Wartet auf deine Antwort · ' : `${currentActivity(segments, activity)} · `}
      <span class="run-clock" title="Aktive Laufzeit ohne längere Ruhepausen">{formatElapsed(elapsed)}</span>
    </div>
  );
}
