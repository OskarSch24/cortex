import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';
import type { TemplateDto } from './protocol.js';
import { isInside } from '../util/paths.js';

export interface TemplateEntry {
  item: TemplateDto;
  /** Text file, or the complete directory for an Office template. */
  source: string;
  package?: true;
}

interface TemplateManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  kind: 'document' | 'presentation' | 'spreadsheet';
  reference: string;
  preview?: string;
  usage: string;
}

const kindNames = { document: 'dokument', presentation: 'praesentation', spreadsheet: 'tabelle' } as const;
const descriptions = { document: 'ein neues Dokument', presentation: 'eine neue Präsentation', spreadsheet: 'eine neue Tabelle' } as const;
const extensions = { document: '.docx', presentation: '.pptx', spreadsheet: '.xlsx' } as const;

/** Manifest paths may never escape their package, including through symlinks. */
function packageFile(root: string, path: unknown): string | undefined {
  if (typeof path !== 'string' || !path || isAbsolute(path)) return undefined;
  const file = resolve(root, path);
  try {
    if (!isInside(resolve(root), file) || !isInside(realpathSync(root), realpathSync(file))) return undefined;
    return file;
  } catch { return undefined; }
}

function readPackage(root: string, own: boolean, previewUri: (path: string) => string): TemplateEntry | undefined {
  try {
    const manifest = JSON.parse(readFileSync(join(root, 'template.json'), 'utf8')) as TemplateManifest;
    if (manifest.schemaVersion !== 1 || !manifest.name || !manifest.id || !(manifest.kind in kindNames)) return undefined;
    const artifactPath = packageFile(root, manifest.reference);
    const instructionPath = packageFile(root, manifest.usage);
    const preview = packageFile(root, manifest.preview);
    if (!artifactPath || !instructionPath || extname(artifactPath).toLowerCase() !== extensions[manifest.kind]) return undefined;
    const prompt = `Erstelle ${descriptions[manifest.kind]} mit der Vorlage „${manifest.name}“. Frage mich zuerst, worum es darin gehen soll.`;
    return {
      source: root,
      package: true,
      item: {
        id: `${own ? 'own' : 'builtin'}:${manifest.id}`,
        name: manifest.name,
        kind: kindNames[manifest.kind],
        own,
        prompt,
        body: `${prompt}\n\nVerwende die echte, editierbare Vorlagendatei:\n${artifactPath}\n\nLies zuerst die zugehörige Anleitung:\n${instructionPath}\n\nBearbeite eine Kopie der Vorlage und erhalte ihr Layout. Lass die Originaldatei unverändert.`,
        artifactPath,
        instructionPath,
        previewUrl: preview ? previewUri(preview) : undefined,
        aspectRatio: manifest.kind === 'document' ? 'portrait' : 'landscape',
      },
    };
  } catch { return undefined; }
}

function readText(path: string, own: boolean): TemplateEntry | undefined {
  if (!/\.(md|csv|txt)$/i.test(path)) return undefined;
  try {
    const raw = readFileSync(path, 'utf8');
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    const meta = Object.fromEntries((front?.[1] ?? '').split('\n').map(line => {
      const at = line.indexOf(':');
      return at === -1 ? ['', ''] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }));
    return {
      source: path,
      item: {
        id: `${own ? 'own' : 'builtin'}:${basename(path)}`,
        name: meta.name || basename(path, extname(path)),
        kind: meta.kind || (extname(path).toLowerCase() === '.csv' ? 'tabelle' : 'dokument'),
        body: front ? raw.slice(front[0].length) : raw,
        own,
      },
    };
  } catch { return undefined; }
}

/** Load real bundled Office assets, followed by the user's editable templates. */
export function readTemplateEntries(bundledDir: string, ownDir: string, previewUri: (path: string) => string): TemplateEntry[] {
  const entries: TemplateEntry[] = [];
  try {
    const catalog = JSON.parse(readFileSync(join(bundledDir, 'catalog.json'), 'utf8')) as { schemaVersion: number; templates: Array<{ directory: string }> };
    if (catalog.schemaVersion === 1 && Array.isArray(catalog.templates)) {
      for (const spec of catalog.templates) {
        const root = packageFile(bundledDir, spec.directory);
        const entry = root ? readPackage(root, false, previewUri) : undefined;
        if (entry) entries.push(entry);
      }
    }
  } catch { /* Older installations still support their text templates. */ }
  const roots = entries.length ? [{ dir: ownDir, own: true }] : [{ dir: bundledDir, own: false }, { dir: ownDir, own: true }];
  for (const { dir, own } of roots) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (file.name === 'ORIGIN.md') continue;
      const path = join(dir, file.name);
      const entry = file.isDirectory() ? readPackage(path, own, previewUri) : readText(path, own);
      if (!entry) continue;
      // User overrides are unambiguous and have their own stable ID.
      const previous = entries.findIndex(old => old.item.name === entry.item.name);
      if (previous >= 0 && own) entries.splice(previous, 1, entry);
      else entries.push(entry);
    }
  }
  return entries;
}

function safeName(name: string): string {
  const clean = name.replace(/[\x00-\x1f/\\:]/g, '-').trim();
  if (!clean || /^\.+$/.test(clean)) throw new Error('Bitte einen gültigen Vorlagennamen eingeben.');
  return clean;
}

function writeName(entry: TemplateEntry, name: string): void {
  if (entry.package) {
    const path = join(entry.source, 'template.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as TemplateManifest;
    manifest.name = name;
    manifest.id = basename(entry.source);
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    const raw = readFileSync(entry.source, 'utf8');
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
    const metadata = front ? (front[1] ?? '').replace(/^name:.*\r?\n?/m, '') : '';
    writeFileSync(entry.source, `---\nname: ${name}\n${metadata ? `${metadata.trim()}\n` : ''}---\n${front ? raw.slice(front[0].length) : raw}`);
  }
}

/** Each copy has its own Office file, guide, preview and manifest. */
export function duplicateTemplate(entry: TemplateEntry, ownDir: string): string {
  mkdirSync(ownDir, { recursive: true });
  let name = `${entry.item.name} – Kopie`;
  let suffix = 2;
  const extension = entry.package ? '' : extname(entry.source);
  let target = join(ownDir, safeName(name) + extension);
  while (existsSync(target)) {
    name = `${entry.item.name} – Kopie ${suffix++}`;
    target = join(ownDir, safeName(name) + extension);
  }
  cpSync(entry.source, target, { recursive: !!entry.package, errorOnExist: true, force: false });
  writeName({ ...entry, source: target }, name);
  return target;
}

export function renameTemplate(entry: TemplateEntry, name: string): string {
  if (!entry.item.own) throw new Error('Mitgelieferte Vorlagen zuerst duplizieren.');
  const clean = safeName(name);
  const target = join(dirname(entry.source), clean + (entry.package ? '' : extname(entry.source)));
  if (target !== entry.source && existsSync(target)) throw new Error('Eine Vorlage mit diesem Namen existiert bereits.');
  if (target !== entry.source) renameSync(entry.source, target);
  writeName({ ...entry, source: target }, clean);
  return target;
}
