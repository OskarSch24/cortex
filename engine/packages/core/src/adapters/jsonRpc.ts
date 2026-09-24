import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { terminateChild } from '../util/process.js';
import { RpcError } from '../util/rpcError.js';
import { CLI_KILL_GRACE_MS, RPC_IDLE_MS } from '../util/timeouts.js';

export { RpcError };

/**
 * Minimal line-delimited JSON-RPC 2.0 client over a child process's stdio —
 * the transport CLIs expose for editor integration (codex app-server, and
 * the same shape used by other agent protocols).
 */

export interface RpcNotification {
  method: string;
  params: Record<string, unknown>;
}

export interface RpcServerRequest {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
}

export interface JsonRpcOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  onNotification: (n: RpcNotification) => void;
  /**
   * Server→client requests (approvals, elicitations). Return the result
   * payload, or a promise for it — an approval that has to reach the user and
   * come back takes as long as the user takes.
   */
  onServerRequest?: (r: RpcServerRequest) => unknown | Promise<unknown>;
  /** Called only after the reply was written; later requests preserve stdin ordering. */
  onServerResponse?: (r: RpcServerRequest, result: unknown) => void;
  onStderr?: (line: string) => void;
  onExit?: (code: number | null) => void;
  onSpawnError?: (message: string) => void;
  /** A complete incoming protocol message, including tool progress. */
  onActivity?: () => void;
}

export class JsonRpcProcess {
  private child?: ChildProcess;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      method: string;
      /** Wie lange Stille die Antwort warten darf. */
      idleMs: number;
      /** Wann die Frist zuletzt neu gestellt wurde. */
      touched: number;
    }
  >();
  private closed = false;
  private abortListener?: () => void;

  constructor(
    private command: string,
    private args: string[],
    private opts: JsonRpcOptions,
  ) {}

  start(): void {
    const child = spawn(this.command, this.args, {
      cwd: this.opts.cwd,
      env: this.opts.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    const onAbort = this.abortListener = () => this.dispose();
    if (this.opts.signal.aborted) onAbort();
    else this.opts.signal.addEventListener('abort', onAbort, { once: true });

    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
    }
    if (child.stderr) {
      createInterface({ input: child.stderr }).on('line', (line) => this.opts.onStderr?.(line));
    }

    child.on('error', (err: NodeJS.ErrnoException) => {
      const message =
        err.code === 'ENOENT'
          ? `Command not found: ${this.command}. Is the CLI installed and on PATH?`
          : err.message;
      this.failAll(new Error(message));
      this.opts.onSpawnError?.(message);
    });

    child.stdin?.on('error', (error) => {
      if (this.closed) return;
      this.failAll(error);
      this.opts.onSpawnError?.(`CLI-Eingabe abgebrochen: ${error.message}`);
      this.dispose();
    });

    child.on('close', (code) => {
      this.closed = true;
      if (this.abortListener) this.opts.signal.removeEventListener('abort', this.abortListener);
      this.failAll(new Error(`process exited with code ${code}`));
      this.opts.onExit?.(code);
    });
  }

  private handleLine(line: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    this.opts.onActivity?.();
    // Jede Zeile ist ein Lebenszeichen: ein Agent, der Werkzeuge meldet,
    // arbeitet. Die Frist misst deshalb Stille, nicht Dauer — sonst stirbt
    // ein langer, sichtbar laufender Auftrag an der Uhr statt an einem Fehler.
    this.refreshDeadlines();

    // Response to one of our requests.
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const entry = this.pending.get(msg.id as number);
      if (!entry) return;
      this.pending.delete(msg.id as number);
      clearTimeout(entry.timer);
      if (msg.error) {
        const err = msg.error as { message?: string; code?: number };
        // The code travels with the error: a caller has to be able to tell an
        // unimplemented method (-32601) from a refusal, and the message alone
        // ("Method not found") says nothing about which method it was.
        entry.reject(new RpcError(err.message ?? 'JSON-RPC error', err.code));
      } else {
        entry.resolve((msg.result ?? {}) as Record<string, unknown>);
      }
      return;
    }

    // Server → client request (approvals). Answer so the CLI is never stuck —
    // even when the answer has to go to the user and come back first.
    if (msg.id !== undefined && typeof msg.method === 'string') {
      const id = msg.id;
      const request = { id: id as string | number, method: msg.method, params: (msg.params ?? {}) as Record<string, unknown> };
      void Promise.resolve().then(() => this.opts.onServerRequest?.(request)).then(
        result => {
          if (this.write({ jsonrpc: '2.0', id, result: result ?? {} })) this.opts.onServerResponse?.(request, result);
        },
        () => { this.write({ jsonrpc: '2.0', id, result: {} }); },
      ).catch(() => { /* a post-response callback cannot send a second response */ });
      return;
    }

    if (typeof msg.method === 'string') {
      this.opts.onNotification({
        method: msg.method,
        params: (msg.params ?? {}) as Record<string, unknown>,
      });
    }
  }

  private write(payload: unknown): boolean {
    const stdin = this.child?.stdin;
    if (!stdin || this.closed || !stdin.writable) return false;
    try { stdin.write(JSON.stringify(payload) + '\n'); return true; }
    catch (error) { this.failAll(error instanceof Error ? error : new Error(String(error))); return false; }
  }

  /**
   * `idleMs` ist kein Deckel auf die Laufzeit, sondern die längste erlaubte
   * Stille: jede eingehende Zeile stellt die Frist neu.
   */
  request(method: string, params: unknown, idleMs = RPC_IDLE_MS): Promise<Record<string, unknown>> {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = this.arm(id, method, idleMs);
      this.pending.set(id, { resolve, reject, timer, method, idleMs, touched: Date.now() });
      if (!this.write({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('process is not writable'));
      }
    });
  }

  private arm(id: number, method: string, idleMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      const entry = this.pending.get(id);
      if (!entry) return;
      this.pending.delete(id);
      const minutes = Math.max(1, Math.round(idleMs / 60_000));
      entry.reject(new Error(`${method}: seit ${minutes} Minuten kein Lebenszeichen der CLI`));
    }, idleMs);
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
  }

  /**
   * Höchstens einmal je Sekunde — die Zeilen kommen im Strom. Bei einer
   * kurzen Frist entsprechend häufiger, sonst käme die Auffrischung zu spät.
   */
  private refreshDeadlines(): void {
    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (now - entry.touched < Math.min(1000, entry.idleMs / 4)) continue;
      entry.touched = now;
      clearTimeout(entry.timer);
      entry.timer = this.arm(id, entry.method, entry.idleMs);
    }
  }

  notify(method: string, params: unknown): boolean {
    return this.write({ jsonrpc: '2.0', method, params });
  }

  private failAll(error: Error): void {
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(error); }
    this.pending.clear();
  }

  dispose(): void {
    if (!this.child || this.closed) return;
    this.closed = true;
    if (this.abortListener) this.opts.signal.removeEventListener('abort', this.abortListener);
    this.failAll(new Error('process was closed'));
    const child = this.child;
    try {
      child.stdin?.end();
    } catch {
      // ignore
    }
    terminateChild(child, CLI_KILL_GRACE_MS);
  }
}

/** Async queue that turns callback-driven events into an async iterator. */
export class EventQueue<T> {
  private items: T[] = [];
  private resolvers: Array<(value: IteratorResult<T>) => void> = [];
  private ended = false;

  push(item: T): void {
    if (this.ended) return;
    const resolver = this.resolvers.shift();
    if (resolver) resolver({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const resolve of this.resolvers.splice(0)) {
      resolve({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      const item = this.items.shift();
      if (item !== undefined) {
        yield item;
        continue;
      }
      if (this.ended) return;
      const next = await new Promise<IteratorResult<T>>((resolve) => this.resolvers.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}
