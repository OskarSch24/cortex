import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spiegelung, urteil, verarbeite, KONNEKTOR, type Profil } from '../../src/exokortex/status.js';
import { befehl } from '../../src/exokortex/actions.js';
import { StatusWatch } from '../../src/exokortex/watch.js';
import type { ExokortexPruefung } from '../../src/panel/protocol.js';

const pruefung = (
  name: string,
  zustand: ExokortexPruefung['zustand'],
  wert = 'x',
  hinweis = '',
): ExokortexPruefung => ({ name, zustand, wert, hinweis });

function profil(ordner: string, name: string, manifest?: string[]): Profil {
  const homeDir = join(ordner, name);
  mkdirSync(homeDir, { recursive: true });
  if (manifest) writeFileSync(join(homeDir, '.cortex-mcp.json'), JSON.stringify({ servers: manifest }));
  return { provider: name.split('-')[0]!, label: name, homeDir };
}

describe('whether any AI can actually reach the exokortex', () => {
  it('reports the state nothing else shows: mirrored never, partly, fully', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'profile-'));
    // Kein Manifest heißt: die Spiegelung lief hier nie. Genau dieser Zustand
    // bestand unbemerkt, während mcp.json den Konnektor längst nannte.
    expect(spiegelung([profil(ordner, 'claude-a')]).zustand).toBe('never');
    expect(spiegelung([profil(ordner, 'codex-b', ['context7'])]).zustand).toBe('never');

    const gemischt = [profil(ordner, 'claude-c', [KONNEKTOR]), profil(ordner, 'grok-d', ['context7'])];
    expect(spiegelung(gemischt)).toEqual({ zustand: 'stale', wert: '1 von 2 Profilen' });

    const alle = [profil(ordner, 'claude-e', [KONNEKTOR]), profil(ordner, 'codex-f', ['x', KONNEKTOR])];
    expect(spiegelung(alle)).toEqual({ zustand: 'ok', wert: 'in allen 2 Profilen' });
  });

  it('treats an unreadable manifest as not mirrored, never as an error', () => {
    const ordner = mkdtempSync(join(tmpdir(), 'profile-'));
    const kaputt = profil(ordner, 'claude-g');
    writeFileSync(join(kaputt.homeDir!, '.cortex-mcp.json'), '{ kaputt');
    expect(spiegelung([kaputt]).zustand).toBe('never');
  });
});

describe('reading what status.py reported', () => {
  // Eine echte Ausgabe des laufenden Systems, eingefroren: ein handgeschriebenes
  // Payload würde nur beweisen, dass der Parser meine Erwartung liest.
  const echt = readFileSync(new URL('./exokortex-status.json', import.meta.url), 'utf8');

  it('keeps every check and inserts the one only Cortex can answer', () => {
    const status = verarbeite(echt, [], 0, []);
    const namen = status.pruefungen.map(p => p.name);
    expect(namen).toContain('Plattenplatz');
    expect(namen).toContain('Leseserver');
    expect(namen).toContain('Konnektor in Profilen');
    // Nach dem, was alles blockiert — vor dem Rest.
    expect(namen.indexOf('Konnektor in Profilen')).toBe(2);
    expect(status.arbeitsliste.unbenannte_orte).toBeGreaterThan(0);
  });

  it('turns broken output into a red tile, never into an exception', () => {
    // Ein abgeschnittenes Payload ist der wahrscheinlichste Ausfall: Python
    // stirbt mitten im Schreiben. Die Seite muss das überleben.
    for (const kaputt of [echt.slice(0, 900), '', 'Traceback (most recent call last):']) {
      const status = verarbeite(kaputt, ['ModuleNotFoundError: kein basis'], 1, []);
      expect(status.urteil.zustand).toBe('fehler');
      expect(status.pruefungen).toHaveLength(1);
      expect(status.fehler).toContain('ModuleNotFoundError');
    }
  });

  it('reports a plain crash without stderr too', () => {
    const status = verarbeite('', [], null, []);
    expect(status.urteil.satz).toContain('Status nicht abrufbar');
    expect(status.chronik).toEqual([]);
  });
});

describe('the one-sentence verdict', () => {
  it('says "ready" for a warning and drops it for a real failure', () => {
    expect(urteil([pruefung('A', 'ok'), pruefung('B', 'ok')]).satz).toBe('Exokortex bereit');
    // Eine Warnung heißt: es läuft, aber sieh hin. Derselbe Satz für beides
    // wäre einmal Panikmache und einmal Verharmlosung.
    expect(urteil([pruefung('Plattenplatz', 'warnung', '10 GB frei')]).satz)
      .toBe('Exokortex bereit — Plattenplatz: 10 GB frei');
    expect(urteil([pruefung('Leseserver', 'fehler', 'antwortet nicht')]).satz)
      .toBe('Leseserver: antwortet nicht');
  });

  it('lets the worst check speak, not the first', () => {
    const gefaellt = urteil([
      pruefung('A', 'warnung', 'nur eine Warnung'),
      pruefung('B', 'fehler', 'das eigentliche Problem'),
      pruefung('C', 'ok'),
    ]);
    expect(gefaellt.zustand).toBe('fehler');
    expect(gefaellt.satz).toContain('das eigentliche Problem');
  });

  it('carries the remedy, not just the diagnosis', () => {
    expect(urteil([pruefung('Platte', 'fehler', '1 GB', 'Platz schaffen.')]).hinweis)
      .toBe('Platz schaffen.');
  });
});

describe('what the page is allowed to run', () => {
  const pfade = { python: '/usr/bin/python3', repo: '/repo' };

  it('never offers a path that feeds an arbitrary source', () => {
    // Eine beliebige Quelle einzuspeisen ist der einzige Weg, der den Graphen
    // spürbar verändert. Er gehört nicht in die Knopfleiste.
    for (const action of ['pruefen', 'chatsEinspeisen', 'nachmessen', 'indexNeu'] as const) {
      const gewaehlt = befehl(action, pfade);
      const args = gewaehlt?.[1].join(' ') ?? '';
      expect(args).not.toContain('lauf.py');
    }
  });

  it('routes each button to its own script', () => {
    expect(befehl('chatsEinspeisen', pfade)).toEqual(['/usr/bin/python3', ['/repo/bruecke/chats.py', '--jetzt']]);
    expect(befehl('nachmessen', pfade)).toEqual(['/usr/bin/python3', ['/repo/protokoll/abnahme.py']]);
    expect(befehl('indexNeu', pfade)).toEqual(['/usr/bin/python3', ['/repo/bruecke/graphindex.py', '--neu']]);
    // Diese beiden macht Cortex selbst — ein Skript dafür wäre eine zweite Wahrheit.
    expect(befehl('pruefen', pfade)).toBeUndefined();
    expect(befehl('konnektorenSync', pfade)).toBeUndefined();
  });

  it('reads and writes the hourly run through launchd, not a mirrored setting', () => {
    expect(befehl('laufAn', pfade)?.[0]).toBe('launchctl');
    expect(befehl('laufAus', pfade)?.[1]).toContain('bootout');
  });
});

describe('the watch runs only while someone is looking', () => {
  it('starts on open, stops on close, and never overlaps itself', async () => {
    vi.useFakeTimers();
    let laufend = 0;
    let gleichzeitig = 0;
    let fertig!: () => void;
    const watch = new StatusWatch({
      intervallMinuten: 1,
      tick: () => {
        laufend += 1;
        gleichzeitig = Math.max(gleichzeitig, laufend);
        return new Promise<void>(resolve => { fertig = () => { laufend -= 1; resolve(); }; });
      },
    });

    watch.setOffen(true);
    expect(laufend).toBe(1);                 // sofort, nicht erst nach einer Minute

    // Ein langsamer Durchgang darf den nächsten nicht überlappen: nach einer
    // Einspeisung baut der Leseserver seinen Index nach und braucht Sekunden.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(gleichzeitig).toBe(1);
    fertig();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gleichzeitig).toBe(1);

    watch.setOffen(false);
    const bisher = laufend;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(laufend).toBe(bisher);            // zu heißt: nichts läuft mehr
    watch.dispose();
    vi.useRealTimers();
  });

  it('keeps polling while a second surface still shows the page', async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    const watch = new StatusWatch({ intervallMinuten: 1, tick });
    watch.setOffen(true);
    watch.setOffen(true);
    watch.setOffen(false);
    tick.mockClear();
    // Asynchron vorspulen: der Überlappungsriegel fällt erst, wenn die
    // Microtask-Queue durch ist — synchrone Timer würden ihn stehen lassen
    // und einen echten Durchgang als übersprungen erscheinen lassen.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalled();
    watch.dispose();
    vi.useRealTimers();
  });
});
