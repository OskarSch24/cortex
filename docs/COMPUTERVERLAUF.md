# Cortex-Computerverlauf

Der Computerverlauf ist eine lokale Cortex-Funktion. Er verwendet keine
ChatGPT-Daten, keine Provider-Clients, kein MCP und keine Netzwerkschnittstelle.

## Einrichten

1. Einstellungen → Computerverlauf öffnen.
2. Die gewünschten unterstützten Apps auswählen.
3. Falls nötig mit „Zugriff erlauben“ die macOS-Berechtigung für Bedienungshilfen
   anfordern und in den Systemeinstellungen freigeben. Cortex prüft die
   Berechtigung erneut; ein erfolgreicher Entwickler-Test ersetzt diese Freigabe
   nicht. Falls macOS es verlangt, Cortex anschließend neu starten.
4. Erfassung einschalten. Sie läuft während Cortex geöffnet ist.
5. Auf derselben Seite den Verlauf durchsuchen oder eine lokale Frage stellen.

Beim ersten Start ist die Erfassung aus. Der alte `verlauf.aktiv`-Wert stammt
aus einer Vorschau und wird nicht als Freigabe übernommen. Die echte Einstellung
liegt getrennt unter `cortex.computerHistory.v1`.

## Datenweg

Der native Helfer `dist/history-tool` liefert über stdin/stdout ausschließlich
lokale JSON-Nachrichten. `status` listet Apps und prüft Berechtigungen sowie die
Verfügbarkeit des lokalen Modells, ohne Fensterinhalte zu lesen. `permission`
fordert nur nach einer ausdrücklichen UI-Aktion die Bedienungshilfen an.
`sample` prüft App-Freigabe und Ausschlüsse vor jedem Textzugriff.

Der Dienst liest im Abstand von ungefähr 20 Sekunden sichtbaren zugänglichen
Text und fasst wechselnde Ausschnitte in kurzen Arbeitsabschnitten zusammen.
`summarize` und `ask` verwenden ausschließlich das lokale Apple-Sprachmodell.
Kein Modell verfügbar bedeutet keine KI-Antwort; es gibt keinen Cloud-Fallback.
Datums- und Textsuche funktionieren ohne Modellaufruf.

`HistoryStore` speichert eine AES-256-GCM-Datei `history.enc` im Unterordner
`computer-history` von `ExtensionContext.globalStorageUri`. Der Schlüssel liegt
in `ExtensionContext.secrets`. Das Verzeichnis hat Modus 0700, Dateien 0600;
Schreibvorgänge erfolgen verschlüsselt über temporäre Dateien und atomisches
Umbenennen. Ein Prozess-Lock verhindert parallele Schreiber aus mehreren
Cortex-Fenstern. Alte Einträge werden nach der eingestellten Frist entfernt;
zusätzlich begrenzen 5.000 Einträge und 16 MiB den Speicher. Die Oberfläche zeigt
höchstens 200 passende Einträge auf einmal.

`HistoryBridge` sendet Ergebnisse nur an die geöffnete Verlaufsseite. Sie werden
nicht in Gespräche, Provider-Sitzungen, Chatnotizen, Metriken oder den
Exokortex-Export übernommen. Wer im normalen Cloud-Chat nach seinem Verlauf
fragt, übergibt dadurch keine Verlaufsdaten. Die dafür vorgesehene lokale
Fragefunktion steht auf der Computerverlauf-Seite.

Pause, App-Wechsel in den Einstellungen, Löschen und Beenden brechen laufende
native Verarbeitung ab. Eine Versionsprüfung verwirft verspätete Ergebnisse.
Vollständiges Löschen pausiert gleichzeitig die Sammlung. Die aktiven Apps
bleiben ausgewählt und lassen sich später wieder einschalten.

## Grenzen

- macOS 26 oder neuer; lokale KI nur mit verfügbarem Apple-Intelligence-Modell.
- Keine Screenshots, Audioaufnahmen oder Aufzeichnung von Tastendrücken.
- Browser bleiben vollständig ausgeschlossen, einschließlich normaler Fenster,
  weil deren Privatmodus über Accessibility nicht zuverlässig nachweisbar ist.
- Passwortmanager, sichere Textfelder, Cortex und bekannte KI-Assistenten werden
  ausgeschlossen. Sperre und längere Inaktivität unterbrechen die Erfassung.
- Erfasst wird nur zugänglicher sichtbarer Text des freigegebenen Vordergrund-
  fensters. Eine App ohne geeigneten Accessibility-Text liefert keine Inhalte.
- Der Verlauf ist eine Stichprobe des Arbeitskontexts, keine vollständige
  Rekonstruktion aller Klicks, Dokumentänderungen oder Kommunikation.
- Ein zweites Cortex-Fenster meldet einen belegten Speicher, statt denselben
  Verlauf gleichzeitig zu verändern.

## Prüfen

```sh
pnpm -C engine/packages/vscode typecheck
pnpm -C engine/packages/vscode exec vitest run test/unit/computerHistory.test.ts test/unit/computerHistoryHost.test.ts
pnpm -C engine/packages/vscode exec node esbuild.mjs --production
engine/packages/vscode/dist/history-tool self-test
python3 tests/cortex_history_ui.py
```

Der UI-Test nutzt ausschließlich `tests/headless_browser.py` mit
`chromium-headless-shell` und einen lokalen Preview-Server. Der native Selbsttest
und synthetische Modelltests lesen keine tatsächlichen Desktop-Inhalte. Build
und Installation öffnen keinen Browser. Eine tatsächliche Erfassung kann erst
nach App-Auswahl und macOS-Freigabe in der installierten App geprüft werden.
