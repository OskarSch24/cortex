import * as vscode from 'vscode';
import type { ChatViewProvider } from './panel/chatViewProvider.js';

/** Startbild in VS Code: Workbench-Leisten zu, der Chat auf, wiederhergestellte Editoren weg. */
export async function bootCortexShell(chat: ChatViewProvider): Promise<void> {
  // Appearance defaults belong to the bundled product, never overwrite user preferences on every boot.
  await vscode.commands.executeCommand('workbench.action.closePanel');
  await vscode.commands.executeCommand('workbench.action.closeSidebar');
  await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
  // Erst den Chat aufmachen, dann aufräumen: so ist die Fläche nie leer.
  // Umgekehrt blitzte zwischen Schließen und Öffnen der leere Editorbereich auf.
  chat.openAgentHome();
  await closeRestoredEditors();
}

/** Cortex' eigene Flächen bleiben stehen — sie sind ja das Ziel. */
function isCortexSurface(tab: vscode.Tab): boolean {
  const input = tab.input;
  return (
    input instanceof vscode.TabInputWebview &&
    (input.viewType.includes('kortex') || input.viewType.includes('cortex'))
  );
}

/**
 * Cortex startet auf einem leeren Chat, nicht auf dem, was zuletzt offen war.
 *
 * Die Workbench stellt ihre Editor-Tabs wieder her — wer einmal „mcp.json
 * bearbeiten" gedrückt hat, bekam die Datei danach bei *jedem* Start wieder
 * aufgeschlagen, in derselben Spalte, in der der Chat aufgeht. Das ist ein
 * Editor-Zustand, den niemand bewusst angelegt hat.
 *
 * Geschlossen wird nur, was nichts verliert: ein Tab mit ungesicherten
 * Änderungen bleibt stehen, statt beim Hochfahren nach einer Entscheidung zu
 * fragen.
 */
async function closeRestoredEditors(): Promise<void> {
  const clean = vscode.window.tabGroups.all
    .flatMap(group => group.tabs)
    .filter(tab => !tab.isDirty && !isCortexSurface(tab));
  if (clean.length === 0) return;
  try {
    await vscode.window.tabGroups.close(clean, true);
  } catch {
    // Ein Tab, der sich nicht schließen lässt, ist kein Grund, den Start abzubrechen.
  }
}

/**
 * View containers may live in the secondary side bar — the strip at the top
 * right — only from VS Code 1.106 on. Older builds would spill that copy of
 * the chat list into the Explorer, so hide it there and keep the activity bar.
 */
export function hideSecondarySidebarOnOldVSCode(): void {
  const [major = 0, minor = 0] = vscode.version.split('.').map(Number);
  if (major > 1 || (major === 1 && minor >= 106)) return;
  void vscode.commands.executeCommand('setContext', 'cortex.noSecondarySidebar', true);
}
