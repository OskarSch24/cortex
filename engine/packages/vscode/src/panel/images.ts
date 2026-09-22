import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, isAbsolute, resolve } from 'node:path';
import type { ImageOptions, ImageProvider } from './imageOptions.js';
export * from './imageOptions.js';

/**
 * „Bild erstellen“ im Eingabefeld.
 *
 * Weder Codex noch Grok bieten über das Abo einen direkten Bildzugang an —
 * beide haben aber ein eingebautes Werkzeug `image_gen`, das über die
 * Anmeldung des Kontos läuft. Cortex schickt deshalb einen gewöhnlichen
 * Auftrag, der die Felder als eindeutige Vorgabe für dieses Werkzeug trägt.
 * Das Seitenverhältnis ist bei Grok ein echter Parameter (`aspect_ratio`);
 * Codex nimmt es als Vorgabe und wählt die Pixelgröße selbst.
 */
const ORIENTATION: Record<string, string> = {
  '1:1': 'quadratisch',
  '3:2': 'Querformat',
  '4:3': 'Querformat',
  '16:9': 'breites Querformat',
  '21:9': 'Panorama',
  '2:3': 'Hochformat',
  '3:4': 'Hochformat',
  '9:16': 'schmales Hochformat',
};

const isImageFile = (path: string) => /\.(png|jpe?g|webp|gif)$/i.test(path);

/**
 * Der Auftrag, den das Modell bekommt. Die Beschreibung des Nutzers steht
 * wörtlich darin; alles andere sagt dem Modell, welches Werkzeug es nimmt und
 * dass es nichts im Projekt anlegt — das Speichern macht Cortex.
 */
export function imagePrompt(description: string, options: ImageOptions, provider: ImageProvider, attachments: string[] = []): string {
  const n = options.count;
  const references = attachments.filter(isImageFile);
  const lines: string[] = [];
  const tool = provider === 'grok' ? (references.length ? '`image_edit`' : '`image_gen`') : 'eingebaute `image_gen`';
  lines.push(`Erzeuge ${n === 1 ? 'genau 1 Bild' : `genau ${n} Bilder`} mit deinem ${tool}-Werkzeug.`);
  if (provider === 'grok') {
    lines.push(`- Seitenverhältnis: \`aspect_ratio\` = "${options.ratio}".`);
  } else {
    lines.push(`- Seitenverhältnis ${options.ratio} (${ORIENTATION[options.ratio] ?? 'wie angegeben'}).`);
    lines.push('- Nimm das eingebaute Werkzeug, nicht das CLI-Skript und keinen API-Schlüssel.');
  }
  if (n > 1) lines.push(`- Ein eigener Aufruf je Bild, ${n} leicht unterschiedliche Varianten.`);
  if (references.length) {
    lines.push(
      provider === 'grok'
        ? `- Referenzbild${references.length > 1 ? 'er' : ''} für \`image_edit\` (absoluter Pfad): ${references.map((p) => `\`${p}\``).join(', ')}.`
        : `- Referenzbild${references.length > 1 ? 'er' : ''}: ${references.map((p) => `\`${p}\``).join(', ')} — sieh ${references.length > 1 ? 'sie' : 'es'} dir zuerst an und bearbeite ${references.length > 1 ? 'sie' : 'es'} dann mit \`image_gen\`.`,
    );
    lines.push('- Bearbeite genau diese Referenzbilder. Bewahre Motiv, Perspektive und alle nicht angeforderten Details. Speichere das Ergebnis als neue Datei; überschreibe niemals das Original.');
  } else {
    lines.push('- Wenn die Beschreibung eine Änderung am vorherigen Bild verlangt, verwende das zuletzt in dieser Aufgabe erzeugte Bild als Referenz. Sieh es dir zuerst an und übergib seinen tatsächlichen Dateipfad an das Bildwerkzeug.');
  }
  if (options.edit?.kind === 'background') lines.push('- Entferne nur den Hintergrund. Erhalte das Motiv einschließlich feiner Kanten und liefere eine PNG-Datei mit echtem transparentem Alphakanal.');
  const region = options.edit?.region;
  if (region) {
    const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
    lines.push(`- Markierter Bereich im Referenzbild (Ursprung oben links): x=${pct(region.x)}, y=${pct(region.y)}, Breite=${pct(region.width)}, Höhe=${pct(region.height)}. Die Koordinaten beziehen sich auf das vollständige Original, unabhängig vom Anzeigezoom.`);
    if (options.edit?.kind === 'remove') lines.push('- Entferne das Objekt in diesem Bereich und ergänze den Hintergrund nahtlos. Außerhalb des Bereichs soll das Bild unverändert bleiben.');
    else lines.push('- Wende die beschriebene Änderung auf den markierten Bereich an.');
  }
  lines.push('- Lege nichts im Projekt an und schreibe keinen Code; Cortex zeigt und speichert die Bilder selbst.');
  lines.push('- Antworte danach mit höchstens einem kurzen Satz, ohne Dateipfade.');
  lines.push('', 'Beschreibung:', description.trim());
  return lines.join('\n');
}

/**
 * Wie groß ein ChatGPT-Abo ist. Codex legt den Tarif als Claim in das
 * `id_token` seiner Anmeldung (`chatgpt_plan_type`); gelesen wird nur dieser
 * eine Wert aus der Datei auf der Platte — kein Netz, kein Token verlässt sie.
 * Grok speichert seinen Tarif nirgends lokal; dort gilt die eingestellte Folge.
 */
export function codexPlan(homeDir: string | undefined): string | undefined {
  if (!homeDir) return undefined;
  try {
    const auth = JSON.parse(readFileSync(join(homeDir, 'auth.json'), 'utf8')) as { tokens?: { id_token?: string } };
    const payload = auth.tokens?.id_token?.split('.')[1];
    if (!payload) return undefined;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, Record<string, unknown> | undefined>;
    const plan = claims['https://api.openai.com/auth']?.chatgpt_plan_type;
    return typeof plan === 'string' ? plan.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

const PLAN_RANK: Record<string, number> = { pro: 5, enterprise: 4, business: 3, team: 3, edu: 3, plus: 2, go: 1, free: 0 };

interface RankableAccount {
  provider: string;
  label: string;
  priority: number;
  homeDir?: string;
  disabled?: boolean;
}

/**
 * Die Konten eines Anbieters in der Folge, in der der Bildmodus sie nimmt:
 * zuerst, was in `cortex.imageAccountOrder` steht, dann der größere Tarif,
 * dann die Reihenfolge, in der die Konten angelegt wurden. Ist das erste im
 * Limit, überspringt der Router es und nimmt das nächste.
 */
export function imageAccountOrder(
  accounts: RankableAccount[],
  provider: string,
  configured: string[] = [],
  plan: (homeDir: string | undefined) => string | undefined = codexPlan,
): string[] {
  const set = (label: string) => {
    const i = configured.indexOf(label);
    return i === -1 ? configured.length : i;
  };
  const size = (a: RankableAccount) => (a.provider === 'codex' ? PLAN_RANK[plan(a.homeDir) ?? ''] ?? -1 : -1);
  return accounts
    .filter((a) => a.provider === provider && !a.disabled)
    .sort((a, b) => set(a.label) - set(b.label) || size(b) - size(a) || a.priority - b.priority)
    .map((a) => a.label);
}

/** Wo die Bildwerkzeuge der Anbieter schreiben. Die Webview darf nur von dort laden. */
export function imageRoots(accountHomes: Array<string | undefined> = [], persistentRoots: string[] = []): string[] {
  const home = homedir();
  const roots = [join(home, '.cortex', 'profiles'), join(home, '.codex'), join(home, '.grok'), ...accountHomes.filter((h): h is string => !!h), ...persistentRoots];
  return [...new Set(roots.map((r) => resolve(r)))];
}

export function underRoot(path: string, roots: string[]): boolean {
  if (!isAbsolute(path)) return false;
  const full = resolve(path);
  return roots.some((root) => {
    const rel = relative(root, full);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  });
}

/** Ein erzeugtes Bild — nur solche Pfade verlassen die Webview in Richtung Finder oder Speichern. */
export function isGeneratedImage(path: string, roots: string[]): boolean {
  return isImageFile(path) && underRoot(path, roots);
}

/** Ein Dateiname fürs Projekt: aus der Beschreibung, nicht aus `1.jpg`. */
export function suggestedImageName(prompt: string | undefined, source: string): string {
  const ext = (/\.(png|jpe?g|webp|gif)$/i.exec(source)?.[0] ?? '.png').toLowerCase();
  const slug = (prompt ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .split('-')
    .filter(Boolean)
    .slice(0, 6)
    .join('-');
  return `${slug || 'bild'}${ext}`;
}
