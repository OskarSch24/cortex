# Testliste: Widgets und Plugins

Stand: 13.09.2026, 20:17. Erzeugt von `tests/report.py` aus den Testläufen. Gefundene Probleme stehen **nicht repariert** in [ISSUES.md](ISSUES.md).

Legende: ✅ bestanden · ❌ Fehler · ⚠️ auffällig · 🔒 blockiert durch die Umgebung · ⏸ bewusst nicht ausgeführt (verändert Echtes) · ⬜ noch offen (von Hand)

## Wie die Tests laufen

| Teil | Befehl | Was er tut |
|---|---|---|
| A1 Widget-Oberfläche | `python3 tests/cortex_widgets_ui.py` | Alle 30 Widgets im echten Webview-Bundle mit Fixture-Nachrichten, Bedienung, Fehlerfälle, drei Breiten |
| A2 Widgets live | `python3 tests/widgets-live/run_live.py [typ …]` | Echte Frage an Claude (Cortex-Profil, Opus 5, Cortex-Anweisung), Block prüfen |
| B Plugin-Funktionen | `python3 tests/plugins/inventory.py` und `python3 tests/plugins/run_plugins.py [plugin …]` | Server wie die CLIs starten, jede Funktion einmal aufrufen |
| C Verbinden/Entbinden | `CORTEX_LIVE=1 npx vitest run test/live-plugin-cycle.test.ts` (in engine/packages/core) | Schlüssellose Plugins zweimal verbinden und entbinden, Spiegelung in Claude, Codex, Grok |
| Bericht | `python3 tests/report.py` | Diese Datei neu schreiben |

Sicherheitsregeln aller Läufe: Browser nur headless und isoliert; nichts, was Projekte, Konten, Clouds, Server oder das Fenster des Nutzers verändert; Schreibtests nur in Sandbox (Temp-Ordner).

## A · Widgets

### A1 · Oberfläche (automatisch)

Letzter Lauf: bestanden (`tests/cortex_widgets_ui.py`). Screenshots: `docs/screenshots/widgets/`.

| # | Widget | Gezeichnet | Bedienung geprüft |
|---|---|---|---|
| 1 | Wetter (`weather`) | ✅ | — |
| 2 | Timer (`timer`) | ✅ | ✅ zählt, Pause |
| 3 | Abfahrten (`departures`) | ✅ | — |
| 4 | Umrechner (`converter`) | ✅ | ✅ Betrag ändern |
| 5 | Sendung (`parcel`) | ✅ | — |
| 6 | To-do (`todo`) | ✅ | ✅ abhaken |
| 7 | Route (`route`) | ✅ | — |
| 8 | Kalender (`calendar`) | ✅ | — |
| 9 | Kurs (`ticker`) | ✅ | — |
| 10 | Weltuhr (`worldclock`) | ✅ | ✅ Heimatort vorne |
| 11 | Agentenlauf (`agent-run`) | ✅ | — |
| 12 | Test-Ergebnis (`test-result`) | ✅ | — |
| 13 | Kontingente (`quota`) | ✅ | — |
| 14 | Server (`server`) | ✅ | — |
| 15 | Deploy (`deploy`) | ✅ | — |
| 16 | Verifikation (`verification`) | ✅ | — |
| 17 | Scrape-Lauf (`scrape-run`) | ✅ | — |
| 18 | Workflow (`workflow`) | ✅ | — |
| 19 | Abfrage (`query-result`) | ✅ | — |
| 20 | Graph-Knoten (`graph-node`) | ✅ | — |
| 21 | Entscheidung (`decision`) | ✅ | — |
| 22 | Ort benennen (`place-naming`) | ✅ | — |
| 23 | Zeitleiste (`timeline`) | ✅ | — |
| 24 | Stellen (`jobs`) | ✅ | — |
| 25 | Design-Abgleich (`design-diff`) | ✅ | — |
| 26 | Farbpalette (`palette`) | ✅ | ✅ Kontrast berechnet |
| 27 | Audio-Takes (`audio-takes`) | ✅ | — |
| 28 | Kennzahlen (`kpis`) | ✅ | — |
| 29 | Quiz (`quiz`) | ✅ | ✅ antworten, Aktion ins Eingabefeld |
| 30 | Spieltheorie (`game-theory`) | ✅ | — |

| Querschnitt | Status |
|---|---|
| Kaputter Block bleibt Codeblock mit Grund | ✅ |
| Laufender Block zeigt Platzhalterkarte | ✅ |
| Keine waagerechte Überbreite bei 1152, 960, 760 px | ✅ |
| Keine JavaScript-Fehler | ✅ |

### A2 · Live mit Claude

Art: *echt* = Claude holt die Daten selbst · *gegeben* = Daten stehen in der Frage · *ehrlich* = es gibt keine Daten, erwartet wird kein erfundenes Widget.

| # | Widget | Art | Block | Typ passt | Durchsicht | Dauer |
|---|---|---|---|---|---|---|
| 1 | Wetter | echt | ✅ | ✅ | ✅ Frankfurt (Heimatort); „0 mm“ und „13,8 km/h“ — Zahlen bekommen ihre Einheit (W3 behoben) | 23 s |
| 2 | Timer | echt | ✅ | ✅ | ✅ Läuft live, Endzeit stimmt | 9 s |
| 3 | Abfahrten | echt | ✅ | ✅ | ✅ Echte Abfahrten über die feste Quelle, 37 s statt 120 s (W8 behoben) | 37 s |
| 4 | Umrechner | echt | ✅ | ✅ | ✅ Echter Kurs, Umrechnung stimmt | 15 s |
| 5 | Sendung | ehrlich | ✅ keiner | — | ✅ Kein Widget, weil DHL nichts lieferte — nichts erfunden | 154 s |
| 6 | To-do | gegeben | ✅ | ✅ | ✅ Erledigtes richtig abgehakt | 5 s |
| 7 | Route | echt | ✅ | ✅ | ✅ Echte Route (Valhalla/OSM), Karte als „Schematisch“ markiert | 33 s |
| 8 | Kalender | gegeben | ✅ | ✅ | ✅ Termine korrekt eingetragen | 7 s |
| 9 | Kurs | echt | ✅ | ✅ | ✅ Karte wird gezeichnet, auch mit Zahlen; neuer Lauf schickt Text mit Einheit (W1 behoben) | 25 s |
| 10 | Weltuhr | echt | ✅ | ✅ | ✅ Live-Uhrzeit, Tokio/Sydney richtig schon Montag | 10 s |
| 11 | Agentenlauf | gegeben | ✅ | ✅ | ✅  | 7 s |
| 12 | Test-Ergebnis | echt | ✅ | ✅ | ✅ Test wirklich ausgeführt: 56/56 | 8 s |
| 13 | Kontingente | gegeben | ✅ | ✅ | ✅ Anbieterlogos statt Buchstaben | 6 s |
| 14 | Server | echt | ✅ | ✅ | ✅ Echte Daten per SSH; Kopf „1 Warnung“, volle Containernamen in 2 Spalten (W2, W4 behoben) | 17 s |
| 15 | Deploy | gegeben | ✅ | ✅ | ✅  | 12 s |
| 16 | Verifikation | gegeben | ✅ | ✅ | ✅  | 8 s |
| 17 | Scrape-Lauf | gegeben | ✅ | ✅ | ✅  | 10 s |
| 18 | Workflow | gegeben | ✅ | ✅ | ✅  | 9 s |
| 19 | Abfrage | echt | ✅ | ✅ | ✅ Echte Daten aus dem Exokortex | 70 s |
| 20 | Graph-Knoten | echt | ✅ | ✅ | ✅ Ehrlich: nur eine Kante, nur aus dem CV | 57 s |
| 21 | Entscheidung | echt | ✅ | ✅ | ✅ Echte Datei aus 50-Entscheidungen | 16 s |
| 22 | Ort benennen | echt | ✅ | ✅ | ✅ Echte Ortsgruppe aus events.sqlite | 155 s |
| 23 | Zeitleiste | ehrlich | ✅ keiner | — | ✅ Keine Tagesdaten → nur Text, kein Widget (W5 behoben) | 33 s |
| 24 | Stellen | gegeben | ✅ | ✅ | ✅  | 10 s |
| 25 | Design-Abgleich | gegeben | ✅ | ✅ | ✅  | 7 s |
| 26 | Farbpalette | echt | ✅ | ✅ | ✅ Kontraste von Cortex berechnet | 11 s |
| 27 | Audio-Takes | gegeben | ✅ | ✅ | ✅ Ohne Pegelwerte flache Linie, wie vorgesehen | 6 s |
| 28 | Kennzahlen | gegeben | ✅ | ✅ | ✅ Schritt-Quoten von Cortex berechnet | 6 s |
| 29 | Quiz | echt | ✅ | ✅ | ✅  | 10 s |
| 30 | Spieltheorie | echt | ✅ | ✅ | ✅ Beschriftung sichtbar, `hidden` nicht mehr zweckentfremdet (W6, W7 behoben) | 40 s |

### A3 · Von Hand in Cortex (offen)

- ⬜ Jedes Widget einmal mit **Codex** und einmal mit **Grok** in Cortex fragen (Anweisung kommt über developerInstructions bzw. ACP)
- ⬜ Einstellungen › Personalisierung › Heimatort ändern → neue Wetterfrage nennt den neuen Ort
- ⬜ Heimatort leeren → Agent fragt nach dem Ort, statt per IP zu raten
- ⬜ Einstellungen › Konfiguration › „Widgets im Chat“ aus → Agent schreibt keine Widget-Blöcke mehr
- ⬜ Aktion „Fehler beheben“ in einer echten Test-Karte legt den Auftrag ins Eingabefeld, sendet nicht
- ⬜ Alter Chat mit Widget nach Neustart: Karte statt Codeblock
- ⬜ Widget in einer Antwort, die noch läuft: Platzhalter, danach Karte

## B · Verbundene Plugins: jede Funktion

Einige Funktionen laufen zweimal (z. B. `evaluate_script` einmal normal, einmal für einen Dialog), daher mehr Aufrufe als Funktionen.

Verbunden laut Cortex-Profil (dieselbe Liste geht an Claude, Codex und Grok): `database-studio`, `exokortex`, `youtube`, `xcode`, `chrome-devtools`, `youtube-kanal`, `figma`.

| Plugin | Funktionen | Aufrufe ✅ | ❌ | ⏸ | 🔒 | Start |
|---|---|---|---|---|---|---|
| `database-studio` (verbunden) | 29 | 29 | 0 | 0 | 0 | ✅ 186 ms |
| `exokortex` (verbunden) | 5 | 5 | 0 | 0 | 0 | ✅ 77 ms |
| `youtube` (verbunden) | — | | | | | ❌ Prozess beendet (Code 1): Error: YOUTUBE_API_KEY environment variable is not set. |
| `xcode` (verbunden) | 53 | 56 | 1 | 0 | 0 | ✅ 3684 ms |
| `chrome-devtools` (verbunden) | 29 | 30 | 0 | 0 | 0 | ✅ 2806 ms |
| `youtube-kanal` (verbunden) | 27 | 26 | 0 | 1 | 0 | ✅ 1726 ms |
| `figma` (verbunden) | — | | | | | ❌ Entfernter Server — Anmeldung liegt beim Anbieter-Client, hier nicht prüfbar |
| `antv-chart` (schlüssellos) | 27 | 27 | 0 | 0 | 0 | ✅ 4084 ms |
| `playwright` (schlüssellos) | 24 | 25 | 0 | 1 | 0 | ✅ 1822 ms |
| `firebase` (schlüssellos) | 19 | 3 | 0 | 9 | 7 | ✅ 27387 ms |
| `kubernetes` (schlüssellos) | 23 | 24 | 3 | 0 | 0 | ✅ 10877 ms |
| `jetbrains` (schlüssellos) | — | | | | | ❌ {"code": -32603, "message": "No working IDE endpoint available."} |
| `shopify` (schlüssellos) | 6 | 4 | 0 | 2 | 0 | ✅ 25171 ms |
| `memory` (schlüssellos) | 9 | 9 | 0 | 0 | 0 | ✅ 2108 ms |
| `sequential-thinking` (schlüssellos) | 1 | 1 | 0 | 0 | 0 | ✅ 2057 ms |

### `database-studio`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `studios_status` | ✅ | `{}` | {   "sqlite": {     "available": true,     "adapter": "sqlite",     "loaded": false,     "totalRows": 0,     "version": "1.0.0",     "tableC |
| `sqlite_schema` | ✅ | `{}` | {   "filename": "cortex-test.sqlite",   "sqliteVersion": "3.49.1",   "tables": [     {       "name": "widgets",       "type": "table",       |
| `sqlite_tables` | ✅ | `{}` | {   "tables": [     {       "name": "widgets",       "type": "table",       "rowCount": 3,       "columns": [         "id",         "name",  |
| `sqlite_rows` | ✅ | `{"table": "widgets", "limit": 3}` | {   "table": "widgets",   "columns": [     "id",     "name",     "gruppe"   ],   "rows": [     {       "id": 1,       "name": "Wetter",      |
| `sqlite_query` | ✅ | `{"sql": "SELECT 1 AS eins", "limit": 1}` | {   "columns": [     "eins"   ],   "rows": [     {       "eins": 1     }   ],   "format": "object",   "rowCount": 1,   "totalRowCount": 1,   |
| `sqlite_open` | ✅ | `{"path": "/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/cortex-p…` | {   "opened": true,   "filename": "cortex-test.sqlite",   "tableCount": 1 } |
| `sqlite_integrity` | ✅ | `{}` | {   "ok": true,   "message": "ok" } |
| `graph_schema` | ✅ | `{}` | {   "name": "codewiki",   "labels": [     {       "label": "Path",       "count": 1805,       "propertyKeys": [         "name",         "pat |
| `graph_query` | ✅ | `{"query": "MATCH (n) RETURN n LIMIT 3"}` | {   "columns": [     "n"   ],   "rows": [     [       "(:Organization facebook)"     ],     [       "(:Repository facebook/react)"     ],    |
| `graph_nodes` | ✅ | `{"limit": 3}` | {   "nodes": [     {       "id": "organization:facebook",       "labels": [         "Organization"       ],       "properties": {         "n |
| `graph_node` | ✅ | `{"id": "organization:facebook", "withNeighbours": true}` | {   "node": {     "id": "organization:facebook",     "labels": [       "Organization"     ],     "properties": {       "name": "facebook",   |
| `graph_edges` | ✅ | `{"limit": 3}` | {   "edges": [     {       "id": "repository:github.com/facebook/react\|VEROEFFENTLICHT_AUF\|site:github-com",       "type": "VEROEFFENTLICH |
| `graph_upsert_node` | ✅ | `{"id": "cortex-plugintest-loeschen", "labels": ["CortexTest"], "pro…` | {   "node": {     "id": "cortex-plugintest-loeschen",     "labels": [       "CortexTest"     ],     "properties": {       "zweck": "Schreibs |
| `graph_set_node_properties` | ✅ | `{"id": "cortex-plugintest-loeschen", "properties": {"zweck": "Schre…` | {   "node": {     "id": "cortex-plugintest-loeschen",     "labels": [       "CortexTest"     ],     "properties": {       "zweck": "Schreibs |
| `graph_upsert_edge` | ✅ | `{"type": "CORTEX_TEST", "from": "cortex-plugintest-loeschen", "to":…` | {   "edge": {     "id": "cortex-plugintest-loeschen-CORTEX_TEST-cortex-plugintest-loeschen",     "type": "CORTEX_TEST",     "from": "cortex- |
| `graph_delete_node` | ✅ | `{"id": "cortex-plugintest-loeschen"}` | {   "deleted": true,   "id": "cortex-plugintest-loeschen" } |
| `graph_delete_edge` | ✅ | `{"id": "cortex-plugintest-loeschen-CORTEX_TEST-cortex-plugintest-lo…` | {   "deleted": true,   "id": "cortex-plugintest-loeschen-CORTEX_TEST-cortex-plugintest-loeschen" } |
| `graph_sources` | ✅ | `{}` | {   "sources": [     {       "id": "repository:github.com/facebook/react",       "kind": "import",       "url": "https://github.com/facebook |
| `graph_export` | ✅ | `{}` | {   "version": 1,   "metadata": {     "name": "codewiki",     "createdAt": "2026-09-04T15:55:20.268Z",     "updatedAt": "2026-09-13T17:35:53 |
| `graph_open` | ✅ | `{"path": "/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/cortex-p…` | {   "opened": true,   "name": "codewiki",   "nodeCount": 2957,   "edgeCount": 5760 } |
| `vault_server` | ✅ | `{}` | {   "host": "127.0.0.1",   "port": 53993,   "database": 0,   "version": "8.6.1",   "mode": "standalone",   "role": "master",   "memoryUsed": |
| `vault_keys` | ✅ | `{"count": 20}` | {   "cursor": "0",   "done": true,   "count": 5,   "keys": [     {       "key": "px:test:node:kind1",       "binaryKey": false,       "type" |
| `vault_value` | ✅ | `{"key": "px:test:node:kind1", "limit": 5}` | {   "key": "px:test:node:kind1",   "type": "hash",   "value": {     "kind": "hash",     "total": 3,     "cursor": "0",     "fields": {       |
| `vault_command` | ✅ | `{"args": ["PING"]}` | {   "command": "ping",   "value": "PONG" } |
| `vault_phasex_survey` | ✅ | `{}` | {   "present": true,   "spaces": [     "test"   ],   "nodeCount": 2,   "strays": [],   "note": "2 Knoten in 1 Datenraum gefunden." } |
| `vault_phasex_roots` | ✅ | `{"space": "test"}` | {   "space": "test",   "roots": [     "kind1",     "root"   ] } |
| `vault_phasex_node` | ✅ | `{"space": "test", "id": "0"}` | {   "id": "0",   "space": "test",   "fields": {},   "nodeType": "",   "title": "",   "childCount": 0,   "edgeCount": 0,   "storage": "fehlt" |
| `vault_phasex_children` | ✅ | `{"space": "test", "id": "0"}` | {   "space": "test",   "node": "0",   "children": [] } |
| `vault_phasex_edges` | ✅ | `{"space": "test", "id": "0"}` | {   "space": "test",   "node": "0",   "edges": [] } |

### `exokortex`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `suche` | ✅ | `{"frage": "Methylenblau", "n": 3}` | 4 Fundstellen fuer «Methylenblau», die 3 besten:  [1] Methylenblau (Methylene Blue) · proj_anatomy_academy · Anatomy Academy/12-hallmarks-de |
| `dokument` | ✅ | `{"id": "subpara:personliche_projekte:methylenblau_methylene_blue:001"}` | # Methylenblau (Methylene Blue) · proj_anatomy_academy · Anatomy Academy/12-hallmarks-detailliert-mit-ergebnissen.md  - **Wirkt auf:** #6 Mi |
| `knoten` | ✅ | `{"name": "Alex Beispiel", "n": 3}` | Alex Beispiel [Person] · 45 Kanten   id: person_alex   rolle: ich   wohnort: Frankfurt   sprachen: … |
| `nachbarn` | ✅ | `{"id": "person_alex", "n": 5}` | 45 Kanten an person_alex, davon 10 gezeigt:  → ARBEITETE_BEI  Nordlicht Akademie [Organisation]     id: org_nla  (rolle=E-Co |
| `bestand` | ✅ | `{}` | Volltext (inhalt.sqlite)    219460 chunk     15869 absatz      8890 kapitel      5490 unterabsatz      4981 dokument  Graph (Stand 2026-09-1 |

### `youtube`

❌ Server startet nicht: Prozess beendet (Code 1): Error: YOUTUBE_API_KEY environment variable is not set.

### `xcode`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `AddEntitlement` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {"result":true} |
| `AddInfoPlist` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {"errorDescription":"The key you want to add is not recognized by Xcode. Xcode is unable to determine if any other setting needs to be set f |
| `BuildProject` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"buildResult":"The project built successfully.","elapsedTime":16.478,"errors":[],"fullLogPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr |
| `DeviceInteractionEndSession` | ✅ | `{"interactionSessionKey": "cortex-test"}` | {"userMessage":"Session stopped"} |
| `DeviceInteractionEndSession` | ✅ | `{"interactionSessionKey": "cortex-test-2"}` | {"userMessage":"Session stopped"} |
| `DeviceInteractionInstallAndRun` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "interactionSession…` | {"userMessage":"Application installed and running"} |
| `DeviceInteractionStartSession` | ✅ | `{"deviceIdentifier": "C18EFC0D-3C27-43AE-8108-A062A07DB99E", "sessi…` | {"deviceIsSimulator":true,"deviceUUID":"C18EFC0D-3C27-43AE-8108-A062A07DB99E","interactionSessionKey":"cortex-test-2","skillToTrigger":"devi |
| `DeviceInteractionStartWorkspaceSession` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "sessionIdentifier"…` | {"deviceIsSimulator":true,"deviceUUID":"C18EFC0D-3C27-43AE-8108-A062A07DB99E","interactionSessionKey":"cortex-test","skillToTrigger":"device |
| `DeviceInteractionSynthesize` | ✅ | `{"interactSessionKey": "cortex-synth2", "interactionCommand": "t 10…` | Nachgeprüft mit Befehl „t 100 200“: Screenshot, UI-Baum und Log geliefert (erster Lauf nutzte ein ungültiges Befehlsformat). |
| `GetBuildLog` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "severity": "warning"}` | {"buildIsRunning":false,"buildLogEntries":[],"buildResult":"The build succeeded","fullLogPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr4 |
| `GetConsoleOutput` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "tailLimit": 20}` | {"launchSessionInfo":"Launch Session: CortexXcodeTest, ref: 7cec051200, PID: 486, State: started","totalCount":0,"truncated":false,"units":[ |
| `GetCrashIssueLogs` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "signature_name": "…` | {"bundleId":"","data":"","message":"Failed to get crash issue logs: Missing required parameter: bundle_id","signatureName":"Test","success": |
| `GetFieldPerformanceIssueLogs` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "app_version": "1.0…` | {"appVersion":"1.0","bundleId":"","data":"","diagnosticType":"hang","message":"Failed to get hang issue logs: Missing required parameter: bu |
| `GetFileCompilerFlags` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {"compilerFlags":"","filePath":"CortexXcodeTest\/CortexXcodeTest\/ContentView.swift","targetName":"CortexXcodeTest","warning":"Per-file comp |
| `GetTargetBuildSettings` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {"buildSettings":[{"evaluatedValue":"","macroName":"ADDITIONAL_SDKS"},{"evaluatedValue":"NO","macroName":"ALLOW_TARGET_PLATFORM_SPECIALIZATI |
| `GetTestList` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"activeTestPlanName":"CortexXcodeTest","counts":{"disabled":0,"enabled":3,"total":3},"fullTestListPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5 |
| `GetTopCrashIssues` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "count": 3}` | {"bundleId":"","data":"","message":"Failed to get top crash issues: Missing required parameter: bundle_id","success":false} |
| `GetTopFieldPerformanceIssues` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "diagnostic_type": …` | {"bundleId":"","data":"","diagnosticType":"hang","message":"Failed to get hang field performance issues: Missing required parameter: bundle_ |
| `InvokeDebuggerCommand` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "command": "process…` | {"debugSessionActive":true,"isWaitingForMore":true,"output":"Process 486 is running.","processIdentifier":486} |
| `LocalizationPlanner` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetLocaleIdenti…` | {"changesMade":"Prepared 2 String Catalog(s): `CortexXcodeTest-InfoPlist.xcstrings` (~\/Developer\/CortexXcodeTest |
| `RenderPreview` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "sourceFilePath": "…` | {"displayName":"ContentView","errors":[],"previewSnapshotPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/defa |
| `RunAllTests` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"activeTestPlanName":"CortexXcodeTest","counts":{"expectedFailures":0,"failed":0,"notRun":0,"passed":3,"skipped":0,"total":3},"fullConsoleL |
| `RunCodeSnippet` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "codeSnippet": "pri…` | {"executionResults":"Hallo aus dem Plugin-Test\n"} |
| `RunProject` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "attachDebugger": t…` | {"buildErrors":[],"elapsedTime":1.811,"fullLogPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/default\/RunPro |
| `RunSomeTests` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "tests": [{"targetN…` | {"activeTestPlanName":"CortexXcodeTest","counts":{"expectedFailures":0,"failed":0,"notRun":0,"passed":1,"skipped":0,"total":1},"fullConsoleL |
| `StopProject` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"processIdentifier":486,"stopResult":"The app was stopped."} |
| `StringCatalogContext` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"appearances":[],"nextSteps":"Once you've found a good translation, use StringCatalogEdit to insert it into the project.","shouldTranslate" |
| `StringCatalogEdit` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"message":"Updated `Hallo` in String Catalog","success":true} |
| `StringCatalogRead` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"machineTranslatedCount":0,"needsReviewCount":0,"newCount":2,"nextStep":"If your goal is to translate or review strings, fetch the source l |
| `UpdateFileCompilerFlags` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {"compilerFlags":"-DCORTEX_TEST","filePath":"CortexXcodeTest\/CortexXcodeTest\/ContentView.swift","previousFlags":"","targetName":"CortexXco |
| `UpdateTargetBuildSetting` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "targetName": "Cort…` | {} |
| `XcodeCloseWorkspace` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"message":"Closed workspace workspace-N1Tr3v84f8."} |
| `XcodeGlob` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "pattern": "**/*.sw…` | {"matches":["CortexXcodeTest\/CortexXcodeTestTests\/CortexXcodeTestTests.swift","CortexXcodeTest\/CortexXcodeTestUITests\/CortexXcodeTestUIT |
| `XcodeGrep` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "pattern": "import"…` | {"matchCount":5,"pattern":"import","results":["CortexXcodeTest\/CortexXcodeTest\/CortexXcodeTestApp.swift","CortexXcodeTest\/CortexXcodeTest |
| `XcodeLS` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "path": "/", "recur…` | {"items":["CortexXcodeTest\/CortexXcodeTest\/Assets.xcassets","CortexXcodeTest\/CortexXcodeTest\/ContentView.swift","CortexXcodeTest\/Cortex |
| `XcodeListRunDestinations` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"activeDestinationDisplayTitle":"My Mac","activeSchemeName":"CortexXcodeTest","destinations":[{"architecture":"arm64","displayTitle":"My Ma |
| `XcodeListSchemes` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"activeSchemeName":"CortexXcodeTest","fullSchemeListPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/default\ |
| `XcodeListTargets` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"fullTargetListPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/default\/XcodeListTargets\/C6DE48BC-B435-410C |
| `XcodeListTemplates` | ✅ | `{"kind": "target", "nameFilter": "Framework", "platformFilter": ["m…` | {"fullTemplateListPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/default\/XcodeListTemplates\/BDBC6DCD-6CF8- |
| `XcodeListTestPlans` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8"}` | {"activeTestPlanName":"CortexXcodeTest","fullTestPlanListPath":"\/var\/folders\/_l\/ydn3hpc96cn_k5cm3rjkkkr40000gn\/T\/ActionArtifacts\/defa |
| `XcodeListWorkspaces` | ✅ | `{}` | * workspaceIdentifier: workspace-N1Tr3v84f8, workspacePath: ~/Developer/CortexXcodeTest/CortexXcodeTest.xcodeproj |
| `XcodeMV` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "sourcePath": "Cort…` | {"destinationFinalPath":"CortexXcodeTest\/CortexXcodeTest\/CortexTest\/Gruss.swift","message":"Successfully renamed 'Hallo.swift' to 'Gruss. |
| `XcodeMakeDir` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "directoryPath": "C…` | {"createdPath":"CortexXcodeTest\/CortexXcodeTest\/CortexTest","message":"Successfully created directory: 'CortexXcodeTest\/CortexXcodeTest\/ |
| `XcodeNewProject` | ✅ | `{"templateIdentifier": "com.apple.dt.unit.multiPlatform.app", "prod…` | {"createdTargets":["CortexXcodeTest2"],"projectPath":"~\/Developer\/CortexXcodeTest2\/CortexXcodeTest2.xcodeproj"} |
| `XcodeNewTarget` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "templateIdentifier…` | {"activeSchemeName":"CortexXcodeTest","additionalTargetsCreated":[],"containingProjectPath":"CortexXcodeTest.xcodeproj","targetGroupPath":"C |
| `XcodeOpenWorkspace` | ✅ | `{"path": "~/Developer/CortexXcodeTest/Corte…` | {"activeRunDestination":"My Mac","activeScheme":"CortexXcodeTest","workspaceIdentifier":"workspace-N1Tr3v84f8","workspacePath":"\/Users\/osk |
| `XcodeRM` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "path": "CortexXcod…` | {"message":"Successfully moved to trash 'CortexXcodeTest\/CortexXcodeTest\/CortexTest'","removedPath":"CortexXcodeTest\/CortexXcodeTest\/Cor |
| `XcodeRead` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"content":"     1\t\/\/\n     2\t\/\/  ContentView.swift\n     3\t\/\/  CortexXcodeTest\n     4\t\/\/\n     5\t\/\/  Created by Demo |
| `XcodeRefreshCodeIssuesInFile` | 🔒 | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | SourceEditorCallableDiagnosticError 5 — Xcode liefert Diagnosen nur für Dateien, die in einem Editorfenster offen sind; headless nicht verfü |
| `XcodeSwitchRunDestination` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "displayTitle": "My…` | {"activeDestinationDisplayTitle":"My Mac","activeSchemeName":"CortexXcodeTest","message":"Active run destination is now 'My Mac' for scheme  |
| `XcodeSwitchRunDestination` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "displayTitle": "iP…` | {"activeDestinationDisplayTitle":"iPhone 17","activeSchemeName":"CortexXcodeTest","message":"Active run destination is now 'iPhone 17' for s |
| `XcodeSwitchRunDestination` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "displayTitle": "My…` | {"activeDestinationDisplayTitle":"My Mac","activeSchemeName":"CortexXcodeTest","message":"Active run destination is now 'My Mac' for scheme  |
| `XcodeSwitchScheme` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "schemeName": "Cort…` | {"activeDestinationDisplayTitle":"My Mac","activeSchemeName":"CortexXcodeTest","activeTestPlanName":"CortexXcodeTest","message":"Active sche |
| `XcodeSwitchTestPlan` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "testPlanName": "Co…` | {"activeTestPlanName":"CortexXcodeTest","message":"Active test plan is now 'CortexXcodeTest' for scheme 'CortexXcodeTest'.","schemeName":"Co |
| `XcodeUpdate` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"editsApplied":1,"filePath":"CortexXcodeTest\/CortexXcodeTest\/CortexTest\/Hallo.swift","modifiedContentLength":84,"originalContentLength": |
| `XcodeWrite` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"absolutePath":"~\/Developer\/CortexXcodeTest\/CortexXcodeTest\/CortexTest\/Hallo.swift","bytesWritten":71,"fileP |
| `XcodeWrite` | ✅ | `{"workspaceIdentifier": "workspace-N1Tr3v84f8", "filePath": "Cortex…` | {"absolutePath":"~\/Developer\/CortexXcodeTest\/CortexXcodeTest\/Localizable.xcstrings","bytesWritten":138,"filePa |

### `chrome-devtools`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `click` | ✅ | `{"pageId": 2, "uid": "1_2"}` | Successfully clicked on the element |
| `close_page` | ✅ | `{"pageId": 2}` | Note: the previously selected page was closed. Page 1 is now selected. ## Pages 1: about:blank [selected] |
| `drag` | ✅ | `{"pageId": 2, "from_uid": "1_8", "to_uid": "1_3"}` | Successfully dragged an element |
| `emulate` | ✅ | `{"pageId": 2, "colorScheme": "dark"}` | Emulation configured successfully Emulating color scheme: dark |
| `evaluate_script` | ✅ | `{"pageId": 2, "function": "() => { console.log('cortex-test'); retu…` | Script ran on page and returned: ```json "geklickt" ``` |
| `evaluate_script` | ✅ | `{"pageId": 2, "function": "() => { setTimeout(() => alert('hallo'),…` | Script ran on page and returned: ```json "ok" ``` |
| `fill` | ✅ | `{"pageId": 2, "uid": "1_3", "value": "Hallo"}` | Successfully filled out the element |
| `fill_form` | ✅ | `{"pageId": 2, "elements": [{"uid": "1_3", "value": "Formular"}]}` | Successfully filled out the form |
| `get_console_message` | ✅ | `{"pageId": 2, "msgid": 1}` | ID: 1 Message: issue> Page layout may be unexpected due to Quirks Mode  One or more documents in this page is in Quirks Mode, which will ren |
| `get_network_request` | ✅ | `{"pageId": 2, "reqid": 2}` | Emulating color scheme: dark ## Request https://example.com/ Status: 200 ### Request Headers - upgrade-insecure-requests:1 - user-agent:Mozi |
| `handle_dialog` | ✅ | `{"pageId": 2, "action": "accept"}` | Successfully accepted the dialog Emulating color scheme: dark ## Pages 1: about:blank 2: Example Domain (https://example.com/) [selected] |
| `hover` | ✅ | `{"pageId": 2, "uid": "1_2"}` | Successfully hovered over the element |
| `lighthouse_audit` | ✅ | `{"pageId": 2, "mode": "snapshot", "device": "desktop", "outputDirPa…` | Emulating color scheme: dark ## Lighthouse Audit Results Mode: snapshot Device: desktop URL: undefined ### Category Scores - Accessibility:  |
| `list_console_messages` | ✅ | `{"pageId": 2}` | ## Console messages Showing 1-3 of 3 (Page 1 of 1). msgid=1 [issue] Page layout may be unexpected due to Quirks Mode (count: 1) msgid=2 [log |
| `list_network_requests` | ✅ | `{"pageId": 2}` | Emulating color scheme: dark ## Network requests Showing 1-1 of 1 (Page 1 of 1). reqid=2 GET https://example.com/ [200] |
| `list_pages` | ✅ | `{}` | ## Pages 1: about:blank [selected] |
| `navigate_page` | ✅ | `{"pageId": 2, "type": "url", "url": "https://example.com", "timeout…` | Successfully navigated to https://example.com. Emulating color scheme: dark ## Pages 1: about:blank 2: Example Domain (https://example.com/) |
| `new_page` | ✅ | `{"url": "data:text/html,<title>Cortex Test</title><h1>Cortex</h1><b…` | ## Pages 1: about:blank 2: Cortex Test (data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.title='gekl |
| `performance_analyze_insight` | ✅ | `{"pageId": 2, "insightSetId": "NAVIGATION_0", "insightName": "Chara…` | Emulating color scheme: dark ## Insight Title: Declare a character encoding  ## Insight Summary: This insight checks that the page declares  |
| `performance_start_trace` | ✅ | `{"pageId": 2, "reload": true, "autoStop": false}` | The performance trace is being recorded. Use performance_stop_trace to stop it. Emulating color scheme: dark |
| `performance_stop_trace` | ✅ | `{"pageId": 2}` | The performance trace has been stopped. Emulating color scheme: dark ## Summary of Performance trace findings: URL: https://example.com/ Tra |
| `press_key` | ✅ | `{"pageId": 2, "key": "Tab"}` | Successfully pressed key: Tab |
| `resize_page` | ✅ | `{"pageId": 2, "width": 800, "height": 600}` | Emulating color scheme: dark ## Pages 1: about:blank 2: geklickt (data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onc |
| `select_page` | ✅ | `{"pageId": 2}` | ## Pages 1: about:blank 2: Cortex Test (data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.title='gekl |
| `take_heapsnapshot` | ✅ | `{"pageId": 2, "filePath": "/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr4…` | Heap snapshot saved to /private/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/cortex-plugintest-79cwpppq/heap.heapsnapshot Emulating color |
| `take_screenshot` | ✅ | `{"pageId": 2, "filePath": "/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr4…` | Took a screenshot of the current page's viewport. Saved screenshot to /private/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/cortex-plugin |
| `take_snapshot` | ✅ | `{"pageId": 2}` | ## Latest page snapshot uid=1_0 RootWebArea "Cortex Test" url="data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclic |
| `type_text` | ✅ | `{"pageId": 2, "text": " mehr"}` | Typed text " mehr" |
| `upload_file` | ✅ | `{"pageId": 2, "uid": "1_7", "filePaths": ["/var/folders/_l/ydn3hpc9…` | File uploaded from /private/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/cortex-plugintest-79cwpppq/upload.txt. |
| `wait_for` | ✅ | `{"pageId": 2, "text": ["Cortex"], "timeout": 5000}` | Element matching one of ["Cortex"] found. ## Latest page snapshot uid=1_0 RootWebArea "geklickt" url="data:text/html,<title>Cortex Test</tit |

### `youtube-kanal`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `check_auth_status` | ✅ | `{}` | Authentication Status: Authenticated |
| `revoke_auth` | ⏸ | `—` | meldet das YouTube-Konto ab |
| `get_server_info` | ✅ | `{}` | Server: YouTube Analytics MCP Server Version: 1.0.0 Status: running Capabilities: tools, resources, prompts Description: MCP server for YouT |
| `list_channels` | ✅ | `{}` | Channels on this account:  1. Beispielkanal    Channel ID: UCxxxxxxxxxxxxxxxxxxxxxx    Subscribers: 9    Videos: 52 videos in total — 0 public, |
| `get_channel_info` | ✅ | `{}` | Channel: Beispielkanal (@beispielkanal) Channel ID: UCxxxxxxxxxxxxxxxxxxxxxx Subscribers: 9 Total views (public videos): 0 Videos: 52 video |
| `get_channel_videos` | ✅ | `{}` | Beispielkanal: 52 videos in total — 0 public, 52 unlisted, 0 private.  - Beispielvideo 04 [unlisted] · 2025-05-10 · 0 views · https://youtu. |
| `get_video_details` | ✅ | `{"videoId": "abcDEF12345"}` | Video Details for abcDEF12345:  Title: Beispielvideo 04 Published: 2025-05-10T09:22:39Z Duration: PT2M1S Definition: hd Caption: false  S |
| `get_channel_overview` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Channel Overview (2026-08-16 to 2026-09-13):  Channel Health Overview:  📊 Key Metrics: • Total Views: 2 • Watch Time (minutes): 0 • Subscrib |
| `get_comparison_metrics` | ✅ | `{"metrics": ["views"], "period1Start": "2026-08-16", "period1End": …` | Comparison Metrics: Period 1 (2026-08-16 to 2026-09-13) vs Period 2 (2026-07-19 to 2026-08-16)  📈 Period-to-Period Comparison:  📈 Views: 0 → |
| `get_average_view_percentage` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Average View Percentage (2026-08-16 to 2026-09-13): 6.52%  This shows what percentage of your videos viewers actually watch on average, acco |
| `get_watch_time_metrics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Watch Time Metrics (2026-08-16 to 2026-09-13):  Total Watch Time: 0 minutes (0.0 hours) Total Views: 2 Average View Duration: 11.5 seconds A |
| `get_revenue_metrics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Revenue Metrics (2026-08-16 to 2026-09-13):  Estimated Revenue: $0.00   Ad Revenue: $0.00   YouTube Premium Revenue: $0.00 Gross Revenue: $0 |
| `get_top_videos` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Top Videos by views (2026-08-16 to 2026-09-13):  1. Video: xyzXYZ67890    Views: 1 \| Watch Time: 0 min    Likes: 0 \| Comments: 0 \| Shares |
| `get_video_demographics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Demographics Analysis (2026-08-16 to 2026-09-13):  No demographic data available for the specified period. |
| `get_geographic_distribution` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Geographic Distribution (2026-08-16 to 2026-09-13):  No geographic data available for the specified period. |
| `get_subscriber_analytics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Subscriber Analytics (2026-08-16 to 2026-09-13):  📈 Subscriber vs Non-Subscriber Analytics:  📊 View Distribution: 👥 Subscriber Views: 2 (100 |
| `get_device_analytics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Device Analytics (2026-08-16 to 2026-09-13):  Total Views Analyzed: 2  DESKTOP: 2 views (100.0%) \| 0 min \| Avg 12.0s |
| `get_optimal_posting_time` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | 📅 Optimal Posting Time Analysis:  🎯 Top 5 Best Performing Days: 1. 2026-08-25: 1 views, 0 min watch time (Score: 0.6) 2. 2026-08-26: 1 views |
| `get_traffic_sources` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Traffic Sources (2026-08-16 to 2026-09-13):  🚀 Traffic Source Analysis:  Total Views Analyzed: 2  📊 Traffic Sources (by views): 1. 📊 EXT_URL |
| `get_search_terms` | ✅ | `{"videoId": "abcDEF12345", "startDate": "2026-08-16", "endDate": "2…` | Search Terms for video abcDEF12345 (2026-08-16 to 2026-09-13):  No search terms data available for the specified video and period. |
| `get_audience_retention` | ✅ | `{"videoId": "abcDEF12345", "startDate": "2026-08-16", "endDate": "2…` | Audience Retention for video abcDEF12345 (2026-08-16 to 2026-09-13):  📊 Audience Retention Analysis:  📈 Key Metrics: • Average Retention: 0. |
| `get_retention_dropoff_points` | ✅ | `{"videoId": "abcDEF12345", "startDate": "2026-08-16", "endDate": "2…` | Retention Drop-off Points for video abcDEF12345:  ✅ No significant retention drop-off points detected! Your video maintains good audience en |
| `get_playlist_performance` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Playlist Performance (2026-08-16 to 2026-09-13):  1. Playlist: PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx    Starts: 17    Views Per Start: 4.7    A |
| `get_card_endscreen_performance` | ✅ | `{"videoId": "abcDEF12345", "startDate": "2026-08-16", "endDate": "2…` | Card & End Screen Performance for video abcDEF12345 (2026-08-16 to 2026-09-13):  No card/end screen data available for this video and period |
| `get_video_performance_over_time` | ✅ | `{"videoId": "abcDEF12345", "startDate": "2026-08-16", "endDate": "2…` | Video Performance Over Time: abcDEF12345 (2026-08-16 to 2026-09-13):  Daily Breakdown: 2026-08-16: 0 views \| 0 min \| 0 likes \| 0 comments |
| `get_engagement_metrics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | 💫 Engagement Analysis (2026-08-16 to 2026-09-13):  📊 ENGAGEMENT SUMMARY: • Total Views: 2 • Total Likes: 0 (0.00% rate) • Total Comments: 0  |
| `get_sharing_analytics` | ✅ | `{"startDate": "2026-08-16", "endDate": "2026-09-13"}` | Sharing Analytics (2026-08-16 to 2026-09-13):  Total Shares: 0  No sharing data available for this period. |

### `figma`

❌ Server startet nicht: Entfernter Server — Anmeldung liegt beim Anbieter-Client, hier nicht prüfbar

## C · Schlüssellose Plugins

### C1 · Verbinden und entbinden, zwei Runden

Mit den Funktionen, die Cortex beim Installieren und Entfernen benutzt (Probe → `withServer` → Spiegeln in Claude, Codex, Grok → `withoutServer` → Spiegeln), auf einer Kopie der echten `~/.cortex/mcp.json`. Schon verbundene Plugins werden erst entbunden, dann wieder verbunden.

| Plugin | Runde | Probe | Eingetragen (Claude/Codex/Grok) | Entfernt | Profile wie vorher | Byte-gleich |
|---|---|---|---|---|---|---|
| `antv-chart` | 1 | ✅ 27 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `antv-chart` | 2 | ✅ 27 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `playwright` | 1 | ✅ 24 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `playwright` | 2 | ✅ 24 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `chrome-devtools` | 1 | ✅ 29 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `chrome-devtools` | 2 | ✅ 29 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `firebase` | 1 | ✅ 19 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `firebase` | 2 | ✅ 19 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `kubernetes` | 1 | ✅ 23 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `kubernetes` | 2 | ✅ 23 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `jetbrains` | 1 | ❌ Der Server hat „tools/list“ mit einem Fehler beantwortet. | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `shopify` | 1 | ✅ 6 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `shopify` | 2 | ✅ 6 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `memory` | 1 | ✅ 9 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `memory` | 2 | ✅ 9 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `sequential-thinking` | 1 | ✅ 1 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |
| `sequential-thinking` | 2 | ✅ 1 Werkzeuge | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ | ✅ ✅ ✅ |

`mcp.json` nach allen Runden: Inhalt gleich ✅ · Byte-gleich ⚠️ nein (Reihenfolge)

### C2 · Verbinden und entbinden in der Cortex-Oberfläche (offen)

- ⬜ Plugins › Playwright › Installieren → „verbunden — 24 Werkzeuge“
- ⬜ Playwright › Entfernen → verschwindet aus „Installiert“ und aus allen Profilen
- ⬜ Beides ein zweites Mal
- ⬜ Dasselbe für Gedächtnis, Schrittweises Denken, AntV Diagramme, Shopify
- ⬜ JetBrains ohne laufende IDE installieren → verständliche Meldung, kein halber Eintrag

### C3 · Funktionen der schlüssellosen Plugins

### `antv-chart`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `generate_area_chart` | ✅ | `{"data": [{"time": "time A", "value": 3.5}, {"time": "time A", "val…` | https://mdn.alipayobjects.com/one_clip/afts/img/TvbrR4eoxZQAAAAAQYAAAAgAoEACAQFr/original |
| `generate_bar_chart` | ✅ | `{"data": [{"category": "category A", "value": 3.5}, {"category": "c…` | https://mdn.alipayobjects.com/one_clip/afts/img/2S36T5LvRhMAAAAAQkAAAAgAoEACAQFr/original |
| `generate_boxplot_chart` | ✅ | `{"data": [{"category": "category A", "value": 3.5}, {"category": "c…` | https://mdn.alipayobjects.com/one_clip/afts/img/uSHET4nYflkAAAAAQZAAAAgAoEACAQFr/original |
| `generate_column_chart` | ✅ | `{"data": [{"category": "category A", "value": 3.5}, {"category": "c…` | https://mdn.alipayobjects.com/one_clip/afts/img/BGPPQ4SPgssAAAAAQjAAAAgAoEACAQFr/original |
| `generate_district_map` | ✅ | `{"title": "title A", "data": {"name": "name A"}}` | Static map preview and download URL: https://mdn.alipayobjects.com/one_clip/afts/img/8StkQpfbZi0AAAAASeAAAAgAoEACAQFr/original    Dynamic in |
| `generate_dual_axes_chart` | ✅ | `{"categories": ["2024", "2025", "2026"], "series": [{"type": "colum…` | https://mdn.alipayobjects.com/one_clip/afts/img/5tP8QZmd0igAAAAAQ_AAAAgAoEACAQFr/original |
| `generate_fishbone_diagram` | ✅ | `{"data": {"name": "Absprung", "children": [{"name": "Preis", "child…` | https://mdn.alipayobjects.com/one_clip/afts/img/Ow22Q6YjiuYAAAAAQsAAAAgAoEACAQFr/original |
| `generate_flow_diagram` | ✅ | `{"data": {"nodes": [{"name": "Lead"}, {"name": "Scrape"}, {"name": …` | https://mdn.alipayobjects.com/one_clip/afts/img/rDkmQ7nr1hUAAAAAQXAAAAgAoEACAQFr/original |
| `generate_funnel_chart` | ✅ | `{"data": [{"category": "category A", "value": 3.5}, {"category": "c…` | https://mdn.alipayobjects.com/one_clip/afts/img/ZwDrSqXzEUUAAAAAQmAAAAgAoEACAQFr/original |
| `generate_histogram_chart` | ✅ | `{"data": [3.5, 3.5, 3.5]}` | https://mdn.alipayobjects.com/one_clip/afts/img/aYNsTptd1EUAAAAAQXAAAAgAoEACAQFr/original |
| `generate_line_chart` | ✅ | `{"data": [{"time": "time A", "value": 3.5}, {"time": "time A", "val…` | https://mdn.alipayobjects.com/one_clip/afts/img/DrpbQIU5NN0AAAAAQSAAAAgAoEACAQFr/original |
| `generate_liquid_chart` | ✅ | `{"percent": 1}` | https://mdn.alipayobjects.com/one_clip/afts/img/sbekR6IiaJcAAAAARXAAAAgAoEACAQFr/original |
| `generate_mind_map` | ✅ | `{"data": {"name": "name A"}}` | https://mdn.alipayobjects.com/one_clip/afts/img/Foc_QZwlyhgAAAAAQhAAAAgAoEACAQFr/original |
| `generate_network_graph` | ✅ | `{"data": {"nodes": [{"name": "Oskar"}, {"name": "Cortex"}, {"name":…` | https://mdn.alipayobjects.com/one_clip/afts/img/j0XRTY8GEWYAAAAAQnAAAAgAoEACAQFr/original |
| `generate_organization_chart` | ✅ | `{"data": {"name": "name A"}}` | https://mdn.alipayobjects.com/one_clip/afts/img/PFzjQo9lJk0AAAAAQdAAAAgAoEACAQFr/original |
| `generate_path_map` | ✅ | `{"title": "title A", "data": [{"data": ["data A", "data A", "data A…` | Static map preview and download URL: https://mdn.alipayobjects.com/one_clip/afts/img/lHGDTbzllZwAAAAARuAAAAgAoEACAQFr/original    Dynamic in |
| `generate_pie_chart` | ✅ | `{"data": [{"category": "category A", "value": 3.5}, {"category": "c…` | https://mdn.alipayobjects.com/one_clip/afts/img/lN9mT5iQc3sAAAAARHAAAAgAoEACAQFr/original |
| `generate_pin_map` | ✅ | `{"title": "title A", "data": ["data A", "data A", "data A"]}` | Static map preview and download URL: https://mdn.alipayobjects.com/one_clip/afts/img/ixJHT5afrrIAAAAASBAAAAgAoEACAQFr/original    Dynamic in |
| `generate_radar_chart` | ✅ | `{"data": [{"name": "name A", "value": 3.5}, {"name": "name A", "val…` | https://mdn.alipayobjects.com/one_clip/afts/img/LBQaRJLl1DoAAAAAQRAAAAgAoEACAQFr/original |
| `generate_sankey_chart` | ✅ | `{"data": [{"source": "source A", "target": "target A", "value": 3.5…` | https://mdn.alipayobjects.com/one_clip/afts/img/S9KoS52CC-YAAAAAQSAAAAgAoEACAQFr/original |
| `generate_scatter_chart` | ✅ | `{"data": [{"x": 3.5, "y": 3.5}, {"x": 3.5, "y": 3.5}, {"x": 3.5, "y…` | https://mdn.alipayobjects.com/one_clip/afts/img/cHDZRI6EBpsAAAAAQSAAAAgAoEACAQFr/original |
| `generate_treemap_chart` | ✅ | `{"data": [{"name": "name A", "value": 3.5}, {"name": "name A", "val…` | https://mdn.alipayobjects.com/one_clip/afts/img/SQ4wSrLDCAIAAAAAQOAAAAgAoEACAQFr/original |
| `generate_venn_chart` | ✅ | `{"data": [{"label": "A", "value": 10, "sets": ["A"]}, {"label": "B"…` | https://mdn.alipayobjects.com/one_clip/afts/img/wWHfQJvQ-bUAAAAAQyAAAAgAoEACAQFr/original |
| `generate_violin_chart` | ✅ | `{"data": [{"category": "A", "value": 1}, {"category": "A", "value":…` | https://mdn.alipayobjects.com/one_clip/afts/img/G8DKSJdohKEAAAAARBAAAAgAoEACAQFr/original |
| `generate_waterfall_chart` | ✅ | `{"data": [{"category": "category A"}, {"category": "category A"}, {…` | https://mdn.alipayobjects.com/one_clip/afts/img/-IiKRpcvQesAAAAAQSAAAAgAoEACAQFr/original |
| `generate_word_cloud_chart` | ✅ | `{"data": [{"text": "text A", "value": 3.5}, {"text": "text A", "val…` | https://mdn.alipayobjects.com/one_clip/afts/img/FsRjQr0pU-IAAAAAQeAAAAgAoEACAQFr/original |
| `generate_spreadsheet` | ✅ | `{"data": [{}, {}, {}]}` | https://mdn.alipayobjects.com/one_clip/afts/img/891DSbCNI28AAAAABgAAAAgAoEACAQFr/original |

### `playwright`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `browser_close` | ✅ | `{}` | ### Result No open tabs. Navigate to a URL to create one. ### Ran Playwright code ```js await page.close() ``` |
| `browser_resize` | ✅ | `{"width": 800, "height": 600}` | ### Ran Playwright code ```js await page.setViewportSize({ width: 800, height: 600 }); ``` |
| `browser_console_messages` | ✅ | `{"level": "info"}` | ### Result Total messages: 2 (Errors: 0, Warnings: 0)  [LOG] klick @ :0 [LOG] cortex-test @ :0 |
| `browser_handle_dialog` | ✅ | `{"accept": true}` | ### Page - Page URL: data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.title='geklickt';console.log(' |
| `browser_evaluate` | ✅ | `{"function": "() => { console.log('cortex-test'); return document.t…` | ### Result "geklickt" ### Ran Playwright code ```js await page.evaluate('() => { console.log(\'cortex-test\'); return document.title; }'); ` |
| `browser_evaluate` | ✅ | `{"function": "() => { setTimeout(() => alert('hallo'), 50); return …` | ### Result "ok" ### Ran Playwright code ```js await page.evaluate('() => { setTimeout(() => alert(\'hallo\'), 50); return \'ok\'; }'); ``` # |
| `browser_file_upload` | ⏸ | `—` | braucht einen offenen Dateiauswahl-Dialog — wird über browser_click auf das Dateifeld ausgelöst |
| `browser_drop` | ✅ | `{"target": "e8", "element": "Ablage", "paths": ["/Users/demo…` | ### Ran Playwright code ```js await page.getByRole('region', { name: 'Ablage' }).drop({   files: '~/Desktop/Kortex/t |
| `browser_find` | ✅ | `{"text": "Knopf"}` | ### Result Found 1 match for "Knopf":  - generic [active] [ref=e1]:   - heading "Cortex" [level=1] [ref=e2]   - button "Knopf" [ref=e3]   -  |
| `browser_fill_form` | ✅ | `{"fields": [{"target": "e4", "name": "Feld", "type": "textbox", "va…` | ### Ran Playwright code ```js await page.getByRole('textbox', { name: 'Feld' }).fill('Formular'); ``` |
| `browser_press_key` | ✅ | `{"key": "Tab"}` | ### Ran Playwright code ```js // Press Tab await page.keyboard.press('Tab'); ``` |
| `browser_type` | ✅ | `{"target": "e4", "element": "Feld", "text": "Hallo"}` | ### Ran Playwright code ```js await page.getByRole('textbox', { name: 'Feld' }).fill('Hallo'); ``` |
| `browser_navigate` | ✅ | `{"url": "data:text/html,<title>Cortex Test</title><h1>Cortex</h1><b…` | ### Ran Playwright code ```js await page.goto('data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.titl |
| `browser_navigate` | ✅ | `{"url": "https://example.com"}` | ### Ran Playwright code ```js await page.goto('https://example.com'); ``` ### Page - Page URL: https://example.com/ - Page Title: Example Do |
| `browser_navigate_back` | ✅ | `{}` | ### Ran Playwright code ```js await page.goBack(); ``` ### Page - Page URL: data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button  |
| `browser_network_requests` | ✅ | `{"static": false}` | ### Result  Note: 1 static request not shown, run with "static" option to see it. |
| `browser_network_request` | ✅ | `{"index": 1, "part": "response-headers"}` | ### Result age: 12350 allow: GET, HEAD cf-cache-status: HIT cf-ray: a3a8912b6960ee4c-WAW content-encoding: br content-type: text/html date:  |
| `browser_run_code_unsafe` | ✅ | `{"code": "async (page) => await page.title()"}` | ### Result "geklickt" ### Ran Playwright code ```js await (async (page) => await page.title())(page); ``` |
| `browser_take_screenshot` | ✅ | `{"scale": "css", "type": "png", "filename": "pw-test.png"}` | ### Result - [Screenshot of viewport](./pw-test.png) ### Ran Playwright code ```js // Screenshot viewport and save it as ./pw-test.png await |
| `browser_snapshot` | ✅ | `{}` | ### Page - Page URL: data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.title='geklickt';console.log(' |
| `browser_click` | ✅ | `{"target": "e3", "element": "Knopf"}` | ### Ran Playwright code ```js await page.getByRole('button', { name: 'Knopf' }).click(); ``` ### Page - Page URL: data:text/html,<title>Cort |
| `browser_drag` | ✅ | `{"startTarget": "e7", "startElement": "Ziehen", "endTarget": "e4", …` | ### Ran Playwright code ```js await page.getByText('Ziehen').dragTo(page.getByRole('textbox', { name: 'Feld' })); ``` ### Page - Page URL: d |
| `browser_hover` | ✅ | `{"target": "e3", "element": "Knopf"}` | ### Ran Playwright code ```js await page.getByRole('button', { name: 'Knopf' }).hover(); ``` ### Page - Page URL: data:text/html,<title>Cort |
| `browser_select_option` | ✅ | `{"target": "e5", "element": "Wahl", "values": ["b"]}` | ### Ran Playwright code ```js await page.getByLabel('Wahl').selectOption('b'); ``` ### Page - Page URL: data:text/html,<title>Cortex Test</t |
| `browser_tabs` | ✅ | `{"action": "list"}` | ### Result - 0: (current) [geklickt](data:text/html,<title>Cortex Test</title><h1>Cortex</h1><button id="b" onclick="document.title='geklick |
| `browser_wait_for` | ✅ | `{"text": "Cortex"}` | ### Result Waited for Cortex ### Ran Playwright code ```js await page.getByText("Cortex").first().waitFor({ state: 'visible' }); ``` ### Pag |

### `firebase`

🔒 Nicht bei Firebase angemeldet, kein aktives Projekt, kein Quota-Projekt für die Developer-Knowledge-API.

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `firebase_login` | ⏸ | `—` | öffnet eine Google-Anmeldung |
| `firebase_logout` | ⏸ | `—` | meldet ein Konto ab |
| `firebase_get_project` | 🔒 | `{}` | Error: PRECONDITION_FAILED: To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID |
| `firebase_list_apps` | 🔒 | `{"platform": "all"}` | Error: PRECONDITION_FAILED: To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID |
| `firebase_list_projects` | ✅ | `{"page_size": 3}` | Here are 0 Firebase projects:  projects: [] |
| `firebase_get_sdk_config` | 🔒 | `{"platform": "web"}` | Error: PRECONDITION_FAILED: To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID |
| `firebase_create_project` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_create_app` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_create_android_sha` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_get_environment` | ✅ | `{}` | # Environment Information  Project Directory: ~/Desktop/Kortex/tests/plugins Project Config Path: <NO CONFIG PRESENT |
| `firebase_update_environment` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_init` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_get_security_rules` | 🔒 | `{"type": "firestore"}` | Error: PRECONDITION_FAILED: To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID |
| `firebase_read_resources` | ✅ | `{"uris": []}` | Available resources:  - [Firebase App Id Guide](firebase://guides/app_id): guides the coding agent through choosing a Firebase App ID in the |
| `firebase_deploy` | ⏸ | `—` | legt an, verändert oder veröffentlicht in einem Firebase-Konto |
| `firebase_deploy_status` | ⏸ | `—` | braucht eine laufende Veröffentlichung |
| `developerknowledge_search_documents` | 🔒 | `{"query": "Firestore Sicherheitsregeln"}` | Your application is authenticating by using local Application Default Credentials. The developerknowledge.googleapis.com API requires a quot |
| `developerknowledge_answer_query` | 🔒 | `{"query": "Wie lese ich ein Dokument aus Firestore?"}` | Error: PRECONDITION_FAILED: To proceed requires an active project. Use the `firebase_update_environment` tool to set a project ID |
| `developerknowledge_get_documents` | 🔒 | `{"names": ["documents/firebase.google.com/docs/firestore"]}` | Your application is authenticating by using local Application Default Credentials. The developerknowledge.googleapis.com API requires a quot |

### `kubernetes`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `cleanup` | ✅ | `{}` | {   "success": true } |
| `kubectl_get` | ✅ | `{"resourceType": "pods", "namespace": "cortex-test", "output": "name"}` | pod/cortex-web-95877b5-5rn8r |
| `kubectl_describe` | ✅ | `{"resourceType": "deployment", "name": "cortex-web", "namespace": "…` | Name:                   cortex-web Namespace:              cortex-test CreationTimestamp:      Sun, 13 Sep 2026 20:05:09 +0200 Labels:       |
| `kubectl_apply` | ✅ | `{"manifest": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  n…` | deployment.apps/cortex-web created |
| `kubectl_delete` | ✅ | `{"resourceType": "namespace", "name": "cortex-test"}` | namespace "cortex-test" deleted |
| `kubectl_create` | ✅ | `{"resourceType": "namespace", "name": "cortex-test"}` | apiVersion: v1 kind: Namespace metadata:   creationTimestamp: "2026-09-13T18:05:09Z"   labels:     kubernetes.io/metadata.name: cortex-test  |
| `kubectl_logs` | ✅ | `{"resourceType": "pod", "name": "cortex-web-95877b5-5rn8r", "namesp…` | {   "name": "cortex-web-95877b5-5rn8r",   "logs": "2026/09/13 18:05:10 [notice] 1#1: OS: Linux 6.8.0-117-generic\n2026/09/13 18:05:10 [notic |
| `kubectl_scale` | ✅ | `{"name": "cortex-web", "namespace": "cortex-test", "replicas": 2, "…` | {"success":true,"message":"Scaled deployment cortex-web to 2 replicas"} |
| `kubectl_patch` | ✅ | `{"resourceType": "deployment", "name": "cortex-web", "namespace": "…` | deployment.apps/cortex-web patched |
| `kubectl_rollout` | ✅ | `{"subCommand": "status", "resourceType": "deployment", "name": "cor…` | Waiting for deployment "cortex-web" rollout to finish: 0 of 1 updated replicas are available... deployment "cortex-web" successfully rolled  |
| `kubectl_rollout` | ✅ | `{"subCommand": "history", "resourceType": "deployment", "name": "co…` | deployment.apps/cortex-web  REVISION  CHANGE-CAUSE 1         <none> |
| `kubectl_context` | ✅ | `{"operation": "list"}` | {   "contexts": [     {       "name": "colima",       "cluster": "colima",       "user": "colima",       "namespace": "default",       "isCu |
| `kubectl_reconnect` | ✅ | `{}` | {   "success": true,   "message": "API clients refreshed. DNS will be re-resolved on the next request." } |
| `explain_resource` | ✅ | `{"resource": "pods"}` | KIND:       Pod VERSION:    v1  DESCRIPTION:     Pod is a collection of containers that can run on a host. This resource is     created by c |
| `install_helm_chart` | ✅ | `{"name": "cortex-chart", "chart": "/var/folders/_l/ydn3hpc96cn_k5cm…` | {"status":"installed","message":"Helm chart 'cortex-chart' installed successfully in namespace 'cortex-test'"} |
| `upgrade_helm_chart` | ✅ | `{"name": "cortex-chart", "chart": "/var/folders/_l/ydn3hpc96cn_k5cm…` | {"status":"upgraded","message":"Helm chart 'cortex-chart' upgraded successfully in namespace 'cortex-test'"} |
| `uninstall_helm_chart` | ✅ | `{"name": "cortex-chart", "namespace": "cortex-test"}` | {"status":"uninstalled","message":"Helm chart 'cortex-chart' uninstalled successfully from namespace 'cortex-test'"} |
| `node_management` | ✅ | `{"operation": "cordon", "nodeName": "colima"}` | Successfully cordoned node 'colima'. The node is now unschedulable. |
| `node_management` | ✅ | `{"operation": "uncordon", "nodeName": "colima"}` | Successfully uncordoned node 'colima'. The node is now schedulable. |
| `node_management` | 🔒 | `{"operation": "drain", "nodeName": "colima", "dryRun": true, "ignor…` | {"code": -32603, "message": "MCP error -32603: Tool execution failed: Error: Failed to drain node: kubectl command failed: Command failed: k |
| `node_management` | 🔒 | `{"operation": "drain", "nodeName": "colima", "dryRun": true, "ignor…` | {"code": -32603, "message": "MCP error -32603: Tool execution failed: Error: Failed to drain node: kubectl command failed: Command failed: k |
| `port_forward` | ✅ | `{"resourceType": "pod", "resourceName": "cortex-web-95877b5-5rn8r",…` | {"success":true,"message":"port-forwarding was successful"} |
| `stop_port_forward` | ✅ | `{"id": "pod-cortex-web-95877b5-5rn8r-18080"}` | {"success":true,"message":"port-forward stopped successfully"} |
| `exec_in_pod` | ✅ | `{"name": "cortex-web-95877b5-5rn8r", "namespace": "cortex-test", "c…` | (Antwort ohne Text) |
| `list_api_resources` | ✅ | `{}` | NAME                                SHORTNAMES   APIVERSION                        NAMESPACED   KIND bindings                                |
| `kubectl_generic` | ✅ | `{"command": "get", "resourceType": "deployments", "namespace": "cor…` | NAME         READY   UP-TO-DATE   AVAILABLE   AGE   CONTAINERS   IMAGES         SELECTOR cortex-web   1/2     2            1           6s    |
| `ping` | 🔒 | `{}` |  |

### `jetbrains`

❌ Server startet nicht: {"code": -32603, "message": "No working IDE endpoint available."}

### `shopify`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `feedback` | ⏸ | `—` | schickt Rückmeldung an Shopify |
| `learn_shopify_api` | ✅ | `{"api": "admin"}` | 🔗 **IMPORTANT - SAVE THIS CONVERSATION ID:** e98b47bd-f86a-43e0-a095-b9c90ee3b3b7 ⚠️  CRITICAL: You MUST use this exact conversationId in AL |
| `search_docs_chunks` | ✅ | `{"conversationId": "e98b47bd-f86a-43e0-a095-b9c90ee3b3b7", "prompt"…` | [   {     "score": 0.82180774,     "content": "Support product variants Products can be broken up into a maximum of three options, and a sin |
| `validate_component_codeblocks` | ✅ | `{"conversationId": "e98b47bd-f86a-43e0-a095-b9c90ee3b3b7", "api": "…` | ## Validation Summary  **Overall Status:** ❌ INVALID **Total Code Blocks:** 1  ## Detailed Results  ### Code Block 1 **Artifact ID:** cortex |
| `validate_graphql_codeblocks` | ✅ | `{"conversationId": "e98b47bd-f86a-43e0-a095-b9c90ee3b3b7", "api": "…` | ## Validation Summary  **Overall Status:** ✅ VALID **Total Code Blocks:** 1  ## Detailed Results  ### Code Block 1 **Artifact ID:** cortex-t |
| `validate_theme` | ⏸ | `—` | braucht ein Shopify-Theme auf der Platte |

### `memory`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `create_entities` | ✅ | `{"entities": [{"name": "Cortex", "entityType": "App", "observations…` | [   {     "name": "Cortex",     "entityType": "App",     "observations": [       "IDE"     ]   },   {     "name": "Oskar",     "entityType": |
| `create_relations` | ✅ | `{"relations": [{"from": "Oskar", "to": "Cortex", "relationType": "b…` | [   {     "from": "Oskar",     "to": "Cortex",     "relationType": "baut"   } ] |
| `add_observations` | ✅ | `{"observations": [{"entityName": "Cortex", "contents": ["Widgets im…` | [   {     "entityName": "Cortex",     "addedObservations": [       "Widgets im Chat"     ]   } ] |
| `delete_entities` | ✅ | `{"entityNames": ["Cortex", "Oskar"]}` | Entities deleted successfully |
| `delete_observations` | ✅ | `{"deletions": [{"entityName": "Cortex", "observations": ["Widgets i…` | Observations deleted successfully |
| `delete_relations` | ✅ | `{"relations": [{"from": "Oskar", "to": "Cortex", "relationType": "b…` | Relations deleted successfully |
| `read_graph` | ✅ | `{}` | {   "entities": [     {       "name": "Cortex",       "entityType": "App",       "observations": [         "IDE",         "Widgets im Chat"  |
| `search_nodes` | ✅ | `{"query": "Cortex"}` | {   "entities": [     {       "name": "Cortex",       "entityType": "App",       "observations": [         "IDE",         "Widgets im Chat"  |
| `open_nodes` | ✅ | `{"names": ["Cortex"]}` | {   "entities": [     {       "name": "Cortex",       "entityType": "App",       "observations": [         "IDE",         "Widgets im Chat"  |

### `sequential-thinking`

| Funktion | Status | Aufruf | Antwort / Grund |
|---|---|---|---|
| `sequentialthinking` | ✅ | `{"thought": "Erster Gedanke: Plugin-Test.", "nextThoughtNeeded": fa…` | {   "thoughtNumber": 1,   "totalThoughts": 1,   "nextThoughtNeeded": false,   "branches": [],   "thoughtHistoryLength": 1 } |

