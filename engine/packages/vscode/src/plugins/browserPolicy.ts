import type { McpServerDef } from '@cortex/core';

/**
 * Was „Desktop-Browser für Agenten“ technisch bedeutet.
 *
 * Die Einstellung stand bis zum 13.09.2026 nur in der Einstellungsdatei und
 * wirkte allein darüber, dass ein Modell sie liest. Chrome DevTools und
 * Playwright öffneten trotzdem ein sichtbares Chrome. Bei „nie“ bekommen sie
 * deshalb im Profil ihren Headless-Schalter — der Agent kann weiter prüfen,
 * klicken und Screenshots machen, nur ohne Fenster.
 */
export type BrowserAccess = 'nie' | 'auf-ansage' | 'immer';

const BROWSER_SERVERS: Array<{ package: RegExp; headless: string }> = [
  { package: /(^|\/)chrome-devtools-mcp(@[^/]*)?$/, headless: '--headless' },
  { package: /^@playwright\/mcp(@[^/]*)?$/, headless: '--headless' },
];

export function isBrowserServer(def: McpServerDef): boolean {
  return !!def.command && (def.args ?? []).some((arg) => BROWSER_SERVERS.some((b) => b.package.test(arg)));
}

export function withBrowserPolicy(servers: Record<string, McpServerDef>, access: BrowserAccess): Record<string, McpServerDef> {
  if (access !== 'nie') return servers;
  return Object.fromEntries(
    Object.entries(servers).map(([name, def]) => {
      const args = def.args ?? [];
      const browser = BROWSER_SERVERS.find((b) => args.some((arg) => b.package.test(arg)));
      if (!def.command || !browser || args.includes(browser.headless)) return [name, def];
      return [name, { ...def, args: [...args, browser.headless] }];
    }),
  );
}

export function readBrowserAccess(value: unknown): BrowserAccess {
  return value === 'nie' || value === 'immer' ? value : 'auf-ansage';
}
