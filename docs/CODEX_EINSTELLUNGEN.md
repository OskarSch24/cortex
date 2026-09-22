# Codex-Einstellungen – Informationsbaum

Quelle: Bildschirmaufnahme vom 13.09.2026, 03:22 (7:50 min, ChatGPT-Desktop-App, Codex-Bereich, Dunkelmodus, Deutsch).
Ausgewertet: alle Frames (2 pro Sekunde) per Texterkennung, Schlüsselbilder jeder Seite und Unterseite visuell geprüft.
Nicht enthalten: **Pets** (auf Wunsch ausgelassen). Die Inhalte des eigenen Anweisungsfelds unter *Personalisierung* sind absichtlich nicht übernommen.

Legende für Steuerelemente:
`[Button]` · `(Toggle an/aus)` · `⌄ Dropdown „Wert“` · `‹Segment A | B›` (fett = aktiv) · `☐ Eingabefeld` · `◉/○ Radio` · `›` öffnet Unterseite

Wiederkehrendes Zeilenmuster: **Titel** (weiß, halbfett) + grauer Untertitel links, Steuerelement rechts. Zeilen sind in abgerundeten Karten gruppiert, zwischen den Zeilen feine Trennlinien, über jeder Karte eine Abschnittsüberschrift.

---

## 0 · Einstieg und Rahmen

- **Einstieg im Video (0:00–0:20):** In der App-Seitenleiste wird ein Chat per Hover-Icon archiviert. Danach erscheint der Toast `Chat archiviert [Anzeigen] [Rückgängig] [×]`, und über **Anzeigen** öffnen sich die Einstellungen auf *Archivierte Chats*.
  - Profil unten links in der App (Avatar „PU“) ist der normale Einstieg; Kürzel `⌘,`.
- **Einstellungs-Seitenleiste** (ersetzt die App-Seitenleiste, gleiche Breite, transluzent)
  - `← Zurück zur App`
  - ☐ „Einstellungen durchsuchen…“
  - **Persönlich:** Allgemein · Importieren · Profil · Darstellung · Stimme · Konfiguration · Personalisierung · Pets · Tastaturkürzel · Nutzung und Abrechnung · Analysen · Konto ↗ (externer Link, im Video nicht geöffnet)
  - **Integrationen:** Computernutzung · Computerverlauf · Appshots · Plugins · Browser
  - **Programmierung:** Hooks · Verbindungen · Git · Umgebungen · Worktrees
  - **Archiviert:** Archivierte Chats
  - Jeder Eintrag hat ein Icon; der aktive Eintrag bekommt eine hellere, abgerundete Fläche.
- **Inhaltsbereich:** zentrierte Spalte (~768 px), großer Seitentitel und bei manchen Seiten ein grauer Untertitel.
- **Unterseiten** zeigen oben eine Breadcrumb-Leiste: `← →  Einstellungen › Browser › …`

---

## 1 · Persönlich

### 1.1 Allgemein
- **Berechtigungen**
  - Standardberechtigungen – „Standardmäßig kann ChatGPT Dateien in seinem Workspace lesen und bearbeiten. Bei Bedarf kann es zusätzlichen Zugriff anfordern.“ `(Toggle an, gedimmt)`
  - Vollzugriff – Warntext zu Datenverlust, Datenlecks und unerwartetem Verhalten, Link „Mehr erfahren“ `(Toggle an)`
- **Allgemein**
  - Ordner für Aufgaben ohne Projekt – Pfad in Monospace `/Users/demo/Documents/Codex` `[Ändern]`
  - Standardziel zum Öffnen von Dateien – `⌄ „Default app“` (mit App-Icon)
  - Sprache – Sprache der App-Oberfläche `⌄ „Automatisch erkennen“`
  - In Menüleiste anzeigen – bleibt in der macOS-Menüleiste, wenn das Hauptfenster zu ist `(an)`
  - Untere Leiste – Steuerelement für das untere Bedienfeld in der App-Kopfzeile `(an)`
  - Standard-Terminalspeicherort – wo Terminal-Kurzbefehl und Umgebungsaktionen Tabs öffnen `‹**Unten** | Rechts›`
  - Energiesparmodus während der Ausführung verhindern `(aus)`
  - Geschwindigkeit – für Chats, Subagenten und Komprimierung `⌄ „Schnell“`
  - Open-Source-Lizenzen – Hinweise Dritter `[Anzeigen]`
  - Plugins – Zulassen, dass ChatGPT installierte Plugins verwendet `(an)`
- **Composer**
  - Nur-Text-Composer – Code, Markdown und Links als reinen Text beibehalten `(aus)`
  - Nutzung des Kontextfensters anzeigen (ohne Untertitel) `(aus)`
  - Tastenkürzel zum Senden – `⌄ „Enter“`
  - Verhalten bei Folgenachrichten – Warteschlange oder aktuellen Durchlauf steuern; „Drücke ⌘⏎, um das Verhalten für eine Nachricht umzukehren.“ `‹**In Warteschlange stellen** | Steuern›`
- **Popout-Fenster**
  - Tastenkürzel für Popout-Fenster – global; unbelegt heißt aus. Anzeige „Aus“ + Stift-Icon
  - Standardmäßig eigenständigen Chat verwenden – neue Chats außerhalb von Projekten starten `(aus)`
- **Benachrichtigungen**
  - Benachrichtigungen bei Completions – `⌄ „Nur wenn Codex nicht aktiv ist“`
  - Berechtigungsbenachrichtigungen aktivieren `(an)`
  - Benachrichtigungen für Fragen aktivieren – wenn eine Eingabe nötig ist `(an)`
- **Spielereien**
  - Konfettikanone – „Lass Codex in der App auf Wunsch Konfetti abfeuern!“ `(aus)`
  - Audio-Visualisierung – Gesprächsleisten mit Systemaudio animieren; lokal verarbeitet, nie gespeichert `(aus)`

### 1.2 Importieren
- Untertitel: „Einstellungen, Projekte und Chats aus anderen KI-Apps in ChatGPT übernehmen“
- **Automatische Synchronisierung**
  - Importe synchron halten – „Synchronisierung pausiert. Deine Inhaltsauswahl ist gespeichert.“ `(aus)`
  - Zu synchronisierende Inhalte – „Nach dem ersten Import verfügbar“ `[Anpassen]` (deaktiviert)
- **Aus einer anderen KI-App importieren**
  - Ladezustand: „Suche nach Importen – Kompatible Setups, Projekte und letzte Chats werden gesucht“ + Spinner
  - Danach Untertitel „Erkanntes Setup, das zu ChatGPT hinzugefügt werden kann“
    - Claude Code (orange App-Kachel) `[Importieren]`
    - Claude Cowork (orange App-Kachel) `[Importieren]`
    - Warnzeile (i): „9 Projekte können nicht importiert werden“ mit Namensliste „… verwenden eine nicht unterstützte Projektkonfiguration“
- **Aufmerksamkeit erforderlich** – „Einrichtung von Elementen aus einem früheren Import abschließen“
  - Chip „Plugins (3)“; Ladezustand „Importierte Plugins werden geladen…“
  - Figma (Spinner) · Notion `[Installieren]` · Supabase `[Installieren]`, jeweils mit Icon und Kurzbeschreibung

### 1.3 Profil
- Eigene Kopfleiste: links „Profil“; rechts `Freund:in einladen` · `Teilen` · `🔒 Privat` (gedimmt) · `✎ Bearbeiten`
- Avatar-Kreis mit Initialen, Anzeigename, `@Handle · Pro` (Plan-Chip)
- Kennzahlenleiste mit 5 Feldern: Token insgesamt · Spitzenwert der … · Längster Chat · Aktuelle Serie · Längste Serie
- **Tokennutzung:** Heatmap (7 Zeilen × ~52 Wochen, Okt–Sep, Blautöne) `‹**Täglich** | Wöchentlich | Kumuliert›`
- **Aktivitätseinblicke** (links): Schnellmodus % · Meistgenutzter Denkaufwand („Max. · 54 %“) · Entdeckte Skills · Insgesamt genutzte Skills · Chats insgesamt
- **Meistgenutzte Plugins** (rechts): Icon + Name (@pdf, $browse, @browser, $cso, $openai-docs) + „N Ausführungen“

### 1.4 Darstellung
- **Design:** 3 Vorschaukacheln `System` (hell/dunkel geteilt, ausgewählt mit Rahmen) · `Hell` · `Dunkel`
- Live-Codevorschau als Diff (rot/grün, zweispaltig): `themePreview: ThemeConfig` mit surface / accent / contrast
- **Karte „Helles Design“** – Kopf: `[Importieren]` `[Design kopieren]` `[Aa]` `⌄ „Codex“` (Themenvorlage)
  - Akzent `⌄ „Schwarz“`
  - Hintergrund – Farbfeld `○ #FFFFFF`
  - Vordergrund – Farbfeld `○ #1A1C1F`
  - UI-Schriftart `⌄ „Systemstandard“` + `⌄ „Normal“` (Schriftstärke, gedimmt)
  - Inhaltsschriftart `⌄ „Wie UI-Schriftart“` + `⌄ „Normal“`
  - Code-Schriftart `⌄ „Systemstandard“` + `⌄ „Normal“`
  - Transparente Seitenleiste `(an)`
  - Kontrast – Slider mit Zahlenwert (45)
- **Karte „Dunkles Design“** – identisch aufgebaut; Akzent „Weiß“, Hintergrund #181818, Vordergrund #FFFFFF, Kontrast 60
- **Einstellungen**
  - Zeiger-Cursor verwenden – Zeiger über interaktiven Elementen `(aus)`
  - Dock-Symbol – 2 Icon-Kacheln (ChatGPT | Codex, ausgewählt mit Rahmen)
  - Bewegung reduzieren `‹**System** | Ein | Aus›`
  - UI-Schriftgröße `☐ 14` px
  - Code-Schriftgröße – für Code in Chats und Diffs `☐ 12` px
  - Markierungen für Unterschiede – Farben oder +/- `‹**Farbe** | +/-›`
  - Schriftglättung – native macOS-Schriftglättung `(an)`

### 1.5 Stimme
- **Allgemein**
  - Mikrofon – „Für Sprachchat und Diktat verwendet“ `⌄ „Systemstandard“`
- **Sprachchat**
  - Stimme – Stimme für neue Sprachchats; Chip mit farbigem Punkt „Vale“
  - Tastenkürzel für Sprachchat – aus jeder Desktop-App starten; „Aus“ + Stift
  - Bildschirmkontext – Codex darf die Vordergrund-App prüfen, macOS fragt beim ersten Mal nach Zugriff `(an)`
- **Diktat**
  - Tastenkürzel für Diktieren durch Halten – „Aus“ + Stift
  - Hotkey für Diktat umschalten – „Aus“ + Stift
  - Karte **Diktierwörterbuch** – „Wörter oder Ausdrücke, die die Diktierfunktion erkennen soll“ `[+ Eintrag hinzufügen]`; Eingabezeile ☐ Platzhalter „Jane Doe“ + Papierkorb
  - Karte **Zuletzt verwendete Aufnahmen** – „Deine letzten 20 Aufnahmen sind auf diesem Gerät gespeichert“
    - Eintrag: einzeiliges Transkript (mit … gekürzt) + Datum („13. Sept., 1:20“), rechts Kopieren-Icon und `···`
    - Fehlerfall: „Aufnahme gespeichert“ bzw. „Aufnahme abgebrochen“ `[Erneut versuchen]` `···`

### 1.6 Konfiguration
- Untertitel: „Konfiguriere Berechtigungen, Webzugriff und Antworten der Agenten für neue Chats“ + Link „Mehr erfahren“
- **Standardeinstellungen des Agenten**
  - Pill-Dropdown `⌄ „Benutzerkonfiguration“`, Menü: Globale Konfiguration (grau) · Benutzerkonfiguration ✓ · Admin-Konfiguration; rechts Link `config.toml öffnen ↗`
  - Genehmigungsrichtlinie `⌄ „Auf Anfrage“`
  - Sandbox-Einstellungen `⌄ „Nur lesen“`
  - Websuche `⌄ „Im Cache“`
  - Detailgrad der Ausgabe `⌄ „Modellstandard“`
  - Reasoning-Zusammenfassung `⌄ „Auto“`
- **Modellfunktionen**
  - Verfügbare Reasoning-Stufen – Mehrfachauswahl `⌄ „5 ausgewählt“`
  - Ultra im Modell-Auswahlregler – Ultra als höchste Stufe `(an)`
- **Workspace-Abhängigkeiten**
  - Codex-Abhängigkeiten – mitgelieferte Node.js- und Python-Tools `(an)`
  - Probleme in Codex Workspace diagnostizieren `[🔍 Diagnose]`
  - Workspace zurücksetzen und installieren `[⬇ Neu installieren]` (rot)
  - Fußzeilen: „Aktuelle Version: Nicht installiert“ · „Diagnose durchführen oder neu installieren, wenn Tool-Aufrufe fehlschlagen“

### 1.7 Personalisierung
- **Codex-Anweisungen** – „Gib Codex zusätzliche Anweisungen und Kontext für alle Chats. Repository-Anweisungen können ebenfalls gelten. Mehr erfahren“; `[Speichern]` oben rechts (gedimmt, bis sich etwas ändert)
  - Großes mehrzeiliges Textfeld mit Scrollbar und Resize-Griff (Inhalt nicht übernommen)
- **Codex-Erinnerung** – „Lege fest, wie Codex Erinnerungen auf diesem Computer verwaltet. Mehr erfahren“
  - Lokale Erinnerungen aktivieren `(an)`
  - Lokale Erinnerungserstellung aus toolgestützten Chats zulassen – MCP-Tools oder Websuche `(an)`
  - Lokale Erinnerungen löschen `[Löschen]` (rot)

### 1.8 Pets – *ausgelassen*

### 1.9 Tastaturkürzel
- ☐ „Tastenkürzel suchen“ mit Icon-Button rechts im Feld; bleibt beim Scrollen oben kleben
- Eine lange Karte mit einer Zeile pro Befehl: Titel + Beschreibung | Tasten-Chip(s) + Stift | Papierkorb pro Chip
  - Mehrere Belegungen stehen als Chips untereinander.
  - Unbelegt: „Nicht zugewiesen“ + Stift, ohne Papierkorb (hier kurz **NZ**).
  - Sonderfall „Weblink im Standardbrowser öffnen“: Dropdown „Nicht zugewiesen ⌄“ (Modifier-Taste).

| # | Befehl | Beschreibung | Belegung |
|---|---|---|---|
| 1 | Neuer Chat | Neuen Chat starten | ⌘N · ⇧⌘O |
| 2 | Neuer temporärer Chat | Einen Chat starten, der nicht im Verlauf erscheint | ⇧⌘N |
| 3 | Quick Chat | Einen einfachen Chat im Schnell-Composer starten | ⌥⌘N |
| 4 | Chat archivieren | Aktuellen Chat archivieren | ⇧⌘A |
| 5 | Neuer eigenständiger Chat | Neuen Chat außerhalb eines Projekts starten | ⌥⌘O |
| 6 | Seitenchat öffnen | Aktuellen Chat in einem Seiten-Chat öffnen | ⌥⌘S |
| 7 | Als ungelesen markieren | Aktuellen Chat als ungelesen markieren | ⇧⌘U |
| 8 | In neuem Fenster öffnen | Aktuellen Chat in neuem Fenster öffnen | NZ |
| 9 | Anpinnen ein-/ausschalten | Aktuellen Chat anpinnen oder nicht mehr anpinnen | ⌥⌘P |
| 10 | Browser-Adressleiste fokussieren | Adressleiste des In-App-Browsers fokussieren | ⌘L |
| 11 | Hauptchat fokussieren | Tastaturfokus in das Eingabefeld des Hauptchats verschieben | NZ |
| 12 | Seiten-Chat fokussieren | Tastaturfokus in ein geöffnetes Eingabefeld des Seiten-Chats verschieben | NZ |
| 13 | Gehe zu Zeile | Zu einer Zeile in der aktuellen Datei springen | ⌘L |
| 14 | Zurück | Im Navigationsverlauf zurückgehen | ⌘[ · Mouse Back |
| 15 | Vorwärts | Im Navigationsverlauf vorwärtsgehen | ⌘] · Mouse Forward |
| 16 | Zum nächsten kürzlich angesehenen Chat | … wechseln | ⌃Tab |
| 17 | Zum nächsten Tab | Zum nächsten Tab wechseln | ⌃Tab · ⇧⌘] · ⌥⌘Right |
| 18 | Nächster Chat | Zum nächsten Chat wechseln | ⇧⌘] · ⌥⌘Right |
| 19 | Nächster Chat mit Handlungsbedarf | … der auf Eingabe wartet oder ungelesene Aktivitäten aufweist | ⌥⌘A |
| 20 | Vorheriger zuletzt angesehener Chat | Zum vorherigen kürzlich angesehenen Chat wechseln | ⌃⇧Tab |
| 21 | Vorheriger Tab | Zum vorherigen Tab wechseln | ⌃⇧Tab · ⇧⌘[ · ⌥⌘Left |
| 22 | Vorheriger Chat | Zum vorherigen Chat wechseln | ⇧⌘[ · ⌥⌘Left |
| 23–28 | Zum 1.–6. zuletzt aktualisierten Chat wechseln | Den zuletzt aktualisierten Chat in diesem Shortcut-Slot öffnen | ⌥⌘1 … ⌥⌘6 |
| 29 | Chat wechseln… | Chat suchen und dorthin wechseln | NZ |
| 30 | Zu Chat wechseln | – | ⌃1 |
| 31 | Zu Work wechseln | – | ⌃2 |
| 32 | Zu Codex wechseln | – | ⌃3 |
| 33 | Aktivitätsansicht ein-/ausblenden | in der Seitenleiste ein- oder ausschalten | ⌥⌘U |
| 34 | Browser-Tab öffnen | Neuen Browser-Tab öffnen | ⌘T |
| 35 | Weblink im Standardbrowser öffnen | Beim Klicken die zugewiesenen Tasten halten, um im Systembrowser zu öffnen | ⌄ NZ |
| 36 | Review-Tab öffnen | Tab „Überprüfung“ öffnen | ⌃⇧G |
| 37 | Geschlossenen Tab wieder öffnen | Zuletzt geschlossenen Tab wieder öffnen | ⇧⌘T |
| 38 | Browserbereich ein-/ausblenden | – | ⇧⌘B |
| 39 | Unteren Bereich ein-/ausblenden | Unteres Panel ein- oder ausblenden | ⌘J |
| 40 | Fixierte Zusammenfassung umschalten | Angeheftete Zusammenfassung ein- oder ausblenden | NZ |
| 41 | Review ein-/ausblenden | Review für den aktuellen Git-gestützten Chat | NZ |
| 42 | Seitenleiste umschalten | Seitenpanel ein- oder ausblenden | ⌘B |
| 43 | Review-Bereich ein-/ausblenden | Review für den aktuellen Chat | ⌥⌘B |
| 44 | Terminal öffnen | Terminal-Panel öffnen | ⌃` |
| 45 | Umgebungsaktion 1 | Umgebungsaktion in diesem Shortcut-Slot ausführen | ⇧⌘D |
| 46–53 | Umgebungsaktion 2–9 | 〃 | NZ |
| 54 | Commit oder Push | Commit- oder Push-Optionen öffnen | NZ |
| 55 | Branch erstellen | Optionen zur Branch-Erstellung öffnen | NZ |
| 56 | PR-Entwurf erstellen | Optionen zum Erstellen eines Pull-Request-Entwurfs öffnen | NZ |
| 57 | Pull Request erstellen | Optionen zum Erstellen von Pull Requests öffnen | NZ |
| 58 | PR zusammenführen | Merge-Optionen für Pull Requests öffnen | NZ |
| 59 | PR auf GitHub öffnen | Den mit dem aktuellen Chat verknüpften Pull Request öffnen | NZ |
| 60 | Ordner öffnen | Lokales Projekt zu ChatGPT hinzufügen | ⌘O |
| 61 | Neuladen der Fähigkeiten erzwingen | Skill-Katalog für den aktuellen Kontext aktualisieren | NZ |
| 62 | Zu Fähigkeiten gehen | Installierte und empfohlene Skills durchsuchen | NZ |
| 63 | Aus anderen KI-Apps importieren | – | NZ |
| 64 | Tastaturkürzel | Tastenkürzel anpassen | NZ |
| 65 | MCP | MCP-Server konfigurieren | NZ |
| 66 | Alle ungelesenen Elemente als gelesen markieren | Alle Chats und Updates zu geplanten Aufgaben | ⇧Esc |
| 67 | Feedback | Produktfeedback an das ChatGPT-Team senden | NZ |
| 68 | Abmelden | Von ChatGPT abmelden | NZ |
| 69 | Geplante Aufgaben verwalten | … auf der aktuellen Seite erstellen oder verwalten | NZ |
| 70 | Pet anzeigen | Pet von überall aus einblenden | ⌥Space |
| 71 | Steuerfenster öffnen | Steuerungsfenster für den Sprachchat öffnen | NZ |
| 72 | Letzte Aktion wiederholen | Zuletzt rückgängig gemachte App-Aktion wiederholen | ⇧⌘Z |
| 73 | Einstellungen | ChatGPT-Einstellungen öffnen | ⌘, |
| 74 | Letzte Aktion rückgängig machen | Letzte App-Aktion rückgängig machen | ⌘Z |
| 75 | Anfrage genehmigen | Aktive Anfrage genehmigen | ↩ |
| 76 | Anfrage ablehnen | Aktive Anfrage ablehnen | Esc |
| 77 | Andere Tabs schließen | Alle Tabs außer dem aktiven schließen | ⌥⌘W |
| 78 | Tab schließen | Aktiven Tab schließen | ⌘W |
| 79 | Schließen | Aktives Fenster schließen | ⌘W |
| 80 | Dateien und Ordner anhängen | … an den aktiven Composer anhängen | NZ |
| 81 | Fotos hinzufügen | Fotos zum aktiven Composer hinzufügen | NZ |
| 82 | Prompt leeren | Aktuellen Composer-Prompt löschen | NZ |
| 83 | Denkaufwand durchschalten | Zwischen den Reasoning-Aufwandsoptionen wechseln | NZ |
| 84 | Denkaufwand verringern | Reasoning-Aufwand des aktuellen Composers senken | NZ |
| 85 | Denkaufwand erhöhen | Reasoning-Aufwand des aktuellen Composers erhöhen | NZ |
| 86 | Modellauswahl öffnen | Modellauswahl im Composer öffnen | ⌃⇧M |
| 87 | Projektauswahl öffnen | Projektauswahl im Composer öffnen | ⌥⇧⌘O |
| 88 | Prompt einreihen | Aktuellen Prompt als Nachricht in die Warteschlange stellen | NZ |
| 89 | Diktat starten | Diktat im aktuellen Composer starten | ⌃⇧D |
| 90 | Sprachchat ein-/ausschalten | Sprachchat starten oder stoppen | ⌃⇧V |
| 91 | Prompt steuern | Aktuellen Prompt als Steuerungsnachricht absenden | NZ |
| 92 | Nachricht senden | Aktuelle Composer-Nachricht senden | NZ |
| 93 | Nachricht im Hintergrund senden | Senden, ohne den Chat zu öffnen | ⌘↩ |
| 94 | Schnellmodus umschalten | Schnellmodus im aktuellen Composer an/aus | NZ |
| 95 | Planmodus umschalten | Planmodus im aktuellen Composer an/aus | NZ |
| 96 | Cloud/Local umschalten | ChatGPT Work zwischen Cloud- und lokaler Ausführung | NZ |
| 97 | Local/Worktree umschalten | Composer zwischen lokal und neuem Worktree | NZ |
| 98 | Als Markdown kopieren | Aktuellen Chat als Markdown kopieren | NZ |
| 99 | Gesprächspfad kopieren | Aktuellen Chat-Pfad kopieren | ⌥⇧⌘C |
| 100 | Deeplink kopieren | Deeplink zum aktuellen Chat kopieren | ⌥⌘L |
| 101 | Arbeitsverzeichnis kopieren | Aktuelles Chat-Arbeitsverzeichnis kopieren | ⇧⌘C |
| 102 | Chat verzweigen | Aktuellen Chat forken | NZ |
| 103 | Hotkey für „Zum Diktieren gedrückt halten“ | Irgendwo halten, um an der Cursorposition zu diktieren | NZ |
| 104 | Hotkey zum Umschalten der Diktierfunktion | Einmal drücken = diktieren, erneut = stoppen | NZ |
| 105 | Neuladen der Browserseite erzwingen | Aktive Browserseite hart neu laden | ⇧⌘R |
| 106 | Hotkey für Popout-Fenster | Popout-Fenster von überall ein-/ausblenden | NZ |
| 107 | Im Browser zurück | Im Browserverlauf zurückgehen | ⌘Left |
| 108 | Im Browser vorwärts | Im Browserverlauf vorwärtsgehen | ⌘Right |
| 109 | Neues Fenster | Neues Fenster öffnen | NZ |
| 110 | Befehlsmenü öffnen | Befehlsmenü öffnen | ⌘K · ⇧⌘P |
| 111 | Tastenkürzel für Sprachchat | Sprachchat von überall auf dem Desktop starten | NZ |
| 112 | Sprachchat beenden | Aktiven Sprachchat beenden | NZ |
| 113 | Mikrofon für den Sprachchat ein-/ausschalten | Mikrofon stumm / Stummschaltung aufheben | NZ |
| 114 | Ton des Sprachchats ein-/ausschalten | Ton stumm / Stummschaltung aufheben | NZ |
| 115 | Browserseite neu laden | Aktive Browserseite neu laden | ⌘R |
| 116 | Chat umbenennen | Aktuellen Chat umbenennen | ⌥⌘R |
| 117 | Dateien suchen… | Dateien suchen | ⌘P |
| 118 | Tastenkürzel anzeigen | Aktuell verfügbare Tastenkürzel anzeigen | ⌘/ |
| 119–127 | Zu Chat 1–9 wechseln | Den sichtbaren Chat in diesem Shortcut-Slot öffnen | ⌘1 … ⌘9 |
| 128 | Dateibaum ein-/ausblenden | Dateibaum-Panel ein- oder ausblenden | ⇧⌘E |
| 129 | Seitenleiste maximieren/wiederherstellen | Seitenpanel ausklappen oder wiederherstellen | NZ |
| 130 | Trace-Aufzeichnung starten | Trace-Aufzeichnung starten oder stoppen | ⇧⌘S |

### 1.10 Nutzung und Abrechnung
- Untertitel: „Um Rechnungen anzusehen, deine Zahlungsmethode zu ändern und weitere Aktionen auszuführen, öffne die **Einstellungen** im Web.“ (Link)
- **Dein Tarif** – Karte „Pro-Tarif / 229 €/Monat“ `[Tarife ansehen]`
- **Credit-Guthaben** – „Kaufe Credits oder aktiviere automatisches Aufladen, um Codex weiter zu nutzen, wenn du ein Limit erreichst. Mehr erfahren“
  - „0 € / Aktuelles Guthaben“ `[Credits kaufen]`
  - Automatisches Aufladen – „Weiterarbeiten, wenn du ein Limit erreichst“, lila Badge „Bis zu 40 % Rabatt“ `(aus)`
- **Allgemeine Nutzungsgrenzen** – Wöchentliches Nutzungslimit, „Zurücksetzungen 19.09.2026, 11:51“, Fortschrittsbalken + „45 % übrig“
- **GPT-5.3-Codex-Spark Nutzungsgrenzen** – 5 Stunden Nutzungsgrenze (Balken, „100 % übrig“) · Wöchentliches Nutzungslimit (Balken, „100 % übrig“)
- **Zurücksetzungen der Nutzungslimits**
  - Ladezustand „Zurücksetzungen des Nutzungslimits werden geladen…“
  - Danach Karte mit Tabs `‹Verfügbar 0 | **Verlauf**›`, rechts „Letzte 30 Tage“; Zeilen „Zurücksetzung genutzt“ bzw. „Zurücksetzung erhalten“, rechts Datum und Uhrzeit (MESZ)
- **Abo kündigen** – „Dein Abonnement wird über ChatGPT verwaltet. Gehe zu **Abrechnung**, um dein Abonnement zu kündigen.“

### 1.11 Analysen
- **Nutzungsverlauf** – Tarifkontingent und Credits für Work, Codex und agentenbasierte Aufgaben (ohne Chat-Unterhaltungen) `‹**7 T** | 30 T›`
  - Diagrammkarte „Tarifnutzung“ (erst Skelett mit Spinner) `‹**Nach Produkt** | Nach Modell›`; Balkendiagramm pro Tag, Legende „● Codex“
  - Fußnote (i): „Nutzungsdaten sind ungefähre Angaben und können bis zu 6 Stunden verzögert sein“
- **Produktaktivität** – Aktivität je nach Produkt und Modell `‹**7 T** | 30 T›` `‹**Nach Modell** | Nach Oberfläche›`
  - Karte „Turns“ mit großer Zahl (109); Liniendiagramm mit einer Linie pro Modell; Legende gpt-6-astra · gpt-5.6-sol · gpt-5.6-luna · gpt-5.6-terra
- **Tool-Aktivität** – Plugins und Skills im Zeitverlauf, „Aktualisiert am 12. Sept., 18:27 UTC“ `‹**7 T** | 30 T›`
  - Karte „Plugin-Aufrufe“ (68), Liniendiagramm; Legende Unified Computer Use · Computer Use · Pdf
  - Karte „Verwendete Skills“ (38), Liniendiagramm; Legende Pdf · Company Vault · Frontend Design · Andere

### 1.12 Konto ↗
- Externer Link (Pfeil-Symbol), öffnet die Kontoverwaltung im Web; im Video nicht geöffnet.

---

## 2 · Integrationen

### 2.1 Computernutzung
- Untertitel: „Lege fest, wie ChatGPT andere Anwendungen auf deinem Computer nutzt“
- **Steuerung**
  - Beliebige App (Computer-Use-Icon) – „Lass ChatGPT Apps auf deinem Computer steuern.“ `(an)`
  - Google Chrome (Chrome-Icon) – „Browsererweiterung für zusätzliche Kontrollmöglichkeiten verwenden“; kein Toggle, Hover-Hinweis „Browsererweiterung nicht installiert“
  - Eigene Karte, erscheint nachgeladen: Gesperrte Nutzung (Mac-mit-Schloss-Icon) – „ChatGPT darf deinen Mac verwenden, wenn er gesperrt ist. Mehr erfahren“ `(aus)`
- **Immer erlaubte Apps** – leere Karte „Noch keine“

### 2.2 Computerverlauf (Opt-in-Seite)
- Hero-Karte, zweigeteilt
  - Links: „Lass ChatGPT deine Arbeit verfolgen“, zwei Absätze (fasst Aktivitäten zusammen, ohne Bildschirm oder Ton aufzuzeichnen; nachfragen, woran man gearbeitet hat; wiederkehrende Aufgaben automatisieren) `[Aktivieren]` (weiß)
  - Rechts: animierte Demo auf blau-lila Verlauf, dunkles Chatfenster, Karussell mit 4 Punkten. Pro Folie eine Frage-Bubble und eine Antwort, die Wort für Wort eingeblendet wird (der noch ausstehende Rest ist ausgegraut). Beispiele: „Was habe ich versprochen, Sarah … zu schicken?“, „Woran habe ich vor dem Mittagessen gearbeitet?“, „Was war das noch mal für ein Planungsdokument …?“
- Fließtext darunter: speichert Textzusammenfassungen; Kommunikation wird eventuell erfasst; Audio und Inkognito nie; pausieren, löschen und verwalten jederzeit möglich; „erhöht den Token-Verbrauch“ + „Mehr erfahren“
- **Dialog nach [Aktivieren]:** „Du hast die Kontrolle.“
  - (Buch-Icon) Verlauf jederzeit pausieren oder löschen, festlegen welche Apps einbezogen werden
  - (rotes Icon) sensible Apps wie Health oder Finances pausieren bzw. ausschließen
  - (Personen-Icon) Einverständnis, den Verlauf bei Kommunikation mit anderen (Videokonferenz, Messaging) zu pausieren, außer bei vorheriger ausdrücklicher Einwilligung
  - `[Abbrechen]` `[Alle Apps zulassen]` `[Apps anpassen]` (primär, weiß)

### 2.3 Appshots
- Info-Karte: Appshot-Icon + „Appshot aufnehmen, um ChatGPT dein vorderstes Fenster zu zeigen“ / „Appshots enthalten Bild- und Textinhalte, einschließlich Text, der aus dem sichtbaren Bereich gescrollt wurde.“
- Zweispaltig
  - Links, Karte:
    - Tastenkürzel – „Beide ⌘-Tasten gleichzeitig drücken“ `⌄ „⌘ + ⌘“`
    - Appshot-Ziel – wohin Appshots per Hotkey gehen `⌄ „Automatisch“`
    - Soundeffekt abspielen `(an)`
  - Rechts: Vorschau-Animation (MacBook von oben, Hände auf der Tastatur, Browserfenster wird als Appshot an ChatGPT geschickt)

### 2.4 Plugins
- Kopf: „Plugins“ + „Plugins, Skills und MCPs verwalten“; rechts `[Verzeichnis durchsuchen]` `[Hinzufügen ⌄]` (weiß)
- Tabs mit Zählern `‹**Plugins 11** | Apps 10 | MCPs 2 | Skills 2›`; rechts Suchfeld, dessen Platzhalter je Tab wechselt
- **Tab Plugins** (Liste ohne Rahmen): Icon-Kachel + Name + Kurzbeschreibung + Toggle
  - Outlook Calendar · Google Calendar · Gmail · Google Drive · Outlook Email · Deep Research · Default templates · Plugin Management · Sites · Computer Use · Visualize (alle an)
- **Tab Apps:** Sites · Gmail · Microsoft Outlook Email · Google Drive · Google Calendar · Microsoft Outlook Calendar · Codex Document Control · Hotline · Plugin Management · Safety Settings (Systemapps mit generischem Icon, alle an)
- **Tab MCPs**
  - Abschnitt „Server“: computer-use (⚙ + Toggle aus) · node_repl (⚙ + Toggle an)
  - Abschnitt „Aus Plugins“: codex_apps (nur Anzeige)
- **Tab Skills:** Frontend Design · Webapp Testing – Würfel-Icon, Beschreibung gekürzt, Quellenlabel „Persönlich“ + Toggle (an)

### 2.5 Browser
- Untertitel: „Verwalte deine Einstellungen für die Browsernutzung und den Websitezugriff.“ (kurz eingeblendet: „Plugins werden geladen …“)
- Hauptkarte: Browser-Icon · „Browser – Lass ChatGPT den integrierten Browser steuern.“ `(an)`
- **Allgemein** (Kopfbutton `[Importieren …]`)
  - Öffnungsziel für Web-URLs und Links `⌄ „Standardbrowser“`
  - Standardziel zum Öffnen lokaler URLs – lokale Entwicklungsseiten `⌄ „ChatGPT“`
  - Vollständige URL anzeigen – Pfad, Abfrage, Fragment `(aus)`
  - Browserdaten – Verlauf, Websitedaten, Cache, Downloadverlauf `[Browserdaten löschen]`
  - Browsing-Verlauf `[Verwalten]` › **Browserverlauf**
  - Screenshots von Anmerkungen – erhöhen die Tarifnutzung `⌄ „Immer einschließen“ | „Nur bei Auswahl durch Ziehen“`
- **Automatisches Ausfüllen und Passwörter**
  - Passwortmanager `[Verwalten]`
  - Kontaktdaten `[Verwalten]` › **Kontaktinfo**
- **Downloads**
  - Speicherort – „System-Downloadordner“ `[Ändern]` → macOS-Ordnerdialog (`Neuer Ordner` · `Abbrechen` · `Öffnen`)
  - Nachfragen, wo Downloads gespeichert werden sollen `(aus)`
  - Downloadverlauf `[Verwalten]`
- **Browserberechtigungen**
  - Website-Einstellungen – Kamera und Mikrofon im integrierten Browser `[Verwalten]` › **Website-Einstellungen**
  - Verlauf – ob ChatGPT auf den Browserverlauf zugreifen darf `⌄ „Immer fragen“`
  - Website-Tools aktivieren – von Websites bereitgestellte Tools inkl. WebMCP erkennen und aufrufen `(an)`
- **Agentenberechtigungen** – „Standardberechtigungen auswählen und Ausnahmen für bestimmte Websites hinzufügen“ `[+ Hinzufügen]`
  - Tabelle (horizontal scrollbar) mit Spalten: Website oder Muster | Browsen | Downloads | Uploads
  - Zeile „Standard“: 3 × `⌄ „Genehmigung erforderlich“`
- **Entwicklermodus**
  - Warnlabel „(!) Erhöhtes Risiko“ (orange); Vollen CDP-Zugriff aktivieren – Chrome DevTools Protocol in Browser-Use-Sitzungen; sensible Browser-Interna sichtbar `(aus)`

#### 2.5.1 › Browserverlauf *(Einstellungen › Browser › Browserverlauf)*
- ☐ „Browserverlauf durchsuchen“
- „Gesamter Verlauf“ `[Browserdaten löschen]`
- Akkordeon-Karten pro Datum (11. Sept. 2026 … 8. Aug. 2026, Chevron)
  - Eintrag: ☐ Checkbox · Favicon · Seitentitel · Domain (grau) · Uhrzeit rechts · `···`

#### 2.5.2 › Kontaktinfo *(Titel „Kontaktdaten“, Chromium-Stil, ?-Hilfe)*
- Adressen für Autofill speichern – Telefonnummern, E-Mail-Adressen, Lieferadressen `(an)`
- Karte Adressen `[Hinzufügen]` – „Hier werden gespeicherte Adressen angezeigt“
- Karte Bestätigte E-Mail-Adresse – E-Mail-Adressen automatisch bestätigen `(an)`; „Bestätigte E-Mail-Adressen werden hier angezeigt“

#### 2.5.3 › Website-Einstellungen *(Chromium-Stil, ?-Hilfe)*
- **Letzte Aktivität** – „Keine vor Kurzem geänderten Berechtigungen“; Zeile „Nach Websites sortierte Berechtigungen und gespeicherte Daten aufrufen ›“
- **Berechtigungen** (Icon + Titel + aktueller Status + ›)
  - Standort – Websites dürfen nach meinem Standort fragen ›
  - Kamera – dürfen nachfragen ›
  - Mikrofon – dürfen nachfragen ›
  - Benachrichtigungen – Unerwünschte Anfragen minimieren (empfohlen) ›
  - Eingebettete Inhalte – dürfen darum bitten, gespeicherte Informationen zu verwenden ›
  - Zusätzliche Berechtigungen ⌄ (aufklappbar)
- **Inhalte**
  - Drittanbieter-Cookies – werden zugelassen ›
  - JavaScript – dürfen JavaScript verwenden ›
  - Bilder – dürfen Bilder anzeigen ›
  - Pop-ups und Weiterleitungen – dürfen keine senden ›
  - Zusätzliche Inhaltseinstellungen ⌄
  - Berechtigungen für nicht verwendete Websites automatisch entfernen – „Erlaube Codex zum Schutz deiner Daten …“ `(an)`

Alle Detailseiten haben dasselbe Gerüst: Titel · rechts „Websites auf der Seite filtern“ · Erklärtext · **Standardeinstellung** („Wenn du Websites aufrufst, wird diese Einstellung automatisch angewandt“, Radios mit Icons) · **Benutzerdefinierte Einstellungen** (zwei Listen „Dürfen … nicht“ / „Dürfen …“, jeweils „Keine Websites hinzugefügt“, teils `[Hinzufügen]`).

- **Standort:** ◉ dürfen nach meinem Standort fragen / ○ dürfen meinen Standort nicht sehen; „Wie sollen Anfragen angezeigt werden?“ ○ Alle Anfragen in der Adressleiste minimieren / ◉ Unerwünschte Anfragen minimieren (empfohlen) / ○ Alle Anfragen maximieren
- **Kamera:** Geräte-Dropdown „Kamera von ‚MacBook Air‘“; ◉ dürfen nachfragen / ○ dürfen nicht („Funktionen, die eine Kamera benötigen, funktionieren dann nicht“)
- **Mikrofon:** Geräte-Dropdown „Mikrofon von ‚iPhone von …‘“; ◉ dürfen nachfragen / ○ dürfen nicht
- **Benachrichtigungen:** ◉ können fragen / ○ dürfen keine senden; Anfrage-Darstellung (3 Radios wie bei Standort); beide Listen mit `[Hinzufügen]`
- **Eingebettete Inhalte:** ◉ dürfen darum bitten … / ○ dürfen nicht darum bitten …; Listen „Dürfen keine Informationen verwenden …“ / „Darf Informationen nutzen …“
- **Drittanbieter-Cookies** (+ ?-Hilfe)
  - ◉ Drittanbieter-Cookies zulassen, aufklappbar mit 3 Icon-Erklärungen (Personalisierung, Websitefunktionen, im Inkognitomodus blockiert)
  - ○ Drittanbieter-Cookies blockieren (aufklappbar)
  - Erweitert: „Do Not Track“-Anforderung mitsenden `(aus)`
  - „Alle Websitedaten und -berechtigungen ansehen ›“
  - „Websites, die Drittanbieter-Cookies verwenden dürfen“ – Erklärung zu `[*.]`-Mustern `[Hinzufügen]`, „Keine Websites hinzugefügt“
- **JavaScript:** ◉ dürfen verwenden / ○ dürfen nicht; zwei Listen
- **Bilder:** ◉ dürfen anzeigen / ○ dürfen keine („Funktionen, die Bilder erfordern, funktionieren dann nicht“); zwei Listen
- **Pop-ups und Weiterleitungen:** ○ dürfen senden / ◉ dürfen keine; zwei Listen

---

## 3 · Programmierung

### 3.1 Hooks
- Untertitel: „Verwalte Lifecycle-Hooks aus der Konfiguration und aktivierten Plugins. Mehr erfahren“; rechts oben ↻ (neu laden)
- Leerzustand-Karte: „Keine Hooks gefunden – Konfigurierte Hooks werden hier angezeigt“

### 3.2 Verbindungen
- Tabs `‹**Diesen Mac steuern** | Andere Geräte steuern | SSH›`
- **Diesen Mac steuern:** „Geräte, die diesen Mac steuern können“, Leerzustand (Icon Telefon⋯Laptop) „Gerät hinzufügen, um diesen Mac fernzusteuern“ `[Hinzufügen]` (weiß)
- **Andere Geräte steuern:** „Geräte, die sich von diesem Mac aus steuern lassen“, Leerzustand „Von diesem Computer aus auf andere Geräte zugreifen und sie steuern“ `[Einrichten]`
- **SSH:** „SSH-Verbindungen von diesem Mac“, Leerzustand (Laptop⋯Server) „Verbindung mit einem Remote-Gerät über eine SSH-Verbindung herstellen“ `[Hinzufügen]`

### 3.3 Git
- Karte ohne Überschrift
  - Branch-Präfix – Präfix für neue Branches `☐ „codex/“`
  - Merge-Methode für Pull Requests `‹**Merge-Commit** | Squash›`
  - Immer Force-Push verwenden – `--force-with-lease` `(aus)`
  - Entwurfs-Pull-Requests erstellen – standardmäßig Entwürfe `(an)`
  - Review-Zustellung – /review im aktuellen Chat oder separat `‹**Inline** | Separat›`
- **Pull Requests überwachen und beheben**
  - Automatisch zusammenführen, sobald bereit – weiter beobachten, bis gemergt `(aus)`
  - Freitextfeld darunter, Platzhalter „Zum Beispiel: /merge kommentieren, nachdem die Checks bestanden wurden …“
- **Commit-Anweisungen** – „Zu den Prompts für die Commit-Nachricht hinzugefügt“, Textfeld „Hinweise für Commit-Nachrichten hinzufügen…“
- **Pull-Request-Anweisungen** – „Zu Prompts für die Generierung von PR-Titel bzw. -Beschreibung hinzugefügt“, Textfeld „Hinweise für Pull Requests hinzufügen…“

### 3.4 Umgebungen
- Untertitel: „Lokale Umgebungen geben ChatGPT vor, wie Worktrees für ein Projekt eingerichtet werden. Mehr erfahren.“
- **Projekt auswählen** `[Projekt hinzufügen]`
  - Eine Karte pro Projekt: Dokument-Icon + Name + `[+]` rechts (Voices, Cortex, Politica.ly, Exokortex, Vektor, Anatomy Academy, Theologische Studien, New German Architecture, Project Super Suit, Nordwind Studio)

#### 3.4.1 › Projekt *(Breadcrumb: Umgebungen › Voices)*
- Titel „Umgebungen“ `[Lokale Umgebung erstellen]` (weiß)
- Leerzustand: „Für dieses Projekt ist noch keine lokale Umgebung konfiguriert“

#### 3.4.2 › Lokale Umgebung bearbeiten *(Umgebungen › Voices › Bearbeiten)*
- Name `☐ „Voices“`
- **Einrichtungsskript** – „Wird beim Erstellen eines Worktrees im Projektstamm ausgeführt“ `[Variablen]`
  - Tabs `‹**Standardvorgabe** | macOS | Linux | Windows›`; Code-Textfeld (Platzhalter `cd "$CODEX_WORKTREE_PATH"` / `pip install -r requirements.txt` / `npm install` / `./run/setup.sh`)
- **Bereinigungsskript** – „Wird im Projektstamm vor der Worktree-Bereinigung ausgeführt“, gleiche Tabs; Platzhalter `docker compose down --remove-orphans` / `rm -rf .cache/tmp`
- **Aktionen** `[Aktion hinzufügen]` – „Diese Aktionen können jeden Befehl ausführen und werden in der Kopfzeile angezeigt.“ Leerzustand „Aktion hinzufügen, um Befehle über die lokale Symbolleiste auszuführen“
- `[Speichern]` (weiß, rechts unten)

### 3.5 Worktrees
- Karte
  - Worktree-Stammverzeichnis – leer lassen für den Standardort `☐ „/Users/…/.codex/worktrees“`
  - Immer Upstream abrufen, bevor Worktrees erstellt werden – Fetch vor jedem neuen Worktree `(aus)`
  - Alte Worktrees automatisch löschen – für die meisten empfohlen `(an)`
  - Limit für automatische Löschung – Anzahl behaltener Worktrees; vor dem Löschen werden Snapshots angelegt `☐ 15`
- **Noch keine Worktrees** ↻ – Leerzustand „Von ChatGPT erstellte Worktrees werden hier angezeigt.“

---

## 4 · Archiviert

### 4.1 Archivierte Chats
- Titel; rechts `[🗑 Alle löschen]` (rot)
- Toast oben (nach dem Archivieren): `Chat archiviert [Anzeigen] [Rückgängig] [×]`
- Filterleiste: ☐ „Archivierte Chats durchsuchen“ · `⌄ „Alle Chats“` (Filter-Icon) · `⌄ „Alle Projekte“` (Ordner-Icon)
- Gruppe pro Projekt: Ordner-Icon + Projektname, rechts „N Chat(s)“ + `···` (bei „Kein Projekt“ ohne `···`)
  - Karte mit Chat-Zeilen: Titel · Datum („8. Sept. 2026, 19:59“) · rechts Papierkorb + `[Dearchivieren]`
