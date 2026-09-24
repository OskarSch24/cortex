import * as vscode from 'vscode';
import { basename } from 'node:path';
import type { ExokortexExport } from '../../storage/exokortexExport.js';
import type { MessageQueue } from '../messageQueue.js';
import type { ProjectDto } from '../protocol.js';
import { validProject } from '../workspace.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was die Projekt-Knöpfe vom Provider brauchen. Die Projektliste selbst
 * (projects, writeProjects, relinkProject) bleibt am Provider: Tests rufen und
 * ersetzen sie dort.
 */
export interface ProjectsHost extends PanelHost {
  readonly queues: MessageQueue;
  /** Durable copy of every chat, outside globalState and outside the cap. */
  readonly exokortex: ExokortexExport;
  relinkProject(oldPath: string): Promise<boolean>;
  writeProjects(update: (saved: ProjectDto[]) => ProjectDto[]): Promise<void>;
  pushWorkspace(webview: vscode.Webview, directory?: string): Promise<void>;
  newConversation(projectPath?: string): void;
  deleteConversation(id: string): void;
}

type ProjectKind =
  | 'relinkProject' | 'assignProject' | 'setConversationProject' | 'createProject' | 'addProject'
  | 'saveProject' | 'removeProject' | 'pinProject' | 'pickProjectFolder' | 'revealProject';

/** Projekte: zuweisen, anlegen, umbenennen, entfernen — aus Seitenleiste und Eingabe. */
export const projectTable = {
  relinkProject: async (msg, _cx, host) => {
    if (host.projects().some(p => p.path === msg.path)) await host.relinkProject(msg.path);
  },
  assignProject: async (_msg, { webview, surface }, host) => {
    const rec = host.conversations.get(surface.conversationId ?? '');
    if (!rec) return;
    if (host.isRunning(rec.id)) { void vscode.window.showInformationMessage('Bitte warte, bis die laufende Aufgabe beendet ist.'); return; }
    const choices = host.projects().map(p => ({ label: p.name, description: p.path, path: p.path }));
    const picked = await vscode.window.showQuickPick([...choices, { label: 'Ordner auswählen …', description: '', path: '' }], { placeHolder: 'Diesem Chat ein Projekt zuweisen' });
    if (!picked || host.isRunning(rec.id)) return;
    let path = picked.path;
    if (!path) {
      const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Projekt zuweisen' });
      if (!folders?.[0] || host.isRunning(rec.id)) return;
      path = (await validProject(folders[0].fsPath)).path;
    }
    rec.projectPath = path;
    host.pushProjects();
    host.sendConversations();
    await host.persistNow();
    await host.pushWorkspace(webview);
  },
  /**
   * Die Wahl aus der Liste über der Eingabe. Anders als `assignProject`
   * fragt hier nichts mehr nach — der Nutzer hat den Eintrag schon
   * angeklickt. Ohne Pfad läuft die Aufgabe ohne Projekt weiter.
   */
  setConversationProject: async (msg, { webview, surface }, host) => {
    const rec = host.conversations.get(surface.conversationId ?? '');
    if (!rec) return;
    if (host.isRunning(rec.id)) { void vscode.window.showInformationMessage('Bitte warte, bis die laufende Aufgabe beendet ist.'); return; }
    // Ein Pfad, den die Liste nicht kennt, kam nicht aus der Liste.
    if (msg.path && !host.projects().some(p => p.path === msg.path)) return;
    rec.projectPath = msg.path;
    host.pushProjects();
    host.sendConversations();
    await host.persistNow();
    await host.pushWorkspace(webview);
  },
  /**
   * „Projekt erstellen“ aus dem Dialog. Die Ordner kommen aus dem
   * Dateidialog des Systems, deshalb werden sie hier nur noch geprüft —
   * der erste ist der Kennordner, an dem die Aufgaben hängen.
   */
  createProject: async (msg, _cx, host) => {
    const folders: string[] = [];
    for (const folder of msg.folders) {
      try {
        const valid = await validProject(folder);
        if (!folders.includes(valid.path)) folders.push(valid.path);
      } catch {
        // Ein Ordner, den es nicht mehr gibt, wird nicht zum Projekt.
      }
    }
    const anchor = folders[0];
    if (!anchor) return;
    const name = msg.name.trim() || basename(anchor);
    await host.writeProjects(saved => [...saved.filter(p => p.path !== anchor), { name, path: anchor, folders }]);
    host.newConversation(anchor);
  },
  addProject: async (_msg, _cx, host) => {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Projekt hinzufügen' });
    if (!picked?.[0]) return;
    const project = await validProject(picked[0].fsPath);
    await host.writeProjects(saved => [...saved.filter(p => p.path !== project.path), project]);
    host.newConversation(project.path);
  },
  saveProject: async (msg, _cx, host) => {
    const name = msg.name.trim();
    if (!name) return;
    // Der Kennpfad bleibt Kennpfad: an ihm hängen die bestehenden Chats.
    const folders = [msg.path, ...msg.folders.filter(f => f !== msg.path)];
    await host.writeProjects(saved => {
      const rest = saved.filter(p => p.path !== msg.path);
      const before = saved.find(p => p.path === msg.path);
      return [...rest, { ...before, name, path: msg.path, folders }];
    });
  },
  removeProject: async (msg, _cx, host) => {
    const owned = [...host.conversations.values()].filter(c => c.projectPath === msg.path);
    if (owned.some(c => host.isRunning(c.id) || host.queues.isWorking(c.id))) {
      void vscode.window.showInformationMessage('Bitte zuerst die laufenden Aufgaben dieses Projekts beenden.'); return;
    }
    let action = 'Archivieren';
    if (owned.length) {
      const choice = await vscode.window.showWarningMessage(
        `„${basename(msg.path)}“ hat ${owned.length === 1 ? 'noch eine Aufgabe' : `noch ${owned.length} Aufgaben`}.`,
        { modal: true, detail: 'Aufgaben archivieren oder Chatverläufe, Zeichnungen und Cortex-Exporte löschen? Projektdateien bleiben erhalten.' },
        'Archivieren', 'Verläufe löschen');
      if (!choice || owned.some(c => host.isRunning(c.id) || host.queues.isWorking(c.id))) return;
      action = choice;
    }
    if (action === 'Verläufe löschen') {
      for (const rec of owned) host.exokortex.entferne(rec.id);
      // Bind an active view to a fresh projectless chat before removing its records.
      if (owned.some(c => c.id === host.visibleConversationId())) host.newConversation();
      for (const rec of owned) host.deleteConversation(rec.id);
    } else for (const rec of owned) { rec.archived = true; host.queues.pause(rec.id); }
    await host.ctx.globalState.update('cortex.removedProjects', [...new Set([...host.ctx.globalState.get<string[]>('cortex.removedProjects', []), msg.path])]);
    await host.writeProjects(saved => saved.filter(p => p.path !== msg.path));
    host.sendConversations(); await host.persistNow();
  },
  pinProject: async (msg, _cx, host) => {
    const known = host.projects().find(p => p.path === msg.path);
    if (!known) return;
    await host.writeProjects(saved => {
      const rest = saved.filter(p => p.path !== msg.path);
      const { missing, ...rest0 } = { ...known, ...saved.find(p => p.path === msg.path) };
      return [...rest, { ...rest0, pinned: msg.pinned }];
    });
  },
  pickProjectFolder: async (_msg, { webview }, host) => {
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: 'Ordner hinzufügen' });
    if (!picked?.[0]) return;
    host.post(webview, { kind: 'pickedFolder', path: picked[0].fsPath });
  },
  revealProject: async msg => {
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(msg.path));
  },
} satisfies DomainTable<ProjectKind, ProjectsHost>;
