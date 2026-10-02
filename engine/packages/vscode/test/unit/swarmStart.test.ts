/**
 * Wie eine Schwarm-Karte zum Team wird (host/teams.ts). Seit 24.09.2026:
 * automatisch besetzte Rollen arbeiten mit der Freigabe des Nutzers, teilen
 * sich den Projektordner und arbeiten alle auf dem Konto des Chats — bei
 * Claude und Grok ohne externe MCP-Server.
 */
import * as vscode from 'vscode';
import { describe, expect, it, vi } from 'vitest';
import { mentionsSwarm, swarmSections } from '@cortex/core';
import { startSwarm, type TeamsHost } from '../../src/panel/host/teams.js';
import { validateTeam, type AgentTeam } from '../../src/teams/types.js';

function fakeHost() {
  const saved: AgentTeam[] = [];
  const started: Array<{ id: string; task: string }> = [];
  const accounts = [
    { id: 'c1', provider: 'claude', label: 'Business', disabled: false },
    { id: 'g1', provider: 'grok', label: 'Side-Hustle', disabled: false },
    { id: 'x1', provider: 'codex', label: 'Privat', disabled: true },
  ];
  const host = {
    teams: () => ({ refresh() {}, error: undefined, runs: [], teams: saved, revision: 0, save: (team: AgentTeam) => { saved.push(team); } }),
    accounts: { all: () => accounts },
    authHealth: new Map(),
    quota: { availability: () => ({ available: true }) },
    projects: () => [{ path: '/projekt' }],
    startTeam: async (id: string, task: string) => { started.push({ id, task }); },
  } as unknown as TeamsHost;
  return { host, saved, started };
}

describe('Schwarm starten', () => {
  it('setzt alle Rollen auf das Chat-Konto, ohne externe MCP-Server, mit Nutzerfreigabe und geteiltem Ordner', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => 'full'), update: vi.fn() } as never);
    const { host, saved, started } = fakeHost();
    const proposed = ['DK', 'FI', 'CZ'].map(land => ({ name: land, role: `Land ${land}`, instructions: `Nur ${land}` }));
    await startSwarm(host, { kind: 'startSwarm', swarmId: 'swarm-abc-karte', task: 'Politik L3', count: 3, agentIds: [], proposed }, '/projekt', { provider: 'grok', account: 'Side-Hustle', model: 'grok-4.7' });
    const team = saved[0]!;
    expect(team.sharedWorkspace).toBe(true);
    expect(team.projectPath).toBe('/projekt');
    expect(team.agents.map(agent => [agent.name, agent.target.provider, agent.target.account, agent.target.model, agent.permissionMode, agent.mcpServers])).toEqual([
      ['DK', 'grok', 'Side-Hustle', 'grok-4.7', 'full', []],
      ['FI', 'grok', 'Side-Hustle', 'grok-4.7', 'full', []],
      ['CZ', 'grok', 'Side-Hustle', 'grok-4.7', 'full', []],
    ]);
    expect(started).toEqual([{ id: 'swarm-abc-karte', task: 'Politik L3' }]);
  });

  it('lässt die MCP-Auswahl offen, wo der Anbieter sie nicht begrenzen kann', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => 'full'), update: vi.fn() } as never);
    const { host, saved } = fakeHost();
    const codex = host.accounts.all().find(account => account.provider === 'codex')!;
    (codex as { disabled: boolean }).disabled = false;
    await startSwarm(host, { kind: 'startSwarm', swarmId: 'swarm-abc-codex', task: 'Prüfen', count: 2, agentIds: [], proposed: [] }, '/projekt', { provider: 'codex', account: 'Privat' });
    expect(saved[0]!.agents.map(agent => [agent.target.provider, agent.target.account, 'mcpServers' in agent])).toEqual([
      ['codex', 'Privat', false],
      ['codex', 'Privat', false],
    ]);
  });

  it('behält den geteilten Ordner beim Prüfen, lässt ihn sonst weg', () => {
    const base = { id: 't', name: 'T', description: '', instructions: '', agents: [{ id: 'a', name: 'A', role: '', instructions: '', target: { provider: 'claude', account: 'x' }, permissionMode: 'full', skillPaths: [], dependsOn: [] }] };
    expect(validateTeam({ ...base, sharedWorkspace: true }).sharedWorkspace).toBe(true);
    expect('sharedWorkspace' in validateTeam({ ...base, sharedWorkspace: 'ja' })).toBe(false);
  });
});

describe('Schwarm als Pool', () => {
  it('nimmt mehr als 20 Einheiten mit ihren Bereichen und arbeitet in einem Git-Projekt in Worktrees', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const repo = mkdtempSync(join(tmpdir(), 'cortex-pool-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'a.txt'), 'a');
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'add', '.'], { cwd: repo });
    execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', 'commit', '-qm', 'a'], { cwd: repo });
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => 'full'), update: vi.fn() } as never);
    const { host, saved } = fakeHost();
    (host as unknown as { projects: () => Array<{ path: string }> }).projects = () => [{ path: repo }];
    const lands = Array.from({ length: 25 }, (_, i) => `L${i + 1}`);
    const proposed = lands.map(land => ({ name: land, instructions: `Nur ${land}`, owns: [`europa/importer/${land}/**`] }));
    await startSwarm(host, { kind: 'startSwarm', swarmId: 'swarm-abc-pool', task: 'W3', count: 25, agentIds: [], proposed, pool: { concurrency: 12 } }, repo);
    const team = saved[0]!;
    expect(team.pool).toEqual({ concurrency: 12 });
    expect(team.isolation).toBe('worktree');
    expect(team.sharedWorkspace).toBeUndefined();
    expect(team.agents).toHaveLength(25);
    expect(team.agents[24]!.owns).toEqual(['europa/importer/L25/**']);
    expect(team.agents[0]!.instructions).toContain('## Dein Bereich');
    expect(team.instructions).toContain('eigenen Git-Arbeitsordner');
  });

  it('bleibt ohne Git-Projekt oder auf Wunsch im gemeinsamen Ordner', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => 'full'), update: vi.fn() } as never);
    const { host, saved } = fakeHost();
    await startSwarm(host, { kind: 'startSwarm', swarmId: 'swarm-abc-geteilt', task: 'x', count: 2, agentIds: [], proposed: [{ name: 'A' }, { name: 'B' }], isolation: 'shared' }, '/projekt');
    expect(saved[0]!.isolation).toBe('shared');
    expect(saved[0]!.sharedWorkspace).toBe(true);
    expect(saved[0]!.pool).toBeUndefined();
  });
});

describe('Schwarm in freien Worten', () => {
  it('erkennt die Bitte, aber nicht den Slash-Befehl', () => {
    expect(mentionsSwarm('@grok:Side-Hustle/grok-4.6 Okay spawne einen Agent Swarm führe den Prozess weiter.')).toBe(true);
    expect(mentionsSwarm('Nächste Schwarm-Runde: DK L2 und FI L2')).toBe(true);
    expect(mentionsSwarm('Starte Agents Swarm für ein Land')).toBe(true);
    expect(mentionsSwarm('Starte einen Agenten-Schwarm')).toBe(true);
    expect(mentionsSwarm('/agent-swarm Politik für Dänemark')).toBe(false);
    expect(mentionsSwarm('Wie ist der Prozess aufgesetzt?')).toBe(false);
    expect(swarmSections('spawne einen Agent Swarm')[0]!.body).toContain('"start": true');
  });
});

describe('Rollen-Chats', () => {
  it('erkennt ein Kontolimit, aber keinen gewöhnlichen Fehler', async () => {
    const { isLimitError } = await import('../../src/panel/chatViewProvider.js');
    expect(isLimitError('Usage limit reached.\n\nAll 1 account(s) in the chain failed or hit limits.')).toBe(true);
    expect(isLimitError('429 rate_limit_error')).toBe(true);
    expect(isLimitError('Die Datei fehlt.')).toBe(false);
  });
});
