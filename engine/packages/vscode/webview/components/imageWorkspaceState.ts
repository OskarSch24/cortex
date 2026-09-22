import type { GeneratedImage, TranscriptItem } from '../../src/panel/transcript.js';
import type { ImageOptions, ImageRegion } from '../../src/panel/imageOptions.js';

export interface WorkspaceImage extends GeneratedImage {
  options?: ImageOptions;
  provider?: string;
  at?: number;
}

/** Ein Verlauf über alle Antworten, nicht nur Varianten einer einzelnen Karte. */
export function conversationImages(items: TranscriptItem[]): WorkspaceImage[] {
  const images = new Map<string, WorkspaceImage>();
  for (const item of items) {
    if (item.kind !== 'assistant') continue;
    for (const image of item.images ?? []) images.set(image.path, { ...image, options: item.imageOptions, provider: item.target?.provider, at: item.at });
  }
  return [...images.values()];
}

export function selectionRegion(start: { x: number; y: number }, end: { x: number; y: number }): ImageRegion {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const x = Math.min(clamp(start.x), clamp(end.x));
  const y = Math.min(clamp(start.y), clamp(end.y));
  return { x, y, width: Math.abs(clamp(end.x) - clamp(start.x)), height: Math.abs(clamp(end.y) - clamp(start.y)) };
}
