import { CortexMark } from '../../components/CortexIcons.js';
import { shortPath } from '../../format/path.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useApp, useNative } from '../store.js';
import { Button, Card, IconButton, Link, Page, Row, Section, Segmented, Select, TextField, Toggle } from '../ui.js';

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
        <Row title="Vollzugriff" sub={<>Wenn Cortex mit Vollzugriff ausgeführt wird, kann es jede Datei auf deinem Computer bearbeiten<br />und ohne deine Zustimmung Befehle mit Netzwerkzugriff ausführen. Das erhöht das Risiko von<br />Datenverlust, Datenlecks oder unerwartetem Verhalten erheblich. <Link onClick={() => vscode.postMessage({ kind: 'openExternal', url: 'https://github.com/oskarschiermeister/cortex#berechtigungen' })}>Mehr erfahren</Link> über erhöhte Risiken.</>}>
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
  return <IconButton icon="edit" size={13} label={label} onClick={onClick} />;
}
