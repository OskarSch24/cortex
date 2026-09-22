# Issues aus dem Testlauf vom 13.09.2026

Gefunden beim Durchgehen der [Testliste](TESTLISTE.md). Jede Meldung nennt den Beleg, damit sie sich nachprüfen lässt.

## Stand der Behebung (13.09.2026, abends)

| Issue | Status | Was geändert wurde | Beleg |
|---|---|---|---|
| W1 Kurs stürzt ab | ✅ behoben | `parseWidget` macht aus Zahlen Anzeigetext („66.633,9“, „−0,05 %“), Pfeil folgt der Richtung | Unit-Test, alte Claude-Antwort wird gezeichnet, neuer Live-Lauf |
| W2 Server-Kopf | ✅ behoben | Warnungen ohne kranken Container zählen mit | alte Antwort zeigt „1 Warnung“ |
| W3 Zahlen ohne Einheit | ✅ behoben | Regen „mm“, Wind „km/h“, Kennzahlen deutsch formatiert | Unit-Test, Screenshot |
| W4 Containernamen | ✅ behoben | 4/3/2 Spalten je nach längstem Namen | Screenshot |
| W5 Widget ohne Daten | ✅ behoben | Anweisung: „No data, no widget“ | Live: Zeitleiste antwortet nur mit Text |
| W6 Beschriftung abgeschnitten | ✅ behoben | Zeichenfläche bei zwei Beteiligten höher | Screenshot |
| W7 `hidden` missverstanden | ✅ behoben | Typ in der Anweisung, Karte wertet nur `true` | Live-Lauf |
| W8 wechselnde Quellen | ✅ behoben | Anweisung nennt feste Quellen ohne Schlüssel (alle am 13.09. geprüft) | Abfahrten 37 s statt 120 s |
| S1 Standort | ✅ behoben | Heimatort-Einstellung, nie per IP | Live: Frankfurt |
| P1 YouTube ohne Schlüssel | ✅ behoben | Server mit fehlendem Pflichtwert kommt in kein Profil | Unit-Test; wirkt nach Neustart |
| P2 Vektor ohne API | ✅ behoben | Konnektor nur bei laufendem Host oder `api.json`; Cortex beobachtet die Datei und spiegelt neu | wirkt nach Neustart |
| P3 Figma nicht angemeldet | ✅ behoben (Anmeldung offen) | Figma lässt nur freigegebene Programme zu, Cortex’ eigene Anmeldung scheiterte immer. „Anmelden“ meldet jetzt Claude Code (Steueranfrage `mcp_authenticate`) und Codex (`codex mcp login`) selbst an; Prüfung fragt die CLIs. Figma geht nur noch in Claude- und Codex-Profile; Grok nutzt den Figma-Konnektor seines Kontos über Groks Gateway (`GROK_MANAGED_MCPS_ENABLED`/`…GATEWAY_TOOLS_ENABLED`, Test `grok-connectors.test.ts`; live: 40 `figma__*`-Werkzeuge gefunden) | Unit-Test `agentLogin.test.ts`; Claude Code bekam von Figma einen Anmelde-Link |
| P4 Xcode „verbunden“ ohne Freigabe | ✅ behoben | Prüfung ruft `XcodeListWorkspaces`; Status „Freigabe in Xcode offen“ | Unit-Test, echtes Xcode |
| P5 `browserAccess` wirkungslos | ✅ behoben | Bei „nie“ Browser-Plugins mit `--headless`; Regel für alle drei Stufen in der Anweisung; neu gespiegelt beim Umschalten | Unit-Test |
| P6 Katalog „schlüssellos“ | ✅ behoben | JetBrains, Kubernetes, Firebase mit Voraussetzung und Prüfung | Typprüfung, Plugins-UI-Test |
| P7 Kubernetes `ping` leer | 🔒 offen | Liegt im Plugin selbst (`mcp-server-kubernetes`), nicht in Cortex | — |
| P8 Reihenfolge | ✅ behoben für Profile | Profile werden nach Namen sortiert geschrieben; `mcp.json` ist die Datei des Nutzers und bleibt in seiner Reihenfolge | Zyklustest: Profile byte-gleich |
| K1/K2 alte Profile | ✅ behoben | Ordner ohne Konto (älter als 24 h) wandern beim Start nach `~/.cortex/profiles-archiv/<Datum>/`, beim Entfernen eines Kontos ebenso | Unit-Test; wirkt nach Neustart |
| T1 `cortex_ui.py` | ✅ behoben | An Einstellungen und Chat nach Codex angepasst | Test bestanden |
| T2 Vorschau-Server | ✅ behoben | `headless_browser` startet ihn selbst | alle UI-Tests ohne Handstart bestanden |
| P2 nach Neustart | ✅ bestätigt | Vektor-API aus → Konnektor fehlte in allen Profilen; Vektor im Hintergrund gestartet → Cortex hat ihn ohne Neustart wieder eingetragen | Profile von Claude, Codex, Grok |
| V1 Vektor: IDs mit Doppelpunkt | ✅ behoben (neu gefunden) | `graph_node` mit `organization:facebook` → „Unbekannter Knoten organization%3Afacebook“: Graph- und Tabellen-Routen der Vektor-API dekodierten die Adresse nicht (Redis-Routen schon). Behoben in `database-studio/src/services/api/routes.ts` und `src/sqlite/services/api/routes.ts`, Vektor neu gebaut | 29/29 Vektor-Funktionen ✅ |
| K1/K2 nach Neustart | ✅ bestätigt | 3 Gemini- und 2 Grok-Ordner liegen in `~/.cortex/profiles-archiv/2026-09-13/` | Dateisystem |
| P1 nach Neustart | ✅ bestätigt | `youtube` steht in keinem Profil mehr | Profile |
| P4 Xcode nach Neustart | ✅ freigegeben | Testprojekt `~/Developer/CortexXcodeTest`; Claude (`node`, signiert) und Grok (signiert) dauerhaft freigegeben. Ordner `~/Developer` und das Test-Python (unsigniert) nur 24 h | 56/57 Xcode-Funktionen ✅ |
| U1 Kubernetes ohne Cluster | ✅ eingerichtet | `colima` (vz, containerd, k3s) + `kubectl` + `helm`; Tests nur im Namespace `cortex-test`, danach gelöscht | 24/27 ✅, Rest liegt im Plugin |
| U2 Codex-Werkzeuge | ✅ behoben (neu gefunden) | Codex fand `codex-code-mode-host` nicht → Verweis auf die Datei aus ChatGPT.app angelegt | Codex-Toolaufrufe laufen |
| X1 `XcodeRefreshCodeIssuesInFile` | 🔒 Xcode | Diagnosen nur für Dateien in einem offenen Editorfenster, headless Fehler 5 | — |
| P9 Kubernetes `drain` | 🔒 Plugin | Plugin nutzt das entfernte kubectl-Flag `--delete-local-data` | kubectl-Fehler im Log |
| P10 Kubernetes `port_forward` | 🔒 Plugin | kubectl-Weiterleitung lief nach Serverende weiter und blockierte Port 18080 | Prozess von Hand beendet |

Weiterhin durch die Umgebung blockiert (keine Cortex-Fehler): Figma-Anmeldung (Plugins › Figma › Anmelden), Firebase nicht angemeldet und ohne Projekt, keine JetBrains-IDE installiert. Xcode braucht für den Dauerbetrieb eine einmalige Freigabe per `sudo` (Ordner `~/Developer` dauerhaft); unsignierte Programme wie das Test-Python lassen sich nur für 24 h freigeben. Nebenbei: `gcloud` startet nur mit `CLOUDSDK_PYTHON` auf Python 3.11, mit dem System-Python 3.9 bricht es ab.

Schwere: **hoch** = Funktion kaputt · **mittel** = funktioniert, aber falsch oder irreführend · **niedrig** = Schönheitsfehler.

## Widgets

### W1 · Kurs-Widget stürzt ab, wenn das Modell Zahlen schickt — hoch
- **Beleg:** Live-Lauf „Wie steht Bitcoin heute in Euro?“ → Claude schickt `"price": 66633.9, "change": -0.05`. Der Block ist gültig, die Karte fällt aber auf „Widget konnte nicht gezeichnet werden“ zurück (`tests/widgets-live/render.json`).
- **Ursache:** `Ticker` in `webview/components/widgets/alltag.tsx` ruft `w.change.trim()` auf. Das geht nur bei Text, das Schema in der Anweisung verlangt Text, `parseWidget` lässt aber auch Zahlen durch.
- **Folge:** Genau der Fall, den Modelle bei Kursdaten natürlicherweise liefern, zeigt keine Karte.

### W2 · Server-Kopf sagt „Alles in Ordnung“, obwohl eine Warnung darunter steht — mittel
- **Beleg:** Live-Lauf Server: Warnung „Swap zu 63 % belegt“, der Kopf zeigt trotzdem die grüne Pille „Alles in Ordnung“ (`docs/screenshots/widgets-live/server.png`).
- **Ursache:** Seit der Änderung gegen doppelte Zählung zählt der Kopf nur Container, sobald es welche gibt. Warnungen ohne Container-Bezug fallen dadurch heraus.

### W3 · Zahlen ohne Einheit („Regen 0“) — niedrig
- **Beleg:** Live-Lauf Wetter: `"rain": 0` → Karte zeigt „Regen 0“. Die Anweisung verlangt Text wie „3,2 mm“, das Modell schickt eine Zahl.
- **Allgemein:** `str()` in den Widgets zeigt Zahlen roh an. Betroffen sind auch `wind`, Kennzahlen und Server-Metriken, sobald Zahlen statt Text kommen.

### W4 · Containernamen im Server-Widget kaum lesbar — niedrig
- **Beleg:** Echte Namen wie `amq-workflows-app` oder `amq-ernte-firecrawl` werden im 4-Spalten-Raster zu „amq-workflo…“ gekürzt. Mehrere Container sind dadurch nicht mehr unterscheidbar (`server.png`).

### W5 · Modell zeigt „keine Daten gefunden“ als Widget — niedrig
- **Beleg:** Live-Lauf „Was habe ich am 12. September gemacht?“ Es gibt keine Tagesnotiz, also schickt Claude eine `query-result`-Tabelle mit seinen Suchschritten statt einer Zeitleiste (`timeline.png`).
- **Einordnung:** Nichts erfunden, aber gegen die Anweisung „Do not use one for plain explanations“. Die Anweisung sagt nicht ausdrücklich, dass bei fehlenden Daten nur Text kommt.

### W6 · Spieltheorie mit zwei Beteiligten schneidet Beschriftung ab — niedrig
- **Beleg:** Live-Lauf Gehaltsgespräch: Bei zwei Beteiligten ist die Zeichenfläche 104 px hoch, die Beschriftung des Rückpfeils „Bindungsinteresse, aber Budgetrahmen“ liegt darunter und wird abgeschnitten (`game-theory.png`).

### W7 · Feld `hidden` wird missverstanden — niedrig
- **Beleg:** Claude schreibt `"hidden": "Kein Alternativangebot – deine Ausstiegsdrohung ist unbelegt"`, also verdeckte Information als Text. Gemeint ist ein Wahrheitswert für „noch unsichtbarer Beteiligter“. Die Karte zeichnet dadurch beide Beteiligten gestrichelt.
- **Ursache:** In der Anweisung steht nur `hidden?` ohne Typ.

### W8 · Datenwege ohne Einheitlichkeit — niedrig
- **Beleg:** Für dieselbe Frage nutzt Claude wechselnde Quellen: Abfahrten über DB IRIS nach einem gescheiterten ersten Versuch (120 s), Route über Valhalla, Kurs über Kraken. Das funktioniert, ist aber langsam und nicht vorhersagbar. Eine feste Datenquelle je Widget gibt es nicht.

## Standort

### S1 · Standort wurde per IP geraten — behoben vor dem Testlauf
- **Beleg:** Screenshot vom 13.09., 18:15, zeigte „München“. Seitdem gibt es den Heimatort in Einstellungen › Personalisierung, gesetzt auf „Frankfurt“. Der Live-Lauf zeigt Frankfurt.
- **Offen:** Ohne gesetzten Heimatort soll der Agent nachfragen. Das ist noch nicht live geprüft (Testliste A3).

## Plugins

### P1 · YouTube-Plugin wird ohne Schlüssel in alle Profile gespiegelt — mittel
- **Beleg:** `~/.cortex/mcp.json` enthält `youtube` mit leerem `YOUTUBE_API_KEY`. Er steht trotzdem in den Profilen von Claude, Codex und Grok. Der Server beendet sich sofort: „YOUTUBE_API_KEY environment variable is not set“ (`tests/plugins/inventory.json`).
- **Folge:** Jede CLI startet bei jedem Auftrag einen Server, der sofort abstürzt. Laut README sollte ein Eintrag ohne Schlüssel „Einrichtung offen“ sein, er landet aber trotzdem im Profil.

### P2 · Vektor wird gespiegelt, obwohl die API aus ist — mittel
- **Beleg:** `database-studio` steht in allen Profilen, `studios_status` meldet „die API ist in der App nicht eingeschaltet“. 26 von 27 aufrufbaren Funktionen scheitern (`results.json`).
- **Folge:** Agenten sehen 29 Werkzeuge, von denen fast alle nichts tun. Cortex prüft die Erreichbarkeit nicht, bevor es spiegelt.

### P3 · Figma ist im Claude-Profil nicht angemeldet — mittel
- **Beleg:** `~/.cortex/profiles/claude-…/mcp-needs-auth-cache.json` enthält `figma`. In der gespiegelten Definition steht kein Token-Header.
- **Offen:** Was die Plugins-Seite in Cortex dazu anzeigt, ist noch nicht geprüft. Steht dort „verbunden“, ist das falsch.

### P4 · Xcode gilt als verbunden, alle Funktionen verweigern — mittel
- **Beleg:** `tools/list` liefert 53 Werkzeuge, jeder Aufruf antwortet „This agent isn't approved to use Xcode's tools yet. Call XcodeOpenWorkspace or XcodeNewProject first“ (22 geprüfte Funktionen).
- **Folge:** Die Probe von Cortex prüft nur die Werkzeugliste und meldet „verbunden“. Dass der erste echte Aufruf eine Freigabe in Xcode braucht, erfährt der Nutzer nicht.

### P5 · `cortex.browserAccess` gilt nicht für Browser-Plugins — hoch
- **Beleg:** Der Schalter steht auf „immer“. Im Code wird er nur in `nativeSettings.ts` gelesen. `chrome-devtools` und `playwright` stehen ohne `--headless` in `mcp.json` und in den Profilen.
- **Folge:** Auch bei „nie“ öffnet ein Agent über diese Plugins einen sichtbaren Chrome. Die Regel aus AGENTS.md hängt allein daran, dass das Modell die Einstellungsdatei liest.

### P6 · Katalog nennt Plugins schlüssellos, die eine Umgebung brauchen — niedrig
- **JetBrains:** kein `requires`, aber `tools/list` scheitert ohne laufende IDE („No working IDE endpoint available“). Xcode hat für denselben Fall `requires: app`.
- **Kubernetes:** kein Hinweis, dass `kubectl` installiert sein muss. Alle Funktionen scheitern mit `spawnSync kubectl ENOENT`.
- **Firebase:** kein Hinweis auf Anmeldung und aktives Projekt. 7 von 10 lesenden Funktionen scheitern mit `PRECONDITION_FAILED` oder fehlendem Quota-Projekt.

### P7 · Kubernetes `ping` antwortet ohne Inhalt — niedrig
- **Beleg:** `ping` liefert ein leeres `content`, kein Text und kein Fehler (`results.json`). Das liegt am Plugin selbst, nicht an Cortex.

### P8 · Wiederverbinden verschiebt den Eintrag ans Ende — niedrig
- **Beleg:** Chrome DevTools entbinden und wieder verbinden → `mcp.json` und die Profile haben denselben Inhalt, aber eine andere Reihenfolge (`cycle-results.json`: byte-gleich nein, Inhalt gleich ja).

## Profile und Aufräumen

### K1 · Gemini-Profile liegen noch auf der Platte — niedrig
- **Beleg:** `~/.cortex/profiles/gemini-1kym2u80-…`, `gemini-6e479l7l-…`, `gemini-a1cldpxi-…` existieren. Laut `docs/CORTEX_DESIGN.md` wurde Gemini am 08.09. vollständig entfernt.

### K2 · Verwaiste Grok-Profile — niedrig
- **Beleg:** 4 Grok-Profilordner, davon 2 ohne `config.toml` und ohne Manifest (`grok-jbck3qsx-…`, `grok-tymjfnzx-…`). Die Leiste zeigt 4 Konten insgesamt. Vermutlich Reste gelöschter Konten.

## Tests

### T1 · `tests/cortex_ui.py` ist veraltet — niedrig
- **Beleg:** Der Test klickt „Einstellungen“ und erwartet `.cx-connector-list > li`. Seit den Einstellungen nach Codex (13.09.) öffnet der Knopf die neue Seite ohne diese Liste. Fehler: „Locator expected to have count '2', Actual value: 0“.

### T2 · Vorschau-Server läuft nicht dauerhaft — niedrig
- **Beleg:** `tests/cortex_plugins_ui.py` scheiterte zuerst mit `ECONNREFUSED 127.0.0.1:4173`. Die UI-Tests setzen einen von Hand gestarteten `http.server` voraus und starten ihn nicht selbst.
