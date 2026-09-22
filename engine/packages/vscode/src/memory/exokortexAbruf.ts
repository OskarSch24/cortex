import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { AbrufAuftrag, Treffer } from './erinnerung.js';

/**
 * `lesen.py --abruf` — dieselbe Datenbank, die die Modelle über MCP lesen,
 * hier als Daten statt als Text. Die Anfrage geht als JSON über stdin, weil
 * Suchbegriffe beliebige Zeichen tragen und eine Kommandozeile kein Ort für
 * Quoting ist.
 */
export function exokortexAbruf(pfade: { python: string; repo: string }) {
  return (auftrag: AbrufAuftrag, signal: AbortSignal): Promise<Treffer[]> =>
    new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new Error('abgebrochen'));
      const kind = spawn(pfade.python, [join(pfade.repo, 'bruecke', 'lesen.py'), '--abruf'], {
        cwd: pfade.repo,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let aus = '';
      let fehler = '';
      const abbruch = () => {
        kind.kill('SIGKILL');
        reject(new Error('Zeitdeckel erreicht'));
      };
      signal.addEventListener('abort', abbruch, { once: true });
      kind.stdout.on('data', (d: Buffer) => (aus += d.toString('utf8')));
      kind.stderr.on('data', (d: Buffer) => (fehler += d.toString('utf8')));
      kind.on('error', (err) => {
        signal.removeEventListener('abort', abbruch);
        reject(err);
      });
      kind.on('close', (code) => {
        signal.removeEventListener('abort', abbruch);
        if (signal.aborted) return;
        if (code !== 0) return reject(new Error(fehler.trim().split('\n').pop() || `lesen.py endete mit ${code}`));
        try {
          const daten = JSON.parse(aus) as { treffer?: Treffer[]; fehler?: string };
          if (daten.fehler) return reject(new Error(daten.fehler));
          resolve(Array.isArray(daten.treffer) ? daten.treffer : []);
        } catch {
          reject(new Error('Antwort von lesen.py nicht lesbar'));
        }
      });
      kind.stdin.end(JSON.stringify(auftrag));
    });
}
