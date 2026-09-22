# Cortex Engine

Lokale Agentenbibliothek (`@cortex/core`), gemeinsame Cortex-Oberfläche (`packages/vscode`, historischer Quellpfad) und eigenständige macOS-App (`@cortex/desktop`). Installation, Bedienung, Kontotrennung und Herkunft sind im [Projekt-README](../README.md) beschrieben. Die Desktop-App enthält keinen VS-Code-Erweiterungshost und keine VSCodium-Workbench.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm package # eigenständige App bauen/paketieren/signieren, ohne Installation
```

Die früheren Usturlab-Paketnamen und automatische Legacy-Profilmigration sind aus dem aktiven Code entfernt. Lizenzhinweise zu übernommenem MIT-Code werden unverändert mitgeführt.

Die frühere Erweiterung lässt sich bei ausdrücklichem Bedarf mit `pnpm package:extension` bauen. Sie ist nicht das Standardprodukt. Der vollständige macOS-Aufbau steht in [docs/EIGENSTAENDIGE_MAC_APP.md](../docs/EIGENSTAENDIGE_MAC_APP.md).
