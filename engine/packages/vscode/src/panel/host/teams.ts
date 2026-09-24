import * as vscode from 'vscode';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { QuotaTracker } from '@cortex/core';
import type { AutomationRuntime } from '../../automations/runtime.js';
import type { AutomationSource } from '../../automations/types.js';
import type { TeamRunner } from '../../teams/runner.js';
import type { TeamStore } from '../../teams/store.js';
import type { PermissionMode, Target } from '@cortex/core';
import { MAX_TEAM_AGENTS, validateTeam, type AgentTeam, type TeamAgent, type TeamRun } from '../../teams/types.js';
import type { DomainTable, MessageContext, Msg, PanelHost } from './dispatch.js';

/**
 * Was Agenten, Teams und Automationen vom Provider brauchen. Speicher, Runner
 * und Laufzeit bleiben am Provider: Tests setzen und ersetzen sie dort.
 */
export interface TeamsHost extends PanelHost {
  readonly quota: QuotaTracker;
  readonly authHealth: Map<string, 'ok' | 'expired' | 'unknown'> | undefined;
  readonly automationRuntime: AutomationRuntime | undefined;
  readonly teamRunner: TeamRunner | undefined;
  teams(): TeamStore;
  startAutomations(): Promise<void>;
  startTeam(id: string, task: string, source?: AutomationSource): Promise<TeamRun>;
  pushTeams(webview?: vscode.Webview): void;
}

/**
 * Macht aus einer Schwarm-Karte ein Team und startet es.
 *
 * Der Schwarm wird als gewöhnliches Profil gespeichert: der Runner findet
 * einen Lauf nur über den Speicher, und so bleibt der Schwarm unter „Aktive
 * Agenten“ sicht-, stopp- und wiederholbar. Dieselbe Karte schreibt immer
 * dasselbe Profil, statt bei jedem Start ein neues anzulegen.
 */
export async function startSwarm(host: TeamsHost, msg: Msg<'startSwarm'>, conversationProject?: string, conversationTarget?: Target): Promise<void> {
  const task = msg.task.trim();
  if (!task) throw new Error('Gib einen Auftrag ein, bevor der Schwarm startet.');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(msg.swarmId)) throw new Error('Ungültige Schwarmkennung.');
  const count = Math.min(MAX_TEAM_AGENTS, Math.max(1, Math.floor(msg.count)));
  const store = host.teams();
  store.refresh();
  if (store.error) throw new Error(store.error);
  if (store.runs.some(run => run.teamId === msg.swarmId && run.status === 'running')) throw new Error('Dieser Schwarm arbeitet bereits.');
  // Dieselbe Prüfung wie im Executor, damit eine automatisch besetzte Rolle
  // nicht sofort an einem abgelaufenen oder erschöpften Konto scheitert.
  // Automatisch besetzte Rollen verteilen sich reihum auf alle freien Konten —
  // je Konto laufen höchstens drei zugleich —, beginnend mit dem Konto des Chats.
  const usable = host.accounts.all().filter(account => !account.disabled
    && ['claude', 'codex', 'grok', 'copilot'].includes(account.provider)
    && host.authHealth?.get(account.id) !== 'expired'
    && host.quota.availability(account.id).available)
    .sort((a, b) => Number(b.provider === conversationTarget?.provider && b.label === conversationTarget?.account) - Number(a.provider === conversationTarget?.provider && a.label === conversationTarget?.account));
  // Sie arbeiten mit der Freigabe, die der Nutzer für seine Chats gewählt hat:
  // ein Schwarm soll den Auftrag erledigen, nicht nur darüber berichten.
  const permissionMode = vscode.workspace.getConfiguration('cortex').get<PermissionMode>('permissionMode', 'safe');
  const chosen = msg.agentIds
    .map(id => store.teams.find(team => team.id === id && team.kind === 'agent'))
    .filter((team): team is AgentTeam => !!team);
  if (chosen.length < count && !usable.length) throw new Error('Für die automatisch besetzten Rollen ist kein Konto verfügbar.');
  const agents: TeamAgent[] = [];
  for (let slot = 0; slot < count; slot++) {
    const picked = chosen[slot];
    const role = picked?.agents[0];
    if (picked && role) {
      // Eigene Kopie wie bei „Gespeicherten Agenten hinzufügen“: eine spätere
      // Änderung am Profil soll einen laufenden Schwarm nicht verändern.
      agents.push({ ...structuredClone(role), id: `swarm-agent-${slot + 1}`, name: picked.name, dependsOn: [] });
      continue;
    }
    const proposed = msg.proposed[slot - chosen.length];
    const account = usable[(slot - chosen.length) % usable.length]!;
    const sameAsChat = account.provider === conversationTarget?.provider && account.label === conversationTarget?.account;
    agents.push({
      id: `swarm-agent-${slot + 1}`,
      name: (proposed?.name?.trim() || `Rolle ${slot + 1}`).slice(0, 80),
      role: (proposed?.role ?? '').slice(0, 200),
      instructions: (proposed?.instructions ?? '').slice(0, 20_000),
      target: { provider: account.provider, account: account.label, ...(sameAsChat && conversationTarget?.model ? { model: conversationTarget.model } : {}) },
      permissionMode,
      skillPaths: [],
      dependsOn: [],
    });
  }
  const existing = store.teams.find(team => team.id === msg.swarmId);
  const project = conversationProject && host.projects().some(entry => entry.path === conversationProject)
    ? conversationProject : existing?.projectPath;
  const team = validateTeam({
    id: msg.swarmId,
    kind: 'team',
    name: `Schwarm · ${task.replace(/\s+/g, ' ').slice(0, 60)}`,
    description: 'Aus einer Schwarm-Karte im Chat gestartet.',
    instructions: 'Die anderen Rollen dieses Schwarms arbeiten gleichzeitig im selben Ordner. Bearbeite nur deinen eigenen Teil: ändere, verschiebe oder lösche keine Dateien, die zu einer anderen Rolle gehören, und führe keine Befehle aus, die den ganzen Ordner umbauen (git reset, checkout, clean, Formatierung über alles). Melde am Ende, welche Dateien du angelegt oder geändert hast.',
    sharedWorkspace: true,
    ...(project ? { projectPath: project } : {}),
    agents,
    updatedAt: Date.now(),
  });
  store.save(team, store.revision);
  await host.startTeam(team.id, task);
}

type TeamMutation = 'saveTeam' | 'deleteTeam' | 'startTeam' | 'startSwarm' | 'stopTeam' | 'importAgentMarkdown' | 'exportAgentMarkdown';

/** Alles, was ein Profil ändert oder startet: ein Weg, eine Fehlermeldung, danach der neue Stand an alle. */
const teamMutation = async (msg: Msg<TeamMutation>, { webview, surface }: MessageContext, host: TeamsHost) => {
  try {
    const store = host.teams();
    store.refresh();
    if (msg.kind === 'saveTeam') {
      const team = validateTeam(msg.team);
      if (team.projectPath && !host.projects().some(project => project.path === team.projectPath)) throw new Error('Wähle ein vorhandenes Cortex-Projekt.');
      store.save(team, msg.revision, msg.baseSignature);
      host.post(webview, { kind: 'teamSaved', id: team.id });
    } else if (msg.kind === 'deleteTeam') store.remove(msg.id, msg.revision);
    else if (msg.kind === 'startTeam') await host.startTeam(msg.teamId, msg.task);
    else if (msg.kind === 'startSwarm') {
      const origin = host.conversations.get(surface.conversationId ?? '');
      await startSwarm(host, msg, origin?.projectPath, origin?.pinnedTarget);
    }
    else if (msg.kind === 'stopTeam') host.teamRunner!.stop(msg.runId);
    else if (msg.kind === 'importAgentMarkdown') {
      const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Markdown: ['md', 'markdown', 'txt'] }, openLabel: 'Anweisungen übernehmen' });
      if (picked?.[0]) {
        const info = await stat(picked[0].fsPath);
        if (info.size > 100_000) throw new Error('Die Markdown-Datei darf höchstens 100 KB enthalten.');
        host.post(webview, { kind: 'agentMarkdown', requestId: msg.requestId, text: await readFile(picked[0].fsPath, 'utf8') });
      }
    } else {
      if (typeof msg.text !== 'string' || msg.text.length > 100_000) throw new Error('Ungültige Markdown-Anweisungen.');
      const name = msg.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'Agent';
      const picked = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(join(homedir(), `${name}.md`)), filters: { Markdown: ['md'] }, saveLabel: 'Markdown speichern' });
      if (picked) await writeFile(picked.fsPath, msg.text, 'utf8');
    }
    if (msg.kind === 'saveTeam' || msg.kind === 'deleteTeam') {
      await host.startAutomations();
      await host.automationRuntime!.tick();
    }
    host.pushTeams();
  } catch (error) {
    host.pushTeams(webview);
    host.post(webview, { kind: 'teamError', message: error instanceof Error ? error.message : String(error) });
  }
};

export const teamTable = {
  getTeams: async (_msg, { webview }, host) => {
    host.pushAccounts(); host.pushProjects();
    await host.startAutomations();
    host.pushTeams(webview);
  },
  copyTeamWebhook: async (msg, { webview }, host) => {
    try {
      await host.startAutomations();
      await host.automationRuntime!.tick();
      const { url, token } = host.automationRuntime!.webhookCredentials(msg.teamId);
      // Credentials go to the clipboard only after this explicit action,
      // never to every webview in the shared status broadcast.
      const command = `curl --request POST '${url}' --header 'Authorization: Bearer ${token}' --header 'Content-Type: application/json' --data '{}'`;
      await vscode.env.clipboard.writeText(command);
      host.post(webview, { kind: 'teamAutomationNotice', message: 'Webhook-Aufruf mit Zugriffsschlüssel kopiert.' });
    } catch (error) {
      host.post(webview, { kind: 'teamError', message: error instanceof Error ? error.message : String(error) });
    }
  },
  saveTeam: teamMutation,
  deleteTeam: teamMutation,
  startTeam: teamMutation,
  startSwarm: teamMutation,
  stopTeam: teamMutation,
  importAgentMarkdown: teamMutation,
  exportAgentMarkdown: teamMutation,
} satisfies DomainTable<'getTeams' | 'copyTeamWebhook' | TeamMutation, TeamsHost>;
