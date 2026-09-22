/**
 * Bild-Anhänge, die als Bild an das Modell gehen — nicht bloß als Pfad im
 * Text. Ein Pfad hilft nur, wenn das Modell die Datei selbst öffnen darf und
 * sie dann noch existiert; ein Bildschirmfoto aus macOS' Vorschau liegt
 * anfangs in einem Zwischenordner, der kurz darauf verschwindet, und außerhalb
 * des Projekts verweigert ein vorsichtiger Modus das Lesen ganz.
 *
 * Der Host kopiert und verkleinert die Bilder vorher (vscode/src/panel/
 * imageAttachments.ts); hier werden sie nur noch gelesen.
 */
import { readFileSync, statSync } from 'node:fs';

export interface ImageInput {
  /** Absoluter Pfad der (vom Host abgelegten) Bilddatei. */
  path: string;
  mediaType: string;
}

const TYPES: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
};

/** Formate, die alle Anbieter als Bild annehmen. */
export function imageMediaType(path: string): string | undefined {
  return TYPES[path.split('.').pop()?.toLowerCase() ?? ''];
}

/** Anthropic nimmt Bilder bis 5 MB (Base64 zählt mit); darüber lieber nur den Pfad. */
const MAX_BYTES = 3_700_000;

/** Base64 eines Bildes, oder nichts, wenn es fehlt oder zu groß ist. */
export function readImageBase64(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_BYTES) return undefined;
    return readFileSync(path).toString('base64');
  } catch {
    return undefined;
  }
}

/** Claude (stream-json): Text und Bilder als Inhaltsblöcke einer Nachricht. */
export function claudeContent(text: string, images: ImageInput[] | undefined): string | unknown[] {
  const blocks = (images ?? []).flatMap(img => {
    const data = readImageBase64(img.path);
    return data ? [{ type: 'image', source: { type: 'base64', media_type: img.mediaType, data } }] : [];
  });
  return blocks.length ? [...blocks, { type: 'text', text }] : text;
}
