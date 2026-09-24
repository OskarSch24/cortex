# Standort als Kontext und Apify

Gebaut am 22.09.2026.

## Apify-Plugin

Katalogeintrag `apify` (Kategorie Daten): `npx -y @apify/actors-mcp-server@0.16.0 --tools actors,docs,compass/crawler-google-places,apify/rag-web-browser --telemetry-enabled=false`, Schlüssel `APIFY_TOKEN` über den normalen Schlüsselweg der Plugin-Seite (verschlüsselt gespeichert). Logo vom Hersteller (`media/plugins/icons/apify.svg`, Quelle in `SOURCES.md`). Fest eingebaut: der Google-Maps-Scraper `compass/crawler-google-places` und der Web-Browser `apify/rag-web-browser`; weitere Actors findet der Agent über die Store-Suche.

## Standort (Maps)

- Plus im Eingabefeld › **Standort (Maps)** öffnet die Kachel über dem Eingabefeld (`webview/components/LocationPicker.tsx`).
- **Adresse suchen** (Nominatim/OpenStreetMap, höchstens eine Anfrage je Sekunde) oder **Mein Standort**: der Host startet die unsichtbare Helfer-App `dist/CortexLocation.app` (`native/location-tool.swift`, CoreLocation, Kennung `dev.oskarschiermeister.cortex.location`, LSUIElement) über `open -n -W -g --stdout`. Nur eine App mit eigener Kennung und Freigabetext bekommt von den Ortungsdiensten eine Abfrage — ein Kommandozeilen-Kind von Cortex wurde stumm übergangen. Nach der Freigabe liefert sie den zuletzt bekannten Ort in ~0,1 s. `assemble.sh` signiert sie eigens mit der stabilen Identität, sonst fragte macOS nach jedem Build neu. `navigator.geolocation` geht in der Webview nicht — ihr Rahmen sperrt die Ortung. Die Koordinaten werden rückwärts benannt; Fehler (verweigert, ausgeschaltet, unbeantwortet, Zeitüberschreitung) stehen mit Hinweis in der Kachel und im Protokoll (`[standort]`).
- **Radius** in Stufen von 100 m bis 50 km, dazu eine Karte aus OpenStreetMap-Kacheln mit Radiuskreis. Die Kacheln holt der Host (`src/location/geo.ts`) und schickt sie als Data-URI — die Webview lädt nichts von außen.
- **Übernehmen** hängt den Standort über dem Eingabefeld an den Chat — mit kleiner Karte (Radiuskreis), Name, Herkunft und Radius (`ConversationRecord.location`, gespeichert). Chip anklicken ändert, × entfernt.
- Solange er hängt, bekommt jedes Modell im Brief den Abschnitt `location` (`core/src/context/chatLocationBrief.ts`): Mittelpunkt, Radius, und die Anweisung, Orte über den Apify-Google-Maps-Scraper mit genau diesem Kreis (`customGeolocation` Point + `radiusKm`) zu holen, sparsam mit Ergebnissen (Apify-Guthaben), mit Entfernung und Maps-Link zu antworten. Ohne Apify: Hinweis und Websuche, als ungenauer gekennzeichnet.
- Der Heimatort aus den Einstellungen (`locationBrief.ts`, `cortex.homeLocation`) bleibt unverändert; der Chat-Standort geht für diesen Chat vor.

## Tests

- `engine/packages/vscode/test/unit/location.test.ts` — Brief, Prüfung der Eingabe, Namen, Kartenrechnung; mit `CORTEX_GEO_LIVE=1` echte Abfrage bei OpenStreetMap.
- `tests/cortex_location_ui.py` — Plus-Menü, Suche, Trefferwahl, Karte mit Kreis, Radius, Übernehmen/Chip, „Mein Standort“ mit Ortung, Entfernen, Chatwechsel.
- Bildschirmfotos: `docs/screenshots/standort/`.
