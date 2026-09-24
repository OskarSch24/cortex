import { spawn } from 'node:child_process';
import type { McpServerDef } from '../mcpSync.js';
import { terminateChild } from '../../util/process.js';
import { PROBE_KILL_GRACE_MS, PROBE_STDIO_TIMEOUT_MS } from '../../util/timeouts.js';
import {
  MAX_TOOL_PAGES,
  initializeRequest,
  initializedNotification,
  readTools,
  rpcError,
  serverInfo,
  tail,
  toolsRequest,
  type JsonRpcMessage,
  type ProbeOptions,
  type ProbeResult,
  type ProbeTool,
} from './shared.js';

// Lokal: stdio

/** Die Id des Bereitschaftsaufrufs — weit weg von den Seiten der Werkzeugliste. */
const READINESS_ID = 9_000;

function callTexts(result: Record<string, unknown> | undefined): string[] {
  const content = Array.isArray(result?.content) ? (result!.content as Array<Record<string, unknown>>) : [];
  return content.map((c) => (typeof c.text === 'string' ? c.text : '')).filter(Boolean);
}

export function probeStdio(def: McpServerDef, options: ProbeOptions): Promise<ProbeResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? PROBE_STDIO_TIMEOUT_MS;

  return new Promise<ProbeResult>((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const tools: ProbeTool[] = [];
    let info: ReturnType<typeof serverInfo>;
    let pages = 0;

    const child = spawn(def.command!, def.args ?? [], {
      env: { ...process.env, ...(def.env ?? {}), ...(options.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      const log = tail(stderr, 8_000);
      if (log) result = { ...result, log };
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      stop(child);
      resolve(result);
    };
    const onAbort = () => finish({ ok: false, reason: 'timeout', message: 'Prüfung abgebrochen.' });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(
      () =>
        finish({
          ok: false,
          reason: 'timeout',
          message: `Der Server hat nach ${Math.round(timeoutMs / 1000)} s noch nicht geantwortet.`,
          detail: tail(stderr) || undefined,
        }),
      timeoutMs,
    );

    const send = (message: unknown) => {
      if (child.stdin.writable) child.stdin.write(`${JSON.stringify(message)}\n`);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      finish(
        error.code === 'ENOENT'
          ? { ok: false, reason: 'missing', message: `„${def.command}“ ist auf diesem Mac nicht zu finden.` }
          : { ok: false, reason: 'start', message: `„${def.command}“ ließ sich nicht starten.`, detail: error.message },
      );
    });
    // Ein Server, der beim Beenden noch schreibt, soll die Prüfung nicht umwerfen.
    child.stdin.on('error', () => {});
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });
    child.on('close', (code, signal) => {
      finish({
        ok: false,
        reason: 'start',
        message:
          code === 0 || signal
            ? 'Der Server hat sich beendet, ohne zu antworten.'
            : `Der Server ist beim Start mit Code ${code} ausgestiegen.`,
        detail: tail(stderr) || undefined,
      });
    });

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      let newline: number;
      while ((newline = stdout.indexOf('\n')) !== -1) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (!line) continue;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(line) as JsonRpcMessage;
        } catch {
          // Manche Server schreiben Begrüßungen auf stdout. Das ist unsauber, aber
          // kein Grund, die Verbindung für kaputt zu erklären.
          continue;
        }
        // Anfragen des Servers an den Client (etwa `roots/list`) beantworten wir
        // leer, damit er nicht auf uns wartet.
        if (message.method && message.id !== undefined && message.id !== null) {
          send({ jsonrpc: '2.0', id: message.id, result: {} });
          continue;
        }
        if (message.id === 1) {
          if (message.error) return finish(rpcError(message, 'initialize'));
          info = serverInfo(message.result);
          send(initializedNotification);
          send(toolsRequest(2));
        } else if (message.id === READINESS_ID && options.readiness) {
          const text = [message.error?.message, ...callTexts(message.result)].filter(Boolean).join(' ');
          const blocked = options.readiness.blocked.test(text);
          finish({
            ok: true, server: info, tools, ms: Date.now() - started,
            ...(blocked ? { notice: options.readiness.notice, noticeDetail: tail(text, 400) } : {}),
          });
        } else if (typeof message.id === 'number' && message.id >= 2) {
          if (message.error) return finish(rpcError(message, 'tools/list'));
          const page = readTools(message.result);
          tools.push(...page.tools);
          pages++;
          if (page.next && pages < MAX_TOOL_PAGES) {
            send(toolsRequest(message.id + 1, page.next));
          } else if (options.readiness && tools.some((t) => t.name === options.readiness!.tool)) {
            send({ jsonrpc: '2.0', id: READINESS_ID, method: 'tools/call', params: { name: options.readiness.tool, arguments: options.readiness.arguments ?? {} } });
          } else {
            finish({ ok: true, server: info, tools, ms: Date.now() - started });
          }
        }
      }
    });

    send(initializeRequest(1));
  });
}

/** Beenden, und wer nicht hört, nach zwei Sekunden hart. */
function stop(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.stdin?.end();
    terminateChild(child, PROBE_KILL_GRACE_MS);
  } catch {
    // Schon weg.
  }
}
