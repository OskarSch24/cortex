import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Beendet einen Kindprozess: erst SIGTERM, und wer nach `graceMs` noch läuft,
 * bekommt SIGKILL. Der Zeitgeber hält den Host nicht am Leben.
 */
export function terminateChild(child: ChildProcess, graceMs: number): void {
  child.kill('SIGTERM');
  const hard = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, graceMs);
  hard.unref?.();
}

/** Ob ein Befehl mit Code 0 endet. Ausgabe wird verworfen; ein Startfehler heißt nein. */
export function exitsZero(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, args, { env, stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
