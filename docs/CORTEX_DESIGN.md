# Cortex: Aufbau und Prüfung

Stand: 8. September 2026.

## Zielbild

Eine IDE für eigene KI-Abos mit mehreren getrennten Konten pro Anbieter. Die Arbeitsaufgabe steht im Mittelpunkt. Die zuletzt ergänzten Wünsche zu OAuth, Logos, Schlüsselbund, Usturlab und Dateiansicht erweitern den ursprünglichen Auftrag; keiner dieser Punkte ersetzt einen anderen.

## Oberfläche

- Links: 250 px für Projekte und deren Aufgaben, Suche, laufende Agenten, Verbindungen und Einstellungen. Ein- und ausblendbar.
- Mitte: Chat mit bis zu 860 px lesbarer Textbreite. Auf der Startseite steht der 715 px breite Composer zentral; in einer Unterhaltung bleibt er unten. Projekt, Rechte, Konto und Modell liegen unmittelbar an der Eingabe.
- Oben: direkte Schalter für Dateien, Änderungen, Vorschau, Terminal und Editor. Auf schmalen Ansichten bleiben verständlich beschriftete Icons/Tooltips.
- Rechts: Dateipanel mit Filter, Ordnernavigation und veränderbarer Breite. Dateien öffnen den echten Code-OSS-Editor neben dem Chat. Vorschau und Terminal verwenden ebenfalls native Editorbereiche, deren Breite sich über die Workbench einstellen lässt.
- Verbindungen: Anbieter nebeneinander, darunter einzelne Konten mit Identität und ehrlich ausgewiesenem Status. Mehrere Profile desselben Anbieters bleiben getrennt. Quoten ohne verlässliche Daten werden nicht erfunden.
- Stil: abgerundete Inseln auf dunklem Grund, weiße Primäraktionen, dünne Trennlinien, Manrope und JetBrains Mono. Anbieterfarben sind auf ihre Marken beschränkt. Kein beige/goldenes UI-Thema. Einzelheiten: „Eigenes Erscheinungsbild“ weiter unten.

Die zuletzt gelieferten sechs Screenshots von Codex und Claude Code sind die konkrete Referenz für den Aufbau. Zusätzliche Recherche:

- [Cursor 3](https://cursor.com/blog/cursor-3): mehrere Projekte und Agenten, Übergang zwischen Aufgabe, Code und Review.
- [Antigravity 2](https://www.antigravity.google/product/antigravity-2): eigenständiger Arbeitsraum für Agenten und Projekte.
- [SpaceXAI](https://x.ai/): dunkle Flächen, Schwarz-Weiß-Kontrast, reduzierte Bedienelemente.

## OAuth und Kontotrennung

Cortex startet den offiziellen Anbieter-Client als Hintergrundprozess. Er besitzt den OAuth-Flow, inklusive PKCE, Browser und Rückruf. Es wird kein Anbieter-Client imitiert und kein Token in die Oberfläche kopiert.

1. Anbieter, Profilname und optional erwartete E-Mail wählen.
2. Browser-Anmeldung in einem neuen isolierten Profil starten.
3. Erst nach Abschluss die tatsächliche Identität lesen. Claude verlangt zusätzlich `loggedIn: true` aus `claude auth status --json`. Ein erfolgreicher Prozess-Exit allein reicht nicht.
4. Erwartete und erkannte E-Mail vergleichen.
5. Erkannte Identität in Cortex bestätigen. Erst dann das Profil als verbunden speichern.
6. Abbruch, Timeout, falsche E-Mail oder Fehler lassen das bisherige Konto unverändert.

[Claude CLI Referenz](https://code.claude.com/docs/en/cli-reference), [Codex Auth](https://developers.openai.com/codex/auth), [Grok CLI](https://docs.x.ai/build/cli/reference).

Grok verwendet `login` bzw. für Aufgaben `agent stdio`, gemäß aktueller offizieller Referenz. Grok 1.0.13 wurde aus der offiziellen Quelle unter `~/.cortex/runtime/` installiert und die verfügbaren Befehle geprüft. Echte OAuth-Anmeldungen erfordern die Kontoauswahl durch den Nutzer; deren Abschluss ist noch nicht live geprüft. Grok wird ohne verifizierbare E-Mail nicht fälschlich als verbunden gespeichert.

Ein explizit gewähltes Konto bleibt pro Aufgabe fest. Automatisches Failover und zusätzliche Reviews über fremde Konten sind für solche Aufgaben abgeschaltet. Im ausdrücklich gewählten Auto-Modus bleibt Routing verfügbar.

## Wiederholte macOS-Passwortabfragen

Der Nutzer-Screenshot benennt „VSCodium Safe Storage“. Das ursprüngliche App-Repacking änderte den Anzeigenamen, ließ aber Electron unter seiner VSCodium-Identität laufen und signierte jeden Build nur ad-hoc. Dadurch griff die neue Anwendung auf den fremden Schlüsselspeichereintrag zu.

Der Build setzt jetzt vor Electron-Initialisierung den Namen Cortex, verwendet `dev.oskarschiermeister.cortex` und eine dauerhaft vorhandene Apple-Development-Signatur. Der native Helper-Name bleibt aus technischen Gründen unverändert. Das schaltet Verschlüsselung nicht ab und verändert keine globalen Schlüsselbundberechtigungen. [Electron: Safe Storage](https://www.electronjs.org/docs/latest/api/safe-storage).

Zusätzlich entfernt: automatische Legacy-Migration mit Keychain-Kopien, Hintergrund-`claude auth status`, direkte Tokenabfragen für das undokumentierte Usage-API und unnötige SecretStorage-Aufrufe für verwaltete OAuth-Profile. Kontingentaktualisierung liest passiv lokale Codex-Metadaten. Das UI behauptet nicht, unbekannte Anmeldestatus fortlaufend zu prüfen.

## Migration und Herkunft

Alte App und Vorzustand bleiben als Sicherung erhalten. SQLite-Migration kopiert nur öffentliche Erweiterungszustände. Alte Benutzernachrichten, Account-IDs und vollständige Profilpfade bleiben erhalten. Vorher nicht tatsächlich verifizierte Konten werden nicht als aktiv übernommen.

Es ist keine separate Usturlab-Erweiterung oder Paketabhängigkeit mehr eingebunden. Die lokale Engine heißt `@cortex/core`; aktive Befehle, Konfiguration, Webview und neue Pfade heißen Cortex. Übernommene MIT-Implementierung und vorgeschriebene Lizenzhinweise sind transparent dokumentiert; eine bloße Umbenennung wird nicht als vollständige Neuentwicklung ausgegeben.

## Validierung

- Gesamte Suite: 317 Core-Tests und 57 Host-Tests bestanden; 13 kosten-/kontoabhängige Live-Tests bewusst nicht ausgeführt.
- Tests für feste Konten pro Aufgabe, Projektpfade, Dateizugriffe einschließlich Symlinks und Git-Renames, mehrere Kontonamen und Wiederanmeldung.
- OAuth-Tests: keine Keychain-/CLI-Aufrufe beim passiven Start, nur zulässige Anbieter-URLs, explizite echte Identität statt Exit-Code und sauberer Abbruch.
- Browser-UI mit ausdrücklich getrennten Testdaten: Projekte und Aufgaben wechseln, Konto/Modell wählen, Dateifilter, Dateiöffnen, Terminal/Änderungen, Suchdialog, Loginfehler und Identitätsbestätigung. Größen 1440×950, 1152×768, 960×700 und 760×680; kein horizontaler Überlauf, keine JS-Fehler.
- Signierter App-Build mit `codesign --verify --deep --strict` geprüft.
- Migration mit separater Test-SQLite geprüft: ursprünglicher Zustand, Credential-Pfade und Benutzernachrichten bleiben erhalten.

Die Bilder unter `screenshots/` stammen aus dem isolierten UI-Test mit Beispieldaten. Sie stellen keine echten verbundenen Abos oder ausgeführten Agentenläufe dar.

Zusätzlich geprüft: Der frisch installierte Grok-Client antwortet ohne Anmeldung oder Modell-Prompt auf ACP `initialize` und meldet `grok.com` als Anmeldeverfahren. Gemini wurde am 2026-09-08 auf Nutzerwunsch vollständig entfernt — Anbieter, Adapter, Routing-Tabellen, Regelschema, Tests und Bildmaterial.

Der abschließende visuelle Test der installierten App und wiederholter Neustarts ist noch offen: Die macOS-Oberfläche war gesperrt und ließ sich durch die Computersteuerung nicht öffnen. Deshalb ist insbesondere „keine Passwortabfrage bei mehreren Neustarts“ noch nicht live bestätigt.


## Eigenes Erscheinungsbild (2026-09-23)

Cortex soll öffentlich auf GitHub stehen und nicht mehr wie eine Kopie der
Codex-App aussehen. Der **Aufbau bleibt**: Seitenleiste mit Projekten und
Aufgaben links, Arbeitsfläche in der Mitte, Dock und Editor rechts, Terminal
unten, Einstellungen mit eigener Leiste. Geändert ist die Oberfläche. Entwurf
auf der Design-Fläche „Cortex Redesign“, zweite Fassung.

- **Inseln statt Flächen, die aneinanderstoßen.** Seitenleiste, Arbeitsfläche,
  Dock, Editor-/Browserbereich und Terminal sind abgerundete Inseln (Radius
  14 px) auf einem dunkleren Grund (`--cx-ground`), 8 px Abstand zueinander
  und zum Fensterrand (`--cx-gap`). Die rechten Inseln beginnen unter dem
  44-px-Band der Titelleiste; darin liegen die Werkzeug-Icons frei auf dem Grund.
- **Runde Formen.** Zeilen 9 px, Karten 16 px, Eingabefeld 22 px, Knöpfe,
  Chips und Reiter ganz rund (`--cx-r-*` in `media/cortex.css`).
- **Eigene Schrift.** Manrope für die Oberfläche, JetBrains Mono für Code,
  Pfade und Terminal. Beide liegen unter `media/fonts/` (SIL Open Font License,
  Lizenztexte daneben, in der Desktop-App unter `resources/licenses/font-*`).
  Der Schlüssel `system` in den Darstellungseinstellungen meint die Vorgabe und
  zeigt jetzt diese Schriften; die Systemschrift heißt `apple`, SF Mono `sfmono`.
- **Kühles Graphit** statt des warmen Grautons: Grund `#0a0b0d`, Arbeitsfläche
  `#111316`, Seitenleiste `#15171a`. Grün (`--cx-green`) nur für „läuft“,
  Bernstein (`--cx-amber`) nur für „braucht dich“, etwa Vollzugriff. Eine früher
  gespeicherte Vorgabe `#181818` gilt als die neue Vorgabe.
- **Einklappen überall.** Die Abschnitte „Angeheftet“ und „Projekte“ klappen an
  ihrer Überschrift zu und zeigen dann ihre Anzahl; zugeklappte Projekte zeigen,
  wie viele Aufgaben sie haben. Der Zustand bleibt gemerkt. Eingeklappt lässt die
  Seitenleiste eine schmale Icon-Leiste mit denselben Wegen stehen. In den
  Einstellungen klappen die Gruppen der Leiste zu; die Gruppe der offenen Seite
  bleibt immer offen, bei einer Suche sind alle offen.
- **Startseite.** Kleines Gehirn, die Frage „Was steht in … an?“, darunter das
  Eingabefeld in der Mitte und vier runde Einstiege statt der Kachelreihe. Die
  Projektwahl sitzt als Chip im Eingabefeld statt als Streifen darüber.
- **Einstellungen** stehen als Zahnrad neben der Kontokarte unten in der Leiste.
- **Plugins** stehen in einer Spalte innerhalb einer Karte statt in zwei freien Spalten.

Die Regeln liegen in `media/cortex-look.css`; sie wird nach allen anderen
Stylesheets geladen. Die Farbwerte stehen als Tokens oben in `media/cortex.css`,
die des Desktop-Rahmens in `engine/packages/desktop/renderer/shell.css` und
die Farben von Monaco und xterm in `renderer/shell.ts`. Die Abschnitte weiter
unten beschreiben, wie Verhalten und Maße aus Codex entstanden sind. Die
Maße gelten weiter, wo die Oberfläche sie nicht ausdrücklich ändert.

Die Oberflächentests messen jetzt diese Werte statt der Codex-Vorlage:
runde Knöpfe (`cortex_control_styles.py`), die Ecke des Eingabefelds als
22-px-Kreisbogen (`cortex_composer_geometry_ui.py`), die Plugins in einer
Spalte (`cortex_plugins_ui.py`), die um die Inseln verschobenen Einstellungen
(`cortex_settings_ui.py`) sowie Farben und Radien der Menüs und der
Befehlsliste (`cortex_menus_ui.py`, `cortex_slash_commands_ui.py`). Farben
laufen dafür über feste Tokens statt `color-mix()`, damit die Tests
`rgb()`-Werte vergleichen können; die hellen Varianten setzt `store.ts`.

## Startseite nach Codex-Referenz (2026-09-08)

Die Startseite zeigt eine projektbezogene Begrüßung und vier Einstiegskarten.
Das Eingabefeld sitzt unten, mit Projektstreifen, Anhängen, Berechtigungsmenü,
Anbieter-/Kontomodellauswahl und Senden. Die Modellauswahl verwendet die echten
verbundenen Konten; nicht verfügbare Konten bleiben deaktiviert. Es werden keine
funktionslosen Mikrofon- oder Sprachchat-Schaltflächen angezeigt.

Berechtigungen: Plan; Genehmigung anfordern; Änderungen automatisch akzeptieren;
Vollzugriff. Die Auswahl wird mit jeder Nachricht an den Host übergeben und
als Aufgabenpräferenz bis zum Anbieter weitergereicht. Claude wartet bei
angeforderten Genehmigungen auf den Start der lokalen Rückfragen-Verbindung.

Geprüft: Build/Typecheck, 60 Host-Tests, 8 Orchestrator-Tests sowie UI-Prüfung
mit der echten Webview-CSP in vier Fenstergrößen. Referenzbilder in
`docs/screenshots/home.png` und `docs/screenshots/permissions-menu.png`
verwenden ausschließlich die ausdrücklich als Demo angelegten Fixture-Konten.

## Plugins-Seite nach Codex-Referenz (2026-09-09)

Die Seite ist der Bildschirmaufnahme der Codex-Plugins-Seite nachgebaut. Die
Maße stammen aus der Aufnahme, nicht aus dem Augenmaß: Inhaltsspalte 728 px,
zwei Rasterspalten à 344 px mit 40 px Spalt, Zeilenfläche 60 px im 68-px-Raster,
Kachel 32 px (36 px in der Installiert-Leiste, 56 px auf der Produktseite),
Suchfeld 32 px, Trennlinie 1 px, Prompt-Banner 240 px. `tests/cortex_plugins_ui.py`
misst diese elf Werte im laufenden Webview mit 1 px Toleranz; derzeit trifft
jeder exakt. Die Flächen kommen aus den bestehenden `--cx-*`-Tokens, nicht aus
dem warmen Grau der Vorlage — die Seite soll neben Konten und Einstellungen
stehen können. Referenzbilder liegen unter `.cache/plugins-reference/`; fremde
Produkt-Screenshots gehören nicht ins Repo.

Bewusst anders als das Vorbild:

- **„Installiert“ ist gelesen, nicht gemerkt.** Es zeigt, was in `.cortex/mcp.json`
  steht. Ein angeklickter Knopf ändert diesen Wert nicht — die Datei tut es.
- **Jeder Katalogeintrag trägt eine echte Serverdefinition.** Was sich nicht
  wirklich installieren lässt, steht nicht im Katalog. Alle Endpunkte und Pakete
  wurden vor der Aufnahme geprüft; das Verfahren steht in
  `media/plugins/SOURCES.md`.
- **Statt „Link kopieren“ gibt es „Serverdefinition kopieren“.** Cortex hat
  keinen Marktplatz, auf den ein Link zeigen könnte; der teilbare Teil eines
  Plugins ist seine Definition.
- **Öffentlich/Persönlich wird zu Projekt/Persönlich.** Das entspricht den zwei
  Orten, an denen `mcp.json` wirklich liegen darf.
- **Der Anmeldezustand beim Anbieter wird nicht behauptet.** Ihn verwaltet der
  Anbieter-Client; die Produktseite sagt das als Satz, nicht als grüner Haken.
  Nur ein leerer Schlüssel ist prüfbar und führt zu „Einrichtung offen“.
- **Skills nennt nur Figma** — die 14 Ordner, die das offizielle Figma-Plugin
  tatsächlich mitbringt. Für andere Einträge fehlt der Nachweis.

Die Logos sind die echten Markenzeichen in Farbe, als SVG-Dateien unter
`media/plugins/icons/` und über `window.__CORTEX_MEDIA__` geladen — die CSP des
Hosts erlaubt `img-src ${webview.cspSource}`, entfernte Bilder nie. Zwölf sonst
lauffähige Server sind nicht aufgenommen, weil für sie kein frei verfügbares
Logo existiert und ein nachgezeichnetes eine Anmaßung wäre.

Die frühere Plugins-Ansicht (Konnektoren- und Vorlagenliste) ist in dieser Seite
aufgegangen: der Spiegelbericht je Konto, „mcp.json bearbeiten“, „In Profile
übertragen“ und die Vorlagen stehen weiterhin da, jetzt in der Kopfleiste und im
Reiter „Vorlagen“. Der Stand davor liegt unter `.cache/pre-plugins-*/`.

Geprüft: Build und Typprüfung beider Pakete, 344 Core- und 114 Host-Tests, die
vier Oberflächentests in fünf Fenstergrößen ohne waagerechten Überlauf, ohne
JavaScript-Fehler und ohne von der CSP blockiertes Bild.

### Nachschärfung an der Vorlage (2026-09-10)

Drei Punkte, an denen die erste Fassung von der Aufnahme abwich:

- **„Installiert“ ist nur die Iconreihe.** Ich hatte dort beschriftete Zeilen
  ergänzt; die Vorlage zeigt an dieser Stelle ausschließlich Kacheln, das
  Zahnrad rechts an der Überschrift und darunter die Bereichsumschaltung.
  Namen und Herkunft stehen jetzt im Tooltip.
- **Installiert und Importiert sind dasselbe.** Der eigene Abschnitt für selbst
  eingetragene Server ist weg: Exokortex, Database Studio und ein
  Katalogeintrag sind für den Nutzer gleichermaßen installiert und stehen in
  einer Reihe. Woher ein Server kommt, sagt der Tooltip.
- **Kein eigener Fensterbalken.** Die Seite zeichnete eine `.cx-topbar` am
  oberen Rand — genau dort liegen die Werkzeug-Icons der Workbench in der
  Titelleiste, und beides überlappte sichtbar. Brotkrume und Aktionen stehen
  jetzt in der Inhaltsspalte, wie bei Konten und Einstellungen. Der Test hält
  fest, dass die Seite keine Topbar mehr rendert.

Außerdem an die Vorlage angeglichen: keine Zahlen an den Überschriften der
Übersicht (auf der Produktseite bleiben sie), ein installierter Eintrag zeigt
das „…“-Menü statt eines Häkchens, und die Kachel ist eine durchsichtige Fläche
mit feinem Rand statt einer aufgehellten.

### Navigation und Start (2026-09-10)

- **Vor und Zurück oben links.** `AgentApp` führt jetzt einen Verlauf statt eines
  einzelnen Seitenzustands: ein Ort ist die Seite *und* die Stelle innerhalb der
  Plugins. Damit führt ein Zurück auch aus einer Produktseite heraus und über
  Seitenwechsel hinweg. Die Pfeile liegen links, weil rechts die Werkzeug-Icons
  der Titelleiste sitzen. `PluginsView` ist dafür gesteuert geworden — der
  Ansichtszustand liegt außen, sonst könnte er nicht in denselben Stapel.
- **Die Brotkrume war zu klein.** 40x14 px ohne Hover: nicht zu treffen und
  nicht als Knopf zu erkennen. Jetzt mit Polsterung und Hover-Fläche; der Test
  misst die Zielgröße mit.
- **Ein Aktualisieren-Knopf zu viel.** Neben „In Profile übertragen“ stand ein
  zweiter Kreispfeil, der nur neu einlas und dabei nichts Sichtbares tat. Weg.
- **Die „MCP-Ansicht" beim Start war ein Editor-Tab.** Nicht die Plugins-Seite:
  im gespeicherten Workbench-Zustand stand `~/.cortex/mcp.json` als Datei-Tab in
  der ersten Editorgruppe — einmal über „mcp.json bearbeiten" geöffnet, danach
  bei jedem Start wiederhergestellt, in derselben Spalte, in der der Chat
  aufgeht. `bootCortexShell` schließt jetzt vor dem Öffnen alle wiederher-
  gestellten Tabs; ein Tab mit ungesicherten Änderungen bleibt stehen, statt
  beim Hochfahren nach einer Entscheidung zu fragen.
- **Die Zwischenansicht beim Start hatte drei Ursachen, nicht eine.** Erst der
  wiederhergestellte `mcp.json`-Tab, dann die Kürzelliste, dann das Produktlogo.
  Das Logo hängt als Hintergrundbild an `.editor-group-watermark .letterpress`
  und lässt sich durch keine Einstellung abschalten; `scripts/patch-empty-editor.py`
  blendet das Wasserzeichen deshalb im Stylesheet aus — nach dem Muster der
  übrigen `patch-*.py`, samt Prüfsummen in product.json. Zusätzlich aktiviert
  sich die Erweiterung jetzt bei `*` statt `onStartupFinished`: Letzteres wartet
  bewusst, bis die Workbench zur Ruhe gekommen ist, und genau in dieser Zeit
  stand die leere Fläche da.
- **Das Tastenkürzel-Wasserzeichen beim Start.** Nachdem die wiederher-
  gestellten Tabs zu waren, zeigte die Workbench kurz ihr Wasserzeichen mit den
  Kürzeln für den leeren Editorbereich. `workbench.tips.enabled: false` steht
  jetzt bei den mitgelieferten Voreinstellungen, und der Chat wird *vor* dem
  Aufräumen geöffnet — so ist die Fläche nie leer. Cortex' eigene Flächen sind
  vom Aufräumen ausgenommen.
- **Start mit leerem Blatt.** `openAgentHome` schlug die jüngste Unterhaltung
  wieder auf — wer Cortex öffnete, landete mitten in einem alten, langen
  Verlauf. Jetzt wird ein bestehender leerer Chat wiederverwendet oder ein neuer
  angelegt; die Seitenleiste sammelt dabei keine leeren „Neuen Aufgaben“ an.

## Einstellungen nach Codex (2026-09-13)

Die Einstellungen sind der Codex-Aufnahme vom 13.09.2026 nachgebaut. Den
Informationsbaum aller Seiten dazu gibt es in `docs/CODEX_EINSTELLUNGEN.md`.
Beim Öffnen ersetzt eine eigene Leiste die App-Leiste. Sie hat 240 px und die
Gruppen Persönlich, Integrationen, Programmierung und Archiviert. Oben stehen
„Zurück zur App“ und eine Suche; rechts laufen die Seiten in einer 768 px
breiten Spalte. Unterseiten wie Browser › Website-Einstellungen › Standort
tragen eine Brotkrumenleiste mit Vor- und Zurück-Pfeilen.

Die Maße sind an Vollauflösungs-Frames vermessen:

- Leiste: Zeile 30 px, Pitch 31 px
- Karte: erste bei 172 px, zweite bei 429 px
- Zeile: 60,5 px mit 13,5/22 px Titel und 12/16 px Untertitel
- Steuerelemente: Schalter 32 × 20 px, Auswahl und Knöpfe 28 px

`tests/cortex_settings_ui.py` misst diese 17 Werte mit 1 px Toleranz. Alle
Textzeilen der Seite „Allgemein“ liegen innerhalb von 1,5 px an der Vorlage.
Farben, Linien, Akzent und Schrift kommen aus den `--cx-*`-Tokens. „Pets“
fehlt; „Archivierte Chats“ heißt „Archivierte Projekte“, weil Cortex Projekte
archiviert.

**Wirksam** (schreibt `cortex.*` oder wirkt sofort in der Oberfläche):

- Berechtigungen und Sandbox → Handlungsspielraum (`setModes`)
- Genehmigungsrichtlinie → `askPermission`
- Modellwahl → Routing
- Konfiguration › Arbeitsweise: Denkaufwand, Arbeitskontext, Rahmung,
  ständige Anweisungen, erst planen, Änderungen prüfen, Zweitmeinung
- Vektor (vormals Database Studio) und sein Schreibzugriff
- Terminalspeicherort
- Kontingentabfrage
- Desktop-Browser beziehungsweise Agentenberechtigung „Browsen“
  (`cortex.browserAccess`)
- Öffnungsziel für Links aus dem Chat
- Tastenkürzel zum Senden (Enter oder ⌘ Enter)
- Darstellung: Design hell/dunkel/System, Akzent, Hinter- und Vordergrund,
  UI- und Code-Schrift, Kontrast, Schriftgrößen, Zeiger-Cursor, Bewegung,
  Schriftglättung
- Editor- und Terminalwerte von Code-OSS
- Profil, Nutzung und Analysen aus den echten Kennzahlen und Konten
- Plugins, Apps, MCPs und Skills aus `mcp.json` und von der Platte
- Konto mit der vorhandenen Kontenansicht
- Archivierte Projekte
- Umgebungen mit den echten Projekten
- Lizenzen, Tastenkürzel-Editor und Ordnerauswahl
- Personalisierung › Cortex-Erinnerung: Notizzettel, Exokortex-Abruf,
  Mindestrelevanz, Treffer, Token-Budget, Modell für Notizen (`cortex.memory.*`),
  Suchbereiche und vier Prompts (`erinnerung.*` im globalState, vom Host je
  Runde gelesen). Test: `tests/cortex_erinnerung_ui.py`. Bauplan:
  `docs/ERINNERUNG_PLAN.md`

**Vorgemerkt** (Wert wird im globalState gespeichert, Cortex nutzt ihn noch
nicht): Diese Zeilen tragen einen kleinen Ring hinter dem Titel; ganze
Vorschau-Seiten einen „Vorschau“-Chip.

- Stimme, Computerverlauf, Appshots, Verbindungen, Git, Worktrees
- Die Website-Rechte des integrierten Browsers
- Aus Allgemein: Sprache, Menüleiste, Energiesparmodus, Benachrichtigungen,
  Spielereien
- Cortex-Anweisungen (der Text wird noch nicht ans Modell geschickt)

Knöpfe ohne Funktion dahinter sind deaktiviert und sagen im Tooltip, warum.
Die App-Werte laufen über `getAppSettings`/`setAppSetting` und liegen unter
`cortex.appSettings`.
