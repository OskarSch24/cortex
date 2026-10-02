import { describe, expect, it } from 'vitest';
import { toolWords } from '../../webview/components/toolWords.js';
import { applyHostMessage, type ToolStep, type TranscriptItem } from '../../src/panel/transcript.js';
import type { HostToWebview } from '../../src/panel/protocol.js';

describe('Werkzeuge ohne feste Art sagen, was sie tun', () => {
  it('nennt bekannte Werkzeuge beim Namen, gleich von welchem Anbieter', () => {
    expect(toolWords({ name: 'todo_write', detail: '3 items' })).toMatchObject({ done: 'Aufgabenliste aktualisiert', subject: undefined });
    expect(toolWords({ name: 'TodoWrite' }).done).toBe('Aufgabenliste aktualisiert');
    expect(toolWords({ name: 'get_command_or_subagent_output', detail: 'Download the 1990 yearbook' })).toMatchObject({
      done: 'Ausgabe einer Hintergrundaufgabe abgerufen',
      now: 'Wartet auf eine Hintergrundaufgabe',
      subject: 'Download the 1990 yearbook',
    });
    expect(toolWords({ name: 'image_gen', detail: 'A red cube' })).toMatchObject({ done: 'Bild erzeugt', subject: 'A red cube', icon: 'images' });
    expect(toolWords({ name: 'search_tool', detail: 'chrome screenshot' })).toMatchObject({ done: 'Passende Werkzeuge nachgeschlagen', subject: 'chrome screenshot' });
  });

  it('hält Groks eigenes Gedächtnis vom Exokortex getrennt', () => {
    expect(toolWords({ name: 'memory_search', detail: 'Nordwind Werkbank' }).done).toBe('Im Gedächtnis nachgesehen');
    expect(toolWords({ name: 'mcp__exokortex__suche', detail: 'Haushaltsbuch' })).toMatchObject({ done: 'Im Exokortex nachgesehen', subject: 'Haushaltsbuch' });
  });

  it('zeigt bei Plugins Server, Werkzeug und Argument', () => {
    expect(toolWords({ name: 'mcp__chrome-devtools__new_page', detail: 'http://localhost:5173/kurs' })).toMatchObject({
      done: 'Chrome Devtools: New Page',
      now: 'Nutzt Chrome Devtools · New Page',
      subject: 'http://localhost:5173/kurs',
    });
  });

  it('zeigt von JSON-Argumenten nur den ersten Text, nie die Syntax', () => {
    expect(toolWords({ name: 'mcp__exokortex__suche', detail: '{"frage":"scrollbar deploy","n":15}' }).subject).toBe('scrollbar deploy');
    expect(toolWords({ name: 'mcp__chrome-devtools__list_pages', detail: '{"pageId":2}' }).subject).toBeUndefined();
    expect(toolWords({ name: 'mcp__x__y', detail: '{"frage":"abgeschnit …' }).subject).toBeUndefined();
  });

  it('nennt ein unbekanntes Werkzeug wenigstens beim Namen', () => {
    expect(toolWords({ name: 'frobnicate_things', detail: 'x' })).toMatchObject({ done: 'Werkzeug „Frobnicate Things“ verwendet', subject: 'x' });
    // Was schon ein Satz ist, bleibt einer.
    expect(toolWords({ name: 'Viewing the file' }).done).toBe('Werkzeug „Viewing the file“ verwendet');
  });
});

describe('Grok-Schritte aus älteren Chats', () => {
  const steps = (...msgs: Array<Omit<Extract<HostToWebview, { kind: 'toolUse' }>, 'kind' | 'messageId'>>): ToolStep[] => {
    let items: TranscriptItem[] = [];
    for (const msg of msgs) items = applyHostMessage(items, { kind: 'toolUse', messageId: 'm1', ...msg });
    const turn = items[0] as Extract<TranscriptItem, { kind: 'assistant' }>;
    const segment = turn.segments[0] as { kind: 'tools'; steps: ToolStep[] };
    return segment.steps;
  };

  it('erkennt, was damals als namenloses Werkzeug ankam', () => {
    const [run, read, list, edit, fetch, search, plugin, wait] = steps(
      { name: 'run_terminal_command', action: 'other', detail: "python3 - <<'PY'\n… +12 more lines" },
      { name: 'read_file', action: 'other', detail: '{"target_file":"/Users/me/Dummy Economics/stand/STATUS.md"}' },
      { name: 'list_dir', action: 'other', detail: '{"target_directory":"/Users/me/Dummy Economics/europa"}' },
      { name: 'search_replace', action: 'other', path: 'a.py', detail: 'a.py' },
      { name: 'web_fetch', action: 'other', detail: 'https://example.org' },
      { name: 'Web search:', action: 'search', detail: '""' },
      { name: 'use_tool', action: 'other', detail: '{"tool_name":"exokortex__suche","tool_input":{"frage":"Bilanz","n":15}}' },
      { name: 'get_command_or_subagent_output', action: 'other', detail: '{"task_ids":["call-1"],"timeout_ms":120000}' },
    );
    expect(run).toMatchObject({ action: 'run', detail: "python3 - <<'PY'" });
    expect(read).toMatchObject({ action: 'read', path: '/Users/me/Dummy Economics/stand/STATUS.md' });
    expect(list).toMatchObject({ action: 'search', path: '/Users/me/Dummy Economics/europa' });
    expect(edit).toMatchObject({ action: 'edit', path: 'a.py' });
    expect(fetch).toMatchObject({ action: 'fetch', detail: 'https://example.org' });
    expect(search).toMatchObject({ name: 'WebSearch', action: 'fetch', detail: undefined });
    expect(plugin).toMatchObject({ name: 'mcp__exokortex__suche', detail: '{"frage":"Bilanz","n":15}' });
    expect(wait).toMatchObject({ name: 'get_command_or_subagent_output', detail: undefined });
  });

  it('lässt Schritte, die ihre Art schon tragen, und abgeschnittenes JSON in Ruhe', () => {
    const [claude, clipped] = steps(
      { name: 'Read', action: 'read', path: 'a.ts', detail: 'a.ts' },
      { name: 'read_file', action: 'other', detail: '{"target_file":"/Users/me/sehr/lang …' },
    );
    expect(claude).toMatchObject({ name: 'Read', action: 'read', path: 'a.ts' });
    expect(clipped).toMatchObject({ name: 'read_file', action: 'other' });
  });

  it('trägt die Beschreibung des Agenten bis in den Schritt', () => {
    const [run, wait] = steps(
      { name: 'run_terminal_command', action: 'run', detail: 'ls', description: 'List the import folder' },
      { name: 'get_command_or_subagent_output', action: 'other', detail: 'List the import folder' },
    );
    expect(run).toMatchObject({ action: 'run', description: 'List the import folder' });
    // Ein neuer Schritt nennt den Befehl, auf den er wartet — der bleibt stehen.
    expect(wait).toMatchObject({ detail: 'List the import folder' });
  });
});
