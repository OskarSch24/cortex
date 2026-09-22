import { useState } from 'preact/hooks';
import { Glyph } from '../../components/CortexIcons.js';
import { vscode } from '../../vscodeApi.js';
import { useApp } from '../store.js';
import { Page } from '../ui.js';

/**
 * Tastaturkürzel.
 *
 * Zwei Arten, beide echt: Kürzel, die die Cortex-Oberfläche selbst fest
 * vergibt, und die Befehle, die Cortex in Code-OSS anmeldet. Belegt werden
 * Letztere im Tastenkürzel-Editor von Code-OSS — der Stift öffnet ihn schon
 * auf den Befehl gefiltert. Was dort belegt ist, kann diese Seite nicht lesen;
 * sie zeigt deshalb die Vorgabe aus dem Paket und behauptet nichts darüber hinaus.
 */
interface Shortcut { title: string; sub: string; keys: string[]; command?: string; fixed?: boolean }

export function TastaturPage() {
  const [query, setQuery] = useState('');
  const [send] = useApp('composer.senden', 'enter');
  const list: Shortcut[] = [
    { title: 'Aufgaben suchen', sub: 'Den Suchdialog über allen Aufgaben öffnen', keys: ['⌘K'], fixed: true },
    { title: 'Eingabefeld fokussieren', sub: 'Tastaturfokus in das Eingabefeld des Chats verschieben', keys: ['⌘L'], fixed: true },
    { title: 'Nachricht senden', sub: 'Aktuelle Composer-Nachricht senden', keys: [send === 'cmd-enter' ? '⌘↩' : '↩'], fixed: true },
    { title: 'Neue Zeile', sub: 'Im Eingabefeld eine Zeile einfügen', keys: [send === 'cmd-enter' ? '↩' : '⇧↩'], fixed: true },
    { title: 'Bild erstellen umschalten', sub: 'Den Bildmodus im Composer ein- oder ausschalten', keys: ['⌘I'], fixed: true },
    { title: 'Dateien und Ordner anhängen', sub: 'Dateien an den aktiven Composer anhängen', keys: ['⌘U'], fixed: true },
    { title: 'Lauf abbrechen', sub: 'Laufende Aufgabe anhalten, solange der Composer den Fokus hat', keys: ['Esc'], fixed: true },
    { title: 'Neuer Chat', sub: 'Neuen Chat starten', keys: [], command: 'cortex.newConversation' },
    { title: 'Chat öffnen', sub: 'Den Chat in einem eigenen Tab öffnen', keys: [], command: 'cortex.openChatInTab' },
    { title: 'Chat umbenennen', sub: 'Aktuellen Chat umbenennen', keys: [], command: 'cortex.renameChat' },
    { title: 'Chat verzweigen', sub: 'Aktuellen Chat forken', keys: [], command: 'cortex.forkChat' },
    { title: 'Chat archivieren', sub: 'Aktuellen Chat archivieren', keys: [], command: 'cortex.archiveChat' },
    { title: 'Chat löschen', sub: 'Aktuellen Chat löschen', keys: [], command: 'cortex.deleteChat' },
    { title: 'Chat kopieren', sub: 'Aktuellen Chat in die Zwischenablage kopieren', keys: [], command: 'cortex.copyChat' },
    { title: 'Chat exportieren', sub: 'Aktuellen Chat als Datei sichern', keys: [], command: 'cortex.exportChat' },
    { title: 'Transkript-Ansicht', sub: 'Den Verlauf als Transkript im Dock öffnen', keys: [], command: 'cortex.showTranscript' },
    { title: 'Ausgabestil', sub: 'Den Ausgabestil des Chats wählen', keys: [], command: 'cortex.outputStyle' },
    { title: 'Seitenleiste umschalten', sub: 'Seitenpanel ein- oder ausblenden', keys: [], command: 'cortex.toggleSidebar' },
    { title: 'Dateien anzeigen', sub: 'Dateibaum-Panel einblenden', keys: [], command: 'cortex.showFiles' },
    { title: 'Dateien ausblenden', sub: 'Dateibaum-Panel ausblenden', keys: [], command: 'cortex.hideFiles' },
    { title: 'Änderungen anzeigen', sub: 'Review für den aktuellen Chat öffnen', keys: [], command: 'cortex.showChanges' },
    { title: 'Browserbereich einblenden', sub: 'Den integrierten Browser neben dem Chat öffnen', keys: [], command: 'cortex.showPreview' },
    { title: 'Browserbereich ausblenden', sub: 'Den integrierten Browser schließen', keys: [], command: 'cortex.hidePreview' },
    { title: 'Terminal öffnen', sub: 'Terminal-Panel öffnen', keys: [], command: 'cortex.showTerminal' },
    { title: 'Terminal schließen', sub: 'Terminal-Panel schließen', keys: [], command: 'cortex.hideTerminal' },
    { title: 'Sitzung im Terminal öffnen', sub: 'Die Anbietersitzung des Chats im Terminal fortsetzen', keys: [], command: 'cortex.openInTerminal' },
    { title: 'Laufende Aufgabe abbrechen', sub: 'Den aktiven Lauf beenden', keys: [], command: 'cortex.cancelTask' },
    { title: 'Modellauswahl öffnen', sub: 'Konto und Modell für den Chat wählen', keys: [], command: 'cortex.pickModel' },
    { title: 'Vor dem Handeln fragen umschalten', sub: 'Genehmigung vor Befehlen und Änderungen ein- oder ausschalten', keys: [], command: 'cortex.toggleAsk' },
    { title: 'Computer wach halten', sub: 'Den Ruhezustand während eines Laufs verhindern', keys: [], command: 'cortex.keepAwake' },
    { title: 'Konto hinzufügen', sub: 'Ein weiteres KI-Abo verbinden', keys: [], command: 'cortex.addAccount' },
    { title: 'Konto entfernen', sub: 'Ein verbundenes Konto trennen', keys: [], command: 'cortex.removeAccount' },
    { title: 'Konten', sub: 'Die Kontenübersicht öffnen', keys: [], command: 'cortex.openAccounts' },
    { title: 'Routing-Regeln', sub: 'Die Routing-Regeln öffnen', keys: [], command: 'cortex.openRules' },
    { title: 'Routing-Regeln bearbeiten', sub: 'Die Regeldatei im Editor öffnen', keys: [], command: 'cortex.editRules' },
    { title: 'Eigene Slash-Befehle bearbeiten', sub: 'Die Befehlsdatei im Editor öffnen', keys: [], command: 'cortex.editCommands' },
    { title: 'MCP-Server spiegeln', sub: 'Die Konnektoren in alle Anbieterprofile schreiben', keys: [], command: 'cortex.syncMcp' },
    { title: 'Analysen', sub: 'Die Analysen in einem Tab öffnen', keys: [], command: 'cortex.openAnalytics' },
    { title: 'In Vektor öffnen', sub: 'Die aktuelle Datenquelle im Studio öffnen', keys: [], command: 'cortex.databaseStudio.open' },
    { title: 'Datenbank-Verbindung', sub: 'Den Zustand der Vektor-Verbindung zeigen', keys: [], command: 'cortex.databaseStudio.status' },
    { title: 'Vollständig neu starten', sub: 'Cortex beenden und neu starten', keys: ['⌥⇧⌘R'], command: 'cortex.restartApplication' },
  ];
  const q = query.trim().toLowerCase();
  const shown = list.filter(s => !q || `${s.title} ${s.sub} ${s.keys.join(' ')}`.toLowerCase().includes(q));
  const edit = (s: Shortcut) => vscode.postMessage({ kind: 'openKeybindings', query: s.command ?? '' });
  return <Page title="Tastaturkürzel">
    <div class="cxs-sticky-search">
      <label class="cxs-search big"><Glyph name="search" size={15} /><input value={query} placeholder="Tastenkürzel suchen" aria-label="Tastenkürzel suchen" onInput={e => setQuery(e.currentTarget.value)} />
        <button type="button" class="cxs-icon-button" aria-label="Tastenkürzel-Editor öffnen" title="Tastenkürzel-Editor öffnen" onClick={() => vscode.postMessage({ kind: 'openKeybindings', query: 'cortex' })}><Glyph name="keyboard" size={15} /></button>
      </label>
    </div>
    <div class="cxs-card cxs-shortcuts">
      {shown.map(s => <div class="cxs-row cxs-shortcut" key={s.title}>
        <div class="cxs-row-text"><div class="cxs-row-title">{s.title}</div><div class="cxs-row-sub">{s.sub}</div></div>
        <div class="cxs-shortcut-keys">
          {s.keys.length ? s.keys.map(k => <div class="cxs-shortcut-line" key={k}>
            <kbd class="cxs-keys">{k}</kbd>
            <button type="button" class="cxs-icon-button" aria-label={`${s.title} bearbeiten`} title={s.fixed ? 'In der Cortex-Oberfläche fest vergeben' : 'Im Tastenkürzel-Editor belegen'} disabled={s.fixed} onClick={() => edit(s)}><Glyph name="edit" size={13} /></button>
            <span class="cxs-grow" />
            {!s.fixed && <button type="button" class="cxs-icon-button" aria-label={`${s.title}: Belegung entfernen`} title="Im Tastenkürzel-Editor entfernen" onClick={() => edit(s)}><Glyph name="trash" size={14} /></button>}
          </div>) : <div class="cxs-shortcut-line">
            <span class="cxs-dim">Nicht zugewiesen</span>
            <button type="button" class="cxs-icon-button" aria-label={`${s.title} belegen`} title="Im Tastenkürzel-Editor belegen" onClick={() => edit(s)}><Glyph name="edit" size={13} /></button>
          </div>}
        </div>
      </div>)}
      {!shown.length && <div class="cxs-card-empty">Kein Tastenkürzel gefunden</div>}
    </div>
  </Page>;
}
