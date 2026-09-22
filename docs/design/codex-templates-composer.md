# Codex-Vorlagen und Chat-Eingabe in Cortex

Referenz: die sieben Screenshots vom 19.09.2026, 14:25–14:27. Die Detailaufnahmen sind Retina-Bilder mit zwei Bildpunkten je CSS-Pixel. Farbmessungen wurden in sRGB ausgewertet.

| Element | Umsetzung |
| --- | --- |
| Chatfläche | `#181818` |
| Seitenleiste | `#353030` |
| Schrift | macOS-Systemschrift, Textfeld 14 px, untere Bedienleiste 13 px |
| Eingabe | `#353535`, 736 × 98 CSS-Pixel im leeren Zustand |
| Vorlagenbereich | `#2D2D2D`, Radius 22 CSS-Pixel |
| Projektlasche | `#1F1F1F` |
| Dokumentvorschau | 138 × 174 CSS-Pixel, Abstand 14 |
| Folien-/Tabellenvorschau | 16:9, drei Kacheln bei voller Breite |

Die Referenzflächen sind einfarbig. Ein zusätzlicher Farbverlauf würde vom Screenshot abweichen. Schmale Fenster passen die Breite an; gespeicherte eigene Farben und das helle Design bleiben möglich.

## Originale und Auswahl

20 Originalvorlagen aus dem lokal installierten OpenAI-Templates-Paket 0.1.1: 7 DOCX, 7 PPTX, 6 XLSX. Alle Beispiele der Screenshots stehen in ihrer Gruppe zuerst. Originaldateien und Vorschaubilder wurden unverändert übernommen. Herkunft, SHA256-Prüfsummen und der originale Lizenzhinweis stehen im Vorlagenpaket; die Originale sind nicht durch die MIT-Lizenz des Cortex-Codes abgedeckt.

**+ → Vorlagen** öffnet die Galerie. Über **Vorlagen** im Galeriekopf lassen sich Dokumente, Präsentationen, Tabellen und eigene Vorlagen wählen. Die Pfeile blättern; ein Klick auf eine Kachel setzt den kurzen Auftrag ein und hängt die reale Office-Datei und ihre Anleitung an. Eine neue Vorlagenwahl ersetzt die vorherigen Vorlagenanhänge und erhält andere angehängte Dateien.

Die Mikrofon- und Wellenformknöpfe führen ausdrücklich in die vorhandenen Spracheinstellungen. Sie implementieren keine Spracherkennung und starten keine Aufnahme. Der Entwurf samt Anhängen bleibt beim Zurückkehren erhalten.

## Prüfung

- Produktionsbuild und Typecheck bestanden.
- Installiert unter `/Applications/Cortex.app`; Signatur geprüft, 168 Vorlagendateien sowie Oberfläche, Host-Bundle und native Farbvorlage bytegenau mit dem Build verglichen. Die laufende App wurde nicht beendet.
- 53 Testdateien / 404 Modultests bestanden, davon sieben Vorlagentests.
- Alle 20 Office-Dateien als OOXML-ZIP geprüft, XML lesbar; 100 Originaldateien gegen Quelle und SHA256 geprüft.
- Tatsächliche Host-Übergabe von DOCX, PPTX und XLSX inklusive Anleitung getestet; Binärdateien werden nicht als Text in den Prompt geschrieben.
- Headless-Oberflächentest mit den echten Vorschaubildern: Kategorien, Pfeile, Vorlagenwechsel, Dateianhänge, Senden, Entwurfserhalt und schmale Fenster.
- Composer-Regressionstest bestanden: Zwischenablage, IME, Vorschläge, Rückgängig, Verlauf, Größenanpassung, Modellwahl und Bildmodus.

Screenshots: `docs/screenshots/codex-composer-empty.png`, `codex-templates-documents.png`, `codex-templates-presentations.png`, `codex-templates-spreadsheets.png`.

Die Prüfungen erzeugen keinen Auftrag bei einem echten KI-Anbieter und bestätigen daher keine fertige Office-Ausgabe. Ein automatisierter Screenshotvergleich der vollständig laufenden installierten App wurde nicht durchgeführt.
