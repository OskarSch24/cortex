import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRecord, nonEmptyString } from '../src/util/guards.js';
import { toEpochMs } from '../src/util/epoch.js';
import { readJson, stripLineComments } from '../src/util/jsonFile.js';
import { jwtClaims } from '../src/util/jwt.js';
import { terminateChild } from '../src/util/process.js';
import { RpcError } from '../src/util/rpcError.js';
import { getNumber, getObject, getString } from '../src/adapters/ndjson.js';
import { grokAuthFile } from '../src/adapters/grok.js';
import { readCopilotConfig } from '../src/adapters/copilot.js';

const dirs: string[] = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-util-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('JSON-Dateien', () => {
  it('readJson: undefined ohne Datei, wirft bei ungültigem JSON', () => {
    const dir = tempDir();
    expect(readJson(join(dir, 'fehlt.json'))).toBeUndefined();
    writeFileSync(join(dir, 'ok.json'), '{"a":1}');
    expect(readJson(join(dir, 'ok.json'))).toEqual({ a: 1 });
    writeFileSync(join(dir, 'kaputt.json'), '{');
    expect(() => readJson(join(dir, 'kaputt.json'))).toThrow();
  });

  it('readCopilotConfig liest JSONC mit Zeilenkommentaren', () => {
    const dir = tempDir();
    expect(readCopilotConfig(dir)).toBeUndefined();
    writeFileSync(join(dir, 'config.json'), '// Kommentar\n{\n  // noch einer\n  "loggedInUsers": [{ "login": "a" }]\n}\n');
    expect(readCopilotConfig(dir)).toEqual({ loggedInUsers: [{ login: 'a' }] });
    expect(stripLineComments('  // x\n1')).toBe('\n1');
  });

  it('grokAuthFile bevorzugt .grok/auth.json und fällt sonst auf den flachen Pfad zurück', () => {
    const dir = tempDir();
    expect(grokAuthFile(dir)).toBe(join(dir, 'auth.json'));
    mkdirSync(join(dir, '.grok'));
    writeFileSync(join(dir, '.grok', 'auth.json'), '{}');
    expect(grokAuthFile(dir)).toBe(join(dir, '.grok', 'auth.json'));
  });
});

describe('RpcError', () => {
  it('bleibt ein Error und trägt den Code', () => {
    const error = new RpcError('Method not found', -32601);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Method not found');
    expect(error.code).toBe(-32601);
    expect(new RpcError('x').code).toBeUndefined();
  });
});

describe('terminateChild', () => {
  it('beendet einen Prozess, der SIGTERM ignoriert, nach der Frist hart', async () => {
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('bereit'); setInterval(() => {}, 1000);"], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
    const exited = new Promise<NodeJS.Signals | null>((resolve) => child.once('exit', (_code, signal) => resolve(signal)));
    terminateChild(child, 100);
    expect(await exited).toBe('SIGKILL');
  });
});

describe('jwtClaims', () => {
  const jwt = (claims: unknown) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
  it('liest den Payload', () => {
    expect(jwtClaims(jwt({ email: 'a@b.c' }))).toEqual({ email: 'a@b.c' });
  });
  it('gibt undefined für Unlesbares', () => {
    expect(jwtClaims('')).toBeUndefined();
    expect(jwtClaims('nur-ein-teil')).toBeUndefined();
    expect(jwtClaims('h.%%%.s')).toBeUndefined();
    expect(jwtClaims(jwt([1, 2]))).toBeUndefined();
    expect(jwtClaims(jwt(null))).toBeUndefined();
  });
});

describe('Typprüfungen', () => {
  it('isRecord nimmt nur einfache Objekte', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('nonEmptyString trimmt nicht', () => {
    expect(nonEmptyString('a')).toBe('a');
    expect(nonEmptyString(' ')).toBe(' ');
    expect(nonEmptyString('')).toBeUndefined();
    expect(nonEmptyString(3)).toBeUndefined();
  });
});

describe('toEpochMs', () => {
  it('rechnet Sekunden um und lässt Millisekunden stehen', () => {
    expect(toEpochMs(1_753_970_400)).toBe(1_753_970_400_000);
    expect(toEpochMs(1_753_970_400_000)).toBe(1_753_970_400_000);
    expect(toEpochMs(10_000_000_000)).toBe(10_000_000_000_000);
  });
});

describe('ndjson-Pfade', () => {
  const doc = { a: { b: 'text', n: 2, list: [{ path: 'p' }], arr: [1] } };
  it('folgt Objekten und Array-Indizes', () => {
    expect(getString(doc, 'a', 'b')).toBe('text');
    expect(getNumber(doc, 'a', 'n')).toBe(2);
    expect(getString(doc, 'a', 'list', '0', 'path')).toBe('p');
    expect(getObject(doc, 'a')).toBe(doc.a);
  });
  it('gibt an einer Sackgasse undefined', () => {
    expect(getString(doc, 'a', 'n')).toBeUndefined();
    expect(getString(doc, 'a', 'b', 'c')).toBeUndefined();
    expect(getObject(doc, 'a', 'arr')).toBeUndefined();
    expect(getObject(null, 'a')).toBeUndefined();
    expect(getObject(doc)).toBe(doc);
  });
});
