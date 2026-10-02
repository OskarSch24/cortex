import * as vscode from 'vscode';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { QuotaTracker } from '@cortex/core';
import type { AutomationRuntime } from '../../automations/runtime.js';
import type { AutomationSource } from '../../automations/types.js';
import type { TeamRunner } from '../../teams/runner.js';
import type { TeamStore } from '../../teams/store.js';
import { SCOPED_MCP_PROVIDERS, type PermissionMode, type Target } from '@cortex/core';
import { MAX_POOL_UNITS, MAX_TEAM_AGENTS, validateTeam, type AgentTeam, type TeamAgent, type TeamIsolation, type TeamRun } from '../../teams/types.js';
import { git } from '../../util/exec.js';
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
  /** Merge-Warteschlange eines Schwarm-Laufs (host/swarmMerge.ts). */
  swarmMergeAction(action: 'start' | 'adopt' | 'stop', runId: string, checks?: string[]): Promise<void>;
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
  // Mehr als 20 Einheiten oder eine gesetzte Gleichzeitigkeit: ein Pool, der
  // so viele zugleich laufen lässt, wie die Konten tragen (teams/runner.ts).
  const pool = !!msg.pool || msg.count > MAX_TEAM_AGENTS || msg.proposed.length > MAX_TEAM_AGENTS;
  const count = Math.min(pool ? MAX_POOL_UNITS : MAX_TEAM_AGENTS, Math.max(1, Math.floor(msg.count)));
  const store = host.teams();
  store.refresh();
  if (store.error) throw new Error(store.error);
  if (store.runs.some(run => run.teamId === msg.swarmId && run.status === 'running')) throw new Error('Dieser Schwarm arbeitet bereits.');
  // Dieselbe Prüfung wie im Executor, damit eine automatisch besetzte Rolle
  // nicht sofort an einem abgelaufenen oder erschöpften Konto scheitert.
  // Automatisch besetzte Rollen arbeiten alle auf dem Konto des Chats: ein
  // Konto begrenzt die Zahl seiner Sitzungen nicht. Ist es nicht nutzbar,
  // übernimmt das erste freie; im Pool springt beim Limit das nächste ein.
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
    const account = usable[0]!;
    const owns = (proposed?.owns ?? []).filter(path => typeof path === 'string' && path.trim()).slice(0, 50);
    const sameAsChat = account.provider === conversationTarget?.provider && account.label === conversationTarget?.account;
    agents.push({
      id: `swarm-agent-${slot + 1}`,
      name: (proposed?.name?.trim() || `Rolle ${slot + 1}`).slice(0, 80),
      role: (proposed?.role ?? '').slice(0, 200),
      instructions: [(proposed?.instructions ?? '').slice(0, 20_000), owns.length ? `## Dein Bereich\nNur diese Pfade gehören dir — alles andere änderst du nicht:\n${owns.map(path => `- ${path}`).join('\n')}` : ''].filter(Boolean).join('\n\n'),
      ...(owns.length ? { owns } : {}),
      target: { provider: account.provider, account: account.label, ...(sameAsChat && conversationTarget?.model ? { model: conversationTarget.model } : {}) },
      permissionMode,
      // Ohne externe MCP-Server: Suchen, Abrufen, Dateien und Shell bringt der
      // Anbieter selbst mit. Jeder Server wäre ein eigener Prozess je Rolle —
      // bei Grok über 1 GB, bei 20 Rollen mehr, als der Mac hat. Wer die
      // Auswahl nicht begrenzen kann, würde eine leere ablehnen: dort bleibt sie offen.
      ...(SCOPED_MCP_PROVIDERS.includes(account.provider) ? { mcpServers: [] } : {}),
      skillPaths: [],
      dependsOn: [],
    });
  }
  const existing = store.teams.find(team => team.id === msg.swarmId);
  const project = conversationProject && host.projects().some(entry => entry.path === conversationProject)
    ? conversationProject : existing?.projectPath;
  // In einem Git-Projekt bekommt jede Einheit ihren eigenen Worktree — es sei
  // denn, die Karte verlangt ausdrücklich den gemeinsamen Ordner.
  const isolation: TeamIsolation = msg.isolation === 'shared' || !project || !await isGitProject(project) ? 'shared' : 'worktree';
  const team = validateTeam({
    id: msg.swarmId,
    kind: 'team',
    name: `Schwarm · ${task.replace(/\s+/g, ' ').slice(0, 60)}`,
    description: 'Aus einer Schwarm-Karte im Chat gestartet.',
    instructions: isolation === 'worktree' ? WORKTREE_RULES : SHARED_RULES,
    ...(isolation === 'shared' ? { sharedWorkspace: true } : {}),
    isolation,
    ...(pool ? { pool: { ...(msg.pool?.concurrency ? { concurrency: msg.pool.concurrency } : {}) } } : {}),
    ...(project ? { projectPath: project } : {}),
    agents,
    updatedAt: Date.now(),
  });
  store.save(team, store.revision);
  await host.startTeam(team.id, task);
}

const SHARED_RULES = 'Die anderen Rollen dieses Schwarms arbeiten gleichzeitig im selben Ordner. Bearbeite nur deinen eigenen Teil: ändere, verschiebe oder lösche keine Dateien, die zu einer anderen Rolle gehören, und führe keine Befehle aus, die den ganzen Ordner umbauen (git reset, checkout, clean, Formatierung über alles). Melde am Ende, welche Dateien du angelegt oder geändert hast.';

const WORKTREE_RULES = 'Du arbeitest in einem eigenen Git-Arbeitsordner auf einem eigenen Branch; die anderen Einheiten dieses Schwarms haben je ihren eigenen. Cortex committet deinen Stand am Ende selbst: nicht committen, nicht pushen, keine Branches wechseln, nichts zurücksetzen. '
  + 'Ändere nur die Dateien deines Bereichs; gemeinsamer Code wie Schemas, Hilfsbibliotheken und Fortschrittsskripte gehört niemandem und bleibt unverändert — braucht er eine Änderung, beschreibe sie in deinem Ergebnis. '
  + 'Vom Git ignorierte Ordner (etwa daten/, .venv/) sind mit dem Hauptprojekt verlinkt und werden von allen geteilt: schreibe dort nur in die Teile, die zu deinem Bereich gehören, und lösche dort nichts. Melde am Ende, welche Dateien du angelegt oder geändert hast.';

/** Liegt der Ordner in einem Git-Arbeitsbaum? */
async function isGitProject(path: string): Promise<boolean> {
  return git(path, ['rev-parse', '--is-inside-work-tree'], { timeout: 10_000 }).then(out => out.trim() === 'true', () => false);
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
  // Knöpfe der Übersicht: Merge-Warteschlange starten, übernehmen, anhalten.
  swarmMerge: async (msg, { webview }, host) => {
    try { await host.swarmMergeAction(msg.action, msg.runId, msg.checks); }
    catch (error) { host.post(webview, { kind: 'teamError', message: error instanceof Error ? error.message : String(error) }); }
    host.pushTeams();
  },
} satisfies DomainTable<'getTeams' | 'copyTeamWebhook' | 'swarmMerge' | TeamMutation, TeamsHost>;
