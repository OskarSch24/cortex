import { expect, it, vi } from 'vitest';
import { refreshUsage } from '../../src/usage.js';
import { readProviderUsage } from '../../src/providerUsage.js';
vi.mock('../../src/providerUsage.js', () => ({ readProviderUsage: vi.fn(async () => []) }));
it('passive refresh never contacts a provider, and explicit refresh is cached', async () => {
  const account = { id: 'polling-regression', provider: 'claude', label: 'test', homeDir: '/unused', authMode: 'managed-home', disabled: false };
  const accounts = { all: () => [account] } as any, quota = { setUsage: vi.fn() } as any;
  await refreshUsage(accounts, quota); await refreshUsage(accounts, quota);
  expect(readProviderUsage).not.toHaveBeenCalled();
  const live = { cliPath: () => 'unused' };
  await refreshUsage(accounts, quota, undefined, live); await refreshUsage(accounts, quota, undefined, live);
  expect(readProviderUsage).toHaveBeenCalledTimes(1);
});
