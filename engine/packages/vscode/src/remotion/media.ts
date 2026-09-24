import { open } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { tryExec } from '../util/exec.js';

/** Was dem Auftrag angehängt war: welche Art, welcher Dateiname, wie lang auf der Timeline. */

/** Bildrate der Vorlage — Timeline und Komposition rechnen beide damit. */
export const FPS = 30;

type MaterialKind = 'video' | 'image' | 'audio';
export interface MaterialItem {
  /** Relativ zu public/, etwa `material/Intro.mp4`. */
  file: string;
  kind: MaterialKind;
  frames: number;
  width?: number;
  height?: number;
}

const KIND: Array<[RegExp, MaterialKind]> = [
  [/\.(mp4|mov|m4v|webm|mkv)$/i, 'video'],
  [/\.(png|jpe?g|webp|gif|svg|avif)$/i, 'image'],
  [/\.(mp3|wav|m4a|aac|ogg|flac)$/i, 'audio'],
];

export function materialKind(path: string): MaterialKind | undefined {
  return KIND.find(([pattern]) => pattern.test(path))?.[1];
}

/** Ein Dateiname, den staticFile() und jede Shell ohne Anführungszeichen verträgt. */
export function safeName(name: string): string {
  const ext = extname(name).toLowerCase();
  const stem = basename(name, extname(name))
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'material';
  return `${stem}${ext}`;
}

/** Länge und Größe aus Spotlight (wie „Informationen“ im Finder); ohne Angabe undefined. */
async function spotlight(path: string): Promise<{ seconds?: number; width?: number; height?: number }> {
  const text = (await tryExec('/usr/bin/mdls', ['-name', 'kMDItemDurationSeconds', '-name', 'kMDItemPixelWidth', '-name', 'kMDItemPixelHeight', path], 5000)) ?? '';
  const value = (key: string) => {
    const match = new RegExp(`${key}\\s*=\\s*([\\d.]+)`).exec(text);
    return match ? Number(match[1]) : undefined;
  };
  return { seconds: value('kMDItemDurationSeconds'), width: value('kMDItemPixelWidth'), height: value('kMDItemPixelHeight') };
}

/**
 * Länge und Bildgröße einer MP4/MOV-Datei direkt aus ihren Kästen: `mvhd`
 * (Zeitskala und Dauer) und das `tkhd` der ersten Spur mit Fläche. Gelesen
 * werden nur Kopfzeilen — auch bei Gigabyte-Dateien, deren `moov` am Ende liegt.
 */
export async function mp4Info(path: string): Promise<{ seconds?: number; width?: number; height?: number }> {
  const file = await open(path, 'r');
  try {
    const size = (await file.stat()).size;
    const read = async (at: number, length: number) => {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await file.read(buffer, 0, length, at);
      return buffer.subarray(0, bytesRead);
    };
    /** Die Kästen zwischen `from` und `to`: Typ, Beginn des Inhalts, Ende. */
    const boxes = async (from: number, to: number) => {
      const found: Array<{ type: string; body: number; end: number }> = [];
      for (let at = from; at + 8 <= to && found.length < 4096;) {
        const head = await read(at, 16);
        if (head.length < 8) break;
        let length = head.readUInt32BE(0);
        let body = at + 8;
        if (length === 1) { length = Number(head.readBigUInt64BE(8)); body = at + 16; }
        else if (length === 0) length = to - at;
        if (length < 8) break;
        found.push({ type: head.toString('latin1', 4, 8), body, end: Math.min(to, at + length) });
        at += length;
      }
      return found;
    };
    const moov = (await boxes(0, size)).find(box => box.type === 'moov');
    if (!moov) return {};
    const inside = await boxes(moov.body, moov.end);
    const info: { seconds?: number; width?: number; height?: number } = {};
    const mvhd = inside.find(box => box.type === 'mvhd');
    if (mvhd) {
      const data = await read(mvhd.body, 32);
      const v1 = data[0] === 1;
      const scale = v1 ? data.readUInt32BE(20) : data.readUInt32BE(12);
      const duration = v1 ? Number(data.readBigUInt64BE(24)) : data.readUInt32BE(16);
      if (scale > 0 && duration > 0) info.seconds = duration / scale;
    }
    for (const trak of inside.filter(box => box.type === 'trak')) {
      const tkhd = (await boxes(trak.body, trak.end)).find(box => box.type === 'tkhd');
      if (!tkhd) continue;
      const data = await read(tkhd.body, tkhd.end - tkhd.body);
      if (data.length < 84) continue;
      const width = data.readUInt32BE(data.length - 8) / 65536;
      const height = data.readUInt32BE(data.length - 4) / 65536;
      if (width > 0 && height > 0) { info.width = Math.round(width); info.height = Math.round(height); break; }
    }
    return info;
  } catch {
    return {};
  } finally {
    await file.close();
  }
}

/** Wie lange ein Stück auf der Timeline steht: Videos und Töne ganz, Bilder fünf Sekunden. */
export async function describeMaterial(source: string, file: string): Promise<MaterialItem | undefined> {
  const kind = materialKind(source);
  if (!kind) return undefined;
  // MP4/MOV aus dem Dateikopf, alles andere über Spotlight; ohne Angabe zehn Sekunden.
  const fromHead = /\.(mp4|mov|m4v|m4a)$/i.test(source) ? await mp4Info(source) : {};
  const meta = kind === 'image' ? {} : fromHead.seconds ? fromHead : { ...(await spotlight(source)), ...fromHead };
  const seconds = kind === 'image' ? 5 : meta.seconds && meta.seconds > 0 ? meta.seconds : 10;
  return { file, kind, frames: Math.max(1, Math.round(seconds * FPS)), ...(meta.width && meta.height ? { width: meta.width, height: meta.height } : {}) };
}
