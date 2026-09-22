import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { CliSight } from '@cortex/core';

/**
 * Was die CLIs selbst über einen Server sagen — gefragt in genau dem Profil,
 * mit dem Cortex sie startet.
 *
 * Cortex' eigene Prüfung zeigt, dass ein Server antwortet. Ob ein Agent ihn
 * benutzen kann, entscheidet aber die CLI: ob der Eintrag in ihrem Profil
 * ankam, ob sie ihn startet, ob sie seine Werkzeuge sieht. Genau das fragt
 * dieser Beleg ab:
 *
 *   claude  `claude mcp get <name>`          startet ihn und meldet „Connected“
 *   grok    `grok mcp doctor <name> --json`  startet ihn und zählt die Werkzeuge
 *   codex   `codex mcp list --json`          prüft nicht selbst — nur „eingetragen“
 */

export interface CliTarget {
  provider: string;
  label: string;
  account?: string;
  command: string;
  env: NodeJS.ProcessEnv;
}

export type Runner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export const runCommand: Runner = (command, args, env, timeoutMs) =>
  new Promise((resolve) => {
    // Nicht im Projektordner: eine .mcp.json dort würde das Ergebnis verfälschen.
    const child = spawn(command, args, { env, cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout = (stdout + d.toString()).slice(-200_000)));
    child.stderr.on('data', (d: Buffer) => (stderr = (stderr + d.toString()).slice(-20_000)));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: error.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });

const clean = (text: string) => text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

export function readClaude(output: string): Pick<CliSight, 'state' | 'detail'> {
  const text = clean(output);
  if (/No MCP server found/i.test(text)) return { state: 'fehlt', detail: 'Nicht im Profil.' };
  const status = /Status:\s*(.+)/.exec(text)?.[1]?.trim();
  if (!status) return { state: 'fehler', detail: text.trim().split('\n').slice(-2).join(' ') || 'Keine Auskunft.' };
  if (/connected/i.test(status) && !/not|fail/i.test(status)) return { state: 'verbunden', detail: 'Claude Code hat ihn gestartet.' };
  return { state: 'fehler', detail: status.replace(/^[✘✗×⏸!]\s*/, '') };
}

export function readGrok(output: string, server: string): Pick<CliSight, 'state' | 'detail'> {
  try {
    const doc = JSON.parse(output) as { servers?: Array<{ name: string; healthy?: boolean; checks?: Array<{ label: string; passed: boolean; detail?: string }> }> };
    const found = doc.servers?.find((s) => s.name === server);
    if (!found) return { state: 'fehlt', detail: 'Nicht im Profil.' };
    if (found.healthy) {
      const tools = found.checks?.find((c) => /tools? discovered/i.test(c.label))?.label;
      return { state: 'verbunden', detail: tools ? `Grok: ${tools.replace('tools discovered', 'Werkzeuge gefunden')}.` : 'Grok hat ihn gestartet.' };
    }
    const failed = found.checks?.find((c) => !c.passed);
    return { state: 'fehler', detail: failed ? `${failed.label}${failed.detail ? `: ${failed.detail}` : ''}` : 'Grok meldet ihn als nicht gesund.' };
  } catch {
    return { state: 'fehler', detail: 'Grok hat keine lesbare Antwort gegeben.' };
  }
}

export function readCodex(output: string, server: string): Pick<CliSight, 'state' | 'detail'> {
  try {
    const list = JSON.parse(output) as Array<{ name: string; enabled?: boolean; disabled_reason?: string | null; auth_status?: string }>;
    const found = list.find((s) => s.name === server);
    if (!found) return { state: 'fehlt', detail: 'Nicht im Profil.' };
    if (found.enabled === false) return { state: 'fehler', detail: `In Codex ausgeschaltet${found.disabled_reason ? `: ${found.disabled_reason}` : ''}.` };
    if (found.auth_status === 'not_logged_in') return { state: 'fehler', detail: 'Codex verlangt eine eigene Anmeldung.' };
    if (found.auth_status && found.auth_status !== 'unsupported') return { state: 'eingetragen', detail: 'In Codex angemeldet; Codex prüft Server erst beim Start eines Zugs.' };
    return { state: 'eingetragen', detail: 'Codex kennt ihn; es prüft Server erst beim Start eines Zugs.' };
  } catch {
    return { state: 'fehler', detail: 'Codex hat keine lesbare Antwort gegeben.' };
  }
}

export async function sightInClis(server: string, targets: CliTarget[], run: Runner = runCommand): Promise<CliSight[]> {
  return Promise.all(
    targets.map(async (target): Promise<CliSight> => {
      const base = { provider: target.provider, label: target.label, account: target.account };
      if (target.provider === 'claude') {
        const r = await run(target.command, ['mcp', 'get', server], target.env, 90_000);
        return { ...base, ...readClaude(`${r.stdout}\n${r.stderr}`) };
      }
      if (target.provider === 'grok') {
        const r = await run(target.command, ['mcp', 'doctor', server, '--json'], target.env, 90_000);
        return { ...base, ...readGrok(r.stdout, server) };
      }
      if (target.provider === 'codex') {
        const r = await run(target.command, ['mcp', 'list', '--json'], target.env, 30_000);
        return { ...base, ...readCodex(r.stdout, server) };
      }
      return { ...base, state: 'eingetragen', detail: 'Diese CLI lässt sich nicht befragen.' };
    }),
  );
}
