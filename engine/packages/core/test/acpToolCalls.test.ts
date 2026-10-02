import { describe, expect, it } from 'vitest';
import { acpToolSteps } from '../src/adapters/acpToolCalls.js';

const CWD = '/Users/me/Dummy Economics';

/** A Grok `tool_call` as the CLI sends it: tool name as title, no `kind`, the category in `_meta`. */
const grokCall = (toolCallId: string, name: string, kind: string, rawInput: Record<string, unknown>) => ({
  sessionUpdate: 'tool_call',
  toolCallId,
  title: name,
  rawInput,
  _meta: { 'x.ai/tool': { version: 1, name, kind, namespace: 'grok_build', label: name, read_only: true } },
});

describe('ACP tool calls as steps', () => {
  it('names every Grok tool by what it does, not as an unnamed tool', () => {
    const steps = acpToolSteps(CWD);
    const run = steps.call(grokCall('c1', 'run_terminal_command', 'execute', { command: 'ls -la', description: 'Inspect the import folder' }));
    const read = steps.call(grokCall('c2', 'read_file', 'read', { target_file: `${CWD}/stand/STATUS.md` }));
    const list = steps.call(grokCall('c3', 'list_dir', 'list', { target_directory: `${CWD}/europa` }));
    const edit = steps.call(grokCall('c4', 'search_replace', 'edit', { file_path: `${CWD}/a.py`, old_string: 'a', new_string: 'b' }));
    const fetch = steps.call(grokCall('c5', 'web_fetch', 'web_fetch', { url: 'https://example.org/x' }));
    expect(run).toEqual([expect.objectContaining({ name: 'run_terminal_command', action: 'run', detail: 'ls -la', description: 'Inspect the import folder' })]);
    expect(read).toEqual([expect.objectContaining({ action: 'read', path: 'stand/STATUS.md' })]);
    expect(list).toEqual([expect.objectContaining({ action: 'search', path: 'europa' })]);
    expect(edit).toEqual([expect.objectContaining({ action: 'edit', path: 'a.py' })]);
    expect(fetch).toEqual([expect.objectContaining({ action: 'fetch', detail: 'https://example.org/x' })]);
  });

  it('falls back to Grok’s own category for a tool it does not know by name', () => {
    const steps = acpToolSteps(CWD);
    const [step] = steps.call(grokCall('c1', 'read_many_files', 'read', { target_file: `${CWD}/a.md` }));
    expect(step).toMatchObject({ name: 'read_many_files', action: 'read', path: 'a.md' });
  });

  it('keeps the protocol kind first, as Copilot sends it', () => {
    const steps = acpToolSteps(CWD);
    const [step] = steps.call({ sessionUpdate: 'tool_call', toolCallId: 'x', title: 'Run `ls -la`', kind: 'execute', rawInput: { command: 'ls -la' } });
    expect(step).toMatchObject({ name: 'Run `ls -la`', action: 'run', detail: 'ls -la' });
  });

  it('names a plugin call through use_tool like every other plugin call', () => {
    const steps = acpToolSteps(CWD);
    const [step] = steps.call(grokCall('c1', 'use_tool', 'use_tool', { tool_name: 'chrome-devtools__new_page', tool_input: { url: 'http://localhost:5173/kurs' } }));
    expect(step).toMatchObject({ name: 'mcp__chrome-devtools__new_page', action: 'other', detail: 'http://localhost:5173/kurs' });
  });

  it('says which background command an output request waits for', () => {
    const steps = acpToolSteps(CWD);
    steps.call(grokCall('bg-1', 'run_terminal_command', 'execute', { command: 'python3 fetch.py', description: 'Download the 1990 yearbook', background: true }));
    const [wait] = steps.call(grokCall('c2', 'get_command_or_subagent_output', 'background_task_action', { task_ids: ['bg-1'], timeout_ms: 120000 }));
    expect(wait).toMatchObject({ name: 'get_command_or_subagent_output', detail: 'Download the 1990 yearbook' });
    const [unknown] = steps.call(grokCall('c3', 'kill_command_or_subagent', 'kill_task_action', { task_id: '01a0a459-c033' }));
    expect(unknown?.detail).toBeUndefined();
  });

  it('holds Grok’s web search until its query arrives, with the sources it found', () => {
    const steps = acpToolSteps(CWD);
    const start = { sessionUpdate: 'tool_call', toolCallId: 'ws_1', title: 'Web search:', kind: 'search', status: 'in_progress', rawInput: { variant: 'WebSearch', backend: true } };
    expect(steps.call(start)).toEqual([]);
    const done = steps.update({
      sessionUpdate: 'tool_call_update', toolCallId: 'ws_1', status: 'completed', title: 'Web search:',
      rawOutput: { action: { type: 'search', query: 'loi de finances 2026 crédits par ministère', sources: [{ type: 'url', url: 'https://www.budget.gouv.fr/a' }, { type: 'url', url: 'https://www.legifrance.gouv.fr/b' }] } },
    });
    expect(done).toEqual([expect.objectContaining({
      name: 'WebSearch',
      action: 'fetch',
      detail: 'loi de finances 2026 crédits par ministère',
      preview: 'https://www.budget.gouv.fr/a\nhttps://www.legifrance.gouv.fr/b',
    })]);
    // Settled once — a late duplicate does not add a second step.
    expect(steps.update({ sessionUpdate: 'tool_call_update', toolCallId: 'ws_1', status: 'completed' })).toEqual([]);
  });

  it('takes a web search that arrives already finished as it is', () => {
    const steps = acpToolSteps(CWD);
    const [step] = steps.call({
      sessionUpdate: 'tool_call', toolCallId: 'ws_9', title: 'Web search:', kind: 'search', status: 'completed',
      rawInput: { variant: 'WebSearch', backend: true },
      rawOutput: { action: { type: 'search', query: 'Haushalt 2026', sources: [] } },
    });
    expect(step).toMatchObject({ name: 'WebSearch', action: 'fetch', detail: 'Haushalt 2026' });
    expect(steps.flush()).toEqual([]);
  });

  it('lets a waiting web search go out first when something else shows', () => {
    const steps = acpToolSteps(CWD);
    steps.call({ sessionUpdate: 'tool_call', toolCallId: 'ws_1', title: 'Web search:', kind: 'search', rawInput: { variant: 'WebSearch', backend: true } });
    const next = steps.call(grokCall('c2', 'read_file', 'read', { target_file: `${CWD}/a.md` }));
    expect(next.map((s) => [s.name, s.action, s.detail])).toEqual([['WebSearch', 'fetch', undefined], ['read_file', 'read', 'a.md']]);
    expect(steps.flush()).toEqual([]);
  });

  it('still prefers the real before/after an agent ships with an edit', () => {
    const steps = acpToolSteps(CWD);
    const [step] = steps.call({
      sessionUpdate: 'tool_call', toolCallId: 'e1', title: 'Edit a.ts', kind: 'edit',
      content: [{ type: 'diff', path: `${CWD}/a.ts`, oldText: 'one', newText: 'two\nthree' }],
    });
    expect(step).toMatchObject({ action: 'edit', preview: '- one\n+ two\n+ three', added: 2, removed: 1 });
  });
});
