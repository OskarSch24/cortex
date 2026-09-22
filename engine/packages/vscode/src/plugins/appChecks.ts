import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AppCheck } from '@cortex/core';
import { checkXcode } from '../panel/xcode.js';

/**
 * Voraussetzungen, die ein Plugin auf diesem Mac braucht, obwohl es keinen
 * Schlüssel verlangt. Bis zum 13.09.2026 führte der Katalog JetBrains,
 * Kubernetes und Firebase als „schlüssellos“ — installiert scheiterten sie an
 * einer fehlenden IDE, an fehlendem `kubectl` und an fehlender Anmeldung.
 */
export type AppCheckId = 'xcode' | 'jetbrains' | 'kubectl' | 'firebase';

const run = (cmd: string, args: string[]) =>
  new Promise<string | undefined>((resolve) => execFile(cmd, args, { timeout: 4000 }, (error, stdout) => resolve(error ? undefined : stdout.trim())));

/** Rein rechnend, damit sich jede Lage ohne echte Programme prüfen lässt. */
export function describeJetbrains(processes: string | undefined): AppCheck {
  const running = !!processes && /jetbrains|intellij|webstorm|pycharm|goland|clion|rider|phpstorm|rubymine|datagrip|android studio|fleet/i.test(processes);
  return running
    ? { ok: true, running: true, detail: 'Eine JetBrains-IDE läuft. Das MCP-Plugin der IDE muss eingeschaltet sein.' }
    : { ok: false, detail: 'Keine JetBrains-IDE geöffnet. Öffne IntelliJ, WebStorm oder eine andere JetBrains-IDE mit eingeschaltetem MCP-Server.' };
}

export function describeKubectl(path: string | undefined, context: string | undefined): AppCheck {
  if (!path) return { ok: false, detail: '„kubectl“ ist auf diesem Mac nicht installiert — etwa mit „brew install kubectl“.' };
  return context
    ? { ok: true, running: true, detail: `kubectl ist bereit, aktueller Kontext „${context}“.` }
    : { ok: false, detail: 'kubectl ist installiert, aber es ist kein Cluster-Kontext eingerichtet.' };
}

export function describeFirebase(config: string | undefined): AppCheck {
  let signedIn = false;
  try {
    const parsed = config ? (JSON.parse(config) as { tokens?: unknown; user?: unknown }) : undefined;
    signedIn = !!parsed?.tokens || !!parsed?.user;
  } catch {
    signedIn = false;
  }
  return signedIn
    ? { ok: true, running: true, detail: 'Firebase ist angemeldet.' }
    : { ok: false, detail: 'Firebase ist nicht angemeldet. Einmal im Terminal „npx firebase-tools login“ ausführen und ein Projekt wählen.' };
}

export async function checkApp(id: string | undefined): Promise<AppCheck | undefined> {
  switch (id) {
    case 'xcode':
      return checkXcode();
    case 'jetbrains':
      return describeJetbrains(await run('/bin/ps', ['-axo', 'comm']));
    case 'kubectl': {
      const path = await run('/usr/bin/which', ['kubectl']) ?? ['/opt/homebrew/bin/kubectl', '/usr/local/bin/kubectl'].find(existsSync);
      return describeKubectl(path, path ? await run(path, ['config', 'current-context']) : undefined);
    }
    case 'firebase': {
      const file = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
      return describeFirebase(existsSync(file) ? readFileSync(file, 'utf8') : undefined);
    }
    default:
      return undefined;
  }
}

/** Alle Prüfungen auf einmal — für die Plugin-Seite. */
export async function checkApps(): Promise<Record<AppCheckId, AppCheck>> {
  const ids: AppCheckId[] = ['xcode', 'jetbrains', 'kubectl', 'firebase'];
  const results = await Promise.all(ids.map((id) => checkApp(id)));
  return Object.fromEntries(ids.map((id, i) => [id, results[i]!])) as Record<AppCheckId, AppCheck>;
}
