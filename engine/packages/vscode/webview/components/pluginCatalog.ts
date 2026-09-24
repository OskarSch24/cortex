import catalogJson from '../../media/plugins/catalog.json';
import { parseCatalog, type PluginEntry } from '../../../core/src/plugins/catalog.js';

/**
 * Der Katalog ändert sich nur mit einem Build — er gehört deshalb ins Bündel
 * und nicht über die Leitung. Was über die Leitung geht, ist ausschließlich
 * das, was sich wirklich ändern kann: welche Server in mcp.json stehen, welche
 * Skills auf der Platte liegen, ob die Spiegelung angekommen ist.
 *
 * Derselbe Parser wie im Host: eine Datei, die dort durchfällt, fällt auch hier
 * durch, statt zwei Wahrheiten über denselben Text entstehen zu lassen.
 */
const parsed = parseCatalog(JSON.stringify(catalogJson));

export const CATALOG: PluginEntry[] = parsed.ok ? parsed.catalog.entries : [];

export const byId = (id: string): PluginEntry | undefined => CATALOG.find((e) => e.id === id);
