import { describe, expect, it } from 'vitest';
import {
  SLASH_COMMANDS,
  commandZoneEnd,
  expandSlashCommand,
  expandSlashCommands,
  hasSlashCommand,
  parseCommandsFile,
  parseSlashCommands,
  withoutSlashKind,
} from '../src/commands/slashCommands.js';
import { asksForCanvas } from '../src/context/canvasBrief.js';
import { asksForVideo } from '../src/context/remotionBrief.js';

const cmd = (name: string) => SLASH_COMMANDS.find((c) => c.name === name)!;
const names = (text: string) => parseSlashCommands(text).commands.map((c) => c.name);

describe('several slash commands in one message', () => {
  it('finds prompt commands and /goal anywhere in the first paragraph, in order', () => {
    expect(names('/goal /test')).toEqual(['goal', 'test']);
    expect(names('Bitte /review und /security-review für das Auth-Modul')).toEqual(['review', 'security-review']);
    expect(names('/fix Login-Button stürzt ab /test /commit')).toEqual(['fix', 'test', 'commit']);
    expect(names('@claude:privat/claude-opus-5-5 /goal /remotion Intro')).toEqual(['goal', 'remotion']);
    expect(names('/review /review')).toEqual(['review']);
  });

  it('takes the command words out and keeps what they are about', () => {
    expect(parseSlashCommands('/goal /test').rest).toBe('');
    expect(parseSlashCommands('/fix Login-Button stürzt ab /test').rest).toBe('Login-Button stürzt ab');
    expect(parseSlashCommands('Bitte /review, danke').rest).toBe('Bitte, danke');
    expect(parseSlashCommands('Mach /test\nund dann weiter').rest).toBe('Mach\nund dann weiter');
  });

  it('only counts an action at the very start, as before', () => {
    expect(names('/archive')).toEqual(['archive']);
    expect(names('Wie funktioniert die /search Seite?')).toEqual([]);
    expect(parseSlashCommands('Wie funktioniert die /search Seite?').rest).toBe('Wie funktioniert die /search Seite?');
  });

  it('leaves paths, URLs, code and pasted material alone', () => {
    expect(names('Lies src/test und /test/unit/a.ts')).toEqual([]);
    expect(names('Siehe https://example.com/test')).toEqual([]);
    expect(names('Was macht `/test` hier?')).toEqual([]);
    expect(names('Was steht im Log?\n\nGET /test 200\nGET /review 404')).toEqual([]);
    expect(commandZoneEnd('Absatz eins\n\nAbsatz zwei')).toBe('Absatz eins'.length);
    expect(names('Was ist /Test?')).toEqual([]);
  });

  it('lets custom commands shadow built-ins everywhere, not only at the start', () => {
    const parsed = parseCommandsFile(JSON.stringify({ commands: [{ name: 'test', template: 'Custom test for {args}' }] }));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(expandSlashCommands('/goal /test die API', parsed.commands)).toBe('Custom test for die API');
  });

  it('expands one leading command exactly as before, including Claude passthrough', () => {
    expect(expandSlashCommands('/fix der Parser')).toBe(expandSlashCommand(cmd('fix'), 'der Parser'));
    expect(expandSlashCommands('/review das Auth-Modul', [], { native: true })).toBe('/review das Auth-Modul');
    expect(expandSlashCommands('/review das Auth-Modul')).toBe(expandSlashCommand(cmd('review'), 'das Auth-Modul'));
    expect(expandSlashCommands('Ganz normale Frage')).toBe('Ganz normale Frage');
  });

  it('expands a single command in the middle about the rest of the message', () => {
    expect(expandSlashCommands('Bitte /fix den Login-Bug')).toBe(expandSlashCommand(cmd('fix'), 'Bitte den Login-Bug'));
  });

  it('carries out several commands in order, about the same rest, never natively', () => {
    const out = expandSlashCommands('/fix Login-Bug /test /commit', [], { native: true });
    expect(out).toContain('carry out all of them, in this order');
    expect(out).toContain('1. Fix the following issue in this codebase: Login-Bug. Verify the fix.');
    expect(out).toContain(`2. ${cmd('test').template}`);
    expect(out).toContain(`3. ${cmd('commit').template}`);
    expect(out).toContain("The user's own words: Login-Bug");
    expect(out).not.toMatch(/^\//);
  });

  it('adds nothing for /goal itself — the goal brief carries it', () => {
    expect(expandSlashCommands('/goal Baue die Startseite fertig')).toBe('Baue die Startseite fertig');
    expect(expandSlashCommands('/goal /test')).toBe(cmd('test').template);
    expect(expandSlashCommands('/goal /review', [], { native: true })).toBe(cmd('review').template);
    expect(withoutSlashKind('/goal /test die API', 'goal')).toBe('/test die API');
  });

  it('recognizes canvas and video commands next to others', () => {
    expect(hasSlashCommand('/goal /remotion Intro', 'remotion')).toBe(true);
    expect(asksForVideo('/goal /remotion Intro')).toBe(true);
    expect(asksForCanvas('/goal /excalidraw Ablauf')).toBe(true);
    expect(asksForVideo('Erklär mir Remotion')).toBe(false);
    expect(asksForCanvas('Erklär mir das Log\n\n/excalidraw steht erst im zweiten Absatz')).toBe(false);
  });
});
