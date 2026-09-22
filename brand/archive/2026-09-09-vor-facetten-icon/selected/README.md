# Ausgewähltes Cortex-App-Icon

Ausgewähltes Grundmotiv: das vom Nutzer am 2026-09-08 angehängte Bild `exec-a79cb03e-b9a9-402e-9a54-46beb967e861.png`. Auf Wunsch wurde das Weiß anschließend für die Sichtbarkeit in kleinen Größen verstärkt. Der aktive Master ist `cortex-gehirn-hell.png`.

Das Original bleibt unverändert in `cortex-gehirn-original.png` (SHA-256: `780f4ae5c0063d71165d3c074405e2a635d917729246cd32c09075e7b6970d6d`). Die hellere Bearbeitung wurde mit dem eingebauten Imagegen-Tool erstellt; der verwendete Prompt steht in `PROMPT-HELLER.md`.

`swift scripts/build-icon.swift` erzeugt `brand/icon.png`, alle PNG-Größen in `brand/icon.iconset/`, `brand/Code.icns` und das gemeinsame UI-Asset `engine/packages/vscode/webview/assets/cortex-icon.png`. Der Master enthält bereits die Abstände zum Bildrand. `scripts/assemble.sh` übernimmt die ICNS-Datei auch bei zukünftigen App-Builds; der Webview-Build bettet das UI-Asset als Data-URL ein.

Vorherige Brand-Dateien liegen in `brand/archive/2026-09-08-213105-vor-gehirn-icon/`.
