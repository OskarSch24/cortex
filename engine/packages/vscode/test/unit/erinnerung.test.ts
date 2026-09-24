import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { STANDARD_BEREICHE, leseBereiche, waehleBereiche } from '../../src/memory/bereiche.js';
import {
  Erinnerung,
  STANDARD_EINSTELLUNGEN,
  gehaltvoll,
  istMerkwunsch,
  suchbegriffe,
  suchtext,
  themenwechsel,
  type ErinnerungDeps,
  type ErinnerungsEinstellungen,
  type Treffer,
} from '../../src/memory/erinnerung.js';
import { schwaerze } from '../../src/memory/geheim.js';
import { schreibeMerkliste } from '../../src/memory/merkliste.js';

const ZETTEL = '## Entscheidungen\n- Instagram: apidojo/instagram-scraper\n## Festlegungen\n## Offen\n## Verworfen\n- clockworks';

function aufbau(einstellungen: Partial<ErinnerungsEinstellungen> = {}, treffer: Treffer[] = []) {
  const notizen = new Map<string, string>();
  const merkliste: string[] = [];
  const deps: ErinnerungDeps = {
    einstellungen: () => ({ ...STANDARD_EINSTELLUNGEN, ...einstellungen }),
    abrufen: vi.fn(async () => treffer),
    fragen: vi.fn(async () => ZETTEL),
    helfer: (_modus, zuletzt) => zuletzt ?? { provider: 'claude', account: 'biz', model: 'haiku' },
    notizLesen: (id) => notizen.get(id),
    notizSchreiben: (id, text) => notizen.set(id, text),
    merken: (e) => merkliste.push(e),
  };
  return { deps, notizen, merkliste, erinnerung: new Erinnerung(deps) };
}

const treffer = (wert: number, titel = 'Status Update Phase X'): Treffer => ({
  id: `chunk:${titel}:${wert}`,
  dokument: `doc:${titel}`,
  dokument_titel: titel,
  projekt: 'proj_cortex_chats',
  pfad: '2026/chat--h7q8ik3t.md',
  wert,
  stelle: '["Instagram","«apidojo»/instagram-scraper","0,50 USD"]',
});

describe('Suchbereiche', () => {
  it('sucht immer in den Chats und schaltet Nordwind über ein Stichwort zu', () => {
    const a = waehleBereiche('Welche Apify-Actors hatten wir?', '/Users/x/Desktop/Kortex', STANDARD_BEREICHE);
    expect(a.projekte).toEqual(['proj_cortex_chats', 'proj_nordwind']);
    expect(a.bereiche).toContain('Nordwind Studio');
  });

  it('zählt Stichwörter nur als ganze Wörter', () => {
    const a = waehleBereiche('Die factory pattern Frage', undefined, STANDARD_BEREICHE);
    expect(a.projekte).toEqual(['proj_cortex_chats']);
  });

  it('ein allgemeines Wort allein holt kein fremdes Projekt (Architektur im Bilanz-Chat)', () => {
    const a = waehleBereiche('Wie sieht die Architektur der Haushaltsbuch Übersicht aus?', '/Users/x/Desktop/Haushaltsbuch', STANDARD_BEREICHE);
    expect(a.projekte).toEqual(['proj_cortex_chats']);
    const b = waehleBereiche('Architektur und Ökonomie der Städte — wie bei New German Architecture', undefined, STANDARD_BEREICHE);
    expect(b.projekte).toContain('proj_new_german_architecture');
    const c = waehleBereiche('Workflow für den Actor bauen', undefined, STANDARD_BEREICHE);
    expect(c.projekte).toContain('proj_nordwind');
  });

  it('schaltet über den Arbeitsordner zu', () => {
    const a = waehleBereiche('wie weiter?', '/Users/x/Nordwind Studio/Nordwind Engine', STANDARD_BEREICHE);
    expect(a.projekte).toContain('proj_nordwind');
  });

  it('fällt bei kaputten gespeicherten Bereichen auf die Vorgabe zurück', () => {
    expect(leseBereiche('quatsch')).toBe(STANDARD_BEREICHE);
    expect(leseBereiche([{ nope: 1 }])).toBe(STANDARD_BEREICHE);
  });
});

describe('Schwärzen', () => {
  it('entfernt den Apify-Token aus dem Chat, der Name bleibt', () => {
    const text = 'Ich habe einen Apify Token: apify_api_EXAMPLEexampleEXAMPLEexample000000 und APIFY_TOKEN=abc123def456ghi';
    const out = schwaerze(text);
    expect(out).not.toContain('ksviJ90');
    expect(out).not.toContain('abc123def456ghi');
    expect(out).toContain('APIFY_TOKEN=<geheim>');
  });

  it('schwärzt Passwörter in Verbindungs-URIs', () => {
    expect(schwaerze('postgres://nordwind:geheimespw@127.0.0.1:5433/nordwind')).toBe('postgres://nordwind:<geheim>@127.0.0.1:5433/nordwind');
  });
});

describe('Suchbegriffe', () => {
  it('wirft Füllwörter raus und stellt Kennungen nach vorn', () => {
    const b = suchbegriffe('Ähm, welche Actors hatten wir für apidojo/instagram-scraper und WF-E.10 eigentlich?');
    expect(b[0]).toBe('apidojo/instagram-scraper');
    expect(b).toContain('WF-E.10');
    expect(b).toContain('Actors');
    expect(b).not.toContain('eigentlich');
    expect(b).not.toContain('hatten');
  });

  it('erkennt einen Themenwechsel', () => {
    expect(themenwechsel(['Apify', 'Actors', 'Instagram'], ['Instagram', 'Actors', 'Preise'])).toBe(false);
    expect(themenwechsel(['Apify', 'Actors', 'Instagram'], ['Sidebar', 'Breite', 'Vektor'])).toBe(true);
  });

  it('erkennt „merk dir“', () => {
    expect(istMerkwunsch('Merk dir bitte, dass wir apidojo nehmen')).toBe(true);
    expect(istMerkwunsch('Das merkwürdige Verhalten')).toBe(false);
  });
});

describe('Erinnerung im Ablauf', () => {
  it('holt Treffer, filtert nach Relevanz und schickt sie als Abschnitt mit', async () => {
    const { erinnerung, deps } = aufbau({}, [treffer(34.8), treffer(2, 'Rauschen')]);
    const r = await erinnerung.vorbereiten('c1', 'Welche Apify-Actors hatten wir?', { erste: true, ohnePfad: '--c1.md' });
    expect(r.treffer).toHaveLength(1);
    expect(deps.abrufen).toHaveBeenCalledWith(
      expect.objectContaining({ projekte: ['proj_cortex_chats', 'proj_nordwind'], ohne_pfad: '--c1.md' }),
      expect.anything(),
    );
    const [abschnitt] = erinnerung.abschnitte('c1');
    expect(abschnitt!.id).toBe('erinnerungen');
    expect(abschnitt!.body).toContain('Status Update Phase X');
    expect(abschnitt!.body).toContain('«apidojo»/instagram-scraper');
    expect(abschnitt!.body).not.toContain('"');
  });

  it('sucht beim gleichen Thema nicht erneut', async () => {
    const { erinnerung, deps } = aufbau({}, [treffer(20)]);
    await erinnerung.vorbereiten('c1', 'Apify Actors Instagram Preise', { erste: true });
    await erinnerung.vorbereiten('c1', 'Instagram Actors Preise pro tausend', { erste: false });
    expect(deps.abrufen).toHaveBeenCalledTimes(1);
    await erinnerung.vorbereiten('c1', 'Sidebar Breite verschiebbar Vektor', { erste: false });
    expect(deps.abrufen).toHaveBeenCalledTimes(2);
  });

  it('sucht mit dem, was der Nutzer schrieb — nicht mit dem Konto-Präfix (Protokoll vom 18.09.)', async () => {
    expect(suchtext('@claude:Business/claude-opus-5 immernoch sauber gebaut')).toBe('immernoch sauber gebaut');
    expect(suchtext('@grok:Side-Hustle/grok-4.6 Wie ist die Bilanz?\n\nAttached files:\n- a.png')).toBe('Wie ist die Bilanz?');
    const { erinnerung, deps } = aufbau({}, [treffer(30)]);
    await erinnerung.vorbereiten('c1', '@claude:Business/claude-opus-5 Welche Apify-Actors hatten wir?', { erste: true });
    const auftrag = (deps.abrufen as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(auftrag.begriffe.join(' ')).not.toMatch(/claude|Business/);
  });

  it('eine kurze Nachfrage löst keinen neuen Abruf aus, und Gezeigtes kommt nicht wieder', async () => {
    expect(gehaltvoll('immernoch sauber gebaut', suchbegriffe('immernoch sauber gebaut'))).toBe(false);
    const { erinnerung, deps } = aufbau({}, [treffer(30)]);
    const erste = await erinnerung.vorbereiten('c1', 'Apify Actors Instagram Preise', { erste: true });
    expect(erste.neueTreffer).toHaveLength(1);
    const kurz = await erinnerung.vorbereiten('c1', '@claude:Business/claude-opus-5 immernoch sauber gebaut', { erste: false });
    expect(kurz.neueTreffer).toEqual([]);
    expect(deps.abrufen).toHaveBeenCalledTimes(1);
    // Neues Thema, aber dieselbe Fundstelle: das Modell bekommt sie, die Karte zeigt sie nicht noch einmal.
    const wieder = await erinnerung.vorbereiten('c1', 'Sidebar Breite verschiebbar Vektor', { erste: false });
    expect(wieder.treffer).toHaveLength(1);
    expect(wieder.neueTreffer).toEqual([]);
    // Nach einem Neustart: was der Verlauf schon zeigte, zählt als bekannt.
    const frisch = aufbau({}, [treffer(30)]);
    const r = await frisch.erinnerung.vorbereiten('c1', 'Apify Actors Instagram Preise', { erste: false, bekannt: [treffer(30).id] });
    expect(r.neueTreffer).toEqual([]);
  });

  it('zeigt schwach passende Treffer nicht an, gibt sie dem Modell aber mit', async () => {
    const { erinnerung } = aufbau({}, [treffer(10)]);
    const r = await erinnerung.vorbereiten('c1', 'Apify Actors Instagram Preise', { erste: true });
    expect(r.treffer).toHaveLength(1);
    expect(r.neueTreffer).toEqual([]);
  });

  it('antwortet auch, wenn der Exokortex nicht erreichbar ist', async () => {
    const { erinnerung, deps } = aufbau();
    (deps.abrufen as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('lesen.py fehlt'));
    const r = await erinnerung.vorbereiten('c1', 'Apify Actors', { erste: true });
    expect(r.treffer).toEqual([]);
    expect(erinnerung.abschnitte('c1')).toEqual([]);
  });

  it('ruft bei „nie“ nichts ab', async () => {
    const { erinnerung, deps } = aufbau({ abruf: 'nie' }, [treffer(30)]);
    await erinnerung.vorbereiten('c1', 'Apify Actors', { erste: true });
    expect(deps.abrufen).not.toHaveBeenCalled();
  });

  it('führt den Notizzettel und gibt ihn jedem Modell mit', async () => {
    const { erinnerung, notizen, deps } = aufbau();
    await erinnerung.nachAntwort('c1', {
      frage: 'Nimm apidojo, Token ist apify_api_EXAMPLEexampleEXAMPLEexample000000',
      antwort: 'Umgestellt.',
      von: { provider: 'grok', account: 'side', model: 'grok-4.6' },
      verlauf: [],
    });
    expect(notizen.get('c1')).toContain('apidojo/instagram-scraper');
    const prompt = (deps.fragen as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(prompt).toContain('grok:side/grok-4.6');
    const [abschnitt] = erinnerung.abschnitte('c1');
    expect(abschnitt!.id).toBe('notizen');
    expect(abschnitt!.body).toContain('## Entscheidungen');
  });

  it('baut einen Zettel für einen alten Chat aus dem ganzen Verlauf', async () => {
    const { erinnerung, deps } = aufbau();
    const verlauf = [
      { role: 'user' as const, text: 'Welche Actors?' },
      { role: 'assistant' as const, text: 'apidojo/tiktok-scraper ist am günstigsten' },
      { role: 'user' as const, text: 'Und die Tabellen?' },
      { role: 'assistant' as const, text: 'Vier Räume.' },
    ];
    await erinnerung.nachAntwort('alt', { frage: 'Und die Tabellen?', antwort: 'Vier Räume.', verlauf });
    const prompt = (deps.fragen as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(prompt).toContain('Bisheriger Verlauf');
    expect(prompt).toContain('apidojo/tiktok-scraper');
  });

  it('verwirft eine Antwort ohne Zettel-Aufbau', async () => {
    const { erinnerung, notizen, deps } = aufbau();
    (deps.fragen as ReturnType<typeof vi.fn>).mockResolvedValueOnce('Tut mir leid, das kann ich nicht.');
    await erinnerung.nachAntwort('c1', { frage: 'x', antwort: 'y', verlauf: [] });
    expect(notizen.has('c1')).toBe(false);
  });

  it('legt „merk dir“ auf die Merkliste, geschwärzt', async () => {
    const { erinnerung, merkliste, deps } = aufbau();
    (deps.fragen as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(ZETTEL)
      .mockResolvedValueOnce('Nordwind Phase X: Social-Actors von apidojo, Token apify_api_EXAMPLEexampleEXAMPLEexample000000.');
    await erinnerung.nachAntwort('c1', { frage: 'Merk dir: wir nehmen apidojo', antwort: 'Ok.', verlauf: [] });
    expect(merkliste).toHaveLength(1);
    expect(merkliste[0]).toContain('apidojo');
    expect(merkliste[0]).not.toContain('ksviJ90');
  });

  it('schreibt die Merkliste als einlesbare Datei', () => {
    const pfad = join(mkdtempSync(join(tmpdir(), 'merk-')), 'Erinnerungen', 'merkliste.md');
    schreibeMerkliste('Eintrag eins', pfad, new Date('2026-09-17T12:00:00Z'));
    schreibeMerkliste('Eintrag zwei', pfad, new Date('2026-09-18T12:00:00Z'));
    const text = readFileSync(pfad, 'utf8');
    expect(text.startsWith('---\nart: cortex-merkliste')).toBe(true);
    expect(text).toContain('## 2026-09-17\n\nEintrag eins');
    expect(text).toContain('## 2026-09-18\n\nEintrag zwei');
  });
});
