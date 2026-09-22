# Fehlerliste

Was nach der Behebung am 13.09.2026 noch offen ist. Was behoben wurde und womit, steht oben in [ISSUES.md](ISSUES.md); die vollständige Liste in [TESTLISTE.md](TESTLISTE.md).

Übersicht: ❌ 0 Fehler · ⚠️ 0 auffällig · 🔒 8 blockiert durch die Umgebung

## ❌ Fehler

Keine.

## ⚠️ Auffällig

Keine.

## 🔒 Blockiert durch die Umgebung

| Bereich | Was | Befund | Issue |
|---|---|---|---|
| Plugin-Start | figma | Anmeldung liegt beim Anbieter-Client; im Claude-Profil als „needs auth“ vermerkt | P3 |
| Plugin-Start | jetbrains | {"code": -32603, "message": "No working IDE endpoint available."} — keine JetBrains-IDE geöffnet | P6 |
| Plugin-Funktionen | firebase (7) | nicht bei Firebase angemeldet, kein aktives Projekt, kein Quota-Projekt. Betroffen: `firebase_get_project`, `firebase_list_apps`, `firebase_get_sdk_config`, `firebase_get_security_rules`, `developerknowledge_search_documents`, `developerknowledge_answer_query`, `developerknowledge_get_documents` | P6 |
| Plugin-Funktion | kubernetes · `ping` | Antwort ohne Inhalt — liegt im Plugin selbst (`mcp-server-kubernetes` 4.1.6) | P7 |
| Plugin-Funktion | kubernetes · `node_management` | `drain` mit `deleteLocalData` nutzt das entfernte kubectl-Flag `--delete-local-data`; ohne scheitert es an Pods mit lokalem Speicher — liegt im Plugin | P9 |
| Plugin-Funktion | xcode · `XcodeRefreshCodeIssuesInFile` | Xcode liefert Diagnosen nur für Dateien in einem offenen Editorfenster; im Headless-Betrieb Fehler 5 | X1 |
| Verbinden | jetbrains, Runde 1 | Probe: Der Server hat „tools/list“ mit einem Fehler beantwortet. — keine IDE | P6 |
| Plugin-Funktion | kubernetes · `port_forward` | Weiterleitungen laufen nach dem Beenden des Servers weiter (kubectl-Prozess blieb auf Port 18080 hängen) — liegt im Plugin | P10 |
