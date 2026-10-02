import { describe, expect, it } from 'vitest';
import { agentBrowser, liveContents, releaseLayout, type AgentBrowserHost, type AgentTab } from './agentBrowser.js';

// Electron leert view.webContents, sobald die Seite zerstört ist (contents: undefined).
const page = (url: string, title: string, destroyed = false) => ({ isDestroyed: () => destroyed, getURL: () => url, getTitle: () => title });
const tab = (id: string, contents: object | undefined, owner?: string) => ({ id, view: { webContents: contents }, loading: false, error: '', owner }) as unknown as AgentTab;
const host = (...tabs: AgentTab[]): AgentBrowserHost => ({
  tabs: new Map(tabs.map(entry => [entry.id, entry])), shown: () => false, close: () => {}, show: () => {}, validUrl: url => url,
  create: () => { throw new Error('not needed'); },
});

describe('agent browser tabs whose page is gone', () => {
  it('only hands out pages that still live', () => {
    const live = page('https://example.org/', 'Beispiel');
    expect(liveContents(tab('a', live))).toBe(live);
    expect(liveContents(tab('b', page('https://example.org/', 'Beispiel', true)))).toBeUndefined();
    expect(liveContents(tab('c', undefined))).toBeUndefined();
  });
  it('lists and addresses only live tabs instead of failing on an emptied view', async () => {
    const browser = host(tab('live', page('https://example.org/', 'Beispiel'), 'chat'), tab('gone', undefined, 'chat'));
    const list = await agentBrowser(browser, 'chat', { tool: 'browser_tabs' });
    expect(list.error).toBeUndefined();
    expect(list.text).toContain('live · Beispiel');
    expect(list.text).not.toContain('gone');
    const read = await agentBrowser(browser, 'chat', { tool: 'browser_read', args: { tabId: 'gone' } });
    expect(read.error).toContain('Tab gone gibt es nicht');
  });
  it('releases the layout of a closed tab without throwing', () => {
    const gone = tab('gone', undefined);
    gone.emulated = true;
    expect(() => releaseLayout(gone)).not.toThrow();
    expect(gone.emulated).toBe(false);
  });
});
