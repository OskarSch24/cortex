import { flattenWidgets, parseMention } from '@cortex/core';

/** Woran der Abruf erkennt, wonach gesucht wird — rein rechnend, ohne Modellaufruf. */

const STOPPWOERTER = new Set(
  (
    'aber alle allem allen aller alles also auch auf aus bei beim bin bis bitte bist da dabei damit dann das dass dein deine dem den denn der des dessen dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen einer eines einfach er es etwas euch euer für gibt gut hab habe haben hat hatte hatten hier ich ihr im immer in ist ja jetzt kann kannst kein keine können könnte mal man mehr mein meine mich mir mit muss müssen nach nicht nichts noch nun nur ob oder ohne schon sehr sein seine sich sie sind so soll sollte sondern über um und uns unser unsere unter vom von vor war waren was weil weiter welche welcher wenn wer werden wie wieder will wir wird wo wurde zu zum zur zwischen okay ähm äh also gerne genau eben ganz irgendwie eigentlich halt ' +
    'the and for are but not you your with this that have has from they will would there their what about which when make can like just into than then them these some could other only also how its our out use any may want need should does did done was were been being get got let yes please thanks'
  ).split(' '),
);

/** Sieht das Wort wie eine Kennung aus — Trennzeichen, Ziffern oder BinnenMajuskel? */
const istKennung = (wort: string): boolean => /[\/_.:-]|\d/.test(wort) || /[a-z][A-Z]/.test(wort);

/**
 * Suchbegriffe aus einer Nachricht, ohne Modellaufruf: Füllwörter raus,
 * Kennungen („apidojo/instagram-scraper“, „WF-E.10“) und lange Wörter zuerst.
 */
export function suchbegriffe(text: string, max = 10): string[] {
  const roh = flattenWidgets(text).match(/[\p{L}\p{N}][\p{L}\p{N}\/_.:-]*[\p{L}\p{N}]/gu) ?? [];
  const gesehen = new Set<string>();
  const kandidaten: Array<{ wort: string; gewicht: number; pos: number }> = [];
  roh.forEach((wort, pos) => {
    const klein = wort.toLowerCase();
    if (klein.length < 3 || STOPPWOERTER.has(klein) || gesehen.has(klein)) return;
    if (/^\d+$/.test(klein) && klein.length < 4) return;
    if (/^https?:/.test(klein)) return;
    gesehen.add(klein);
    const kennung = istKennung(wort);
    kandidaten.push({ wort, gewicht: (kennung ? 100 : 0) + Math.min(wort.length, 20), pos });
  });
  return kandidaten
    .sort((a, b) => b.gewicht - a.gewicht || a.pos - b.pos)
    .slice(0, max)
    .map((k) => k.wort);
}

/** Der Teil einer Nachricht, nach dem gesucht wird: ohne Konto-Präfix und Anhangsliste. */
export function suchtext(prompt: string): string {
  // parseMention kennt die Form des Präfixes, auch Kontonamen mit Leerzeichen.
  return parseMention(prompt.replace(/\n+Attached files:\n[\s\S]*$/, '')).cleaned;
}

/**
 * Trägt die Nachricht ein eigenes Thema? Kurze Nachfragen („immer noch nicht
 * sauber“, „mach weiter“) sind Fortsetzungen und lösen keinen neuen Abruf aus.
 */
export function gehaltvoll(text: string, begriffe: string[]): boolean {
  const woerter = text.split(/\s+/).filter(Boolean).length;
  const kennung = begriffe.some(istKennung);
  return kennung || (woerter >= 4 && begriffe.length >= 3);
}

/** Ein neues Thema: kaum ein Begriff der neuen Nachricht kam in der letzten Suche vor. */
export function themenwechsel(vorher: string[], jetzt: string[]): boolean {
  if (jetzt.length === 0) return false;
  const alt = new Set(vorher.map((w) => w.toLowerCase()));
  const gemeinsam = jetzt.filter((w) => alt.has(w.toLowerCase())).length;
  return gemeinsam / jetzt.length < 0.34;
}

export function istMerkwunsch(text: string): boolean {
  return /\b(merk(e)?\s+(dir|euch)|nicht\s+vergessen|behalte?\s+(das|im\s+kopf)|remember\s+(this|that))\b/i.test(text);
}
