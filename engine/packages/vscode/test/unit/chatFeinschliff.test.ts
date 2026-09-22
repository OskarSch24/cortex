import { describe, expect, it } from 'vitest';
// Die Webview-Module holen beim Laden die VS-Code-Brücke; im Test gibt es keine.
(globalThis as Record<string, unknown>).acquireVsCodeApi = () => ({ postMessage() {}, getState() {}, setState() {} });
const { describeCommand } = await import('../../webview/components/chat.js');
const { activityVerbosity } = await import('../../webview/settings/store.js');
import { validNativeSetting } from '../../src/panel/nativeSettings.js';
const { umlaute } = await import('../../webview/components/widgets/arbeit.js');
import { sourceKind } from '../../webview/components/sourceIcons.js';
import { trefferFuerAnzeige } from '../../src/memory/erinnerung.js';

describe('Chat-Feinschliff', () => {
  it('validates persisted activity detail levels and defaults to compact', () => {
    for (const value of ['minimal', 'compact', 'detailed']) {
      expect(validNativeSetting('cortex.activityVerbosity', value)).toBe(true);
      expect(activityVerbosity(value)).toBe(value);
    }
    expect(validNativeSetting('cortex.activityVerbosity', 'everything')).toBe(false);
    expect(activityVerbosity(undefined)).toBe('compact');
  });
  it('beschreibt Befehle als Satz mit Ort', () => {
    expect(describeCommand(`cd "/Users/x/Nordwind Studio/Nordwind Engine" && python3 - <<'PY'`)).toEqual({ was: 'Python-Skript ausgeführt', wo: 'Nordwind Engine' });
    expect(describeCommand('npx vitest run test/unit').was).toBe('Tests ausgeführt');
    expect(describeCommand('python3 -m pytest tests').was).toBe('Tests ausgeführt');
    expect(describeCommand('python -m unittest').was).toBe('Tests ausgeführt');
    expect(describeCommand('FOO=1 grep -rn x src').was).toBe('Im Code gesucht');
    expect(describeCommand('xcrun simctl list').was).toBe('Befehl „xcrun“ ausgeführt');
  });

  it('schreibt Umlaute, wo es welche sind', () => {
    expect(umlaute('social_kanaele')).toBe('social_kanäle');
    expect(umlaute('eigen_beitraege_hoehe_uebersicht')).toBe('eigen_beiträge_höhe_übersicht');
    expect(umlaute('aktuell_neue_queue_dauer')).toBe('aktuell_neue_queue_dauer');
  });

  it('wählt das Quellen-Symbol', () => {
    expect(sourceKind('chat')).toBe('chat');
    expect(sourceKind('dokument', 'Nordwind Studio · plan.pdf')).toBe('pdf');
    expect(sourceKind('dokument', 'Nordwind · export.csv')).toBe('tabelle');
    expect(sourceKind('dokument', 'Nordwind · Ernte.md')).toBe('dokument');
  });

  it('bereitet einen Treffer für die Anzeige auf', () => {
    const t = trefferFuerAnzeige({ id: 'c1', dokument: 'd', dokument_titel: '@claude:Business/claude-opus-5 Kannst du', projekt: 'proj_nordwind', pfad: 'Documentation/Nordwind_Ernte_Workflows_2026-08-19.md', wert: 30, stelle: '["Instagram","«apidojo»"]' });
    expect(t).toMatchObject({ titel: 'Kannst du', quelle: 'dokument', ort: 'Nordwind Studio · Nordwind_Ernte_Workflows_2026-08-19.md', datum: '19.8.2026', passung: 'sehr' });
    expect(t.auszug).not.toContain('"');
  });
});
