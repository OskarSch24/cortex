import type { PluginEntry } from '../../../core/src/plugins/catalog.js';
import {
  groupServices,
  pluginStates,
  pluginStatus,
  serviceKey,
  unlistedServers,
  type PluginState,
  type PluginStatus,
} from '../../../core/src/plugins/installed.js';
import { effectiveServers } from '../../../core/src/plugins/scopes.js';
import type { HostToWebview } from '../../src/panel/protocol.js';
import { clockTime } from '../format/time.js';
import { CATALOG } from './pluginCatalog.js';

type Plugins = Extract<HostToWebview, { kind: 'plugins' }>;

const EMPTY_STATE: PluginState = {
  installed: false,
  needsSecret: false,
  missing: [],
  provided: [],
  authUnverifiable: false,
  needsOwnClient: false,
  needsApp: false,
  skills: [],
  disabled: false,
};

export interface OwnServer {
  name: string;
  title: string;
  icon?: string;
  target: string;
  note: string;
  builtIn: boolean;
}

/**
 * Was installiert ist und wie es darum steht — an einer Stelle gerechnet, damit
 * die Plugin-Seite und Einstellungen → Plugins nie Verschiedenes behaupten.
 *
 * Beide Dateien gelten zusammen, ein Dienst ist eine Karte, und Server ohne
 * Katalogeintrag bekommen dieselben Zustände wie jedes Plugin.
 */
export function pluginOverview(host: Partial<Plugins> | undefined) {
  const effective = host?.scopes ? effectiveServers(host.scopes) : { servers: {}, origin: {}, shadowed: [] as string[] };
  const servers = effective.servers;
  const skills = new Set(host?.skills ?? []);
  const states = pluginStates(CATALOG, servers, skills, {}, host?.apps ?? {}, {
    credentials: host?.credentials,
    connections: host?.connections,
    disabled: host?.disabled,
  });
  const stateOf = (id: string) => states.get(id) ?? EMPTY_STATE;
  const groupOf = new Map(groupServices(CATALOG).flatMap((g) => g.variants.map((v) => [v.id, g] as const)));
  const variantsOf = (entry: PluginEntry) => groupOf.get(entry.id)?.variants ?? [entry];

  // Ein Zugang sieht die Zustände seiner Geschwister — nur eine Stufe tief, damit
  // sich zwei Zugänge nicht gegenseitig im Kreis befragen.
  const statusOf = (entry: PluginEntry): PluginStatus =>
    pluginStatus(
      entry,
      stateOf(entry.id),
      variantsOf(entry)
        .filter((v) => v.id !== entry.id)
        .map((v) => ({ id: v.id, label: v.variantLabel ?? v.name, status: pluginStatus(v, stateOf(v.id)) })),
    );

  /** Ob für diesen Zugang schon etwas hinterlegt ist — eine Anmeldung, ein Client, ein Schlüssel. */
  const begun = (v: PluginEntry) => {
    const state = stateOf(v.id);
    return !!state.oauth || !!state.client || state.provided.length > 0;
  };

  /**
   * Der Zugang, für den eine Karte steht: der verbundene, sonst einer, für den
   * schon etwas hinterlegt ist, sonst ein eingerichteter, sonst ein
   * installierter, sonst der erste. Ohne die zweite Stufe fragte YouTube nach
   * einem nie eingetragenen API-Schlüssel, während die abgelaufene Google-
   * Anmeldung — der Zugang, den du wirklich nutzt — nur „Neu anmelden“ braucht.
   */
  const leadOf = (entry: PluginEntry) => {
    const variants = variantsOf(entry);
    return (
      variants.find((v) => statusOf(v).kind === 'verbunden') ??
      variants.find((v) => stateOf(v.id).installed && begun(v) && statusOf(v).kind !== 'ersetzt') ??
      variants.find((v) => stateOf(v.id).installed && statusOf(v).kind !== 'ersetzt') ??
      variants.find((v) => stateOf(v.id).installed) ??
      variants[0]!
    );
  };

  /** Einträge zu Karten: ein Dienst erscheint einmal, egal wie viele Zugänge er hat. */
  const cards = (entries: PluginEntry[]) => {
    const seen = new Set<string>();
    return entries.filter((e) => {
      const key = serviceKey(e);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const installedCards = cards(CATALOG.filter((e) => stateOf(e.id).installed)).map(leadOf);

  const builtIn = host?.builtIn;
  const unlisted = unlistedServers(CATALOG, servers).filter((s) => builtIn?.overridden || s.name !== builtIn?.name);
  const target = (def: { url?: string; command?: string; args?: string[] }) =>
    def.url ?? [def.command, ...(def.args ?? [])].filter(Boolean).join(' ');
  const ownServers: OwnServer[] = [
    ...(builtIn
      ? [{
          name: builtIn.name,
          title: builtIn.title,
          icon: builtIn.icon ?? 'mcp.svg',
          target: builtIn.target,
          note: builtIn.running
            ? `In Cortex · ${builtIn.sessions} ${builtIn.sessions === 1 ? 'Quelle' : 'Quellen'} offen`
            : 'In Cortex eingebaut',
          builtIn: true,
        }]
      : []),
    ...unlisted.map(({ name, def }) => ({
      name,
      title: name,
      icon: 'mcp.svg',
      target: target(def),
      note: `Selbst eingetragen · ${effective.origin[name] === 'projekt' ? 'Projekt' : 'Persönlich'}`,
      builtIn: false,
    })),
  ];

  const serverStatus = (name: string): PluginStatus => {
    if (host?.disabled?.includes(name)) return { kind: 'aus', label: 'Ausgeschaltet' };
    const c = host?.connections?.[name];
    if (!c) return { kind: 'ungeprueft', label: 'Nicht geprüft' };
    if (c.status === 'pruefe') return { kind: 'pruefe', label: 'Prüfe …' };
    if (c.status === 'verbunden') return { kind: 'verbunden', label: 'Verbunden', tools: c.tools?.length ?? 0 };
    if (c.status === 'anmeldung') return { kind: 'einrichtung', reason: 'anmeldung', label: 'Anmeldung nötig' };
    return { kind: 'fehler', label: 'Fehler', message: c.message ?? 'Der Server antwortet nicht.' };
  };

  return { effective, servers, stateOf, variantsOf, statusOf, leadOf, cards, installedCards, ownServers, serverStatus };
}

/** Der Satz für Tooltips und Listen — mit Beleg, wo es einen gibt. */
export function statusHint(status: PluginStatus, state?: PluginState): string {
  switch (status.kind) {
    case 'verbunden': {
      const at = state?.connection?.checkedAt;
      const time = at ? ` · geprüft ${clockTime(at)}` : '';
      return `Verbunden · ${status.tools} ${status.tools === 1 ? 'Werkzeug' : 'Werkzeuge'}${time}`;
    }
    case 'fehler':
      return `Fehler · ${status.message}`;
    case 'ersetzt':
      return `Über ${status.via} verbunden · ${status.tools} ${status.tools === 1 ? 'Werkzeug' : 'Werkzeuge'}`;
    case 'einrichtung':
      return status.label;
    case 'pruefe':
      return 'Verbindung wird geprüft';
    case 'ungeprueft':
      return 'Noch nicht geprüft';
    case 'aus':
      return 'Ausgeschaltet';
    default:
      return 'Nicht installiert';
  }
}
