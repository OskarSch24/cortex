import { spawn } from 'node:child_process';
import { closeSync, openSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { CHAT_ORDNER } from '../storage/exokortexExport.js';
import type { AbrufAuftrag, Treffer } from './erinnerung.js';

const herkunft = new Map<string, string | null>();

/** Wo die Chats einer Ablage liegen — der Volltext hält ihren Pfad relativ dazu. */
const ABLAGEN: Record<string, string> = {
  proj_cortex_chats: CHAT_ORDNER,
  proj_ki_chats: join(homedir(), 'KI-Chats'),
};

/**
 * Der Projektordner eines abgelegten Chats: `projekt_pfad` aus dem Kopf seiner
 * Datei unter `~/Cortex-Chats` oder `~/KI-Chats`. Ein Chat wechselt sein
 * Projekt nicht; einmal gelesen, bleibt die Antwort.
 */
export function chatProjekt(pfad: string, ablage = 'proj_cortex_chats', ordner = ABLAGEN[ablage] ?? CHAT_ORDNER): string | undefined {
  const datei = isAbsolute(pfad) ? pfad : join(ordner, pfad);
  if (relative(ordner, datei).startsWith('..')) return undefined;
  if (!herkunft.has(datei)) {
    let wert: string | null = null;
    try {
      const fd = openSync(datei, 'r');
      try {
        const puffer = Buffer.alloc(2048);
        const kopf = puffer.subarray(0, readSync(fd, puffer, 0, puffer.length, 0)).toString('utf8');
        const m = /^---\n[\s\S]*?^projekt_pfad:\s*"?(.*?)"?\s*$/m.exec(kopf);
        wert = m?.[1]?.trim() || null;
      } finally { closeSync(fd); }
    } catch { /* fehlt: kein Projekt */ }
    herkunft.set(datei, wert);
  }
  return herkunft.get(datei) ?? undefined;
}

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
