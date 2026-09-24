# Arbeiten an Cortex

## Keine Desktop-Browser für Entwicklung und Tests

Der Nutzer möchte bei Änderungen, Builds, Installation und automatischen Tests
keinen Browserstart und kein zusätzliches Browser-Symbol im macOS-Dock.

- Oberflächentests verwenden ausschließlich `tests/headless_browser.py` mit der
  separaten Playwright-Runtime `chromium-headless-shell`.
- Niemals `channel='chrome'`, einen anderen Desktop-Browser-Kanal,
  `headless=False`, einen Pfad zu einer Browser-App oder `open` als Test-Fallback
  verwenden. Keine Browser-Tabs automatisch zur Vorschau öffnen.
- Fehlt die Runtime, `python3 -m playwright install chromium-headless-shell`
  ausführen oder den Test als nicht ausführbar melden; keinen Desktop-Browser
  ersatzweise starten.
- Tests müssen ihre eigenen Prozesse auch bei Fehlern schließen. Bestehende
  persönliche Browser-Sitzungen des Nutzers nicht beenden oder verändern.
- Build, Watch und Installation dürfen keine Browser- oder Vorschauöffnung
  auslösen. Vom Nutzer ausdrücklich gestartete Anmeldungen und Browseraktionen
  bleiben gesonderte Aktionen.

### Was die Regel nicht verbietet

Sie richtet sich gegen Fenster, die **von selbst** aufgehen — beim Bauen, beim
Installieren, beim Testen. Sie ist keine Aussage darüber, was Cortex können darf.
Ausdrücklich nicht betroffen:

- Funktionen der App selbst: die eingebaute Vorschau, der OAuth-Login beim
  Anbieter, künftige Brücken zu einer Browser-Erweiterung.
- Jede Browseraktion, die der Nutzer in seinem Auftrag verlangt.

### Freigabe

Der Schalter dafür steht in **Einstellungen → KI-Agenten → Desktop-Browser für
Agenten** (`cortex.browserAccess`). Drei Stufen:

| Wert | Bedeutung |
| --- | --- |
| `nie` | Kein Desktop-Browser, auch nicht auf ausdrückliche Ansage. |
| `auf-ansage` | Nur wenn der Nutzer es in einem Auftrag verlangt. **Vorgabe.** |
| `immer` | Der Agent darf ihn öffnen, wenn er ihn für die Aufgabe braucht. |

Bei `auf-ansage` gilt eine Freigabe für die Aufgabe, in der sie erteilt wurde —
nicht für die nächste. Den Wert liest der Agent aus der Einstellungsdatei; im
Zweifel gilt die Vorgabe.

Recherche der Cortex-Agenten läuft **immer im eingebauten Browser** (MCP-Server
`cortex_browser`, `desktop/src/agentBrowser.ts`): eigene Tabs im Hintergrund,
mehrere nebeneinander, während der Nutzer in seinem eigenen Browser arbeitet.
Außer bei `immer` laufen Playwright und Chrome DevTools deshalb headless und
docken nie an das laufende Chrome an (`vscode/src/plugins/browserPolicy.ts`).

Was der Agent öffnet, schließt er danach wieder. Bestehende Sitzungen und
Fenster des Nutzers bleiben unangetastet — das gilt in jeder Stufe, auch bei
`immer`.
