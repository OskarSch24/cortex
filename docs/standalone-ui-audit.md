# Cortex als eigenständige macOS-App: Oberfläche und Systemanbindung

Stand: 19. September 2026. Prüfung des vorhandenen Quellcodes; keine Aussage über eine bereits umgesetzte Migration.

## Ergebnis

Die eigentliche Cortex-Oberfläche ist bereits eine eigenständige Preact-Anwendung. `engine/packages/vscode/webview/main.tsx` rendert `App`, der Modus `agent` rendert `AgentApp`. Die Designvorgaben, Einstellungen, Konten, Projekte, Agenten, Teams, Automatisierungen, Vorlagen, Chat und der größte Teil des rechten Docks liegen in eigenen Komponenten und können erhalten bleiben.

Die vorhandene App ist jedoch funktional noch an Code-OSS gebunden. Browser, Terminal, Texteditor, Systemdialoge, Titelleiste und Tastenkürzel werden teilweise von dessen Workbench bereitgestellt. Ein neues App-Symbol oder das Umbenennen der Workbench würde diese Abhängigkeit nicht beseitigen.

Eine eigene Electron-App kann die vorhandene Oberfläche und den Node-basierten Cortex-Runner wiederverwenden. Die Hauptfläche braucht eine enge Nachrichtenbrücke zum eigenen Host und einen echten Ersatz für jede weiterhin sichtbare Workbench-Funktion. Eine reine SwiftUI-Neufassung müsste zusätzlich die gesamte Oberfläche nachbauen; diese Entscheidung betrifft deutlich mehr als das App-Bündel.

## Vorhandener Nachrichtenvertrag

`src/panel/protocol.ts` ist der maßgebliche Vertrag. `webview/vscodeApi.ts` kapselt den ausgehenden Transport mit genau einer Methode, `postMessage(WebviewToHost)`. Der Eingang erfolgt über `window`-Nachrichten vom Typ `HostToWebview`.

Für einen eigenen Host ist die kleinste sichere Änderung eine kompatible Transportimplementierung im isolierten Preload. Eine vorübergehende Kompatibilität mit dem Namen `acquireVsCodeApi` ist keine Laufzeitabhängigkeit von VS Code; mittelfristig sollte der Name `cortexHost` lauten. Der Renderer benötigt weder Node-Zugriff noch allgemeine IPC-Methoden.

| Bereich | Oberfläche → Host | Host → Oberfläche / bestehende Wirkung |
| --- | --- | --- |
| Start und Seiten | `ready`, `pageChanged` | Hydrierung; `showPage`, `conversations`, `conversationReset`, `conversationReady` |
| Konten und Projekte | Kontoverbindung und Projektaktionen des vorhandenen Protokolls | `accounts`, `projects`, Live-Aktualisierungen |
| Einstellungen | `getAppSettings`, `setAppSetting`, `getNativeSettings`, `setNativeSetting` | Vollständiger Stand mit `revision` und `ack`; optimistische Änderungen dürfen nicht verloren gehen |
| Fensterwerkzeuge | `dockState`, `openBrowser`, `closeBrowser`, `openTerminal`, `closeTerminal` | `panes`; native Buttons müssen dieselben Aktionen auslösen |
| Cortex-Dock | `inspectWorkspace`, `readFileBody`, `previewFile`, `getDiff`, Canvas-Aktionen | `workspace`, `fileBody`, `filePreview`, `diff`, Canvas-Antworten |
| Anhang | `pickAttachments`, `saveAttachmentData`, `attachmentPreview`, `attachmentFailed` | `attachments`, `attachmentData`, `attachmentPreview`, `dropHover`, `attachmentDropFailed` |
| Dateien außerhalb des Docks | `openWorkspaceFile`, `openDiffFile`, `openCode`, `fileAction` | Tatsächlicher Editor, Vergleich, Standardprogramm, Finder oder Speichern-Dialog |
| System und Navigation | `openUrlIn`, `openKeybindings`, `openNativeSettings`, `workbenchAction`, `openLicenses` | Eigene Systemanbindung und eigene Einstellungs-/Befehlsansichten |
| Agenten und Automation | `getTeams`, `saveTeam`, `deleteTeam`, `startTeam`, `stopTeam`, `copyTeamWebhook` | `teamsState`, Speicherbestätigung/Fehler; bestehender Runner mit Reasoning, Cron und Webhook |

Das vollständige bestehende Protokoll sollte übernommen werden. Eine zweite Teilmenge für den Desktop-Host würde sich bei künftigen Funktionen auseinanderentwickeln.

## Unverändert nutzbare Flächen

- Chat, Composer, Vorlagengalerie und Bilderarbeitsbereich.
- Projekte, Kontoanbindung, Plugins/MCPs und Exokortex-Seite.
- Agenten, Teamrollen, Reasoning-Einstellung und geplante Aktionen.
- Dateibaum, Dateivorschau, Änderungsübersicht und Transkript in `components/Dock.tsx`.
- Excalidraw inklusive separat gebautem Paket, Schriftdateien, Worker und Bildexport.
- Einstellungsoberfläche mit eigenem synchronisiertem Store.
- Seiten- und Dockbreiten sowie lokale UI-Einstellungen, sofern deren Speicher bei der Migration übernommen wird.

## Flächen, die ein eigener Host ersetzen muss

### Titelleiste und Fenster

`AgentApp` reserviert bereits ein 44-Pixel-Band. Links hält die Fensteransicht Platz für die macOS-Ampelknöpfe frei; im Vollbild wird dieser Platz anders verwendet. Die aktuelle Vollbilderkennung aus Fenster- und Bildschirmgröße sollte durch ein tatsächliches Ereignis des Desktop-Hosts ersetzt werden.

Die Werkzeuge rechts oben kommen derzeit aus `package.json` → `contributes.menus.titleBar`. Sichtbar sind sie ausschließlich bei `pageChanged: chat`. `dockState` liefert den Dateistatus, `panes` Browser- und Terminalstatus. Diese Regeln gehören in die eigene Titelleiste; die Buttons dürfen auf Einstellungen, Plugins oder Agenten weiterhin nicht erscheinen.

Fensterziehen darf nur auf freien Kopfbereichen möglich sein. Buttons, Suchfelder, Popovers, Resize-Handles und macOS-Ampelknöpfe benötigen davon unabhängige Trefferflächen. Das native App-Menü braucht zumindest Cortex/Über, Einstellungen, Beenden, Datei, Bearbeiten, Ansicht, Fenster und Hilfe; Ausschneiden, Kopieren, Einfügen und Rückgängig müssen weiterhin in Eingabefeldern funktionieren.

### Browser

`DockKind` umfasst nur `files | changes | transcript | canvas`. Die Auswahl Browser sendet `openBrowser`; Code-OSS öffnet aktuell die fremde Seite daneben. Ein gewöhnlicher iframe ist kein vollständiger Ersatz, da viele externe Seiten Einbettung verbieten.

Der eigene Host benötigt eine isolierte Browserfläche ohne Cortex-Preload und ohne Node-Rechte, mit URL-Feld, Zurück/Vorwärts, Neu laden, Fehleranzeige und Schließen. Die Grenze zur Cortex-Oberfläche ist eine Sicherheitsgrenze. Seitenwechsel darf die Browser-Sitzung des vorherigen Chats nicht unbemerkt in einem anderen Chat zeigen. Dafür existieren bereits `previewUrls` und `browserChats` im Host.

HTML-Dateivorschauen im Cortex-Dock können den vorhandenen `HtmlPreviewServer` weiterverwenden: loopback, Geheimnis im Pfad, Host-Prüfung, Pfadprüfung und Ausschluss von Punktdateien sind bereits vorhanden. Fremde HTML-Seiten dürfen keine Cortex-Nachrichten oder Dateirechte erhalten.

### Terminal

Der vorhandene Terminalknopf ruft `vscode.window.createTerminal()` auf. Das Terminal wird wiederverwendet und beim Zuklappen nur verborgen; laufende Server bleiben erhalten. Ein eigener Host muss diese Semantik behalten.

Erforderlich sind ein echtes PTY, ein Terminalrenderer, Tastatureingabe, Größenanpassung, Shell-/Prozess-Ende und die bisherige Anbietersitzungs-Fortsetzung. Eine nur lesbare Prozessausgabe ist kein gleichwertiger Ersatz. Terminal-Schriftgröße, Cursor und Scrollback dürfen erst als funktionierend gelten, wenn die Werte am echten Terminal wirken.

### Editor und Änderungen

Das Cortex-Dateidock zeigt Text, Markdown und HTML, ist jedoch noch kein schreibender Code-Editor. `openCode`, `openDiffFile`, `openWorkspaceFile`, Regeldokumente und MCP-Konfigurationen nutzen den nativen Editor. Entweder benötigt die eigene App einen Editor mit Speichern und Diff-Ansicht oder die Oberfläche muss diese Aktionen ehrlich als Öffnen im externen Editor ausweisen. Die derzeitigen Optionen Minimap, Format-on-save, Tabulatoren und Zeilennummern dürfen nicht in einem leeren Konfigurationsadapter verschwinden.

Auch Vektor wird als eigene Webview in einem Code-OSS-Editor geöffnet. `StudioHost` hat bereits einen expliziten `StudioDelegate` mit Dialogen, Projekten und Einstellungen und lässt sich deshalb sauber an eine eigene App anbinden. Der Session-Fokus muss weiterhin dem sichtbaren Datenbanktab folgen.

### Einstellungen und Tastenkürzel

Aktive Verweise auf die Workbench finden sich insbesondere in:

- `webview/settings/pages/persoenlich.tsx`: Editor/Terminal, alle Einstellungen, Teilen und Befehle.
- `webview/settings/pages/tastatur.tsx`: Bearbeiten jeder befehlsgestützten Tastenkombination öffnet den Code-OSS-Editor.
- `webview/components/NativeSettings.tsx`: alte zusätzliche Seite mit ausdrücklichem VSCodium-Text und Erweiterungsverwaltung.
- `src/panel/chatViewProvider.ts`: `openNativeSettings`, `openKeybindings`, `workbenchAction`.

Benötigt werden eine eigene Befehlsübersicht und ein persistenter Shortcut-Editor; Änderungen müssen den registrierten Menü-/Fensterbefehlen tatsächlich entsprechen. Allgemeine VS-Code-Erweiterungsverwaltung gehört nicht automatisch zur eigenen Cortex-App. Cortex-Plugins und MCP-Verbindungen bleiben über die vorhandene Plugins-Seite verfügbar.

## Preload, Dateien und Berechtigungen

- Nur die eigene Hauptfläche erhält die Cortex-Brücke. Fremde Browserseiten, Vektor-Frames und HTML-Vorschauen erhalten sie nicht.
- Hauptprozess prüft Nachrichtenabsender und Hauptframe sowie die erlaubten Nachrichten. Kein `invoke(channel, ...args)` und kein allgemeiner Datei-/Shellzugriff im Renderer.
- Der derzeitige Eingangsfilter in `main.tsx` prüft die Herkunft von Fenster-Nachrichten. Diese Prüfung beibehalten; das Preload liefert vertrauenswürdige Host-Nachrichten als lokale Ereignisse, statt eine externe Webseite als Host zu akzeptieren.
- Lokale Medien benötigen kontrollierte Ressourcenadressen. `asWebviewUri` wird derzeit für Galerie, generierte Bilder, Vorschaubilder, Pluginsymbole und Excalidraw verwendet. Beliebige `file://`-Pfade sollten nicht als allgemeine Ressourcenfreigabe dienen.
- Excalidraw benötigt die vorhandenen lokalen Fonts sowie `blob:`-Worker. CSP nicht pauschal abschalten, um das zum Laufen zu bringen.
- Finder-Drops werden bisher von gepatchtem Workbench-Code abgefangen. `Composer` ignoriert Datei-Drops bewusst, weil danach eine Host-Nachricht folgt. Eine eigene App muss den Dateidrop-Pfad ersetzen; sonst funktioniert Einfügen eines Bildes, aber Drag-and-drop verschwindet still.
- Screenshot-Vorschauen ohne Pfad können weiter über `saveAttachmentData` gespeichert werden. Nicht lesbare oder noch versprochene Dateien brauchen die vorhandene sichtbare Fehlermeldung. Plugin-JSON-Drops müssen auf der Plugin-Seite bleiben und dürfen nicht als Chat-Anhang verarbeitet werden.
- Explizite Anbieter-Anmeldung und ausdrücklich gewählte externe Links dürfen den Systembrowser verwenden. Automatische Tests, Build und Installation dürfen ihn weiterhin nicht starten. Die bestehende Einstellung `cortex.browserAccess` steuert Agentenaktionen unverändert.
- Schlüssel gehören weiter in den macOS-Schlüsselbund beziehungsweise den vorhandenen sicheren Credential-Store. Sie dürfen durch die neue Brücke nicht als allgemeiner Zustand an Renderer übertragen werden.

## Abnahme

1. Eigenes signiertes `.app`-Bündel, eigener ausführbarer App-Einstieg, keine geladene Code-OSS-Workbench und kein VS-Code-Extensionhost.
2. Vorhandene Projekte, Konten, Aufgaben, Teamprofile, Reasoning, Zeitpläne und persönliche Einstellungen sind nach kontrollierter Migration verfügbar.
3. Neuer Einzelagent und Team lassen sich speichern, starten und stoppen. Cron/Webhook starten denselben Runner; frische Projekte und Konten synchronisieren sich im offenen Formular.
4. Reale Fensterprüfung: Ampelknöpfe, Ziehen, Vollbild, Titelleistensichtbarkeit, Seitenwechsel, Menü, Split-/Dockgrößen und Tastaturfokus.
5. Echte Terminalprüfung: Shell, Eingabe, Resize, Wiederöffnen ohne Sitzungsverlust, Abbruch und Sitzungsfortsetzung.
6. Browserprüfung mit lokalem HTTP-Testserver und einer Seite, die iframe-Einbettung verbietet. Fremde Seiten können die Host-Brücke nicht aufrufen.
7. Datei öffnen, bearbeiten, speichern, Diff und Finder-Aktionen; Bildanhang per Auswahl, Zwischenablage und Drag-and-drop; Vorlagen und Excalidraw.
8. Vektor-Tab, Kontenanmeldung, Schlüsselbund und Benutzerabbruch funktionieren; keine stillen No-op-Befehle.
9. Automatische Oberflächentests weiterhin ausschließlich über `tests/headless_browser.py`; keine Desktop-Browserfenster. Native App-Prüfung gesondert als solche dokumentieren.

Diese Prüfung ist eine Bestandsaufnahme. Implementierung, Test und Installation müssen separat belegt werden.
