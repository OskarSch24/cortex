import { useEffect, useState } from 'preact/hooks';
import type { TaskMetric } from '@cortex/core';
import type { AccountStatusDto } from '../../../src/panel/protocol.js';
import { CortexMark, Glyph } from '../../components/CortexIcons.js';
import { PluginMark } from '../../components/pluginIcons.js';
import { CATALOG } from '../../components/pluginCatalog.js';
import { pluginStates } from '../../../../core/src/plugins/installed.js';
import { vscode } from '../../vscodeApi.js';
import { PROMPT_EINBETTUNG, PROMPT_NOTIZEN, PROMPT_SPEICHERN, PROMPT_SUCHE } from '../../../src/memory/vorgaben.js';
import { STANDARD_BEREICHE, type Suchbereich } from '../../../src/memory/bereiche.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useHost } from '../SettingsApp.js';
import { ACCENTS, CODE_FONTS, THEME_DEFAULTS, UI_FONTS, setAppSetting, useApp, useNative, appSetting } from '../store.js';
import { Button, Card, ColorField, Empty, Link, MultiSelect, Page, Row, Section, Segmented, Select, Slider, TextArea, TextField, Toggle, type Option } from '../ui.js';

/* ── Allgemein ─────────────────────────────────────────────────────────────── */

export function AllgemeinPage({ ctx }: { ctx: SettingsContext }) {
  const [ordner] = useApp('allgemein.ordnerOhneProjekt', '~/Documents/Cortex');
  const [ziel, setZiel] = useApp('allgemein.dateiZiel', 'cortex');
  const [sprache, setSprache] = useApp('allgemein.sprache', 'auto');
  const [menue, setMenue] = useApp('allgemein.menueleiste', true);
  const [leiste, setLeiste] = useApp('allgemein.untereLeiste', true);
  const [terminal, setTerminal] = useNative<'panel' | 'beside'>('cortex.terminalLocation', 'panel');
  const [activity, setActivity] = useNative('cortex.activityVerbosity', 'compact');
  const [wach, setWach] = useApp('allgemein.wachHalten', false);
  const [tempo, setTempo] = useApp('allgemein.geschwindigkeit', 'schnell');
  const [plugins, setPlugins] = useApp('allgemein.plugins', true);
  const [nurText, setNurText] = useApp('composer.nurText', false);
  const [kontext, setKontext] = useApp('composer.kontextfenster', false);
  const [senden, setSenden] = useApp('composer.senden', 'enter');
  const [folge, setFolge] = useApp('composer.folgenachrichten', 'warteschlange');
  const [popout, setPopout] = useApp('popout.eigenstaendig', false);
  const [fertig, setFertig] = useApp('benachrichtigung.fertig', 'inaktiv');
  const [rechte, setRechte] = useApp('benachrichtigung.rechte', true);
  const [fragen, setFragen] = useApp('benachrichtigung.fragen', true);
  const [konfetti, setKonfetti] = useApp('spielerei.konfetti', false);
  const [audio, setAudio] = useApp('spielerei.audio', false);
  const full = ctx.permissionMode === 'full';
  const standard = ctx.permissionMode !== 'safe';

  return <Page title="Allgemein">
    <Section title="Berechtigungen">
      <Card>
        <Row title="Standardberechtigungen" sub={<>Standardmäßig kann Cortex Dateien in seinem Workspace lesen<br />und bearbeiten. Bei Bedarf kann es zusätzlichen Zugriff anfordern.</>}>
          <Toggle label="Standardberechtigungen" on={standard} disabled={full} onChange={on => ctx.onPermission(on ? 'edits' : 'safe')} />
        </Row>
        <Row title="Vollzugriff" sub={<>Wenn Cortex mit Vollzugriff ausgeführt wird, kann es jede Datei auf deinem Computer bearbeiten<br />und ohne deine Zustimmung Befehle mit Netzwerkzugriff ausführen. Das erhöht das Risiko von<br />Datenverlust, Datenlecks oder unerwartetem Verhalten erheblich. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://github.com/OskarSch24/cortex#berechtigungen' })}>Mehr erfahren</Link> über erhöhte Risiken.</>}>
          <Toggle label="Vollzugriff" on={full} onChange={on => ctx.onPermission(on ? 'full' : 'edits')} />
        </Row>
      </Card>
    </Section>
    <Section title="Allgemein">
      <Card>
        <Row pending title="Ordner für Aufgaben ohne Projekt" sub={<>Der Speicherort, an dem Aufgaben, die außerhalb von Projekten<br />gestartet wurden, standardmäßig ihre Daten speichern.</>}>
          <span class="cxs-path" title={ordner}>{shortPath(ordner)}</span>
          <Button onClick={() => vscode.postMessage({ kind: 'pickAppSettingFolder', key: 'allgemein.ordnerOhneProjekt' })}>Ändern</Button>
        </Row>
        <Row pending title="Standardziel zum Öffnen von Dateien" sub="Wo Dateien und Ordner standardmäßig geöffnet werden">
          <Select label="Standardziel" value={ziel} onChange={setZiel} icon={<span class="cxs-app-dot"><CortexMark size={14} /></span>} options={[
            { value: 'cortex', label: 'Cortex' }, { value: 'default', label: 'Standard-App' }, { value: 'finder', label: 'Finder' }, { value: 'xcode', label: 'Xcode' },
          ]} />
        </Row>
        <Row pending title="Sprache" sub="Sprache der App-Oberfläche">
          <Select label="Sprache" value={sprache} onChange={setSprache} options={[{ value: 'auto', label: 'Automatisch erkennen' }, { value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
        </Row>
        <Row pending title="In Menüleiste anzeigen" sub="Cortex in der macOS-Menüleiste behalten, wenn das Hauptfenster geschlossen wird">
          <Toggle label="In Menüleiste anzeigen" on={menue} onChange={setMenue} />
        </Row>
        <Row pending title="Untere Leiste" sub="Steuerelement für das untere Bedienfeld in der App-Kopfzeile anzeigen">
          <Toggle label="Untere Leiste" on={leiste} onChange={setLeiste} />
        </Row>
        <Row title="Standard-Terminalspeicherort" sub="Wähle aus, wo der Terminal-Kurzbefehl und Umgebungsaktionen Terminal-Tabs öffnen">
          <Segmented label="Terminalspeicherort" value={terminal} onChange={setTerminal} options={[{ value: 'panel', label: 'Unten' }, { value: 'beside', label: 'Rechts' }]} />
        </Row>
        <Row title="Details der Tätigkeiten" sub="Wie viel Cortex beim Arbeiten zeigt. Befehle und Pfade bleiben im ausführlichen Modus vollständig einsehbar.">
          <Select label="Details der Tätigkeiten" value={activity} onChange={setActivity} options={[{ value: 'minimal', label: 'Minimal', hint: 'Nur zusammengefasste Tätigkeiten' }, { value: 'compact', label: 'Kompakt', hint: 'Verständliche Zeilen mit aufklappbaren Details' }, { value: 'detailed', label: 'Ausführlich', hint: 'Alle Befehle, Pfade und Details aufgeklappt' }]} />
        </Row>
        <Row pending title="Energiesparmodus während der Ausführung verhindern" sub="Der Ruhezustand des Computers wird verhindert, während Cortex eine Aufgabe ausführt.">
          <Toggle label="Energiesparmodus verhindern" on={wach} onChange={setWach} />
        </Row>
        <Row pending title="Geschwindigkeit" sub="Lege fest, wie schnell Cortex in Chats, Subagenten und bei der Komprimierung ausgeführt wird">
          <Select label="Geschwindigkeit" value={tempo} onChange={setTempo} options={[{ value: 'schnell', label: 'Schnell' }, { value: 'standard', label: 'Standard' }, { value: 'gruendlich', label: 'Gründlich' }]} />
        </Row>
        <Row title="Open-Source-Lizenzen" sub="Hinweise Dritter für gebündelte Abhängigkeiten">
          <Button onClick={() => vscode.postMessage({ kind: 'openLicenses' })}>Anzeigen</Button>
        </Row>
        <Row pending title="Plugins" sub="Zulassen, dass Cortex installierte Plugins verwenden kann">
          <Toggle label="Plugins" on={plugins} onChange={setPlugins} />
        </Row>
      </Card>
    </Section>
    <Section title="Composer">
      <Card>
        <Row pending title="Nur-Text-Composer" sub="Code, Markdown und Links beim Verfassen von Nachrichten als reinen Text beibehalten">
          <Toggle label="Nur-Text-Composer" on={nurText} onChange={setNurText} />
        </Row>
        <Row pending title="Nutzung des Kontextfensters anzeigen">
          <Toggle label="Kontextfenster anzeigen" on={kontext} onChange={setKontext} />
        </Row>
        <Row title="Tastenkürzel zum Senden" sub="Lege fest, wann die Eingabetaste einen Prompt sendet oder eine neue Zeile einfügt">
          <Select label="Tastenkürzel zum Senden" value={senden} onChange={setSenden} options={[{ value: 'enter', label: 'Enter', hint: '⇧⏎ fügt eine neue Zeile ein' }, { value: 'cmd-enter', label: '⌘ Enter', hint: '⏎ fügt eine neue Zeile ein' }]} />
        </Row>
        <Row pending title="Verhalten bei Folgenachrichten" sub={<>Stelle Folgenachrichten in die Warteschlange, während<br />Cortex ausgeführt wird, oder steuere den aktuellen Durchlauf.<br />Drücke ⌘⏎, um das Verhalten für eine Nachricht umzukehren.</>}>
          <Segmented label="Folgenachrichten" value={folge} onChange={setFolge} options={[{ value: 'warteschlange', label: 'In Warteschlange stellen' }, { value: 'steuern', label: 'Steuern' }]} />
        </Row>
      </Card>
    </Section>
    <Section title="Popout-Fenster">
      <Card>
        <Row pending title="Tastenkürzel für Popout-Fenster" sub="Globales Tastenkürzel für das Popout-Fenster festlegen. Unbelegt lassen, um es ausgeschaltet zu lassen.">
          <span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit onClick={() => vscode.postMessage({ kind: 'openKeybindings', query: 'cortex' })} /></span>
        </Row>
        <Row pending title="Standardmäßig eigenständigen Chat verwenden" sub="Neue Chats außerhalb von Projekten starten">
          <Toggle label="Eigenständiger Chat" on={popout} onChange={setPopout} />
        </Row>
      </Card>
    </Section>
    <Section title="Benachrichtigungen">
      <Card>
        <Row pending title="Benachrichtigungen bei Completions" sub="Lege fest, wann Cortex dich benachrichtigen soll, dass es fertig ist">
          <Select label="Benachrichtigungen bei Completions" value={fertig} onChange={setFertig} options={[{ value: 'inaktiv', label: 'Nur wenn Cortex nicht aktiv ist' }, { value: 'immer', label: 'Immer' }, { value: 'nie', label: 'Nie' }]} />
        </Row>
        <Row pending title="Berechtigungsbenachrichtigungen aktivieren" sub="Warnungen anzeigen, wenn Benachrichtigungsberechtigungen erforderlich sind">
          <Toggle label="Berechtigungsbenachrichtigungen" on={rechte} onChange={setRechte} />
        </Row>
        <Row pending title="Benachrichtigungen für Fragen aktivieren" sub="Zeige Benachrichtigungen an, wenn zum Fortfahren eine Eingabe erforderlich ist.">
          <Toggle label="Benachrichtigungen für Fragen" on={fragen} onChange={setFragen} />
        </Row>
      </Card>
    </Section>
    <EditorSection />
    <Section title="Spielereien">
      <Card>
        <Row pending title="Konfettikanone" sub="Lass Cortex in der App auf Wunsch Konfetti abfeuern!">
          <Toggle label="Konfettikanone" on={konfetti} onChange={setKonfetti} />
        </Row>
        <Row pending title="Audio-Visualisierung" sub={<>Gesprächsleisten mit Systemaudio animieren. Audio wird auf<br />deinem Gerät verarbeitet und nie gespeichert oder hochgeladen.</>}>
          <Toggle label="Audio-Visualisierung" on={audio} onChange={setAudio} />
        </Row>
      </Card>
    </Section>
  </Page>;
}

/** Die Werte von Code-OSS, die früher auf der alten Einstellungsseite standen. */
function EditorSection() {
  const [font, setFont] = useNative('editor.fontSize', 14);
  const [family, setFamily] = useNative('editor.fontFamily', 'Menlo, monospace');
  const [tab, setTab] = useNative('editor.tabSize', 4);
  const [spaces, setSpaces] = useNative('editor.insertSpaces', true);
  const [wrap, setWrap] = useNative('editor.wordWrap', 'off');
  const [minimap, setMinimap] = useNative('editor.minimap.enabled', true);
  const [lines, setLines] = useNative('editor.lineNumbers', 'on');
  const [format, setFormat] = useNative('editor.formatOnSave', false);
  const [save, setSave] = useNative('files.autoSave', 'off');
  const [trim, setTrim] = useNative('files.trimTrailingWhitespace', false);
  const [newline, setNewline] = useNative('files.insertFinalNewline', false);
  const [termFont, setTermFont] = useNative('terminal.integrated.fontSize', 14);
  const [cursor, setCursor] = useNative('terminal.integrated.cursorStyle', 'block');
  const num = (set: (n: number) => void, min: number, max: number) => (v: string) => { const n = Math.round(Number(v)); if (n >= min && n <= max) set(n); };
  return <Section title="Editor und Terminal" actions={<Button kind="ghost" onClick={() => vscode.postMessage({ kind: 'openNativeSettings', query: '' })}>Alle Einstellungen</Button>}>
    <Card>
      <Row title="Schriftgröße im Editor" sub="Grundgröße im Code-Editor von Cortex"><TextField label="Schriftgröße im Editor" type="number" min={6} max={100} width={64} value={font} suffix="px" onCommit={num(setFont, 6, 100)} /></Row>
      <Row title="Schriftart im Editor" sub="Wie in CSS, mehrere Schriften durch Komma getrennt"><TextField label="Schriftart im Editor" value={family} width={224} onCommit={setFamily} /></Row>
      <Row title="Tabulatorbreite" sub="Anzahl der Leerzeichen, die ein Tabulator entspricht"><TextField label="Tabulatorbreite" type="number" min={1} max={16} width={64} value={tab} onCommit={num(setTab, 1, 16)} /></Row>
      <Row title="Leerzeichen statt Tabulatoren" sub="Beim Einrücken Leerzeichen einfügen"><Toggle label="Leerzeichen statt Tabulatoren" on={spaces} onChange={setSpaces} /></Row>
      <Row title="Zeilenumbruch" sub="Lange Zeilen im Editor umbrechen"><Select label="Zeilenumbruch" value={wrap} onChange={setWrap} options={[{ value: 'off', label: 'Aus' }, { value: 'on', label: 'Am Fensterrand' }, { value: 'wordWrapColumn', label: 'An der Spalte' }, { value: 'bounded', label: 'Begrenzt' }]} /></Row>
      <Row title="Zeilennummern" sub="Nummern am linken Rand des Editors"><Select label="Zeilennummern" value={lines} onChange={setLines} options={[{ value: 'on', label: 'Ein' }, { value: 'relative', label: 'Relativ' }, { value: 'interval', label: 'Jede zehnte' }, { value: 'off', label: 'Aus' }]} /></Row>
      <Row title="Minimap anzeigen" sub="Die Übersichtsleiste am rechten Rand des Editors"><Toggle label="Minimap" on={minimap} onChange={setMinimap} /></Row>
      <Row title="Beim Speichern formatieren" sub="Den Formatierer der Sprache beim Speichern anwenden"><Toggle label="Beim Speichern formatieren" on={format} onChange={setFormat} /></Row>
      <Row title="Automatisch speichern" sub="Wann geänderte Dateien ohne Rückfrage gespeichert werden"><Select label="Automatisch speichern" value={save} onChange={setSave} options={[{ value: 'off', label: 'Aus' }, { value: 'afterDelay', label: 'Nach kurzer Pause' }, { value: 'onFocusChange', label: 'Beim Fokuswechsel' }, { value: 'onWindowChange', label: 'Beim Fensterwechsel' }]} /></Row>
      <Row title="Leerzeichen am Zeilenende entfernen" sub="Beim Speichern überflüssige Leerzeichen löschen"><Toggle label="Leerzeichen entfernen" on={trim} onChange={setTrim} /></Row>
      <Row title="Abschließenden Zeilenumbruch einfügen" sub="Jede Datei endet beim Speichern mit einer leeren Zeile"><Toggle label="Abschließender Zeilenumbruch" on={newline} onChange={setNewline} /></Row>
      <Row title="Schriftgröße im Terminal" sub="Grundgröße im integrierten Terminal"><TextField label="Schriftgröße im Terminal" type="number" min={6} max={100} width={64} value={termFont} suffix="px" onCommit={num(setTermFont, 6, 100)} /></Row>
      <Row title="Terminal-Cursor" sub="Form des Cursors im Terminal"><Segmented label="Terminal-Cursor" value={cursor} onChange={setCursor} options={[{ value: 'block', label: 'Block' }, { value: 'line', label: 'Linie' }, { value: 'underline', label: 'Unterstrich' }]} /></Row>
      <Row title="Ansicht" sub="Den Editorbereich teilen, schließen oder alle Befehle aufrufen"><Button onClick={() => vscode.postMessage({ kind: 'workbenchAction', action: 'split' })}>Teilen</Button><Button onClick={() => vscode.postMessage({ kind: 'workbenchAction', action: 'commands' })}>Befehle</Button></Row>
    </Card>
  </Section>;
}

export function IconEdit({ onClick, label = 'Bearbeiten' }: { onClick?: () => void; label?: string }) {
  return <button type="button" class="cxs-icon-button" aria-label={label} title={label} onClick={e => { e.stopPropagation(); onClick?.(); }}><Glyph name="edit" size={13} /></button>;
}

export function shortPath(path: string): string {
  const home = /^\/Users\/[^/]+/.exec(path);
  const p = home ? '~' + path.slice(home[0].length) : path;
  return p.length > 26 ? `${p.slice(0, 10)}…${p.slice(-14)}` : p;
}

/* ── Importieren ───────────────────────────────────────────────────────────── */

export function ImportierenPage({ ctx }: { ctx: SettingsContext }) {
  const [sync, setSync] = useApp('import.synchron', false);
  const imports = useHost<{ found?: Array<{ id: string; name: string; path: string }> }>('imports', { kind: 'detectImports' }, {});
  const plugins = useHost<{ scopes?: Array<{ servers: Record<string, never> }>; skills?: string[] }>('plugins', { kind: 'getPlugins' }, {});
  const servers = Object.assign({}, ...(plugins.scopes ?? []).map(s => s.servers));
  const states = plugins.scopes ? pluginStates(CATALOG, servers, new Set(plugins.skills ?? [])) : undefined;
  const open = CATALOG.filter(e => states?.get(e.id)?.needsSecret);
  const withoutProject = ctx.projects.filter(p => p.missing);
  return <Page title="Importieren" subtitle="Einstellungen, Projekte und Chats aus anderen KI-Apps in Cortex übernehmen">
    <Section title="Automatische Synchronisierung" big>
      <Card>
        <Row pending title="Importe synchron halten" sub={sync ? 'Synchronisierung aktiv. Deine Inhaltsauswahl ist gespeichert.' : 'Synchronisierung pausiert. Deine Inhaltsauswahl ist gespeichert.'}>
          <Toggle label="Importe synchron halten" on={sync} onChange={setSync} />
        </Row>
        <Row title="Zu synchronisierende Inhalte" sub="Nach dem ersten Import verfügbar"><Button disabled>Anpassen</Button></Row>
      </Card>
    </Section>
    <Section title="Aus einer anderen KI-App importieren" big subtitle={imports.found ? 'Erkanntes Setup, das zu Cortex hinzugefügt werden kann' : undefined}>
      <Card>
        {!imports.found && <Row title="Suche nach Importen" sub="Kompatible Setups, Projekte und letzte Chats werden gesucht"><span class="cxs-spinner" /></Row>}
        {imports.found?.map(item => <Row key={item.id} pending icon={<span class={`cxs-app-tile ${item.id}`}><Glyph name={item.id === 'claude-code' ? 'code' : item.id === 'codex' ? 'terminal' : 'cube'} size={18} /></span>} title={item.name} sub={shortPath(item.path)}>
          <Button disabled title="Der Import folgt noch.">Importieren</Button>
        </Row>)}
        {imports.found && !imports.found.length && <Row title="Keine andere KI-App gefunden" sub="Cortex hat unter ~/.claude, ~/.codex, ~/.cursor und ~/.grok nichts gefunden." />}
        {withoutProject.length > 0 && <div class="cxs-notice"><Glyph name="warn" size={14} /><div><strong>{withoutProject.length === 1 ? '1 Projekt kann nicht importiert werden' : `${withoutProject.length} Projekte können nicht importiert werden`}</strong><span>{withoutProject.map(p => p.name).join(', ')} {withoutProject.length === 1 ? 'hat' : 'haben'} keinen erreichbaren Ordner</span></div></div>}
      </Card>
    </Section>
    <Section title="Aufmerksamkeit erforderlich" big subtitle="Einrichtung von Elementen aus einem früheren Import abschließen">
      <Card class="cxs-attention">
        <div class="cxs-chip-row"><span class="cxs-chip">{states ? `Plugins (${open.length})` : 'Plugins'}</span></div>
        {!states && <div class="cxs-loading"><span class="cxs-spinner" /><span>Importierte Plugins werden geladen…</span></div>}
        {states && !open.length && <div class="cxs-loading"><span>Alle installierten Plugins sind eingerichtet.</span></div>}
        {open.map(entry => <div class="cxs-plugin-line" key={entry.id}>
          <PluginMark icon={entry.icon} name={entry.name} size="sm" />
          <div><strong>{entry.name}</strong><small>{entry.tagline}</small></div>
          <Button kind="outline" onClick={() => ctx.openPlugin(entry.id)}>Einrichten</Button>
        </div>)}
      </Card>
    </Section>
  </Page>;
}

/* ── Profil ────────────────────────────────────────────────────────────────── */

type Analytics = { metrics?: TaskMetric[]; accounts?: AccountStatusDto[] };

export function ProfilPage({ ctx }: { ctx: SettingsContext }) {
  const data = useHost<Analytics>('analytics', { kind: 'getAnalytics' }, {});
  const [scale, setScale] = useState<'tag' | 'woche' | 'kumuliert'>('tag');
  const metrics = data.metrics ?? [];
  const identity = ctx.accounts.find(a => a.identity)?.identity;
  const name = identity?.split('@')[0] ?? 'Cortex';
  const initials = name.replace(/[^a-zA-ZÄÖÜäöü ]/g, ' ').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CX';
  const tokens = metrics.reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0);
  const byDay = new Map<string, number>();
  for (const m of metrics) { const d = dayKey(m.timestamp); byDay.set(d, (byDay.get(d) ?? 0) + (m.inputTokens ?? 0) + (m.outputTokens ?? 0) || (byDay.get(d) ?? 0) + 1); }
  const peak = Math.max(0, ...byDay.values());
  const longest = metrics.reduce((max, m) => Math.max(max, m.durationMs ?? 0), 0);
  const { current, best } = streaks([...byDay.keys()]);
  const models = new Map<string, number>();
  for (const m of metrics) models.set(m.model ?? m.provider, (models.get(m.model ?? m.provider) ?? 0) + 1);
  const topModels = [...models.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const failover = metrics.filter(m => m.status === 'failover').length;
  const efforts = new Map<string, number>();
  for (const m of metrics) if (m.effort) efforts.set(m.effort, (efforts.get(m.effort) ?? 0) + 1);
  const topEffort = [...efforts.entries()].sort((a, b) => b[1] - a[1])[0];
  return <div class="cxs-profile">
    <div class="cxs-profile-bar">
      <span>Profil</span>
      <div>
        <button type="button" onClick={() => ctx.go({ id: 'konto', sub: [] })}><Glyph name="link" size={14} />Konten verwalten</button>
        <button type="button" onClick={() => vscode.postMessage({ kind: 'openAnalytics' })}><Glyph name="share" size={14} />Analysen öffnen</button>
        <button type="button" class="dim" disabled><Glyph name="lock" size={14} />Privat</button>
      </div>
    </div>
    <div class="cxs-profile-body">
      <div class="cxs-avatar">{initials}</div>
      <h1>{name}</h1>
      <p class="cxs-handle">{identity ? `@${name}` : 'Keine Anmeldung erkannt'}<span>·</span><b>{ctx.accounts.length === 1 ? '1 Konto' : `${ctx.accounts.length} Konten`}</b></p>
      <div class="cxs-stats">
        <div><strong>{compact(tokens)}</strong><span>Token insgesamt</span></div>
        <div><strong>{compact(peak)}</strong><span>Spitzenwert am Tag</span></div>
        <div><strong>{duration(longest)}</strong><span>Längster Lauf</span></div>
        <div><strong>{current === 1 ? '1 Tag' : `${current} Tage`}</strong><span>Aktuelle Serie</span></div>
        <div><strong>{best === 1 ? '1 Tag' : `${best} Tage`}</strong><span>Längste Serie</span></div>
      </div>
      <div class="cxs-heat-head"><strong>Tokennutzung</strong><div class="cxs-plain-tabs">{(['tag', 'woche', 'kumuliert'] as const).map(s => <button type="button" key={s} class={scale === s ? 'on' : ''} onClick={() => setScale(s)}>{s === 'tag' ? 'Täglich' : s === 'woche' ? 'Wöchentlich' : 'Kumuliert'}</button>)}</div></div>
      <Heatmap byDay={byDay} scale={scale} />
      <div class="cxs-insights">
        <div>
          <strong>Aktivitätseinblicke</strong>
          <p><span>Chats insgesamt</span><b>{ctx.conversations.length.toLocaleString('de-DE')}</b></p>
          <p><span>Läufe insgesamt</span><b>{metrics.length.toLocaleString('de-DE')}</b></p>
          <p><span>Meistgenutzter Denkaufwand</span><b>{topEffort ? `${effortLabel(topEffort[0])} · ${Math.round((topEffort[1] / metrics.length) * 100)} %` : '–'}</b></p>
          <p><span>Kontowechsel bei Limits</span><b>{failover.toLocaleString('de-DE')}</b></p>
          <p><span>Projekte</span><b>{ctx.projects.length.toLocaleString('de-DE')}</b></p>
        </div>
        <div>
          <strong>Meistgenutzte Modelle</strong>
          {topModels.map(([model, count]) => <p key={model}><span class="cxs-model"><Glyph name="bolt" size={13} />{model}</span><b>{count === 1 ? '1 Lauf' : `${count.toLocaleString('de-DE')} Läufe`}</b></p>)}
          {!topModels.length && <p><span class="cxs-dim">{data.metrics ? 'Noch keine Läufe aufgezeichnet' : 'Wird geladen …'}</span></p>}
        </div>
      </div>
    </div>
  </div>;
}

function Heatmap({ byDay, scale }: { byDay: Map<string, number>; scale: 'tag' | 'woche' | 'kumuliert' }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(start.getDate() - 7 * 52 - ((today.getDay() + 6) % 7));
  const days: Array<{ key: string; date: Date }> = [];
  for (const d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) days.push({ key: dayKey(d.getTime()), date: new Date(d) });
  let running = 0;
  const values = days.map(({ key }, i) => {
    if (scale === 'kumuliert') { running += byDay.get(key) ?? 0; return running; }
    if (scale === 'woche') { const w = Math.floor(i / 7) * 7; return days.slice(w, w + 7).reduce((s, d) => s + (byDay.get(d.key) ?? 0), 0); }
    return byDay.get(key) ?? 0;
  });
  const max = Math.max(1, ...values);
  const weeks = Math.ceil(days.length / 7);
  const months: Array<{ col: number; label: string }> = [];
  days.forEach((d, i) => { if (d.date.getDate() === 1) months.push({ col: Math.floor(i / 7), label: d.date.toLocaleString('de-DE', { month: 'short' }).replace('.', '') }); });
  return <div class="cxs-heat">
    <div class="cxs-heat-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
      {days.map((d, i) => { const v = values[i]!; const level = v === 0 ? 0 : Math.min(4, 1 + Math.floor((v / max) * 3.999)); return <i key={d.key} class={`l${level}`} style={{ gridRow: ((d.date.getDay() + 6) % 7) + 1, gridColumn: Math.floor(i / 7) + 1 }} title={`${d.date.toLocaleDateString('de-DE')}: ${v.toLocaleString('de-DE')}`} />; })}
    </div>
    <div class="cxs-heat-months" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>{months.map(m => <span key={`${m.col}${m.label}`} style={{ gridColumn: m.col + 1 }}>{m.label}</span>)}</div>
  </div>;
}

const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
function streaks(keys: string[]): { current: number; best: number } {
  const set = new Set(keys);
  let best = 0, run = 0;
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 400);
  for (let i = 0; i <= 400; i++) { run = set.has(dayKey(d.getTime())) ? run + 1 : 0; best = Math.max(best, run); d.setDate(d.getDate() + 1); }
  let current = 0; const c = new Date(); c.setHours(0, 0, 0, 0);
  if (!set.has(dayKey(c.getTime()))) c.setDate(c.getDate() - 1);
  while (set.has(dayKey(c.getTime()))) { current++; c.setDate(c.getDate() - 1); }
  return { current, best };
}
export const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd.` : n >= 1e6 ? `${(n / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.` : n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString('de-DE')} Tsd.` : n.toLocaleString('de-DE');
const duration = (ms: number) => { if (!ms) return '–'; const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)} Std. ${m % 60} Min.` : m ? `${m} Min.` : `${Math.round(ms / 1000)} Sek.`; };
const effortLabel = (e: string) => ({ minimal: 'Minimal', low: 'Gering', medium: 'Mittel', high: 'Hoch', xhigh: 'Sehr hoch', max: 'Max.' } as Record<string, string>)[e] ?? e;

/* ── Darstellung ───────────────────────────────────────────────────────────── */

export function DarstellungPage() {
  const [design, setDesign] = useApp('darstellung.design', 'dunkel');
  const [zeiger, setZeiger] = useApp('darstellung.zeiger', true);
  const [dock, setDock] = useApp('darstellung.dockSymbol', 'cortex');
  const [bewegung, setBewegung] = useApp('darstellung.bewegung', 'system');
  const [ui, setUi] = useApp('darstellung.uiSchrift', 13);
  const [code, setCode] = useApp('darstellung.codeSchrift', 12);
  const [marken, setMarken] = useApp('darstellung.diffMarken', 'farbe');
  const [glatt, setGlatt] = useApp('darstellung.glaettung', true);
  const before = { surface: 'rail', accent: themeValue('dunkel', 'akzent'), contrast: 42 };
  const after = { surface: 'rail-raised', accent: ACCENTS[themeValue('dunkel', 'akzent') as string]?.dunkel ?? '#EDEDEE', contrast: themeValue('dunkel', 'kontrast') };
  return <Page title="Darstellung">
    <Section title="Design">
      <div class="cxs-theme-tiles">
        {([['system', 'System'], ['hell', 'Hell'], ['dunkel', 'Dunkel']] as const).map(([value, label]) => <button type="button" key={value} class={`cxs-theme-tile ${value} ${design === value ? 'on' : ''}`} aria-pressed={design === value} onClick={() => setDesign(value)}>
          <span class="cxs-theme-art"><i /><i /><b><em /><em /><em /></b></span>
          <span>{label}</span>
        </button>)}
      </div>
      <div class="cxs-diff" aria-hidden="true">
        <div class="old">
          <p><i>1</i><code><span class="tk">const</span> themePreview: <span class="tt">ThemeConfig</span> = {'{'}</code></p>
          <p class="del"><i>2</i><code>  surface: <span class="ts">"{before.surface}"</span>,</code></p>
          <p class="del"><i>3</i><code>  accent: <span class="ts">"#8B96C9"</span>,</code></p>
          <p class="del"><i>4</i><code>  contrast: <span class="tn">{before.contrast}</span>,</code></p>
          <p><i>5</i><code>{'};'}</code></p>
        </div>
        <div class="new">
          <p><i>1</i><code><span class="tk">const</span> themePreview: <span class="tt">ThemeConfig</span> = {'{'}</code></p>
          <p class="add"><i>2</i><code>  surface: <span class="ts">"{after.surface}"</span>,</code></p>
          <p class="add"><i>3</i><code>  accent: <span class="ts">"{after.accent}"</span>,</code></p>
          <p class="add"><i>4</i><code>  contrast: <span class="tn">{after.contrast}</span>,</code></p>
          <p><i>5</i><code>{'};'}</code></p>
        </div>
      </div>
      <ThemeCard mode="hell" />
      <ThemeCard mode="dunkel" />
    </Section>
    <Section title="Einstellungen">
      <Card>
        <Row title="Zeiger-Cursor verwenden" sub="Cursor beim Überfahren interaktiver Elemente in einen Zeiger ändern"><Toggle label="Zeiger-Cursor" on={zeiger} onChange={setZeiger} /></Row>
        <Row pending title="Dock-Symbol" sub="Wähle das Symbol aus, das die App im Dock verwendet" class="tall">
          <div class="cxs-dock-icons">
            {(['cortex', 'dunkel'] as const).map(v => <button type="button" key={v} class={dock === v ? 'on' : ''} aria-pressed={dock === v} aria-label={v === 'cortex' ? 'Cortex-Symbol' : 'Dunkles Symbol'} onClick={() => setDock(v)}><span class={v}><CortexMark size={30} /></span></button>)}
          </div>
        </Row>
        <Row title="Bewegung reduzieren" sub="Animationen reduzieren oder dem System folgen"><Segmented label="Bewegung reduzieren" value={bewegung} onChange={setBewegung} options={[{ value: 'system', label: 'System' }, { value: 'ein', label: 'Ein' }, { value: 'aus', label: 'Aus' }]} /></Row>
        <Row title="UI-Schriftgröße" sub="Grundschriftgröße für die Cortex-Benutzeroberfläche anpassen"><TextField label="UI-Schriftgröße" type="number" min={10} max={20} width={64} value={ui} suffix="px" onCommit={v => { const n = Math.round(Number(v)); if (n >= 10 && n <= 20) setUi(n); }} /></Row>
        <Row title="Code-Schriftgröße" sub="Grundgröße für Code in Chats und Diffs anpassen"><TextField label="Code-Schriftgröße" type="number" min={9} max={20} width={64} value={code} suffix="px" onCommit={v => { const n = Math.round(Number(v)); if (n >= 9 && n <= 20) setCode(n); }} /></Row>
        <Row pending title="Markierungen für Unterschiede" sub="Änderungen mit Farben oder +/−-Markierungen anzeigen"><Segmented label="Markierungen" value={marken} onChange={setMarken} options={[{ value: 'farbe', label: 'Farbe' }, { value: 'zeichen', label: '+/-' }]} /></Row>
        <Row title="Schriftglättung" sub="Native macOS-Schriftglättung verwenden"><Toggle label="Schriftglättung" on={glatt} onChange={setGlatt} /></Row>
      </Card>
    </Section>
  </Page>;
}

function themeValue(mode: 'hell' | 'dunkel', name: 'akzent' | 'kontrast' | 'hintergrund' | 'vordergrund') {
  return appSetting(`darstellung.${mode}.${name}`, THEME_DEFAULTS[mode][name]);
}

const PRESETS: Record<string, { label: string; hell: [string, string]; dunkel: [string, string] }> = {
  cortex: { label: 'Cortex', hell: ['#F7F7F8', '#1A1C1F'], dunkel: ['#181818', '#EDEDEE'] },
  graphit: { label: 'Graphit', hell: ['#EEEEF0', '#202226'], dunkel: ['#17181B', '#E4E4E6'] },
  mitternacht: { label: 'Mitternacht', hell: ['#F3F5FA', '#1B2233'], dunkel: ['#0C0F17', '#E6E9F2'] },
  papier: { label: 'Papier', hell: ['#FBFAF7', '#23211C'], dunkel: ['#141311', '#EAE7E1'] },
};

function ThemeCard({ mode }: { mode: 'hell' | 'dunkel' }) {
  useApp('darstellung.design', 'dunkel');
  const k = (name: string) => `darstellung.${mode}.${name}`;
  const [preset, setPreset] = useApp(k('preset'), 'cortex');
  const [akzent, setAkzent] = useApp(k('akzent'), THEME_DEFAULTS[mode].akzent as string);
  const [bg, setBg] = useApp(k('hintergrund'), THEME_DEFAULTS[mode].hintergrund as string);
  const [fg, setFg] = useApp(k('vordergrund'), THEME_DEFAULTS[mode].vordergrund as string);
  const [uiFont, setUiFont] = useApp(k('uiFont'), 'system');
  const [contentFont, setContentFont] = useApp(k('contentFont'), 'ui');
  const [codeFont, setCodeFont] = useApp(k('codeFont'), 'system');
  const [transparent, setTransparent] = useApp(k('transparent'), true);
  const [kontrast, setKontrast] = useApp(k('kontrast'), THEME_DEFAULTS[mode].kontrast as number);
  const [copied, setCopied] = useState(false);
  const weights: Option[] = [{ value: 'normal', label: 'Normal' }];
  const choosePreset = (id: string) => { setPreset(id); const p = PRESETS[id]; if (p) { setAppSetting(k('hintergrund'), p[mode][0]); setAppSetting(k('vordergrund'), p[mode][1]); } };
  const exportTheme = () => {
    const json = JSON.stringify({ mode, preset, akzent, hintergrund: bg, vordergrund: fg, uiFont, contentFont, codeFont, transparent, kontrast }, null, 2);
    void navigator.clipboard?.writeText(json).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  };
  const importTheme = async () => {
    try {
      const raw = JSON.parse(await navigator.clipboard.readText()) as Record<string, unknown>;
      for (const name of ['preset', 'akzent', 'hintergrund', 'vordergrund', 'uiFont', 'contentFont', 'codeFont', 'transparent', 'kontrast']) if (raw[name] !== undefined) setAppSetting(k(name), raw[name]);
    } catch { /* Zwischenablage ohne Design */ }
  };
  return <Card class="cxs-theme-card">
    <div class="cxs-row cxs-theme-head">
      <div class="cxs-row-text"><div class="cxs-row-title plain">{mode === 'hell' ? 'Helles Design' : 'Dunkles Design'}</div></div>
      <div class="cxs-row-control">
        <Button kind="ghost" onClick={() => void importTheme()} title="Design aus der Zwischenablage übernehmen">Importieren</Button>
        <Button kind="ghost" onClick={exportTheme}>{copied ? 'Kopiert' : 'Design kopieren'}</Button>
        <span class={`cxs-aa ${mode}`}>Aa</span>
        <Select label="Designvorlage" value={preset} onChange={choosePreset} width={174} options={Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label }))} />
      </div>
    </div>
    <Row title="Akzent"><Select label="Akzent" value={akzent} onChange={setAkzent} options={Object.entries(ACCENTS).map(([value, a]) => ({ value, label: value === 'cortex' ? (mode === 'hell' ? 'Schwarz' : 'Weiß') : a.label, icon: <i class="cxs-swatch" style={{ background: a[mode] }} /> }))} /></Row>
    <Row title="Hintergrund"><ColorField label="Hintergrund" value={bg} onChange={setBg} /></Row>
    <Row title="Vordergrund"><ColorField label="Vordergrund" value={fg} onChange={setFg} /></Row>
    <Row title="UI-Schriftart"><span class="cxs-pair"><Select label="UI-Schriftart" value={uiFont} onChange={setUiFont} options={[{ value: 'system', label: 'Systemstandard' }, { value: 'inter', label: 'Inter' }, { value: 'helvetica', label: 'Helvetica' }, { value: 'georgia', label: 'Georgia' }]} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row pending title="Inhaltsschriftart"><span class="cxs-pair"><Select label="Inhaltsschriftart" value={contentFont} onChange={setContentFont} options={[{ value: 'ui', label: 'Wie UI-Schriftart' }, ...Object.keys(UI_FONTS).map(v => ({ value: v, label: v === 'system' ? 'Systemstandard' : v[0]!.toUpperCase() + v.slice(1) }))]} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row title="Code-Schriftart"><span class="cxs-pair"><Select label="Code-Schriftart" value={codeFont} onChange={setCodeFont} options={Object.keys(CODE_FONTS).map(v => ({ value: v, label: ({ system: 'Systemstandard', menlo: 'Menlo', jetbrains: 'JetBrains Mono', fira: 'Fira Code' } as Record<string, string>)[v]! }))} /><Select label="Schriftstärke" value="normal" onChange={() => undefined} options={weights} disabled /></span></Row>
    <Row title="Transparente Seitenleiste"><Toggle label="Transparente Seitenleiste" on={transparent} onChange={setTransparent} /></Row>
    <Row title="Kontrast"><Slider label="Kontrast" value={kontrast} onChange={setKontrast} /></Row>
  </Card>;
}

/* ── Stimme ────────────────────────────────────────────────────────────────── */

export function StimmePage() {
  const [mic, setMic] = useApp('stimme.mikrofon', 'system');
  const [voice, setVoice] = useApp('stimme.stimme', 'vale');
  const [screen, setScreen] = useApp('stimme.bildschirmkontext', true);
  const [words, setWords] = useApp<string[]>('stimme.woerterbuch', []);
  const [draft, setDraft] = useState('');
  return <Page title="Stimme" preview>
    <Section title="Allgemein">
      <Card><Row title="Mikrofon" sub="Für Sprachchat und Diktat verwendet"><Select label="Mikrofon" value={mic} onChange={setMic} options={[{ value: 'system', label: 'Systemstandard' }]} /></Row></Card>
    </Section>
    <Section title="Sprachchat">
      <Card>
        <Row title="Stimme" sub="Wähle die Stimme aus, die Cortex für neue Sprachchats verwendet"><Select label="Stimme" value={voice} onChange={setVoice} icon={<i class="cxs-voice-dot" />} options={[{ value: 'vale', label: 'Vale' }, { value: 'ember', label: 'Ember' }, { value: 'cove', label: 'Cove' }]} /></Row>
        <Row title="Tastenkürzel für Sprachchat" sub="Sprachchat aus jeder Desktop-App starten"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit onClick={() => vscode.postMessage({ kind: 'openKeybindings', query: 'cortex' })} /></span></Row>
        <Row title="Bildschirmkontext" sub={<>Erlaube Cortex, die im Vordergrund laufende App zu prüfen, wenn du auf<br />Bildschirminhalte verweist. macOS fragt nach Zugriff, wenn Cortex ihn erstmals benötigt.</>}><Toggle label="Bildschirmkontext" on={screen} onChange={setScreen} /></Row>
      </Card>
    </Section>
    <Section title="Diktat">
      <Card>
        <Row title="Tastenkürzel für Diktieren durch Halten" sub="Irgendwo auf dem Desktop gedrückt halten, um an der Cursorposition zu diktieren"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit /></span></Row>
        <Row title="Hotkey für Diktat umschalten" sub="Zum Diktieren einmal irgendwo auf dem Desktop drücken, zum Beenden erneut drücken"><span class="cxs-keyline"><span class="cxs-dim">Aus</span><IconEdit /></span></Row>
      </Card>
      <Card class="cxs-gap">
        <Row title="Diktierwörterbuch" sub="Wörter oder Ausdrücke, die die Diktierfunktion erkennen soll"><Button icon="plus" onClick={() => { if (draft.trim()) { setWords([...words, draft.trim()]); setDraft(''); } }}>Eintrag hinzufügen</Button></Row>
        <div class="cxs-inline-list">
          {words.map((w, i) => <div class="cxs-inline-entry" key={`${w}${i}`}><input class="cxs-field wide" value={w} aria-label="Wörterbucheintrag" onBlur={e => setWords(words.map((x, j) => j === i ? e.currentTarget.value : x).filter(Boolean))} /><button type="button" class="cxs-icon-button" aria-label="Eintrag löschen" onClick={() => setWords(words.filter((_, j) => j !== i))}><Glyph name="trash" size={14} /></button></div>)}
          <div class="cxs-inline-entry"><input class="cxs-field wide" value={draft} placeholder="Jane Doe" aria-label="Neuer Wörterbucheintrag" onInput={e => setDraft(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { setWords([...words, draft.trim()]); setDraft(''); } }} /><button type="button" class="cxs-icon-button" aria-label="Eingabe leeren" disabled={!draft} onClick={() => setDraft('')}><Glyph name="trash" size={14} /></button></div>
        </div>
      </Card>
      <Card class="cxs-gap">
        <Row title="Zuletzt verwendete Aufnahmen" sub="Deine letzten 20 Aufnahmen sind auf diesem Gerät gespeichert" />
        <div class="cxs-card-empty">Noch keine Aufnahmen</div>
      </Card>
    </Section>
  </Page>;
}

/* ── Konfiguration ─────────────────────────────────────────────────────────── */

export function KonfigurationPage({ ctx }: { ctx: SettingsContext }) {
  const [scope, setScope] = useApp('konfiguration.ebene', 'benutzer');
  const [web, setWeb] = useApp('konfiguration.websuche', 'cache');
  const [detail, setDetail] = useApp('konfiguration.detailgrad', 'modell');
  const [summary, setSummary] = useApp('konfiguration.reasoningZusammenfassung', 'auto');
  const [levels, setLevels] = useApp<string[]>('konfiguration.reasoningStufen', ['low', 'medium', 'high', 'xhigh', 'max']);
  const [size, setSize] = useNative('cortex.sizeReasoning', true);
  const [idle, setIdle] = useNative('cortex.codexIdleTimeoutSeconds', 180);
  const [context, setContext] = useNative('cortex.sendWorkspaceContext', true);
  const [frame, setFrame] = useNative('cortex.frameTasks', true);
  const [standing, setStanding] = useNative('cortex.standingInstructions', true);
  const [plan, setPlan] = useNative('cortex.autoPlanHeavyEdits', true);
  const [widgets, setWidgets] = useNative('cortex.chatWidgets', true);
  const [verify, setVerify] = useNative('cortex.verifyChanges', true);
  const [second, setSecond] = useNative('cortex.secondOpinion', 'hard');
  const [studio, setStudio] = useNative('cortex.databaseStudio.enabled', true);
  const [writes, setWrites] = useNative('cortex.databaseStudio.allowWrites', false);
  return <Page title="Konfiguration" subtitle={<>Konfiguriere Berechtigungen, Webzugriff und Antworten der Agenten für neue Chats <Link onClick={() => vscode.postMessage({ kind: 'openRules' })}>Mehr erfahren</Link></>}>
    <Section title="Standardeinstellungen des Agenten">
      <div class="cxs-toolbar">
        <Select label="Konfigurationsebene" align="left" value={scope} onChange={setScope} options={[{ value: 'global', label: 'Globale Konfiguration', disabled: true }, { value: 'benutzer', label: 'Benutzerkonfiguration' }, { value: 'projekt', label: 'Projektkonfiguration', disabled: true }]} />
        <button type="button" class="cxs-quiet-link" onClick={() => vscode.postMessage({ kind: 'openRules' })}>Routing-Regeln öffnen <Glyph name="arrowUpRight" size={13} /></button>
      </div>
      <Card>
        <Row title="Genehmigungsrichtlinie" sub="Lege fest, wann Cortex um Genehmigung bitten soll."><Select label="Genehmigungsrichtlinie" value={ctx.askPermission ? 'anfrage' : 'nie'} onChange={v => ctx.onAsk(v === 'anfrage')} options={[{ value: 'anfrage', label: 'Auf Anfrage', hint: 'Vor Befehlen und Dateiänderungen fragen' }, { value: 'nie', label: 'Nie', hint: 'Der Handlungsspielraum entscheidet allein' }]} /></Row>
        <Row title="Sandbox-Einstellungen" sub="Lege fest, was Cortex beim Ausführen von Befehlen tun darf"><Select label="Sandbox-Einstellungen" value={ctx.permissionMode} onChange={ctx.onPermission} options={[{ value: 'safe', label: 'Nur lesen', hint: 'Liest und plant' }, { value: 'edits', label: 'Workspace schreiben', hint: 'Bearbeitet Dateien im Projekt' }, { value: 'full', label: 'Vollzugriff', hint: 'Ohne Rückfragen' }]} /></Row>
        <Row pending title="Websuche" sub="Wähle aus, wie Cortex auf das Web zugreift"><Select label="Websuche" value={web} onChange={setWeb} options={[{ value: 'cache', label: 'Im Cache' }, { value: 'live', label: 'Live' }, { value: 'aus', label: 'Aus' }]} /></Row>
        <Row pending title="Detailgrad der Ausgabe" sub="Wähle, wie detailliert Cortex antwortet"><Select label="Detailgrad" value={detail} onChange={setDetail} options={[{ value: 'modell', label: 'Modellstandard' }, { value: 'knapp', label: 'Knapp' }, { value: 'ausfuehrlich', label: 'Ausführlich' }]} /></Row>
        <Row pending title="Reasoning-Zusammenfassung" sub="Wähle aus, wie Cortex sein Reasoning zusammenfasst"><Select label="Reasoning-Zusammenfassung" value={summary} onChange={setSummary} options={[{ value: 'auto', label: 'Auto' }, { value: 'knapp', label: 'Knapp' }, { value: 'ausfuehrlich', label: 'Ausführlich' }, { value: 'aus', label: 'Aus' }]} /></Row>
      </Card>
    </Section>
    <Section title="Modellfunktionen">
      <Card>
        <Row title="Modellwahl" sub={<>Auto wählt Konto und Modell je Aufgabe aus deinen Abos.<br />Manuell folgt deinen Routing-Regeln und der festgelegten Reihenfolge.</>}><Select label="Modellwahl" value={ctx.routingMode} onChange={ctx.onRouting} options={[{ value: 'auto', label: 'Auto' }, { value: 'manual', label: 'Manuell' }]} /></Row>
        <Row title="Denkaufwand je Schritt bemessen" sub="Im Auto-Modus entscheidet Cortex, wie gründlich jeder Schritt denkt"><Toggle label="Denkaufwand bemessen" on={size} onChange={setSize} /></Row>
        <Row title="Codex: Wartezeit ohne Aktivität" sub="Hängende Aufträge nach dieser Zeit anhalten. Während Cortex auf deine Genehmigung wartet, läuft die Frist nicht."><TextField label="Wartezeit ohne Aktivität" type="number" min={30} max={3600} width={80} suffix="Sekunden" value={idle} onCommit={v => { const n = Math.round(Number(v)); if (n >= 30 && n <= 3600) setIdle(n); }} /></Row>
        <Row pending title="Verfügbare Reasoning-Stufen" sub={<>Wähle, welche Reasoning-Aufwandsstufen in den Modellsteuerungen<br />angezeigt werden. Die Verfügbarkeit variiert je nach Modell.</>}><MultiSelect label="Reasoning-Stufen" values={levels} onChange={setLevels} options={[{ value: 'minimal', label: 'Minimal' }, { value: 'low', label: 'Gering' }, { value: 'medium', label: 'Mittel' }, { value: 'high', label: 'Hoch' }, { value: 'xhigh', label: 'Sehr hoch' }, { value: 'max', label: 'Max.' }]} /></Row>
      </Card>
    </Section>
    <Section title="Arbeitsweise">
      <Card>
        <Row title="Arbeitskontext mitschicken" sub="Offene Datei, Auswahl, Branch und ungesicherte Änderungen gehen mit jeder Nachricht mit"><Toggle label="Arbeitskontext" on={context} onChange={setContext} /></Row>
        <Row title="Aufträge rahmen" sub="Fehlende Rahmung ergänzen, etwa die Prüfung, die am Ende laufen soll"><Toggle label="Aufträge rahmen" on={frame} onChange={setFrame} /></Row>
        <Row title="Ständige Anweisungen" sub="Jedem Anbieter die Grundanweisungen über seinen eigenen Systemkanal geben"><Toggle label="Ständige Anweisungen" on={standing} onChange={setStanding} /></Row>
        <Row title="Widgets im Chat" sub="Agenten zeigen Ergebnisse wie Wetter, Tests oder Serverzustand als kleine Karte statt als Text"><Toggle label="Widgets im Chat" on={widgets} onChange={setWidgets} /></Row>
        <Row title="Schwere Änderungen erst planen" sub="Im Auto-Modus schwere Codearbeit zuerst als Plan vorlegen"><Toggle label="Erst planen" on={plan} onChange={setPlan} /></Row>
        <Row title="Änderungen prüfen" sub="Nach Dateiänderungen das Prüfskript des Projekts ausführen und einen Korrekturversuch geben"><Toggle label="Änderungen prüfen" on={verify} onChange={setVerify} /></Row>
        <Row title="Zweitmeinung" sub="Ein anderer Anbieter prüft die Arbeit, bevor du dich darauf verlässt"><Select label="Zweitmeinung" value={second} onChange={setSecond} options={[{ value: 'never', label: 'Nie' }, { value: 'hard', label: 'Bei schwerer Arbeit' }, { value: 'always', label: 'Immer' }]} /></Row>
      </Card>
    </Section>
    <Section title="Workspace-Abhängigkeiten">
      <Card>
        <Row title="Vektor" sub="Datenquellen als Tab öffnen; der Agent liest über den Konnektor mit"><Toggle label="Vektor" on={studio} onChange={setStudio} /></Row>
        <Row title="Schreibzugriff für Vektor" sub="Schreibende Aufrufe über die API zulassen"><Toggle label="Schreibzugriff" on={writes} disabled={!studio} onChange={setWrites} /></Row>
        <Row title="Konnektoren in Profile spiegeln" sub="Überprüft die MCP-Definitionen und schreibt sie neu in jedes Anbieterprofil"><Button icon="search" onClick={() => vscode.postMessage({ kind: 'syncConnectors' })}>Diagnose</Button></Row>
        <Row title="Anbieterkonten neu verbinden" sub="Öffnet die Konten, um ein Profil neu anzumelden"><Button kind="danger" icon="download" onClick={() => ctx.go({ id: 'konto', sub: [] })}>Neu verbinden</Button></Row>
      </Card>
      <p class="cxs-footnote">Aktueller Stand: {ctx.accounts.length === 1 ? '1 verbundenes Konto' : `${ctx.accounts.length} verbundene Konten`}<br />Diagnose ausführen oder neu verbinden, wenn Tool-Aufrufe fehlschlagen</p>
    </Section>
  </Page>;
}

/* ── Personalisierung ──────────────────────────────────────────────────────── */

export function PersonalisierungPage() {
  const [saved, setSaved] = useApp('personalisierung.anweisungen', '');
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const [home, setHome] = useNative('cortex.homeLocation', '');
  return <Page title="Personalisierung">
    <Section title="Cortex-Anweisungen" big subtitle={<>Gib Cortex zusätzliche Anweisungen und Kontext für alle Chats.<br />Repository-Anweisungen können ebenfalls gelten. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://agents.md' })}>Mehr erfahren</Link></>} actions={<Button kind="ghost" disabled={draft === saved} onClick={() => setSaved(draft)}>Speichern</Button>}>
      <textarea class="cxs-textarea big" aria-label="Cortex-Anweisungen" value={draft} placeholder="Zum Beispiel: Antworte auf Deutsch. Frag nach, bevor du Abhängigkeiten hinzufügst." onInput={e => setDraft(e.currentTarget.value)} />
    </Section>
    <Section title="Standort">
      <Card>
        <Row title="Heimatort" sub="Für Wetter, Abfahrten und Wege. Ohne Angabe fragt der Agent nach, statt den Ort über die IP-Adresse zu raten"><TextField label="Heimatort" value={home} placeholder="z. B. Frankfurt" width={224} onCommit={v => setHome(String(v).trim())} /></Row>
      </Card>
    </Section>
    <ErinnerungSections />
  </Page>;
}

/* ── Cortex-Erinnerung ─────────────────────────────────────────────────────── */

const PROMPTS: Array<{ key: string; title: string; sub: string; vorgabe: string }> = [
  { key: 'erinnerung.prompt.notizen', title: 'Prompt: Notizzettel', sub: 'Was nach jeder Antwort auf dem Notizzettel des Chats festgehalten wird', vorgabe: PROMPT_NOTIZEN },
  { key: 'erinnerung.prompt.suche', title: 'Prompt: Selbst suchen', sub: 'Wann und wie ein Modell während der Antwort selbst im Exokortex nachschlägt', vorgabe: PROMPT_SUCHE },
  { key: 'erinnerung.prompt.einbettung', title: 'Prompt: Einbettung', sub: 'Wie das Modell mitgeschickte Erinnerungen behandeln soll', vorgabe: PROMPT_EINBETTUNG },
  { key: 'erinnerung.prompt.speichern', title: 'Prompt: Merken', sub: 'Wie aus „Merk dir …“ ein Eintrag auf der Merkliste wird', vorgabe: PROMPT_SPEICHERN },
];

function PromptSection({ promptKey, title, sub, vorgabe }: { promptKey: string; title: string; sub: string; vorgabe: string }) {
  const [saved, setSaved] = useApp(promptKey, '');
  const wirksam = saved.trim() ? saved : vorgabe;
  const [draft, setDraft] = useState(wirksam);
  useEffect(() => setDraft(wirksam), [wirksam]);
  return <Section title={title} subtitle={sub} actions={<>
    <Button kind="ghost" disabled={draft === vorgabe && !saved.trim()} onClick={() => { setSaved(''); setDraft(vorgabe); }}>Zurücksetzen</Button>
    <Button kind="ghost" disabled={draft === wirksam} onClick={() => setSaved(draft.trim() === vorgabe.trim() ? '' : draft)}>Speichern</Button>
  </>}>
    <textarea class="cxs-textarea big" aria-label={title} value={draft} onInput={e => setDraft(e.currentTarget.value)} />
  </Section>;
}

const liste = (text: string) => text.split(',').map(w => w.trim()).filter(Boolean);

function BereicheSection() {
  const [gespeichert, setGespeichert] = useApp<Suchbereich[] | null>('erinnerung.bereiche', null);
  const bereiche = gespeichert && gespeichert.length ? gespeichert : STANDARD_BEREICHE;
  const setze = (next: Suchbereich[]) => setGespeichert(next);
  const aendere = (i: number, teil: Partial<Suchbereich>) => setze(bereiche.map((b, j) => (j === i ? { ...b, ...teil } : b)));
  return <Section title="Suchbereiche" subtitle={<>Welche Anfrage in welchem Teil des Exokortex sucht. Ein Stichwort in der Nachricht oder ein passender Arbeitsordner schaltet den Bereich zu; frühere Chats sind immer dabei.</>} actions={<>
    <Button kind="ghost" disabled={!gespeichert} onClick={() => setGespeichert(null)}>Zurücksetzen</Button>
    <Button kind="ghost" icon="plus" onClick={() => setze([...bereiche, { id: `eigen-${Date.now().toString(36)}`, name: 'Neuer Bereich', projekte: [], stichwoerter: [] }])}>Bereich hinzufügen</Button>
  </>}>
    <Card>
      {bereiche.map((b, i) => <div class="cxs-inline-list" key={b.id}>
        <div class="cxs-inline-entry">
          <input class="cxs-field" style={{ width: 200 }} aria-label="Name des Bereichs" value={b.name} onBlur={e => { const v = e.currentTarget.value.trim(); if (v && v !== b.name) aendere(i, { name: v }); }} />
          <input class="cxs-field wide mono" aria-label="Exokortex-Projekte" value={b.projekte.join(', ')} placeholder="proj_…" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== b.projekte.join(',')) aendere(i, { projekte: v }); }} />
          <Toggle label="Immer durchsuchen" on={!!b.immer} onChange={v => aendere(i, { immer: v })} />
          <button type="button" class="cxs-icon-button" aria-label="Bereich löschen" onClick={() => setze(bereiche.filter((_, j) => j !== i))}><Glyph name="trash" size={14} /></button>
        </div>
        {!b.immer && <div class="cxs-inline-entry">
          <input class="cxs-field wide" aria-label="Stichwörter" value={b.stichwoerter.join(', ')} placeholder="Stichwörter, durch Komma getrennt" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== b.stichwoerter.join(',')) aendere(i, { stichwoerter: v }); }} />
          <input class="cxs-field" style={{ width: 220 }} aria-label="Arbeitsordner" value={(b.ordner ?? []).join(', ')} placeholder="Ordnernamen" onBlur={e => { const v = liste(e.currentTarget.value); if (v.join(',') !== (b.ordner ?? []).join(',')) aendere(i, { ordner: v }); }} />
        </div>}
      </div>)}
    </Card>
    <p class="cxs-footnote">Links der Name, daneben die Projekte im Exokortex, rechts „immer durchsuchen“. Darunter Stichwörter und Arbeitsordner, die den Bereich zuschalten.</p>
  </Section>;
}

function ErinnerungSections() {
  const [notes, setNotes] = useNative('cortex.memory.notes', true);
  const [abruf, setAbruf] = useNative('cortex.memory.retrieval', 'themenwechsel');
  const [treffer, setTreffer] = useNative('cortex.memory.hits', 5);
  const [budget, setBudget] = useNative('cortex.memory.budget', 1500);
  const [schwelle, setSchwelle] = useNative('cortex.memory.threshold', 'normal');
  const [helfer, setHelfer] = useNative('cortex.memory.helper', 'guenstig');
  const zahl = (v: string, min: number, max: number, set: (n: number) => void) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n)));
  };
  return <>
    <Section title="Cortex-Erinnerung" big subtitle={<>Lege fest, woran sich Cortex über Modellwechsel und Chats hinweg erinnert. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://github.com/OskarSch24/exokortex' })}>Mehr erfahren</Link></>}>
      <Card>
        <Row title="Notizzettel pro Chat" sub={<>Hält Entscheidungen, Festlegungen und offene Punkte fest<br />und gibt sie jedem Modell mit, das im Chat antwortet</>}><Toggle label="Notizzettel" on={notes} onChange={setNotes} /></Row>
        <Row title="Modell für Notizen" sub="Der Zettel entsteht nach jeder Antwort im Hintergrund"><Select label="Modell für Notizen" value={helfer} onChange={setHelfer} options={[{ value: 'guenstig', label: 'Günstig', hint: 'Haiku auf einem freien Claude-Konto' }, { value: 'aktuell', label: 'Aktuelles Modell', hint: 'Das Modell, das gerade geantwortet hat' }]} /></Row>
        <Row title="Aus dem Exokortex erinnern" sub="Wann Cortex passende Fundstellen sucht und mitschickt"><Select label="Exokortex-Abruf" value={abruf} onChange={setAbruf} options={[{ value: 'themenwechsel', label: 'Bei Themenwechsel', hint: 'Erste Nachricht und jedes neue Thema' }, { value: 'erste', label: 'Erste Nachricht' }, { value: 'jede', label: 'Jede Nachricht' }, { value: 'nie', label: 'Nie' }]} /></Row>
        <Row title="Mindestrelevanz" sub="Wie gut eine Fundstelle passen muss, damit sie mitgeht"><Select label="Mindestrelevanz" value={schwelle} onChange={setSchwelle} options={[{ value: 'locker', label: 'Locker' }, { value: 'normal', label: 'Normal' }, { value: 'streng', label: 'Streng' }]} /></Row>
        <Row title="Treffer" sub="Höchstens so viele Fundstellen je Nachricht"><TextField label="Treffer" type="number" min={1} max={10} width={72} value={treffer} onCommit={v => zahl(v, 1, 10, setTreffer)} /></Row>
        <Row title="Token-Budget" sub="Wie viel Platz die Erinnerungen in einer Nachricht höchstens belegen"><TextField label="Token-Budget" type="number" min={300} max={4000} width={88} suffix="Tokens" value={budget} onCommit={v => zahl(v, 300, 4000, setBudget)} /></Row>
      </Card>
    </Section>
    <BereicheSection />
    {PROMPTS.map(p => <PromptSection key={p.key} promptKey={p.key} title={p.title} sub={p.sub} vorgabe={p.vorgabe} />)}
  </>;
}

export { Empty };
