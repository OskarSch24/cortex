/**
 * Die Felder des Bildmodus — ohne Node-Importe, damit Webview und Host
 * dieselben Werte und dieselbe Prüfung teilen. Den Auftrag baut `images.ts`.
 */
export interface ImageOptions {
  /** `1:1`, `3:2`, `16:9` … — genau die Werte, die Grok als `aspect_ratio` kennt. */
  ratio: string;
  /** 1 bis 4. Beide Werkzeuge erzeugen ein Bild je Aufruf. */
  count: number;
  /** Bearbeitung am unveränderten Referenzbild, Koordinaten relativ zum Bild. */
  edit?: { kind: 'background' | 'remove' | 'comment'; region?: ImageRegion };
}

export interface ImageRegion { x: number; y: number; width: number; height: number }

function sanitizeImageRegion(raw: unknown): ImageRegion | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (!['x', 'y', 'width', 'height'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]))) return undefined;
  const x = Math.min(1, Math.max(0, r.x as number));
  const y = Math.min(1, Math.max(0, r.y as number));
  const width = Math.min(1 - x, Math.max(0, r.width as number));
  const height = Math.min(1 - y, Math.max(0, r.height as number));
  return width > 0 && height > 0 ? { x, y, width, height } : undefined;
}

export const IMAGE_RATIOS = ['1:1', '3:2', '2:3', '16:9', '9:16', '4:3', '3:4', '21:9'] as const;

/** Nur Anbieter mit eingebautem Bildwerkzeug. */
const IMAGE_PROVIDERS = ['codex', 'grok'] as const;
export type ImageProvider = (typeof IMAGE_PROVIDERS)[number];

export function isImageProvider(provider: string | undefined): provider is ImageProvider {
  return provider === 'codex' || provider === 'grok';
}

/** Was aus der Webview kommt, auf gültige Werte gebracht — nie blind übernommen. */
export function sanitizeImageOptions(raw: unknown): ImageOptions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const ratio = (IMAGE_RATIOS as readonly string[]).includes(o.ratio as string) ? (o.ratio as string) : '1:1';
  const count = Math.min(4, Math.max(1, Math.round(Number(o.count) || 1)));
  const edit = o.edit as Record<string, unknown> | undefined;
  if (edit && ['background', 'remove', 'comment'].includes(edit.kind as string)) {
    const region = sanitizeImageRegion(edit.region);
    // Entfernen ohne gültige Auswahl darf nie das ganze Bild verändern.
    if (edit.kind === 'remove' && !region) return undefined;
    return { ratio, count, edit: { kind: edit.kind as NonNullable<ImageOptions['edit']>['kind'], ...(region ? { region } : {}) } };
  }
  return { ratio, count };
}
