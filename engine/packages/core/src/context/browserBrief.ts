/**
 * Die Browser-Freigabe als Anweisung. Außer bei „immer“ laufen die
 * Browser-Plugins zusätzlich headless (vscode/src/plugins/browserPolicy.ts);
 * ob der Nutzer einen Desktop-Browser in diesem Auftrag verlangt, kann nur das
 * Modell unterscheiden. Mit `builtIn` hat der Agent den eingebauten Browser
 * (cortex_browser) und recherchiert dort.
 */
export function browserBrief(access: 'nie' | 'auf-ansage' | 'immer', builtIn = false): string {
  const research = builtIn
    ? 'Web research and anything you need to open, read or check in a browser: use the cortex_browser tools — Cortex\'s built-in browser, never Chrome or another desktop browser (not through playwright, chrome-devtools, `open` or a script); the user keeps working in their own browser meanwhile. ' +
      'Open one tab per source with browser_open — several at once for independent sources — then browser_read them (elements: true for clickable items), act with browser_click / browser_type, and use browser_screenshot when the look matters. ' +
      'Your tabs open in the background of Cortex; browser_show puts one in front when the user should see it. Close your tabs with browser_close when you are done, unless the user wants to keep them. '
    : '';
  if (access === 'nie') return `${research}Never open a visible desktop browser, not even when asked; browser tools run headless.`;
  if (access === 'auf-ansage') {
    return `${research}Open a visible desktop browser only when the user explicitly asks for their desktop browser in this task; otherwise use ${builtIn ? 'the built-in browser, ' : ''}headless browsing or APIs. Close what you open.`;
  }
  return `${research}You may open a visible desktop browser when the task needs it${builtIn ? ' and the built-in browser is not enough' : ''}. Close what you open and leave the user’s own windows alone.`;
}
