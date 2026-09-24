import { estimateTokens } from '@cortex/core';
import { STANDARD_BEREICHE } from './bereiche.js';
import type { ErinnerungsEinstellungen, Treffer } from './erinnerung.js';

/** Wie Treffer aus dem Exokortex aussehen: als Brief-Abschnitt für das Modell und als Karte im Chat. */

/** Eine Fundstelle als lesbarer Text: JSON-Reste (Anführungszeichen, Klammern) raus, Leerraum zusammengezogen. */
function bereinigeStelle(stelle: string | null | undefined): string {
  return (stelle ?? '')
    .replace(/\\?"/g, ' ')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/\s*,\s*(?=\S)/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function trefferText(treffer: Treffer[], e: ErinnerungsEinstellungen): string {
  const kopf = `${e.promptEinbettung.trim()}\nGanze Fundstelle lesen: Exokortex-Werkzeug «dokument» mit der genannten id.\n`;
  const zeilen: string[] = [kopf];
  let budget = e.budget - estimateTokens(kopf);
  treffer.forEach((t, i) => {
    const quelle = [t.dokument_titel || t.titel, t.projekt?.replace(/^proj_/, ''), t.pfad].filter(Boolean).join(' · ');
    const stelle = bereinigeStelle(t.stelle);
    const block = `[${i + 1}] ${quelle}\n    ${stelle}\n    id: ${t.id}`;
    const kosten = estimateTokens(block);
    if (kosten > budget) return;
    budget -= kosten;
    zeilen.push(block);
  });
  return zeilen.join('\n');
}

/** Ein Treffer für die Anzeige im Chat: Titel, Art, Ort, Datum, kurzer Auszug. */
export function trefferFuerAnzeige(t: Treffer): {
  id: string; titel: string; quelle: 'chat' | 'dokument'; ort?: string; datum?: string; auszug: string; passung: 'sehr' | 'gut';
} {
  const chat = t.projekt === 'proj_cortex_chats';
  const datum = /(\d{4})-(\d{2})-(\d{2})/.exec(t.pfad ?? '');
  const ort = chat ? undefined : [PROJEKTNAMEN[t.projekt ?? ''] ?? t.projekt?.replace(/^proj_/, '').replace(/_/g, ' '), t.pfad?.split('/').pop()].filter(Boolean).join(' · ');
  const auszug = bereinigeStelle(t.stelle).slice(0, 220);
  return {
    id: t.id,
    titel: (t.dokument_titel || t.titel || 'Ohne Titel').replace(/^@\S+\s+/, ''),
    quelle: chat ? 'chat' : 'dokument',
    ort,
    datum: datum ? `${Number(datum[3])}.${Number(datum[2])}.${datum[1]}` : undefined,
    auszug,
    passung: t.wert >= 20 ? 'sehr' : 'gut',
  };
}

const PROJEKTNAMEN: Record<string, string> = Object.fromEntries(
  STANDARD_BEREICHE.flatMap((b) => b.projekte.map((p) => [p, b.name] as const)),
);
