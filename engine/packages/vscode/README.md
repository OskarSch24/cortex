# Cortex: gemeinsame Oberfläche und Host-Dienste

Dieses Paket enthält Cortex' Preact-Oberfläche, Kontoverwaltung, Vorlagen,
Agentenprofile, Teams, Cron/Webhook-Laufzeit und Anbieteranbindung.

Der Name des Quellordners ist historisch. Das Standardprodukt ist die
eigenständige macOS-App aus `../desktop/`; sie benötigt weder VSCodium noch
eine installierte VS-Code-App. Beim Desktop-Build wird die Host-Schnittstelle
auf `desktop/src/platform.ts` aufgelöst. Der VS-Code-Erweiterungshost wird nicht
mitgeliefert.

## Entwicklung

```sh
pnpm -C engine install
pnpm -C engine build
pnpm -C engine typecheck
pnpm -C engine test
bash scripts/assemble.sh --build-only
```

Die vollständige App wird unter `.cache/desktop/` gebaut und mit einer stabilen
Apple-Development- oder Developer-ID-Signatur signiert. `assemble.sh` ohne
`--build-only` installiert nach `/Applications/Cortex.app`, wenn Cortex beendet
ist. Build, Tests und Installation öffnen keine Desktop-Browser.

Die alten Erweiterungswerkzeuge bleiben nur für einen ausdrücklichen
Erweiterungsbuild erhalten: `pnpm -C engine package:extension`. Der historische
VSCodium-Build liegt getrennt in `scripts/assemble-vscodium.sh`.

Anbieterprofile bleiben unter ihren bisherigen Pfaden. Die neue App übernimmt
vorhandene Cortex-Zustände einmalig und lässt die alten Datenquellen
unverändert. Geheimnisse werden weiter verschlüsselt gespeichert.

Details zu Bedienung und Herkunft: Projekt-README. Architektur, Installation,
Datenübernahme und Prüfumfang: `docs/EIGENSTAENDIGE_MAC_APP.md` im Projekt.
Die enthaltenen Lizenzhinweise bleiben unverändert erhalten.
