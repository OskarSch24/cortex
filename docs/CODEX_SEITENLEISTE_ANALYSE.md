# Codex: rechte Seitenleiste – Verhaltensanalyse

Quelle: Bildschirmaufnahme 2026-09-22 um 12.46.35.mov (76,7 s, 60 fps, 3420×2224 px = 1710×1112 pt Retina).
Ausgewertet in Einzelbildern: Kontaktbögen mit 1 Bild/s, 60-fps-Zeitlupe an allen Übergängen, Kantenverfolgung pro Bild für die Animationskurven.
Standbilder liegen unter `docs/screenshots/codex-seitenleiste/`.

Maße in pt (= px/2). Farben sind aus dem Video abgetastet und können um ±2 abweichen.

---

## 1. Zeitleiste der Aufnahme

| Zeit | Was passiert |
|---|---|
| 0,0–2,3 s | Seitenleiste zu. Rechts oben im Chat schwebt die Übersichtskarte (Ausgaben / Subagenten / Quellen). Zeiger fährt zum rechten Umschalter oben rechts. |
| 2,4–2,8 s | Klick → Seitenleiste fährt rechts herein, öffnet mit dem Tab **Subagenten**. |
| 3,5–4,4 s | Zeiger auf die Trennlinie → Größenänderungs-Zeiger. |
| 4,4–6,5 s | Trennlinie nach links gezogen: Leiste wird sehr breit, Chat schmal. |
| 6,5–7,6 s | Zurück nach rechts gezogen bis unter die Mindestbreite. |
| 7,6–7,95 s | Leiste **rastet zu** (schließt sich selbst). |
| 9,7–11,1 s | Wieder geöffnet und erneut breiter gezogen. |
| 12–15 s | **+**-Menü neben den Tabs geöffnet, Einträge durchgefahren. |
| 16 s | „Dateien" gewählt → neuer Tab **Datei öffnen** mit Dateibaum. |
| 18,0–19,3 s | Trennlinie ganz nach links gezogen → Chat erreicht Mindestbreite → Leiste **springt in den Vollbildmodus**. |
| 23 s | `AGENTS.md` im Baum geklickt → Datei öffnet in neuem Tab, Markdown gerendert. |
| 30,3 s | Tooltip „Seitenleiste ein-/ausblenden ⌥⌘B" am Umschalter. |
| 31,0 s | Klick → Leiste zu (aus dem Vollbild direkt geschlossen). |
| 32,2–33 s | Wieder auf → kommt **geteilt**, nicht mehr im Vollbild, Tab AGENTS.md aktiv. |
| 41–42 s | Tab Subagenten, Zeile „Standalone host audit" angeklickt → Detailansicht des Subagenten. |
| 45–47 s | In der Detailansicht gescrollt. |
| 48 s | Zurück-Pfeil → Liste. 49 s „Agent reasoning ui test", 51,5 s zurück, 52,9 s „Automation runtime". |
| 55,5 s | Tooltip „Vollbildmodus aktivieren". 55,8 s Klick → Vollbild. |
| 58,4 s | Erneuter Klick → Vollbild aus. |
| 60–63 s | Tab AGENTS.md, Tooltip „In Default app öffnen", Vollbild an (61,5 s) und aus (63,4 s). |
| 66–71 s | Menü am Knopf **Öffnen** aufgeklappt, alle Einträge überfahren. |
| 72,5 s | Tooltip ⌥⌘B, Klick → Leiste zu, Übersichtskarte blendet wieder ein. |
| ab 74 s | macOS-Kontrollzentrum (Aufnahme beenden) – nicht Teil von Codex. |

---

## 2. Aufbau

### 2.1 Gesamtlayout
- Drei Spalten: linke Navigation (240 pt, `#222222`, 1-pt-Kante `#313131`) | Chat (`#141414`) | rechte Seitenleiste (`#141414`, gleiche Farbe wie der Chat).
- Chat und Seitenleiste sind nur durch eine **1-pt-Linie** getrennt, kein Farbwechsel, kein Schatten.
- Fensterkopf 0–38 pt schwarz (macOS-Titelleiste), darunter die Kopfzeilen der Spalten auf ~61 pt Mitte.

### 2.2 Kopfzeile, wenn die Leiste **zu** ist
Im Chat-Kopf rechts: `…` · `Teilen` · Listen-Symbol (Übersichtskarte an/aus, aktiv mit dunkler Pille) · **unteres Panel** · **rechte Seitenleiste**.

### 2.3 Kopfzeile, wenn die Leiste **offen** ist
- Der Chat-Kopf behält `…` · `Teilen` · Listen-Symbol. Titel wird bei Platzmangel mit Auslassung gekürzt („Codex-Vorlagen pixelgenau übernehme…").
- Die Fenster-Symbole wandern in den Kopf der Seitenleiste, rechtsbündig: **Vollbild** (⤢) · **unteres Panel** · **Seitenleiste** (aktiv, Pille).
- Links im Seitenleisten-Kopf: die **Tabs**, danach ein **+**.

### 2.4 Tabs
- Tab = Symbol + Name, aktiver Tab mit hellerer Pille und ×. Inaktive Tabs ohne ×.
- Lange Namen werden gekürzt („AGENTS."), vermutlich mit Tooltip.
- Beobachtet: Öffnet man aus dem Tab „Datei öffnen" eine Datei, entsteht ein neuer Tab für die Datei; der „Datei öffnen"-Tab schrumpft zu einem reinen Symbol. Nach Schließen und Wiederöffnen der Leiste ist er weg, es bleiben „Subagenten | AGENTS.md".

### 2.5 +-Menü (neuer Tab)
Popover direkt unter dem +, Hintergrund `#232323`, Hover-Zeile `#333333`, abgerundet, Kürzel rechts in Grau:

| Eintrag | Symbol | Kürzel |
|---|---|---|
| Dateien | Ordner/Dokumente | ⌘P |
| Seiten-Chat | Kreis mit + | ⌥⌘S |
| Browser | Globus | ⌘T |
| Terminal | Terminal-Kasten | ⌃` |

---

## 3. Öffnen, Schließen, Breite

### 3.1 Umschalter
- Knopf ganz rechts oben, Tooltip **„Seitenleiste ein-/ausblenden"** mit Kürzel-Chip **⌥⌘B** (Chip dunkelgrau, abgerundet).
- Tooltip erscheint unterhalb des Knopfs, rechtsbündig, nach kurzer Verzögerung (~0,5 s Stillstand).

### 3.2 Animation beim Öffnen (gemessen)
- Dauer **≈ 0,40 s** (2,42 → 2,82 s), davon 80 % der Strecke in den ersten 0,25 s → **ease-out** (etwa `cubic-bezier(0.2, 0.8, 0.2, 1)`).
- Die Leiste **schiebt** den Chat, sie legt sich nicht darüber. Der Chatinhalt wandert synchron nach links und bricht neu um.
- Der Leisteninhalt ist beim Hereinfahren bereits fertig gerendert und wird von der Kante abgeschnitten (kein Stauchen, kein Einblenden).
- Die Übersichtskarte im Chat blendet beim Öffnen aus (Deckkraft, ~0,15 s), sobald nicht mehr genug Platz ist.

### 3.3 Schließen
- Per Knopf aus dem geteilten Zustand: gleiche Bewegung rückwärts.
- Aus dem **Vollbild** per Knopf: **harter Schnitt** in einem Bild (30,6 → 31,0 s), danach blendet die Übersichtskarte weich ein.
- Die Leiste merkt sich Tabs und aktiven Tab, **nicht** den Vollbildzustand: wieder geöffnet kommt sie geteilt.

### 3.4 Breite ziehen
- Greiffläche ist die 1-pt-Trennlinie (Trefferzone breiter). Zeiger wird zum Spalten-Zeiger ◁|▷.
- Kein sichtbarer Griff, keine Hervorhebung der Linie.
- Die Breite folgt dem Zeiger 1:1 ohne Verzögerung.
- **Standard- und Mindestbreite der Leiste ≈ 315–320 pt.**
- **Zieht man unter die Mindestbreite → Leiste rastet zu**, animiert in ~0,3 s (7,62 → 7,95 s). Der Inhalt wird dabei abgeschnitten, der Tab-Kopf schiebt sich kurz übereinander.
- **Mindestbreite Chat ≈ 300 pt.** Zieht man weiter nach links → Leiste **springt in den Vollbildmodus** (19,2 → 19,3 s: Chat verschwindet in einem Bild, Inhalt der Leiste ordnet sich in ~0,15 s neu).
- Der Chatinhalt ist in der Breite begrenzt und zentriert; bei breitem Chat entsteht Rand links und rechts.

### 3.5 Übersichtskarte (Ausgaben / Subagenten / Quellen)
- Schwebt oben rechts im Chat, `#1e1e1e`-Karte, runde Ecken (~12 pt), ~350 pt breit.
- Abschnitte: **Ausgaben** (+, Leertext „Datei oder Website erstellen" bzw. Einträge wie `preview.html`), **Subagenten** (vier kleine Agenten-Symbole + „15 fertig"), **Quellen** (+, Bildschirmfoto, Websuche, „Alle anzeigen").
- Sichtbar nur, wenn der Chat breit genug ist; bei offener Leiste mit wenig Platz blendet sie aus, beim Schmalerziehen der Leiste blendet sie wieder ein (7,15 s: halbtransparent sichtbar).
- Der Inhalt passte sich im Video der Scrollstelle an (am Ende „preview.html" und „14 fertig" statt „15 fertig"). Die Karte zeigt also vermutlich den Stand des sichtbaren Abschnitts.

---

## 4. Vollbildmodus

### Aktivieren
1. Knopf ⤢ im Seitenleisten-Kopf, Tooltip **„Vollbildmodus aktivieren"** (ohne Kürzel), oder
2. Trennlinie über die Chat-Mindestbreite hinaus nach links ziehen.

### Aussehen
- Chat-Spalte verschwindet komplett (harter Schnitt), die Leiste füllt alles rechts der linken Navigation.
- Das Symbol wechselt zu ⤡ (Pfeile nach innen).
- Die linke Navigation bleibt sichtbar.
- **Der Chat-Eingabebereich schwebt** unten mittig über dem Leisteninhalt (~720 pt breit): Zeile „21m 17s lang gearbeitet ›", Hinweisbox, darunter die Eingabe mit +, Modellwahl, Mikrofon, Sprachknopf. Der Inhalt darunter scrollt hinter dem Eingabebereich durch.
- Tabs, Dateibaum und Kopf behalten ihre Position; nur der Inhaltsbereich wird breiter.

### Deaktivieren
- Knopf ⤡ erneut → zurück zur vorherigen geteilten Breite (58,4 s: Chat erscheint in einem Bild, Inhalt ordnet sich in ~0,2 s neu).
- Oder die Leiste ganz schließen (⌥⌘B); beim Wiederöffnen ist das Vollbild aus.

---

## 5. Subagenten

### 5.1 Liste (Tab „Subagenten")
- Abschnitt **„Aktiv · 0"** mit Leertext „Keine aktiven Subagenten".
- Abschnitt **„Fertig · 15"**: 10 Zeilen sichtbar, darunter „5 weitere anzeigen" (eingerückt, grau).
- Zeile: Agenten-Symbol (20 pt) · Name · rechts grau die relative Zeit „vor 3 Tag(e)".
- **Agenten-Symbole:** jede Rolle hat ein eigenes geometrisches Emblem mit eigener Farbe (grüner Stern, türkise Sanduhr, grüner Kreis, orangefarbene Blume, violettes Raster, violette Raute). Dieselben Symbole erscheinen in der Übersichtskarte und im Chatverlauf.
- Hover: ganze Zeile leicht aufgehellt, Zeiger bleibt Pfeil.
- Nach Rückkehr in die Liste standen einmal 11 Einträge mit „4 weitere anzeigen" da (48 s) – die Liste lädt nach.

### 5.2 Detailansicht
- Klick auf eine Zeile → **harter Wechsel in einem Bild**, keine Schiebeanimation. Ansicht bleibt im selben Tab.
- Kopfzeile: ← Zurück · Agenten-Symbol · Name · rechts grau das Modell „GPT-6 Astra · Ultra".
- Inhalt = vollständiges Protokoll des Subagenten, ans Ende gescrollt:
  - Arbeitsdauer („9m 29s lang gearbeitet ›"), Antworttext als Markdown mit Code-Chips.
  - Änderungskarten („10 Dateien bearbeitet +415 −282", Rückgängig machen, Überprüfen, Dateiliste, „7 weitere Dateien anzeigen").
  - Zeitstempel mit Kopieren- und Verzweigen-Symbol („Samstag, 17:59").
  - Ereigniszeilen mit Symbol: „bash … ausgeführt", „Nachricht an übergeordneten Agenten gesendet", „Datei bearbeitet, hat einen Befehl ausgeführt", „Hat Befehle ausgeführt".
  - Hinweise wie „Du hast dein Limit erreicht …" zentriert mit Info-Symbol.
- Scrollen mit normalem macOS-Nachlauf.
- ← Zurück → harter Wechsel zurück zur Liste.

### 5.3 Verbindung zum Chat
Im Hauptchat erscheinen Zeilen wie „✳ Standalone host audit hat die Arbeit beendet" mit demselben Symbol. Der Chat scrollte in 43,7–43,95 s weich (~0,25 s) an diese Stelle, kurz bevor die Detailansicht geöffnet wurde; ob das automatisch oder vom Nutzer kam, lässt sich im Video nicht sicher trennen.

---

## 6. Dateien

### 6.1 Tab „Datei öffnen"
- Kopfzeile mit Pfad „/" links und einem Symbolknopf rechts.
- Rechts ein **Dateibaum** (~240 pt, abgetrennt durch 1-pt-Linie) mit Suchfeld „Dateien filtern…" (Fokus beim Öffnen), Ordner mit Pfeil ›, Dateien mit Typ-Symbol (`.gitignore` rotes Git-Symbol, `.md` grünes „M↓").
- Links Leerzustand mittig: Symbol, „Datei öffnen", „Wähle eine Datei im Workspace-Baum aus".
- Zeile im Baum beim Klick: blaue 1-pt-Umrandung mit dunkler Füllung (Fokus), danach helle Auswahl-Pille.

### 6.2 Dateiansicht
- Brotkrumen „Kortex › AGENTS.md".
- Rechts: **Quelle anzeigen** (Umschalten gerendert/Quelltext) · Kopieren-Symbol · Splitknopf **Öffnen** mit App-Symbol und ⌄.
- Tooltip am Öffnen-Knopf: „In Default app öffnen".
- Menü „Öffnen" (Popover rechtsbündig unter dem Knopf):
  - Default app · Terminal · Xcode (je mit App-Symbol)
  - Trennlinie
  - Im Ordner öffnen · Speichern unter…
- Markdown gerendert: H1, H2, Listen, Inline-Code in Monospace, Tabellen. Kopieren-Symbol oben rechts im Dokument.

---

## 7. Zeiger und Hover

| Stelle | Zeiger | Rückmeldung |
|---|---|---|
| Trennlinie Chat/Leiste | ◁\|▷ Spalten-Zeiger | keine Linienhervorhebung |
| Symbolknöpfe im Kopf | Pfeil | runde dunkle Pille als Hover, Tooltip nach ~0,5 s |
| Menüzeilen | Pfeil | `#333333` Zeilenhintergrund |
| Listenzeilen (Subagenten, Baum) | Pfeil | leicht aufgehellte Zeile |
| Markdown-Text | I-Balken | – |

Tooltips: dunkle Pille (`#131313`), weiße Schrift ~12 pt, optional Kürzel-Chip rechts. Sie erscheinen unter dem Knopf und rücken so ein, dass sie im Fenster bleiben.

---

## 8. Animationen im Überblick

| Vorgang | Art | Dauer |
|---|---|---|
| Leiste öffnen / schließen per Knopf | Breite, schiebt Chat, ease-out | ~0,40 s |
| Einrasten beim Zuziehen | Breite auf 0, ease-out | ~0,30 s |
| Vollbild an/aus | Chat hart weg/da, Inhalt ordnet sich neu | Schnitt + ~0,15–0,25 s |
| Schließen aus Vollbild | harter Schnitt | 1 Bild |
| Übersichtskarte ein/aus | Deckkraft | ~0,15–0,3 s |
| Subagent öffnen / zurück | harter Wechsel | 1 Bild |
| Menüs, Tooltips | sofort bzw. sehr kurzes Einblenden | < 0,1 s |
| Breite ziehen | folgt dem Zeiger ohne Animation | – |

---

## 9. Folgerungen für Cortex

> Umgesetzt am 22.09.2026 — siehe `docs/CORTEX_PANE_WIDTHS.md` › „Einrasten und Bewegung nach Codex“. Offen: Seiten-Chat (⌥⌘S) gibt es in Cortex noch nicht; Agenten-Zeichen bleiben grau statt bunt (Designregel „wenige Farben“).

1. Rechte Leiste als **schiebende Spalte** mit gleicher Hintergrundfarbe wie der Chat, 1-pt-Trenner.
2. Drei Zustände: **zu**, **geteilt** (Breite ziehbar, gemerkt), **Vollbild**. Ziehen unter die Mindestbreite schließt, Ziehen über die Chat-Mindestbreite geht ins Vollbild.
3. Fenster-Symbole (Vollbild, unteres Panel, Leiste) wandern mit in den Leisten-Kopf.
4. Im Vollbild schwebt der Chat-Eingabebereich unten mittig über der Leiste.
5. Tabs mit +-Menü (Dateien ⌘P, Seiten-Chat ⌥⌘S, Browser ⌘T, Terminal ⌃`), Kürzel ⌥⌘B für die Leiste.
6. Subagenten-Tab: Aktiv/Fertig, eigenes Emblem pro Rolle, Drill-down ohne Animation mit Zurück-Pfeil und Modellangabe.
7. Dateiansicht mit Quelle anzeigen, Kopieren und Öffnen-Menü (Default app, Terminal, Xcode, Im Ordner öffnen, Speichern unter…).
8. Die schwebende Übersichtskarte blendet sich bei Platzmangel selbst aus.

Abzugleichen mit `docs/CORTEX_PANE_WIDTHS.md`: Dort gilt bisher „mindestens 300 px für den Chat". Codex nutzt ~300 pt (= 600 px Retina) für den Chat und ~315 pt Mindestbreite für die Leiste, und kennt das Einrasten nach zu bzw. nach Vollbild.
