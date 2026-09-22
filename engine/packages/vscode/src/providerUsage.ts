import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChildEnv, type AccountProfile, type UsageWindow } from '@cortex/core';

type Obj = Record<string, any>;
export function providerUsageWindows(provider: string, data: Obj): UsageWindow[] {
  const windows: UsageWindow[] = [];
  const add = (label: string, used: unknown, reset: unknown) => {
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return;
    const timestamp = typeof reset === 'number' ? reset * 1000 : typeof reset === 'string' ? Date.parse(reset) : NaN;
    windows.push({ label, utilizationPct: used, resetAt: Number.isFinite(timestamp) ? timestamp : undefined });
  };
  if (provider === 'claude') {
    const limits = data.rate_limits;
    if (!data.rate_limits_available || !limits) return [];
    for (const [key, label] of [['five_hour', '5 Stunden'], ['seven_day', 'Woche'], ['seven_day_opus', 'Woche · Opus'], ['seven_day_sonnet', 'Woche · Sonnet'], ['seven_day_oauth_apps', 'Woche · OAuth-Apps']]) {
      const w = limits[key!]; if (w) add(label!, w.utilization, w.resets_at);
    }
    for (const w of limits.model_scoped ?? []) add(`Woche · ${w.display_name}`, w.utilization, w.resets_at);
  } else {
    const buckets = data.rateLimitsByLimitId ? Object.values(data.rateLimitsByLimitId) : [data.rateLimits];
    for (const bucket of buckets as Obj[]) {
      if (!bucket) continue;
      for (const key of ['primary', 'secondary']) {
        const w = bucket[key]; if (!w) continue;
        const minutes = w.windowDurationMins;
        const label = minutes === 300 ? '5 Stunden' : minutes === 10080 ? 'Woche' : typeof minutes === 'number' ? `${minutes / 60} Stunden` : key === 'primary' ? 'Primäres Limit' : 'Sekundäres Limit';
        add(buckets.length > 1 && bucket.limitName ? `${label} · ${bucket.limitName}` : label, w.usedPercent, w.resetsAt);
      }
    }
  }
  return windows;
}

/** Read-only CLI control requests: no user prompt, no model turn, no token export. */
export async function readProviderUsage(account: AccountProfile, cli: string): Promise<UsageWindow[]> {
  const cwd = await mkdtemp(join(tmpdir(), 'cortex-usage-'));
  try {
    return await new Promise(resolve => {
      const claude = account.provider === 'claude';
      const args = claude ? ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--settings', '{"disableAllHooks":true}'] : ['app-server'];
      const child = spawn(cli, args, { cwd, env: buildChildEnv(account, process.env), stdio: ['pipe', 'pipe', 'ignore'] });
      let done = false, buffer = '';
      const finish = (windows: UsageWindow[] = []) => { if (done) return; done = true; clearTimeout(timer); child.stdin.destroy(); child.kill(); const force = setTimeout(() => child.kill('SIGKILL'), 1000); force.unref(); child.once('exit', () => clearTimeout(force)); resolve(windows); };
      const timer = setTimeout(() => finish(), 15000);
      child.on('error', () => finish()); child.on('exit', () => finish()); child.stdin.on('error', () => finish());
      const send = (message: Obj) => { if (!done) child.stdin.write(JSON.stringify(message) + '\n'); };
      child.stdout.on('data', chunk => {
        buffer += chunk.toString(); if (buffer.length > 1024 * 1024) return finish();
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let msg: Obj; try { msg = JSON.parse(line); } catch { continue; }
          if (claude) {
            const response = msg.type === 'control_response' ? msg.response : undefined;
            if (!response) continue;
            if (response.subtype !== 'success') { finish(); continue; }
            if (response.request_id === 'init') send({ type: 'control_request', request_id: 'usage', request: { subtype: 'get_usage' } });
            if (response.request_id === 'usage') finish(providerUsageWindows('claude', response.response ?? {}));
          } else {
            if (msg.id === 1) {
              if (msg.error) { finish(); continue; }
              send({ method: 'initialized', params: {} });
              send({ id: 2, method: 'account/rateLimits/read', params: {} });
            }
            if (msg.id === 2) finish(providerUsageWindows('codex', msg.result ?? {}));
          }
        }
      });
      send(claude ? { type: 'control_request', request_id: 'init', request: { subtype: 'initialize' } } : { id: 1, method: 'initialize', params: { clientInfo: { name: 'cortex-usage', version: '1.0' } } });
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
