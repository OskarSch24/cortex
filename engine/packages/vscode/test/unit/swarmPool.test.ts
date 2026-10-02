/**
 * Die Schwarm-Karte als Pool (widgets/spec.ts): wann sie einer ist, was sie
 * startet und welche Zahlen Karte und Übersicht für einen Lauf nennen.
 */
import { describe, expect, it } from 'vitest';
import { WIDGET_BRIEF, swarmSections } from '../../../core/src/context/widgetBrief.js';
import { swarmPlan, swarmTally } from '../../webview/components/widgets/spec.js';
import { MAX_PARALLEL, MAX_POOL_CONCURRENCY, MAX_POOL_UNITS, type TeamJob } from '../../src/teams/types.js';

const units = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Land ${i + 1}`, owns: [`europa/${i + 1}/**`] }));

describe('Schwarm-Pool', () => {
  it('bleibt bis 20 Rollen ohne concurrency ein gewöhnlicher Schwarm, agents und units gleich', () => {
    const plan = swarmPlan({ agents: [{ name: 'DK', role: 'Dänemark', owns: [' europa/DK/** ', 'europa/DK/**', ''] }] });
    expect(plan.pool).toBe(false);
    expect(plan.units).toEqual([{ name: 'DK', role: 'Dänemark', owns: ['europa/DK/**'] }]);
    expect(swarmPlan({ units: units(20) }).pool).toBe(false);
    // units geht vor agents.
    expect(swarmPlan({ units: units(2), agents: units(5) }).units).toHaveLength(2);
  });

  it('wird ab 21 Einheiten oder mit concurrency zum Pool, gedeckelt auf die Grenzen', () => {
    const big = swarmPlan({ units: units(185), isolation: 'worktree' });
    expect(big.pool).toBe(true);
    expect(big.units).toHaveLength(185);
    expect(big.concurrency).toBe(MAX_PARALLEL);
    expect(big.isolation).toBe('worktree');
    expect(swarmPlan({ units: units(MAX_POOL_UNITS + 40) }).units).toHaveLength(MAX_POOL_UNITS);
    const small = swarmPlan({ units: units(4), concurrency: 2 });
    expect(small.pool).toBe(true);
    expect(small.concurrency).toBe(2);
    expect(swarmPlan({ units: units(4), concurrency: 999 }).concurrency).toBe(MAX_POOL_CONCURRENCY);
    expect(swarmPlan({ units: units(4), concurrency: 0 }).concurrency).toBe(1);
    // Unbekanntes vom Modell fällt weg, statt den Start zu verderben.
    expect(swarmPlan({ units: units(1), isolation: 'irgendwie' as never }).isolation).toBeUndefined();
    expect(swarmPlan({ units: [null, 'x', { name: 'A', owns: 'nicht-liste' }] as never }).units).toEqual([{ name: 'A' }]);
  });

  it('zählt einen Lauf nach Stand und Verstößen', () => {
    const job = (status: TeamJob['status'], outside?: string[]): TeamJob => ({ agentId: status, agentName: status, status, ...(outside ? { outside } : {}) });
    expect(swarmTally([job('running'), job('waiting'), job('waiting'), job('completed', ['gemeinsam/schema.json']), job('failed'), job('blocked'), job('cancelled')]))
      .toEqual({ running: 1, open: 2, done: 1, failed: 2, stopped: 1, outside: 1 });
  });

  it('beschreibt Einheiten, Bereiche und Worktrees im Brief', () => {
    expect(WIDGET_BRIEF).toContain('units?: [{name, role?, instructions?, owns?: [glob]}]');
    expect(WIDGET_BRIEF).toContain('"isolation": "worktree"');
    expect(WIDGET_BRIEF).toContain('do not split them into rounds');
    expect(swarmSections('starte einen Agent Swarm')[0]!.body).toContain('`units` with `owns`');
  });
});
