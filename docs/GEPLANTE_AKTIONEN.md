# Geplante Aktionen für Agenten und Teams

In der Seitenleiste führt **Geplante Aktionen** zu allen gespeicherten Zeitplänen und Webhooks. **Bearbeiten** öffnet das zugehörige Profil unter **Aktive Agenten**. Einzelne Agenten und Teams verwenden dieselben Auslöser.

## Eine Aktion einrichten

1. Einen Agenten oder ein Team erstellen beziehungsweise öffnen.
2. Konto, Modell, Reasoning-Stärke, Projekt, Anweisungen und Werkzeuge auswählen. Bei Teams gilt die Reasoning-Stärke jeweils für die einzelne Rolle.
3. Unter **Automatisierung** den Auftrag eintragen, der bei jeder Auslösung ausgeführt werden soll. Er ist vom einmaligen manuellen Auftrag getrennt.
4. **Zeitplan aktivieren** und Wiederholung, Uhrzeit sowie Zeitzone einstellen. Alternativ oder zusätzlich **Webhook aktivieren**.
5. Mit **Agent speichern** oder **Team speichern** übernehmen. Erst danach ist der Auslöser aktiv.

Die Oberfläche zeigt den gespeicherten Zustand, den nächsten Termin und die letzte Auslösung. Ungespeicherte Änderungen schalten einen vorhandenen Auslöser noch nicht um. Im Auftragsverlauf steht, ob der Start manuell, per Zeitplan oder per Webhook erfolgte; dort erscheinen auch Ergebnisse, Fehler und der Stop-Knopf.

Neue Projekte, Konten und Modelle erscheinen in den Auswahllisten ohne erneutes Öffnen des Editors, auch bei geöffnetem Dropdown. Ein Entwurf behält seine Auswahl. Wird das ausgewählte Konto oder Projekt entfernt, wechselt Cortex nicht stillschweigend zu einem anderen. Ein zwischenzeitlich geändertes Profil wird beim Speichern eines älteren Entwurfs als Konflikt gemeldet; der Entwurf bleibt erhalten.

## Zeitpläne und Zeitzonen

Zur Auswahl stehen stündlich, täglich, werktags, wöchentlich sowie ein eigener Cron-Ausdruck mit fünf Feldern:

```text
Minute Stunde Tag-im-Monat Monat Wochentag
0      9      *            *     1-5
```

Das Beispiel startet montags bis freitags um 09:00 Uhr in der ausgewählten Zeitzone. Zulässig sind Zahlen, `*`, Kommas, Bereiche wie `1-5` und Schritte wie `*/15`. Wochentage reichen von Sonntag (`0` oder `7`) bis Samstag (`6`). Die Zeitzone wird ausdrücklich gespeichert, beispielsweise `Europe/Berlin`; ein Wechsel der Systemzeitzone verschiebt dadurch den Auftrag nicht.

Die Terminberechnung verwendet [cron-parser](https://github.com/harrisiirak/cron-parser) einschließlich Zeitzonen- und Sommerzeitbehandlung. Cron-Ausdrücke mit Sekunden und benannte Monats-/Wochentagsfelder werden in dieser Oberfläche nicht unterstützt.

## Ausführung auf diesem Mac

Die installierte Ausführung läuft, solange Cortex geöffnet und der Mac wach ist. Sie benötigt keine geöffnete Agentenseite. Ein Betrieb bei vollständig geschlossener App, automatisches Aufwecken des Macs oder eine Cloud-Ausführung sind nicht eingerichtet.

Gespeicherte Zeitpläne werden beim nächsten Start wieder geladen. Nach einer Unterbrechung wird höchstens ein überfälliger Termin nachgeholt, keine Folge sämtlicher verpasster Termine. Ein neu eingerichteter oder geänderter Zeitplan beginnt beim nächsten passenden Termin. Arbeitet derselbe Agent beziehungsweise dasselbe Team bereits oder ist sein Projekt in diesem Cortex-Host belegt, wird die automatische Auslösung übersprungen und entsprechend angezeigt.

Mehrere Cortex-Fenster teilen sich einen zuständigen Scheduler, damit ein Termin nicht mehrfach startet. Auslösungen werden vor dem Start gespeichert. Wurde Cortex genau zwischen Auslösung und Startbestätigung beendet, erscheint dies als Fehler; dieser möglicherweise bereits gestartete Auftrag wird nicht automatisch erneut ausgelöst.

Zeitplan und Webhook können während eines Auftrags angepasst oder pausiert werden. Der aktuelle Auftrag behält seine gespeicherten Anweisungen; **Stoppen** beendet ihn gesondert, auch aus einem anderen Cortex-Fenster. Für Änderungen an Rollen, Konten, Werkzeugen oder Projekt muss der laufende Auftrag zuerst beendet werden.

## Webhooks

Nach dem Aktivieren und Speichern erscheint eine lokale Adresse nach diesem Muster:

```text
http://127.0.0.1:47831/hooks/<profil-id>
```

**Webhook-Aufruf kopieren** kopiert einen vollständigen `curl`-Aufruf einschließlich des individuellen Zugriffsschlüssels. Der Schlüssel wird nicht in den allgemeinen Statusmeldungen oder der Oberfläche angezeigt. Der Aufruf verwendet `POST`, den Header `Authorization: Bearer <schlüssel>` und optional JSON-Daten im Body. Das gespeicherte Agentenprofil bestimmt weiterhin Auftrag, Konto, Modell, Projekt und Werkzeuge. Übertragene JSON-Daten werden als zusätzlicher Kontext zum Auftrag behandelt.

Die Adresse ist ausschließlich von diesem Mac erreichbar. Für einen externen Dienst ist eine zusätzlich eingerichtete Weiterleitung erforderlich; Cortex richtet dafür keine öffentliche Adresse ein. Browser-Aufrufe und fremde Host-Header werden zurückgewiesen. Eine Weiterleitung muss den lokalen Host-Header erhalten und die Bearer-Authentifizierung weiterreichen.

Ein optionaler `Idempotency-Key` identifiziert ein Ereignis des aufrufenden Dienstes. Wiederholungen mit demselben Schlüssel liefern das bereits gespeicherte Ergebnis der Auslösung, ohne einen zweiten Auftrag zu starten. Cortex merkt sich höchstens die letzten 256 Auslösungen pro Profil und höchstens sieben Tage. Der JSON-Body darf bis zu 32 KiB groß sein. Ein deaktivierter oder gelöschter Webhook startet keine neuen Aufträge.

## Prüfung dieses Stands

Automatisierte Tests verwenden temporäre Dateien, einen echten lokalen HTTP-Server und den echten Cortex-Host/Team-Runner mit simulierten Anbieterantworten. Geprüft werden unter anderem Cron/Zeitzonen, Sommerzeit, Neustart, Mehrfenster-Koordination, Authentifizierung, wiederholte Webhooks, Ausführungsquellen, Pausieren und Konflikte beim Speichern. Die Oberflächentests verwenden ausschließlich Chromium Headless Shell. Es wurden keine echten Modellaufträge über Benutzerkonten gestartet.
