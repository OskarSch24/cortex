# Plugin-Katalog: Herkunft und Prüfung

## Logos

Die Plugin-Logos liegen als **farbige SVG-Dateien** unter
`media/plugins/icons/<kennung>.svg` und werden über die Webview-Basis-URI
geladen, nicht in das JavaScript-Bündel eingebettet: 248 KB Markenzeichen
gehören nicht in eine Programmdatei, und die CSP des Hosts
(`img-src ${webview.cspSource}`) erlaubt genau diesen Weg — entfernte Bilder
dagegen nie.

Gesammelt werden sie nicht von Hand:

```sh
python3 scripts/fetch-plugin-icons.py          # nur fehlende holen
python3 scripts/fetch-plugin-icons.py --alle   # alles neu holen
```

Das Skript löst jeden Katalogeintrag gegen drei veröffentlichte Sammlungen auf,
die erste mit Treffer gewinnt:

| Quelle | Lizenz der Sammlung | Einträge | wofür |
|---|---|---|---|
| [lobe-icons](https://github.com/lobehub/lobe-icons) 1.95.0 | MIT | 5 | KI-Dienste, die anderswo fehlen — dieselbe Sammlung wie das Grok-Zeichen |
| [svgl](https://svgl.app) | MIT | 41 | die breite Abdeckung für SaaS-Marken |
| [vectorlogo.zone](https://www.vectorlogo.zone) | CC0-Sammlung | 7 | die Lücken, die svgl lässt |

Bei hell/dunkel-Paaren wird die dunkle Variante genommen: Cortex ist dunkel.

**Jeder Katalogeintrag trägt ein echtes Logo.** Wo keine der drei Sammlungen
eines führt, kommt der Dienst nicht in den Katalog — nachgezeichnet wird nichts.
Ein selbst gezeichnetes Markenzeichen wäre eine Behauptung über fremdes
Eigentum, die niemand belegen kann, und eine Kachelreihe mit einzelnen
Buchstabenfeldern sieht nach Fehler aus.

Aus diesem Grund am 9. September 2026 nicht aufgenommen, obwohl ihre Server
geprüft und lauffähig sind: Apify, Browserbase, DBHub, DeepWiki, Desktop
Commander, E2B, Globalping, Kagi, Puppeteer, Raygun, Serena und Square. Wer sie
braucht, trägt sie über „mcp.json bearbeiten“ von Hand ein — die Seite führt sie
dann als „Importierte Plugins“.

Selbst eingetragene Server ohne Katalogeintrag zeigen `mcp.svg`, das Zeichen des
Model Context Protocol.

Die Marken bleiben Eigentum ihrer Inhaber. Sie stehen hier ausschließlich, um
den jeweiligen Dienst erkennbar zu machen (nominative Nutzung). Cortex ist mit
keinem von ihnen verbunden; siehe den Markenhinweis in der `README.md`.

## Servereinträge

Jeder Eintrag in `catalog.json` trägt eine **echte** MCP-Serverdefinition:
genau das, was „Plugin installieren“ in `.cortex/mcp.json` schreibt und was
`syncMcpToProfile` anschließend in die Anbieterprofile spiegelt. Ein Eintrag,
der sich nicht wirklich installieren ließe, gehört nicht in den Katalog.

Geprüft am 9. September 2026, jeweils vor der Aufnahme:

- **npm-Pakete** — gegen `https://registry.npmjs.org/<paket>` aufgelöst. Nur
  Pakete mit HTTP 200 sind aufgenommen; Version, Beschreibung und Projektseite
  im Katalog stammen aus der Registry, nicht aus dem Gedächtnis.
  Verworfen, weil nicht auffindbar: `@modelcontextprotocol/server-sentry`,
  `@axiomhq/mcp-server-axiom`, `@dbhub/server`, `@clickup/mcp-server`.

- **Entfernte Server** — mit einem JSON-RPC-`initialize` über POST angesprochen:

  ```sh
  curl -s -X POST <url> \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"cortex-catalog-check","version":"0"}}}'
  ```

  `200` mit einem JSON-RPC-Ergebnis heißt: offen erreichbar (DeepWiki, Hugging
  Face, Exa, Context7). `401` heißt: vorhanden und durch OAuth geschützt — das
  ist der Normalfall und genau der Grund, warum diese Einträge als
  „Anmeldung beim Anbieter“ geführt werden. Verworfen wegen `404`:
  `https://mcp.semgrep.ai/sse`.

- **Von diesem Rechner übernommen** — die Definitionen für Figma, Context7,
  GitLab, Linear, Playwright, Firebase, Terraform und Serena stammen wörtlich
  aus den `.mcp.json`-Dateien des offiziellen Claude-Plugin-Marktplatzes unter
  `~/.claude/plugins/`, die Apify-Definition aus `~/.claude/skills/`.

Einträge, deren Server einen Schlüssel braucht, tragen die leere Variable in
ihrer Definition (`"env": { "BRAVE_API_KEY": "" }`) und eine `requires`-Angabe.
Cortex schreibt dort nie einen Wert hinein: der Schlüssel gehört dem Nutzer, und
solange er fehlt, steht der Eintrag als „Einrichtung abschließen“ da statt als
einsatzbereit.

Anmeldungen bei Anbietern verwaltet der jeweilige Anbieter-Client (Claude, Codex
oder Grok). Cortex kann ihren Zustand nicht prüfen und behauptet ihn deshalb
auch nicht — die Produktseite sagt das ausdrücklich.

## Skills

Nur der Figma-Eintrag nennt Skills. Ihre Namen sind die Ordner, die das
offizielle Figma-Plugin unter
`~/.claude/plugins/cache/claude-plugins-official/figma/2.2.107/skills/`
tatsächlich mitbringt — abgeschrieben, nicht ausgedacht. Für jeden anderen
Eintrag fehlt der Nachweis, welche Skills zu ihm gehören; deshalb steht dort
keine Skills-Liste. Und selbst bei Figma zählt die Produktseite nur die Ordner,
die auf *dieser* Platte liegen: der Rest steht ausdrücklich als
„Auf diesem Mac nicht gefunden“ da.

`test/unit/pluginCatalog.test.ts` hält diese Regeln fest.
