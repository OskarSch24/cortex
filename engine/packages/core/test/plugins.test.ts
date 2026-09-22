import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  parseCatalog,
  searchCatalog,
  type PluginEntry,
} from '../src/plugins/catalog.js';
import {
  pluginState,
  pluginStates,
  unlistedServers,
  withServer,
  withoutServer,
} from '../src/plugins/installed.js';
import { readSkills } from '../src/plugins/skills.js';

const entry = (over: Partial<PluginEntry> = {}): PluginEntry => ({
  id: 'figma',
  name: 'Figma',
  tagline: 'Figma design-to-code workflows',
  description: 'Lang.',
  category: 'kreativitaet',
  developer: 'Figma',
  server: 'figma',
  definition: { url: 'https://mcp.figma.com/mcp' },
  prompts: [],
  ...over,
});

const catalogText = (entries: unknown[]) => JSON.stringify({ entries });

describe('Plugin-Katalog', () => {
  it('liest einen vollständigen Eintrag', () => {
    const result = parseCatalog(
      catalogText([
        {
          id: 'figma',
          name: 'Figma',
          tagline: 'Figma design-to-code workflows',
          description: 'Lang.',
          category: 'kreativitaet',
          developer: 'Figma',
          server: 'figma',
          definition: { url: 'https://mcp.figma.com/mcp', providers: ['claude', 'codex'] },
          prompts: ['a', 'b', 'c', 'd'],
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [first] = result.catalog.entries;
    expect(first?.name).toBe('Figma');
    expect(first?.definition.providers).toEqual(['claude', 'codex']);
    // Das Banner zeigt drei Beispiele — mehr wären nie sichtbar.
    expect(first?.prompts).toHaveLength(3);
  });

  it('überspringt unvollständige Einträge, statt die Datei zu verwerfen', () => {
    const result = parseCatalog(
      catalogText([
        { id: 'kaputt', name: 'Kaputt' },
        {
          id: 'gut',
          name: 'Gut',
          tagline: 'x',
          description: 'y',
          category: 'daten',
          developer: 'z',
          server: 'gut',
          definition: { command: 'npx' },
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.entries.map((e) => e.id)).toEqual(['gut']);
    expect(result.skipped).toEqual(['kaputt']);
  });

  it('verwirft einen Eintrag ohne echten Server', () => {
    const result = parseCatalog(
      catalogText([
        {
          id: 'leer',
          name: 'Leer',
          tagline: 'x',
          description: 'y',
          category: 'daten',
          developer: 'z',
          server: 'leer',
          definition: { args: ['--nur-argumente'] },
        },
      ]),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.catalog.entries).toHaveLength(0);
    expect(result.skipped).toEqual(['leer']);
  });

  it('meldet eine unlesbare Datei als Fehler', () => {
    expect(parseCatalog('{nicht json').ok).toBe(false);
    expect(parseCatalog('{}').ok).toBe(false);
  });

  it('sucht ohne Umlaut- und Groß-/Kleinschreibungsfallen', () => {
    const entries = [
      entry(),
      entry({
        id: 'x',
        name: 'Produktivität',
        tagline: 'Aufgaben ordnen',
        developer: 'Jemand',
        category: 'produktivitaet',
      }),
    ];
    expect(searchCatalog(entries, 'FIGMA').map((e) => e.id)).toEqual(['figma']);
    expect(searchCatalog(entries, 'produktivitat').map((e) => e.id)).toEqual(['x']);
    // Auch über die Kategorie, nicht nur über den Namen.
    expect(searchCatalog(entries, CATEGORY_LABEL.kreativitaet).map((e) => e.id)).toEqual(['figma']);
    expect(searchCatalog(entries, '  ')).toHaveLength(2);
  });
});

describe('Plugin-Zustand', () => {
  it('installiert heißt: steht in mcp.json', () => {
    const state = pluginState(entry(), { figma: { url: 'https://x' } }, new Set());
    expect(state.installed).toBe(true);
    expect(pluginState(entry(), {}, new Set()).installed).toBe(false);
  });

  it('zählt nur Skills, die es wirklich gibt', () => {
    const withSkills = entry({ skills: ['figma-use', 'figma-erfunden'] });
    const state = pluginState(withSkills, {}, new Set(['figma-use']));
    expect(state.skills).toEqual(['figma-use']);
  });

  it('meldet einen fehlenden Schlüssel — und nur, wenn er wirklich fehlt', () => {
    const needsKey = entry({
      requires: { kind: 'secret', env: 'EXA_API_KEY', hint: 'Schlüssel eintragen' },
    });
    const servers = { figma: { command: 'npx', env: {} } };
    expect(pluginState(needsKey, servers, new Set()).needsSecret).toBe(true);
    expect(
      pluginState(needsKey, { figma: { command: 'npx', env: { EXA_API_KEY: 'abc' } } }, new Set())
        .needsSecret,
    ).toBe(false);
    // Auch aus der Umgebung darf er kommen.
    expect(pluginState(needsKey, servers, new Set(), { EXA_API_KEY: 'abc' }).needsSecret).toBe(false);
    // Nicht installiert heißt: keine Behauptung über den Schlüssel.
    expect(pluginState(needsKey, {}, new Set()).needsSecret).toBe(false);
  });

  it('behauptet nichts über eine Anmeldung, die der Anbieter-Client verwaltet', () => {
    const oauth = entry({ requires: { kind: 'oauth', hint: 'Beim Anbieter anmelden' } });
    const state = pluginState(oauth, { figma: { url: 'https://x' } }, new Set());
    expect(state.authUnverifiable).toBe(true);
    expect(state.needsSecret).toBe(false);
  });

  it('führt selbst geschriebene Server als nicht gelistet', () => {
    const servers = { figma: { url: 'https://x' }, eigener: { command: 'node' } };
    expect(unlistedServers([entry()], servers).map((s) => s.name)).toEqual(['eigener']);
  });

  it('liefert je Eintrag einen Zustand', () => {
    const states = pluginStates([entry(), entry({ id: 'zwei', server: 'zwei' })], { zwei: { command: 'x' } }, new Set());
    expect(states.get('figma')?.installed).toBe(false);
    expect(states.get('zwei')?.installed).toBe(true);
  });
});

describe('mcp.json schreiben', () => {
  const original = `{
  "_help": "Bitte stehen lassen.",
  "servers": {
    "eigener": { "command": "node", "args": ["server.js"] }
  }
}
`;

  it('ergänzt einen Server und lässt alles andere in Ruhe', () => {
    const next = withServer(original, 'figma', { url: 'https://mcp.figma.com/mcp' });
    const doc = JSON.parse(next);
    expect(doc._help).toBe('Bitte stehen lassen.');
    expect(doc.servers.eigener.args).toEqual(['server.js']);
    expect(doc.servers.figma).toEqual({ url: 'https://mcp.figma.com/mcp' });
  });

  it('schreibt keine leeren Felder', () => {
    const next = withServer(original, 'x', { command: 'npx', args: [], env: {}, url: undefined });
    expect(JSON.parse(next).servers.x).toEqual({ command: 'npx' });
  });

  it('entfernt nur den genannten Server', () => {
    const doc = JSON.parse(withoutServer(withServer(original, 'figma', { url: 'https://x' }), 'figma'));
    expect(doc.servers.figma).toBeUndefined();
    expect(doc.servers.eigener).toBeDefined();
  });

  it('legt eine leere Datei sinnvoll an', () => {
    expect(JSON.parse(withServer('', 'figma', { url: 'https://x' })).servers.figma).toBeDefined();
  });
});

describe('Skills auf der Platte', () => {
  it('zählt nur Ordner mit SKILL.md', () => {
    const root = mkdtempSync(join(tmpdir(), 'cortex-skills-'));
    mkdirSync(join(root, 'echt'));
    writeFileSync(join(root, 'echt', 'SKILL.md'), '# echt');
    mkdirSync(join(root, 'ablage'));
    const found = readSkills([root, join(root, 'gibt-es-nicht')]);
    expect([...found]).toEqual(['echt']);
  });
});

describe('Programmvoraussetzung (requires.kind = app)', async () => {
  const { parseCatalog } = await import('../src/plugins/catalog.js');
  const { pluginState } = await import('../src/plugins/installed.js');
  const parsed = parseCatalog(JSON.stringify({ entries: [{
    id: 'xcode', name: 'Xcode', tagline: 't', description: 'd', category: 'entwicklertools', developer: 'Apple',
    server: 'xcode', definition: { command: 'xcrun', args: ['mcpbridge'] },
    requires: { kind: 'app', check: 'xcode', hint: 'Xcode starten.' },
  }] }));
  it('liest die Prüfung aus dem Katalog', () => {
    expect(parsed.ok && parsed.catalog.entries[0]!.requires).toEqual({ kind: 'app', check: 'xcode', hint: 'Xcode starten.', env: undefined, url: undefined });
  });
  it('behauptet nur, was der Host geprüft hat', () => {
    const entry = parsed.ok ? parsed.catalog.entries[0]! : undefined!;
    const servers = { xcode: { command: 'xcrun', args: ['mcpbridge'] } };
    expect(pluginState(entry, servers, new Set()).needsApp).toBe(false);
    expect(pluginState(entry, servers, new Set(), {}, { xcode: { ok: false, detail: 'fehlt' } })).toMatchObject({ needsApp: true, appDetail: 'fehlt' });
    expect(pluginState(entry, {}, new Set(), {}, { xcode: { ok: false, detail: 'fehlt' } }).needsApp).toBe(false);
    expect(pluginState(entry, servers, new Set(), {}, { xcode: { ok: true, detail: 'bereit' } }).needsApp).toBe(false);
  });
});

describe('probe: tools listed is not the same as tools usable', () => {
  it('reports a server that refuses its first call (Xcode without approval)', async () => {
    const { probeServer } = await import('../src/mcp/probe.js');
    const server = `
      const rl = require('readline').createInterface({ input: process.stdin });
      const out = (m) => process.stdout.write(JSON.stringify(m) + '\\n');
      rl.on('line', (line) => {
        const m = JSON.parse(line);
        if (m.method === 'initialize') out({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'fake-xcode' } } });
        if (m.method === 'tools/list') out({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'XcodeListWorkspaces' }] } });
        if (m.method === 'tools/call') out({ jsonrpc: '2.0', id: m.id, result: { isError: true, content: [{ type: 'text', text: "This agent isn't approved to use Xcode's tools yet." }] } });
      });`;
    const readiness = { tool: 'XcodeListWorkspaces', blocked: /isn.t approved/i, notice: 'Freigabe in Xcode offen' };
    const blocked = await probeServer({ command: process.execPath, args: ['-e', server] }, { timeoutMs: 10_000, readiness });
    expect(blocked).toMatchObject({ ok: true, notice: 'Freigabe in Xcode offen' });
    const open = await probeServer({ command: process.execPath, args: ['-e', server.replace("isn't approved", 'fine')] }, { timeoutMs: 10_000, readiness });
    expect(open.ok && open.notice).toBeFalsy();
  });
});
