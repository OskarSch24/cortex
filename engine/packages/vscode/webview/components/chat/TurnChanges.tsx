import { useEffect, useRef, useState } from 'preact/hooks';
import type { FileDiffDto } from '../../../src/panel/protocol.js';
import type { Segment } from '../../../src/panel/transcript.js';
import { Counts, PathLabel } from '../ChangeCard.js';
import { Icon } from './Icon.js';

/* ── Änderungen eines Auftrags ───────────────────────────────────────── */

export interface TurnFile {
  path: string;
  added?: number;
  removed?: number;
}

/** Die Dateien, die ein Auftrag geschrieben hat, mit den Zeilen aus seinen eigenen Aufrufen. */
export function turnFiles(segments: Segment[]): TurnFile[] {
  const byPath = new Map<string, TurnFile>();
  for (const segment of segments) {
    if (segment.kind !== 'tools') continue;
    for (const step of segment.steps) {
      if ((step.action !== 'write' && step.action !== 'edit') || !step.path) continue;
      const file = byPath.get(step.path) ?? { path: step.path };
      if (step.added !== undefined) file.added = (file.added ?? 0) + step.added;
      if (step.removed !== undefined) file.removed = (file.removed ?? 0) + step.removed;
      byPath.set(step.path, file);
    }
  }
  return [...byPath.values()];
}

/**
 * „3 Dateien bearbeitet“ unter einem Auftrag. Beim Überfahren einer Datei
 * schwebt ihr Diff darüber; Überprüfen öffnet die Prüfansicht, Rückgängig
 * setzt die Dateien dieses Auftrags auf den Stand davor (mit Rückfrage).
 */
export function TurnChanges({ files, diffs, reverted, revertReason, onReview, onRevert, onOpenPath }: {
  files: TurnFile[];
  diffs: FileDiffDto[];
  reverted?: boolean;
  revertReason?: string;
  onReview: () => void;
  onRevert: () => void;
  onOpenPath: (path: string) => void;
}) {
  const [hover, setHover] = useState<{ path: string; top: number }>();
  const [headHover, setHeadHover] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!files.length) return null;
  const git = new Map(diffs.map((d) => [d.path, d]));
  const stat = (f: TurnFile) => {
    const g = git.get(f.path);
    const known = f.added !== undefined || f.removed !== undefined;
    return known ? { added: f.added ?? 0, removed: f.removed ?? 0 } : g ? { added: g.added, removed: g.removed } : {};
  };
  const added = files.reduce((n, f) => n + (stat(f).added ?? 0), 0);
  const removed = files.reduce((n, f) => n + (stat(f).removed ?? 0), 0);
  const shown = hover ? git.get(hover.path) : undefined;
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setHover(undefined), 120); };
  return (
    <div class={`cx-c-card cx-c-changes ${reverted ? 'reverted' : ''}`} ref={card}>
      <div class="cx-c-changes-head">
        <button type="button" class="cx-c-card-head" onClick={onReview} onMouseEnter={() => setHeadHover(true)} onMouseLeave={() => setHeadHover(false)}>
          <span class="cx-c-card-mark"><Icon name="diff" size={17} /></span>
          <span class="cx-c-card-title">
            <strong>{files.length} {files.length === 1 ? 'Datei' : 'Dateien'} bearbeitet</strong>
            {reverted ? <small>Rückgängig gemacht</small>
              : headHover || !(added || removed) ? <small>Änderungen prüfen <Icon name="arrowUpRight" size={12} /></small>
              : <small><Counts added={added} removed={removed} class="cx-c-diffcounts" /></small>}
          </span>
        </button>
        {!reverted && <span title={revertReason}><button type="button" class="cx-c-textbtn" disabled={!!revertReason} aria-label={revertReason ? `Rückgängig nicht verfügbar: ${revertReason}` : 'Rückgängig machen'} onClick={onRevert}>Rückgängig machen<Icon name="undo" size={13} /></button></span>}
        <button type="button" class="cx-c-btn" onClick={onReview}>Überprüfen</button>
      </div>
      <div class="cx-c-changes-list">
        {files.map((f) => {
          const s = stat(f);
          return (
            <button key={f.path} type="button" class="cx-c-changes-row" title={f.path}
              onClick={() => onOpenPath(f.path)}
              onMouseEnter={(e) => {
                clearTimeout(timer.current);
                const row = e.currentTarget as HTMLElement;
                setHover({ path: f.path, top: row.offsetTop });
              }}
              onMouseLeave={leave}>
              <span class="cx-c-path"><PathLabel path={f.path} /></span>
              <Counts added={s.added} removed={s.removed} class="cx-c-diffcounts" />
            </button>
          );
        })}
      </div>
      {hover && shown?.hunks && shown.hunks.length > 0 && (
        <div class="cx-c-diffpop" style={{ top: `${hover.top}px` }} onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={leave}>
          <div class="cx-c-diffpop-head"><span>{shown.path}</span><Counts added={shown.added} removed={shown.removed} class="cx-c-diffcounts" /></div>
          <div class="cx-c-diffpop-body">
            {shown.hunks.flatMap((h) => h.lines).slice(0, 60).map((line, i) => (
              <div key={i} class={`cx-c-diffline ${line.kind}`}>
                <span class="n">{line.line ?? ''}</span>
                <span class="t">{line.text || ' '}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
