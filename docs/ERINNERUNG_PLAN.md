# Bauplan: Erinnerung in Cortex

Stand 17.09.2026 · **gebaut**, Tests grün, noch nicht in `/Applications/Cortex.app` installiert

Umgesetzt: Schritt 1–6 und Suchbereiche. Abweichungen vom Plan:
- Kürzung behielt nicht das Ende, sondern den Anfang — Widgets fielen dadurch ganz weg. Jetzt Anfang + Ende, Widgets als Text.
- „Prompt: Suchanfrage“ ist „Prompt: Selbst suchen“ geworden (Hinweis im Systemprompt, wann das Modell selbst `suche` nutzt); die automatische Suche bildet Begriffe lokal ohne Modellaufruf.
- Treffer-Anzeige als Hinweiszeile im Chat (nicht gespeichert), kein aufklappbarer Chip.
- Chats, deren Sitzungen vor dem Update entstanden sind, bekommen das Nachreichen erst ab der nächsten Antwort jedes Modells; der Notizzettel entsteht dort aus dem ganzen bisherigen Verlauf.

Dateien: `core/src/session/sessionStore.ts`, `core/src/orchestrator/orchestrator.ts`, `vscode/src/memory/*`, `vscode/src/panel/chatViewProvider.ts`, `vscode/src/extension.ts`, `vscode/webview/settings/pages/persoenlich.tsx`, `~/dev/Exokortex/bruecke/lesen.py` (`--abruf`, `--projekte`). Tests: `core/test/memory-gap.test.ts`, `vscode/test/unit/erinnerung.test.ts`, `tests/cortex_erinnerung_ui.py`. Sicherung vorher: `backups/vor-erinnerung-2026-09-17.tar.gz`.

## Ausgangslage (gemessen am Code)

| # | Befund | Stelle |
|---|---|---|
| A | Ein Modell mit eigener Sitzung bekommt beim Zurückkehren **nur die neue Nachricht**. Was andere Modelle inzwischen im Chat gemacht haben, fehlt. Es gibt keinen Zähler „welche Nachrichten hat diese Sitzung gesehen“. | `core/src/orchestrator/orchestrator.ts:209`, `core/src/session/sessionStore.ts:50` |
| B | Ein Modell ohne Sitzung bekommt höchstens 6.000 Tokens Verlauf, pro Nachricht 1.000, und davon nur das **Ende**. Widget-JSON (Tabellen) frisst das Budget. | `sessionStore.ts:255–284` |
| C | Exocortex ist nur als MCP-Werkzeug (`suche`, `dokument`, `knoten`, `nachbarn`, `bestand`) eingebunden. Niemand ruft automatisch ab, und das Modell erfährt nicht, wann es suchen soll. | `~/.cortex/mcp.json`, `~/dev/Exokortex/bruecke/lesen.py` |
| D | `lesen.py --suche` liefert Text ohne Relevanzwert (bm25 wird nicht ausgegeben) und hat keinen Zeitdeckel. | `lesen.py:78–110`, `chatViewProvider.ts:2818` |
| E | Exocortex hat keinen Schreibweg. Chats kommen stündlich über `chats.py` hinein (10 Min. Ruhe, `maskiere()` schwärzt bekannte Schlüsselformate). | `bruecke/chats.py` |
| F | Einstellungen: Abschnitt „Cortex-Erinnerung“ existiert nur als Vorschau (`pending`). Auch der Text „Cortex-Anweisungen“ wird **nie ans Modell geschickt**. | `webview/settings/pages/persoenlich.tsx:551–575` |

Fall aus dem Apify-Chat: Grok hat die Actors gewählt → Opus stieg ~15 Nachrichten später ohne Sitzung ein (B: Entscheidung außerhalb der 6k) → danach wechselten beide mit Sitzung hin und her (A: jeder sah nur seine eigenen Nachrichten).

---

## Schritt 1 — Verpasste Nachrichten nachreichen (behebt A)

- `SessionStore` merkt sich je Sitzung `gesehen` = Länge des Verlaufs nach ihrem letzten erfolgreichen Lauf. Wird mit `cortex.nativeSessions` gespeichert; `rewind()` setzt zurück.
- Orchestrator: Hat die Sitzung weniger gesehen als der Verlauf lang ist, stellt er die fehlenden Nachrichten voran („Inzwischen in diesem Chat, beantwortet von Grok 4.6: …“). Budget 8.000 Tokens; passt es nicht, gehen Notizzettel (Schritt 3) plus die jüngsten Nachrichten mit.
- Tests: `core/test/memory-gap.test.ts` spielt den Apify-Ablauf nach (Grok → Opus kalt → Grok → Opus warm) und prüft, dass Opus die Actor-Auswahl im Prompt hat.

## Schritt 2 — Bessere Kürzung (behebt B)

- Pro Nachricht **Anfang und Ende** behalten, Mitte kürzen.
- `cortex-widget`-Blöcke vor dem Kürzen in kompakten Text umwandeln (Titel, Spalten, Zeilen) statt rohes JSON abzuschneiden.
- Budget 6k → 12k gesamt, 1k → 2k pro Nachricht (kalte Einstiege sind selten, der Aufschlag ist klein).

## Schritt 3 — Notizzettel pro Chat

- Nach jeder Antwort im Hintergrund ein kurzer Aufruf über `askOffThread` (`chatViewProvider.ts:4079`) mit dem Helfermodell: alter Zettel + letzte Frage/Antwort → neuer Zettel, höchstens ~600 Tokens, Gliederung **Entscheidungen · Festlegungen · Offen · Verworfen**. Blockiert nie den Chat.
- Gespeichert im `ConversationRecord` (übersteht Neustart), vorher Geheimnisse schwärzen (TS-Fassung von `maskiere()`).
- Geht als Brief-Abschnitt `notizen` an jedes Modell; durch `briefDelta` nur, wenn er sich geändert hat. Unabhängig von `cortex.sendWorkspaceContext`.
- Wird mit dem Chat-Export nach `~/Cortex-Chats` geschrieben → landet so auch im Exocortex.

## Schritt 4 — Automatischer Exocortex-Abruf (behebt C, D)

- **Exokortex-Repo** (`~/dev/Exokortex`): `lesen.py --suche --json` mit bm25-Wert, Dokument-/Projekt-ID, Datum. Bestehende Textausgabe bleibt.
- Host ruft **vor** dem Lauf asynchron ab — je nach Einstellung bei erster Nachricht, bei Themenwechsel (geringe Wortüberschneidung mit Zettel und letzten Nachrichten) oder jeder Nachricht. Deckel 2,5 s, danach ohne Treffer weiter. Treffer aus demselben Chat werden ausgeschlossen.
- Suchbegriffe: lokal aus Frage + Zettel gebildet (kein Modellaufruf, keine Wartezeit); der Suchanfrage-Prompt wird nur genutzt, wenn eingeschaltet.
- Treffer über Mindestrelevanz gehen als Abschnitt `erinnerungen` mit Quelle und Datum in die Nachricht (nicht in den Systemprompt → Anbieter-Cache bleibt heil).
- Zusätzlich im Provider-Brief eine Zeile: bei Bezug auf Früheres selbst `suche` nutzen.
- Anzeige: unter der Antwort ein Hinweis „3 Erinnerungen genutzt“, aufklappbar, ✕ schließt einen Treffer für diesen Chat aus. Gestaltung nach Codex-Vorgaben (Chip-Maße aus `media/cortex.css`).

## Schritt 5 — Einstellungen „Erinnerung“ (Persönlich → Personalisierung, ersetzt den Vorschau-Abschnitt)

| Zeile | Steuerung | Schlüssel | Vorgabe |
|---|---|---|---|
| Notizzettel pro Chat | Toggle | `cortex.memory.notes` | an |
| Exocortex-Abruf | Select: nie · erste Nachricht · bei Themenwechsel · jede Nachricht | `cortex.memory.retrieval` | bei Themenwechsel |
| Treffer | Zahl 1–10 | `cortex.memory.hits` | 5 |
| Token-Budget für Erinnerungen | Zahl 300–4000 | `cortex.memory.budget` | 1500 |
| Mindestrelevanz | Select: locker · normal · streng | `cortex.memory.threshold` | normal |
| Helfermodell | Select aus verbundenen Konten | `cortex.memory.helper` | günstigstes verfügbares |
| Prompt: Notizzettel | Textfeld + Speichern + Zurücksetzen | `memory.prompt.notes` | Vorgabetext |
| Prompt: Suchanfrage | dito | `memory.prompt.query` | Vorgabetext |
| Prompt: Einbettung | dito | `memory.prompt.inject` | Vorgabetext |
| Prompt: Speichern | dito | `memory.prompt.store` | Vorgabetext |

- Zeilen/Abschnitte mit `Row`, `Toggle`, `Select`, `TextField type=number` aus `webview/settings/ui.tsx`; Prompt-Felder nach dem Muster von „Cortex-Anweisungen“ (Speichern im Abschnittskopf, dazu Zurücksetzen).
- Schlüssel in `package.json` + `NATIVE_SETTINGS`; Host liest sie bei jedem Lauf (nicht einmalig beim Start).
- `docs/CORTEX_DESIGN.md`: „Erinnerung“ von Vorgemerkt nach Wirksam; `tests/cortex_settings_ui.py` um die neuen Zeilen erweitern.

## Schritt 6 — Zurückschreiben (E)

- „Merk dir …“ im Chat → Eintrag in `~/Cortex-Chats/Erinnerungen/merkliste.md` (geschwärzt) → `chats.py` nimmt ihn spätestens nach einer Stunde auf. Kein Eingriff in den Exocortex-Kern nötig.
- Optional später: `chats.py --jetzt` direkt nach einem Merken anstoßen.

---

## Reihenfolge

1 → 2 → 3 (behebt das Apify-Problem vollständig) → 4 → 5 → 6. Nach jedem Schritt Tests grün, erst dann weiter.

## Nebenbefunde (nicht Teil dieses Plans)

- „Cortex-Anweisungen“ in den Einstellungen wird nicht ans Modell geschickt.
- Der Apify-Token steht im Klartext im Chat → bei Apify neu erzeugen; prüfen, ob `maskiere()` das Format `apify_api_…` erkennt.
