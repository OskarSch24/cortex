/**
 * Die Merge-Warteschlange in Karte und Übersicht (widgets/spec.ts): welche
 * Zahlen ein Lauf nennt, welche Knöpfe er anbietet und wann ein beendeter
 * Lauf unter „Hintergrundprozesse“ stehen bleibt.
 */
import { describe, expect, it } from 'vitest';
import { mergeStage, mergeSummary, mergeTally, swarmShown } from '../../webview/components/widgets/spec.js';
import type { TeamJob, TeamRun, UnitMergeState } from '../../src/teams/types.js';

const job = (n: number, status: TeamJob['status'], merge?: UnitMergeState, extra: Partial<TeamJob> = {}): TeamJob => ({
  agentId: `e-${n}`, agentName: `Einheit ${n}`, status, branch: `schwarm/r/e-${n}`, ...(merge ? { merge: { state: merge } } : {}), ...extra,
});
const run = (jobs: TeamJob[], extra: Partial<TeamRun> = {}): TeamRun => ({
  id: 'r', teamId: 'swarm-chat-karte', teamName: 'Schwarm', task: 'Aufgabe', status: 'completed', startedAt: 0, jobs, ...extra,
});
const on = { enabled: true, checks: ['npm test'], targetBranch: 'main' };

describe('Merge-Warteschlange in der Übersicht', () => {
  it('zählt je Stand und nennt die Einheit, die gerade dran ist', () => {
    const tally = mergeTally([
      ...Array.from({ length: 12 }, (_, i) => job(i, 'completed', 'merged')),
      job(20, 'completed', 'waiting'), job(21, 'completed', 'waiting'), job(22, 'completed', 'conflict'),
      job(23, 'completed', 'checks-failed'), job(24, 'completed', 'merging'), job(25, 'running'),
    ]);
    expect(tally).toMatchObject({ merged: 12, waiting: 2, conflict: 1, 'checks-failed': 1, merging: 1, outside: 0, skipped: 0, current: 'Einheit 24' });
    expect(mergeSummary(tally)).toBe('12 übernommen · 2 warten · 1 Konflikt · 1 Prüfung gescheitert · führt Einheit 24 zusammen');
    expect(mergeSummary(mergeTally([job(1, 'completed', 'outside'), job(2, 'completed', 'skipped'), job(3, 'completed', 'waiting'), job(4, 'completed', 'conflict'), job(5, 'completed', 'conflict')])))
      .toBe('1 wartet · 2 Konflikte · 1 außerhalb des Bereichs · 1 ohne Änderung');
    expect(mergeSummary(mergeTally([job(1, 'running')]))).toBe('');
  });

  it('bietet Starten nur ohne laufende Warteschlange und mit fertigen Branches an', () => {
    expect(mergeStage(run([job(1, 'completed'), job(2, 'running')], { status: 'running' }))).toMatchObject({ data: false, canStart: true, pending: false, canAdopt: false });
    expect(mergeStage(run([job(1, 'completed', undefined, { branch: undefined })])).canStart).toBe(false);
    expect(mergeStage(run([job(1, 'failed')])).canStart).toBe(false);
    expect(mergeStage(run([job(1, 'completed')], { merge: on })).canStart).toBe(false);
  });

  it('übernimmt erst, wenn nichts mehr läuft oder wartet und etwas übernommen ist', () => {
    expect(mergeStage(run([job(1, 'completed', 'merged'), job(2, 'running')], { status: 'running', merge: on }))).toMatchObject({ pending: true, canAdopt: false });
    expect(mergeStage(run([job(1, 'completed', 'merged'), job(2, 'completed', 'waiting')], { merge: on }))).toMatchObject({ pending: true, canAdopt: false });
    expect(mergeStage(run([job(1, 'completed', 'merged'), job(2, 'completed', 'conflict')], { merge: on }))).toMatchObject({ data: true, pending: false, canAdopt: true });
    expect(mergeStage(run([job(1, 'completed', 'conflict')], { merge: on })).canAdopt).toBe(false);
    expect(mergeStage(run([job(1, 'completed', 'merged')], { merge: { ...on, adopted: 'failed' } })).canAdopt).toBe(true);
    expect(mergeStage(run([job(1, 'completed', 'merged')], { merge: { ...on, adopted: 'ok' } })).canAdopt).toBe(false);
  });

  it('lässt einen beendeten Lauf stehen, solange die Zusammenführung aussteht', () => {
    expect(swarmShown(run([job(1, 'running')], { status: 'running' }))).toBe(true);
    // Beendet, ohne Worktree-Branches: wie bisher ausgeblendet.
    expect(swarmShown(run([job(1, 'completed', undefined, { branch: undefined })]))).toBe(false);
    // Fertige Branches, Warteschlange noch nicht gestartet: der Start-Knopf muss erreichbar sein.
    expect(swarmShown(run([job(1, 'completed')]))).toBe(true);
    expect(swarmShown(run([job(1, 'completed', 'waiting')], { merge: on }))).toBe(true);
    expect(swarmShown(run([job(1, 'completed', 'merged')], { merge: on }))).toBe(true);
    // Übernommen: weg — außer das Panel hat den Lauf schon gezeigt.
    const adopted = run([job(1, 'completed', 'merged')], { merge: { ...on, adopted: 'ok' } });
    expect(swarmShown(adopted)).toBe(false);
    expect(swarmShown(adopted, new Set(['r']))).toBe(true);
    expect(swarmShown({ ...adopted, merge: { ...on, enabled: false, adopted: 'ok' } })).toBe(false);
  });
});
