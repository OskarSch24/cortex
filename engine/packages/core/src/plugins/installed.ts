import type { McpServerDef } from '../mcp/mcpSync.js';
import type { PluginEntry, PluginField } from './catalog.js';

/**
 * Rein rechnende Schicht — sie läuft im Host *und* im Webview. Deshalb steht
 * hier kein `node:fs`: das Lesen der Platte liegt in `skills.ts`, die nur der
 * Host lädt. Ein einziger `readdirSync` hier hätte das ganze Browser-Bündel
 * unbaubar gemacht.
 *
 * Der Zustand eines Katalogeintrags auf diesem Rechner. Alles hier ist gelesen,
 * nichts gemerkt: `installed` heißt „steht in mcp.json“, `skills` heißt „diese
 * Ordner liegen wirklich da“, `connection` heißt „der Server hat bei der
 * letzten Prüfung seine Werkzeuge genannt“. Ein angeklickter Knopf allein
 * ändert keinen dieser Werte.
 */
export interface PluginState {
  installed: boolean;
  /** Installiert, aber mindestens ein Pflichtwert fehlt — siehe `missing`. */
  needsSecret: boolean;
  /** Die Variablen der Pflichtfelder, für die weder Schlüsselbund noch Definition einen Wert hat. */
  missing: string[];
  /** Die Variablen, für die ein Wert hinterlegt ist — der Wert selbst kommt nie hierher. */
  provided: string[];
  /** Der Eintrag braucht eine Anmeldung beim Anbieter. */
  authUnverifiable: boolean;
  /** Die Anmeldung, wenn Cortex eine hält. */
  oauth?: PluginOAuthState;
  /** Ob dieser Eintrag einen eigenen OAuth-Client braucht — vom Katalog oder weil der Anbieter es verlangt hat. */
  needsOwnClient: boolean;
  /** Der hinterlegte eigene Client. */
  client?: PluginCredentialState['client'];
  /**
   * Installiert, aber das Programm dahinter ist nachweislich nicht bereit —
   * nur wenn der Host es geprüft hat. Ohne Prüfergebnis bleibt es `false`.
   */
  needsApp: boolean;
  /** Was der Host über das Programm herausgefunden hat, in einem Satz. */
  appDetail?: string;
  /** Ob das Programm bereit ist — auch vor dem Installieren, damit die Seite es sagen kann. */
  appReady?: boolean;
  /** Auf welche CLIs der installierte Server beschränkt ist. */
  providers?: string[];
  /** Die Skills des Eintrags, die tatsächlich auf der Platte liegen. */
  skills: string[];
  /** Das Ergebnis der letzten Verbindungsprüfung. */
  connection?: PluginConnection;
  /** In Cortex ausgeschaltet: steht weiter in mcp.json, geht aber in kein Profil. */
  disabled: boolean;
}

/** Was der Host über eine Anmeldung weiß — ohne den Token. */
export interface PluginOAuthState {
  connectedAt: number;
  expiresAt?: number;
  /** Ob Cortex den Token selbst auffrischen kann. */
  refreshable: boolean;
  /** Das Auffrischen ist endgültig gescheitert: neu anmelden. */
  expired?: boolean;
}

export interface PluginConnection {
  /** `pruefe` läuft gerade; die anderen sind Ergebnisse. */
  status: 'pruefe' | 'verbunden' | 'anmeldung' | 'fehler';
  checkedAt?: number;
  /** Die Werkzeuge, die der Server genannt hat. */
  tools?: Array<{ name: string; title?: string; description?: string }>;
  server?: { name?: string; title?: string; version?: string };
  /** Verbunden, aber der erste echte Aufruf wurde verweigert — was noch zu tun ist. */
  notice?: string;
  /** Ein Satz, warum es nicht geklappt hat. */
  message?: string;
  /** Das Rohe dahinter, für den Tooltip. */
  detail?: string;
  /** Die letzten Zeilen, die der Server auf stderr geschrieben hat — für „Protokoll anzeigen“. */
  log?: string;
  /**
   * Was die CLIs selbst in ihren Profilen sehen. Erst das belegt, dass ein Agent
   * das Plugin wirklich benutzen kann — Cortex' eigene Prüfung zeigt nur, dass
   * der Server antwortet.
   */
  clis?: CliSight[];
}

export interface CliSight {
  provider: string;
  label: string;
  /** Das Konto dahinter — damit sich eine Zeile einzeln verbinden lässt. */
  account?: string;
  /** `verbunden`: die CLI hat ihn gestartet und Werkzeuge gesehen. `eingetragen`: die CLI kennt ihn, prüft aber nicht selbst. */
  state: 'verbunden' | 'eingetragen' | 'fehlt' | 'fehler';
  detail?: string;
}

/** Was der Host je Server über Zugangsdaten sagt. */
export interface PluginCredentialState {
  /** Hinterlegte Variablen — nur die Namen. */
  fields: string[];
  oauth?: PluginOAuthState;
  /** Ein eigener OAuth-Client — nur zum Wiedererkennen, ohne Secret. */
  client?: { clientId: string; hasSecret: boolean; fileName?: string; projectId?: string };
  /** Der Anbieter hat die Selbstregistrierung verweigert: hier geht es nur mit eigenem Client. */
  clientRequired?: boolean;
}

/**
 * Der eine Zustand, den eine Zeile zeigt. Er entsteht aus allem oben — in
 * dieser Reihenfolge, damit „Verbunden“ nie über einer offenen Voraussetzung
 * steht.
 */
export type PluginStatus =
  | { kind: 'frei' }
  | { kind: 'einrichtung'; reason: 'schluessel' | 'client' | 'anmeldung' | 'app'; label: string }
  | { kind: 'pruefe'; label: string }
  /** Installiert und bereit, aber noch nie geprüft — etwa weil die Prüfung auf einen Klick wartet. */
  | { kind: 'ungeprueft'; label: string }
  | { kind: 'verbunden'; label: string; tools: number }
  | { kind: 'fehler'; label: string; message: string }
  /**
   * Selbst nicht eingerichtet, aber derselbe Dienst ist über die Alternative
   * verbunden — etwa YouTube ohne API-Schlüssel, während YouTube-Kanal läuft.
   * Kein offener Punkt: für dich ist der Dienst da.
   */
  | { kind: 'ersetzt'; label: string; via: string; viaId: string; tools: number }
  /** In Cortex ausgeschaltet — kein Handlungsbedarf, nur ein Zustand. */
  | { kind: 'aus'; label: string };

/**
 * Der Zustand einer Zeile. Mit `alternative` weiß der Eintrag, ob derselbe
 * Dienst schon über den anderen Zugang verbunden ist, und fordert dann nichts
 * mehr an.
 */
export function pluginStatus(
  entry: PluginEntry,
  state: PluginState,
  siblings: Array<{ id: string; label: string; status: PluginStatus }> = [],
): PluginStatus {
  const own = ownStatus(entry, state);
  const connected = siblings.find((s) => s.status.kind === 'verbunden');
  if (own.kind === 'einrichtung' && connected && connected.status.kind === 'verbunden') {
    return {
      kind: 'ersetzt',
      label: `Über ${connected.label}`,
      via: connected.label,
      viaId: connected.id,
      tools: connected.status.tools,
    };
  }
  return own;
}

/** Der Schlüssel, unter dem Einträge zu einer Karte zusammengehören. */
export const serviceKey = (entry: PluginEntry): string => entry.service ?? entry.id;

/** Einträge je Dienst, in Katalogreihenfolge — der erste Zugang ist der vorgestellte. */
export function groupServices(entries: PluginEntry[]): Array<{ key: string; variants: PluginEntry[] }> {
  const groups = new Map<string, PluginEntry[]>();
  for (const entry of entries) {
    const key = serviceKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups].map(([key, variants]) => ({ key, variants }));
}

/**
 * Der Zustand einer Karte aus den Zuständen ihrer Zugänge. Ein verbundener
 * Zugang genügt; ein Fehler wiegt schwerer als eine offene Einrichtung, weil
 * etwas, das kaputt ist, eher Aufmerksamkeit braucht als etwas Unfertiges.
 */
export function bestStatus(statuses: PluginStatus[]): PluginStatus {
  const order: PluginStatus['kind'][] = ['verbunden', 'fehler', 'einrichtung', 'pruefe', 'ungeprueft', 'ersetzt', 'aus', 'frei'];
  return [...statuses].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ?? { kind: 'frei' };
}

/** Ob eine Kachel einen Punkt trägt: nur, wenn du etwas tun musst. */
export function needsAttention(status: PluginStatus): 'gelb' | 'rot' | undefined {
  if (status.kind === 'fehler') return 'rot';
  if (status.kind === 'einrichtung') return 'gelb';
  return undefined;
}

function ownStatus(entry: PluginEntry, state: PluginState): PluginStatus {
  if (!state.installed) return { kind: 'frei' };
  if (state.disabled) return { kind: 'aus', label: 'Ausgeschaltet' };
  if (state.needsApp) return { kind: 'einrichtung', reason: 'app', label: 'Einrichtung abschließen' };
  if (state.missing.length) return { kind: 'einrichtung', reason: 'schluessel', label: 'Schlüssel eintragen' };
  if (state.needsOwnClient && !state.client) {
    return { kind: 'einrichtung', reason: 'client', label: 'Client eintragen' };
  }
  if (usesLogin(entry) && (!state.oauth || state.oauth.expired)) {
    return { kind: 'einrichtung', reason: 'anmeldung', label: state.oauth?.expired ? 'Neu anmelden' : 'Anmelden' };
  }
  const connection = state.connection;
  // „Prüfe …“ nur, wenn wirklich eine Prüfung läuft. Ein fehlendes Ergebnis ist
  // kein laufendes — sonst dreht sich die Anzeige endlos um nichts.
  if (!connection) return { kind: 'ungeprueft', label: 'Nicht geprüft' };
  if (connection.status === 'pruefe') return { kind: 'pruefe', label: 'Prüfe …' };
  if (connection.status === 'verbunden') {
    // Die Werkzeugliste allein ist kein Beleg, dass Aufrufe durchgehen (Xcode ohne Freigabe).
    if (connection.notice) return { kind: 'einrichtung', reason: 'app', label: connection.notice };
    const count = connection.tools?.length ?? 0;
    return { kind: 'verbunden', label: 'Verbunden', tools: count };
  }
  if (connection.status === 'anmeldung') {
    return { kind: 'einrichtung', reason: 'anmeldung', label: state.oauth ? 'Neu anmelden' : 'Anmelden' };
  }
  return { kind: 'fehler', label: 'Fehler', message: connection.message ?? 'Der Server antwortet nicht.' };
}

/** Ob der Eintrag über eine Anmeldung im Browser läuft — mit oder ohne eigenen Client. */
export function usesLogin(entry: PluginEntry): boolean {
  return entry.requires?.kind === 'oauth' || entry.requires?.kind === 'oauth-client';
}

/** Ob sich die CLIs selbst beim Anbieter anmelden — Cortex hält dann kein Token. */
export function usesAgentLogin(entry: PluginEntry): boolean {
  return entry.requires?.kind === 'agent-oauth';
}

/** Die Felder eines Eintrags — auch für die alte Kurzform mit nur `env`. */
export function pluginFields(entry: PluginEntry): PluginField[] {
  const requirement = entry.requires;
  if (requirement?.kind !== 'secret') return [];
  if (requirement.fields?.length) return requirement.fields;
  return requirement.env ? [{ env: requirement.env, label: 'API-Schlüssel', secret: true }] : [];
}

/**
 * Pflichtwerte, die einer Definition nach dem Einsetzen der Zugangsdaten noch
 * fehlen. Ein Server mit leerem Pflichtschlüssel gehört in kein Profil: jede
 * CLI startete ihn bei jedem Zug, und er stürbe sofort (beobachtet an YouTube
 * ohne `YOUTUBE_API_KEY`).
 */
export function missingRequired(def: McpServerDef, fields: PluginField[]): string[] {
  if (!def.command) return [];
  return fields.filter((f) => !f.optional && !def.env?.[f.env]?.trim()).map((f) => f.env);
}

/** Was der Host über die installierten Server weiß. */
export interface PluginHostState {
  credentials?: Record<string, PluginCredentialState>;
  connections?: Record<string, PluginConnection>;
  /** Server, die in Cortex ausgeschaltet sind. */
  disabled?: string[];
}

/** Ergebnis einer Programmprüfung des Hosts, z. B. ob Xcode für Agenten bereit ist. */
export interface AppCheck {
  ok: boolean;
  detail: string;
  /** Ob das Programm gerade läuft — nur dann darf Cortex es von sich aus ansprechen. */
  running?: boolean;
}

export function pluginState(
  entry: PluginEntry,
  servers: Record<string, McpServerDef>,
  skills: ReadonlySet<string>,
  env: Record<string, string | undefined> = {},
  apps: Record<string, AppCheck> = {},
  host: PluginHostState = {},
): PluginState {
  const installed = servers[entry.server];
  const requirement = entry.requires;
  const stored = new Set(host.credentials?.[entry.server]?.fields ?? []);
  const has = (name: string) =>
    stored.has(name) || !!installed?.env?.[name]?.trim() || !!env[name]?.trim();
  const fields = pluginFields(entry);
  const provided = fields.filter((f) => has(f.env)).map((f) => f.env);
  // Nicht installiert heißt: keine Behauptung über fehlende Werte.
  const missing = installed ? fields.filter((f) => !f.optional && !has(f.env)).map((f) => f.env) : [];
  const app = requirement?.kind === 'app' && requirement.check ? apps[requirement.check] : undefined;
  return {
    installed: !!installed,
    needsSecret: missing.length > 0,
    missing,
    provided,
    authUnverifiable: usesLogin(entry),
    oauth: host.credentials?.[entry.server]?.oauth,
    needsOwnClient: requirement?.kind === 'oauth-client' || !!host.credentials?.[entry.server]?.clientRequired,
    client: host.credentials?.[entry.server]?.client,
    needsApp: !!installed && !!app && !app.ok,
    ...(app ? { appDetail: app.detail, appReady: app.ok } : {}),
    providers: installed?.providers,
    skills: (entry.skills ?? []).filter((name) => skills.has(name)),
    // Ein altes Ergebnis gehört zu keinem nicht installierten Eintrag — eine
    // laufende Prüfung schon: so wird vor dem Eintragen geprüft.
    connection: installed || host.connections?.[entry.server]?.status === 'pruefe' ? host.connections?.[entry.server] : undefined,
    disabled: !!installed && !!host.disabled?.includes(entry.server),
  };
}

export function pluginStates(
  entries: PluginEntry[],
  servers: Record<string, McpServerDef>,
  skills: ReadonlySet<string>,
  env: Record<string, string | undefined> = {},
  apps: Record<string, AppCheck> = {},
  host: PluginHostState = {},
): Map<string, PluginState> {
  return new Map(entries.map((entry) => [entry.id, pluginState(entry, servers, skills, env, apps, host)]));
}

/**
 * Die Definition, wie eine CLI sie bekommt: hinterlegte Werte als Umgebung,
 * `${NAME}` in Argumenten und URL ersetzt, der Token als Header.
 *
 * Die Werte gehen nur in die Profile unter ~/.cortex/profiles, nie zurück in
 * mcp.json — die kann in einem Projekt liegen und mit ihm geteilt werden.
 */
export function withCredentials(
  def: McpServerDef,
  values: Record<string, string>,
  authorization?: string,
): McpServerDef {
  // Ein Wert darf auch von Hand in mcp.json stehen; der Schlüsselbund gewinnt.
  const lookup: Record<string, string> = {
    ...Object.fromEntries(Object.entries(def.env ?? {}).filter(([, v]) => v.trim())),
    ...values,
  };
  const placeholder = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  const hasPlaceholder = [...(def.args ?? []), def.url ?? ''].some((text) => text.includes('${'));
  if (!Object.keys(values).length && !authorization && !hasPlaceholder) return def;
  const substitute = (text: string) => text.replace(placeholder, (whole, name: string) => lookup[name] ?? whole);
  const next: McpServerDef = { ...def };
  if (def.command) {
    // Hinterlegt ist nur, was die Felder dieses Eintrags verlangen — alles davon
    // geht als Umgebung mit, auch wenn die Definition es nur im Argument nennt.
    if (Object.keys(values).length) next.env = { ...(def.env ?? {}), ...values };
    if (def.args) next.args = def.args.map(substitute);
  }
  if (def.url) {
    next.url = substitute(def.url);
    if (authorization) next.headers = { ...(def.headers ?? {}), Authorization: authorization };
  }
  return next;
}

/**
 * Server, die in mcp.json stehen, aber zu keinem Katalogeintrag gehören —
 * selbst geschriebene Konnektoren. Die Übersicht führt sie als „Importierte
 * Plugins“, damit die Seite nicht so tut, als gäbe es nur den Katalog.
 */
export function unlistedServers(
  entries: PluginEntry[],
  servers: Record<string, McpServerDef>,
): Array<{ name: string; def: McpServerDef }> {
  const known = new Set(entries.map((entry) => entry.server));
  return Object.entries(servers)
    .filter(([name]) => !known.has(name))
    .map(([name, def]) => ({ name, def }));
}

/**
 * Einen Server in den *Text* von mcp.json schreiben statt in ein geparstes
 * Abbild: die Datei gehört dem Nutzer. `_help`, eigene Felder und die
 * Reihenfolge bleiben so erhalten, auch wenn Cortex sie nie gelesen hat.
 */
export function withServer(content: string, name: string, def: McpServerDef): string {
  const doc = parseObject(content);
  const servers = { ...(asObject(doc.servers) ?? {}) };
  servers[name] = compact({
    command: def.command,
    args: def.args,
    env: def.env,
    url: def.url,
    providers: def.providers,
  });
  return stringify({ ...doc, servers });
}

export function withoutServer(content: string, name: string): string {
  const doc = parseObject(content);
  const servers = { ...(asObject(doc.servers) ?? {}) };
  delete servers[name];
  return stringify({ ...doc, servers });
}

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

function parseObject(content: string): Record<string, unknown> {
  if (!content.trim()) return { servers: {} };
  const parsed = JSON.parse(content) as unknown;
  const doc = asObject(parsed);
  if (!doc) throw new Error('mcp.json is not an object');
  return doc;
}

function compact(def: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(def).filter(([, value]) => {
      if (value === undefined) return false;
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === 'object') return Object.keys(value).length > 0;
      return true;
    }),
  );
}

const stringify = (doc: Record<string, unknown>): string => `${JSON.stringify(doc, null, 2)}\n`;
