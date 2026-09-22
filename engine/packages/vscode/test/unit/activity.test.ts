import { describe, expect, it } from 'vitest';
import { currentActivity, describeStep } from '../../webview/components/activity.js';

describe('Arbeitsanzeige: was gerade geschieht', () => {
  it('benennt Exokortex, Web-Recherche und interne Dokumentation', () => {
    expect(describeStep({ name: 'mcp__exokortex__wz_suche', detail: 'Haushaltsbuch' })).toBe('Schaut im Exokortex nach · Haushaltsbuch');
    expect(describeStep({ name: 'WebSearch', detail: 'Bilanz Aktiva Passiva' })).toBe('Recherchiert im Web · „Bilanz Aktiva Passiva“');
    expect(describeStep({ name: 'WebFetch', action: 'fetch', detail: 'https://www.destatis.de/DE/Themen' })).toBe('Liest eine Webseite · destatis.de');
    expect(describeStep({ name: 'Read', action: 'read', path: 'docs/CORTEX_DESIGN.md' })).toBe('Liest interne Dokumentation · CORTEX_DESIGN.md');
    expect(describeStep({ name: 'Read', action: 'read', path: 'src/App.tsx' })).toBe('Liest App.tsx');
  });

  it('unterscheidet Befehle, Suchen, Änderungen, Plugins', () => {
    expect(describeStep({ name: 'Bash', action: 'run', detail: 'pnpm vitest run' })).toBe('Führt Tests aus');
    expect(describeStep({ name: 'Bash', action: 'run', detail: 'node esbuild.mjs' })).toBe('Baut das Projekt');
    expect(describeStep({ name: 'Grep', action: 'search', detail: 'Bilanz' })).toBe('Durchsucht das Projekt nach „Bilanz“');
    expect(describeStep({ name: 'Edit', action: 'edit', path: 'src/bilanz.ts' })).toBe('Bearbeitet bilanz.ts');
    expect(describeStep({ name: 'mcp__figma__get_screenshot' })).toBe('Nutzt Figma · Get Screenshot');
  });

  it('folgt dem letzten Abschnitt der laufenden Antwort', () => {
    expect(currentActivity(undefined, 'Schaut im Exokortex nach Erinnerungen')).toBe('Schaut im Exokortex nach Erinnerungen');
    expect(currentActivity([])).toBe('Denkt nach');
    expect(currentActivity([{ kind: 'text', text: 'Die Bilanz …' }])).toBe('Schreibt die Antwort');
    expect(currentActivity([{ kind: 'tools', steps: [{ name: 'Read', action: 'read', path: 'a.ts' }, { name: 'WebSearch', detail: 'x' }] }])).toBe('Recherchiert im Web · „x“');
    expect(currentActivity([{ kind: 'agents', lanes: [
      { id: '1', label: 'a', status: 'running' }, { id: '2', label: 'b', status: 'running' },
    ] } as never])).toBe('2 Hilfsagenten arbeiten parallel');
  });
});
