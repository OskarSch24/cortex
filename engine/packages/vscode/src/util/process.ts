/**
 * Lebt der Prozess noch? Nur ein ausdrückliches „gibt es nicht“ (ESRCH) zählt
 * als tot — fehlt bloß das Recht, ihn anzusprechen, lebt er für uns weiter.
 */
export function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
