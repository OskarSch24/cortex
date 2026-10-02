import { describe, expect, it } from 'vitest';
import { describeToolUse, shortenPath } from '../src/adapters/toolDetail.js';

const CWD = '/Users/me/project';

describe('claude tool calls', () => {
  it('says which file and which lines were read', () => {
    const d = describeToolUse('Read', { file_path: `${CWD}/src/router/autoRoute.ts`, offset: 105, limit: 56 }, CWD);
    expect(d.action).toBe('read');
    expect(d.path).toBe('src/router/autoRoute.ts');
    expect(d.detail).toBe('src/router/autoRoute.ts:105-160');
  });

  it('shows the edit itself as a diff', () => {
    const d = describeToolUse(
      'Edit',
      {
        file_path: `${CWD}/src/a.ts`,
        old_string: 'const sticky = 12;',
        new_string: 'const sticky = STICKY_BASE;',
      },
      CWD,
    );
    expect(d.action).toBe('edit');
    expect(d.detail).toBe('src/a.ts');
    expect(d.preview).toBe('- const sticky = 12;\n+ const sticky = STICKY_BASE;');
  });

  it('flags a replace-all edit', () => {
    const d = describeToolUse(
      'Edit',
      { file_path: `${CWD}/src/a.ts`, old_string: 'a', new_string: 'b', replace_all: true },
      CWD,
    );
    expect(d.detail).toBe('src/a.ts (all occurrences)');
  });

  it('counts the lines a write produced and previews them', () => {
    const d = describeToolUse('Write', { file_path: `${CWD}/x.md`, content: 'a\nb\nc' }, CWD);
    expect(d.action).toBe('write');
    expect(d.detail).toBe('x.md · 3 lines');
    expect(d.preview).toBe('a\nb\nc');
  });

  it('keeps a shell command on one line and expands the rest', () => {
    const single = describeToolUse('Bash', { command: 'pnpm test' }, CWD);
    expect(single.action).toBe('run');
    expect(single.detail).toBe('pnpm test');
    expect(single.preview).toBeUndefined();

    const multi = describeToolUse('Bash', { command: 'cd x\npnpm build\npnpm test' }, CWD);
    expect(multi.detail).toBe('cd x');
    expect(multi.preview).toContain('pnpm test');
  });

  it('describes searches with what was searched and where', () => {
    expect(describeToolUse('Grep', { pattern: 'retryable', path: `${CWD}/packages` }, CWD).detail).toBe(
      '"retryable" in packages',
    );
    expect(describeToolUse('Glob', { pattern: '**/*.test.ts' }, CWD).detail).toBe('**/*.test.ts');
  });

  it('summarizes a todo list', () => {
    const d = describeToolUse(
      'TodoWrite',
      { todos: [{ content: 'build', status: 'completed' }, { content: 'ship', status: 'pending' }] },
      CWD,
    );
    expect(d.detail).toBe('2 items');
    expect(d.preview).toBe('✓ build\n· ship');
  });

  it('falls back to something readable for an unknown MCP tool', () => {
    const d = describeToolUse('mcp__server__list_things', { limit: 10, org: 'acme' }, CWD);
    expect(d.detail).toContain('acme');
  });

  it('never throws on missing or malformed input', () => {
    expect(describeToolUse('Read', undefined, CWD).action).toBe('read');
    expect(describeToolUse('Whatever', null, CWD).action).toBe('other');
    expect(describeToolUse('Whatever', {}, CWD).detail).toBeUndefined();
  });
});

describe('codex item shapes', () => {
  it('reads a command execution', () => {
    const d = describeToolUse('commandExecution', { command: 'cargo build', type: 'commandExecution' }, CWD);
    expect(d.action).toBe('run');
    expect(d.detail).toBe('cargo build');
  });

  it('lists the files a fileChange touched', () => {
    const d = describeToolUse(
      'fileChange',
      { changes: [{ path: `${CWD}/a.ts` }, { path: `${CWD}/b.ts` }] },
      CWD,
    );
    expect(d.action).toBe('edit');
    expect(d.path).toBe('a.ts');
    expect(d.detail).toBe('a.ts +1 more');
    expect(d.preview).toBe('a.ts\nb.ts');
  });
});

describe('grok tool names', () => {
  // Grok's ACP tool_call has no `kind`; its own tool name is all there is.
  it('reads, edits and writes files under their Grok names', () => {
    const read = describeToolUse('read_file', { target_file: `${CWD}/stand/notiz.md`, offset: 10, limit: 5 }, CWD);
    expect(read).toMatchObject({ action: 'read', path: 'stand/notiz.md', detail: 'stand/notiz.md:10-14' });

    const edit = describeToolUse('search_replace', { file_path: `${CWD}/a.py`, old_string: 'x = 1', new_string: 'x = 2\ny = 3' }, CWD);
    expect(edit).toMatchObject({ action: 'edit', path: 'a.py', added: 2, removed: 1 });

    expect(describeToolUse('write', { file_path: `${CWD}/b.txt`, content: 'hi' }, CWD).action).toBe('write');
  });

  it('keeps the agent’s own description of a command', () => {
    const run = describeToolUse('run_terminal_command', { command: "python3 - <<'PY'\nprint(1)\nPY", description: 'Count open fields per ministry' }, CWD);
    expect(run).toMatchObject({ action: 'run', detail: "python3 - <<'PY'", description: 'Count open fields per ministry' });
    expect(describeToolUse('Bash', { command: 'git status', description: 'Show working tree status' }, CWD).description).toBe('Show working tree status');
    expect(describeToolUse('Bash', { command: 'ls' }, CWD).description).toBeUndefined();
  });

  it('marks a folder listing by its path, unlike a search', () => {
    expect(describeToolUse('list_dir', { target_directory: `${CWD}/europa/stand` }, CWD)).toEqual({ action: 'search', path: 'europa/stand', detail: 'europa/stand' });
    expect(describeToolUse('grep', { pattern: 'Ministerium', path: `${CWD}/europa` }, CWD)).toEqual({ action: 'search', detail: '"Ministerium" in europa' });
  });

  it('knows the web, subagent and task-list tools', () => {
    expect(describeToolUse('web_fetch', { url: 'https://www.legifrance.gouv.fr/x' }, CWD)).toMatchObject({ action: 'fetch', detail: 'https://www.legifrance.gouv.fr/x' });
    expect(describeToolUse('spawn_subagent', { description: 'FR ministries', prompt: 'Fill the gaps' }, CWD)).toMatchObject({ action: 'task', detail: 'FR ministries' });
    expect(describeToolUse('todo_write', { todos: [{ id: '1', content: 'lesen', status: 'completed' }] }, CWD)).toMatchObject({ action: 'other', preview: '✓ lesen' });
  });
});

describe('acp tool kinds', () => {
  it('maps every ACP kind to a real action', () => {
    expect(describeToolUse('read', { path: `${CWD}/a.ts` }, CWD).action).toBe('read');
    expect(describeToolUse('execute', { command: 'ls' }, CWD).action).toBe('run');
    expect(describeToolUse('search', { query: 'foo' }, CWD).action).toBe('search');
    expect(describeToolUse('fetch', { url: 'https://x.dev' }, CWD).action).toBe('fetch');
    expect(describeToolUse('delete', { path: `${CWD}/a.ts` }, CWD).detail).toBe('deleted a.ts');
    expect(describeToolUse('move', { path: `${CWD}/a.ts`, newPath: `${CWD}/b.ts` }, CWD).detail).toBe(
      'a.ts → b.ts',
    );
  });
});

describe('path shortening', () => {
  it('drops the workspace prefix', () => {
    expect(shortenPath(`${CWD}/src/a.ts`, CWD)).toBe('src/a.ts');
  });

  it('leaves a path outside the workspace alone', () => {
    expect(shortenPath('/etc/hosts', CWD)).toBe('/etc/hosts');
  });

  it('matches a decomposed project folder against a composed file path', () => {
    const cwd = '/Users/me/Persönliche Projekte/Demo'.normalize('NFD');
    const file = '/Users/me/Persönliche Projekte/Demo/Mock/a.html'.normalize('NFC');
    expect(shortenPath(file, cwd)).toBe('Mock/a.html');
  });
});

describe('preview budget', () => {
  it('truncates long content instead of flooding the timeline', () => {
    const content = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
    const d = describeToolUse('Write', { file_path: `${CWD}/big.txt`, content }, CWD);
    expect(d.detail).toBe('big.txt · 400 lines');
    expect(d.preview!.length).toBeLessThan(1500);
    expect(d.preview).toContain('more lines');
  });
});
