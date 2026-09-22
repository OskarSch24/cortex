import { condenseTurn, estimateTokens, embedHistory, flattenWidgets, formatTarget, headWithinTokens, parseMention } from '@cortex/core';
import type { BriefSection, ConversationTurn, Target } from '@cortex/core';
import { STANDARD_BEREICHE, waehleBereiche, type Suchbereich } from './bereiche.js';
import { schwaerze } from './geheim.js';
import { PROMPT_EINBETTUNG, PROMPT_NOTIZEN, PROMPT_SPEICHERN, PROMPT_SUCHE } from './vorgaben.js';

export { PROMPT_EINBETTUNG, PROMPT_NOTIZEN, PROMPT_SPEICHERN, PROMPT_SUCHE };

/**
 * Das Gedächtnis eines Chats, in zwei Teilen.
 *
 * Der Notizzettel hält fest, was in *diesem* Chat entschieden wurde — er geht
 * an jedes Modell, egal welches gerade antwortet, und überlebt damit jeden
 * Wechsel. Der Abruf holt aus dem Exokortex, was *außerhalb* dieses Chats
 * schon da ist, eingegrenzt auf die Suchbereiche der Anfrage.
 *
 * Beides kommt als Brief-Abschnitt in die Nachricht, nicht in den Systemprompt:
 * ein Systemprompt, der sich jede Runde ändert, kostet den Cache der Anbieter.
 */

export type Abrufmodus = 'nie' | 'erste' | 'themenwechsel' | 'jede';
export type Schwelle = 'locker' | 'normal' | 'streng';
export type Helfer = 'guenstig' | 'aktuell';

export interface ErinnerungsEinstellungen {
  notizen: boolean;
  abruf: Abrufmodus;
  treffer: number;
  budget: number;
  schwelle: Schwelle;
  helfer: Helfer;
  promptNotizen: string;
  promptSuche: string;
  promptEinbettung: string;
  promptSpeichern: string;
  bereiche: Suchbereich[];
}

export const STANDARD_EINSTELLUNGEN: ErinnerungsEinstellungen = {
  notizen: true,
  abruf: 'themenwechsel',
  treffer: 5,
  budget: 1500,
  schwelle: 'normal',
  helfer: 'guenstig',
  promptNotizen: PROMPT_NOTIZEN,
  promptSuche: PROMPT_SUCHE,
  promptEinbettung: PROMPT_EINBETTUNG,
  promptSpeichern: PROMPT_SPEICHERN,
  bereiche: STANDARD_BEREICHE,
};

/** Mindestwert je Stufe, auf der Skala von `lesen.py --abruf` (bm25, größer ist besser). */
const SCHWELLEN: Record<Schwelle, number> = { locker: 3, normal: 8, streng: 15 };

export interface Treffer {
  id: string;
  dokument: string;
  dokument_titel?: string | null;
  titel?: string | null;
  projekt?: string | null;
  pfad?: string | null;
  wert: number;
  stelle?: string | null;
}

export interface AbrufAuftrag {
  begriffe: string[];
  projekte: string[];
  n: number;
  ohne_pfad?: string;
}

export interface ErinnerungDeps {
  einstellungen: () => ErinnerungsEinstellungen;
  /** Führt `lesen.py --abruf` aus; wirft oder liefert [] bei Fehlern. */
  abrufen: (auftrag: AbrufAuftrag, signal: AbortSignal) => Promise<Treffer[]>;
  /** Ein einzelner Modellaufruf außerhalb des Chats. */
  fragen: (target: Target, prompt: string, signal: AbortSignal) => Promise<string | undefined>;
  /** Das Modell für Notizen: günstig, wenn möglich; sonst das, das gerade geantwortet hat. */
  helfer: (modus: Helfer, zuletzt: Target | undefined) => Target | undefined;
  notizLesen: (conversationId: string) => string | undefined;
  notizSchreiben: (conversationId: string, text: string) => void;
  merken?: (eintrag: string) => void;
  log?: (zeile: string) => void;
}

/**
 * Wie viel Verlauf ein alter Chat für seinen ersten Zettel lesen darf. Ein
 * einziges Mal je Chat, und gerade die frühen Entscheidungen sind die, die
 * sonst niemand mehr sieht — im Apify-Chat lag die Actor-Wahl 40k Tokens zurück.
 */
const ERSTAUFBAU_TOKENS = 80_000;

/** Wie lange eine Nachricht höchstens auf den Abruf wartet. */
export const ABRUF_DECKEL_MS = 2500;

export class Erinnerung {
  private letzteBegriffe = new Map<string, string[]>();
  private letzteTreffer = new Map<string, Treffer[]>();
  private laufend = new Map<string, Promise<void>>();
  private wartend = new Map<string, () => Promise<void>>();
  /** Treffer, die der Nutzer in einem Chat mit ✕ ausgeblendet hat. */
  private ausgeblendet = new Map<string, Set<string>>();
  /** Fundstellen (Dokumente), die ein Chat schon als Erinnerung gezeigt hat. */
  private gezeigt = new Map<string, Set<string>>();

  constructor(private readonly deps: ErinnerungDeps) {}

  /**
   * Vor dem Lauf: Erinnerungen holen, wenn der Modus es verlangt. Wartet
   * höchstens `ABRUF_DECKEL_MS`; danach geht die Nachricht ohne neue Treffer
   * los und die letzten bleiben stehen.
   */
  async vorbereiten(
    conversationId: string,
    prompt: string,
    ctx: { cwd?: string; erste: boolean; ohnePfad?: string; bekannt?: Iterable<string> },
  ): Promise<{ treffer: Treffer[]; bereiche: string[]; neu: boolean; neueTreffer: Treffer[] }> {
    const e = this.deps.einstellungen();
    if (e.abruf === 'nie') {
      this.letzteTreffer.delete(conversationId);
      return { treffer: [], bereiche: [], neu: false, neueTreffer: [] };
    }
    const notiz = this.deps.notizLesen(conversationId) ?? '';
    // Gesucht wird mit dem, was der Nutzer geschrieben hat — nicht mit dem
    // Konto-Präfix („@claude:Business/claude-opus-5“), das Cortex davorsetzt,
    // und nicht mit der Anhangsliste. Das Präfix steht in jedem alten Chat und
    // brachte so bei jeder Nachricht fünf „Erinnerungen“.
    const text = suchtext(prompt);
    const begriffe = suchbegriffe(text);
    const vorher = this.letzteBegriffe.get(conversationId);
    const soll =
      e.abruf === 'jede' ||
      (e.abruf === 'erste' && (ctx.erste || !vorher)) ||
      (e.abruf === 'themenwechsel' && (ctx.erste || !vorher || (gehaltvoll(text, begriffe) && themenwechsel(vorher, begriffe))));
    if (!soll || begriffe.length === 0) {
      return { treffer: this.letzteTreffer.get(conversationId) ?? [], bereiche: [], neu: false, neueTreffer: [] };
    }
    // Bereiche aus der Nachricht und aus dem Zettel: „weiter wie besprochen“
    // nennt kein Stichwort, der Zettel dieses Chats aber schon.
    const auswahl = waehleBereiche(`${prompt}\n${notiz}`, ctx.cwd, e.bereiche);
    const signal = AbortSignal.timeout(ABRUF_DECKEL_MS);
    try {
      const roh = await this.deps.abrufen(
        { begriffe, projekte: auswahl.projekte, n: e.treffer, ohne_pfad: ctx.ohnePfad },
        signal,
      );
      const weg = this.ausgeblendet.get(conversationId);
      const treffer = roh
        .filter((t) => t.wert >= SCHWELLEN[e.schwelle] && !weg?.has(t.id) && !weg?.has(t.dokument))
        .slice(0, e.treffer);
      this.letzteBegriffe.set(conversationId, begriffe);
      this.letzteTreffer.set(conversationId, treffer);
      this.deps.log?.(
        `[erinnerung] ${treffer.length}/${roh.length} Treffer in ${auswahl.bereiche.join(', ') || '—'} für ${begriffe.join(' ')}`,
      );
      // Angezeigt wird nur, was dieser Chat noch nicht vorgelegt bekam: die
      // Karte „Erinnert sich an …“ soll eine Nachricht sein, kein Dauerton.
      // Das Modell bekommt trotzdem alle Treffer (abschnitte()).
      // Nach einem Neustart weiß der Chat aus seinem Verlauf, was er schon zeigte.
      const schon = this.gezeigt.get(conversationId) ?? new Set<string>(ctx.bekannt ?? []);
      // Gezeigt wird nur, was neu und deutlich passend ist; das Modell bekommt
      // trotzdem alle Treffer über der eingestellten Schwelle.
      const neueTreffer = treffer.filter((t) => !schon.has(t.dokument) && !schon.has(t.id) && t.wert >= SCHWELLEN.streng);
      for (const t of treffer) { schon.add(t.dokument); schon.add(t.id); }
      this.gezeigt.set(conversationId, schon);
      return { treffer, bereiche: auswahl.bereiche, neu: neueTreffer.length > 0, neueTreffer };
    } catch (err) {
      this.deps.log?.(`[erinnerung] Abruf ausgelassen: ${(err as Error).message}`);
      return { treffer: this.letzteTreffer.get(conversationId) ?? [], bereiche: auswahl.bereiche, neu: false, neueTreffer: [] };
    }
  }

  /** Die Abschnitte, die mit der nächsten Nachricht an das Modell gehen. */
  abschnitte(conversationId: string): BriefSection[] {
    const e = this.deps.einstellungen();
    const out: BriefSection[] = [];
    const notiz = e.notizen ? this.deps.notizLesen(conversationId)?.trim() : undefined;
    if (notiz) {
      out.push({
        id: 'notizen',
        title: 'Notizzettel dieses Chats',
        body:
          'Von Cortex über alle Modelle hinweg geführt. Was hier steht, wurde in diesem Chat festgelegt — ' +
          'auch wenn es ein anderes Modell war. Bei Widerspruch gilt die neueste Nachricht des Nutzers.\n\n' +
          notiz,
      });
    }
    const treffer = e.abruf === 'nie' ? [] : (this.letzteTreffer.get(conversationId) ?? []);
    if (treffer.length > 0) {
      out.push({ id: 'erinnerungen', title: 'Erinnerungen aus dem Exokortex', body: trefferText(treffer, e) });
    }
    return out;
  }

  /** ✕ an einer Erinnerung: gilt für diesen Chat, ab sofort und für spätere Abrufe. */
  ausblenden(conversationId: string, id: string): void {
    const weg = this.ausgeblendet.get(conversationId) ?? new Set<string>();
    const treffer = this.letzteTreffer.get(conversationId) ?? [];
    const dokument = treffer.find((t) => t.id === id)?.dokument;
    weg.add(id);
    if (dokument) weg.add(dokument);
    this.ausgeblendet.set(conversationId, weg);
    this.letzteTreffer.set(conversationId, treffer.filter((t) => !weg.has(t.id) && !weg.has(t.dokument)));
  }

  vergiss(conversationId: string): void {
    this.letzteBegriffe.delete(conversationId);
    this.letzteTreffer.delete(conversationId);
    this.gezeigt.delete(conversationId);
  }

  /**
   * Nach einer Antwort: Zettel nachführen, im Hintergrund. Pro Chat läuft
   * höchstens ein Aufruf; kommt währenddessen eine weitere Antwort, wird nur
   * die jüngste danach noch verarbeitet.
   */
  nachAntwort(
    conversationId: string,
    runde: { frage: string; antwort: string; von?: Target; verlauf: ConversationTurn[] },
  ): Promise<void> {
    const e = this.deps.einstellungen();
    if (!e.notizen) return Promise.resolve();
    const aufgabe = () => this.zettelNachfuehren(conversationId, runde);
    if (this.laufend.has(conversationId)) {
      this.wartend.set(conversationId, aufgabe);
      return this.laufend.get(conversationId)!;
    }
    const kette = (async () => {
      let naechste: (() => Promise<void>) | undefined = aufgabe;
      while (naechste) {
        this.wartend.delete(conversationId);
        try {
          await naechste();
        } catch (err) {
          this.deps.log?.(`[erinnerung] Notizzettel nicht aktualisiert: ${(err as Error).message}`);
        }
        naechste = this.wartend.get(conversationId);
      }
    })().finally(() => this.laufend.delete(conversationId));
    this.laufend.set(conversationId, kette);
    return kette;
  }

  private async zettelNachfuehren(
    conversationId: string,
    runde: { frage: string; antwort: string; von?: Target; verlauf: ConversationTurn[] },
  ): Promise<void> {
    const e = this.deps.einstellungen();
    const target = this.deps.helfer(e.helfer, runde.von);
    if (!target) return;
    const alt = this.deps.notizLesen(conversationId)?.trim();
    // Ein Chat ohne Zettel, der schon läuft, bekommt ihn aus dem ganzen
    // bisherigen Verlauf — sonst hätte ein alter Chat erst ab jetzt ein Gedächtnis.
    const bisher = runde.verlauf.slice(0, -2);
    const kontext = !alt && bisher.length > 0
      ? `Bisheriger Verlauf dieses Chats:\n${embedHistory(bisher, '(Ende des bisherigen Verlaufs)', ERSTAUFBAU_TOKENS)}\n\n`
      : `Alter Notizzettel:\n${alt || '(noch leer)'}\n\n`;
    const von = runde.von ? ` (${formatTarget(runde.von)})` : '';
    const prompt =
      `${e.promptNotizen}\n\n---\n\n${kontext}` +
      `Neueste Nachricht des Nutzers:\n${condenseTurn(runde.frage, 1500)}\n\n` +
      `Antwort des Assistenten${von}:\n${condenseTurn(runde.antwort, 3000)}\n\n---\n\nNeuer Notizzettel:`;
    const signal = AbortSignal.timeout(180_000);
    const text = await this.deps.fragen(target, prompt, signal);
    const zettel = text ? bereinigeZettel(text) : undefined;
    if (!zettel) return;
    this.deps.notizSchreiben(conversationId, schwaerze(zettel));

    if (this.deps.merken && istMerkwunsch(runde.frage)) {
      const eintrag = await this.deps.fragen(
        target,
        `${e.promptSpeichern}\n\n---\n\nNachricht:\n${condenseTurn(runde.frage, 1500)}\n\n` +
          `Kontext (Notizzettel):\n${zettel}\n\n---\n\nEintrag:`,
        AbortSignal.timeout(120_000),
      );
      if (eintrag?.trim()) this.deps.merken(schwaerze(eintrag.trim()));
    }
  }
}

// ── reine Hilfen ──────────────────────────────────────────────────────

const STOPPWOERTER = new Set(
  (
    'aber alle allem allen aller alles also auch auf aus bei beim bin bis bitte bist da dabei damit dann das dass dein deine dem den denn der des dessen dich die dies diese diesem diesen dieser dieses dir doch dort du durch ein eine einem einen einer eines einfach er es etwas euch euer für gibt gut hab habe haben hat hatte hatten hier ich ihr im immer in ist ja jetzt kann kannst kein keine können könnte mal man mehr mein meine mich mir mit muss müssen nach nicht nichts noch nun nur ob oder ohne schon sehr sein seine sich sie sind so soll sollte sondern über um und uns unser unsere unter vom von vor war waren was weil weiter welche welcher wenn wer werden wie wieder will wir wird wo wurde zu zum zur zwischen okay ähm äh also gerne genau eben ganz irgendwie eigentlich halt ' +
    'the and for are but not you your with this that have has from they will would there their what about which when make can like just into than then them these some could other only also how its our out use any may want need should does did done was were been being get got let yes please thanks'
  ).split(' '),
);

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
    const kennung = /[\/_.:-]|\d/.test(wort) || /[a-z][A-Z]/.test(wort);
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
  const kennung = begriffe.some((b) => /[\/_.:-]|\d/.test(b) || /[a-z][A-Z]/.test(b));
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

function bereinigeZettel(text: string): string | undefined {
  let t = text.trim().replace(/^```(?:markdown|md)?\s*\n/, '').replace(/\n```\s*$/, '').trim();
  const start = t.indexOf('## ');
  if (start > 0) t = t.slice(start);
  if (!t.includes('## ')) return undefined;
  return headWithinTokens(t, 900);
}

function trefferText(treffer: Treffer[], e: ErinnerungsEinstellungen): string {
  const kopf = `${e.promptEinbettung.trim()}\nGanze Fundstelle lesen: Exokortex-Werkzeug «dokument» mit der genannten id.\n`;
  const zeilen: string[] = [kopf];
  let budget = e.budget - estimateTokens(kopf);
  treffer.forEach((t, i) => {
    const quelle = [t.dokument_titel || t.titel, t.projekt?.replace(/^proj_/, ''), t.pfad].filter(Boolean).join(' · ');
    const stelle = (t.stelle ?? '')
      .replace(/\\?"/g, ' ')
      .replace(/[\[\]{}]/g, ' ')
      .replace(/\s*,\s*(?=\S)/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
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
  const auszug = (t.stelle ?? '')
    .replace(/\\?"/g, ' ')
    .replace(/[\[\]{}]/g, ' ')
    .replace(/\s*,\s*(?=\S)/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
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
