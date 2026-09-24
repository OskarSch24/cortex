import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { CliSight } from '@cortex/core';
import { runCommand, type CliTarget, type Runner } from './cliSight.js';
import { errorMessage } from '../util/errors.js';

/**
 * Anmelden über die CLIs selbst — für Anbieter, die nur Programme von ihrer
 * eigenen Liste an den Zugang lassen (Figma). Cortex steht nicht darauf,
 * Claude Code und Codex schon. Beide melden sich also mit ihrer eigenen
 * Registrierung an und halten das Token; Cortex stößt es an, zeigt den Link und
 * fragt danach nach dem Stand.
 *
 *   claude  Steueranfrage `mcp_authenticate` über stream-json — liefert den
 *           Link, wartet selbst auf den Rückruf; `mcp_status` meldet danach
 *           „connected“ samt Werkzeugen.
 *   codex   `codex mcp login <name>` — öffnet den Browser selbst, druckt den
 *           Link und endet mit Code 0, sobald das Token liegt.
 */

export const AGENT_LOGIN_PROVIDERS = ['claude', 'codex'];

export type Spawn = typeof spawn;

interface AgentLoginDeps {
  /** Der Link zur Bestätigung. `opensItself`: die CLI hat den Browser schon geöffnet. */
  onUrl(url: string, opensItself: boolean): void;
  signal?: AbortSignal;
  /** Wie lange der Browser Zeit hat. */
  timeoutMs?: number;
  spawnFn?: Spawn;
  /** Abstand zwischen zwei Nachfragen bei Claude Code. */
  pollMs?: number;
}

type AgentLoginResult =
  | { ok: true; tools?: string[] }
  | { ok: false; cancelled?: boolean; message: string };

const LOGIN_TIMEOUT = 5 * 60_000;

/** Eine Claude-Code-Sitzung, die nur Steueranfragen bekommt — kein Zug, keine Kosten. */
class ClaudeControl {
  private child;
  private buffer = '';
  private next = 0;
  private waiting = new Map<string, { resolve(v: Record<string, unknown>): void; reject(e: Error): void }>();
  private ended?: Error;

  constructor(target: CliTarget, spawnFn: Spawn) {
    // Nicht im Projektordner: eine .mcp.json dort würde fremde Server dazulegen.
    this.child = spawnFn(target.command, ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose'], {
      env: target.env,
      cwd: tmpdir(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout?.on('data', (d: Buffer) => this.read(d.toString()));
    this.child.stderr?.on('data', () => undefined);
    const fail = (error: Error) => {
      this.ended = error;
      for (const w of this.waiting.values()) w.reject(error);
      this.waiting.clear();
    };
    this.child.on('error', (e) => fail(new Error(`Claude Code startet nicht: ${e.message}`)));
    this.child.on('close', () => fail(new Error('Claude Code hat die Sitzung beendet.')));
  }

  request(subtype: string, extra: Record<string, unknown> = {}, timeoutMs = 60_000): Promise<Record<string, unknown>> {
    if (this.ended) return Promise.reject(this.ended);
    const id = `cortex-${++this.next}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error('Claude Code antwortet nicht.'));
      }, timeoutMs);
      this.waiting.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.child.stdin?.write(`${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype, ...extra } })}\n`);
    });
  }

  close(): void {
    this.child.stdin?.end();
    this.child.kill('SIGTERM');
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 1);
      let message: { type?: string; response?: { subtype?: string; request_id?: string; response?: Record<string, unknown>; error?: string } };
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const response = message.type === 'control_response' ? message.response : undefined;
      const waiter = response?.request_id ? this.waiting.get(response.request_id) : undefined;
      if (!response || !waiter) continue;
      this.waiting.delete(response.request_id!);
      if (response.subtype === 'success') waiter.resolve(response.response ?? {});
      else waiter.reject(new Error(response.error ?? 'Claude Code hat die Anfrage abgelehnt.'));
    }
  }
}

interface ClaudeServerStatus {
  name: string;
  status?: string;
  tools?: Array<{ name?: string }>;
  error?: string;
}

async function claudeServer(control: ClaudeControl, server: string): Promise<ClaudeServerStatus | undefined> {
  const status = await control.request('mcp_status');
  const list = Array.isArray(status.mcpServers) ? (status.mcpServers as ClaudeServerStatus[]) : [];
  return list.find((s) => s.name === server);
}

const toolNames = (found: ClaudeServerStatus) =>
  (found.tools ?? []).map((t) => t.name).filter((n): n is string => typeof n === 'string');

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(timer), resolve()), { once: true });
  });

export async function claudeMcpLogin(target: CliTarget, server: string, deps: AgentLoginDeps): Promise<AgentLoginResult> {
  const control = new ClaudeControl(target, deps.spawnFn ?? spawn);
  const deadline = Date.now() + (deps.timeoutMs ?? LOGIN_TIMEOUT);
  try {
    await control.request('initialize');
    const auth = await control.request('mcp_authenticate', { serverName: server });
    if (auth.requiresUserAction && typeof auth.authUrl === 'string') deps.onUrl(auth.authUrl, false);
    // Den Rückruf nimmt Claude Code selbst an; danach verbindet es neu.
    while (Date.now() < deadline) {
      if (deps.signal?.aborted) return { ok: false, cancelled: true, message: 'Abgebrochen.' };
      const found = await claudeServer(control, server);
      if (!found) return { ok: false, message: `${server} steht nicht im Profil.` };
      if (found.status === 'connected') return { ok: true, tools: toolNames(found) };
      await pause(deps.pollMs ?? 2000, deps.signal);
    }
    return { ok: false, message: 'Im Browser wurde nichts bestätigt.' };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  } finally {
    control.close();
  }
}

/** Der Link aus der Ausgabe von `codex mcp login`. */
export function codexLoginUrl(output: string): string | undefined {
  return /opening this URL in your browser:\s*(https?:\/\/\S+)/.exec(output)?.[1];
}

export function codexMcpLogin(target: CliTarget, server: string, deps: AgentLoginDeps): Promise<AgentLoginResult> {
  return new Promise((resolve) => {
    const child = (deps.spawnFn ?? spawn)(target.command, ['mcp', 'login', server], {
      env: target.env,
      cwd: tmpdir(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let announced = false;
    let settled = false;
    const finish = (result: AgentLoginResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null) child.kill('SIGTERM');
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, message: 'Im Browser wurde nichts bestätigt.' }), deps.timeoutMs ?? LOGIN_TIMEOUT);
    deps.signal?.addEventListener('abort', () => finish({ ok: false, cancelled: true, message: 'Abgebrochen.' }), { once: true });
    const read = (d: Buffer) => {
      output = (output + d.toString()).slice(-20_000);
      const url = announced ? undefined : codexLoginUrl(output);
      if (url) {
        announced = true;
        deps.onUrl(url, true);
      }
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.on('error', (e) => finish({ ok: false, message: `Codex startet nicht: ${e.message}` }));
    child.on('close', (code) => {
      if (code === 0) return finish({ ok: true });
      const last = output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trim().split('\n').slice(-1)[0];
      finish({ ok: false, message: last || `Codex endete mit Code ${code}.` });
    });
  });
}

/** Was Claude Code über den Server sagt — mit Werkzeugen, wenn es ihn erreicht. */
export async function claudeMcpSight(
  target: CliTarget,
  server: string,
  spawnFn: Spawn = spawn,
  pollMs = 1500,
): Promise<{ sight: CliSight; tools?: string[] }> {
  const base = { provider: target.provider, label: target.label, account: target.account };
  const control = new ClaudeControl(target, spawnFn);
  const deadline = Date.now() + 45_000;
  try {
    await control.request('initialize');
    // Direkt nach dem Start verbindet Claude Code noch; „pending“ ist kein Ergebnis.
    while (Date.now() < deadline) {
      const found = await claudeServer(control, server);
      if (!found) return { sight: { ...base, state: 'fehlt', detail: 'Nicht im Profil.' } };
      if (found.status === 'connected') {
        const tools = toolNames(found);
        return { sight: { ...base, state: 'verbunden', detail: `Claude Code ist angemeldet und sieht ${tools.length} Werkzeuge.` }, tools };
      }
      if (found.status === 'needs-auth') return { sight: { ...base, state: 'fehler', detail: 'In Claude Code nicht angemeldet.' } };
      if (found.status === 'failed') return { sight: { ...base, state: 'fehler', detail: found.error ?? 'Claude Code erreicht ihn nicht.' } };
      await pause(pollMs);
    }
    return { sight: { ...base, state: 'fehler', detail: 'Claude Code verbindet noch.' } };
  } catch (e) {
    return { sight: { ...base, state: 'fehler', detail: errorMessage(e) } };
  } finally {
    control.close();
  }
}

/**
 * Grok hält Konnektoren im Grok-Konto (Figma, Notion, …) und reicht sie über
 * sein Gateway durch. Ob eines davon im Konto steckt, weiß nur eine Sitzung:
 * ein kurzer Zug, der nur `search_tool` benutzt — `use_tool` ist verboten, es
 * wird also nichts im Dienst aufgerufen. Kostet einen Modellaufruf, darum nur
 * auf ausdrücklichen Klick.
 */
export async function grokConnectorSight(target: CliTarget, server: string, run: Runner = runCommand): Promise<{ sight: CliSight; tools?: string[] }> {
  const base = { provider: target.provider, label: target.label, account: target.account };
  const prompt =
    `Rufe search_tool mit der Suche '${server}' auf. Gib danach ausschließlich die gefundenen Werkzeugnamen aus, ` +
    `die mit '${server}__' beginnen, einen je Zeile. Findest du keine, antworte genau: KEINE`;
  const r = await run(target.command, ['--always-approve', '--deny', 'use_tool', '--output-format', 'json', '-p', prompt], target.env, 180_000);
  return readGrokConnector(r.stdout, server, base);
}

export function readGrokConnector(output: string, server: string, base: Pick<CliSight, 'provider' | 'label' | 'account'>): { sight: CliSight; tools?: string[] } {
  let text: string | undefined;
  try {
    text = (JSON.parse(output) as { text?: string }).text;
  } catch {
    text = undefined;
  }
  if (typeof text !== 'string') return { sight: { ...base, state: 'fehler', detail: 'Grok hat keine lesbare Antwort gegeben.' } };
  // Grok klebt Sätze gern ohne Leerzeichen an („… aus.KEINE“) — also nach Namen suchen, nicht nach Wörtern.
  const escaped = server.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tools = [...new Set(text.match(new RegExp(`\\b${escaped}__[A-Za-z0-9_]+`, 'gi')) ?? [])];
  if (tools.length) return { sight: { ...base, state: 'verbunden', detail: `Grok sieht ${tools.length} Werkzeuge über den Konnektor seines Kontos.` }, tools };
  return { sight: { ...base, state: 'fehler', detail: `Im Grok-Konto ist kein ${server}-Konnektor hinzugefügt.` } };
}
