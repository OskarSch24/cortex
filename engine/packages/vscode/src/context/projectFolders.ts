import type { BriefSection, TaskRequest } from '@cortex/core';

export function projectFolderSections(task: Pick<TaskRequest, 'cwd' | 'workspaceFolders'>): BriefSection[] {
  const folders = [...new Set([task.cwd, ...(task.workspaceFolders ?? [])])];
  if (folders.length < 2) return [];
  return [{
    id: 'project-folders',
    title: 'Ordner dieses Projekts',
    body: `Das feste Arbeitsverzeichnis dieser Aufgabe ist ${JSON.stringify(task.cwd)}.\nZum Projekt gehören außerdem diese Ordner:\n${folders.filter(path => path !== task.cwd).map(path => `- ${JSON.stringify(path)}`).join('\n')}\nVerwende für Dateien in diesen Ordnern absolute Pfade oder wechsle für den betreffenden Befehl ausdrücklich in den passenden Ordner. Die Berechtigungen der Aufgabe gelten unverändert.`,
  }];
}
