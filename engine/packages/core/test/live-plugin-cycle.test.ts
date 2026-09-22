import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseMcpFile, syncMcpToProfile, type McpServerDef } from '../src/mcp/mcpSync.js';
import { probeServer } from '../src/mcp/probe.js';
import { parseCatalog } from '../src/plugins/catalog.js';
import { withServer, withoutServer } from '../src/plugins/installed.js';
import type { AccountProfile } from '../src/types.js';

/**
 * Schlüssellose Plugins zweimal verbinden und wieder entbinden — mit genau den
 * Funktionen, die Cortex beim Installieren und Entfernen benutzt: Probe,
 * `withServer`, Spiegeln in die Profile von Claude, Codex und Grok,
 * `withoutServer`, wieder spiegeln.
 *
 * Gearbeitet wird auf einer Kopie der echten ~/.cortex/mcp.json in einem
 * Temp-Ordner; echte Profile werden nicht angefasst. Nur mit CORTEX_LIVE=1,
 * weil npx die Server beim ersten Mal lädt.
 */
const LIVE = process.env.CORTEX_LIVE === '1';
const catalog = parseCatalog(readFileSync(new URL('../../vscode/media/plugins/catalog.json', import.meta.url), 'utf8'));
const entries = catalog.ok ? catalog.catalog.entries.filter((e) => !e.requires && e.definition.command) : [];
const real = join(homedir(), '.cortex', 'mcp.json');
const root = mkdtempSync(join(tmpdir(), 'cortex-cycle-'));
const accounts: AccountProfile[] = (['claude', 'codex', 'grok'] as const).map((provider, i) => ({
  id: provider, provider, label: 'test', authMode: 'managed-home', homeDir: join(root, provider), hasSecret: false, priority: i,
}));
const report: Record<string, unknown> = {};

function mirrored(account: AccountProfile): string {
  const file = account.provider === 'claude' ? '.claude.json' : account.provider === 'codex' ? 'config.toml' : join('.grok', 'config.toml');
  const path = join(account.homeDir!, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}
function has(account: AccountProfile, name: string): boolean {
  const text = mirrored(account);
  return account.provider === 'claude' ? name in ((JSON.parse(text || '{}').mcpServers ?? {}) as object) : text.includes(`[mcp_servers.${name}]`) || text.includes(`[mcp_servers."${name}"]`);
}
function sync(content: string): Record<string, string | undefined> {
  const parsed = parseMcpFile(content);
  if (!parsed.ok) throw new Error(parsed.error);
  return Object.fromEntries(accounts.map((a) => [a.provider, syncMcpToProfile(a, parsed.servers)]));
}

describe.skipIf(!LIVE)('Schlüssellose Plugins: verbinden, entbinden, verbinden, entbinden', () => {
  const baseline = existsSync(real) ? readFileSync(real, 'utf8') : '{"servers":{}}';
  let content = baseline;
  it('startet mit dem heutigen Stand in allen drei Profilen', () => {
    expect(sync(content)).toEqual({ claude: undefined, codex: undefined, grok: undefined });
  });
  for (const entry of entries) {
    it(`${entry.id}: zwei Runden`, async () => {
      const rounds: unknown[] = [];
      for (let round = 1; round <= 2; round++) {
        const probe = await probeServer(entry.definition as McpServerDef, { timeoutMs: 180_000 });
        const before = accounts.map((a) => mirrored(a));
        // Schon verbundene Plugins (etwa Chrome DevTools) erst entbinden, dann wieder verbinden —
        // am Ende soll derselbe Stand stehen wie vorher.
        const already = entry.server in ((JSON.parse(content).servers ?? {}) as object);
        let connectErrors: Record<string, string | undefined>, disconnectErrors: Record<string, string | undefined>, connected: boolean[], gone: boolean[];
        if (already) {
          content = withoutServer(content, entry.server); disconnectErrors = sync(content); gone = accounts.map((a) => !has(a, entry.server));
          content = withServer(content, entry.server, entry.definition as McpServerDef); connectErrors = sync(content); connected = accounts.map((a) => has(a, entry.server));
        } else {
          content = withServer(content, entry.server, entry.definition as McpServerDef); connectErrors = sync(content); connected = accounts.map((a) => has(a, entry.server));
          content = withoutServer(content, entry.server); disconnectErrors = sync(content); gone = accounts.map((a) => !has(a, entry.server));
        }
        const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean).sort().join('\n');
        const canon = (a: AccountProfile, t: string) => (a.provider === 'claude' && t ? JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(t).mcpServers ?? {}).sort())) : lines(t));
        const restored = accounts.map((a, i) => canon(a, mirrored(a)) === canon(a, before[i]!));
        const byteEqual = accounts.map((a, i) => mirrored(a) === before[i]);
        rounds.push({ round, already, byteEqual, probe: probe.ok ? { ok: true, tools: probe.tools.length, ms: probe.ms } : { ok: false, reason: probe.reason, message: probe.message }, connectErrors, connected, disconnectErrors, gone, restored });
        report[entry.id] = rounds;
        expect(probe.ok, `${entry.id} Runde ${round}: Probe`).toBe(true);
        expect(connected, `${entry.id} Runde ${round}: in allen Profilen eingetragen`).toEqual([true, true, true]);
        expect(gone, `${entry.id} Runde ${round}: aus allen Profilen entfernt`).toEqual([true, true, true]);
        expect(restored, `${entry.id} Runde ${round}: Profile wie vorher`).toEqual([true, true, true]);
      }
    }, 900_000);
  }
  it('lässt mcp.json nach allen Runden Byte für Byte wie vorher', () => {
    const sorted = (text: string) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(text).servers ?? {}).sort()));
    report.mcpJsonByteGleich = content === baseline;
    report.mcpJsonInhaltGleich = sorted(content) === sorted(baseline);
    expect(report.mcpJsonInhaltGleich).toBe(true);
  });
  afterAll(() => {
    writeFileSync(new URL('../../../../tests/plugins/cycle-results.json', import.meta.url), JSON.stringify(report, null, 1));
  });
});
