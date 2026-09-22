> Deutsches Handbuch · Zurück zur [englischen Übersicht](../README.md)

# Cortex — Handbuch

Eigenständige macOS-App mit eigenem Electron-Hauptprozess und Cortex-Oberfläche. Links Projekte und Aufgaben, ein zentraler Agentenchat und rechts Dateien, Code, Browser-Vorschau oder Terminal. Die App benötigt weder VSCodium noch eine VS-Code-Installation. Monaco übernimmt den Dateieditor, xterm die Darstellung des lokalen Terminals. Architektur, Datenübernahme und Installation: [Eigenständige Mac-App](EIGENSTAENDIGE_MAC_APP.md).

## Eigene Abos, getrennte Konten

Unter **Verbindungen** lassen sich mehrere private oder geschäftliche Konten desselben Anbieters anlegen. Jedes erhält ein eigenes Profil. Der offizielle Anbieter-Client führt OAuth im Browser aus; Cortex zeigt danach die erkannte E-Mail und speichert das Konto erst nach Bestätigung. Weicht die optional eingegebene E-Mail vom erkannten Konto ab, zeigt Cortex beide Adressen und speichert das tatsächlich angemeldete Konto nur nach ausdrücklicher Bestätigung. Eine Anmeldung lässt sich abbrechen und endet spätestens nach drei Minuten.

Claude Code, Codex und Grok 1.0.13 sind auf diesem Mac installiert. Die ergänzten Programme liegen isoliert unter `~/.cortex/runtime/bin/`; Cortex erkennt sie automatisch. Auf anderen Macs meldet Cortex fehlende Programme ausdrücklich. Anbieter bestimmen, welche Abos, Modelle und Limits unterstützt werden. Cortex erhebt kein zusätzliches KI-Abo. Der Browser-Login selbst ist kein allgemeiner API-Zugang.

Ein in einer Aufgabe gewähltes Konto bleibt an diese Aufgabe gebunden. Bei einem Limit wird nicht unbemerkt auf das private oder geschäftliche Konto eines anderen Anbieters gewechselt. Der Modus „Auto“ erlaubt ausdrücklich regelbasiertes Routing.

## Bedienung

- **Neue Aufgabe:** Projekt und Konto/Modell auswählen, Aufgabe formulieren. Projektbezogene Aufgaben bleiben links erhalten; Suche mit ⌘K.
- **Chat wie bei Codex:** Antworten stehen als Fließtext, dazwischen graue Tätigkeitszeilen — ein Schritt als eigene Zeile („Erstellt `Hero.tsx` +68 -0“), mehrere als aufklappbarer Satz („Tool geladen, hat Dateien gelesen und hat einen Befehl ausgeführt“). Ist ein Auftrag fertig, faltet sich die Arbeit hinter „11m 58s lang gearbeitet ›“; stehen bleiben die Schlussantwort, eine **Webvorschau** mit „Öffnen in“ (Cortex-Browser, Chrome, Safari, Link kopieren), wenn die Antwort eine lokale Adresse nennt, und je Auftrag die Karte **„N Dateien bearbeitet“**. Beim Überfahren einer Datei schwebt ihr Diff darüber; **Rückgängig machen** setzt die Dateien dieses Auftrags nach Rückfrage auf den Stand davor — Cortex merkt sich ihn zu Beginn jedes Auftrags mit `git stash create`, ohne etwas anzufassen, deshalb geht das nur in Git-Projekten. Datei- und Weblinks öffnen rechts im Dock bzw. im Browser. Deine Nachrichten stehen als Blase rechts; lange Fließtexte blenden nach 17 Zeilen aus („Mehr anzeigen“), Codeblöcke bleiben vollständig. Zeit und Kopieren erscheinen beim Überfahren. Sehr lange eingefügte Texte (über 20 Zeilen oder 1.500 Zeichen) werden im Eingabefeld zu einem anfangs geöffneten, scrollbar begrenzten Block; entfernte Blöcke lassen sich wiederherstellen. Unter jeder deiner Nachrichten stehen beim Überfahren außerdem **Bearbeiten** (Stift: die Blase wird zum Feld, Enter sendet neu), **Zurückgehen** (Pfeil: die Nachricht und alles danach verlassen den Chat, ihr Text liegt wieder im Eingabefeld) und **Abzweigen** (Verzweigung: ein neuer Chat mit dem Verlauf bis vor diese Nachricht; wahlweise in einem separaten Git-Arbeitsordner oder ausdrücklich im gemeinsamen Ordner). Der separate Arbeitsordner übernimmt auch noch nicht committete Dateiänderungen und neue, nicht ignorierte Dateien; ignorierte Abhängigkeiten und Konfigurationen müssen bei Bedarf separat eingerichtet werden. Aufgaben im gemeinsamen Ordner laufen innerhalb derselben Cortex-Instanz nacheinander. Der ursprüngliche Chat bleibt erhalten. In allen drei Fällen wird auch der Kontext des Modells auf diesen Punkt gesetzt: jede fertige Antwort merkt sich, wo sie in der Sitzung des Anbieters endet, und die nächste Nachricht zweigt die Sitzung genau dort ab — bei Claude mit `--resume-session-at` und `--fork-session`, bei Codex mit `thread/fork` bis `lastTurnId`. Die ursprüngliche Sitzung bleibt unberührt. Grok kann das nicht; dort und wenn das Abzweigen scheitert, beginnt die Sitzung neu mit dem gekürzten Verlauf. Geänderte Dateien bleiben, wie sie sind — dafür gibt es „Rückgängig machen“. Solange ein Auftrag läuft, fehlen die drei Knöpfe. Logik: `src/panel/rewind.ts`, Test: `tests/cortex_rewind_ui.py`, live `CORTEX_LIVE=1 vitest run test/live-rewind.test.ts`.
- **Modell und Reasoning:** Der Modellknopf im Eingabefeld öffnet den Regler nach Codex (vermessen an der Aufnahme vom 17.09.): oben mittig die Stufe, darunter das Modell, rechts ↺ zurück auf dessen Vorgabe, darunter die Spur mit einem Punkt je Stufe — so viele, wie das Modell kann (Claude 5, Codex 6 bis Ultra, Grok 4.6 4, Grok 4.5 3). Ultra zeigt die Spur als violetten Verlauf. Ein Klick auf die Stufe tauscht das Popover gegen **Modell auswählen**: „Standard“ (Opus 5 auf dem ersten freien Claude-Konto), dann jedes verbundene Konto als eigene Gruppe mit seinem Kontingent und allen seinen Modellen. Esc führt vom Menü zurück zum Regler. Test: `tests/cortex_reasoning_ui.py` (Maße ±1 px).
- **Widgets im Chat:** Wo ein Ergebnis besser zu sehen als zu lesen ist, antwortet der Agent mit einer Karte statt mit Text: Wetter, Timer, Abfahrten, Umrechner, Sendung, To-do, Route, Kalender, Kurs, Weltuhr, Agentenlauf, Tests, Kontingente, Server, Deploy, Verifikation, Scrape-Lauf, Workflow, Abfrage, Graph-Knoten, Entscheidung, Ort benennen, Zeitleiste, Stellen, Design-Abgleich, Farbpalette, Audio-Takes, Kennzahlen, Quiz und Spieltheorie. Der Weg ist ein Codeblock `cortex-widget` mit JSON in der Antwort — Claude, Codex und Grok schreiben ihn gleich; welche Felder es gibt, steht in der Anweisung `core/src/context/widgetBrief.ts`, die Cortex jedem Anbieter mitgibt. Gezeichnet wird in `webview/components/widgets/`. Die Daten holt der Agent selbst; Cortex rechnet nach, was es kann: Weltuhr und Timer laufen live, Kontrast, Trichter-Quoten und Tage bis zur Überprüfung werden in der Karte berechnet. Ein unlesbarer Block bleibt ein Codeblock mit dem Grund, ein noch einlaufender eine ruhige Platzhalterkarte. Aktionen in einer Karte zeigen den genauen Folgeauftrag: Du kannst ihn ausdrücklich starten, ins Eingabefeld übernehmen oder abbrechen. To-do-Häkchen und Timer-Pausen bleiben im Chat gespeichert. Abschalten: Einstellungen › Konfiguration › Widgets im Chat (`cortex.chatWidgets`). Entwurf: `docs/design/cortex-widgets/`, Test: `tests/cortex_widgets_ui.py`.
- **Bild erstellen:** Im „+“-Menü oder mit ⌘I wechselt das Eingabefeld in den Bildmodus: Chip „Bild ×“, dann Seitenverhältnis und Anzahl (1–4); rechts statt des Modells das Bildmodell — **ChatGPT · GPT Image** oder **Grok Imagine**, nur der Anbieter. Das Konto wählt Cortex: das größere zuerst (bei ChatGPT der Tarif aus der Codex-Anmeldung, sonst `cortex.imageAccountOrder`, ⇅ im Menü tauscht), und ist es im Limit, geht der Auftrag an das nächste Konto desselben Anbieters — nie an Claude. Beide laufen über das Abo, ohne API-Schlüssel: Cortex schickt einen Auftrag an das eingebaute Werkzeug `image_gen` des Clients (bei Grok mit Referenzbild `image_edit`), im Nur-Lesen-Modus, und liest das Ergebnis aus dem Protokoll — Codex meldet `imageGeneration` mit `savedPath`, Grok ein abgeschlossenes `tool_call_update` mit `rawOutput.path`. Bei Grok ist das Seitenverhältnis ein echter Parameter, bei Codex eine Vorgabe. Die Bilder bleiben im Kontoordner und stehen direkt im Chat, mit Kopieren, Bewertung und Großansicht unter dem Bild. Ein Klick öffnet die **Bildbearbeitung** nach der Bildschirmaufnahme vom 12.09.: Einzelansicht mit Miniaturen aller Versionen, Zoom und Verschieben, Galerie mit Datum und Mehrfachauswahl, ausgewählte Bilder als Vorschau im Eingabefeld, letzter Beitrag sowie geteilte Ansicht neben dem Chat. **Kommentieren** übergibt eine punktuelle oder rechteckige Auswahl und deinen Änderungswunsch; **Entfernen** übergibt den markierten Bereich; **HG entfernen** fordert ein freigestelltes PNG mit Alphakanal an. Diese Änderungen laufen über das Bildwerkzeug des ausgewählten Anbieters; der Anbieter bestimmt die Genauigkeit der Bearbeitung. **Größe ändern** arbeitet dagegen lokal mit macOS `sips`, setzt exakte Pixelmaße und erhält das Original. Neue Bilder erscheinen als neue Version im Verlauf. Folgeänderungen verwenden die ausgewählten Referenzen bzw. das zuletzt im Chat erzeugte Bild. Speichern, Finder, Vorschau, Varianten und Prompt-Kopie liegen im Bildmenü. Die Webview lädt Bilder nur aus `~/.cortex/profiles`, `~/.codex`, `~/.grok` und den Kontoordnern; nur solche Pfade nehmen Speichern, Zwischenablage und Größenänderung an (`src/panel/images.ts`, `nativeImages.ts`).
- **Anhänge per Drag & Drop:** Dateien, Fotos, Videos oder Ordner aus dem Finder auf Chat, Eingabefeld oder Dateien-Dock ziehen — sie landen als Anhang über dem Eingabefeld. Übergeben wird der Pfad über die isolierte Electron-Brücke, statt große Dateien durch das Fenster zu kopieren.
- **Seitenleiste:** Angeheftetes oben, darunter die Projekte. Ein Klick auf den Ordner klappt seine Aufgaben auf — die Liste wächst, statt sich zu überlagern, und das Ordnersymbol selbst zeigt den Zustand. Offen bleibt, was du geöffnet hast; das Projekt der laufenden Aufgabe klappt von allein auf. Der Zeiger auf einer Projektzeile zeigt Ordner, Aufgabenzahl und den Weg zu **Projekt bearbeiten**: Name ändern, weitere Quellordner aufnehmen, anheften oder den Eintrag aus der Leiste nehmen. Der Kennordner bleibt — an ihm hängen die bestehenden Aufgaben. Ein Projekt, dessen Ordner gerade fehlt, wird blass, verschwindet aber nicht.
- **Drei Knöpfe, drei Inhalte:** Oben rechts liegen **Dateien**, **Browser** und **Terminal**. Jeder ist ein Umschalter: derselbe Knopf macht wieder zu, und was drin lag, kommt beim nächsten Druck zurück. Dateien und Browser legen sich rechts neben den Chat, das Terminal darunter. Ein Knopf, dessen Bereich offen ist, zeigt ein gefülltes Symbol — das steht im Beitrag zur Fenstertitelzeile als zweite Fassung je Befehl (`cortex.showFiles` / `cortex.hideFiles` und so fort), weil ein Menüeintrag sein Symbol fest trägt und nicht nach Zustand wählt.
- **Dateien:** Ein Dock mit Reitern, kein Deckel über einer Ansicht. Oben die Reiter mit × und einem Plus, das dieselben Wege anbietet wie die Knöpfe der Fensterleiste; ganz rechts Vollbild und das × des ganzen Docks. Darunter die Werkzeuge der offenen Datei: die Brotkrume — jedes Ordnerstück klappt seinen Inhalt als Menü auf —, bei Markdown und HTML der Umschalter **Quelle anzeigen** / **Vorschau anzeigen**, der Schalter für den Dateibaum und der geteilte Knopf **Öffnen** mit Standardprogramm, Terminal, „Im Finder zeigen“ und „Sichern unter …“. Rechts steht der Baum mit Filter; er klappt einzeln zu, ohne das Dock zu verschmälern. Ein Klick im Baum ersetzt den offenen Reiter, einer in der Brotkrume öffnet daneben — ⌘-Klick im Baum ebenso. Die Breite wird an der linken Kante gezogen; der Chat quetscht sich, wird aber nie überlagert und behält auch im Vollbildmodus einen Streifen. Der letzte geschlossene Reiter nimmt das Dock mit. HTML läuft als echte Seite, mit ihren Skripten und den Dateien daneben: je Projekt liefert ein kleiner Server den Ordner unter 127.0.0.1 aus (`src/panel/htmlPreview.ts`) — nur mit dem Geheimnis im Pfad, Punktdateien wie `.env` nie. Der Rahmen ist abgeschottet: Fenster öffnen, Cortex umlenken oder Links ins Netz folgen kann die Seite darin nicht; dafür gibt es **Öffnen**. Neu geladen wird sie beim Wechsel des Reiters oder über den Umschalter.
- **Änderungen:** Aktuelle Git-Dateiänderungen und Branch des ausgewählten Projekts — ein Reiter im selben Dock.
- **Browser:** Integrierte Vorschau neben dem Chat mit eigener URL-Leiste und Zurück/Vor/Neu laden. Sie läuft in einem separaten Electron-Inhaltsbereich ohne privilegierte Cortex-Brücke. Ein lokaler Entwicklungsserver muss bereits laufen.
- **Kopfleiste:** Die macOS-Ampelknöpfe gehören zum eigenen Cortex-Fenster. Dateien-, Browser- und Terminal-Aktionen werden nur im passenden Chat-Kontext angezeigt. Die Fensteraufteilung und ihre veränderbaren Bereiche liegen in `engine/packages/desktop/renderer/`; es gibt keine gepatchte Workbench mehr.
- **Originalvorlagen:** 20 editierbare Codex-Vorlagen (7 Word-Dokumente, 7 PowerPoint-Präsentationen, 6 Excel-Arbeitsmappen) mit den Originalvorschauen. Im Chat über **+ → Vorlagen**, die Art über die Überschrift **Vorlagen** wechseln. Auswahl setzt einen kurzen Auftrag ein und hängt die echte Office-Datei samt Anleitung an; ein Vorlagenwechsel ersetzt deren Anhänge. Eigene Vorlagen bleiben unter `~/.cortex/templates` verfügbar. Die Vorlagen selbst sind wegen ihrer proprietären Lizenz nicht im Repository; wie man sie einspielt, steht in `engine/packages/vscode/templates/ORIGIN.md`.
- **Plugins:** Ein mitgelieferter Katalog von 54 geprüften MCP-Servern mit Produktseite je Eintrag — Beschreibung, Beispielprompts, Server, Skills und Herkunft. „Installieren“ verbindet zuerst — Anmeldung, Schlüssel, Prüfung gegen den Server — und schreibt den Server erst dann in `.cortex/mcp.json` und in jedes Anbieterprofil; „Installiert“ zeigt nur, was davon verbunden ist. Figma nimmt über seinen Server im Netz nur freigegebene Programme an — Cortex selbst gehört nicht dazu, die Anmeldung scheitert dort mit einer klaren Meldung. Projekt- und persönliche Datei sind getrennt wählbar. Selbst eingetragene Server erscheinen als „Importierte Plugins“ und bleiben unangetastet. Ein Eintrag, dem ein Schlüssel fehlt, steht als „Einrichtung offen“ oben; eine Anmeldung beim Anbieter verwaltet der Anbieter-Client, und Cortex behauptet ihren Zustand nicht.
- **Xcode:** Der Katalogeintrag „Xcode“ installiert `xcrun mcpbridge`, die Agenten-Schnittstelle, die Xcode ab 26.3 mitbringt — damit bauen Claude, Codex und Grok das offene Projekt, führen Tests aus und lesen Build-Fehler im laufenden Xcode. Cortex prüft, ob Xcode unter Programme liegt, per `xcode-select` gewählt ist und die Brücke hat (`src/panel/xcode.ts`); sonst steht der Eintrag unter „Einrichtung offen“ und nennt den fehlenden Schritt. Die Freigabe für externe Agenten in Xcode (Einstellungen → Intelligence) kann Cortex nicht sehen und behauptet sie nicht. Im Dateien-Dock bietet „Öffnen“ bei Swift- und Xcode-Dateien **In Xcode öffnen** an — geöffnet wird das nächste Projekt über der Datei.
- **Konnektoren:** MCP-Server, einmal in `mcp.json` beschrieben und in jedes Anbieterprofil gespiegelt — Claude, Codex und Grok. Die Einstellungen zeigen je Konto, ob die Spiegelung geklappt hat. Im Chat schlägt `@` sie als Erwähnung vor; Konten bleiben an `anbieter:name` erkennbar.
- **Vorlagen:** Dateien in `templates/`, eigene unter `~/.cortex/templates`. Die Kachel im Chat wird aus der Vorlage selbst gesetzt, nicht aus einem Bild — es gibt kein zweites Artefakt, das veralten kann.
- **Terminal:** Echtes Projektterminal im unteren Panel — mit eigener Kopfzeile und Schließen-Knopf, sodass die Cortex-Kopfleiste die volle Breite behält. Der Knopf oben rechts schaltet es um: zweimal drücken heißt auf und wieder zu, und dazwischen läuft die Shell weiter. Das × der Cortex-Kopfzeile blendet die Fläche ebenfalls aus; eine Sitzung wird über den ausdrücklichen Beenden-Befehl des Terminals beendet. `cortex.terminalLocation: "beside"` legt es stattdessen neben den Chat — wer das gesetzt hat, behält es.
- **Einstellungen:** Plan-/Bearbeitungsrechte, Routing, Rückfragen, Benachrichtigungen und Regeln.

## Lokaler Computerverlauf

Unter **Einstellungen → Computerverlauf** sammelt Cortex auf Wunsch Text aus
dem vordersten Fenster ausdrücklich ausgewählter Apps. Zuerst Apps auswählen,
bei Bedarf **Zugriff erlauben** für die macOS-Bedienungshilfen wählen und danach
die Erfassung einschalten. Der frühere Vorschau-Schalter aktiviert den Dienst
nicht automatisch.

Erfassung, Suche, Zusammenfassungen und Antworten bleiben auf dem Mac. Das
Apple-Sprachmodell wird ausschließlich auf dem Gerät ausgeführt; es gibt keinen
Cloud-Ersatz. Der Dienst benötigt macOS 26 oder neuer und für KI-Antworten ein
verfügbares lokales Apple-Intelligence-Modell. **Verlauf fragen** auf dieser Seite
ist ein eigener lokaler Antwortbereich: Er sendet nichts an die verbundenen
Anbieterkonten, den normalen Chat oder den Exokortex-Export.

Die Einträge liegen AES-GCM-verschlüsselt im eigenen Computerverlauf-Speicher
der Cortex-Erweiterung, der Schlüssel im Secret Storage der App. Einträge lassen
sich nach Text und Datum durchsuchen, einzeln löschen oder vollständig leeren.
**Verlauf löschen** pausiert zugleich die Erfassung. Die Aufbewahrungsdauer ist
einstellbar; die Statusleiste zeigt die aktive Erfassung und pausiert sie per
Klick. Der Dienst läuft nur, während Cortex geöffnet ist.

Der Helfer liest ungefähr alle 20 Sekunden sichtbaren, zugänglichen Text;
ähnliche Beobachtungen werden zu kurzen Arbeitsabschnitten zusammengefasst.
Bildschirmbilder, Audio und Tastendrücke werden nicht aufgezeichnet.
Passwortmanager, sichere Textfelder, Cortex selbst, ChatGPT/Codex und gesperrte
oder inaktive Sitzungen sind ausgeschlossen. **Browser werden in dieser Version
vollständig ausgelassen**, weil die Textschnittstelle den Privatmodus nicht
verlässlich erkennen lässt. Apps, die keinen zugänglichen Text bereitstellen,
liefern keine Einträge. Es entsteht kein lückenloses Protokoll jeder Handlung.

Technik und Prüfungen: [docs/COMPUTERVERLAUF.md](COMPUTERVERLAUF.md).

## Datenbanken

Database Studio ist die Datenbank-Integration von Cortex. Ein Klick auf eine
`.sqlite`-, `.db`-, `.graph`-, `.rdb`-, `.amqrun`- oder `.xlsx`-Datei öffnet sie
als Editor-Tab neben dem Chat, statt als Binärmüll im Texteditor. Tabellen
(`.csv`, `.tsv`, `.jsonl`) bleiben Text und lassen sich über „Öffnen mit" dort
anzeigen.

Der Agent bekommt denselben Blick: der Konnektor `database-studio` liegt fest in
jedem Anbieterprofil und zeigt auf genau die Datenbank, die gerade offen ist —
in Cortex, sonst in der Database-Studio-App. Niemand muss ihn in `mcp.json`
eintragen; ausgeschaltet wird er über `cortex.databaseStudio.enabled`.

Schreibende Aufrufe **über die API** sind aus. Der Agent liest; geändert wird im
Tab. `cortex.databaseStudio.allowWrites` hebt das auf.

Vorausgesetzt wird der Arbeitsbereich Database System unter `~/dev/Database System`
mit gebauter Oberfläche (`npm --prefix database-studio run build`). Liegt er
woanders, sagt das `cortex.databaseStudio.path`.

## Bauen und installieren

```sh
pnpm -C engine install
# Auf einem neuen Mac: offiziellen Grok-Client und Profilschutz installieren
bash scripts/install-provider-clients.sh
pnpm -C engine build
pnpm -C engine test
bash scripts/assemble.sh
# Nur bauen, paketieren und signieren; nichts installieren:
bash scripts/assemble.sh --build-only
```

Das Build-Skript verwendet eine vorhandene Apple-Development- oder Developer-ID-Signatur. Alternativ `CORTEX_SIGN_IDENTITY` setzen. Das fertige Paket liegt unter `.cache/desktop/Cortex-darwin-<arch>/Cortex.app`. Ohne Signatur wird nichts installiert. Die Installation nach `/Applications/Cortex.app` sichert die vorhandene App und prüft die neue Signatur vor und nach dem Austausch. Läuft Cortex noch, bleibt das fertige Paket bereitliegen; das Skript beendet die App niemals. Vor dem Installieren Entwürfe speichern und Cortex vollständig beenden.

- `brand/`: Produktidentität und App-Icon
- `engine/packages/core/`: lokale Cortex-Agentenbibliothek und Anbieteradapter
- `engine/packages/vscode/`: wiederverwendete Cortex-Oberfläche und Host-Dienste; der historische Ordnername bleibt als Quellpfad
- `engine/packages/desktop/`: eigener Electron-Host, Fenster, macOS-Brücke, Editor, Terminal und Paketierung
- `extensions/theme-oskars/`: gemeinsame Farbwerte für Cortex Dark
- `scripts/assemble.sh`: eigenständige App; `scripts/assemble-vscodium.sh`: ausdrücklicher historischer Rückfallpfad
- `docs/CORTEX_DESIGN.md`: Entscheidungen, Referenzen und Prüfung

Vor dem Austausch sichert `scripts/snapshot-app.sh [name]` die installierte App nach `.cache/snapshots/`. Auf APFS verwendet es einen Klon. Ältere Stände über der Grenze (`CORTEX_SNAPSHOT_KEEP`, Standard 2) wandern in den Papierkorb. `--build-only` verändert weder Installation noch Sicherungen.

## Oberflächentests ohne Desktop-Browser

Die automatischen UI-Tests verwenden ausschließlich die separate
`chromium-headless-shell`-Runtime über `tests/headless_browser.py`. Dabei wird
keine installierte Browser-App gestartet. Es gibt keinen Ersatzstart über
Google Chrome, Safari oder einen anderen Desktop-Browser.

```sh
python3 -m playwright install chromium-headless-shell
python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode
# In einem zweiten Terminal:
python3 tests/cortex_popups.py
python3 tests/cortex_queue_ui.py
python3 tests/cortex_ui.py
python3 tests/cortex_plugins_ui.py
python3 tests/cortex_image_ui.py
python3 tests/cortex_image_editor_ui.py
```

Build und Installation starten weder einen Browser noch die Vorschau.

## Daten und Schlüsselbund

Neue Anbieterprofile liegen unter `~/.cortex/profiles/`. Bestehende Profile behalten ihren vollständigen bisherigen Pfad. Die eigenständige App legt ihre Zustands- und Einstellungsdateien unter `~/Library/Application Support/Cortex/Standalone/` ab. Beim ersten Start übernimmt sie die bisherigen Cortex-Metadaten aus den alten SQLite-Speichern, ohne die Quelldateien zu ändern. Große Dateianhänge und vorhandene Arbeitsordner behalten ihre bisherigen Pfade.

Cortex nutzt **Cortex Safe Storage**, eine eigene Bundle-ID und eine stabile Signatur. Beim Start erfolgen keine direkten Claude-Keychain-Abfragen, keine OAuth-Token-Abfragen für Kontingente und keine automatischen CLI-Logins. Fehlende Kontingentdaten bleiben als unbekannt sichtbar. Der Anbieter-Client verwaltet die eigentlichen OAuth-Zugangsdaten.

Die Desktop-Datenübernahme wird atomar abgeschlossen und danach markiert. Geheimnisse bleiben verschlüsselt; schlägt die Entschlüsselung fehl, startet Cortex nicht mit einem scheinbar leeren Kontostand weiter. Der Schlüsselbund kann wegen des neuen App-Binaries eine Freigabe verlangen. Alte nicht verifizierte Kontoeinträge müssen weiterhin erneut angemeldet werden. Das frühere `scripts/migrate-cortex-state.py` bleibt für historische Builds erhalten.

## Herkunft

Cortex ist eine eigenständig paketierte Electron-App. Die frühere VSCodium-Workbench und deren Erweiterungshost werden im Standardpaket nicht mehr mitgeliefert. Die Cortex-Oberfläche und Agentendienste werden weiterverwendet. Teile der ursprünglichen Agentenimplementierung stammen aus Usturlab unter MIT; die Lizenzhinweise bleiben erhalten. Das Paket enthält zusätzlich die Lizenzen von Electron/Chromium, Monaco, xterm und den gebündelten Bibliotheken unter `Contents/Resources/app/resources/licenses/`. Siehe `engine/LICENSE` und die Anbieterlogo-Quellen in `engine/packages/vscode/media/providers/SOURCES.md`.


Gemini wurde auf Nutzerwunsch vollständig aus Cortex entfernt (2026-09-08): Anbieter, Adapter, Routing-Tabellen, Regelschema, Tests und Bildmaterial. Ein noch gespeichertes Gemini-Konto aus einem älteren Build wird beim Laden verworfen.

## Öffentliche Fassung · Eigene Zugänge

Dieses Repository enthält **keine Schlüssel, Tokens oder Konten**. Cortex bringt kein eigenes KI-Abo mit: Jede Person meldet sich in den offiziellen Clients (Claude Code, Codex, Grok) mit dem eigenen Konto an; Cortex erkennt sie unter **Verbindungen**. Schlüssel für Plugins (MCP-Server) werden in der App eingetragen und verschlüsselt über den macOS-Schlüsselbund (Electron `safeStorage`) gespeichert — nie im Projektordner.

```sh
cd engine
pnpm install
pnpm -C packages/vscode exec node esbuild.mjs --production
pnpm build
pnpm package   # baut die macOS-App
```

Voraussetzungen: macOS 13+, Node 22, pnpm 11, Xcode Command Line Tools.

*English:* No credentials are included. Sign in to Claude Code / Codex / Grok with your own accounts; plugin keys are entered in the app and stored in the macOS keychain. MIT licensed — see [`LICENSE`](../LICENSE).
