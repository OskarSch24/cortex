import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { terminateChild } from '../util/process.js';
import { CLI_KILL_GRACE_MS } from '../util/timeouts.js';

export type SpawnEvent =
  | { kind: 'line'; stream: 'stdout' | 'stderr'; line: string }
  | { kind: 'exit'; code: number | null; signal: NodeJS.Signals | null }
  | { kind: 'spawn-error'; message: string; missingCommand?: boolean };

export interface SpawnOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  /** Open a writable stdin (for CLIs that accept streamed input). */
  stdinPipe?: boolean;
  /** Called once with the child so callers can grab stdin. */
  onChild?: (child: ChildProcess) => void;
}

/** Setup guidance belongs to the requested provider, not the shell/interpreter. */
export function cliSetupError(command: string, detail: string): string {
  if (/claude(?:[.\s/\\-]|$)/i.test(command)) {
    return 'Claude Code konnte nicht gestartet werden. Installiere Claude Code und prüfe den CLI-Pfad unter Einstellungen → KI-Agenten. ' + detail;
  }
  return `Command not found: ${command}. Is the CLI installed and on PATH? ${detail}`;
}

/**
 * A CLI path that points at a JavaScript file is run through this Node,
 * rather than executed. Only a shebang line and an exec bit make such a file
 * runnable on its own, and Windows has neither — so without this, pointing
 * `cortex.cliPath.*` at a `.mjs` entry point works everywhere except there.
 */
function nodeScript(command: string, args: string[]): [string, string[]] {
  return /\.[cm]?js$/i.test(command) ? [process.execPath, [command, ...args]] : [command, args];
}

/** Spawns a CLI and yields stdout/stderr line-by-line, ending with exit info. */
export async function* spawnLines(
  rawCommand: string,
  rawArgs: string[],
  opts: SpawnOptions,
): AsyncGenerator<SpawnEvent> {
  const [command, args] = nodeScript(rawCommand, rawArgs);
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: /\.[cm]?js$/i.test(rawCommand) && process.versions.electron
      ? { ...opts.env, ELECTRON_RUN_AS_NODE: '1' }
      : opts.env,
    stdio: [opts.stdinPipe ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });

  const queue: SpawnEvent[] = [];
  let done = false;
  let notify: (() => void) | undefined;
  const push = (e: SpawnEvent) => {
    queue.push(e);
    notify?.();
  };

  const onAbort = () => terminateChild(child, CLI_KILL_GRACE_MS);
  if (opts.signal.aborted) onAbort();
  else opts.signal.addEventListener('abort', onAbort, { once: true });

  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) =>
      push({ kind: 'line', stream: 'stdout', line }),
    );
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', (line) =>
      push({ kind: 'line', stream: 'stderr', line }),
    );
  }

  child.on('error', (err: NodeJS.ErrnoException) => {
    const message =
      err.code === 'ENOENT'
        ? // The CLI the caller asked for, not the interpreter we may have
          // put in front of it: naming node here would send them hunting.
          cliSetupError(rawCommand, 'Die ausführbare Datei wurde nicht gefunden.')
        : err.message;
    push({ kind: 'spawn-error', message, ...(err.code === 'ENOENT' ? { missingCommand: true } : {}) });
    done = true;
    notify?.();
  });

  child.on('close', (code, signal) => {
    push({ kind: 'exit', code, signal });
    done = true;
    notify?.();
  });

  // A write may fail asynchronously after writable was checked. Never leave an
  // unhandled stdin error behind, or a generator waiting for another line.
  child.stdin?.on('error', (error) => {
    if (done) return;
    push({ kind: 'spawn-error', message: `CLI-Eingabe abgebrochen: ${error.message}` });
    done = true;
    onAbort();
  });

  try {
    try { opts.onChild?.(child); }
    catch (error) {
      push({ kind: 'spawn-error', message: error instanceof Error ? error.message : String(error) });
      done = true;
    }
    while (true) {
      const next = queue.shift();
      if (next) {
        yield next;
        if (next.kind === 'exit' || next.kind === 'spawn-error') return;
        continue;
      }
      if (done) return;
      await new Promise<void>((resolve) => {
        notify = resolve;
      });
      notify = undefined;
    }
  } finally {
    opts.signal.removeEventListener('abort', onAbort);
    if (child.exitCode === null && child.signalCode === null) onAbort();
  }
}
