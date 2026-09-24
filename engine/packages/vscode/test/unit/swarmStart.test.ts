/**
 * Wie eine Schwarm-Karte zum Team wird (host/teams.ts). Seit 24.09.2026:
 * automatisch besetzte Rollen arbeiten mit der Freigabe des Nutzers, teilen
 * sich den Projektordner und verteilen sich reihum auf die freien Konten —
 * beginnend mit dem Konto des Chats.
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
  it('verteilt Rollen reihum ab dem Chat-Konto, mit Nutzerfreigabe und geteiltem Ordner', async () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => 'full'), update: vi.fn() } as never);
    const { host, saved, started } = fakeHost();
    const proposed = ['DK', 'FI', 'CZ'].map(land => ({ name: land, role: `Land ${land}`, instructions: `Nur ${land}` }));
    await startSwarm(host, { kind: 'startSwarm', swarmId: 'swarm-abc-karte', task: 'Politik L3', count: 3, agentIds: [], proposed }, '/projekt', { provider: 'grok', account: 'Side-Hustle', model: 'grok-4.6' });
    const team = saved[0]!;
    expect(team.sharedWorkspace).toBe(true);
    expect(team.projectPath).toBe('/projekt');
    expect(team.agents.map(agent => [agent.name, agent.target.provider, agent.target.model, agent.permissionMode])).toEqual([
      ['DK', 'grok', 'grok-4.6', 'full'],
      ['FI', 'claude', undefined, 'full'],
      ['CZ', 'grok', 'grok-4.6', 'full'],
    ]);
    expect(started).toEqual([{ id: 'swarm-abc-karte', task: 'Politik L3' }]);
  });

  it('behält den geteilten Ordner beim Prüfen, lässt ihn sonst weg', () => {
    const base = { id: 't', name: 'T', description: '', instructions: '', agents: [{ id: 'a', name: 'A', role: '', instructions: '', target: { provider: 'claude', account: 'x' }, permissionMode: 'full', skillPaths: [], dependsOn: [] }] };
    expect(validateTeam({ ...base, sharedWorkspace: true }).sharedWorkspace).toBe(true);
    expect('sharedWorkspace' in validateTeam({ ...base, sharedWorkspace: 'ja' })).toBe(false);
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
  it('hängen unter ihrem Ursprungs-Chat, sonst bleiben sie an ihrem Platz', async () => {
    const { nestBackground } = await import('../../webview/components/backgroundTasks.js');
    const list = [
      { id: 'r1', parentId: 'main' }, { id: 'r2', parentId: 'main' }, { id: 'main' }, { id: 'andere' }, { id: 'waise', parentId: 'weg' },
    ];
    expect(nestBackground(list).map(entry => `${entry.nested ? '  ' : ''}${entry.id}`)).toEqual(['main', '  r1', '  r2', 'andere', 'waise']);
  });

  it('erkennt ein Kontolimit, aber keinen gewöhnlichen Fehler', async () => {
    const { isLimitError } = await import('../../src/panel/chatViewProvider.js');
    expect(isLimitError('Usage limit reached.\n\nAll 1 account(s) in the chain failed or hit limits.')).toBe(true);
    expect(isLimitError('429 rate_limit_error')).toBe(true);
    expect(isLimitError('Die Datei fehlt.')).toBe(false);
  });
});
