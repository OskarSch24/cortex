import { describe, expect, it, vi } from 'vitest';
import { bindDomain, combineHandlers } from '../../src/panel/host/dispatch.js';
import { rulesAnalyticsHandlers } from '../../src/panel/host/rulesAnalytics.js';
import { shellTable } from '../../src/panel/host/shell.js';
import { templateHandlers } from '../../src/panel/host/templateHandlers.js';
import { locationHandlers } from '../../src/panel/host/location.js';
import { remotionTable } from '../../src/panel/host/remotion.js';
import { exokortexTable } from '../../src/panel/host/exokortex.js';
import { connectorHandlers } from '../../src/panel/host/connectors.js';
import { pluginTable } from '../../src/panel/host/plugins/pluginHandlers.js';
import { settingsTable } from '../../src/panel/host/settings.js';
import { accountTable } from '../../src/panel/host/accounts.js';
import { fileTable } from '../../src/panel/host/files.js';
import { sidePaneTable } from '../../src/panel/host/sidePanes.js';
import { imageTable } from '../../src/panel/host/images.js';
import { projectTable } from '../../src/panel/host/projects.js';
import { canvasTable } from '../../src/panel/host/canvas.js';
import { historyTable } from '../../src/panel/host/computerHistory.js';
import { teamTable } from '../../src/panel/host/teams.js';
import { conversationTable } from '../../src/panel/host/conversations.js';
import { rewindTable } from '../../src/panel/host/rewind.js';
import { queueTable } from '../../src/panel/host/queue.js';

/** Jede Tabelle eines Bereichs unter host/ — eine Nachricht gehört genau einem. */
const domainTables: Array<[string, object]> = [
  ['rulesAnalytics', rulesAnalyticsHandlers],
  ['shell', shellTable],
  ['templates', templateHandlers],
  ['location', locationHandlers],
  ['remotion', remotionTable],
  ['exokortex', exokortexTable],
  ['connectors', connectorHandlers],
  ['plugins', pluginTable],
  ['settings', settingsTable],
  ['accounts', accountTable],
  ['files', fileTable],
  ['sidePanes', sidePaneTable],
  ['images', imageTable],
  ['projects', projectTable],
  ['canvas', canvasTable],
  ['computerHistory', historyTable],
  ['teams', teamTable],
  ['conversations', conversationTable],
  ['rewind', rewindTable],
  ['queue', queueTable],
];

describe('Weiche der Webview-Nachrichten', () => {
  it('ordnet jede Nachricht genau einem Bereich zu', () => {
    const owner = new Map<string, string>();
    for (const [domain, table] of domainTables) {
      for (const kind of Object.keys(table)) {
        expect(owner.get(kind), `${kind} in ${domain} und ${owner.get(kind)}`).toBeUndefined();
        owner.set(kind, domain);
      }
    }
  });

  it('meldet eine doppelte Nachricht, statt sie still zu überschreiben', () => {
    const a = { ready: () => 'a' }, b = { ready: () => 'b' };
    expect(() => combineHandlers(a, b)).toThrow('ready');
    expect(Object.keys(combineHandlers(a, { openRules: () => 'c' }))).toEqual(['ready', 'openRules']);
  });

  it('fragt den Bereich erst beim Aufruf, nicht beim Zusammenbau', () => {
    const domain = vi.fn(() => ({ name: 'Bereich' }));
    const table = bindDomain({ openRules: (_msg, _cx, d: { name: string }) => d.name }, domain);
    expect(domain).not.toHaveBeenCalled();
    expect(table.openRules({ kind: 'openRules' }, {} as never)).toBe('Bereich');
    expect(domain).toHaveBeenCalledOnce();
  });
});
