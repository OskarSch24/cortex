import { mkdtempSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alsMarkdown, ExokortexExport, type ExportableConversation } from '../../src/storage/exokortexExport.js';
import type { HostToWebview } from '../../src/panel/protocol.js';

const chat = (log: HostToWebview[], über: Partial<ExportableConversation> = {}): ExportableConversation => ({
  id: 'c0ffee12-3456-7890-abcd-ef0123456789',
  title: 'Exokortex an Cortex hängen',
  projectPath: '/Users/oskar/dev/Exokortex',
  pinnedTarget: { provider: 'claude', account: 'privat', model: 'opus-5' },
  createdAt: Date.UTC(2026, 8, 9, 11, 0),
  updatedAt: Date.UTC(2026, 8, 9, 12, 30),
  log,
  ...über,
});

const gespräch: HostToWebview[] = [
  { kind: 'userEcho', text: 'Wo liegt der Volltext?' },
  { kind: 'delta', messageId: 'm1', text: 'In inhalt.sqlite, ' },
  { kind: 'delta', messageId: 'm1', text: 'mit FTS5.' },
  { kind: 'toolUse', messageId: 'm1', name: 'Read', detail: 'basis.py', path: 'protokoll/basis.py' },
  { kind: 'done', messageId: 'm1' },
];

describe('chats survive outside globalState', () => {
  it('deletes only the explicitly selected conversation export', () => {
    const folder = mkdtempSync(join(tmpdir(), 'chat-delete-'));
    try {
      const archive = new ExokortexExport(folder), first = chat(gespräch), second = chat(gespräch, { id: 'other123-abc', title: 'Other' });
      archive.schreibe([first, second]); archive.entferne(first.id);
      const remaining = readdirSync(join(folder, '2026'));
      expect(remaining).toHaveLength(1);
      expect(readFileSync(join(folder, '2026', remaining[0]!), 'utf8')).toContain('chat: "other123-abc"');
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
  it('writes frontmatter the Exokortex parses and one chapter per turn', () => {
    const md = alsMarkdown(chat(gespräch));
    expect(md.startsWith('---\nart: cortex-chat\n')).toBe(true);
    expect(md).toContain('title: "Exokortex an Cortex hängen"');
    expect(md).toContain('konto: "claude:privat/opus-5"');
    // Turns are chapters (#), so each becomes its own node in the graph.
    expect(md.match(/^# \d+ · /gm)).toHaveLength(2);
    expect(md).toContain('# 1 · Oskar');
    expect(md).toContain('# 2 · claude:privat/opus-5');
    // Deltas of one answer are one text, not two fragments.
    expect(md).toContain('In inhalt.sqlite, mit FTS5.');
    expect(md).toContain('### Read — basis.py');
  });

  it('fences a preview that contains its own fence', () => {
    // A diff of a Markdown file carries ``` — a three-backtick fence would end
    // the block there and turn the rest of the chat into prose.
    const diff = '- alt\n```bash\nnpm run build\n```\n+ neu';
    const md = alsMarkdown(chat([
      { kind: 'userEcho', text: 'Ändere die Doku' },
      { kind: 'toolUse', messageId: 'm1', name: 'Edit', detail: 'README.md', action: 'edit', preview: diff },
      { kind: 'done', messageId: 'm1' },
    ]));
    expect(md).toContain('````diff\n' + diff + '\n````');
    // The closing fence is the last thing of that block, not the inner one.
    expect(md.split('````')).toHaveLength(3);
  });

  it('keeps quotes in a title from breaking the frontmatter', () => {
    const md = alsMarkdown(chat(gespräch, { title: 'Was heisst "vollstaendig"?' }));
    expect(md).toContain('title: "Was heisst \\"vollstaendig\\"?"');
  });

  it('records an unanswered permission request rather than dropping it', () => {
    const md = alsMarkdown(chat([
      { kind: 'userEcho', text: 'Räum auf' },
      { kind: 'permission', messageId: 'm1', request: { id: 'p1', kind: 'command', title: 'rm -rf build', detail: 'im Projektordner' } },
    ] as HostToWebview[]));
    expect(md).toContain('rm -rf build — im Projektordner');
    expect(md).toContain('> Unbeantwortet');
  });

  it('writes only what changed, and never renames a file when the title moves', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'chats-'));
    const export_ = new ExokortexExport(ordner);
    const rec = chat(gespräch);

    export_.schreibe([rec]);
    const zuerst = readdirSync(join(ordner, '2026'));
    expect(zuerst).toEqual(['2026-09-09-Exokortex-an-Cortex-haengen--c0ffee12.md']);

    // A renamed file would become a second document node in the graph and
    // leave the first one behind as a corpse.
    export_.schreibe([{ ...rec, title: 'Ganz anderer Titel', updatedAt: rec.updatedAt + 1 }]);
    expect(readdirSync(join(ordner, '2026'))).toEqual(zuerst);
    expect(readFileSync(join(ordner, '2026', zuerst[0]!), 'utf8')).toContain('title: "Ganz anderer Titel"');
  });

  it('does not restamp a file whose content is unchanged', () => {
    // Nach einem Neustart ist der Merker leer, also gilt jeder Chat als neu.
    // Würde er dann neu geschrieben, sähe die Einspeisung drüben vier
    // geänderte Chats und liefe sechs Minuten für nichts.
    const ordner = mkdtempSync(join(tmpdir(), 'chats-'));
    const rec = chat(gespräch);
    new ExokortexExport(ordner).schreibe([rec]);
    const datei = join(ordner, '2026', readdirSync(join(ordner, '2026'))[0]!);
    const gestempelt = statSync(datei).mtimeMs;

    // Ein frischer Export, wie nach einem Neustart der App.
    new ExokortexExport(ordner).schreibe([rec]);
    expect(statSync(datei).mtimeMs).toBe(gestempelt);

    // Ein echter neuer Zug schreibt sehr wohl.
    new ExokortexExport(ordner).schreibe([{
      ...rec,
      updatedAt: rec.updatedAt + 1,
      log: [...gespräch, { kind: 'userEcho', text: 'Und weiter?' }],
    }]);
    expect(readFileSync(datei, 'utf8')).toContain('Und weiter?');
  });

  it('skips a conversation with nothing in it', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'chats-'));
    new ExokortexExport(ordner).schreibe([chat([])]);
    expect(readdirSync(ordner)).toEqual([]);
  });
});
