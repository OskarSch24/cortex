import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AccountProfile } from '@cortex/core';
import { mirrorToProfiles } from '../../src/plugins/profileServers.js';
import { mcpPaths } from '../../src/plugins/scopes.js';
import { missingRequired } from '../../../core/src/plugins/installed.js';
import { isBrowserServer, readBrowserAccess, withBrowserPolicy } from '../../src/plugins/browserPolicy.js';

describe('plugins in provider profiles', () => {
  const youtube = { command: 'npx', args: ['-y', 'youtube-data-mcp-server'], env: { YOUTUBE_API_KEY: '' } };
  const fields = [{ env: 'YOUTUBE_API_KEY', label: 'API-Schlüssel', secret: true }];

  it('keeps a server without its required key out of the profiles (YouTube, 13.09.2026)', () => {
    expect(missingRequired(youtube, fields)).toEqual(['YOUTUBE_API_KEY']);
    expect(missingRequired({ ...youtube, env: { YOUTUBE_API_KEY: 'abc' } }, fields)).toEqual([]);
    expect(missingRequired(youtube, [{ ...fields[0]!, optional: true }])).toEqual([]);
    expect(missingRequired({ url: 'https://example.com/mcp' }, fields)).toEqual([]);
  });

  it('runs browser plugins headless unless desktop browsers are always allowed', () => {
    const servers = {
      chrome: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
      playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      exokortex: { command: '/usr/bin/python3', args: ['lesen.py'] },
    };
    const off = withBrowserPolicy(servers, 'nie');
    expect(off.chrome!.args).toEqual(['-y', 'chrome-devtools-mcp@latest', '--headless']);
    expect(off.playwright!.args).toEqual(['-y', '@playwright/mcp@latest', '--headless']);
    expect(off.exokortex).toBe(servers.exokortex);
    expect(withBrowserPolicy(off, 'nie').chrome!.args!.filter((a) => a === '--headless')).toHaveLength(1);
    expect(withBrowserPolicy(servers, 'immer')).toBe(servers);
    // Seit 24.09.2026: auch auf Ansage ohne Fenster, und nie ans laufende Chrome angedockt.
    expect(withBrowserPolicy(servers, 'auf-ansage').playwright!.args).toEqual(['-y', '@playwright/mcp@latest', '--headless']);
    const attached = { chrome: { command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest', '--autoConnect'] } };
    expect(withBrowserPolicy(attached, 'auf-ansage').chrome!.args).toEqual(['-y', 'chrome-devtools-mcp@latest', '--headless']);
    expect(withBrowserPolicy(attached, 'immer')).toBe(attached);
    expect(isBrowserServer(servers.chrome)).toBe(true);
    expect(isBrowserServer(servers.exokortex)).toBe(false);
    expect(readBrowserAccess(undefined)).toBe('auf-ansage');
  });
});

describe('Spiegeln in die Profile', () => {
  it('schreibt jedes Konto der Reihe nach und meldet Fehler je Konto', () => {
    const home = mkdtempSync(join(tmpdir(), 'cortex-mirror-'));
    try {
      const base = { hasSecret: false, priority: 0 } as const;
      const accounts: AccountProfile[] = [
        { ...base, id: 'a', provider: 'claude', label: 'ohne Ordner', authMode: 'managed-home' },
        { ...base, id: 'b', provider: 'claude', label: 'mit Ordner', authMode: 'managed-home', homeDir: home },
      ];
      const results = mirrorToProfiles(accounts, { demo: { command: 'demo' } });
      expect(results.map((r) => [r.account.id, r.error])).toEqual([['a', 'no profile directory'], ['b', undefined]]);
      expect(existsSync(join(home, '.claude.json'))).toBe(true);
    } finally { rmSync(home, { recursive: true, force: true }); }
  });

  it('kennt beide mcp.json-Orte, das Projekt zuerst', () => {
    const before = process.env.HOME;
    process.env.HOME = '/tmp/cortex-home-probe';
    try {
      expect(mcpPaths('/projekt')).toEqual([
        { id: 'projekt', path: '/projekt/.cortex/mcp.json' },
        { id: 'persoenlich', path: '/tmp/cortex-home-probe/.cortex/mcp.json' },
      ]);
      expect(mcpPaths()).toEqual([{ id: 'persoenlich', path: '/tmp/cortex-home-probe/.cortex/mcp.json' }]);
    } finally { process.env.HOME = before; }
  });
});
