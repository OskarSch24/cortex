# Rueckfall-Symbole

Die Exokortex-Seite zeigt zu jeder Datenquelle das **echte** Symbol ihrer
Anwendung. Es wird zur Laufzeit aus dem Programmbuendel gezogen
(`CFBundleIconFile` aus der `Info.plist`, dann `sips`) — siehe
`src/exokortex/icons.ts`. Damit stimmt es immer mit der installierten Fassung
ueberein und muss nie nachgepflegt werden.

Fuer Dienste **ohne Anwendung auf diesem Rechner** greift dieser Ordner. Eine
PNG-Datei hier, benannt nach der `kennung` der Quelle aus `bruecke/status.py`:

    grok.png           Grok — es gibt keine macOS-Anwendung
    omi.png            OMI  — Wearable, nur App auf dem Telefon
    mac.png            Mac als Ordnerquelle: Apple-Zeichen (SF Symbol apple.logo)
    mac_schirm.png     Bildschirm Mac: dasselbe Apple-Zeichen
    iphone_schirm.png  iPhone: SF Symbol iphone.gen3
    cortex.png         Cortex-Markenzeichen (brand/icon.png); das Bündel traegt electron.icns
    telegram.png       Telegram, offizielles Logo von telegram.org
    claude.png         Claude Desktop
    chatgpt.png        ChatGPT Desktop

`mac`, `mac_schirm`, `iphone_schirm` und `cortex` stehen **vor** dem Symbol
des Programmbuendels (`VORRANG` in `icons.ts`): ein Geraet ist kein Programm,
und Cortex' Buendel zeigt noch das Electron-Symbol. Die Apple- und iPhone-
Symbole zeichnet macOS selbst (SF Symbols, weiss auf dunklem Feld, 128 px).

Ohne Datei zeigt die Seite ein Kuerzel (GR, OMI). Das ist Absicht: ein
nachgebautes Logo waere schlechter als ein ehrlicher Platzhalter, und ein aus
dem Netz gezogenes waere rechtlich heikler.

Format: PNG, quadratisch, 64 Punkte Kantenlaenge oder mehr.
