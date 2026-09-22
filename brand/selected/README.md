# Ausgewähltes Cortex-App-Icon

Ausgewähltes Grundmotiv: die Datei `Icon Cortex.png` vom Schreibtisch (2026-09-09). Der aktive Master ist `cortex-facetten.png` (SHA-256: `17dbb7e5a6a95722a4bb3b0cb30708a6d6c53e1ccc5ccc4284e2a6373f53c932`).

`swift scripts/build-icon.swift` erzeugt `brand/icon.png`, alle PNG-Größen in `brand/icon.iconset/`, `brand/Code.icns` und das gemeinsame UI-Asset `engine/packages/vscode/webview/assets/cortex-icon.png`. Der Master füllt die Fläche ohne macOS-Kachelrand; das Skript setzt das Motiv in die abgerundete Kachel. `scripts/assemble.sh` übernimmt die ICNS-Datei auch bei zukünftigen App-Builds; der Webview-Build bettet das UI-Asset als Data-URL ein.

Vorherige Brand-Dateien liegen in `brand/archive/2026-09-09-vor-facetten-icon/`.
