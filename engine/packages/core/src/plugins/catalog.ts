import type { ProviderId } from '../types.js';
import type { McpServerDef } from '../mcp/mcpSync.js';
import { OAUTH_PROVIDERS, type OAuthProviderId, type RedirectHost } from '../mcp/oauthClient.js';

/**
 * Ein Plugin ist in Cortex kein eigenes Laufzeitgebilde: es ist ein benannter
 * MCP-Server plus das, was ein Mensch braucht, um ihn zu finden — Icon, Satz,
 * Kategorie, Beispielprompts.
 *
 * Deshalb trägt jeder Eintrag eine *echte* Serverdefinition. Ein Eintrag, den
 * „Installieren“ nicht wirklich in `.cortex/mcp.json` schreiben und über
 * `syncMcpToProfile` in die Profile spiegeln kann, gehört nicht in den Katalog.
 * Eine Kachel, die nur so aussieht, als könnte sie etwas, wäre genau die Art
 * erfundener Zustand, die Cortex sonst überall vermeidet.
 */
export const PLUGIN_CATEGORIES = [
  'produktivitaet',
  'kreativitaet',
  'entwicklertools',
  'business',
  'daten',
  'kommunikation',
] as const;

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<PluginCategory, string> = {
  produktivitaet: 'Produktivität',
  kreativitaet: 'Kreativität',
  entwicklertools: 'Entwicklertools',
  business: 'Business und Betrieb',
  daten: 'Daten und Analysen',
  kommunikation: 'Kommunikation',
};

/**
 * Ein Wert, den ein Plugin von dir braucht: ein API-Schlüssel, eine
 * Verbindungszeichenkette, ein Ordner. Er landet als Umgebungsvariable beim
 * Server — und wo die Definition `${NAME}` in einem Argument trägt, auch dort.
 */
export interface PluginField {
  /** Der Name der Variablen, unter dem der Server den Wert erwartet. */
  env: string;
  /** Die Beschriftung über dem Eingabefeld. */
  label: string;
  /** Verdeckt eingeben und im Schlüsselbund ablegen. Ein Ordnerpfad ist kein Geheimnis. */
  secret: boolean;
  placeholder?: string;
  /** Der Server läuft auch ohne; das Feld verbessert ihn nur. */
  optional?: boolean;
}

/**
 * Wie ein Server den eigenen OAuth-Client und den Token bekommt. Jeder Server
 * liest sie anders — als Variablen, als Pfad zu einer Datei —, und genau das
 * steht hier, statt dass Cortex es rät.
 */
export interface ClientDelivery {
  /** `google`: Endpunkte und Eigenheiten stehen fest. Fehlt es, liefert der Remote-Server sie selbst. */
  provider?: OAuthProviderId;
  /** Die Berechtigungen, um die bei der Anmeldung gebeten wird. */
  scopes?: string[];
  /** Der Name in der Rückrufadresse, den die Konsole des Anbieters annimmt. */
  redirectHost?: RedirectHost;
  /** Variable ← Pfad zur Client-Datei im Google-Format. */
  clientFile?: string;
  /** Variablen ← Client-ID und -Secret selbst. */
  clientIdEnv?: string;
  clientSecretEnv?: string;
  /** Variable ← Pfad zur Token-Datei im Format von google-auth-library. */
  tokenFile?: string;
  /** Variablen ← Access- und Refresh-Token selbst. */
  accessTokenEnv?: string;
  refreshTokenEnv?: string;
}

/**
 * Was der Eintrag braucht, bevor er tatsächlich arbeitet. Ist das nicht erfüllt,
 * steht er als „Einrichtung abschließen“ da — nicht als verbunden.
 */
export interface PluginRequirement {
  /**
   * `oauth`: Anmeldung beim Anbieter im Browser, Cortex registriert sich
   * selbst. `oauth-client`: dieselbe Anmeldung, aber mit einem OAuth-Client,
   * den du in der Konsole des Anbieters angelegt hast (`client`). `secret`:
   * Werte, die du einträgst (`fields`). `app`: ein Programm auf diesem Mac,
   * das der Host prüfen kann (`check`). `agent-oauth`: der Anbieter lässt nur
   * Programme von seiner eigenen Liste an den Zugang — Cortex steht nicht darauf,
   * Claude Code und Codex schon. Die CLIs melden sich dann selbst an und halten
   * das Token; Cortex stößt es nur an und fragt sie nach dem Stand.
   */
  kind: 'oauth' | 'oauth-client' | 'secret' | 'app' | 'agent-oauth';
  /** Für `secret`: der Name der ersten Variablen — die älteste Form, immer gesetzt. */
  env?: string;
  /** Für `secret`: alle Werte, die der Eintrag braucht. */
  fields?: PluginField[];
  /** Für `app`: welche Prüfung des Hosts gilt — bisher nur `xcode`. */
  check?: string;
  /** Für `oauth-client`: wie der Server Client und Token bekommt. */
  client?: ClientDelivery;
  /** Ein Satz, der erklärt, was zu tun ist. */
  hint: string;
  /** Wo man den Schlüssel bekommt oder die App verbindet. */
  url?: string;
}

export interface PluginEntry {
  id: string;
  name: string;
  /** Der eine Satz unter dem Namen in jeder Zeile. */
  tagline: string;
  /** Der Absatz auf der Produktseite. */
  description: string;
  category: PluginCategory;
  developer: string;
  version?: string;
  website?: string;
  privacy?: string;
  /** Dateiname unter `media/plugins/icons/`. Fehlt er, steht eine Initiale. */
  icon?: string;
  /** Fläche hinter dem Zeichen, wenn das Zeichen selbst keine mitbringt. */
  accent?: string;
  /** Abschnitt „Wichtige Plugins“. */
  featured?: boolean;
  /** Abschnitt „Beliebt“. */
  popular?: boolean;
  /** Abschnitt „Neu und bemerkenswert“. */
  fresh?: boolean;
  /** Drei Beispiele für das Banner der Produktseite. */
  prompts: string[];
  /** Der Name, unter dem der Server in `mcp.json` steht. */
  server: string;
  /** Die Definition, die „Installieren“ schreibt. */
  definition: McpServerDef;
  /** Skills, die dieser Eintrag mitbringt — gezählt wird nur, was es gibt. */
  skills?: string[];
  requires?: PluginRequirement;
  /**
   * Der Dienst, zu dem dieser Eintrag gehört. Hat ein Dienst mehrere Zugänge —
   * YouTube mit API-Schlüssel oder mit deinem Google-Konto —, tragen alle
   * denselben Wert und erscheinen als eine Karte. Fehlt er, ist der Eintrag
   * selbst der Dienst.
   */
  service?: string;
  /** Wie dieser Zugang in der Auswahl der Karte heißt. */
  variantLabel?: string;
  /** Ein Satz, was dieser Zugang kann, was der andere nicht kann. */
  variantHint?: string;
}

export interface PluginCatalog {
  entries: PluginEntry[];
}

const PROVIDER_IDS: ReadonlySet<string> = new Set<ProviderId>([
  'claude',
  'codex',
  'copilot',
  'grok',
  'openrouter',
]);

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const strList = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

function parseDefinition(raw: unknown): McpServerDef | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as Record<string, unknown>;
  const command = str(d.command);
  const url = str(d.url);
  // Ohne das eine oder das andere lässt sich nichts starten und nichts erreichen.
  if (!command && !url) return undefined;
  const providers = strList(d.providers)?.filter((p): p is ProviderId => PROVIDER_IDS.has(p));
  return {
    command,
    url,
    args: strList(d.args),
    env:
      d.env && typeof d.env === 'object' && !Array.isArray(d.env)
        ? Object.fromEntries(
            Object.entries(d.env as Record<string, unknown>).filter(
              (kv): kv is [string, string] => typeof kv[1] === 'string',
            ),
          )
        : undefined,
    providers: providers?.length ? providers : undefined,
  };
}

function parseFields(raw: unknown): PluginField[] {
  if (!Array.isArray(raw)) return [];
  const fields: PluginField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const f = item as Record<string, unknown>;
    const env = str(f.env);
    const label = str(f.label);
    if (!env || !label || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(env)) continue;
    fields.push({
      env,
      label,
      secret: f.secret !== false,
      placeholder: str(f.placeholder),
      optional: f.optional === true ? true : undefined,
    });
  }
  return fields;
}

function parseRequirement(raw: unknown): PluginRequirement | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const kind =
    r.kind === 'oauth' || r.kind === 'oauth-client' || r.kind === 'secret' || r.kind === 'app' || r.kind === 'agent-oauth'
      ? r.kind
      : undefined;
  const hint = str(r.hint);
  if (!kind || !hint) return undefined;
  const check = str(r.check);
  if (kind === 'app' && !check) return undefined;
  if (kind === 'secret') {
    // Die kurze Form `env` bleibt gültig und heißt: ein verdeckter Schlüssel.
    const fields = parseFields(r.fields);
    const single = str(r.env);
    if (!fields.length && single) fields.push({ env: single, label: 'API-Schlüssel', secret: true });
    // Ein Schlüsselbedarf ohne den Namen der Variablen ließe sich nie prüfen.
    if (!fields.length) return undefined;
    return { kind, hint, env: fields[0]!.env, fields, url: str(r.url) };
  }
  if (kind === 'oauth-client') {
    const client = parseDelivery(r.client);
    if (!client) return undefined;
    return { kind, hint, client, url: str(r.url) };
  }
  return { kind, hint, env: str(r.env), check, url: str(r.url) };
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function parseDelivery(raw: unknown): ClientDelivery | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const envName = (v: unknown) => {
    const name = str(v);
    return name && ENV_NAME.test(name) ? name : undefined;
  };
  const provider = typeof c.provider === 'string' && c.provider in OAUTH_PROVIDERS ? (c.provider as OAuthProviderId) : undefined;
  if (c.provider !== undefined && !provider) return undefined;
  return {
    provider,
    scopes: strList(c.scopes)?.filter((s) => s.trim()),
    redirectHost: c.redirectHost === 'localhost' || c.redirectHost === '127.0.0.1' ? c.redirectHost : undefined,
    clientFile: envName(c.clientFile),
    clientIdEnv: envName(c.clientIdEnv),
    clientSecretEnv: envName(c.clientSecretEnv),
    tokenFile: envName(c.tokenFile),
    accessTokenEnv: envName(c.accessTokenEnv),
    refreshTokenEnv: envName(c.refreshTokenEnv),
  };
}

/**
 * Liest den mitgelieferten Katalog. Unvollständige Einträge werden übersprungen
 * und benannt, statt die ganze Datei zu verwerfen: ein Tippfehler in einem von
 * sechzig Einträgen darf nicht die ganze Seite leeren.
 */
export function parseCatalog(
  content: string,
): { ok: true; catalog: PluginCatalog; skipped: string[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const list = (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(list)) return { ok: false, error: 'missing "entries" array' };

  const entries: PluginEntry[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') {
      skipped.push('(kein Objekt)');
      continue;
    }
    const e = raw as Record<string, unknown>;
    const id = str(e.id);
    const name = str(e.name);
    const tagline = str(e.tagline);
    const description = str(e.description);
    const server = str(e.server);
    const developer = str(e.developer);
    const category = PLUGIN_CATEGORIES.includes(e.category as PluginCategory)
      ? (e.category as PluginCategory)
      : undefined;
    const definition = parseDefinition(e.definition);
    if (!id || !name || !tagline || !description || !server || !developer || !category || !definition) {
      skipped.push(id ?? name ?? '(ohne Kennung)');
      continue;
    }
    if (seen.has(id)) {
      skipped.push(id);
      continue;
    }
    seen.add(id);
    entries.push({
      id,
      name,
      tagline,
      description,
      category,
      developer,
      server,
      definition,
      version: str(e.version),
      website: str(e.website),
      privacy: str(e.privacy),
      icon: str(e.icon),
      accent: str(e.accent),
      featured: e.featured === true,
      popular: e.popular === true,
      fresh: e.fresh === true,
      prompts: (strList(e.prompts) ?? []).slice(0, 3),
      service: str(e.service),
      variantLabel: str(e.variantLabel),
      variantHint: str(e.variantHint),
      skills: strList(e.skills),
      requires: parseRequirement(e.requires),
    });
  }
  return { ok: true, catalog: { entries }, skipped };
}

/** Suche über Name, Satz und Kategorie — ohne Umlaut- und Groß/Kleinfallen. */
export function searchCatalog(entries: PluginEntry[], query: string): PluginEntry[] {
  const needle = fold(query);
  if (!needle) return entries;
  return entries.filter((entry) =>
    [entry.name, entry.tagline, entry.developer, CATEGORY_LABEL[entry.category]]
      .map(fold)
      .some((haystack) => haystack.includes(needle)),
  );
}

export function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function byCategory(entries: PluginEntry[], category: PluginCategory): PluginEntry[] {
  return entries.filter((entry) => entry.category === category);
}
