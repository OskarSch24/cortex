# Eigenständige Cortex-App für macOS

Der Standard-Build erzeugt eine eigene `Cortex.app` mit Electron als Laufzeit,
einem Cortex-Hauptprozess und Cortex-Helpern. VSCodium, die Code-OSS-Workbench
und der VS-Code-Erweiterungshost werden nicht mitgeliefert. Monaco ist die
separate Editorbibliothek; seine Herkunft bedeutet keine Abhängigkeit von einer
installierten IDE. Die vorhandene Preact-Oberfläche, Agentenadapter,
Teams, Reasoning-Einstellungen, Vorlagen und Automatisierungen bleiben dieselben
Cortex-Dienste.

## Aufbau

- `engine/packages/desktop/src/main.ts`: eigene Fenster, Menüs, IPC,
  Vorschau, Anwendungslaufzeit und Beenden.
- `engine/packages/desktop/src/platform.ts`: Anwendungsschnittstelle für die
  wiederverwendeten Host-Dienste. Historische `vscode`-Imports werden beim
  Bündeln auf diese Datei aufgelöst. Ein VS-Code-Paket wird nicht benötigt.
- `engine/packages/desktop/src/storage.ts`: eigene JSON-Speicher,
  verschlüsselte Geheimnisse und einmalige Übernahme der bisherigen Daten.
- `engine/packages/desktop/renderer/`: Cortex-Fensterrahmen, veränderbare
  Arbeitsbereiche, Monaco-Editor und xterm-Terminal.
- `engine/packages/desktop/native/pty.c`: lokaler macOS-PTY-Helfer für echte
  interaktive Shells. Es wird keine Terminal-App gestartet.
- `engine/packages/vscode/`: historischer Quellordner für die gemeinsame
  Oberfläche und Host-Dienste. Der Ordnername ist keine Laufzeitabhängigkeit.

Vorschauseiten laufen in einem eigenen, unprivilegierten Inhaltsbereich.
Die Oberfläche kommuniziert über eine isolierte Preload-Brücke. Lokale Dateien
werden über freigegebene Ressourcenwurzeln bereitgestellt. Editor- und
Sprachdienste laufen lokal: Editor-, JSON-, TypeScript/JavaScript-, HTML- und
CSS-Worker werden mit der App ausgeliefert.

## Eingebauter Browser

Der Browser rechts hat Tabs. Jeder Tab steht in der Kopfzeile der rechten
Seite, neben geöffneten Dateien. Dort sitzen auch das Plus für einen neuen Tab
(⌘T, auch unter Ablage) und die Werkzeug-Icons (Browser, Dateien, Terminal,
Chat-Aktionen). Ist die rechte Seite zu, schweben die Icons oben rechts; ist nur
das Dock offen, stehen sie in dessen Tableiste. Alle Tabs teilen eine Sitzung
(`persist:cortex-preview`), Anmeldungen gelten also in jedem Tab. Öffnet eine
Seite ein Fenster, etwa „Mit Apple anmelden“, wird es ein eigener Tab und bleibt
mit der öffnenden Seite verbunden; schließt es sich nach der Anmeldung selbst,
verschwindet der Tab.

### Passkeys mit Touch ID

Electron 44 kann Passkeys mit Touch ID speichern (`app.configureWebAuthn`). Sie
liegen im Schlüsselbund dieses Macs, gebunden an seine Secure Enclave, und
werden **nicht** über iCloud synchronisiert. Passkeys, die schon im
iCloud-Schlüsselbund liegen (etwa aus Safari), erreicht Cortex nicht: Apple gibt
sie nur Browsern frei, denen es die Berechtigung
`com.apple.developer.web-browser.public-key-credential` erteilt hat. Für Google
und andere Seiten, die mehrere Passkeys erlauben, legt man in Cortex einen
eigenen an; danach meldet Touch ID dort an.

Die Schlüsselbund-Berechtigung gilt auf dem Mac nur mit einem
Provisioning-Profil. `scripts/assemble.sh` sucht eins (über
`scripts/find-provisioning-profile.py`, in den Profilordnern von Xcode oder unter
`$CORTEX_PROVISIONING_PROFILE`), das für das Team der Signatur, die Bundle-ID
`dev.oskarschiermeister.cortex`, diesen Mac und die Gruppe
`<Team-ID>.dev.oskarschiermeister.cortex.webauthn` gilt. Findet es eins, bettet es
das Profil ein, signiert mit der Berechtigung und legt `webauthn.json` in die
Ressourcen; nur dann schaltet die App Touch ID ein. Ohne Profil bleibt alles wie
bisher, und Seiten bieten keinen Touch-ID-Weg an, der dann scheitern würde.
Mehrere Passkeys für eine Seite fragt ein Mac-Dialog ab.

## Bauen

Voraussetzungen: macOS, Node.js/pnpm, Xcode Command Line Tools und eine stabile
Apple-Development- oder Developer-ID-Signatur im Schlüsselbund. Der optionale
Computerverlauf-Helfer wird mit dem macOS-26-SDK kompiliert.

Im Projektverzeichnis:

```sh
pnpm -C engine install
pnpm -C engine build
pnpm -C engine typecheck
pnpm -C engine test
bash scripts/assemble.sh --build-only
```

`assemble.sh` baut die gemeinsame Oberfläche, anschließend den eigenen Host,
das Terminal und alle Editor-Worker. Es paketiert Electron für die aktuelle
Architektur und prüft die Signatur. Das Ergebnis liegt unter
`.cache/desktop/Cortex-darwin-arm64/Cortex.app` beziehungsweise
`.cache/desktop/Cortex-darwin-x64/Cortex.app`. Der genaue Pfad steht auch in
`.cache/desktop-package-path.json`. `pnpm -C engine package` ist der gleiche
Build ohne Installation.

`CORTEX_SIGN_IDENTITY` legt bei Bedarf eine bestimmte Signatur fest.
`CORTEX_PNPM` kann den Pfad zu pnpm festlegen. Fehlt eine stabile Signatur,
wird nicht installiert. Build und Paketierung starten weder Cortex noch
Desktop-Browser.

## Installieren und zurückgehen

Offene Entwürfe speichern und Cortex vollständig beenden. Dann:

```sh
bash scripts/assemble.sh
```

Standardziel ist `/Applications/Cortex.app`; ein anderer absoluter `.app`-Pfad
kann als Argument übergeben werden. Das Skript beendet eine laufende App
niemals. Erkennt es einen Prozess aus dem Ziel-Bundle, bleibt das neue Paket
bereitliegen und die Installation endet mit Status 2.

Vor dem Austausch wird das vorhandene, signaturgeprüfte Bundle über
`scripts/snapshot-app.sh` gesichert. Das neue Bundle wird zuerst daneben
bereitgestellt und geprüft. Erst danach erfolgt der Austausch. Ein Fehler beim
Austausch stellt die vorige App zurück. Die installierte App wird erneut
signaturgeprüft und bei LaunchServices registriert; sie startet nicht von
selbst. Die normale Begrenzung der Sicherungsstände gilt weiterhin.

Der frühere Aufbau bleibt ausdrücklich unter `scripts/assemble-vscodium.sh`
erhalten. Er ist kein automatischer Fallback und wird vom Standard-Build nicht
ausgeführt. Für ein sofortiges Zurückgehen kann stattdessen die gesicherte
vorherige App wiederhergestellt werden. Beide App-Versionen sollten nicht
gleichzeitig laufen, da sie vorhandene Profile und Automatisierungsdateien
teilen können.

## Übernahme bestehender Daten

Die neue App verwendet dieselbe Cortex-Identität und die vorhandenen
Anbieterprofilpfade. Beim ersten Start liest sie die alten Zustände unter
`~/Library/Application Support/Cortex/User/` nur lesend. Dazu gehören
`globalStorage/state.vscdb`, die Arbeitsbereichsspeicher und `settings.json`.
Die Übernahme prüft die Daten vollständig, schreibt einen vorbereiteten neuen
Speicher und schließt ihn durch atomisches Umbenennen ab.

Die neuen Dateien liegen unter `~/Library/Application Support/Cortex/Standalone/`:

- `global-state.json` und `workspace-state.json`: Kontometadaten,
  Projekte, Chats und Arbeitsbereichszustände.
- `settings.json`: eigene Einstellungen; Änderungen werden live übernommen.
- `secrets.json`: verschlüsselte Geheimnisse.
- `migration.json`: Nachweis der abgeschlossenen einmaligen Übernahme.

Die ursprünglichen SQLite-Dateien werden nicht verändert. Dateianhänge,
Agentenarbeitsordner, Automatisierungen und andere vorhandene große Dateien
bleiben am bisherigen Cortex-Speicherort. Absolute Anbieterprofilpfade unter
`~/.cortex/profiles/` bleiben erhalten. Dadurch müssen alte Chats und
pfadgebundene Anbieteranmeldungen nicht auf neue Verzeichnisse umgeschrieben
werden.

Geheimnisse werden beim Übernehmen über den bestehenden macOS-Speicherschutz
auf Entschlüsselbarkeit geprüft und unverändert verschlüsselt übernommen. Schlägt dies fehl, bricht
der Start vor der Agentenaktivierung ab; es wird kein leerer Kontostand als
Erfolg gespeichert. Der neue Programmcode kann eine Schlüsselbund-Freigabe
auslösen. Das tatsächliche Verhalten des persönlichen Schlüsselbunds muss am
realen Benutzerstart überprüft werden; simulierte Speichertests ersetzen diese
Prüfung nicht.

## Prüfen

Host-, Datenübernahme-, Plattform- und Terminaltests befinden sich im
Desktop-Paket. Oberfläche und Fensterrahmen werden über
`tests/headless_browser.py` mit `chromium-headless-shell` geprüft. Für einen
isolierten Startcheck verwendet der Desktop-Hauptprozess `--verify-startup`
und verlangt sowohl `CORTEX_DATA_DIR` als auch ein eigenes
`CORTEX_TEST_HOME`, das dem Prozess-`HOME` entspricht. Der Check darf keine
persönlichen Konten oder Profile verändern und zeigt keinen Dock-Eintrag.

Die Paketprüfung kontrolliert zusätzlich Produktname, Bundle-ID, native
Helfernamen, erforderliche Ressourcen und `codesign --verify --deep --strict`.
Ein gepacktes und signiertes Bundle allein belegt noch keine echten
Anbieteraufrufe oder erfolgreiche persönliche Schlüsselbundmigration.

## Lizenzen

Die unveränderte Cortex-MIT-Lizenz liegt im Paket. Weitere Lizenz- und
Hinweisdateien der gebündelten Laufzeitbibliotheken stehen unter
`Contents/Resources/app/resources/licenses/`, einschließlich Electron,
Chromium, Monaco und xterm. Die dortige `index.json` nennt Versionen und die
kopierten Originaldateien. Der historische VSCodium-Aufbau bleibt separat.
