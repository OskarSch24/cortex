import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { AccountStatusDto, ConversationMeta, ProjectDto } from '../../src/panel/protocol.js';
import { Glyph } from '../components/CortexIcons.js';
import { startSettingsStore } from './store.js';
import { AllgemeinPage, DarstellungPage, ImportierenPage, KonfigurationPage, PersonalisierungPage, ProfilPage, StimmePage } from './pages/persoenlich.js';
import { TastaturPage } from './pages/tastatur.js';
import { AnalysenPage, KontoPage, NutzungPage } from './pages/konto.js';
import { AppshotsPage, ComputernutzungPage, ComputerverlaufPage, PluginsSettingsPage } from './pages/integrationen.js';
import { BrowserPage, browserCrumb } from './pages/browser.js';
import { GitPage, HooksPage, UmgebungenPage, VerbindungenPage, WorktreesPage, umgebungenCrumb } from './pages/programmierung.js';
import { ArchivPage } from './pages/archiv.js';

export type SectionId =
  | 'allgemein' | 'importieren' | 'profil' | 'darstellung' | 'stimme' | 'konfiguration' | 'personalisierung' | 'tastatur' | 'nutzung' | 'analysen' | 'konto'
  | 'computernutzung' | 'computerverlauf' | 'appshots' | 'plugins' | 'browser'
  | 'hooks' | 'verbindungen' | 'git' | 'umgebungen' | 'worktrees'
  | 'archiv';

export interface Route { id: SectionId; sub: string[] }

export interface SettingsContext {
  go: (route: Route) => void;
  sub: string[];
  accounts: AccountStatusDto[];
  projects: ProjectDto[];
  conversations: ConversationMeta[];
  archivedChats?: ConversationMeta[];
  archived: string[];
  onArchive: (project: ProjectDto) => void;
  permissionMode: string;
  askPermission: boolean;
  routingMode: 'auto' | 'manual';
  onPermission: (mode: string) => void;
  onAsk: (ask: boolean) => void;
  onRouting: (mode: 'auto' | 'manual') => void;
  openPlugin: (id?: string) => void;
  openTask: (id: string) => void;
}

interface NavItem { id: SectionId; label: string; icon: string; terms: string; external?: boolean }

/**
 * Die Seitenleiste nach Codex: vier Gruppen, gleiche Reihenfolge. „Pets“ gibt
 * es in Cortex nicht; „Archivierte Chats“ heißt hier „Archivierte Projekte“,
 * weil Cortex Projekte archiviert. Die Begriffe hinter jedem Eintrag speisen
 * die Suche oben — sie nennen, was auf der Seite steht.
 */
const NAV: Array<{ group: string; items: NavItem[] }> = [
  { group: 'Persönlich', items: [
    { id: 'allgemein', label: 'Allgemein', icon: 'gear', terms: 'Berechtigungen Vollzugriff Ordner Sprache Menüleiste Terminal Tätigkeiten Details Minimal Kompakt Ausführlich Energiesparmodus Geschwindigkeit Lizenzen Composer Senden Folgenachrichten Popout Benachrichtigungen Konfetti' },
    { id: 'importieren', label: 'Importieren', icon: 'download', terms: 'Import Synchronisierung Claude Code Codex Cursor' },
    { id: 'profil', label: 'Profil', icon: 'user', terms: 'Token Serie Aktivität Heatmap Modelle' },
    { id: 'darstellung', label: 'Darstellung', icon: 'sun', terms: 'Design Hell Dunkel Akzent Hintergrund Vordergrund Schriftart Kontrast Cursor Bewegung Schriftgröße Glättung' },
    { id: 'stimme', label: 'Stimme', icon: 'mic', terms: 'Mikrofon Sprachchat Diktat Wörterbuch Aufnahmen' },
    { id: 'konfiguration', label: 'Konfiguration', icon: 'shieldCode', terms: 'Genehmigung Sandbox Websuche Reasoning Routing Modell Arbeitsweise Zweitmeinung Vektor Database Studio' },
    { id: 'personalisierung', label: 'Personalisierung', icon: 'sparkle', terms: 'Anweisungen Erinnerung Gedächtnis' },
    { id: 'tastatur', label: 'Tastaturkürzel', icon: 'keyboard', terms: 'Tastenkürzel Hotkey Befehle' },
    { id: 'nutzung', label: 'Nutzung und Abrechnung', icon: 'gauge', terms: 'Tarif Abo Limit Kontingent Zurücksetzung' },
    { id: 'analysen', label: 'Analysen', icon: 'chart', terms: 'Nutzungsverlauf Produktaktivität Modelle Tool Aktivität' },
    { id: 'konto', label: 'Konto', icon: 'link', terms: 'Konten Anbieter Anmeldung Claude ChatGPT Grok' },
  ] },
  { group: 'Integrationen', items: [
    { id: 'computernutzung', label: 'Computernutzung', icon: 'cursorArrow', terms: 'Apps steuern Chrome Desktop-Browser gesperrt' },
    { id: 'computerverlauf', label: 'Computerverlauf', icon: 'history', terms: 'Verlauf Aktivitäten zusammenfassen' },
    { id: 'appshots', label: 'Appshots', icon: 'appshot', terms: 'Fenster Bildschirm Hotkey Soundeffekt' },
    { id: 'plugins', label: 'Plugins', icon: 'plug', terms: 'Apps MCP Server Skills Konnektoren' },
    { id: 'browser', label: 'Browser', icon: 'window', terms: 'URL Browserdaten Verlauf Screenshots Passwörter Kontaktdaten Downloads Website Kamera Mikrofon Cookies JavaScript Agentenberechtigungen CDP' },
  ] },
  { group: 'Programmierung', items: [
    { id: 'hooks', label: 'Hooks', icon: 'hook', terms: 'Lifecycle' },
    { id: 'verbindungen', label: 'Verbindungen', icon: 'network', terms: 'Fernsteuerung Geräte SSH' },
    { id: 'git', label: 'Git', icon: 'branch', terms: 'Branch Präfix Merge Force-Push Pull Request Review Commit' },
    { id: 'umgebungen', label: 'Umgebungen', icon: 'box', terms: 'Einrichtungsskript Bereinigungsskript Aktionen Projekt' },
    { id: 'worktrees', label: 'Worktrees', icon: 'worktree', terms: 'Stammverzeichnis Upstream löschen Limit' },
  ] },
  { group: 'Archiviert', items: [
    { id: 'archiv', label: 'Archivierte Chats und Projekte', icon: 'archive', terms: 'Archiv Dearchivieren Chats' },
  ] },
];

const ALL = NAV.flatMap(g => g.items);
const labelOf = (id: SectionId) => ALL.find(i => i.id === id)?.label ?? id;

export function SettingsApp({ initial, onBack, ...rest }: Omit<SettingsContext, 'go' | 'sub'> & { initial?: Route; onBack: () => void }) {
  const [history, setHistory] = useState<Route[]>([initial ?? { id: 'allgemein', sub: [] }]);
  const [cursor, setCursor] = useState(0);
  const route = history[cursor]!;
  const [query, setQuery] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { startSettingsStore(); }, []);
  useLayoutEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [cursor, history.length]);

  const go = (next: Route) => {
    const same = next.id === route.id && next.sub.join('/') === route.sub.join('/');
    if (same) return;
    setHistory(list => [...list.slice(0, cursor + 1), next].slice(-60));
    setCursor(c => Math.min(c + 1, 59));
  };
  const ctx: SettingsContext = { ...rest, go, sub: route.sub };

  // Gruppen der Leiste lassen sich zuklappen; die mit der offenen Seite bleibt immer offen.
  const [closedGroups, setClosedGroups] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem('cortex.einstellungen.zu') ?? '[]'); } catch { return []; } });
  const toggleGroup = (group: string) => setClosedGroups(list => {
    const next = list.includes(group) ? list.filter(g => g !== group) : [...list, group];
    try { localStorage.setItem('cortex.einstellungen.zu', JSON.stringify(next)); } catch { /* nur bis zum Neuladen */ }
    return next;
  });
  const q = query.trim().toLowerCase();
  const groups = NAV.map(g => ({ ...g, items: g.items.filter(i => !q || i.label.toLowerCase().includes(q) || i.terms.toLowerCase().includes(q)) })).filter(g => g.items.length);

  const crumbs = route.sub.length ? (route.id === 'plugins' ? [] : route.id === 'browser' ? browserCrumb(route.sub) : route.id === 'umgebungen' ? umgebungenCrumb(route.sub, rest.projects) : route.sub) : [];
  const short = route.id === 'umgebungen';

  return <div class="cxs-shell">
    <aside class="cxs-nav" aria-label="Einstellungen">
      <button type="button" class="cxs-back" onClick={onBack}><Glyph name="back" size={16} /><span>Zurück zur App</span></button>
      <label class="cxs-nav-search">
        <Glyph name="search" size={14} />
        <input value={query} placeholder="Einstellungen durchsuchen…" aria-label="Einstellungen durchsuchen" onInput={e => setQuery(e.currentTarget.value)} onKeyDown={e => {
          if (e.key === 'Enter' && groups[0]?.items[0]) { go({ id: groups[0].items[0].id, sub: [] }); }
          if (e.key === 'Escape') setQuery('');
        }} />
      </label>
      <nav class="cxs-nav-scroll">
        {groups.map(g => { const open = !!q || !closedGroups.includes(g.group) || g.items.some(item => item.id === route.id); return <section key={g.group} class={`cxs-nav-group ${open ? 'open' : ''}`}>
          <button type="button" class="cxs-nav-head" aria-expanded={open} onClick={() => toggleGroup(g.group)}>
            <span class="cxs-nav-chevron"><Glyph name="chevron" size={11} /></span>
            <h3>{g.group}</h3>
            {!open && <span class="cxs-nav-count" aria-hidden="true">{g.items.length}</span>}
          </button>
          {open && g.items.map(item => <button type="button" key={item.id} class={`cxs-nav-item ${route.id === item.id ? 'selected' : ''}`} aria-current={route.id === item.id ? 'page' : undefined} onClick={() => go({ id: item.id, sub: [] })}>
            <Glyph name={item.icon} size={16} />
            <span>{item.label}</span>
            {item.external && <span class="cxs-nav-trail"><Glyph name="arrowUpRight" size={14} /></span>}
          </button>)}
        </section>; })}
        {!groups.length && <p class="cxs-nav-none">Keine Einstellung gefunden.</p>}
      </nav>
    </aside>
    <main class="cxs-main">
      {crumbs.length > 0 && <div class={`cxs-crumbs ${short ? 'short' : ''}`}>
        {!short && <>
          <button type="button" class="cxs-crumb-arrow" aria-label="Zurück" disabled={cursor === 0} onClick={() => setCursor(c => Math.max(0, c - 1))}><Glyph name="back" size={16} /></button>
          <button type="button" class="cxs-crumb-arrow" aria-label="Vorwärts" disabled={cursor >= history.length - 1} onClick={() => setCursor(c => Math.min(history.length - 1, c + 1))}><Glyph name="forward" size={16} /></button>
          <Crumb label="Einstellungen" onClick={() => go({ id: 'allgemein', sub: [] })} />
          <Sep />
        </>}
        <Crumb label={labelOf(route.id)} onClick={() => go({ id: route.id, sub: [] })} />
        {crumbs.map((label, i) => <>
          <Sep />
          <Crumb label={label} current={i === crumbs.length - 1} onClick={() => go({ id: route.id, sub: route.sub.slice(0, i + 1) })} />
        </>)}
      </div>}
      <div class={`cxs-scroll ${crumbs.length ? 'below-crumbs' : ''}`} ref={scroller}>
        <Current id={route.id} ctx={ctx} />
      </div>
    </main>
  </div>;
}

function Crumb({ label, current, onClick }: { label: string; current?: boolean; onClick: () => void }) {
  return <button type="button" class={`cxs-crumb ${current ? 'current' : ''}`} aria-current={current ? 'page' : undefined} onClick={onClick}>{label}</button>;
}
const Sep = () => <span class="cxs-crumb-sep"><Glyph name="chevron" size={12} /></span>;

function Current({ id, ctx }: { id: SectionId; ctx: SettingsContext }): ComponentChildren {
  switch (id) {
    case 'allgemein': return <AllgemeinPage ctx={ctx} />;
    case 'importieren': return <ImportierenPage ctx={ctx} />;
    case 'profil': return <ProfilPage ctx={ctx} />;
    case 'darstellung': return <DarstellungPage />;
    case 'stimme': return <StimmePage />;
    case 'konfiguration': return <KonfigurationPage ctx={ctx} />;
    case 'personalisierung': return <PersonalisierungPage />;
    case 'tastatur': return <TastaturPage />;
    case 'nutzung': return <NutzungPage ctx={ctx} />;
    case 'analysen': return <AnalysenPage />;
    case 'konto': return <KontoPage ctx={ctx} />;
    case 'computernutzung': return <ComputernutzungPage />;
    case 'computerverlauf': return <ComputerverlaufPage />;
    case 'appshots': return <AppshotsPage />;
    case 'plugins': return <PluginsSettingsPage ctx={ctx} />;
    case 'browser': return <BrowserPage ctx={ctx} />;
    case 'hooks': return <HooksPage />;
    case 'verbindungen': return <VerbindungenPage />;
    case 'git': return <GitPage />;
    case 'umgebungen': return <UmgebungenPage ctx={ctx} />;
    case 'worktrees': return <WorktreesPage />;
    case 'archiv': return <ArchivPage ctx={ctx} />;
  }
}

export { useHost } from '../hooks/useHostMessage.js';
