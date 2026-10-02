/**
 * Eine Schwarm-Einheit mit `isolation: 'worktree'` von Anfang bis Ende durch
 * runTeamAgent: sie arbeitet in ihrem eigenen Worktree, das Projekt bleibt
 * unberührt, ihr Stand liegt als Commit auf ihrem Branch, und was sie
 * außerhalb ihres Bereichs geändert hat, wird gemeldet.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';
import type { AgentTeam, TeamAgent } from '../../src/teams/types.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' }).trim();

function project(): string {
  const repo = mkdtempSync(join(tmpdir(), 'cortex-unit-run-'));
  dirs.push(repo);
  git(repo, 'init', '-q');
  writeFileSync(join(repo, '.gitignore'), '/daten/\n');
  mkdirSync(join(repo, 'src', 'FR'), { recursive: true });
  writeFileSync(join(repo, 'src', 'FR', 'alt.py'), 'alt\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'start');
  mkdirSync(join(repo, 'daten'));
  return repo;
}

function host(storage: string) {
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.ctx = { globalStorageUri: { fsPath: storage } };
  chat.accounts = { all: () => [{ id: 'c1', provider: 'claude', label: 'privat', disabled: false }] };
  chat.authHealth = new Map();
  chat.quota = { availability: () => ({ available: true }) };
  chat.teamMcpServers = () => undefined;
  chat.teamResources = () => ({ servers: [], skills: [] });
  chat.teamExecutionTarget = (target: unknown) => target;
  chat.teams = () => ({ runs: [], teams: [] });
  chat.conversations = new Map(); chat.teamUpdates = new Map(); chat.projectRuns = new Map(); chat.tasks = new Map();
  chat.persistNow = vi.fn(async () => {}); chat.sendConversations = vi.fn(); chat.toConversation = vi.fn();
  chat.queues = { retryBlockedProjects: vi.fn() };
  // Der „Agent“: schreibt in seinen Arbeitsordner, einmal im eigenen Bereich, einmal daneben, und in die verlinkten Daten.
  chat.runTask = vi.fn(async (id: string) => {
    const cwd = await chat.conversationCwd(id);
    writeFileSync(join(cwd, 'src', 'FR', 'neu.py'), 'neu\n');
    mkdirSync(join(cwd, 'src', 'DE'), { recursive: true });
    writeFileSync(join(cwd, 'src', 'DE', 'fremd.py'), 'fremd\n');
    writeFileSync(join(cwd, 'daten', 'fr.sqlite'), 'db');
    const rec = chat.conversations.get(id);
    rec.turns.push({ role: 'assistant', text: 'FR fertig.' });
    rec.log.push({ kind: 'done' });
  });
  return chat;
}

describe('Schwarm-Einheit im eigenen Worktree', () => {
  it('arbeitet in ihrer Kopie, committet auf ihren Branch und meldet Änderungen außerhalb ihres Bereichs', async () => {
    const repo = project();
    const storage = mkdtempSync(join(tmpdir(), 'cortex-unit-store-'));
    dirs.push(storage);
    const chat = host(storage);
    const agent: TeamAgent = { id: 'fr', name: 'FR', role: '', instructions: '', target: { provider: 'claude', account: 'privat' }, permissionMode: 'full', skillPaths: [], dependsOn: [], owns: ['src/FR/**'] };
    const team: AgentTeam = { id: 'swarm-abc-karte', kind: 'team', name: 'Schwarm', description: '', instructions: '', projectPath: repo, isolation: 'worktree', pool: {}, agents: [agent], updatedAt: 0 };
    const changes: any[] = [];
    const answer = await chat.runTeamAgent(team, agent, 'W3', [], new AbortController().signal, (change: unknown) => changes.push(change));

    expect(answer).toContain('FR fertig.');
    expect(answer).toContain('src/DE/fremd.py');
    const branch = changes.find(change => change.branch)?.branch as string;
    expect(branch).toMatch(/^schwarm\//);
    expect(changes.find(change => change.outside)?.outside).toEqual(['src/DE/fremd.py']);
    // Das Projekt selbst ist unberührt, der Stand liegt auf dem Branch.
    expect(existsSync(join(repo, 'src', 'FR', 'neu.py'))).toBe(false);
    expect(git(repo, 'status', '--porcelain')).toBe('');
    expect(git(repo, 'show', `${branch}:src/FR/neu.py`)).toBe('neu');
    // Die ignorierten Daten sind verlinkt: was die Einheit dort schreibt, liegt im Projekt.
    expect(readFileSync(join(repo, 'daten', 'fr.sqlite'), 'utf8')).toBe('db');
    expect(git(repo, 'ls-tree', '-r', '--name-only', branch)).not.toContain('daten');
  });
});
