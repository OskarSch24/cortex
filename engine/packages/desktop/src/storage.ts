import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, readFileSync,
  readdirSync, renameSync, rmSync, watch,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { syncDirectory, writeFileAtomic } from '../../vscode/src/util/atomicWrite.js';

type State = Record<string, unknown>;
type WorkspaceStates = Record<string, State>;
type EncryptedSecrets = Record<string, string>;
export interface DesktopEncryption {
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
  isEncryptionAvailable(): boolean;
}
interface DesktopStorageOptions {
  userDataPath: string;
  /** Explicit source is useful for a one-time migration or an isolated fixture. */
  legacyUserDataPath?: string;
  isolated?: boolean;
  workspaceId?: string;
  encryption: DesktopEncryption;
}
export interface DesktopMemento {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Promise<void>;
  keys(): readonly string[];
}
export interface ConfigurationChange {
  affectsConfiguration(section: string): boolean;
}
type Listener<T> = (event: T) => void;
const EXTENSION = 'oskarschiermeister.cortex';
const LEGACY_EXTENSION = 'oskarschiermeister.kortex';
const SECRET_PREFIX = `secret://${JSON.stringify({ extensionId: EXTENSION }).slice(0, -1)},"key":`;
const STORE_ERROR = 'Der lokale Cortex-Speicher konnte nicht sicher geöffnet oder gespeichert werden. Die bisherigen Daten wurden nicht ersetzt.';
const SECRET_ERROR = 'Die gespeicherten Cortex-Zugangsdaten konnten nicht entschlüsselt werden. Die bisherigen Daten wurden nicht ersetzt.';
const MAX_FILE_SIZE = 128 * 1024 * 1024;
const FILES = ['global-state.json', 'workspace-state.json', 'settings.json', 'secrets.json'] as const;

function dictionary(value: unknown): value is State {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function own(record: State, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
function safeKey(key: string): void {
  if (typeof key !== 'string' || !key || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error(STORE_ERROR);
}
function state(value: unknown): State {
  if (!dictionary(value)) throw new Error(STORE_ERROR);
  for (const key of Object.keys(value)) safeKey(key);
  return value;
}
function copy<T>(value: T): T {
  if (value === undefined) return value;
  try { return JSON.parse(JSON.stringify(value)) as T; }
  catch { throw new Error(STORE_ERROR); }
}
function parse(raw: string): unknown {
  try { return JSON.parse(raw); }
  catch { throw new Error(STORE_ERROR); }
}
function fileText(path: string): string {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_SIZE) throw new Error(STORE_ERROR);
  return readFileSync(path, 'utf8');
}
/** Commit before publishing a new in-memory value; a failed write keeps both old states. */
function atomicWrite(path: string, value: unknown): void {
  try {
    const text = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(text) > MAX_FILE_SIZE) throw new Error(STORE_ERROR);
    writeFileAtomic(path, text, { mode: 0o600, fsync: true, syncDir: true, temporary: join(dirname(path), `.${randomUUID()}.tmp`) });
  } catch { throw new Error(STORE_ERROR); }
}

/** Settings.json is JSONC. Strip comments/trailing commas only outside strings. */
export function parseSettings(raw: string): State {
  let clean = '', inString = false, escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]!;
    if (inString) {
      clean += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; clean += char; continue; }
    if (char === '/' && raw[i + 1] === '/') {
      while (i + 1 < raw.length && raw[i + 1] !== '\n') i++;
      clean += ' '; continue;
    }
    if (char === '/' && raw[i + 1] === '*') {
      const end = raw.indexOf('*/', i + 2);
      if (end < 0) throw new Error(STORE_ERROR);
      i = end + 1; clean += ' '; continue;
    }
    clean += char;
  }
  let result = ''; inString = false; escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i]!;
    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; result += char; continue; }
    if (char === ',') {
      let next = i + 1;
      while (/\s/.test(clean[next] ?? '') && next < clean.length) next++;
      if (clean[next] === '}' || clean[next] === ']') continue;
    }
    result += char;
  }
  return state(parse(result));
}

interface SqlRow { key: string; value: string }
function readLegacyRows(database: string, withSecrets: boolean): SqlRow[] {
  if (!existsSync(database)) return [];
  if (!lstatSync(database).isFile() || lstatSync(database).isSymbolicLink()) throw new Error(STORE_ERROR);
  // SQL text is constant; paths are separate argv entries and never shell input.
  const secrets = withSecrets ? ` OR substr(key,1,${SECRET_PREFIX.length})='${SECRET_PREFIX}'` : '';
  const sql = `BEGIN; SELECT key,value FROM ItemTable WHERE key IN ('${EXTENSION}','${LEGACY_EXTENSION}')${secrets}; COMMIT;`;
  const result = spawnSync('/usr/bin/sqlite3', ['-readonly', '-json', database, sql], {
    encoding: 'utf8', timeout: 15_000, maxBuffer: MAX_FILE_SIZE, windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error(STORE_ERROR);
  const rows = parse(result.stdout.trim() || '[]');
  if (!Array.isArray(rows) || rows.some(row => !dictionary(row) || typeof row.key !== 'string' || typeof row.value !== 'string')) throw new Error(STORE_ERROR);
  return rows as SqlRow[];
}
function publicState(rows: SqlRow[]): State {
  const previous = rows.find(row => row.key === LEGACY_EXTENSION);
  const current = rows.find(row => row.key === EXTENSION);
  const older = previous ? state(parse(previous.value)) : {};
  const renamed = Object.fromEntries(Object.entries(older).map(([key, value]) => [key.startsWith('usturlab.') ? `cortex.${key.slice(9)}` : key, value]));
  return state({ ...renamed, ...(current ? state(parse(current.value)) : {}) });
}
function ensureEncryption(encryption: DesktopEncryption): void {
  if (!encryption.isEncryptionAvailable()) throw new Error(SECRET_ERROR);
}
function decrypt(encryption: DesktopEncryption, value: string): string {
  try {
    ensureEncryption(encryption);
    const bytes = Buffer.from(value, 'base64');
    if (!bytes.length || bytes.toString('base64') !== value) throw new Error(SECRET_ERROR);
    return encryption.decryptString(bytes);
  } catch { throw new Error(SECRET_ERROR); }
}
function validateSecrets(value: unknown, encryption: DesktopEncryption): EncryptedSecrets {
  const records = state(value);
  for (const encrypted of Object.values(records)) {
    if (typeof encrypted !== 'string') throw new Error(SECRET_ERROR);
    decrypt(encryption, encrypted);
  }
  return records as EncryptedSecrets;
}
function legacySecrets(rows: SqlRow[], encryption: DesktopEncryption): EncryptedSecrets {
  const secrets: EncryptedSecrets = {};
  for (const row of rows) {
    if (!row.key.startsWith(SECRET_PREFIX)) continue;
    const descriptor = state(parse(row.key.slice('secret://'.length)));
    if (descriptor.extensionId !== EXTENSION || typeof descriptor.key !== 'string') throw new Error(STORE_ERROR);
    safeKey(descriptor.key);
    const packed = state(parse(row.value));
    if (packed.type !== 'Buffer' || !Array.isArray(packed.data) || !packed.data.length || packed.data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error(SECRET_ERROR);
    const encrypted = Buffer.from(packed.data as number[]).toString('base64');
    decrypt(encryption, encrypted);
    secrets[descriptor.key] = encrypted;
  }
  return secrets;
}
function workspaceStates(value: unknown): WorkspaceStates {
  const records = state(value);
  for (const item of Object.values(records)) state(item);
  return records as WorkspaceStates;
}

/**
 * This is the sole legacy reader. All later mutations go to Standalone files.
 * A directory rename commits all four files and the migration marker together.
 */
function initialize(root: string, legacy: string | undefined, encryption: DesktopEncryption): void {
  let global: State = {}, workspaces: WorkspaceStates = {}, settings: State = {}, secrets: EncryptedSecrets = {};
  if (legacy) {
    const rows = readLegacyRows(join(legacy, 'User', 'globalStorage', 'state.vscdb'), true);
    global = publicState(rows);
    secrets = legacySecrets(rows, encryption);
    const settingsPath = join(legacy, 'User', 'settings.json');
    if (existsSync(settingsPath)) settings = parseSettings(fileText(settingsPath));
    const workspaceRoot = join(legacy, 'User', 'workspaceStorage');
    if (existsSync(workspaceRoot)) {
      for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        safeKey(entry.name);
        const values = publicState(readLegacyRows(join(workspaceRoot, entry.name, 'state.vscdb'), false));
        if (Object.keys(values).length) workspaces[entry.name] = values;
      }
    }
  }
  const staging = join(dirname(root), `.Standalone-migration-${randomUUID()}`);
  try {
    mkdirSync(staging, { mode: 0o700 });
    atomicWrite(join(staging, FILES[0]), global);
    atomicWrite(join(staging, FILES[1]), workspaces);
    atomicWrite(join(staging, FILES[2]), settings);
    atomicWrite(join(staging, FILES[3]), secrets);
    atomicWrite(join(staging, 'migration.json'), { version: 1, completedAt: new Date().toISOString(), source: legacy ?? null });
    if (existsSync(root)) throw new Error(STORE_ERROR);
    renameSync(staging, root);
    syncDirectory(dirname(root));
  } catch { throw new Error(STORE_ERROR); }
  finally { rmSync(staging, { recursive: true, force: true }); }
}

export function createDesktopStorage(options: DesktopStorageOptions) {
  const userData = resolve(options.userDataPath);
  const root = join(userData, 'Standalone');
  // An isolated test root never guesses or reads the user's real home directory.
  const isolated = options.isolated ?? !!process.env.CORTEX_DATA_DIR;
  const legacy = options.legacyUserDataPath ? resolve(options.legacyUserDataPath) : isolated ? undefined : userData;
  mkdirSync(userData, { recursive: true, mode: 0o700 });
  if (!existsSync(root)) initialize(root, legacy, options.encryption);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error(STORE_ERROR);
  const marker = state(parse(fileText(join(root, 'migration.json'))));
  if (marker.version !== 1 || (marker.source !== null && typeof marker.source !== 'string')) throw new Error(STORE_ERROR);
  const fileStorageRoot = typeof marker.source === 'string' ? marker.source : userData;
  let global = state(parse(fileText(join(root, FILES[0]))));
  let workspaces = workspaceStates(parse(fileText(join(root, FILES[1]))));
  let config = parseSettings(fileText(join(root, FILES[2])));
  let encrypted = validateSecrets(parse(fileText(join(root, FILES[3]))), options.encryption);
  let disposed = false;
  const secretListeners = new Set<Listener<{ key: string }>>();
  const configListeners = new Set<Listener<ConfigurationChange>>();
  const settingsErrorListeners = new Set<Listener<{ message: string }>>();
  const check = () => { if (disposed) throw new Error(STORE_ERROR); };
  const emit = <T>(listeners: Set<Listener<T>>, event: T) => {
    for (const listener of listeners) { try { listener(event); } catch { /* A UI listener cannot roll back durable state. */ } }
  };
  const subscribe = <T>(listeners: Set<Listener<T>>, listener: Listener<T>) => {
    check(); listeners.add(listener);
    return { dispose: () => { listeners.delete(listener); } };
  };
  const memento = (read: () => State, write: (next: State) => void): DesktopMemento => ({
    get<T>(key: string, defaultValue?: T): T {
      check();
      const value = own(read(), key);
      return value === undefined ? defaultValue as T : copy(value) as T;
    },
    keys: () => { check(); return Object.keys(read()); },
    async update(key: string, value: unknown): Promise<void> {
      check(); safeKey(key);
      const next = { ...read() };
      if (value === undefined) delete next[key]; else next[key] = copy(value);
      write(next);
    },
  });
  const workspaceStateFor = (id: string): DesktopMemento => {
    safeKey(id);
    return memento(() => workspaces[id] ?? {}, next => {
      const updated = { ...workspaces, [id]: next };
      atomicWrite(join(root, FILES[1]), updated); workspaces = updated;
    });
  };
  const changedConfiguration = (keys: string[]): void => {
    if (keys.length) emit(configListeners, {
      affectsConfiguration: section => keys.some(key => section === key || key.startsWith(`${section}.`) || section.startsWith(`${key}.`)),
    });
  };
  const reloadSettings = (): void => {
    check();
    // A text editor may save JSONC or atomically replace the file. A malformed
    // intermediate save never discards the last usable configuration.
    const next = parseSettings(fileText(join(root, FILES[2])));
    const keys = [...new Set([...Object.keys(config), ...Object.keys(next)])]
      .filter(key => JSON.stringify(config[key]) !== JSON.stringify(next[key]));
    config = next;
    changedConfiguration(keys);
  };
  let settingsTimer: NodeJS.Timeout | undefined;
  // Watch the containing directory, not the inode that atomic writes replace.
  const settingsWatcher = watch(root, { persistent: false }, (_event, file) => {
    if (file && file.toString() !== FILES[2]) return;
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      if (disposed) return;
      try { reloadSettings(); }
      catch { emit(settingsErrorListeners, { message: 'Die geänderte Einstellungsdatei ist ungültig oder nicht lesbar. Cortex verwendet weiterhin die zuletzt gültigen Einstellungen.' }); }
    }, 40);
    settingsTimer.unref();
  });
  settingsWatcher.on('error', () => emit(settingsErrorListeners, { message: 'Änderungen an der Einstellungsdatei konnten nicht überwacht werden.' }));
  return {
    root,
    /** Die Einstellungsdatei, die dieser Speicher liest und beobachtet. */
    settingsPath: join(root, FILES[2]),
    // Keep absolute attachment/workspace paths valid and keep automation leases shared.
    globalStoragePath: join(fileStorageRoot, 'User', 'globalStorage', EXTENSION),
    globalState: memento(() => global, next => { atomicWrite(join(root, FILES[0]), next); global = next; }),
    workspaceState: workspaceStateFor(options.workspaceId ?? 'default'),
    workspaceStateFor,
    workspaceIds: () => Object.keys(workspaces),
    secrets: {
      async get(key: string): Promise<string | undefined> {
        check(); const value = own(encrypted, key);
        return value === undefined ? undefined : decrypt(options.encryption, value as string);
      },
      async store(key: string, value: string): Promise<void> {
        check(); safeKey(key);
        let ciphertext: string;
        try {
          ensureEncryption(options.encryption);
          if (typeof value !== 'string') throw new Error(SECRET_ERROR);
          ciphertext = options.encryption.encryptString(value).toString('base64');
          if (decrypt(options.encryption, ciphertext) !== value) throw new Error(SECRET_ERROR);
        } catch { throw new Error(SECRET_ERROR); }
        const next = { ...encrypted, [key]: ciphertext };
        atomicWrite(join(root, FILES[3]), next); encrypted = next;
        emit(secretListeners, { key });
      },
      async delete(key: string): Promise<void> {
        check(); safeKey(key);
        if (own(encrypted, key) === undefined) return;
        const next = { ...encrypted }; delete next[key];
        atomicWrite(join(root, FILES[3]), next); encrypted = next;
        emit(secretListeners, { key });
      },
      onDidChange: (listener: Listener<{ key: string }>) => subscribe(secretListeners, listener),
    },
    settings: {
      read: (): State => { check(); return copy(config); },
      async update(key: string, value: unknown): Promise<void> {
        check(); safeKey(key);
        // Preserve edits committed by Monaco just before this UI interaction.
        reloadSettings();
        const next = { ...config };
        if (value === undefined) delete next[key]; else next[key] = copy(value);
        if (JSON.stringify(next) === JSON.stringify(config)) return;
        atomicWrite(join(root, FILES[2]), next); config = next;
        changedConfiguration([key]);
      },
      reload: reloadSettings,
    },
    reloadSettings,
    onDidChangeConfiguration: (listener: Listener<ConfigurationChange>) => subscribe(configListeners, listener),
    onSettingsError: (listener: Listener<{ message: string }>) => subscribe(settingsErrorListeners, listener),
    async flush(): Promise<void> { check(); /* Writes are committed synchronously before their promises resolve. */ },
    dispose(): void { disposed = true; clearTimeout(settingsTimer); settingsWatcher.close(); secretListeners.clear(); configListeners.clear(); settingsErrorListeners.clear(); },
  };
}
