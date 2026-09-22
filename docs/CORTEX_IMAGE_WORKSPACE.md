# Bilderstellung und Bildbearbeitung — 12.09.2026

Referenz: `Bildschirmaufnahme 2026-09-12 um 22.04.58.mov`, 3420 × 2224 Pixel, 173 Sekunden. Die Oberflächenmaße wurden auf die logische Retina-Auflösung (halbe Pixelzahl) bezogen. Die Cortex-Seitenleiste und die tatsächlich verfügbaren Anbieter bleiben Teil der bestehenden App.

## Umsetzung

- Bilder stehen direkt unter der Antwort, mit 480 px maximaler Einzelbildbreite und 16 px Eckenradius. Kopieren, Bewertung, Großansicht und weitere Aktionen stehen darunter.
- Die Bildansicht ersetzt den Chatbereich; Navigation und Eingabefeld bleiben bedienbar. Sie kann auch neben dem Chat stehen. Das Schließen erhält den Verlauf und den ungesendeten Entwurf.
- Die Canvas und Galerie laufen bis zum unteren Fensterrand hinter dem schwebenden Eingabefeld weiter. Einpassen und zusätzlicher Scrollraum berücksichtigen die tatsächliche Höhe des Eingabefelds einschließlich Anhängen und aufgeklapptem Beitrag; der letzte Bildrand bleibt erreichbar. Werkzeuge öffnen oberhalb des Eingabefelds.
- Oben stehen Bildreiter, Öffnen, Speichern und Ansichtswechsel. Die mittige Werkzeugleiste enthält Kommentieren, HG entfernen, Entfernen und Größe ändern.
- Miniaturen zeigen alle Bildversionen der Aufgabe. Zoom: Einpassen, 25–400 %, Tastatur +/−/0 und ⌘/Strg + Scrollen; vergrößerte Bilder lassen sich verschieben. Pfeiltasten wechseln zwischen Bildern. Escape schließt zuerst das aktive Menü oder Werkzeug, dann die Ansicht.
- Die Galerie zeigt 292 px breite Bilder, Datum, blaue Auswahlkontur und Mehrfachauswahl. Ausgewählte Bilder erscheinen als 80 × 80 px große Anhänge im Eingabefeld. Entfernen eines Anhangs hebt seine Galerieauswahl auf.
- Kommentare und Entfernen verwenden Rechteck- oder Punktauswahlen. Koordinaten beziehen sich auf das Originalbild, unabhängig von Zoom oder Anzeigegröße. Die Aufträge enthalten Referenzpfad, Bereich und die Vorgabe, das Original zu erhalten.
- Hintergrundentfernung fordert PNG mit echtem Alphakanal an. Diese KI-Bearbeitungen verwenden den aktuell gewählten Bildanbieter. Ein Folgeauftrag kann ausgewählte Bilder erneut bearbeiten.
- Größe ändern verwendet macOS `sips`, erhält die Quelldatei und schreibt eine neue PNG-Version mit exakten Abmessungen. Seitenverhältnis kann gesperrt werden. Grenze: 8192 px je Kante, 32 Megapixel insgesamt.
- Bild kopieren schreibt PNG-Daten in die macOS-Zwischenablage. Speichern und externe Vorschau verwenden weiterhin die vorhandenen Host-Aktionen und Pfadgrenzen.

## Prüfung

- TypeScript und gebündelte Erweiterung gebaut.
- 185 Unit-Tests bestanden, darunter Auswahlkoordinaten, Anbieterprompts, Bildverlauf, Speichern und Wiederherstellen von Bildereignissen sowie tatsächliche lokale Größenänderung auf 317 × 191 px. Die Originaldatei bleibt bytegleich.
- `tests/cortex_image_ui.py`: Bildmodus, Anbieter-/Kontowahl, Generierungsauftrag, Darstellung und Aktionen bestanden.
- `tests/cortex_image_editor_ui.py`: Bildbearbeitung, Zoom, Auswahl, Referenzen, Anbieterwechsel, native Größenanfrage, Ladezustand und Rückkehr zum Chat bestanden; mit der Content-Security-Policy der echten Webview.
- `tests/cortex_popups.py` und `tests/cortex_queue_ui.py` bestanden.
- Zusätzliche Ansicht bei 960 × 800 px ohne horizontale Überlappung oder JavaScript-Fehler geprüft.
- Durchgehende Galerie bei 1710 × 1074 und 960 × 800 px mit Bildanhängen geprüft: Bild bleibt neben dem schwebenden Eingabefeld sichtbar, Scrollfläche reicht bis zum Fensterrand, letzter Bildrand lässt sich vollständig über das Eingabefeld scrollen. Vollständiger Editor-Test nach der Änderung bestanden.
- Der ältere Gesamttest `tests/cortex_ui.py` erreicht den Chat-Darstellungsabschnitt, stoppt dort aber an `.user-bubble`. Der bestehende Chat verwendet bereits `.cx-c-bubble`; weitere dortige Selektoren stammen ebenfalls aus dem früheren Chat. Dieser unabhängige Altbestand wurde nicht umgeschrieben.
- Die UI-Prüfung verwendet ausschließlich `tests/headless_browser.py` und lokale Beispieldaten. Keine Desktop-Browser und keine echten Bildanbieter-Aufträge wurden zum Testen gestartet. Qualität und Transparenz der KI-Ergebnisse müssen daher noch mit einem realen Anbieterauftrag geprüft werden; die lokale Pixeländerung wurde tatsächlich ausgeführt.

Screenshots liegen in `docs/screenshots/image-workspace/`. Sie zeigen lokale Testbilder, keine behaupteten KI-Ergebnisse.

Das signierte Installationspaket liegt unter `.cache/ready/Cortex.app`. Am 13.09.2026 wurde die geprüfte Version unter `/Applications/Cortex.app` installiert und Cortex neu gestartet. Signatur und sämtliche 73 Dateien unter `media` und `dist` wurden an der tatsächlichen Installation geprüft. Der ursprüngliche Stand liegt als Rückfallkopie unter `.cache/snapshots/20260913-001519-vor-bildarbeitsflaeche`.

Bei der nativen Abnahme wurde zusätzlich ein vorhandener Speicherfehler korrigiert: `image` fehlte in den persistierten Ereignistypen. Bildereignisse bleiben nun im Chatverlauf; Ressourcenadressen werden für die jeweilige Webview neu aufgebaut. Die beiden vorhandenen Biberbilder wurden aus ihrer ursprünglichen Grok-Sitzung wieder mit dem Chat verknüpft, ohne sie neu zu erzeugen. Vor der gezielten Wiederherstellung wurde die Zustandsdatenbank unter `.cache/snapshots/20260913-0020-bildverlauf.vscdb` gesichert. Ein weiterer regulärer Neustart erhält beide Bilder. Die native Prüfung umfasst Bildkarte, Bildansicht und Galerie mit echten vorhandenen Bildern. Die Bildkopfzeile hält die 44 px der nativen Fensterleiste frei; der vollständige Editor-Test wurde danach erneut erfolgreich ausgeführt.
