import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppCheck } from '@cortex/core';
import { tryExec } from '../util/exec.js';

/**
 * Xcode als Plugin: der Server ist `xcrun mcpbridge`, die Brücke, die Xcode
 * ab 26.3 selbst mitbringt. Sie spricht mit dem Xcode, das `xcode-select`
 * gewählt hat — solange dort die Command Line Tools stehen, findet `xcrun`
 * sie gar nicht. Genau das prüft Cortex hier, statt „verbunden“ zu behaupten.
 */

const run = (cmd: string, args: string[]) => tryExec(cmd, args, 4000);

/** Die Xcode-Programme, die auf diesem Mac liegen — auch ein noch nicht verschobenes in Downloads. */
function findXcodeApps(home = homedir()): string[] {
  const found: string[] = [];
  for (const dir of ['/Applications', join(home, 'Applications'), join(home, 'Downloads'), join(home, 'Desktop')]) {
    try {
      for (const name of readdirSync(dir)) {
        if (/^Xcode.*\.app$/.test(name)) found.push(join(dir, name));
      }
    } catch {
      /* Ordner fehlt */
    }
  }
  return found;
}

/** Das App-Bündel zu einem Entwicklerordner (`…/Xcode.app/Contents/Developer`). */
export function appOfDeveloperDir(developerDir: string | undefined): string | undefined {
  if (!developerDir) return undefined;
  const match = /^(.*?\.app)\/Contents\/Developer\/?$/.exec(developerDir);
  return match?.[1];
}

interface XcodeFacts {
  developerDir?: string;
  apps: string[];
  running: boolean;
  version?: string;
}

/** Rein rechnend, damit sich jede Lage ohne echtes Xcode prüfen lässt. */
export function describeXcode(facts: XcodeFacts): AppCheck {
  const selected = appOfDeveloperDir(facts.developerDir);
  if (selected) {
    const bridge = join(facts.developerDir!, 'usr', 'bin', 'mcpbridge');
    if (!existsSync(bridge)) {
      return { ok: false, detail: `${selected} bringt keine Agenten-Schnittstelle mit — sie gibt es ab Xcode 26.3.` };
    }
    const name = `Xcode${facts.version ? ` ${facts.version}` : ''}`;
    return {
      ok: true,
      running: facts.running,
      detail: facts.running
        ? `${name} ist bereit und läuft (${selected}).`
        : `${name} ist bereit (${selected}). Öffne Xcode mit deinem Projekt, bevor der Agent es benutzt.`,
    };
  }
  if (facts.apps.length === 0) {
    return { ok: false, detail: 'Xcode ist auf diesem Mac nicht installiert.' };
  }
  const inApplications = facts.apps.find((app) => dirname(app) === '/Applications');
  if (!inApplications) {
    return {
      ok: false,
      detail: `Xcode liegt noch unter ${dirname(facts.apps[0]!)}. Zieh es nach Programme und wähle es danach im Terminal mit „sudo xcode-select -s /Applications/${facts.apps[0]!.split('/').pop()}“.`,
    };
  }
  return {
    ok: false,
    detail: `Xcode ist installiert, aber aktiv sind die Command Line Tools. Wähle es im Terminal mit „sudo xcode-select -s ${inApplications}“.`,
  };
}

export async function checkXcode(): Promise<AppCheck> {
  if (process.platform !== 'darwin') return { ok: false, detail: 'Xcode gibt es nur auf dem Mac.' };
  const developerDir = await run('xcode-select', ['-p']);
  const selected = appOfDeveloperDir(developerDir);
  const [running, version] = await Promise.all([
    run('pgrep', ['-x', 'Xcode']).then((out) => !!out),
    selected ? run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(selected, 'Contents', 'Info.plist')]) : Promise.resolve(undefined),
  ]);
  return describeXcode({ developerDir, apps: findXcodeApps(), running, version });
}

/** Dateien, für die „In Xcode öffnen“ angeboten wird. */
export const XCODE_FILE = /(\.(swift|xcodeproj|xcworkspace|xcconfig|storyboard|xib|xcassets|entitlements|plist)|\/Package\.swift)$/i;

/**
 * Was Xcode öffnen soll: das nächste Projekt über der Datei — Workspace vor
 * Projekt vor Package.swift —, innerhalb des Projektordners. Sonst die Datei.
 */
export function xcodeTarget(file: string, root: string): string {
  if (/\.(xcodeproj|xcworkspace)$/i.test(file)) return file;
  let dir = dirname(file);
  while (dir.startsWith(root)) {
    let names: string[] = [];
    try { names = readdirSync(dir); } catch { /* weiter nach oben */ }
    const pick = names.find((n) => n.endsWith('.xcworkspace') && !n.startsWith('project.'))
      ?? names.find((n) => n.endsWith('.xcodeproj'))
      ?? names.find((n) => n === 'Package.swift');
    if (pick) return join(dir, pick);
    if (dir === root) break;
    dir = dirname(dir);
  }
  return file;
}

/**
 * Ob Xcode diesen Agenten schon freigegeben hat, sagt erst ein echter Aufruf:
 * `tools/list` antwortet auch ohne Freigabe (beobachtet am 13.09.2026 — 53
 * Werkzeuge, jeder Aufruf „This agent isn't approved to use Xcode's tools yet“).
 */
export const XCODE_READINESS = {
  tool: 'XcodeListWorkspaces',
  blocked: /isn.t approved|not approved/i,
  notice: 'Freigabe in Xcode offen',
};
