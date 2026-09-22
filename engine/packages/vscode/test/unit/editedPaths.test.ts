import { describe, expect, it } from 'vitest';
import { applyHostMessage, editedPaths, touchedFiles, type TranscriptItem } from '../../src/panel/transcript.js';

const write = (path: string, action: 'write' | 'edit' | 'read') =>
  ({ kind: 'toolUse', messageId: 'm1', name: 'Edit', action, path }) as const;

describe('editedPaths', () => {
  const build = (msgs: Parameters<typeof applyHostMessage>[1][]) =>
    msgs.reduce<TranscriptItem[]>((items, msg) => applyHostMessage(items, msg), []);

  it('sammelt jede geschriebene Datei einmal, in der Reihenfolge des Chats', () => {
    const items = build([write('AGENTS.md', 'edit'), write('README.md', 'write'), write('AGENTS.md', 'edit')]);
    expect(editedPaths(items)).toEqual(['AGENTS.md', 'README.md']);
  });

  it('zählt Lesen nicht als Änderung', () => {
    expect(editedPaths(build([write('nur-gelesen.md', 'read')]))).toEqual([]);
  });

  it('bleibt leer, solange nichts geschrieben wurde', () => {
    expect(editedPaths(build([{ kind: 'delta', messageId: 'm1', text: 'Hallo' }]))).toEqual([]);
  });

  it('führt gelesene Dateien mit, damit die Übersicht auch ohne Änderung etwas zeigt', () => {
    const items = build([write('gelesen.md', 'read'), write('geschrieben.md', 'edit')]);
    expect(touchedFiles(items)).toEqual([
      { path: 'gelesen.md', mode: 'read' },
      { path: 'geschrieben.md', mode: 'write' },
    ]);
  });

  it('erst gelesen, dann geschrieben gilt als geschrieben — die stärkere Aussage', () => {
    const items = build([write('a.md', 'read'), write('a.md', 'edit')]);
    expect(touchedFiles(items)).toEqual([{ path: 'a.md', mode: 'write' }]);
  });
});
