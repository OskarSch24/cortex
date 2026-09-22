import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getObject, getString } from './ndjson.js';
import type { AdapterEvent } from '../types.js';

type ImageEvent = Extract<AdapterEvent, { type: 'image' }>;

/**
 * Codex meldet ein Bild seines eingebauten `image_gen` als Thread-Eintrag
 * `imageGeneration`: `savedPath` zeigt auf die Datei unter
 * `$CODEX_HOME/generated_images`, `result` trägt das Bild als Base64.
 *
 * Fehlt der Pfad, schreibt Cortex das Base64 selbst an dieselbe Stelle — ein
 * Bild, das nur im Protokoll stand, wäre nach dem Auftrag verloren.
 */
export function codexImageEvent(
  item: Record<string, unknown> | undefined,
  codexHome: string | undefined,
  threadId: string | undefined,
): ImageEvent | undefined {
  if (getString(item, 'type') !== 'imageGeneration') return undefined;
  if (item?.failure) return undefined;
  const prompt = getString(item, 'revisedPrompt') ?? undefined;
  const saved = getString(item, 'savedPath');
  if (saved && isAbsolute(saved) && existsSync(saved)) return { type: 'image', path: saved, prompt };

  const result = getString(item, 'result');
  if (!result || !codexHome) return undefined;
  const base64 = result.replace(/^data:image\/[a-z]+;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64.slice(0, 200))) return undefined;
  const dir = join(codexHome, 'generated_images', threadId ?? 'cortex');
  const id = getString(item, 'id') ?? randomUUID();
  const safeId = id.length <= 120 && /^[\w-]+$/.test(id) ? id : `${id.replace(/[^\w-]/g, '_').slice(0, 80)}-${createHash('sha256').update(id).digest('hex').slice(0, 16)}`;
  const path = join(dir, `${safeId}.png`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, Buffer.from(base64, 'base64'));
  } catch {
    return undefined;
  }
  return { type: 'image', path, prompt };
}

/**
 * Grok meldet `image_gen` und `image_edit` über ACP als abgeschlossenes
 * `tool_call_update`; `rawOutput` nennt den Pfad im Sitzungsordner
 * (`…/sessions/<cwd>/<id>/images/1.jpg`). Ältere Clients schreiben ihn nur in
 * den Text des Inhalts, als JSON — beides wird gelesen.
 */
export function acpImageEvent(
  update: Record<string, unknown> | undefined,
  prompts: Map<string, string>,
): ImageEvent | undefined {
  if (getString(update, 'status') !== 'completed') return undefined;
  const callId = getString(update, 'toolCallId');
  const raw = getObject(update, 'rawOutput');
  const rawType = getString(raw, 'type');
  let path = rawType === 'ImageGen' || rawType === 'ImageEdit' ? getString(raw, 'path') : undefined;
  const toolName = getString(update, '_meta', 'x.ai/tool', 'name');
  if (!path && (toolName === 'image_gen' || toolName === 'image_edit' || (callId && prompts.has(callId)))) {
    const body = getString(update, 'content', '0', 'content', 'text');
    try {
      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : undefined;
      if (typeof parsed?.path === 'string') path = parsed.path;
    } catch {
      /* kein JSON — dann war es kein Bild */
    }
  }
  if (!path || !isAbsolute(path) || !/\.(png|jpe?g|webp|gif)$/i.test(path)) return undefined;
  return {
    type: 'image',
    path,
    prompt: (callId && prompts.get(callId)) || undefined,
    edited: rawType === 'ImageEdit' || toolName === 'image_edit' || undefined,
  };
}
