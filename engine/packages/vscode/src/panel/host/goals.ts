import * as vscode from 'vscode';
import {
  afterGoalRound,
  expandSlashCommands,
  goalContinuation,
  goalNotice,
  goalSections,
  goalSummary,
  parseMention,
  pauseGoal,
  resumeGoal,
  shortId,
  startGoal,
  type BriefSection,
  type GoalRound,
} from '@cortex/core';
import type { MessageQueue, QueuedMessage } from '../messageQueue.js';
import type { ConversationRecord } from '../panelTypes.js';
import type { DomainTable, PanelHost } from './dispatch.js';

type StoredGoal = NonNullable<ConversationRecord['goal']>;

export interface GoalPanelHost extends PanelHost {
  readonly queues: MessageQueue;
  readonly tasks: Map<string, AbortController>;
  /** Holt den Chat nach vorn — für den Knopf der Benachrichtigung. */
  showConversation(id: string): void;
  /** Ist der Chat gerade zu sehen? Dann braucht es keine Benachrichtigung. */
  conversationVisible(id: string): boolean;
}

/**
 * `/goal` im Host: wann die nächste Runde losgeht, was Stopp, Fehler und
 * Neustart mit einem Ziel machen und was die Ziel-Leiste zeigt. Was eine
 * Runde bedeutet, entscheidet der Kern (goal/goal.ts).
 *
 * Die Runden laufen durch die gewöhnliche Warteschlange: sie warten auf den
 * Projektordner wie jede Nachricht, und was der Nutzer dazwischen schreibt,
 * kommt vor der nächsten Runde dran.
 */
export class GoalHost {
  constructor(private readonly host: GoalPanelHost) {}

  private goal(id: string): StoredGoal | undefined {
    return this.host.conversations.get(id)?.goal;
  }

  private set(id: string, goal: StoredGoal | undefined): void {
    const rec = this.host.conversations.get(id);
    if (!rec) return;
    const before = rec.goal;
    rec.goal = goal;
    this.push(id);
    this.host.persistSoon();
    if (goal && before?.id === goal.id && before.status !== goal.status) this.announce(id, goal);
  }

  /** Das Ziel, an dem gerade gearbeitet wird — nur seine Kennung. */
  activeId(id: string): string | undefined {
    const goal = this.goal(id);
    return goal?.status === 'active' ? goal.id : undefined;
  }

  /** Die Aufgabe des laufenden Ziels, so wie der Nutzer sie schrieb — für Brief-Weichen wie `/remotion`. */
  objective(id: string): string | undefined {
    const goal = this.goal(id);
    return goal?.status === 'active' ? goal.objective : undefined;
  }

  /** Was das Modell über das laufende Ziel wissen muss. */
  sections(id: string): BriefSection[] {
    const goal = this.goal(id);
    if (goal?.status !== 'active') return [];
    return goalSections(goal, expandSlashCommands(goal.objective, this.host.rules.getCustomCommands()));
  }

  /**
   * Ein neues Ziel — es ersetzt ein altes. Die Runden laufen mit den
   * Einstellungen dieser Nachricht (Modell, Denkstufe, Rechte); Anhänge
   * gehören nur zu ihr. Zurück kommt die Markierung der ersten Runde.
   */
  begin(id: string, objective: string, tags: string[], modes: QueuedMessage['modes']): NonNullable<QueuedMessage['goal']> {
    const { attachments: _attachments, image: _image, imageProvider: _provider, ...kept } = modes;
    const { mention, cleaned } = parseMention(objective);
    const shown = cleaned.trim() || objective.trim();
    const goal: StoredGoal = {
      ...startGoal(shortId(), shown, Date.now()), modes: kept, tags: [...tags],
      // Wer die erste Runde an ein Modell richtet, meint alle Runden.
      ...(mention ? { mention: `@${mention.provider}${mention.account ? `:${mention.account}` : ''}${mention.model ? `/${mention.model}` : ''}` } : {}),
    };
    // Eine schon geschickte Runde des alten Ziels zählt nicht für das neue.
    for (const item of this.host.queues.items(id)) if (item.goal?.auto) this.host.queues.remove(id, item.id);
    this.set(id, goal);
    if (modes.permissionMode === 'safe') {
      this.host.toConversation(id, { kind: 'notice', text: 'Die Berechtigung steht auf „Plan“ — so kann das Ziel nichts ändern. Für echte Arbeit unten „Änderungen automatisch akzeptieren“ wählen.' });
    }
    return { id: goal.id, round: 1, auto: false };
  }

  /** `/goal`, `/goal pause|weiter|aus` und die Knöpfe der Leiste. */
  control(id: string, action: 'status' | 'pause' | 'resume' | 'clear'): void {
    const goal = this.goal(id);
    const say = (text: string) => this.host.toConversation(id, { kind: 'notice', text });
    if (action === 'status' || !goal) { say(goalSummary(goal)); this.push(id); return; }
    if (action === 'clear') {
      this.set(id, undefined);
      // Eine schon geschickte Runde nimmt das Ziel nicht mehr mit.
      for (const item of this.host.queues.items(id)) if (item.goal?.auto) this.host.queues.remove(id, item.id);
      // Ein erreichtes Ziel wegzuklicken ist Aufräumen, kein Abbruch.
      if (goal.status !== 'done') say('Ziel beendet.');
      return;
    }
    if (action === 'pause') {
      if (goal.status !== 'active' && goal.status !== 'blocked') { say(goalSummary(goal)); return; }
      for (const item of this.host.queues.items(id)) if (item.goal?.auto) this.host.queues.remove(id, item.id);
      this.set(id, pauseGoal(goal, 'user'));
      return;
    }
    if (goal.status === 'active') { say(goalSummary(goal)); this.kick(id); return; }
    this.set(id, resumeGoal(goal));
    say('Ziel wird fortgesetzt.');
    // Nach einem Fehler oder Stopp hält auch die Warteschlange an — weiter heißt beides.
    if (this.host.queues.isPaused(id)) this.host.queues.resume(id);
    this.kick(id);
  }

  /** Eine Nachricht des Nutzers: ein Ziel, das auf ihn wartet, geht mit ihr weiter. */
  userMessage(id: string): void {
    const goal = this.goal(id);
    if (goal?.status === 'blocked') this.set(id, resumeGoal(goal));
  }

  /** Stopp gedrückt: das Ziel hält an, bis der Nutzer es fortsetzt. */
  stopped(id: string): void {
    const goal = this.goal(id);
    if (goal?.status !== 'active') return;
    for (const item of this.host.queues.items(id)) if (item.goal?.auto) this.host.queues.remove(id, item.id);
    this.set(id, pauseGoal(goal, 'stopped'));
  }

  /**
   * Nach jedem Lauf: die Runde verbuchen, wenn der Lauf zum Ziel gehörte, und —
   * läuft das Ziel weiter — die nächste schicken. `goalId` ist das Ziel, das
   * beim Start des Laufs aktiv war.
   */
  afterRun(id: string, goalId: string | undefined, round: GoalRound | undefined): void {
    const goal = this.goal(id);
    if (goal && goalId === goal.id && round) {
      // Angehalten, während die Runde lief: die Arbeit zählt, der Zustand bleibt, wie der Nutzer ihn wollte.
      this.set(id, goal.status === 'active'
        ? afterGoalRound(goal, round).goal
        : { ...goal, rounds: goal.rounds + 1, workMs: goal.workMs + Math.max(0, round.durationMs) });
    }
    this.kick(id);
  }

  /** Die nächste Runde — wenn das Ziel läuft und sonst nichts ansteht. */
  kick(id: string): void {
    const goal = this.goal(id);
    if (goal?.status !== 'active') return;
    if (this.host.tasks.has(id) || this.host.queues.isPaused(id) || this.host.queues.items(id).length) return;
    this.host.queues.enqueue(id, {
      id: shortId(),
      text: goal.mention ? `${goal.mention} ${goalContinuation(goal)}` : goalContinuation(goal),
      tags: [...goal.tags],
      modes: { ...goal.modes, ...(goal.modes.target ? { target: { ...goal.modes.target } } : {}) },
      goal: { id: goal.id, round: goal.rounds + 1, auto: true },
    });
  }

  /** Den Stand an die Fläche des Chats — auch beim Öffnen eines Chats. */
  push(id: string): void {
    const goal = this.goal(id);
    this.host.toConversation(id, { kind: 'goal', conversationId: id, ...(goal ? { goal } : {}) }, { log: false });
  }

  /** Erreicht, wartet, angehalten: eine Zeile im Chat — und eine Nachricht, wenn der Chat nicht zu sehen ist. */
  private announce(id: string, goal: StoredGoal): void {
    const text = goalNotice(goal);
    if (!text) return;
    this.host.toConversation(id, { kind: 'notice', text });
    // Selbst angehalten braucht keine Nachricht; alles andere passiert, während man woanders ist.
    if (this.host.conversationVisible(id) || (goal.status === 'paused' && (goal.pause === 'user' || goal.pause === 'stopped'))) return;
    const title = this.host.conversations.get(id)?.title || goal.objective;
    const open = 'Chat öffnen';
    void vscode.window.showInformationMessage(`Cortex · ${title.slice(0, 60)}: ${text}`, open).then(choice => {
      if (choice === open) this.host.showConversation(id);
    });
  }
}

/** Nach dem Neustart: ein Ziel, das lief, wartet, bis der Nutzer es fortsetzt. */
export function restoredGoal(rec: ConversationRecord): void {
  if (rec.goal?.status === 'active') rec.goal = pauseGoal(rec.goal, 'restart');
}

/** Automatische Runden gehen nicht über einen Neustart: „Weiter“ schickt eine frische. */
export function withoutGoalRounds(items: QueuedMessage[]): QueuedMessage[] {
  return Array.isArray(items) ? items.filter(item => !item?.goal?.auto) : items;
}

export const goalTable = {
  goalAction: (msg, { surface }, goals) => {
    if (surface.conversationId) goals.control(surface.conversationId, msg.action);
  },
} satisfies DomainTable<'goalAction', GoalHost>;
