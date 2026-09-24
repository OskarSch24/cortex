import type { McpServerDef } from '@cortex/core';

/**
 * Was „Desktop-Browser für Agenten“ technisch bedeutet.
 *
 * Die Einstellung stand bis zum 13.09.2026 nur in der Einstellungsdatei und
 * wirkte allein darüber, dass ein Modell sie liest. Chrome DevTools und
 * Playwright öffneten trotzdem ein sichtbares Chrome. Bei „nie“ bekommen sie
 * deshalb im Profil ihren Headless-Schalter — der Agent kann weiter prüfen,
 * klicken und Screenshots machen, nur ohne Fenster.
 *
 * Seit dem 24.09.2026 gilt das auch für „auf-ansage“: ein Agent hatte für eine
 * Recherche trotzdem Chrome geöffnet. Recherche läuft im eingebauten Browser
 * (cortex_browser); nur „immer“ lässt die Plugins sichtbar starten. Headless
 * heißt auch: kein Andocken an das laufende Chrome des Nutzers (`--autoConnect`,
 * Playwrights `--extension`) — dessen Sitzung bleibt unangetastet.
 */
export type BrowserAccess = 'nie' | 'auf-ansage' | 'immer';

const BROWSER_SERVERS: Array<{ package: RegExp; headless: string; attach: string[] }> = [
  { package: /(^|\/)chrome-devtools-mcp(@[^/]*)?$/, headless: '--headless', attach: ['--autoConnect', '--auto-connect'] },
  { package: /^@playwright\/mcp(@[^/]*)?$/, headless: '--headless', attach: ['--extension'] },
];

export function isBrowserServer(def: McpServerDef): boolean {
  return !!def.command && (def.args ?? []).some((arg) => BROWSER_SERVERS.some((b) => b.package.test(arg)));
}

export function withBrowserPolicy(servers: Record<string, McpServerDef>, access: BrowserAccess): Record<string, McpServerDef> {
  if (access === 'immer') return servers;
  return Object.fromEntries(
    Object.entries(servers).map(([name, def]) => {
      const args = def.args ?? [];
      const browser = BROWSER_SERVERS.find((b) => args.some((arg) => b.package.test(arg)));
      if (!def.command || !browser) return [name, def];
      const kept = args.filter((arg) => !browser.attach.includes(arg));
      if (kept.length === args.length && args.includes(browser.headless)) return [name, def];
      return [name, { ...def, args: kept.includes(browser.headless) ? kept : [...kept, browser.headless] }];
    }),
  );
}

export function readBrowserAccess(value: unknown): BrowserAccess {
  return value === 'nie' || value === 'immer' ? value : 'auf-ansage';
}
