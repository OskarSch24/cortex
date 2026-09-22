# Cortex: funktionaler Rundgang vom 19.09.2026

## Ergänzung: Reasoning-Stärke je Agent

Direkt unter Konto und Modell besitzt jeder Einzelagent beziehungsweise jede Teamrolle jetzt eine **Reasoning-Stärke**. Die Auswahl verwendet denselben Modellkatalog und dieselben deutschen Stufen wie der Chat. Sie bietet nur die unterstützten Werte an, zeigt die Modellvorgabe und ist für Modelle ohne bekannten Regler deaktiviert. Ein Modellwechsel setzt den Wert auf die neue Vorgabe zurück; erneute Auswahl desselben Modells oder Kontos sowie Aktualisierungen der Kontoliste behalten die Einstellung. Kopieren eines Einzelagenten ins Team übernimmt seine Stärke als unabhängige Rolleneinstellung.

Die Profilvalidierung und Speicherung erhalten `effort`; ungültige oder vom gewählten Modell nicht unterstützte Werte werden zurückgewiesen. Der ausführende Host gibt die Einstellung an denselben `runTask`-/Adapterpfad wie der Chat weiter. Manuelle Starts, Zeitpläne und Webhooks verwenden dadurch pro Rolle denselben gespeicherten Wert. Die Ausführung friert die Einstellung für ihren Rollen-Chat ein und kann sie bei Folgeaufrufen ohne eigene Vorgabe wiederverwenden. Ein explizit gewählter Aufwand für einen Chat-Auftrag hat Vorrang. Bei **Standardmodell** wird die im Editor genannte Katalogvorgabe beim Start ausdrücklich als Modell übergeben; abweichende CLI-Vorgaben können dadurch nicht hinter dem sichtbaren Reasoning-Wert ein anderes Modell wählen.

Prüfung: 536 Host-/Modultests bestanden, ein optionaler nativer History-Test übersprungen; zusätzlich 38 vorhandene Core-Tests für Orchestrator, Codex und ACP. Typecheck und Produktionsbuild bestanden. Der neue Headless-Test `cortex_agent_reasoning_ui.py` prüft Speichern/Neuladen, Modellfähigkeiten, unabhängige Rollen, kopierte Einzelagenten, Konto-/Modellwechsel, laufende Katalogaktualisierung sowie Dropdown-Grenzen bei 760 px. Bestehende Team- und Automations-Oberflächentests bestanden. `docs/screenshots/agent-reasoning.png` wurde visuell geprüft. Modellantworten sind in den Tests simuliert; es wurden keine kostenpflichtigen Anbieteraufträge gestartet.

Der Stand wurde nach `/Applications/Cortex.app` installiert; alle 295 gebündelten Dateien stimmen bytegenau mit dem geprüften Build überein und die vollständige App-Signatur ist gültig. Sicherung: `.cache/snapshots/20260919-173605-vor-agent-reasoning`. Die laufende App wurde nicht neu gestartet; die neue native Ansicht wird erst nach Speichern offener Entwürfe und vollständigem Neustart geladen.

## Ergänzung: geplante Agentenaktionen und aktuelle Ressourcen

Einzelne Agenten und Teams können jetzt einen gespeicherten Auftrag über einen Cron-Zeitplan mit Zeitzone oder einen authentifizierten lokalen Webhook starten. Die neue Sidebarseite **Geplante Aktionen** zeigt aktive und pausierte Profile, nächste Termine und letzte Auslösungen. Die Ausführung verwendet dieselben Konto-, Projekt-, Skill- und MCP-Prüfungen wie der manuelle Start. Ein gemeinsamer Scheduler verhindert doppelte Auslösungen durch mehrere Fenster. Wiederholte Webhooks können mit einem Idempotenzschlüssel dedupliziert werden; pausierte Profile und belegte Agenten werden berücksichtigt. Der Auftrag kann auch aus einem anderen Cortex-Fenster gestoppt werden.

Neue Projekte, Konten und Modelle erscheinen unmittelbar in offenen Agenteneditoren und Auswahllisten. Bestehende Auswahl und Entwürfe bleiben erhalten. Eine seit dem Öffnen geänderte Profilversion wird beim Speichern als Konflikt gemeldet; ein alter Entwurf kann insbesondere keine inzwischen pausierte Automatisierung stillschweigend wieder einschalten. Eine bewusste Aktion lädt den gespeicherten Stand. Erfolgreiche Speicherbestätigungen berücksichtigen außerdem Textnormalisierung und Eingaben während des Speicherns.

Die Ausführung ist lokal und setzt ein geöffnetes Cortex sowie einen wachen Mac voraus. Es wurde kein Dienst für vollständig geschlossene Apps und keine öffentliche Webhook-Adresse eingerichtet. Einrichtung, Pausieren, Wiederanlauf und Grenzen sind unter [Geplante Aktionen](GEPLANTE_AKTIONEN.md) beschrieben.

Abschlussprüfung: 520 Host-/Modultests bestanden; ein bereits optionaler nativer Computer-History-Test wurde übersprungen. Ein veralteter Panel-Fake wurde an die Sichtbarkeitsereignisse der Titelleiste angepasst. Typecheck und Produktionsbuild bestanden. Die sechs Headless-Läufe für Automatisierungen, Profilkonflikte, aktuelle Ressourcen, einzelne Agenten, Teams und Titelbar-Navigation bestanden. Die Navigation deckt jetzt sieben Seiten einschließlich **Geplante Aktionen** ab. Die Automationsintegration verwendet einen echten lokalen HTTP-Server und den echten Cortex-Runner mit simulierten Modellantworten. Es wurden keine Modellaufträge über Benutzerkonten gestartet. Die beiden Bilder `agent-automation-editor.png` und `agent-automations.png` wurden visuell geprüft.

Der Stand ist unter `/Applications/Cortex.app` installiert. Alle 295 gebündelten Dateien stimmen bytegenau mit dem geprüften Build überein; `codesign --verify --deep --strict` bestätigt die App-Signatur. Die laufende App wurde zum Schutz des offenen Agentenentwurfs nicht neu gestartet. Die neue native Oberfläche und Ausführung werden daher erst nach Speichern und vollständigem Neustart geladen; eine native Live-Abnahme dieses Stands steht noch aus. Sicherung des vorherigen Stands: `.cache/snapshots/20260919-172828-vor-geplanten-agentenaktionen`.

## Ergänzung: kontextabhängige Titelleiste

Browser, Dateien, Terminal und Chat-Aktionen erscheinen nur, wenn die Cortex-Hauptfläche sichtbar ist und tatsächlich den Chat zeigt. Auf Agenten, Konten, Plugins, Einstellungen und Exokortex werden sie ausgeblendet. Der Fokus darf dabei im Browser oder Terminal neben dem weiterhin sichtbaren Chat liegen: dessen Schließen-Schalter bleiben erreichbar. Eine verdeckte, geschlossene oder noch nicht initialisierte Chatfläche zeigt keine Chat-Werkzeuge. Die geöffneten Docks bleiben beim Seitenwechsel erhalten.

Die Webview meldet die gerenderte Seite zentral, einschließlich Zurück/Vorwärts und vom Host ausgelöster Navigation. Gleichzeitig wurde der veraltete Navigationszustand im einmal registrierten Nachrichtenlistener korrigiert, der den Verlauf bei späteren Host-Seitenwechseln verkürzen konnte. Exokortex-Watcher-Meldungen steuern die Titelleiste nicht mehr.

Geprüft: sieben neue Host-/Manifesttests in `titlebarContext.test.ts`, der neue Headless-Test `cortex_titlebar_context_ui.py` mit allen sechs Seiten und beiden Navigationswegen sowie der bestehende `cortex_ui.py` für Chat, Projekte, Dateien, Docks und drei Fensterbreiten. Zusätzlich bestehen die sieben Agenten-Hosttests, Typecheck und Produktionsbuild. Der neue Stand ist unter `/Applications/Cortex.app` installiert; alle 295 gebündelten Dateien stimmen bytegenau überein, die vollständige App-Signatur ist gültig. Der native bisherige Fehler wurde auf der Agentenseite bestätigt. Die neue native Darstellung wird erst nach einem Neustart geladen; die laufende App wurde wegen eines ungespeicherten Agentenentwurfs nicht neu gestartet. Sicherung: `.cache/snapshots/20260919-171119-vor-kontextabhaengiger-titelleiste`.

## Ergänzung: Einzelagenten und Rollenvorlagen

Die Seite bietet jetzt eigene Einstiege **Agent erstellen** und **Team erstellen** sowie getrennte Listen für gespeicherte Agenten und Teams. Einzelagenten werden ausdrücklich als solche gespeichert und dürfen genau eine Rolle enthalten. Ältere Teams bleiben unverändert Teams, auch wenn sie nur eine Rolle haben. Einzelaufträge verwenden denselben ausführenden Host mit Konto, Modell, Zugriffsmodus, Markdown und Werkzeugzuordnung; Prompt und Chatname sprechen den eigenständigen Agenten an. Der Profiltyp bleibt im Laufprotokoll auch nach Löschen des Profils erhalten.

Sechs bearbeitbare deutsche Startvorlagen sind aus den veröffentlichten Grok-Bot-Anwendungsbeispielen abgeleitet: Recherche, Fehlerreproduktion, Code-Review, Schreibassistenz, Arbeitskoordination und Support-Analyse. Es sind eigene Cortex-Anweisungen mit verlinkten Quellen, keine importierten Original-Grok-Pakete. **Ohne Vorlage** erlaubt eigene Rollen. Gespeicherte Einzelagenten lassen sich als unabhängige Kopien in Teams übernehmen. Herkunft und Umfang sind unter [Agentenvorlagen](AGENTENVORLAGEN.md) dokumentiert.

Der fokussierte Host-/Runner-Lauf besteht mit 27 Tests, einschließlich Trennung von Einzelagenten und älteren Teams, Speicherung/Neuladen, genau einer Ausführung, passender Promptansprache, Chatname und Erhalt des Profiltyps in alten Ergebnissen. Typecheck und Produktionsbuild sind erfolgreich. Die Providerantworten in diesen Tests sind simuliert.

Die Einzelagenten-Oberfläche wird zusätzlich mit `tests/cortex_single_agents_ui.py` geprüft: sechs Vorlagen und leeres Profil, Herkunftslinks als Hostnachrichten, getrennte Listen, Bearbeiten/Speichern, Navigation mit Entwurferhalt, Konto/Modell/Projekt/Skills/MCP, Start/Stop, Ergebnisse, unabhängige Kopie ins Team, Löschen mit erhaltenem Laufprotokoll und 760-px-Darstellung. Der vorhandene Team-UI-Test deckt die bisherigen Teamabläufe weiterhin ab. Auch hier antwortet ein simulierter Host.

Die Bildkontrolle deckte fehlende gemeinsame Steuerelement-Stile auf. Für die Agentenseite werden die vorhandenen Settings-Farbvariablen jetzt ausdrücklich eingebunden. Der Einzelagententest prüft außerdem den erfolgreichen CSS-Abruf sowie berechnete Farben, Rundungen, Abstände und Variablen der Schaltflächen/Auswahllisten. Der vorübergehende Ausfall eines ganzen Stylesheets ließ sich in wiederholten Abrufen nicht reproduzieren; ein solcher Ausfall wird durch diese Prüfungen künftig als Fehler erkannt.

Der abschließende Einzelagenten-UI-Lauf einschließlich Stilprüfungen und der Team-UI-Lauf sind erfolgreich. Die neuen Bilder `docs/screenshots/agent-starters.png` und `docs/screenshots/single-agent.png` wurden visuell geprüft. Der Stand wurde erneut gebaut, signiert und nach `/Applications/Cortex.app` installiert; alle 295 gebündelten Dateien wurden bytegenau abgeglichen. Der vorherige Stand liegt in `.cache/snapshots/20260919-164838-vor-einzelagenten`. Es gab in diesem Ergänzungslauf keine echten Provider-Aufträge; ein App-Neustart ist nötig, um den neuen Stand in einem bereits geöffneten Fenster zu laden.

## Installierter Stand

Der geprüfte Produktionsbuild wurde am 19.09.2026 unter `/Applications/Cortex.app` installiert. Die vorherige App liegt als Sicherung unter `.cache/snapshots/20260919-163005-vor-agententeams-und-menus`. Die vollständige App-Signatur wurde erfolgreich geprüft; alle 295 gebündelten Dateien aus `dist`, `media`, `templates`, `schemas` und `package.json` stimmen bytegenau mit dem Quellprojekt überein.

Eine direkte native Prüfung war vor der Installation möglich. Danach lieferte die macOS-App-Steuerung für Cortex wiederholt `noWindowsAvailable`, auch nach erneutem Öffnen über den Finder. Daher sind der neu installierte Titelleisten-Menüservice und ein echter Teamauftrag mit zwei Anbieterantworten **noch nicht live abgenommen**. Es wurde kein Teamauftrag mit Benutzerkonten gestartet. Die unten beschriebenen erfolgreichen Oberflächentests, Provider-CLI-Proben und Host-/Runner-Tests sind davon getrennte Nachweise. Cortex muss vollständig beendet und neu gestartet werden, damit der installierte Stand sicher geladen ist.

Geprüft wurde die echte Preact-Oberfläche mit `dev/preview.html` und einem ausdrücklich simulierten Host. In den hier beschriebenen automatisierten Prüfungen wurden keine echten Provider-Aufträge ausgeführt, keine Benutzerkonten verändert und keine Desktop-Browser gestartet. Die UI-Tests nutzten ausschließlich `tests/headless_browser.py` und Playwright Chromium Headless Shell: Port 4190/4191 für Navigation und Settings, 4187/4188 für Menüs und Teams. Für geänderte Oberfläche wurde ein isoliertes Bundle `/tmp/cortex-audit-webview.js` verwendet; dieser Rundgang hat keine Installation durchgeführt.

## Behobene Bedienfehler

- Einstellungsmenüs lagen am unteren Fensterrand außerhalb des sichtbaren Bereichs und wurden in der Browserberechtigungs-Tabelle vom Scrollcontainer abgeschnitten. `Select` und `MultiSelect` rendern nun außerhalb dieser Container, wählen den verfügbaren Platz über oder unter dem Auslöser und begrenzen Höhe/Breite auf das Fenster. Pfeiltasten, Home/End, Enter, Escape, Tab, Mehrfachauswahl und Touch sind geprüft. Escape und Auswahl geben den Fokus an den Auslöser zurück.
- Der verzögerte Scroll-Reset einer Einstellungsseite konnte nach schnellem Tastaturfokus die Seite wieder nach oben versetzen. Er erfolgt nun vor dem Zeichnen der neuen Seite.
- Plus → Konnektoren öffnete im realen Host nur die Einstellungen ohne MCP-Unterseite. Die zugehörige Änderung in AgentApp/Composer öffnet Plugins → MCP und bewahrt den ungesendeten Text. Der Regressionstest prüft diese vollständige Rückkehr.
- Der Vorschau-Host beantwortete die neue Chat-Suchnachricht nicht. Die Fixture liefert jetzt gezielte, korrelierte Suchantworten; die reale Suche ist unabhängig davon im Host und einem Unit-Test geprüft.

## Tatsächlich geprüfter Umfang

Der Grundlauf für Pane-Breiten, Projektwahl, Projektarchiv und Chat-Öffnen verwendete das zu Beginn vorhandene Webview-Bundle. Der große UI-Test, Popup-Test, bestehende Settings-Test und der neue 22-Seiten-Test wurden anschließend mit dem isolierten Bundle aus dem geänderten Quellstand wiederholt. Die ergänzten Team- und Menüprüfungen stehen unten mit ihrem jeweils eigenen Nachweis und ihren Grenzen. Sie erweitern die früheren Ergebnisse nicht nachträglich zu einer nativen Live-Abnahme.

| Test | Nachgewiesener Umfang |
| --- | --- |
| `cortex_settings_navigation_ui.py` | Alle 22 Einstellungsseiten erreichbar; 45 Auswahllisten mit sämtlichen Optionen im sichtbaren Fenster; Tastatur, Fokus, Touch, Mehrfachauswahl und 960/760 px Fensterbreite. |
| `cortex_pane_widths_ui.py` | Dock, Dateibaum und Seitenleiste per Maus skalieren, Tastaturschritte und Zurücksetzen; Breiten nach Neuladen erhalten; Grenzen, Vollbild, Aus-/Einblenden; Entwurf bleibt erhalten. |
| `cortex_project_picker.py` | Projektwahl, Popup-Geometrie, Escape/Außenklick und fehlende Projektordner. |
| `cortex_archive_ui.py` | Projekte lokal archivieren und wiederherstellen; Seitenleistenansicht. |
| `cortex_chat_open.py` | Chat öffnen/erneut öffnen, Scrollposition zur neuesten Nachricht; reale Content-Security-Policy. |
| `cortex_settings_ui.py` | Settings-Navigation/Suche/Brotkrumen, Darstellungswechsel, native Nachrichten für Berechtigungen, Archiv und Composer-Sendetastenkürzel; ausgewählte Layoutmaße. |
| `cortex_popups.py` | Modell-/Reasoning-, Berechtigungs-, Plus- und Slash-Menüs: Innen-/Außenklick, Wechsel, verschachteltes Escape und gespeicherter Reasoning-Wert. |
| `cortex_ui.py` | Chat-/Projektwechsel, Quellen und Ausgaben, Dock-Tabs/Dateibaum, Markdown/HTML-Vorschau, Modellwahl, Reasoning, Rückkehr aus MCP mit Entwurf, Suche, simulierte Kontodialoge und Fensterbreiten 1152/960/760 px. |

Zusätzlich bestanden 35 Tests in sieben Unit-Testdateien: `nativeSettings`, `optimisticSettings`, `conversationSearch`, `workspace`, `htmlPreview`, `filePreview` und `agentWorkspace`. Geprüft wurden unter anderem erlaubte native Einstellungswerte, geordnete Speicherbestätigungen, Chat-Suche, Dateien aus realen temporären Projektverzeichnissen, Git-Diffs, HTML-Vorschau und Zuordnung von Konto/Projekt zum jeweiligen Chat. TypeScript-Prüfung ohne Dateiausgabe war erfolgreich.

Die Host-Verdrahtung wurde für Dateibaum (`inspectWorkspace`), Dateiinhalte (`readFileBody`), Vorschau (`previewFile`), Änderungen (`getDiff`), Terminal (`openTerminal`), Modell-/Kontowahl und native Einstellungen zusätzlich im Quelltext nachvollzogen. Ein gespeicherter App-Einstellungswert allein wurde ausdrücklich nicht als Nachweis einer Funktion gewertet.

## Agententeams

Die Seite **Aktive Agenten** besitzt einen echten Teameditor und einen Host-Runner. Ein Team speichert 1–20 Rollen, gemeinsame und persönliche Markdown-Anweisungen, Konto/Modell, Projekt, Zugriffsmodus, Skills und Abhängigkeiten. Ein Start erzeugt eigene Rollen-Chats. Der Runner startet jede Rolle, sobald ihre Übergaben abgeschlossen sind — unabhängige Rollen also nebeneinander — und übergibt nur abgeschlossene Ergebnisse ausdrücklich ausgewählter Vorgänger. Gleichzeitig laufen höchstens zwölf Rollen und drei je Konto; den Arbeitsordner teilen sich nur lesende Rollen, eine schreibende bekommt ihn allein. Scheitert eine Übergabe, werden davon abhängige Rollen blockiert; unabhängige Rollen dürfen weiterarbeiten. Stop erreicht den laufenden Agenten und verhindert weitere Starts. Das Löschen eines Teamprofils entfernt seine bestehenden Chats nicht.

`tests/cortex_teams_ui.py` ist mit dem gemeinsamen Bundle erfolgreich: Rollen/Konten/Modelle, Markdown-Import/-Export und Ergebnisdarstellung, Übertragung der gewählten Skills in der Teamkonfiguration, providerabhängige MCP-Auswahl, kreisfreie Übergaben, bestätigtes Speichern und Fehlerbehandlung, Entwurferhalt über Konten-Navigation, Start/Stop/Status, Team-/Agentenlöschung, 1–8-Grenze, fehlende Konten und 850-px-Ansicht. Die UI zeigt Läufe erst nach einer Hostmeldung an; der Test bestätigt, dass die Teamknöpfe keine gewöhnliche `send`-Nachricht absetzen. Der Host ist in diesem UI-Test vollständig simuliert.

Die Host- und Runner-Tests liegen in `agentTeamsHost.test.ts` und `agentTeams.test.ts`. Sie verwenden reale Cortex-Methoden und temporäre Dateien; Providerantworten werden simuliert. Sie prüfen Rollen-Chats, Promptaufbau mit tatsächlichen Markdown-Skilldateien und Übergaben, Zugriffseinstellungen, frühes Ablehnen ungültiger MCP-/Skill-Zuordnungen, Abbruchweitergabe, Fehler statt falscher Erfolgsmeldungen und lokale Speicherung. Der abschließende fokussierte Lauf ist mit **24/24 Tests** erfolgreich: 18 Store-/Runner-Tests und 6 Host-Tests. Dazu gehören persistierte Revisionskonflikte, exklusive kurze Dateisperren, atomare Speicherung, gesonderter Laufbesitz, Schutz lebender fremder Läufe, Erhalt fremder Änderungen, Ablehnen doppelter Starts desselben Teams, verständlicher Stop-Hinweis für einen fremden Lauf, frühe Speicherung des Chatlinks und Wiederherstellung nach Schreibfehlern. Mehrere Store-/Runner-Instanzen werden im Test simuliert; eine echte Mehrfenster-App-Abnahme ist damit nicht behauptet.

Die Sperre für laufende Arbeit an Projektdateien (`projectRuns`) gilt nur innerhalb derselben Host-Instanz. Die sichere Team-Konfigurationsspeicherung ist keine Dateisolation zwischen unterschiedlichen Teams/Chats in verschiedenen Fenstern.

### MCP-Auswahl: konkret nachgewiesene Grenze

Eine exklusive MCP-Auswahl ist derzeit nur für Claude freigegeben. `undefined` übernimmt die Anbieter-Konfiguration, eine leere Auswahl schließt externe MCPs aus, und eine benannte Auswahl schränkt sie auf diese Konnektoren ein. Die interne Cortex-Freigabe-/Canvas-Brücke und eingebaute Anbieterwerkzeuge sind davon getrennt. Codex, Grok und Copilot zeigen deshalb keine scheinbare Einschränkung im Teameditor; der Host weist eine trotzdem gesendete Einschränkung vor dem Lauf zurück.

Hierzu meldet die zugehörige Teilprüfung 77 erfolgreiche Core-Tests. Eine lokale Probe mit Claude CLI 2.1.104, isoliertem Profil und einer lokalen API-Attrappe bestätigte ausschließlich den gewählten Server sowie beim Resume mit leerer Auswahl keine externen MCPs. Es fand **kein echter Modellaufruf** statt. Bei Codex 0.155 behielt eine leere `mcp_servers`-Konfiguration geerbte Server bei; diese Variante wird deshalb nicht als exklusive Einschränkung angeboten.

### Bezug zur offiziellen Grok-Dokumentation

Die übertragenen Arbeitsprinzipien sind klar benannte Verantwortlichkeiten und dauerhafte Rollenanweisungen, nachvollziehbare Übergaben sowie wiederverwendbare Skills. Grok dokumentiert diese Konzepte unter [Bots](https://docs.x.ai/grok-bot/bots), [Zusammenarbeit](https://docs.x.ai/grok-bot/chat-and-collaboration) und [Skills/Routinen](https://docs.x.ai/grok-bot/skills-routines-and-automations). Die Quellen wurden am 19.09.2026 geöffnet und geprüft.

Der Funktionsumfang ist unterschiedlich: Grok beschreibt einen gemeinsamen persistenten Cloudcomputer und asynchrone Bot-Kommunikation. Cortex führt die Teamrollen aktuell lokal, endlich und geordnet aus; weder 24/7-Cloudbetrieb noch freie Gruppenkommunikation oder automatische Team-Zeitpläne wurden hier umgesetzt. [Grok: Computer und Apps](https://docs.x.ai/grok-bot/computer-and-apps)

Der [Nutzungsleitfaden für Agententeams](AGENTENTEAMS.md) erklärt Einrichtung, Rollen, Konten/MCPs, Markdown, Skills, Ergebnisse, Stop und Neustartverhalten.

## Menüs in Webview und nativer Workbench

Die gemeinsamen Menüfarben und Formen liegen in `media/cortex-menus.css`. Sie gelten für Plus-, Berechtigungs-, Modell-/Reasoning-, Vorlagen-, Dock- und weitere explizit benannte Cortex-Menüs. Auch die außerhalb von Scrollcontainern platzierten Einstellungsmenüs erhalten diese Tokens. Helle und benutzerdefinierte Designs bleiben über die vorhandenen Farbvariablen wirksam.

`tests/cortex_menus_ui.py` prüft die echte Webview mit simuliertem Host: neutrale Flächen/Farben ohne Unschärfe, Auswahlzustände, Pfeiltasten/Home/End/Escape, Fokus-Rückgabe, den weiterhin bedienbaren Reasoning-Regler, Vorlagen-Kategorien und helles Design. Der abschließende Lauf mit dem gemeinsamen Bundle ist erfolgreich, ebenso der erneut ausgeführte Team-UI-Test. Der ebenfalls erfolgreiche `cortex_popups.py` deckt zusätzlich Innen-/Außenklick, Menüwechsel, verschachteltes Escape und Entwurferhalt ab.

Für das native Cortex-Untermenü in der Fenstertitelleiste erweitert `scripts/patch-titlebar-menu.py` gezielt den Menüadapter. Die vorhandenen Commands für Dateien, Änderungen, Verlauf, Zeichenfläche, Kopieren/Export, Umbenennen, Ausgabe-Stil, Fork, Wachhalten, Archivieren und Löschen bleiben die bestehenden Workbench-Aktionen. Der globale Menüservice und Menüs anderer Editoren/Erweiterungen werden nicht ersetzt.

`tests/cortex_titlebar_menu_patch.py` ist erfolgreich. Er arbeitet auf einer **temporären Kopie** des tatsächlich installierten Workbench-Bundles und prüft JavaScript-Syntax, Prüfsummen, wiederholbare Anwendung, den auf `submenuitem.api:cortex.chatMenu` begrenzten Adapter sowie unveränderte Action-/Runner-/Anchor-/OnHide-Übergabe. Bei einem unbekannten Upstream-Anker schreibt der Patch keine Teiländerungen. Der Test bestätigt außerdem, dass die installierten Originaldateien unverändert geblieben sind.

Dies ist ein realer Bundle-/Adaptertest, keine interaktive Abnahme des nativen Menüs in der laufenden installierten App. Die erfolgte Installation und die blockierte native Prüfung sind am Anfang dieses Berichts dokumentiert.

## Abschließender Integrationsstand vor nativer Abnahme

Der Hauptlauf meldet **482 erfolgreiche Core-Tests, 48 übersprungene**, sowie **472 erfolgreiche Host-Tests, einen übersprungenen**. Der Host-Vollsuite folgten drei zusätzliche Store-Tests; der abschließende Teamfokus enthält die oben genannten 24 erfolgreichen Tests. Diese Zahlen werden nicht addiert, da die Teilprüfungen überlappen. Übersprungene Tests gelten nicht als bestanden.

Core- und Host-Typecheck sowie der Produktionsbuild sind erfolgreich. Die abschließenden UI-Läufe für Menüs, Teams, Slash-Befehle, Dokumentvorlagen, Kantengeometrie und Pane-Breiten sind ebenfalls erfolgreich. Das belegt den getesteten Quell-/Bundle-Stand. Die Installation samt bytegenauem Abgleich ist abgeschlossen; die native Live-Abnahme bleibt wegen des oben genannten Fensterzugriffs offen.

## Sichtbare, aber noch nicht wirksame Funktionen

Browser-Websiteberechtigungen einschließlich Kamera/Mikrofon, Cookies, Do Not Track, Autofill und Agenten-Upload-/Downloadregeln haben keinen ausführenden Browser-Consumer. Die bisher unmarkierten Optionen tragen jetzt Vorschau-/Pending-Hinweise; die falsche Zusage einer automatischen Anwendung wurde entfernt. Browser- und Downloadverlauf sind als noch nicht angebundene Ansichten bezeichnet, statt einen angeblich leeren realen Verlauf zu behaupten.

Die globale Skills-Auswahl unter Plugins wird bislang nur gespeichert und nicht an Anbieter weitergegeben; auch dies steht nun unmittelbar am Steuerelement. Die bereits als Vorschau markierten Seiten für Stimme, Appshots, Fernverbindungen, Git und Worktrees bleiben Vorschauen. Hooks und Worktrees hatten animierte Neu-laden-Knöpfe ohne Datenabfrage; diese sind nun klar als noch nicht verfügbar markiert, statt eine Abfrage vorzutäuschen.

## Grenzen der Prüfung

Diese Ergebnisse belegen nicht, dass jede Aktion der installierten Desktop-App funktioniert. Native Workbench-/Betriebssystemdialoge, tatsächliche Anbieteranmeldungen, echte Provider-Antworten und Browserrechte eines externen/integrierten Browsers wurden nicht interaktiv ausgeführt. Die Fixture simuliert ihre Antworten. Die native Installation und deren visuelle Abnahme sind getrennte Schritte. Bereits als Vorschau gekennzeichnete Einstellungen wurden nicht durch neue Backend-Funktionen ersetzt.
