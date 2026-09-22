# Anpassbare Spaltenbreiten

Referenz: Bildschirmaufnahme 2026-09-13 um 00.41.24.mov.

Die rechte Kante der Seitenleiste, die Grenze zwischen Chat und Dock, die linke Kante des Dateibaums und die geteilte Bildansicht lassen sich ziehen. Die Breiten werden lokal für die Oberfläche gespeichert. Doppelklick setzt die jeweilige Standardbreite zurück; Pfeiltasten ändern um 16 px, mit Umschalt um 48 px. Pos1/Ende erreichen die Grenzen.

Die Seitenleiste bleibt zwischen 180 und 420 px breit. Das Dock reserviert im geteilten Desktoplayout mindestens 300 px für den Chat und misst dazu den tatsächlich verfügbaren Elternbereich. Der Dateibaum reserviert 220 px für die Vorschau. In schmalen Fenstern bleibt das bestehende schwebende Dock erhalten, mit anpassbarer Breite; unter 460 px Dockbreite wird der Baum ausgeblendet. Fensteränderungen begrenzen die Darstellung, ohne die gewünschte gespeicherte Breite zu überschreiben.

Während des Ziehens fangen eingebettete Vorschauen den Zeiger nicht ab. Abbruch und Ende lösen den Ziehzustand. Der gemeinsame Griff verwendet die Ausgangsbreite und die Zeigerbewegung, damit der Inhalt beim Anfassen nicht springt.

Prüfung: TypeScript/Bundle gebaut, 185 Unit-Tests bestanden. `tests/cortex_pane_widths_ui.py` prüft echte Mausbewegungen, Breitenlimits, gespeicherte Werte nach Neuladen, unveränderten Entwurf, Seitenleiste, Dateibaum, Vollbild und kleine Fenster. Der vollständige Bildeditor-Test prüft weiterhin die bestehende Canvas.
