import { describe, expect, it } from 'vitest';
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

  it('runs browser plugins headless when desktop browsers are off', () => {
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
    expect(withBrowserPolicy(servers, 'auf-ansage')).toBe(servers);
    expect(isBrowserServer(servers.chrome)).toBe(true);
    expect(isBrowserServer(servers.exokortex)).toBe(false);
    expect(readBrowserAccess(undefined)).toBe('auf-ansage');
  });
});
