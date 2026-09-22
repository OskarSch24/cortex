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
    mac.png            Mac als Ordnerquelle (kein einzelnes Programm)
    mac_schirm.png     Bildschirm Mac, falls Screenshot.app nicht gefunden wird
    iphone_schirm.png  iPhone Mirroring, gleicher Rueckfall
    cortex.png         Cortex-Markenzeichen; CFBundleIconFile ist Code.icns
    claude.png         Claude Desktop
    chatgpt.png        ChatGPT Desktop

Ohne Datei zeigt die Seite ein Kuerzel (GR, OMI). Das ist Absicht: ein
nachgebautes Logo waere schlechter als ein ehrlicher Platzhalter, und ein aus
dem Netz gezogenes waere rechtlich heikler.

Format: PNG, quadratisch, 64 Punkte Kantenlaenge oder mehr.
