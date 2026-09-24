import { describe, expect, it } from 'vitest';
import { pluginOverview } from '../../webview/components/pluginOverview.js';
import { CATALOG } from '../../webview/components/pluginCatalog.js';

/**
 * Welcher Zugang für eine Karte mit mehreren Zugängen spricht. Beobachtet am
 * 22. September 2026: YouTube stand auf „Schlüssel eintragen“ für den nie
 * genutzten API-Schlüssel, während die abgelaufene Google-Anmeldung nur
 * „Neu anmelden“ gebraucht hätte.
 */
const youtube = CATALOG.find((e) => e.id === 'youtube')!;
const kanal = CATALOG.find((e) => e.id === 'youtube-kanal')!;

const host = (credentials: Record<string, unknown>) =>
  ({
    scopes: [
      {
        id: 'persoenlich',
        exists: true,
        servers: { youtube: youtube.definition, 'youtube-kanal': kanal.definition },
      },
    ],
    credentials,
    connections: {},
  }) as never;

describe('Plugin-Übersicht · Zugang einer Karte', () => {
  it('zeigt den Zugang, für den schon etwas hinterlegt ist', () => {
    const overview = pluginOverview(
      host({
        'youtube-kanal': {
          fields: [],
          client: { clientId: 'x', hasSecret: true },
          oauth: { connectedAt: 1, refreshable: true, expired: true },
        },
      }),
    );
    const lead = overview.leadOf(youtube);
    expect(lead.id).toBe('youtube-kanal');
    expect(overview.statusOf(lead)).toMatchObject({ kind: 'einrichtung', label: 'Neu anmelden' });
  });

  it('bleibt ohne Hinterlegtes beim ersten Zugang', () => {
    expect(pluginOverview(host({})).leadOf(kanal).id).toBe('youtube');
  });
});
