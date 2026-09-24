import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { errorMessage } from '../../src/util/errors.js';
import { git, gitBuffer, runFile, tryExec } from '../../src/util/exec.js';
import { isInside } from '../../src/util/paths.js';
import { alive } from '../../src/util/process.js';
import { SerialQueue } from '../../src/util/serialQueue.js';
import { writeFileAtomic, writeFileAtomicAsync } from '../../src/util/atomicWrite.js';
import { sameSecret } from '../../src/util/secrets.js';
import { ProjectScoped } from '../../src/context/projectScoped.js';
import { managedClaudeBin, personalMcpFile, profilesArchiveRoot, profilesRoot, projectMcpFile, runtimeBinDir } from '../../src/paths.js';

describe('writeFileAtomic', () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'cortex-atomic-')); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const [name, write] of [
    ['synchron', async (...args: Parameters<typeof writeFileAtomic>) => writeFileAtomic(...args)],
    ['asynchron', writeFileAtomicAsync],
  ] as const) {
    it(`${name}: ersetzt die Datei mit den verlangten Rechten und räumt die Zwischendatei weg`, async () => {
      const file = join(dir, `${name}.json`);
      writeFileSync(file, 'alt');
      await write(file, '{"neu":true}', { mode: 0o600, fsync: true, syncDir: true });
      expect(readFileSync(file, 'utf8')).toBe('{"neu":true}');
      expect(statSync(file).mode & 0o777).toBe(0o600);
      await write(file, Buffer.from([1, 2]), { mode: 0o644, fsync: false, syncDir: false, temporary: join(dir, `.${name}-eigen.tmp`) });
      expect([...readFileSync(file)]).toEqual([1, 2]);
      expect(readdirSync(dir).filter(entry => entry.includes('tmp'))).toEqual([]);
    });

    it(`${name}: lässt bei einem Fehler das Original stehen und keine Zwischendatei zurück`, async () => {
      const target = join(dir, `${name}-ordner`);
      mkdirSync(join(target, 'belegt'), { recursive: true });
      await expect(write(target, 'x', { mode: 0o600, fsync: true, syncDir: true, temporary: join(dir, `${name}-z.tmp`) })).rejects.toThrow();
      expect(existsSync(join(target, 'belegt'))).toBe(true);
      expect(existsSync(join(dir, `${name}-z.tmp`))).toBe(false);
    });
  }
});

describe('sameSecret', () => {
  it('vergleicht Bytes, nicht Zeichen, und verträgt ungleiche Längen', () => {
    expect(sameSecret('Bearer abc', 'Bearer abc')).toBe(true);
    expect(sameSecret('Bearer abd', 'Bearer abc')).toBe(false);
    expect(sameSecret('Bearer ab', 'Bearer abc')).toBe(false);
    expect(sameSecret('', '')).toBe(true);
    expect(sameSecret('ä', 'aa')).toBe(false);
  });
});

describe('ProjectScoped', () => {
  class Probe extends ProjectScoped<Probe> {
    protected forProject(root: string): Probe { return new Probe(this.output, root); }
    get current() { return this.root; }
  }
  it('gibt je Ordner genau eine Instanz und für den eigenen sich selbst', () => {
    const output = { appendLine() {} } as any;
    const window = new Probe(output);
    const project = new Probe(output, '/p');
    expect(project.forRoot('/p')).toBe(project);
    expect(window.forRoot('/a')).toBe(window.forRoot('/a'));
    expect(window.forRoot('/a')).not.toBe(window.forRoot('/b'));
    expect(window.forRoot('/a').current).toBe('/a');
  });
});

describe('Cortex-Pfade', () => {
  it('fragen HOME erst beim Aufruf', () => {
    const before = process.env.HOME;
    process.env.HOME = '/tmp/cortex-home-probe';
    try {
      expect(profilesRoot()).toBe('/tmp/cortex-home-probe/.cortex/profiles');
      expect(profilesArchiveRoot()).toBe('/tmp/cortex-home-probe/.cortex/profiles-archiv');
      expect(managedClaudeBin()).toBe('/tmp/cortex-home-probe/.cortex/runtime/claude/node_modules/.bin/claude');
      expect(runtimeBinDir()).toBe('/tmp/cortex-home-probe/.cortex/runtime/bin');
      expect(personalMcpFile()).toBe('/tmp/cortex-home-probe/.cortex/mcp.json');
      expect(projectMcpFile('/p')).toBe('/p/.cortex/mcp.json');
    } finally { process.env.HOME = before; }
  });
});

describe('SerialQueue', () => {
  it('führt nacheinander aus und läuft nach einem Fehler weiter', async () => {
    const queue = new SerialQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = queue.run(async () => { order.push('a:start'); await gate; order.push('a:end'); return 1; });
    const second = queue.run(async () => { order.push('b'); throw new Error('b scheitert'); });
    const third = queue.run(async () => { order.push('c'); return 3; });
    await Promise.resolve();
    expect(order).toEqual(['a:start']);
    release();
    expect(await first).toBe(1);
    await expect(second).rejects.toThrow('b scheitert');
    expect(await third).toBe(3);
    expect(order).toEqual(['a:start', 'a:end', 'b', 'c']);
  });

  it('idle() wartet auf alles Eingereihte und scheitert nie', async () => {
    const queue = new SerialQueue();
    let done = false;
    void queue.run(async () => { await new Promise(r => setTimeout(r, 10)); done = true; });
    void queue.run(async () => { throw new Error('x'); }).catch(() => undefined);
    await expect(queue.idle()).resolves.toBeUndefined();
    expect(done).toBe(true);
  });
});

describe('alive', () => {
  it('kennt den eigenen Prozess und hält einen verschwundenen für tot', () => {
    expect(alive(process.pid)).toBe(true);
    const child = execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
    expect(alive(Number(child))).toBe(false);
  });
});

describe('isInside', () => {
  it('rechnet streng: `..` als Abschnitt führt hinaus, `..name` nicht', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true);
    expect(isInside('/a/b', '/a/b/..backup')).toBe(true);
    expect(isInside('/a/b', '/a/b/../c')).toBe(false);
    expect(isInside('/a/b', '/a')).toBe(false);
    expect(isInside('/a/b', '/a/bc')).toBe(false);
    expect(isInside('/a/b', '/x/y')).toBe(false);
  });

  it('zählt den Ordner selbst nur mit allowSelf mit', () => {
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b/')).toBe(true);
    expect(isInside('/a/b', '/a/b', { allowSelf: false })).toBe(false);
    expect(isInside('/a/b', '/a/b/c', { allowSelf: false })).toBe(true);
  });
});

describe('errorMessage', () => {
  it('nimmt die Meldung eines Error und die Textform von allem anderen', () => {
    expect(errorMessage(new Error('kaputt'))).toBe('kaputt');
    expect(errorMessage(new TypeError('falsch'))).toBe('falsch');
    expect(errorMessage('schlicht')).toBe('schlicht');
    expect(errorMessage(42)).toBe('42');
    expect(errorMessage(undefined)).toBe('undefined');
    expect(errorMessage({ message: 'kein Error' })).toBe('[object Object]');
  });
});

describe('Prozesse starten', () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'cortex-exec-'));
    execFileSync('git', ['init', '-q'], { cwd: repo });
    writeFileSync(join(repo, 'a.bin'), Buffer.from([0, 1, 2, 255]));
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x'], { cwd: repo });
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it('tryExec liefert getrimmte Ausgabe und bei jedem Fehler undefined', async () => {
    expect(await tryExec('/bin/echo', ['  hallo  '], 4000)).toBe('hallo');
    expect(await tryExec('/bin/sh', ['-c', 'exit 3'], 4000)).toBeUndefined();
    expect(await tryExec('/gibt/es/nicht', [], 4000)).toBeUndefined();
    expect(await tryExec('/bin/sleep', ['5'], 50)).toBeUndefined();
  });

  it('runFile wirft, wenn das Programm scheitert', async () => {
    await expect(runFile('/bin/sh', ['-c', 'exit 0'], { timeout: 4000 })).resolves.toBeUndefined();
    await expect(runFile('/bin/sh', ['-c', 'exit 2'], { timeout: 4000 })).rejects.toMatchObject({ code: 2 });
  });

  it('git liefert stdout ungekürzt, gitBuffer die Bytes', async () => {
    expect(await git(repo, ['ls-files'], { timeout: 8000 })).toBe('a.bin\n');
    expect([...await gitBuffer(repo, ['show', 'HEAD:./a.bin'], { timeout: 8000 })]).toEqual([0, 1, 2, 255]);
    await expect(git(repo, ['show', 'HEAD:fehlt'], { timeout: 8000 })).rejects.toMatchObject({ code: 128 });
  });

  it('git hält den Pufferdeckel ein, wenn einer genannt ist', async () => {
    await expect(git(repo, ['log'], { timeout: 8000, maxBuffer: 4 })).rejects.toThrow(/maxBuffer/);
  });
});
