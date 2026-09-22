import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it, vi } from 'vitest';
import { duplicateTemplate, readTemplateEntries, renameTemplate } from '../../src/panel/templates.js';
import { ChatViewProvider } from '../../src/panel/chatViewProvider.js';

const bundled = fileURLToPath(new URL('../../templates/', import.meta.url));
const temporary: string[] = [];
const previewUri = (path: string) => `vscode-webview://template/${encodeURIComponent(path)}`;
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-templates-'));
  temporary.push(dir);
  return dir;
};
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

it('ships actual original Office templates and matching rendered previews, independent of the Codex cache', () => {
  const entries = readTemplateEntries(bundled, fresh(), previewUri);
  expect(entries).toHaveLength(20);
  expect(entries.filter(entry => entry.item.kind === 'dokument')).toHaveLength(7);
  expect(entries.filter(entry => entry.item.kind === 'praesentation')).toHaveLength(7);
  expect(entries.filter(entry => entry.item.kind === 'tabelle')).toHaveLength(6);
  expect(entries.slice(0, 5).map(entry => entry.item.name)).toEqual([
    'Design Report', 'Experiment Analysis', 'Investment Committee Memo', 'Legal Memorandum', 'Minimal Letterhead',
  ]);
  for (const entry of entries) {
    const { item, source } = entry;
    expect(item.artifactPath?.startsWith(bundled)).toBe(true);
    expect(item.body).toContain(item.artifactPath);
    expect(item.body).toContain(item.instructionPath);
    expect(item.body).not.toContain('.codex');
    expect(item.prompt).toContain(item.name);
    expect(item.previewUrl).toMatch(/^vscode-webview:/);
    // OOXML is an editable ZIP package, not a screenshot or text substitute.
    const artifact = readFileSync(item.artifactPath!);
    expect(artifact.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    expect(artifact.length).toBeGreaterThan(5000);
    expect(readFileSync(join(source, 'assets/preview.png')).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const provenance = JSON.parse(readFileSync(join(source, 'SOURCE.json'), 'utf8'));
    expect(provenance.license).toBe('Proprietary');
    for (const [file, expectedHash] of Object.entries(provenance.filesSha256)) {
      expect(createHash('sha256').update(readFileSync(join(source, file))).digest('hex')).toBe(expectedHash);
    }
  }
});

it('keeps user text templates and replaces same-name bundled entries with the user version', () => {
  const own = fresh();
  writeFileSync(join(own, 'own.md'), '---\nname: Design Report\nkind: dokument\n---\nMy custom report');
  writeFileSync(join(own, 'budget.csv'), 'item,cost\n');
  const entries = readTemplateEntries(bundled, own, previewUri);
  expect(entries).toHaveLength(21);
  expect(entries[0].item).toMatchObject({ name: 'Design Report', body: 'My custom report', own: true });
  expect(entries.find(entry => entry.item.name === 'budget')?.item.kind).toBe('tabelle');
});

it('duplicates complete Office templates and renames their visible identity, without changing the original', () => {
  const own = fresh();
  const original = readTemplateEntries(bundled, own, previewUri)[0];
  const originalReference = readFileSync(original.item.artifactPath!);
  const copied = duplicateTemplate(original, own);
  const duplicate = readTemplateEntries(bundled, own, previewUri).find(entry => entry.source === copied)!;
  expect(duplicate.item.own).toBe(true);
  expect(duplicate.item.name).toBe('Design Report – Kopie');
  expect(dirname(dirname(duplicate.item.artifactPath!))).toBe(copied);
  expect(readFileSync(duplicate.item.artifactPath!)).toEqual(originalReference);
  expect(duplicateTemplate(original, own)).not.toBe(copied);
  const renamed = renameTemplate(duplicate, 'My Design Report');
  expect(existsSync(copied)).toBe(false);
  const updated = readTemplateEntries(bundled, own, previewUri).find(entry => entry.source === renamed)!;
  expect(updated.item.name).toBe('My Design Report');
  expect(updated.item.instructionPath?.startsWith(renamed)).toBe(true);
  expect(updated.item.body).toContain(updated.item.artifactPath);
  expect(readFileSync(original.item.artifactPath!)).toEqual(originalReference);
});

it('renames frontmatter templates visibly and rejects package paths outside their own directory', () => {
  const own = fresh();
  writeFileSync(join(own, 'custom.md'), '---\nname: Old title\nkind: dokument\n---\nKeep this body');
  const text = readTemplateEntries(bundled, own, previewUri).find(entry => entry.item.own)!;
  renameTemplate(text, 'New title');
  const renamed = readTemplateEntries(bundled, own, previewUri).find(entry => entry.item.own)!;
  expect(renamed.item).toMatchObject({ name: 'New title', kind: 'dokument', body: 'Keep this body' });
  const invalid = join(own, 'invalid');
  mkdirSync(invalid);
  writeFileSync(join(invalid, 'template.json'), JSON.stringify({ schemaVersion: 1, id: 'unsafe', name: 'Unsafe', kind: 'document', reference: '../private.docx', usage: 'USAGE.md' }));
  writeFileSync(join(own, 'private.docx'), 'outside package');
  writeFileSync(join(invalid, 'USAGE.md'), 'instructions');
  expect(readTemplateEntries(bundled, own, previewUri).some(entry => entry.item.name === 'Unsafe')).toBe(false);
});

it.each(['dokument', 'praesentation', 'tabelle'])('dispatches a selected %s as intact Office and guide paths, never as decoded binary text', async kind => {
  const project = fresh();
  const { item } = readTemplateEntries(bundled, fresh(), previewUri).find(entry => entry.item.kind === kind)!;
  const original = readFileSync(item.artifactPath!);
  const chat = Object.create(ChatViewProvider.prototype) as any;
  chat.ctx = { globalStorageUri: { fsPath: fresh() } };
  chat.conversations = new Map([['template-test', { id: 'template-test', title: '', projectPath: project, log: [], turns: [] }]]);
  chat.conversationCwd = vi.fn(async () => project);
  chat.projectRuns = new Map();
  chat.queues = { isPaused: () => false, retryBlockedProjects: vi.fn() };
  chat.panels = new Map();
  chat.toConversation = vi.fn();
  chat.detectRetry = vi.fn();
  chat.runTask = vi.fn(async () => {});
  chat.output = { appendLine: vi.fn() };
  const attachments = [item.artifactPath!, item.instructionPath!];
  await chat.runQueuedMessage('template-test', { id: 'selected-template', text: item.prompt!, tags: [], modes: { attachments } });
  expect(chat.runTask).toHaveBeenCalledOnce();
  expect(chat.runTask.mock.calls[0][1]).toBe(`${item.prompt}\n\nAttached files:\n- ${item.artifactPath}\n- ${item.instructionPath}`);
  expect(chat.runTask.mock.calls[0][3].attachments).toEqual(attachments);
  expect(chat.toConversation.mock.calls.find(([, event]: any[]) => event.kind === 'userEcho')?.[1].attachments).toEqual(attachments);
  expect(readFileSync(item.artifactPath!)).toEqual(original);
  expect(readFileSync(item.instructionPath!, 'utf8')).toContain('Alle relativen Pfade');
  expect(readFileSync(item.instructionPath!, 'utf8')).toContain('nicht als UTF-8-Text');
});
