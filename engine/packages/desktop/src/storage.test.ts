import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDesktopStorage, parseSettings, type DesktopEncryption } from './storage.js';

const roots: string[] = [];
const makeRoot = () => { const root = mkdtempSync(join(tmpdir(), 'cortex-storage-test-')); roots.push(root); return root; };
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const key = Buffer.alloc(32, 71);
const encryption: DesktopEncryption = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
  },
  decryptString(value) {
    const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  },
};
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
function database(root: string, records: Record<string, string>, workspace?: string): string {
  const file = workspace
    ? join(root, 'User', 'workspaceStorage', workspace, 'state.vscdb')
    : join(root, 'User', 'globalStorage', 'state.vscdb');
  mkdirSync(join(file, '..'), { recursive: true });
  const sql = 'CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);'
    + Object.entries(records).map(([key, value]) => `INSERT INTO ItemTable VALUES (${quote(key)},${quote(value)});`).join('');
  const result = spawnSync('/usr/bin/sqlite3', [file, sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Synthetic database setup failed.');
  return file;
}
const secretKey = (key: string, extensionId = 'oskarschiermeister.cortex') => `secret://${JSON.stringify({ extensionId, key })}`;

describe('standalone Cortex storage', () => {
  it('migrates all public metadata and encrypted secrets while preserving the legacy database', async () => {
    const root = makeRoot(), secret = 'synthetic-plugin-token-not-for-production';
    const publicData = {
      'cortex.accounts': [{ id: 'account-a', provider: 'claude', homeDir: '/synthetic/profile' }],
      'cortex.projects': [{ path: '/synthetic/project', name: 'Project' }],
      'cortex.conversations': [{ id: 'chat-a', log: [{ kind: 'text', text: 'Retained' }] }],
      'cortex.unknownFutureKey': { nested: ['also retained'] },
    };
    const db = database(root, {
      'oskarschiermeister.cortex': JSON.stringify(publicData),
      'oskarschiermeister.kortex': JSON.stringify({ 'usturlab.older': 1, 'usturlab.accounts': ['superseded'] }),
      [secretKey('cortex.plugins.credentials')]: JSON.stringify(encryption.encryptString(secret)),
      [secretKey('unrelated-secret', 'somebody.else')]: 'MUST NOT BE PARSED',
    });
    const before = hash(db);
    const store = createDesktopStorage({ userDataPath: root, encryption, isolated: false });
    expect(store.globalState.get('cortex.accounts')).toEqual(publicData['cortex.accounts']);
    expect(store.globalState.get('cortex.unknownFutureKey')).toEqual(publicData['cortex.unknownFutureKey']);
    expect(store.globalState.get('cortex.older')).toBe(1);
    expect(await store.secrets.get('cortex.plugins.credentials')).toBe(secret);
    expect(await store.secrets.get('unrelated-secret')).toBeUndefined();
    expect(readFileSync(join(store.root, 'secrets.json'), 'utf8')).not.toContain(secret);
    expect(store.globalStoragePath).toBe(join(root, 'User', 'globalStorage', 'oskarschiermeister.cortex'));
    await store.globalState.update('cortex.newField', true);
    expect(hash(db)).toBe(before);
    for (const name of readdirSync(store.root)) expect(statSync(join(store.root, name)).mode & 0o777).toBe(0o600);
    expect(statSync(store.root).mode & 0o777).toBe(0o700);
    store.dispose();
  });

  it('imports each workspace independently and allows selecting its memento', async () => {
    const root = makeRoot();
    database(root, { 'oskarschiermeister.cortex': JSON.stringify({ 'cortex.approvedWorkspaceCommands': ['a'] }) }, 'workspace-a');
    database(root, { 'oskarschiermeister.cortex': JSON.stringify({ 'cortex.approvedWorkspaceCommands': ['b'] }) }, 'workspace-b');
    const store = createDesktopStorage({ userDataPath: root, encryption, workspaceId: 'workspace-a', isolated: false });
    expect(store.workspaceIds().sort()).toEqual(['workspace-a', 'workspace-b']);
    expect(store.workspaceState.get('cortex.approvedWorkspaceCommands')).toEqual(['a']);
    expect(store.workspaceStateFor('workspace-b').get('cortex.approvedWorkspaceCommands')).toEqual(['b']);
    await store.workspaceState.update('changed', 42);
    expect(store.workspaceStateFor('workspace-b').get('changed')).toBeUndefined();
    store.dispose();
  });

  it('does not replay migration over later standalone changes', async () => {
    const root = makeRoot();
    const db = database(root, { 'oskarschiermeister.cortex': JSON.stringify({ 'cortex.keep': 'legacy' }) });
    let store = createDesktopStorage({ userDataPath: root, encryption, isolated: false });
    await store.globalState.update('cortex.keep', 'standalone');
    await store.secrets.store('cortex.secret.new', 'new fake secret');
    store.dispose();
    // An unreadable old database is irrelevant after a completed migration.
    writeFileSync(db, 'legacy deliberately made invalid in synthetic fixture');
    store = createDesktopStorage({ userDataPath: root, encryption, isolated: false });
    expect(store.globalState.get('cortex.keep')).toBe('standalone');
    expect(await store.secrets.get('cortex.secret.new')).toBe('new fake secret');
    store.dispose();
  });

  it('never inspects a legacy source for an isolated empty profile unless explicitly supplied', () => {
    const root = makeRoot();
    const db = database(root, { 'oskarschiermeister.cortex': 'malformed fixture that would fail if read' });
    const before = hash(db);
    const store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    expect(store.globalState.keys()).toEqual([]);
    expect(hash(db)).toBe(before);
    store.dispose();
  });

  it('supports an explicit read-only source and preserves its absolute file storage path across restarts', () => {
    const root = makeRoot(), legacy = makeRoot();
    const db = database(legacy, { 'oskarschiermeister.cortex': JSON.stringify({ 'cortex.source': true }) });
    const before = hash(db);
    const store = createDesktopStorage({ userDataPath: root, legacyUserDataPath: legacy, encryption, isolated: true });
    expect(store.globalState.get('cortex.source')).toBe(true);
    expect(store.globalStoragePath).toBe(join(legacy, 'User', 'globalStorage', 'oskarschiermeister.cortex'));
    expect(hash(db)).toBe(before);
    store.dispose();
    const reopened = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    expect(reopened.globalStoragePath).toBe(join(legacy, 'User', 'globalStorage', 'oskarschiermeister.cortex'));
    reopened.dispose();
  });

  it.each(['invalid-json', '[]', 'null', '{"__proto__":{}}'])('fails closed on malformed public metadata: %s', value => {
    const root = makeRoot(), db = database(root, { 'oskarschiermeister.cortex': value });
    const before = hash(db);
    expect(() => createDesktopStorage({ userDataPath: root, encryption, isolated: false })).toThrow();
    expect(existsSync(join(root, 'Standalone'))).toBe(false);
    expect(hash(db)).toBe(before);
    expect(readdirSync(root).some(name => name.startsWith('.Standalone-migration-'))).toBe(false);
  });

  it('does not initialize an empty secret store when legacy decryption fails', () => {
    const root = makeRoot();
    const db = database(root, {
      'oskarschiermeister.cortex': '{}',
      [secretKey('cortex.plugins.credentials')]: JSON.stringify(encryption.encryptString('private test text')),
    });
    const before = hash(db);
    expect(() => createDesktopStorage({ userDataPath: root, isolated: false, encryption: { ...encryption, decryptString: () => { throw new Error('private test text'); } } })).toThrow(/Zugangsdaten/);
    expect(existsSync(join(root, 'Standalone'))).toBe(false);
    expect(hash(db)).toBe(before);
    const retry = createDesktopStorage({ userDataPath: root, encryption, isolated: false });
    expect(retry.globalState.keys()).toEqual([]);
    retry.dispose();
  });

  it('fails closed on unavailable encryption, without exposing plaintext errors', async () => {
    const root = makeRoot();
    const store = createDesktopStorage({ userDataPath: root, encryption: { ...encryption, isEncryptionAvailable: () => false }, isolated: true });
    const before = hash(join(store.root, 'secrets.json'));
    await expect(store.secrets.store('cortex.secret.a', 'secret-private-value')).rejects.toThrow(/Zugangsdaten/);
    expect(hash(join(store.root, 'secrets.json'))).toBe(before);
    store.dispose();
  });

  it('validates previously migrated secrets before opening and never replaces bad data', () => {
    const root = makeRoot();
    const store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    store.dispose();
    const file = join(root, 'Standalone', 'secrets.json');
    writeFileSync(file, JSON.stringify({ bad: Buffer.from('invalid-ciphertext').toString('base64') }));
    const before = hash(file);
    expect(() => createDesktopStorage({ userDataPath: root, encryption, isolated: true })).toThrow(/Zugangsdaten/);
    expect(hash(file)).toBe(before);
  });

  it('keeps the durable and in-memory memento on a failed atomic write', async () => {
    const root = makeRoot();
    const store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    await store.globalState.update('keep', { value: 1 });
    const file = join(store.root, 'global-state.json'), backup = join(store.root, 'backup');
    renameSync(file, backup); mkdirSync(file);
    await expect(store.globalState.update('keep', { value: 2 })).rejects.toThrow();
    expect(store.globalState.get('keep')).toEqual({ value: 1 });
    expect(JSON.parse(readFileSync(backup, 'utf8')).keep).toEqual({ value: 1 });
    expect(readdirSync(store.root).some(name => name.endsWith('.tmp'))).toBe(false);
    rmSync(file, { recursive: true }); renameSync(backup, file);
    await store.flush(); store.dispose();
  });

  it('preserves unknown keys, deletes undefined values, and isolates unsaved object mutation', async () => {
    const root = makeRoot(), store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    await store.globalState.update('keep', { value: 1 });
    const retrieved = store.globalState.get<{ value: number }>('keep')!; retrieved.value = 99;
    expect(store.globalState.get('keep')).toEqual({ value: 1 });
    await store.globalState.update('another', 2);
    await store.globalState.update('another', undefined);
    expect(store.globalState.keys()).toEqual(['keep']);
    expect(store.globalState.get('missing', 'fallback')).toBe('fallback');
    await expect(store.globalState.update('__proto__', {})).rejects.toThrow();
    store.dispose();
  });

  it('imports JSONC settings and publishes persisted settings/secret updates', async () => {
    const root = makeRoot(); mkdirSync(join(root, 'User'));
    writeFileSync(join(root, 'User', 'settings.json'), '{ // retained user setting\n "cortex.browserAccess": "nie", "url": "https://example.test/a//b", /* comment */ "list": [1,2,], }');
    const store = createDesktopStorage({ userDataPath: root, encryption, isolated: false });
    expect(store.settings.read()).toEqual({ 'cortex.browserAccess': 'nie', url: 'https://example.test/a//b', list: [1, 2] });
    let configChanged = false, secretChanged = '';
    const configSubscription = store.onDidChangeConfiguration(event => { configChanged = event.affectsConfiguration('cortex') && event.affectsConfiguration('cortex.browserAccess') && !event.affectsConfiguration('unrelated'); });
    const secretSubscription = store.secrets.onDidChange(event => { secretChanged = event.key; });
    await store.settings.update('cortex.browserAccess', 'auf-ansage');
    expect(configChanged).toBe(true);
    await store.secrets.store('cortex.secret.a', 'fake-secret'); expect(secretChanged).toBe('cortex.secret.a');
    await store.secrets.delete('cortex.secret.a'); expect(await store.secrets.get('cortex.secret.a')).toBeUndefined();
    configSubscription.dispose(); secretSubscription.dispose(); store.dispose();
  });

  it('rejects incomplete existing storage without replacing any contents', () => {
    const root = makeRoot(); mkdirSync(join(root, 'Standalone'));
    const file = join(root, 'Standalone', 'global-state.json'); writeFileSync(file, '{"keep":true}');
    const before = hash(file);
    expect(() => createDesktopStorage({ userDataPath: root, encryption, isolated: true })).toThrow();
    expect(hash(file)).toBe(before);
    expect(existsSync(join(root, 'Standalone', 'migration.json'))).toBe(false);
  });

  it('reloads edited settings after an atomic replacement and avoids duplicate events from its own writes', async () => {
    const root = makeRoot(), store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    expect(store.settingsPath).toBe(join(root, 'Standalone', 'settings.json'));
    const changes: string[] = [];
    store.onDidChangeConfiguration(event => { if (event.affectsConfiguration('cortex.browserAccess')) changes.push(String(store.settings.read()['cortex.browserAccess'])); });
    const replacement = join(store.root, 'edited-settings.json');
    writeFileSync(replacement, '{/* Saved from Monaco */"cortex.browserAccess":"nie",}');
    renameSync(replacement, join(store.root, 'settings.json'));
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(store.settings.read()['cortex.browserAccess']).toBe('nie');
    expect(changes).toEqual(['nie']);
    await store.settings.update('cortex.browserAccess', 'auf-ansage');
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(changes).toEqual(['nie', 'auf-ansage']);
    store.dispose();
  });

  it('retains valid settings on malformed editor saves and picks up a subsequent repair', async () => {
    const root = makeRoot(), store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    await store.settings.update('cortex.browserAccess', 'nie');
    const errors: string[] = []; store.onSettingsError(event => errors.push(event.message));
    const file = join(store.root, 'settings.json'); writeFileSync(file, '{ "private-invalid-value": ');
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(store.settings.read()['cortex.browserAccess']).toBe('nie');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).not.toContain('private-invalid-value');
    await expect(store.settings.update('other', true)).rejects.toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{ "private-invalid-value": ');
    writeFileSync(file, '{ "cortex.browserAccess": "auf-ansage", "editor.fontSize": 17 }');
    // Even before the watch callback, a UI edit must merge the freshly saved file.
    await store.settings.update('editor.tabSize', 4);
    expect(store.settings.read()).toEqual({ 'cortex.browserAccess': 'auf-ansage', 'editor.fontSize': 17, 'editor.tabSize': 4 });
    store.dispose();
  });

  it('opens a previously saved standalone JSONC configuration after restarting', () => {
    const root = makeRoot(), store = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    store.dispose();
    writeFileSync(join(root, 'Standalone', 'settings.json'), '{ /* user comment */ "editor.fontSize": 18, }');
    const restarted = createDesktopStorage({ userDataPath: root, encryption, isolated: true });
    expect(restarted.settings.read()).toEqual({ 'editor.fontSize': 18 });
    restarted.dispose();
  });
});

describe('JSONC parsing', () => {
  it('does not strip strings that contain comment/comma syntax', () => {
    expect(parseSettings('{"test":"/*,}*/ // \\\"","a":true,}')).toEqual({ test: '/*,}*/ // "', a: true });
    expect(() => parseSettings('{ /* unclosed')).toThrow();
    expect(() => parseSettings('[]')).toThrow();
  });
});
