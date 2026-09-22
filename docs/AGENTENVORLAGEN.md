# Agentenvorlagen in Cortex

Stand: 19. September 2026.

Die sechs Startvorlagen sind eigenständig formulierte deutsche Cortex-Anweisungen. Ihre Rollen sind durch veröffentlichte Grok-Bot-Beispiele angeregt. Es handelt sich nicht um importierte Originalvorlagen, eine Grok-Verbindung oder eine Freigabe durch xAI.

Eine Vorlage setzt Name, Rolle und bearbeitbare Markdown-Anweisungen. Konto, Modell, Werkzeuge, MCPs und Skills werden separat ausgewählt. Eine Vorlage richtet keine Verbindung ein und erhöht keine Berechtigungen.

| Cortex-Vorlage | Anregung aus der offiziellen Veröffentlichung | Quelle |
| --- | --- | --- |
| Recherche | Quellenübergreifender Product Expert | [Grok Bot 101](https://x.ai/bot/guides/grok-bot-101) |
| Fehlerreproduktion | Eigenständige Rolle Bug Reproduction | [Use cases](https://docs.x.ai/grok-bot/use-cases) |
| Code-Review | Engineering-Agenten prüfen Änderungen und Nachweise | [Grok Bot for Engineering](https://x.ai/bot/guides/grok-bot-for-engineering) |
| Schreibassistenz | Entwürfe anhand eigener Stilbeispiele | [Grok Bot for GTM](https://x.ai/bot/guides/grok-bot-for-gtm) |
| Arbeitskoordination | Chief of Staff und priorisierte Arbeitsübersichten | [Grok Bot for PMs](https://x.ai/bot/guides/grok-bot-for-pms) |
| Support-Analyse | Rückmeldungen gruppieren und Supportfälle aufbereiten | [Grok Bot for Support](https://x.ai/bot/guides/grok-bot-for-support) |

Die vollständigen Markdown-Texte stehen im Katalog [starters.ts](../engine/packages/vscode/src/teams/starters.ts) und werden bei der Auswahl in den bearbeitbaren Agentenentwurf übernommen. Jede Vorlage enthält Auftrag, Vorgehen und Ergebnisformat. Sie funktioniert auch als Ausgangspunkt für einen einzelnen Agenten.

## Einordnung gegenüber Grok Bot

Grok Bot beschreibt einen Agenten als dauerhaftes Profil mit eigener Aufgabe und Konversation. [Create and manage Bots](https://docs.x.ai/grok-bot/bots) ist die Grundlage für diese Trennung zwischen dauerhaften Rollenregeln und einzelnen Arbeitsaufträgen.

Der offizielle [Template-Guide](https://x.ai/bot/guides/templates-for-grok-bot) beschreibt weitergehende Pakete aus Anweisungen, Skills und Integrationen. Diese Cortex-Vorlagen enthalten nur die oben genannten Texte. Sie importieren keine Grok-Bot-Pakete, privaten Erinnerungen, Zugangsdaten, Routinen oder Plugins. Die Veröffentlichung nennt außerdem Vorlagen anderer Nutzer; ein öffentliches Grok-Bot-Angebot ist deshalb nicht automatisch eine von xAI erstellte Vorlage.

Die Auswahl einer Vorlage verspricht keinen Dauerbetrieb, Zeitplan oder Zugriff auf externe Systeme. Ob ein Auftrag die benötigten Daten lesen oder Werkzeuge verwenden kann, hängt von den verbundenen Konten, vorhandenen Skills und der tatsächlichen Werkzeugfreigabe ab.
