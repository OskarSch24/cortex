import { execFile, type ExecFileOptions } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

/** Zeitdeckel und Pufferdeckel eines Aufrufs; ohne `maxBuffer` gilt die Vorgabe von Node. */
export interface ExecLimits {
  timeout: number;
  maxBuffer?: number;
}

/**
 * Führt ein Programm aus und liefert seine getrimmte Ausgabe — oder `undefined`,
 * wenn es fehlt, scheitert oder den Zeitdeckel reißt. Für Fragen wie „läuft X?“,
 * bei denen ein Fehler nur „nein“ heißt.
 */
export function tryExec(cmd: string, args: string[], timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs }, (error, stdout) => resolve(error ? undefined : stdout.trim()));
  });
}

/** Führt ein Programm aus und wirft, wenn es scheitert. Die Ausgabe zählt nicht. */
export async function runFile(cmd: string, args: string[], options: ExecFileOptions): Promise<void> {
  await exec(cmd, args, options);
}

/** `maxBuffer` nur setzen, wenn er genannt ist — ein `undefined` hebt Nodes Deckel sonst auf. */
function limits(root: string, { timeout, maxBuffer }: ExecLimits): ExecFileOptions {
  return maxBuffer === undefined ? { cwd: root, timeout } : { cwd: root, timeout, maxBuffer };
}

/** git in `root`; liefert stdout ungekürzt und wirft wie `execFile` (mit `code`, `stdout`, `stderr`). */
export async function git(root: string, args: string[], opts: ExecLimits): Promise<string> {
  return (await exec('git', args, { ...limits(root, opts), encoding: 'utf8' })).stdout;
}

/** Wie `git`, aber die Ausgabe als Bytes — für Dateiinhalte aus einem Commit. */
export async function gitBuffer(root: string, args: string[], opts: ExecLimits): Promise<Buffer> {
  return (await exec('git', args, { ...limits(root, opts), encoding: 'buffer' })).stdout;
}
