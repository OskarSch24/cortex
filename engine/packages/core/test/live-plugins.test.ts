import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { discoverOAuth } from '../src/mcp/oauth.js';
import { probeServer } from '../src/mcp/probe.js';
import { parseCatalog } from '../src/plugins/catalog.js';

/**
 * Gegen die echten Anbieter: antworten die Server ohne Anmeldung wirklich, und
 * bieten die mit Anmeldung das Verfahren an, das Cortex spricht?
 *
 * Nur mit CORTEX_LIVE=1. Registriert nirgends einen Client und meldet sich
 * nirgends an — das bleibt dem ausdrücklichen Klick in Cortex vorbehalten.
 */
const LIVE = process.env.CORTEX_LIVE === '1';
const catalog = parseCatalog(
  readFileSync(new URL('../../vscode/media/plugins/catalog.json', import.meta.url), 'utf8'),
);
const entries = catalog.ok ? catalog.catalog.entries : [];

describe.skipIf(!LIVE)('Plugin-Katalog gegen die echten Server', () => {
  const open = entries.filter((e) => e.definition.url && !e.requires);
  for (const entry of open) {
    it(`${entry.id} nennt ohne Anmeldung seine Werkzeuge`, async () => {
      const result = await probeServer(entry.definition, { timeoutMs: 30_000 });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      if (result.ok) expect(result.tools.length).toBeGreaterThan(0);
    }, 40_000);
  }

  const oauth = entries.filter((e) => e.requires?.kind === 'oauth');
  for (const entry of oauth) {
    it(`${entry.id} verlangt eine Anmeldung, die Cortex selbst durchführen kann`, async () => {
      const result = await probeServer(entry.definition, { timeoutMs: 30_000 });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: false, reason: 'auth' });
      if (result.ok) return;
      const endpoints = await discoverOAuth(entry.definition.url!, result.wwwAuthenticate);
      expect(endpoints.registrationEndpoint, `${entry.id}: keine Selbstregistrierung`).toBeTruthy();
      expect(endpoints.codeChallengeMethods ?? ['S256'], entry.id).toContain('S256');
    }, 60_000);
  }

  const ownRemote = entries.filter((e) => e.requires?.kind === 'oauth-client' && e.definition.url);
  for (const entry of ownRemote) {
    it(`${entry.id} nennt die Endpunkte für einen eigenen Client`, async () => {
      const result = await probeServer(entry.definition, { timeoutMs: 30_000 });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: false, reason: 'auth' });
      if (result.ok) return;
      const endpoints = await discoverOAuth(entry.definition.url!, result.wwwAuthenticate);
      expect(endpoints.authorizationEndpoint, entry.id).toMatch(/^https:\/\//);
      expect(endpoints.tokenEndpoint, entry.id).toMatch(/^https:\/\//);
    }, 60_000);
  }
});
