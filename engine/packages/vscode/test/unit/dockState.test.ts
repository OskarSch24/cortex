import { describe, expect, it } from 'vitest';
import { focusOrAddTab, newTab, tabLabel, type DockState } from '../../webview/components/dock/state.js';

const dock = (tabs = [newTab('files', 'src/a.ts')]): DockState => ({ tabs, activeId: tabs[0]?.id, width: 620, fullscreen: false, tree: true });

describe('Dock-Reiter', () => {
  it('legt einen fehlenden Reiter an und macht ihn aktiv', () => {
    const before = dock();
    const after = focusOrAddTab(before, 'canvas');
    expect(after.tabs).toHaveLength(2);
    expect(after.tabs[1]!.kind).toBe('canvas');
    expect(after.activeId).toBe(after.tabs[1]!.id);
    expect(before.tabs).toHaveLength(1);
  });

  it('holt einen vorhandenen Reiter nach vorn statt einen zweiten zu öffnen', () => {
    const canvas = newTab('canvas');
    const before = dock([newTab('files'), canvas]);
    const after = focusOrAddTab(before, 'canvas');
    expect(after.tabs).toBe(before.tabs);
    expect(after.activeId).toBe(canvas.id);
  });

  it('legt den Zusatz auf den Reiter, neu wie vorhanden', () => {
    const added = focusOrAddTab(dock(), 'agents', { agentId: 'a1' });
    expect(added.tabs[1]).toMatchObject({ kind: 'agents', agentId: 'a1' });
    const again = focusOrAddTab(added, 'agents', { agentId: undefined });
    expect(again.tabs).toHaveLength(2);
    expect(again.tabs[1]!.agentId).toBeUndefined();
    expect(again.tabs[1]!.id).toBe(added.tabs[1]!.id);
    expect(again.activeId).toBe(added.tabs[1]!.id);
  });

  it('beschriftet gleichnamige Dateien mit ihrem Ordner', () => {
    const a = newTab('files', 'src/index.ts');
    const b = newTab('files', 'test/index.ts');
    expect(tabLabel([a], a)).toBe('index.ts');
    expect(tabLabel([a, b], b)).toBe('test/index.ts');
    expect(tabLabel([a], newTab('changes'))).toBe('Änderungen');
  });
});
