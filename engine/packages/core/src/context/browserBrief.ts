/**
 * Die Browser-Freigabe als Anweisung. Bei „nie“ laufen die Browser-Plugins
 * zusätzlich headless (vscode/src/plugins/browserPolicy.ts); bei „auf Ansage“
 * kann nur das Modell unterscheiden, ob der Nutzer es in diesem Auftrag verlangt.
 */
export function browserBrief(access: 'nie' | 'auf-ansage' | 'immer'): string {
  if (access === 'nie') return 'Never open a visible desktop browser, not even when asked; browser tools run headless.';
  if (access === 'auf-ansage') {
    return 'Open a visible desktop browser only when the user asks for it in this task; otherwise use headless browsing or APIs. Close what you open.';
  }
  return 'You may open a visible desktop browser when the task needs it. Close what you open and leave the user’s own windows alone.';
}
