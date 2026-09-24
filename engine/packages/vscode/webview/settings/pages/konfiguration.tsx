import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import type { SettingsContext } from '../SettingsApp.js';
import { useApp, useNative } from '../store.js';
import { Button, Card, Link, MultiSelect, Page, Row, Section, Select, TextField, Toggle } from '../ui.js';

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
