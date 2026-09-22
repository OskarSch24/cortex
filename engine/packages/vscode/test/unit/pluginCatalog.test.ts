import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCatalog } from '../../../core/src/plugins/catalog.js';

/**
 * Der ausgelieferte Katalog ist kein Text, den man nur ansieht — er ist das,
 * was „Installieren“ tatsächlich in `.cortex/mcp.json` schreibt. Diese Prüfungen
 * halten fest, was er dafür einhalten muss: keine übersprungenen Einträge,
 * keine doppelten Servernamen, kein Zeichen, das es nicht gibt, und für jeden
 * Schlüsselbedarf eine Stelle, an der der Schlüssel hingehört.
 */
const catalogPath = fileURLToPath(new URL('../../media/plugins/catalog.json', import.meta.url));
const parsed = parseCatalog(readFileSync(catalogPath, 'utf8'));
const iconPath = (file: string) =>
  fileURLToPath(new URL(`../../media/plugins/icons/${file}`, import.meta.url));

describe('ausgelieferter Plugin-Katalog', () => {
  it('lässt sich vollständig lesen — kein Eintrag fällt heraus', () => {
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.skipped).toEqual([]);
    expect(parsed.catalog.entries.length).toBeGreaterThan(40);
  });

  it('vergibt jede Kennung und jeden Servernamen genau einmal', () => {
    if (!parsed.ok) return;
    const ids = parsed.catalog.entries.map((e) => e.id);
    const servers = parsed.catalog.entries.map((e) => e.server);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(servers).size).toBe(servers.length);
  });

  it('trägt für jeden Eintrag einen startbaren oder erreichbaren Server', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      expect(entry.definition.command || entry.definition.url, entry.id).toBeTruthy();
    }
  });

  it('nennt nur Logodateien, die es wirklich gibt', () => {
    if (!parsed.ok) return;
    const missing = parsed.catalog.entries
      .filter((e) => e.icon && !existsSync(iconPath(e.icon)))
      .map((e) => `${e.id} → ${e.icon}`);
    // Ein Eintrag ohne Logo ist erlaubt und zeigt seine Initiale; ein Eintrag
    // mit einem Dateinamen ohne Datei wäre ein stiller Ausfall in der Kachel.
    expect(missing).toEqual([]);
  });

  it('gibt jedem Eintrag ein echtes Logo — keine Initiale bleibt übrig', () => {
    if (!parsed.ok) return;
    // Ein Eintrag ohne frei verfügbares Markenlogo gehört nicht in den Katalog:
    // eine Kachelreihe, in der einzelne Felder Buchstaben zeigen, sieht nach
    // Fehler aus, und ein nachgezeichnetes Logo wäre eine Anmaßung.
    const withoutIcon = parsed.catalog.entries.filter((e) => !e.icon).map((e) => e.id);
    expect(withoutIcon).toEqual([]);
    const withIcon = parsed.catalog.entries;
    // Und jede Datei ist wirklich ein SVG, keine leere Hülle.
    for (const entry of withIcon) {
      const svg = readFileSync(iconPath(entry.icon!), 'utf8');
      expect(svg, entry.id).toContain('<svg');
    }
  });

  it('hält die Kachel für selbst eingetragene Server bereit', () => {
    // Server ohne Katalogeintrag zeigen das MCP-Zeichen; fehlt die Datei,
    // steht in der Leiste ein kaputtes Bild.
    expect(existsSync(iconPath('mcp.svg'))).toBe(true);
  });

  it('fasst Zugänge eines Dienstes zu einer Karte — mit Namen für die Auswahl', () => {
    if (!parsed.ok) return;
    const byService = new Map<string, typeof parsed.catalog.entries>();
    for (const entry of parsed.catalog.entries) {
      if (!entry.service) continue;
      byService.set(entry.service, [...(byService.get(entry.service) ?? []), entry]);
    }
    for (const [service, variants] of byService) {
      // Ein Dienst mit nur einem Eintrag braucht keinen Dienstschlüssel.
      expect(variants.length, service).toBeGreaterThan(1);
      for (const v of variants) expect(v.variantLabel, v.id).toBeTruthy();
      // Die Karte zeigt einen Namen — alle Zugänge tragen denselben.
      expect(new Set(variants.map((v) => v.name)).size, service).toBe(1);
    }
    expect(byService.get('youtube')?.map((v) => v.id)).toEqual(['youtube', 'youtube-kanal']);
  });

  it('nennt für jeden Platzhalter im Aufruf ein Feld, das ihn füllt', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      const names = [...(entry.definition.args ?? []), entry.definition.url ?? '']
        .flatMap((text) => [...text.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]));
      const fields = (entry.requires?.fields ?? []).map((f) => f.env);
      for (const name of names) expect(fields, `${entry.id}: \${${name}}`).toContain(name);
      // Kein „~“: ohne Shell wird es nie zum Heimordner.
      expect((entry.definition.args ?? []).some((a) => a.startsWith('~')), entry.id).toBe(false);
    }
  });

  it('verbindet entfernte Server nur über Streamable HTTP und nennt bei Anmeldung, wie sie läuft', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      if (!entry.definition.url) continue;
      expect(entry.definition.url, entry.id).not.toMatch(/\/sse\/?$/);
      if (entry.requires?.kind === 'oauth') expect(entry.requires.hint, entry.id).not.toContain('nicht in Cortex');
    }
  });

  it('hält für jeden Schlüsselbedarf die Stelle bereit, an die er gehört', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      if (entry.requires?.kind !== 'secret') continue;
      const key = entry.requires.env!;
      expect(Object.keys(entry.definition.env ?? {}), entry.id).toContain(key);
      // Und niemals einen echten Wert: Schlüssel gehören dem Nutzer.
      expect(entry.definition.env?.[key], entry.id).toBe('');
    }
  });

  it('erklärt bei einer Anbieter-Anmeldung, wo sie stattfindet', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      if (entry.requires?.kind !== 'oauth') continue;
      expect(entry.requires.hint.length, entry.id).toBeGreaterThan(20);
    }
  });

  it('gibt jedem Abschnitt der Übersicht genug Einträge', () => {
    if (!parsed.ok) return;
    const { entries } = parsed.catalog;
    expect(entries.filter((e) => e.featured).length).toBeGreaterThanOrEqual(4);
    expect(entries.filter((e) => e.popular).length).toBeGreaterThanOrEqual(6);
    expect(entries.filter((e) => e.fresh).length).toBeGreaterThanOrEqual(4);
  });

  it('gibt jedem Eintrag drei Beispiele für das Banner', () => {
    if (!parsed.ok) return;
    for (const entry of parsed.catalog.entries) {
      expect(entry.prompts.length, entry.id).toBe(3);
    }
  });

  it('trägt OmniGrab als lokalen Server mit Engine-Pfad', () => {
    if (!parsed.ok) return;
    const entry = parsed.catalog.entries.find((e) => e.id === 'omnigrab');
    expect(entry, 'omnigrab fehlt im Katalog').toBeTruthy();
    expect(entry?.server).toBe('omnigrab');
    expect(entry?.definition.command).toBe('/usr/bin/python3');
    expect(entry?.definition.args?.[0]).toContain('omnigrab-mcp.py');
    expect(entry?.icon).toBe('omnigrab.svg');
    expect(existsSync(iconPath(entry!.icon!))).toBe(true);
  });
});
