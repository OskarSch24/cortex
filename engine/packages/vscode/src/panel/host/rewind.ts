import * as vscode from 'vscode';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HostToWebview, WebviewToHost } from '../protocol.js';
import { composerText } from '../rewind.js';
import { planRevert, restoreRevertFile, revertFingerprint, safeRevertPath } from '../workspace.js';
import type { DomainTable, PanelHost } from './dispatch.js';

/**
 * Was Zurückgehen, Abzweigen und Rückgängigmachen vom Provider brauchen.
 * `rewindConversation` bleibt am Provider: Tests rufen es dort.
 */
export interface RewindHost extends PanelHost {
  rewindConversation(
    id: string,
    index: number,
    mode: 'rewind' | 'edit' | 'fork',
  ): Promise<{ id: string; echo: Extract<HostToWebview, { kind: 'userEcho' }> } | undefined>;
}

/** Legt den Text einer Nachricht wieder ins Eingabefeld des Chats. */
function seedComposer(host: RewindHost, id: string, echo: Extract<HostToWebview, { kind: 'userEcho' }>): void {
  host.toConversation(id, { kind: 'composerSeed', text: composerText(echo.text), attachments: echo.attachments }, { log: false });
}

/**
 * „Rückgängig machen“ an der Änderungskarte: die Dateien dieses Auftrags auf
 * den Stand davor. Nur was der Auftrag selbst geschrieben hat, und erst nach
 * Rückfrage — ein Klick darf keine Arbeit wegwerfen, die man nicht sieht.
 * Neu angelegte Dateien gehen in den Papierkorb, nicht ins Nichts.
 */
export async function revertTurn(host: RewindHost, conversationId: string | undefined, messageId: string, paths: string[]): Promise<void> {
  const rec = conversationId ? host.conversations.get(conversationId) : undefined;
  if (!rec || !conversationId) return;
  const notice = (text: string) => host.toConversation(conversationId, { kind: 'notice', text });
  if (host.isRunning(conversationId)) { notice('Rückgängig geht erst, wenn der Auftrag fertig ist.'); return; }
  const baseline = rec.baselines?.[messageId];
  if (!baseline) { notice('Für diesen Auftrag gibt es keinen gemerkten Stand — rückgängig machen geht nur in Git-Projekten und für die letzten Aufträge.'); return; }
  const root = await host.conversationCwd(conversationId);
  let plan: Awaited<ReturnType<typeof planRevert>>;
  try { plan = await planRevert(root, baseline, paths); }
  catch (error) { notice(`Der gespeicherte Stand ist nicht lesbar. Keine Datei wurde geändert: ${String(error)}`); return; }
  const count = plan.restore.length + plan.remove.length;
  if (!count) { notice('Keine der Dateien lässt sich zurücksetzen.'); return; }
  const detail = [
    plan.restore.length ? `${plan.restore.length} ${plan.restore.length === 1 ? 'Datei bekommt' : 'Dateien bekommen'} ihren alten Inhalt zurück.` : '',
    plan.remove.length ? `${plan.remove.length} neu angelegte ${plan.remove.length === 1 ? 'Datei geht' : 'Dateien gehen'} in den Papierkorb.` : '',
    plan.skipped.length ? `Unverändert bleiben: ${plan.skipped.join(', ')}` : '',
    plan.conflicts.length ? `Seit dem Auftrag verändert oder für ältere Aufträge nicht prüfbar: ${plan.conflicts.join(', ')}. Diese späteren Änderungen würden überschrieben.` : '',
  ].filter(Boolean).join('\n');
  const confirm = plan.conflicts.length ? 'Spätere Änderungen überschreiben' : 'Rückgängig machen';
  const choice = await vscode.window.showWarningMessage('Änderungen dieses Auftrags rückgängig machen?', { modal: true, detail }, confirm);
  if (choice !== confirm) return;
  if (host.isRunning(conversationId)) { notice('Inzwischen läuft wieder ein Auftrag. Keine Datei wurde geändert.'); return; }
  // Recheck after the dialog, before changing anything. A newer edit needs a new decision.
  for (const rel of [...plan.restore.map(file => file.path), ...plan.remove]) {
    try {
      if (await revertFingerprint(root, rel) !== plan.expected[rel]) throw new Error('Inhalt geändert');
    } catch { notice(`„${rel}“ wurde während der Rückfrage verändert. Keine Datei wurde geändert.`); return; }
  }
  let changed = 0;
  try {
  for (const file of plan.restore) {
    const target = await safeRevertPath(root, file.path);
    await mkdir(dirname(target), { recursive: true });
    await restoreRevertFile(root, file.path, file.content, plan.expected[file.path]!);
    changed++;
  }
  for (const rel of plan.remove) {
    if (await revertFingerprint(root, rel) !== plan.expected[rel]) throw new Error(`„${rel}“ wurde inzwischen geändert`);
    await vscode.workspace.fs.delete(vscode.Uri.file(await safeRevertPath(root, rel)), { useTrash: true });
    changed++;
  }
  } catch (error) { notice(`${changed} von ${count} Dateien zurückgesetzt. Angehalten: ${String(error)}`); return; }
  host.toConversation(conversationId, { kind: 'reverted', messageId });
  notice(`${count} ${count === 1 ? 'Datei' : 'Dateien'} auf den Stand vor dem Auftrag zurückgesetzt.`);
  host.persistSoon();
  for (const [webview, surface] of host.surfaces) {
    if (surface.conversationId === conversationId) void host.dispatch({ kind: 'getDiff' }, webview);
  }
}

const rewindOrFork = async (msg: Extract<WebviewToHost, { kind: 'rewindTo' | 'forkFrom' }>, conversationId: string | undefined, host: RewindHost) => {
  if (!conversationId) return;
  const done = await host.rewindConversation(conversationId, msg.index, msg.kind === 'forkFrom' ? 'fork' : 'rewind');
  if (done) seedComposer(host, done.id, done.echo);
};

/** Zurück vor eine Nachricht, eine Kopie ab dort, eine Nachricht neu senden, einen Auftrag rückgängig machen. */
export const rewindTable = {
  rewindTo: (msg, { surface }, host) => rewindOrFork(msg, surface.conversationId, host),
  forkFrom: (msg, { surface }, host) => rewindOrFork(msg, surface.conversationId, host),
  editMessage: async (msg, { webview, surface }, host) => {
    if (!surface.conversationId || !msg.send.text.trim()) return;
    const done = await host.rewindConversation(surface.conversationId, msg.index, 'edit');
    // Die Anhänge der ursprünglichen Nachricht gehen mit, solange die Bearbeitung keine eigenen nennt.
    if (done) await host.dispatch({ ...msg.send, attachments: msg.send.attachments?.length ? msg.send.attachments : done.echo.attachments }, webview);
  },
  revertTurn: async (msg, { surface }, host) => {
    await revertTurn(host, surface.conversationId, msg.messageId, msg.paths);
  },
} satisfies DomainTable<'rewindTo' | 'forkFrom' | 'editMessage' | 'revertTurn', RewindHost>;
