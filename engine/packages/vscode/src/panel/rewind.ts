import type { HostToWebview, TurnCheckpoint } from './protocol.js';

/**
 * Zurück zu einer früheren Nachricht — rein rechnerisch, ohne VS Code.
 *
 * Ein Chat besteht aus zwei Spuren: dem Protokoll, aus dem die Oberfläche den
 * Verlauf zeichnet, und den Wortwechseln, aus denen ein Modell ohne eigene
 * Sitzung seinen Kontext bekommt. Beide werden an derselben Stelle gekappt —
 * vor der gewählten Nachricht —, sonst sähe der Nutzer einen anderen Chat als
 * das Modell.
 */

type Echo = Extract<HostToWebview, { kind: 'userEcho' }>;
type Done = Extract<HostToWebview, { kind: 'done' }>;

export interface RewindPlan {
  /** Das Protokoll bis vor die Nachricht. */
  log: HostToWebview[];
  /** Die Wortwechsel, die dazu gehören. */
  turns: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** Die Nachricht selbst — ihr Text geht zurück ins Eingabefeld. */
  echo: Echo;
  /** Wie viele deiner Nachrichten danach wegfallen, sie eingeschlossen. */
  dropped: number;
  /** Die letzte Antwort davor, an deren Stelle die Anbietersitzung abzweigen kann. */
  checkpoint?: TurnCheckpoint;
}

/** Die `index`-te deiner Nachrichten, in der Reihenfolge des Verlaufs — wie die Oberfläche sie zählt. */
export function rewindPlan(
  log: HostToWebview[],
  turns: Array<{ role: 'user' | 'assistant'; text: string }>,
  index: number,
): RewindPlan | undefined {
  const echoes = log.flatMap((msg, at) => (msg.kind === 'userEcho' ? [at] : []));
  const cut = echoes[index];
  if (cut === undefined) return undefined;
  const kept = log.slice(0, cut);
  const answered = answeredTurns(kept);
  return {
    log: kept,
    turns: turns.slice(0, Math.min(turns.length, answered * 2)),
    echo: log[cut] as Echo,
    dropped: echoes.length - index,
    checkpoint: latestCheckpoint(kept),
  };
}

/**
 * Die Stelle, an der die letzte Antwort eines Protokolls in ihrer Sitzung
 * endete. Hat die letzte Antwort keine — ein Anbieter ohne Abzweigen —, gibt es
 * keine: eine ältere Stelle wüsste von dieser Antwort nichts.
 */
export function latestCheckpoint(log: HostToWebview[]): TurnCheckpoint | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const msg = log[i]!;
    if (msg.kind !== 'done') continue;
    if (msg.checkpoint) return msg.checkpoint;
    if (msg.turn) return undefined;
  }
  return undefined;
}

/**
 * Wie viele Wortwechsel das gekürzte Protokoll beantwortet hat. Jede fertige
 * Antwort eines Auftrags legt genau ein Paar in `turns` ab und trägt `turn`;
 * ältere Einträge kennen die Markierung nicht, dort zählt jede Antwort, die
 * nicht bloß eine lokale Bildgrößenänderung war (die meldet 0 ms und keine Kosten).
 */
function answeredTurns(kept: HostToWebview[]): number {
  return kept.filter((msg): msg is Done => msg.kind === 'done' && (msg.turn ?? !(msg.durationMs === 0 && msg.costUsd === undefined))).length;
}

/** Die Nachricht ohne die angehängte Dateiliste — so, wie sie im Eingabefeld stand. */
export function composerText(text: string): string {
  return text.replace(/\n\nAttached files:\n(?:- .*(?:\n|$))+$/, '').trim();
}
