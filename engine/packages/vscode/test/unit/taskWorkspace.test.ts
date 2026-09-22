import { afterEach, describe, expect, it, vi } from 'vitest';
import { window, workspace } from './vscodeStub.js';
import { WorkspaceContext } from '../../src/context/workspaceContext.js';
import { projectFolderSections } from '../../src/context/projectFolders.js';
import type { TaskRequest } from '@cortex/core';

afterEach(() => { vi.restoreAllMocks(); delete (window as any).activeTextEditor; delete (workspace as any).textDocuments; });
const editor = (path: string, selection = '') => ({ document: { uri: { scheme: 'file', fsPath: path }, languageId: 'typescript', getText: () => selection }, selection: { isEmpty: !selection, start: { line: 0 }, end: { line: 1 } } });

describe('task workspace isolation', () => {
  it('keeps the starting file and selection when the visible editor changes during setup', async () => {
    const context = new WorkspaceContext({ appendLine() {} } as any, '/project/a');
    (window as any).activeTextEditor = editor('/project/a/start.ts', 'selected in A');
    (workspace as any).textDocuments = [];
    const editorSnapshot = context.editorContext();
    const task: TaskRequest = { conversationId: 'a', prompt: 'Explain selection', cwd: '/project/a', permissionMode: 'safe', editorSnapshot };
    (window as any).activeTextEditor = editor('/project/b/secret.ts', 'selected in B');
    vi.spyOn(context, 'repoContext').mockResolvedValue({});
    vi.spyOn(context, 'conventions').mockReturnValue([]);
    await context.refresh();
    const brief = JSON.stringify(context.buildFor(task, 'claude', { shapeTasks: false }));
    expect(brief).toContain('start.ts');
    expect(brief).toContain('selected in A');
    expect(brief).not.toContain('secret.ts');
    expect(brief).not.toContain('selected in B');
  });
  it('never captures an active editor outside the conversation project', () => {
    const context = new WorkspaceContext({ appendLine() {} } as any, '/project/a');
    (window as any).activeTextEditor = editor('/project/ab/secret.ts', 'outside');
    (workspace as any).textDocuments = [];
    expect(context.editorContext().activeFile).toBeUndefined();
    expect(context.editorContext().selection).toBeUndefined();
  });
  it('instructs the agent about all configured roots using unambiguous absolute paths', () => {
    const [section] = projectFolderSections({ cwd: '/project/frontend', workspaceFolders: ['/project/frontend', '/project/backend api', '/project/backend api'] });
    expect(section?.body).toContain('"/project/frontend"');
    expect(section?.body).toContain('"/project/backend api"');
    expect(section?.body.match(/backend api/g)).toHaveLength(1);
    expect(projectFolderSections({ cwd: '/project/frontend' })).toEqual([]);
  });
});
