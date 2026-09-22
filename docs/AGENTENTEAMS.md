# Agenten und Teams in Cortex

Stand: 19.09.2026. Unter **Aktive Agenten** legst du einen **einzelnen Agenten** oder ein **Team** an. Ein einzelner Agent besitzt genau eine Rolle und erhält eigene Aufträge. Ein Team verbindet mehrere Rollen durch gemeinsame Anweisungen und Ergebnisübergaben. Für jede Rolle wählst du ein verbundenes Konto, ein Modell, Anweisungen und Werkzeuge.

## Einen einzelnen Agenten einrichten

1. Öffne **Aktive Agenten → Agent erstellen**. Wähle **Ohne Vorlage** oder einen der sechs vorbereiteten Einstiege: **Recherche**, **Fehlerreproduktion**, **Code-Review**, **Schreibassistenz**, **Arbeitskoordination** und **Support-Analyse**.
2. Eine Vorlage übernimmt Name, Rolle und vollständige Markdown-Anweisungen in deinen Entwurf. Du kannst alle Angaben bearbeiten. Konten und Werkzeuge werden dadurch nicht verbunden oder freigegeben. Die [Vorlagenübersicht](AGENTENVORLAGEN.md) erklärt die Inhalte und ihre Anregung durch veröffentlichte Grok-Bot-Beispiele.
3. Gib dem Agenten seinen Namen und wähle ein Projekt. **Ohne Projekt** verwendet einen eigenen lokalen Arbeitsordner für diesen Agenten.
4. Wähle **Konto**, **Modell** und **Reasoning-Stärke**, passe die Rollen-Anweisungen an und stelle den **Zugriff** ein. Ergänze passende **Skills** und, soweit der Anbieter es unterstützt, **MCP-Konnektoren**.
5. Klicke **Agent speichern**. Trage anschließend unter **Auftrag** eine konkrete Aufgabe ein und klicke **Agent starten**.

Gespeicherte Agenten erscheinen im Bereich **Agenten** der Übersicht; Teams stehen getrennt im Bereich **Teams**. Ein einzelner Agent braucht weder Teamnamen noch Übergaben. Er bleibt als wiederverwendbares Profil erhalten. Jeder neue Auftrag erzeugt jedoch einen neuen Chat; frühere Gesprächsinhalte werden nicht automatisch als dauerhaftes Agentengedächtnis übernommen.

## Erstes Team einrichten

1. Öffne **Aktive Agenten → Team erstellen**. Gib dem Team einen Namen und wähle sein Projekt. **Ohne Projekt** verwendet einen eigenen lokalen Arbeitsordner für dieses Team.
2. Beschreibe unter **Gemeinsame Anweisungen**, was bei jedem Auftrag gelten soll: Zweck, gewünschtes Ergebnis, relevante Quellen und Regeln.
3. Lege den ersten Agenten an. **Agentenname** benennt ihn, **Rolle** beschreibt seine Aufgabe, **Konto** und **Modell** bestimmen, wer arbeitet. **Reasoning-Stärke** legt den Denkaufwand dieser Rolle fest. Unter **Anweisungen für diesen Agenten** steht seine konkrete Arbeitsweise.
4. Stelle den **Zugriff** ein: Nur lesen, Änderungen erlauben oder Vollzugriff. Ergänze passende **Skills** und, soweit der Anbieter es unterstützt, **MCP-Konnektoren**.
5. Füge weitere Agenten hinzu oder verwende **Gespeicherten Agenten hinzufügen**. Ein gespeicherter Agent wird mit seiner Rolle, seinen Anweisungen und seiner Konfiguration als **unabhängige Kopie** übernommen. Spätere Änderungen am ursprünglichen Agenten oder an der Teamrolle werden nicht gegenseitig übertragen. Bei **Ergebnisse übernehmen von** wählst du, welche früheren Ergebnisse ein Agent erhalten soll. Kreisförmige Übergaben sind gesperrt. Ein Team besteht aus 1 bis 20 Agenten. Rollen ohne offene Übergabe arbeiten nebeneinander; wie viele das zugleich tun, begrenzen `MAX_PARALLEL` und `MAX_PER_ACCOUNT` in `src/teams/runner.ts`. Eine Rolle mit Schreibzugriff bekommt den Arbeitsordner allein, Rollen mit **Nur lesen** teilen ihn sich.
6. Klicke **Team speichern** und warte auf die Bestätigung. Trage anschließend den einmaligen **Gemeinsamen Auftrag** ein und klicke **Team starten**.

Ein einfaches Beispiel:

| Agent | Aufgabe | Ergebnisse übernehmen von |
| --- | --- | --- |
| Recherche | Quellen sammeln und Aussagen belegen | Niemand |
| Prüfung | Quellen und Schlussfolgerungen prüfen; Lücken benennen | Recherche |
| Redaktion | Eine verständliche Empfehlung mit Quellen schreiben | Recherche und Prüfung |

Die drei Rollen können unterschiedliche Anbieter und Konten verwenden. Ein gemeinsamer Auftrag könnte lauten: „Prüft die Unterlagen im Projektordner und erstellt eine kurze Empfehlung mit Quellen und offenen Fragen.“

## Einen Schwarm aus dem Chat starten

Für einen einmaligen Auftrag brauchst du kein Profil. Schreib im Chat
`/agent-swarm` und dahinter den Auftrag — der Text wird übernommen, und es
erscheint eine Karte mit dem Vorschlag, welche Rollen dazu passen. Ohne Text
hinter dem Befehl bleibt das Auftragsfeld leer und die Karte fragt danach;
**Starten** bleibt so lange gesperrt.

In der Karte stellst du ein:

- **Anzahl** — 1 bis 20. Daneben steht, wie viele davon gleichzeitig laufen.
- **Qualitätsverlust** — keine Prozentzahl, sondern eine von vier Stufen mit
  ihrem Grund: *keiner* (1–3, getrennte Teile), *gering* (4–5, Zusammenführung),
  *spürbar* (6–8, Überschneidung) und *hoch* (ab 9, Warteschlange).
- **Agenten wählen** — ein Haken je gespeichertem Agenten. Wer angehakt ist,
  belegt einen Platz mit seinem eigenen Konto, Modell und Zugriff. Hakst du mehr
  an, als Plätze da sind, steigt die Anzahl mit. Freie Plätze besetzt Cortex aus
  dem Auftrag.

Automatisch besetzte Rollen bekommen **Nur lesen**. Das ist Absicht: sie sind
ungeprüft, und nur lesende Rollen dürfen sich den Arbeitsordner teilen — sonst
liefen sie nacheinander statt nebeneinander. Wenn ein Schwarm schreiben soll,
hake einen gespeicherten Agenten mit Schreibzugriff an oder ändere die Rolle
danach unter **Aktive Agenten**.

Ein Start legt ein gewöhnliches Teamprofil namens „Schwarm · …“ an. Es steht
unter **Aktive Agenten**, lässt sich dort stoppen, ändern und erneut starten;
dieselbe Karte schreibt bei jedem Start dasselbe Profil. Während der Lauf
läuft, wird aus der Karte die Laufansicht mit einer Spur je Rolle.

## Anweisungen und Skills

### Reasoning-Stärke

Direkt unter Konto und Modell wählst du die **Reasoning-Stärke**. Jede Rolle besitzt ihre eigene Einstellung. Angeboten werden ausschließlich die im Cortex-Modellkatalog unterstützten Stufen. **Modellvorgabe** zeigt die jeweilige Standardstufe an; bei einem Modell ohne einstellbaren Denkaufwand ist die Auswahl deaktiviert.

Bei **Standardmodell** nennt der Editor das konkrete Cortex-Standardmodell. Dieses Modell wird beim Start ausdrücklich übergeben, damit die sichtbare Reasoning-Vorgabe nicht von einer abweichenden Einstellung des Anbieterprogramms abhängt.

Die Einstellung wird mit dem Agenten gespeichert und gilt für manuelle Aufträge sowie Starts per Zeitplan und Webhook. Wenn du einen gespeicherten Agenten in ein Team übernimmst, wird seine Reasoning-Stärke ebenfalls kopiert. Ein Wechsel zu einem anderen Modell setzt die Stärke auf dessen Vorgabe zurück. Neue Konten oder Projekte im Hintergrund ändern eine bestehende Auswahl nicht.

### Markdown und zugewiesene Skills

Die Felder für gemeinsame und persönliche Anweisungen nehmen Markdown an. Mit **Markdown importieren** übernimmst du eine lokale `.md`, `.markdown` oder `.txt`-Datei mit höchstens 100 KB in die Anweisungen des ausgewählten Agenten. Speichere den Agenten beziehungsweise das Team anschließend. **Markdown exportieren** speichert diese Rollen-Anweisungen als `.md`; Konto, Modell, MCP-Auswahl und das übrige Profil gehören nicht zu diesem Export.

Eine kurze Rollen-Anweisung kann so aussehen:

```markdown
## Aufgabe
Prüfe die Aussagen aus der Recherche anhand der Originalquellen.

## Ergebnis
- Bestätigte Aussagen mit Quellen
- Unbelegte oder widersprüchliche Aussagen
- Offene Fragen für die Redaktion

## Arbeitsweise
Erfinde keine fehlenden Daten. Nenne ausdrücklich, was ungeklärt bleibt.
```

Die **Skills-Auswahl im Agenten- und Teameditor** wird tatsächlich verwendet: Cortex liest die ausgewählten `SKILL.md`-Dateien und gibt deren Inhalt samt Herkunft und Basisordner an die Rolle weiter. Ein gelöschter oder nicht mehr verfügbarer Skill verhindert den Start, bis du die Auswahl korrigierst. Das ist von den derzeit nur vorgemerkten globalen Skills-Schaltern unter Einstellungen → Plugins zu unterscheiden.

## Konten und MCP-Konnektoren

| Auswahl | Verhalten |
| --- | --- |
| Claude: Alle verfügbaren | Verwendet die normale MCP-Konfiguration des Kontos. |
| Claude: Einzeln auswählen | Für diesen Agentenlauf werden die ausgewählten externen MCPs zugelassen. |
| Claude: Keine | Für diesen Agentenlauf werden keine externen MCPs eingebunden. |
| ChatGPT/Codex, Grok, Copilot | Verwenden ihre Kontoprofile. Eine eingeschränkte MCP-Auswahl wird deshalb im Agenten- und Teameditor nicht angeboten. |

Die MCP-Auswahl betrifft externe Konnektoren. Eingebaute Anbieterwerkzeuge wie Shell-/Dateizugriff und interne Cortex-Brücken werden dadurch nicht allgemein abgeschaltet; dafür ist auch der gewählte Zugriffsmodus maßgeblich. Beim Wechsel von Claude zu einem anderen Anbieter wird eine vorherige Claude-MCP-Einschränkung entfernt und der Editor nennt die tatsächliche Nutzung des Kontoprofils.

## Ergebnisse prüfen und Arbeit stoppen

Unter **Aufträge** siehst du die Arbeit einzelner Agenten und ganzer Teams: pro Rolle ihren Zustand, Aktivität und gegebenenfalls einen Fehler. **Ergebnis ansehen** öffnet die fertige Antwort mit Markdown-Darstellung. **Chat öffnen** führt zum eigenen Chat dieser Rolle. Jeder neue Auftrag erzeugt neue Rollen-Chats; du kannst dort den konkreten Arbeitsverlauf nachvollziehen.

Die Rollen arbeiten in einer festen, aus den Übergaben abgeleiteten Reihenfolge. Nachfolgende Rollen erhalten die abgeschlossenen Antworten ihrer ausgewählten Vorgänger. Ausgaben anderer Agenten sind Arbeitsmaterial und ersetzen den ursprünglichen Auftrag nicht. Bei einer sehr langen Antwort wird die Übergabe auf deren letzte 24.000 Zeichen begrenzt; für umfangreiche Ergebnisse eignen sich daher Dateien im gemeinsamen Projekt und eine kompakte Abschlussantwort mit Dateipfaden.

**Agent stoppen** bricht den Auftrag eines einzelnen Agenten ab. **Team stoppen** bricht den laufenden Teamagenten ab und startet die übrigen Rollen nicht mehr. Der Stopp wird auch aus einem anderen Cortex-Fenster an das ausführende Fenster weitergegeben. Bereits erstellte Dateien oder ausgeführte Änderungen werden dabei nicht zurückgenommen. Scheitert eine Rolle im Team, werden Rollen mit einer davon abhängigen Übergabe als blockiert angezeigt; unabhängige Rollen dürfen weiterarbeiten.

Während ein Agent oder Team arbeitet, lässt sich kein zweiter Auftrag desselben Profils starten. Änderungen an Rollen, Konten, Werkzeugen und Projekt sowie Löschen werden zurückgewiesen; die Automatisierung lässt sich weiterhin bearbeiten oder pausieren. Ein anderes laufendes Cortex-Vorhaben im selben Projekt kann den nächsten manuellen Agentenauftrag warten lassen; automatische Auslösungen werden in diesem Fall übersprungen. Diese Projektkoordination gilt innerhalb eines Cortex-Hosts. Unterschiedliche Profile in verschiedenen Fenstern haben keine gemeinsame Sperre oder getrennte Kopie der Projektdateien; sie können dieselben Dateien bearbeiten. Ungespeicherte Profiländerungen bleiben bei der Navigation zu Konten oder Chats in der laufenden Oberfläche erhalten. Dauerhaft werden sie erst durch **Agent speichern** beziehungsweise **Team speichern**.

## Zeitpläne, Webhooks und aktuelle Auswahllisten

Einzelne Agenten und Teams können durch einen gespeicherten Cron-Zeitplan oder einen authentifizierten lokalen Webhook starten. **Geplante Aktionen** in der Seitenleiste zeigt die eingerichteten Auslöser, nächste Termine und letzte Auslösungen. Die Ausführung setzt ein geöffnetes Cortex und einen wachen Mac voraus. Einrichtung und Grenzen stehen unter [Geplante Aktionen](GEPLANTE_AKTIONEN.md).

Neue Projekte, verbundene Konten und deren Modelle erscheinen unmittelbar in den Auswahllisten des Editors. Die bestehende Auswahl und ungespeicherte Anweisungen bleiben dabei erhalten. Entfernte oder nicht mehr verfügbare Ressourcen müssen bewusst ersetzt werden. Änderungen aus einem anderen Fenster überschreiben einen offenen Entwurf nicht; ein veralteter Entwurf führt beim Speichern zu einem sichtbaren Konflikt.

## Was gespeichert wird und was noch fehlt

Agentenprofile, Teamprofile und die jüngsten Laufprotokolle werden lokal gespeichert. Einzelagenten tragen ausdrücklich die Profilart `kind: 'agent'` und enthalten genau eine Rolle. Bestehende Teams bleiben Teams, auch wenn sie nur eine Rolle enthalten; ihre Einordnung wird durch dieses Update nicht stillschweigend geändert.

Veraltete Speicherstände aus einem zweiten Fenster werden als Konflikt zurückgewiesen. Laufende Aufträge eines anderen noch aktiven Fensters bleiben beim Einlesen erhalten. Das Löschen eines Agenten oder Teams löscht seine vorhandenen Chats nicht. Nach einem Cortex-Neustart werden unterbrochene Läufe als gestoppt gekennzeichnet; sie werden nicht automatisch fortgesetzt. Starte bei Bedarf einen neuen Auftrag.

Diese Version bietet endliche lokale Agenten- und Teamaufträge mit manuellen Starts, Zeitplänen und lokalen Webhooks. Sie umfasst noch keinen dauerhaft laufenden Cloudcomputer, keinen freien Gruppenchat zwischen Bots, keine selbstständigen asynchronen Nachrichten zwischen Rollen und keinen gemeinsamen erlernten Bot-Speicher. Die Namen und Rollen bleiben in den gespeicherten Profilen erhalten; der Gesprächskontext entsteht für jeden Lauf neu.

## Bezug zu Grok Bot

Die Orientierung betrifft Arbeitsprinzipien: klare Zuständigkeiten und wiederverwendbare Rollen, sichtbare Übergaben und wiederverwendbare Anleitungen. Die offiziellen Grok-Unterlagen empfehlen getrennte Verantwortlichkeiten und die Trennung dauerhafter Rollenregeln vom einzelnen Auftrag. [Create and manage Bots](https://docs.x.ai/grok-bot/bots)

Die neue Galerie enthält sechs eigenständig formulierte Cortex-Startvorlagen mit Quellen zu den jeweiligen Grok-Bot-Beispielen. Die [Vorlagenübersicht](AGENTENVORLAGEN.md) nennt ihre Herkunft und den Unterschied zu vollständigen Grok-Bot-Templatepaketen.

Grok dokumentiert direkte asynchrone Nachrichten und Gruppenarbeit. Cortex verwendet dafür aktuell die oben beschriebenen geordneten Übergaben. [Message and collaborate](https://docs.x.ai/grok-bot/chat-and-collaboration)

Grok trennt Skills als wiederverwendbare Arbeitsanleitungen von Routinen als Zeit-/Ereignisauslösern. Cortex verwendet eigene Skill-Zuordnungen sowie die oben beschriebenen lokalen Zeitpläne und Webhooks. [Skills and routines](https://docs.x.ai/grok-bot/skills-routines-and-automations)

Quellen wurden am 19.09.2026 geprüft. Der [Prüfbericht](CORTEX_FUNKTIONSRUNDGANG_2026-09-19.md) trennt simulierte Oberflächentests, Host-/Runner-Tests, lokale CLI-Proben und eine etwaige spätere native Live-Abnahme.
