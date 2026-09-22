import { describe, expect, it } from 'vitest';
import { GrokAdapter } from '../src/adapters/grok.js';
import type { ResolvedAccount } from '../src/types.js';

const account: ResolvedAccount = {
  id: 'g1',
  provider: 'grok',
  label: 'grok',
  authMode: 'managed-home',
  hasSecret: false,
  priority: 1,
  homeDir: '/tmp/grok-profile',
};

describe('Grok: Konnektoren des Grok-Kontos', () => {
  it('schaltet Groks Gateway für Figma, Notion & Co. ein', () => {
    const env = new GrokAdapter().buildEnv(account, { PATH: '/usr/bin' });
    expect(env.GROK_MANAGED_MCPS_ENABLED).toBe('1');
    expect(env.GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED).toBe('1');
    expect(env.GROK_HOME).toBe('/tmp/grok-profile/.grok');
  });

  it('lässt einen ausdrücklich gesetzten Wert stehen', () => {
    const env = new GrokAdapter().buildEnv(account, { PATH: '/usr/bin', GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED: '0' });
    expect(env.GROK_MANAGED_MCP_GATEWAY_TOOLS_ENABLED).toBe('0');
  });
});
