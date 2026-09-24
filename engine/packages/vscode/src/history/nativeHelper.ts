import { spawn } from 'node:child_process';
import { CANCELED, LOCAL_ERROR } from './messages.js';

export type NativeCommand = 'status' | 'permission' | 'sample' | 'summarize' | 'ask';
export type NativeHistoryCall = (command: NativeCommand, input: unknown, signal: AbortSignal) => Promise<unknown>;

/** No shell, network SDK, provider routing, transcript, or external memory system. */
export function runHistoryHelper(helperPath: string, command: NativeCommand, input: unknown, signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error(CANCELED)); return; }
    const body = input === undefined ? '' : JSON.stringify(input);
    if (Buffer.byteLength(body) > 48_000) { reject(new Error(LOCAL_ERROR)); return; }
    const child = spawn(helperPath, [command], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let complete = false;
    let bytes = 0;
    let stderrBytes = 0;
    const chunks: Buffer[] = [];
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 1000);
      killTimer.unref();
    };
    const finish = (error?: string, value?: unknown) => {
      if (complete) return;
      complete = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (error) { stop(); reject(new Error(error)); } else resolve(value);
    };
    const abort = () => finish(CANCELED);
    const timer = setTimeout(() => finish(LOCAL_ERROR), command === 'ask' || command === 'summarize' ? 60_000 : 15_000);
    timer.unref();
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 128_000) finish(LOCAL_ERROR); else if (!complete) chunks.push(chunk);
    });
    // Never forward stderr: native diagnostics must not disclose captured text.
    child.stderr.on('data', (chunk: Buffer) => { stderrBytes += chunk.length; if (stderrBytes > 16_000) finish(LOCAL_ERROR); });
    child.stdin.on('error', () => finish(LOCAL_ERROR));
    child.on('error', () => finish(LOCAL_ERROR));
    child.on('close', code => {
      if (killTimer) clearTimeout(killTimer);
      if (complete) return;
      if (code !== 0) { finish(LOCAL_ERROR); return; }
      try { finish(undefined, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(LOCAL_ERROR); }
    });
    child.stdin.end(body);
  });
}
