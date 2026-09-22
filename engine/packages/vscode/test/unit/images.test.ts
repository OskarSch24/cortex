import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexPlan, imageAccountOrder, imagePrompt, imageRoots, isGeneratedImage, sanitizeImageOptions, suggestedImageName } from '../../src/panel/images.js';
import { applyHostMessage } from '../../src/panel/transcript.js';
import { appOfDeveloperDir, describeXcode, xcodeTarget } from '../../src/panel/xcode.js';

describe('Bildmodus: Felder', () => {
  it('bringt Werte aus der Webview auf gültige', () => {
    expect(sanitizeImageOptions({ ratio: '16:9', count: 9, style: 'Foto', transparent: true })).toEqual({ ratio: '16:9', count: 4 });
    expect(sanitizeImageOptions({ ratio: '5:1', count: 0 })).toEqual({ ratio: '1:1', count: 1 });
    expect(sanitizeImageOptions('x')).toBeUndefined();
  });
});

describe('Bildmodus: Auftrag', () => {
  it('Grok bekommt aspect_ratio als Parameter und je Bild einen Aufruf', () => {
    const text = imagePrompt('Ein roter Würfel', { ratio: '3:2', count: 2 }, 'grok');
    expect(text).toContain('`image_gen`');
    expect(text).toContain('`aspect_ratio` = "3:2"');
    expect(text).toContain('Ein eigener Aufruf je Bild');
    expect(text).not.toContain('Stil');
    expect(text.endsWith('Beschreibung:\nEin roter Würfel')).toBe(true);
  });

  it('Codex nimmt das eingebaute Werkzeug und Referenzbilder', () => {
    const text = imagePrompt('Logo', { ratio: '1:1', count: 1 }, 'codex', ['/x/ref.png', '/x/notes.md']);
    expect(text).toContain('eingebaute `image_gen`');
    expect(text).toContain('nicht das CLI-Skript');
    expect(text).toContain('`/x/ref.png`');
    expect(text).not.toContain('notes.md');
  });
  it.each(['1:1', '3:2', '4:3', '16:9', '21:9', '2:3', '3:4', '9:16'])('nennt Codex das gewählte Seitenverhältnis %s ausdrücklich (#65)', ratio => {
    const options = sanitizeImageOptions({ ratio, count: 1 })!;
    const text = imagePrompt('Unveränderte Beschreibung', options, 'codex');
    expect(text).toContain(`Seitenverhältnis ${ratio}`);
    expect(text.endsWith('Beschreibung:\nUnveränderte Beschreibung')).toBe(true);
  });

  it('Grok bearbeitet mit image_edit, wenn ein Referenzbild dabei ist', () => {
    expect(imagePrompt('heller', { ratio: '1:1', count: 1 }, 'grok', ['/x/1.jpg'])).toContain('`image_edit`');
  });
});

describe('Bildmodus: Pfade', () => {
  const roots = imageRoots(['/Volumes/Alt/profil']);
  it('lässt nur Bilder aus den Ordnern der Bildwerkzeuge durch', () => {
    expect(isGeneratedImage(join(homedir(), '.cortex/profiles/grok-a/.grok/sessions/x/images/1.jpg'), roots)).toBe(true);
    expect(isGeneratedImage('/Volumes/Alt/profil/generated_images/t/a.png', roots)).toBe(true);
    expect(isGeneratedImage(join(homedir(), '.cortex/profiles/../../.ssh/id_rsa.png'), roots)).toBe(false);
    expect(isGeneratedImage(join(homedir(), '.cortex/profiles/grok-a/auth.json'), roots)).toBe(false);
    expect(isGeneratedImage('/etc/passwd', roots)).toBe(false);
    expect(isGeneratedImage('images/1.jpg', roots)).toBe(false);
  });

  it('schlägt einen Namen aus dem Prompt vor', () => {
    expect(suggestedImageName('Ein ruhiger Arbeitsplatz am Fenster, Morgenlicht, Holz', '/x/1.JPG')).toBe('ein-ruhiger-arbeitsplatz-am-fenster-morgenlicht.jpg');
    expect(suggestedImageName(undefined, '/x/a.png')).toBe('bild.png');
  });
});

describe('Bildmodus: Verlauf', () => {
  it('hängt Bilder an die Antwort, ohne doppelte', () => {
    let items = applyHostMessage([], { kind: 'userEcho', text: 'Würfel', image: { ratio: '1:1', count: 1 } });
    const msg = { kind: 'image', messageId: 'm', path: '/p/1.jpg', src: 'https://x/1.jpg', prompt: 'A cube', options: { ratio: '1:1', count: 1 } } as const;
    items = applyHostMessage(items, msg);
    items = applyHostMessage(items, msg);
    expect(items[0]).toMatchObject({ kind: 'user', image: { ratio: '1:1', count: 1 } });
    expect(items[1]).toMatchObject({ kind: 'assistant', images: [{ path: '/p/1.jpg', src: 'https://x/1.jpg', prompt: 'A cube' }], imageOptions: { ratio: '1:1', count: 1 } });
  });
});

describe('Xcode', () => {
  it('erkennt das App-Bündel hinter xcode-select', () => {
    expect(appOfDeveloperDir('/Applications/Xcode.app/Contents/Developer')).toBe('/Applications/Xcode.app');
    expect(appOfDeveloperDir('/Library/Developer/CommandLineTools')).toBeUndefined();
  });

  it('sagt, was fehlt', () => {
    const clt = '/Library/Developer/CommandLineTools';
    expect(describeXcode({ developerDir: clt, apps: [], running: false })).toEqual({ ok: false, detail: 'Xcode ist auf diesem Mac nicht installiert.' });
    const downloads = describeXcode({ developerDir: clt, apps: ['/Users/o/Downloads/Xcode.app'], running: false });
    expect(downloads.ok).toBe(false);
    expect(downloads.detail).toContain('Downloads');
    expect(downloads.detail).toContain('sudo xcode-select -s /Applications/Xcode.app');
    const unselected = describeXcode({ developerDir: clt, apps: ['/Applications/Xcode.app'], running: false });
    expect(unselected.detail).toContain('Command Line Tools');
  });

  it('meldet bereit, wenn die Brücke im gewählten Xcode liegt', () => {
    const app = join(mkdtempSync(join(tmpdir(), 'cx-xcode-')), 'Xcode.app');
    const dev = join(app, 'Contents', 'Developer');
    mkdirSync(join(dev, 'usr', 'bin'), { recursive: true });
    expect(describeXcode({ developerDir: dev, apps: [app], running: false }).detail).toContain('keine Agenten-Schnittstelle');
    writeFileSync(join(dev, 'usr', 'bin', 'mcpbridge'), '');
    const ready = describeXcode({ developerDir: dev, apps: [app], running: true, version: '27.0' });
    // `running` sagt Cortex, ob es Xcode von sich aus prüfen darf, ohne es zu starten.
    expect(ready).toEqual({ ok: true, running: true, detail: `Xcode 27.0 ist bereit und läuft (${app}).` });
  });

  it('öffnet das nächste Projekt über einer Swift-Datei', () => {
    const root = mkdtempSync(join(tmpdir(), 'cx-xc-proj-'));
    mkdirSync(join(root, 'App.xcodeproj'));
    mkdirSync(join(root, 'App', 'Views'), { recursive: true });
    const file = join(root, 'App', 'Views', 'Home.swift');
    writeFileSync(file, '');
    expect(xcodeTarget(file, root)).toBe(join(root, 'App.xcodeproj'));
    const loose = mkdtempSync(join(tmpdir(), 'cx-xc-loose-'));
    writeFileSync(join(loose, 'a.swift'), '');
    expect(xcodeTarget(join(loose, 'a.swift'), loose)).toBe(join(loose, 'a.swift'));
  });
});

describe('Bildmodus: größeres Konto zuerst', () => {
  const accounts = [
    { provider: 'grok', label: 'privat', priority: 1 },
    { provider: 'grok', label: 'Side-Hustle', priority: 4 },
    { provider: 'codex', label: 'plus-konto', priority: 2, homeDir: '/plus' },
    { provider: 'codex', label: 'pro-konto', priority: 3, homeDir: '/pro' },
    { provider: 'codex', label: 'aus', priority: 0, homeDir: '/pro', disabled: true },
  ];
  const plan = (home?: string) => ({ '/plus': 'plus', '/pro': 'pro' })[home ?? ''];

  it('ChatGPT: der größere Tarif zuerst', () => {
    expect(imageAccountOrder(accounts, 'codex', [], plan)).toEqual(['pro-konto', 'plus-konto']);
  });
  it('Grok: die eingestellte Folge gilt, sonst die Reihenfolge der Konten', () => {
    expect(imageAccountOrder(accounts, 'grok', ['Side-Hustle', 'privat'], plan)).toEqual(['Side-Hustle', 'privat']);
    expect(imageAccountOrder(accounts, 'grok', [], plan)).toEqual(['privat', 'Side-Hustle']);
  });
  it('eine eingestellte Folge schlägt auch den Tarif', () => {
    expect(imageAccountOrder(accounts, 'codex', ['plus-konto'], plan)).toEqual(['plus-konto', 'pro-konto']);
  });
  it('liest den Tarif aus dem id_token, ohne mehr herauszugeben', () => {
    const home = mkdtempSync(join(tmpdir(), 'cx-codex-plan-'));
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const token = `${b64({ alg: 'none' })}.${b64({ 'https://api.openai.com/auth': { chatgpt_plan_type: 'Pro' } })}.sig`;
    writeFileSync(join(home, 'auth.json'), JSON.stringify({ tokens: { id_token: token } }));
    expect(codexPlan(home)).toBe('pro');
    expect(codexPlan(join(home, 'fehlt'))).toBeUndefined();
  });
});
