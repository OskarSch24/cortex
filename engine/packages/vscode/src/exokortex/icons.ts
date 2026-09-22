import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Das echte Symbol einer installierten Anwendung, als data-URI.
 *
 * Nachgebaute Logos veralten und sehen immer ein wenig falsch aus. Das Symbol
 * im Programmbündel dagegen ist per Definition das richtige — und wechselt von
 * selbst mit, wenn der Nutzer eine neue Fassung installiert.
 *
 * Zwei Fallstricke, die einen naiven Versuch scheitern lassen:
 *
 *  - **Nicht die erste .icns nehmen.** Cortex bringt 60 Dateityp-Symbole mit;
 *    alphabetisch zuerst kommt `bat.icns`. Das richtige steht in `Info.plist`
 *    unter `CFBundleIconFile` — und zwar mal mit, mal ohne Endung.
 *  - **Nicht nach /Applications raten.** Systemprogramme liegen unter
 *    /System/Applications, Nutzerinstallationen mitunter in ~/Applications.
 *    `mdfind` über die Bundle-Kennung findet sie alle.
 *
 * Was hier NICHT passiert: aus dem Netz laden. Zur Laufzeit Logos zu holen hieße
 * warten, scheitern können und bei jedem Start dasselbe noch einmal. Für Dienste
 * ohne Anwendung auf diesem Rechner liegt stattdessen eine Datei in
 * `media/icons/` — für Grok und OMI sind das die offiziellen Symbole ihrer
 * Anbieter, einmal geholt und mitgeliefert. Fehlt eine, bleibt es beim Kürzel.
 */

/** Ein Symbol wechselt nur bei einer Neuinstallation — einmal je Sitzung reicht. */
const zwischenspeicher = new Map<string, string | null>();

/** 64 Punkte: scharf auf Netzhautschirmen bei 32 Punkten Anzeigegröße. */
const KANTE = 64;

/** Wo Programme liegen — in der Reihenfolge, in der man sie erwartet. */
const ORDNER = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  '/System/Library/CoreServices',
];

function bundlePfad(bundleId: string, appName?: string | null): string | undefined {
  try {
    const treffer = execFileSync(
      '/usr/bin/mdfind',
      [`kMDItemCFBundleIdentifier == '${bundleId}'`],
      { encoding: 'utf8', timeout: 4000 },
    )
      .split('\n')
      .map(z => z.trim())
      .filter(z => z.endsWith('.app') && existsSync(z));
    // Mehrere Treffer heißen meist: eine Kopie liegt im Papierkorb oder im
    // Downloads-Ordner. Der kürzeste Pfad ist verlässlich der installierte.
    const gefunden = treffer.sort((a, b) => a.length - b.length)[0];
    if (gefunden) return gefunden;
  } catch {
    /* Spotlight nicht verfügbar — unten weiter */
  }
  // mdfind kennt nur, was Spotlight indiziert hat. Eine frisch gebaute oder
  // gerade kopierte Anwendung fehlt dort — Cortex selbst ist genau so ein Fall.
  // Deshalb der Rückfall über den Namen an den üblichen Orten.
  if (!appName) return undefined;
  for (const wurzel of [...ORDNER, join(process.env['HOME'] ?? '', 'Applications')]) {
    const p = join(wurzel, `${appName}.app`);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** VSCodium/Electron-Defaults — daneben liegt oft das eigentliche Produktsymbol. */
const GENERISCH = /^(electron|Code|VSCodium|bat)(\.icns)?$/i;

function icnsPfad(app: string): string | undefined {
  const res = join(app, 'Contents', 'Resources');
  if (!existsSync(res)) return undefined;
  let name: string | undefined;
  try {
    name = execFileSync(
      '/usr/bin/defaults',
      ['read', join(app, 'Contents', 'Info'), 'CFBundleIconFile'],
      { encoding: 'utf8', timeout: 4000 },
    ).trim();
  } catch {
    name = undefined;
  }
  let alle: string[] = [];
  try {
    alle = readdirSync(res).filter(f => f.endsWith('.icns'));
  } catch {
    alle = [];
  }
  if (name && GENERISCH.test(name)) {
    const produkt = alle.find(f => /icon|appicon|^app\./i.test(f) && !GENERISCH.test(f));
    if (produkt) return join(res, produkt);
  }
  if (name) {
    for (const kandidat of [name, `${name}.icns`]) {
      const p = join(res, kandidat);
      if (existsSync(p)) return p;
    }
  }
  // Ohne Eintrag in der Info.plist: die einzige .icns nehmen, wenn es genau eine
  // gibt. Bei mehreren wäre jede Wahl geraten — dann lieber kein Symbol.
  if (alle.length === 1 && alle[0]) return join(res, alle[0]);
  return undefined;
}

function alsDataUri(icns: string): string | null {
  const ordner = mkdtempSync(join(tmpdir(), 'cx-icon-'));
  const ziel = join(ordner, 'i.png');
  try {
    execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-Z', String(KANTE), icns, '--out', ziel], {
      timeout: 8000,
      stdio: 'ignore',
    });
    return `data:image/png;base64,${readFileSync(ziel).toString('base64')}`;
  } catch {
    return null;
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}

/**
 * Symbol zu einer Bundle-Kennung. `null`, wenn die Anwendung nicht installiert
 * ist — die Seite zeigt dann ein Kürzel statt eines fremden Logos.
 *
 * @param mitgeliefert Ordner mit Rückfall-Dateien (`media/icons/<kennung>.png`),
 *                     für Dienste ohne Anwendung auf diesem Rechner.
 */
export function appSymbol(
  bundleId: string | null,
  kennung?: string,
  mitgeliefert?: string,
  appName?: string | null,
): string | null {
  const schluessel = bundleId ?? `datei:${kennung ?? ''}`;
  const bekannt = zwischenspeicher.get(schluessel);
  if (bekannt !== undefined) return bekannt;

  let uri: string | null = null;
  if (bundleId) {
    const app = bundlePfad(bundleId, appName);
    const icns = app ? icnsPfad(app) : undefined;
    // Code.icns ist bei Cortex das VSCodium-Dateitypsymbol, nicht das Produkt.
    if (icns && !(kennung && mitgeliefert && GENERISCH.test(icns.split('/').pop() ?? ''))) {
      uri = alsDataUri(icns);
    }
  }
  if (!uri && mitgeliefert && kennung) {
    const datei = join(mitgeliefert, `${kennung}.png`);
    if (existsSync(datei)) {
      try {
        uri = `data:image/png;base64,${readFileSync(datei).toString('base64')}`;
      } catch {
        uri = null;
      }
    }
  }
  zwischenspeicher.set(schluessel, uri);
  return uri;
}

/** Für Tests und nach einer Neuinstallation. */
export function symboleVergessen(): void {
  zwischenspeicher.clear();
}
