# /goal — an einer Aufgabe dranbleiben, bis sie erledigt ist

Gebaut am 25.09.2026. Vorbild sind die Ziel-Modi von Codex (`/goal`) und Claude Code (`/goal`); Cortex baut die Schleife selbst, damit sie mit jedem Anbieter gleich läuft — Claude, Codex, Grok, OpenRouter.

## Bedienung

| Eingabe | Wirkung |
| --- | --- |
| `/goal <Aufgabe>` | Setzt das Ziel des Chats und startet Runde 1. Ein älteres Ziel wird ersetzt. |
| `/goal` | Zeigt den Stand: Aufgabe, Zustand, Runden, Arbeitszeit, letzter Schritt. |
| `/goal pause` | Keine weiteren Runden; die laufende endet noch. Auch: `anhalten`, `stopp`. |
| `/goal weiter` | Setzt fort — nach Pause, Fehler, Limit, Neustart oder wenn es fertig gemeldet war. |
| `/goal aus` | Beendet das Ziel. Auch: `beenden`, `löschen`. |

- **Stopp-Knopf** bricht die laufende Runde ab und hält das Ziel an.
- **Ziel-Leiste** über dem Eingabefeld: Aufgabe, nächster Schritt, Zustand (grün „läuft“, bernstein „wartet auf dich“) und die Knöpfe Pausieren · Weiter · Beenden.
- Im Verlauf steht der `/goal` als Nachricht; jede weitere Runde als schmale Zeile „Ziel · Runde N“. Die Statusmeldung am Ende einer Antwort erscheint als Zeile („Als Nächstes …“, „Ziel erreicht …“, „Braucht dich …“).
- Schreibst du während eines Ziels, kommt deine Nachricht vor der nächsten Runde dran und zählt als Runde. Wartet das Ziel auf dich, geht es mit deiner Antwort weiter.
- Die Runden laufen mit den Einstellungen des `/goal`: Modell, Denkstufe, Berechtigung. Unter „Plan“ kann ein Ziel nichts ändern — Cortex sagt das beim Start. Mit „Genehmigung anfordern“ wartet jede Runde auf deine Freigaben.

## Wann es fertig ist

Jede Antwort endet mit einem Block `cortex-goal`: `continue` mit dem nächsten Schritt, `done` mit dem Nachweis, `blocked` mit dem, was nur du geben kannst. Das Modell bekommt dafür im Brief die Regel, fertig erst nach einer Prüfung jeder Anforderung gegen echte Belege zu melden.

Cortex nimmt „fertig“ nicht einfach hin: schlagen die Prüfungen des Projekts nach der Antwort fehl (Einstellung „Änderungen prüfen“), geht die nächste Runde mit genau diesem Hinweis los.

Angehalten wird das Ziel

- nach einem Fehler oder Nutzungslimit,
- nach zwei Runden in Folge ohne einen einzigen Werkzeugaufruf (es tritt auf der Stelle),
- nach 30 Runden — „Weiter“ gibt die nächsten 30; die letzte Runde fasst zusammen, was fertig ist und was fehlt,
- nach einem Neustart von Cortex, wie die Warteschlange.

Ist der Chat nicht zu sehen, meldet sich Cortex, wenn das Ziel erreicht ist, dich braucht oder anhält.

## Mehrere Slash-Befehle in einer Nachricht

`/` öffnet das Befehlsmenü überall im ersten Absatz, nicht nur am Anfang. So lassen sich Befehle kombinieren:

- `/goal /test` — Tests reparieren, bis alles grün ist.
- `/goal /remotion Intro-Video` — öffnet den Reiter „Video“ und arbeitet, bis das Video gerendert ist.
- `Bitte /review und /security-review für das Auth-Modul` — beide Prüfungen, der Rest der Nachricht gilt für beide.

Regeln: Aktionen (Archivieren, Einstellungen …) gelten nur ganz vorn und allein. Befehle, die ans Modell gehen, und `/goal` gelten überall im ersten Absatz. Nach einer Leerzeile (meist Eingefügtes wie ein Log), in `Code` und in Pfaden (`/test/unit`) bleibt `/` Text. Mehrere Befehle gehen an jedes Modell als ihre Vorlagen, der Reihe nach; ein einzelner Befehl am Anfang verhält sich wie bisher (bei Claude der eingebaute Befehl).

## Wo der Code liegt

- `engine/packages/core/src/goal/goal.ts` — Brief, Fortsetzungs-Text, Statusblock, was eine Runde bedeutet (rein, ohne Host).
- `engine/packages/core/src/commands/slashCommands.ts` — `/goal` im Katalog, `parseSlashCommands`, `expandSlashCommands`.
- `engine/packages/vscode/src/panel/host/goals.ts` — Schleife im Host: nächste Runde, Stopp, Neustart, Benachrichtigung.
- `engine/packages/vscode/src/panel/chatViewProvider.ts` — Anbindung an Senden, Warteschlange und Lauf.
- `engine/packages/vscode/webview/components/GoalStrip.tsx`, `goalReport.tsx`; Stil am Ende von `media/cortex-look.css`.

## Tests

- `engine/packages/core/test/goal.test.ts`, `slashMulti.test.ts` — Befehle, Statusblock, Zustände.
- `engine/packages/vscode/test/unit/goalHost.test.ts` — Runden durch die echte Warteschlange: fertig, wartet, Stopp, Fehler, Stillstand, Neustart.
- `tests/cortex_goal_ui.py` — Leiste, Runden im Verlauf, Knöpfe, Befehlsmenü mitten in der Nachricht (headless).
- `engine/packages/core/test/live-goal.test.ts` — echtes Modell (`CORTEX_LIVE=1`, `CORTEX_LIVE_PROVIDER=claude|codex`): arbeitet in einem Wegwerf-Ordner, bis es fertig meldet; die Dateien werden danach nachgeprüft. Am 25.09. mit Claude bestanden (1 Runde); Codex war im Nutzungslimit.
- Bildschirmfotos: `docs/screenshots/goal-*.png`.
