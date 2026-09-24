import * as vscode from 'vscode';

/**
 * Ein Dienst, der für das offene Fenster gilt und auf Wunsch für einen
 * anderen Projektordner: `forRoot` gibt je Ordner genau eine Instanz, das
 * Fenster selbst eingeschlossen.
 */
export abstract class ProjectScoped<T extends ProjectScoped<T>> {
  private readonly projects = new Map<string, T>();

  constructor(protected readonly output: vscode.OutputChannel, private readonly projectRoot?: string) {}

  /** Eine neue Instanz derselben Art für `root`. */
  protected abstract forProject(root: string): T;

  forRoot(root: string): T {
    if (this.projectRoot === root) return this as unknown as T;
    let project = this.projects.get(root);
    if (!project) { project = this.forProject(root); this.projects.set(root, project); }
    return project;
  }

  /** Der feste Projektordner, sonst der erste Ordner des Fensters — beim Zugriff gelesen. */
  protected get root(): string | undefined {
    return this.projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }
}
