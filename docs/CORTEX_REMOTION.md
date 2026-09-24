# Videos mit Remotion im Dock

Gebaut am 22.09.2026. Vorbild für den Ort war die Excalidraw-Fläche; an Excalidraw selbst hat sich nichts geändert.

## Ablauf

1. `/remotion` allein öffnet im Dock den Reiter **Video**. `/remotion <Beschreibung>` öffnet ihn und schickt den Auftrag an das Modell. Weitere Wege: Plus im Dock → „Video (Remotion)“, Chat-Menü (drei Punkte) → „Video (Remotion)“.
2. Das Modell bekommt im Brief (`core/src/context/remotionBrief.ts`) den **Videoordner des Chats**: `<Projekt>/videos/video-<Chat-Kennung>` bzw. im projektlosen Ordner. Dort legt es mit `create-video` ein Remotion-Projekt an, schreibt die Szenen und rendert nach `out/`. Remotion Studio und Browser startet es nicht selbst.
3. Cortex beobachtet den Ordner (`src/remotion/remotionStudio.ts`, alle 1,5 s, solange der Reiter offen ist):
   - kein Projekt → Hinweis „Noch kein Video“
   - `package.json`, aber Remotion noch nicht installiert → „Projekt wird eingerichtet …“
   - installiert → Cortex startet **Remotion Studio** und zeigt es im Reiter unter **Live**. Jede gespeicherte Datei erscheint sofort.
   - gerenderte Dateien in `out/` (mp4, webm, mov, gif) → Reiter **Fertig** mit Player, Öffnen, Im Finder zeigen, Sichern unter. Ein neues Video schaltet von selbst auf „Fertig“.
4. **Rendern** im Reiterkopf rendert die erste Komposition nach `out/<Id>.mp4`, mit Fortschritt („Bild 12 von 300“).

## Sofortige Vorschau mit dem Material (Nachtrag 22.09.2026)

Beim Absenden von `/remotion` legt Cortex das Projekt selbst an, bevor der Agent startet (`src/remotion/remotionTemplate.ts`):

- Vorlage mit Remotion 4.0.527 (`package.json`, `src/Root.tsx`, `src/Material.tsx`, `src/materialList.ts`).
- Pakete aus einem einmal installierten Vorrat `~/.cortex/remotion/cache-4.0.527`, per APFS-Klon (`cp -c`) in etwa 4 s und ohne zusätzlichen Platz. Der Vorrat entsteht beim ersten Öffnen des Reiters (einmalig rund 20 s).
- Angehängte Videos, Bilder und Töne landen geklont unter `public/material/` und in der Komposition **Material** auf der Timeline. Länge und Format kommen bei MP4/MOV aus dem Dateikopf (`mvhd`/`tkhd`), sonst aus Spotlight.
- Die Nachricht erscheint sofort im Chat („Videoprojekt wird eingerichtet …“), der Agent startet erst, wenn das Projekt steht. Im Brief steht, dass Projekt und Material schon da sind — er baut darauf auf, statt `create-video` und `npm i` zu starten.
- Gemessen: vorbereitet in 3,5 s, Studio mit Timeline nach gut 6 s.

## Sicherheit

- Remotion Studio bindet sich von sich aus an alle Netzwerkschnittstellen. Cortex startet es mit `media/remotion/loopback.cjs` (per `NODE_OPTIONS=--require`), das jede Bindung auf 127.0.0.1 umlenkt. Geprüft mit `lsof` im Live-Test.
- Fertige Videos liefert der vorhandene Vorschau-Server (`htmlPreview.ts`, 127.0.0.1, Geheimnis im Pfad, Range-Anfragen) aus. Die Webview erlaubt dafür `media-src http://127.0.0.1:*`.
- Öffnen, Finder und Sichern nehmen nur Dateien an, die wirklich im Videoordner des Chats liegen.
- Studio läuft nach dem Schließen des Reiters noch 60 s weiter (Chatwechsel ohne Neustart) und endet mit der App.

## Tests

- `engine/packages/vscode/test/unit/remotion.test.ts` — Brief, Slash-Befehl, Adresse, Ordner. Mit `CORTEX_REMOTION_PROJECT=<installiertes Remotion-Projekt>` zusätzlich ein echter Lauf: Studio nur auf 127.0.0.1, Rendern erzeugt MP4, Auslieferung mit Range.
- `tests/cortex_remotion_ui.py` — Reiter, Phasen, Live-Rahmen (mit echtem Studio bei gesetzter Variable), Umschalten nach „Fertig“, Player, Knöpfe, Vollbild.
- Bildschirmfotos: `docs/screenshots/remotion/`.
