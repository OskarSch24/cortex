import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHAT_ORDNER } from '../storage/exokortexExport.js';

/**
 * „Merk dir …“ landet hier. Der Exokortex hat keinen Schreibweg außer der
 * Einspeisung; `bruecke/chats.py` liest `~/Cortex-Chats` stündlich ein, also
 * liegt die Merkliste dort — und ist spätestens nach der nächsten Runde
 * über «suche» auffindbar.
 */
const MERKLISTE = join(CHAT_ORDNER, 'Erinnerungen', 'merkliste.md');

export function schreibeMerkliste(eintrag: string, pfad: string = MERKLISTE, jetzt = new Date()): void {
  try {
    mkdirSync(join(pfad, '..'), { recursive: true });
    if (!existsSync(pfad)) {
      writeFileSync(
        pfad,
        '---\nart: cortex-merkliste\ntitle: "Merkliste"\n---\n\n# Merkliste\n\nWas Oskar ausdrücklich gemerkt haben wollte.\n',
        'utf8',
      );
    }
    const datum = jetzt.toISOString().slice(0, 10);
    appendFileSync(pfad, `\n## ${datum}\n\n${eintrag.trim()}\n`, 'utf8');
  } catch {
    // Die Merkliste darf den Chat nie stören.
  }
}
