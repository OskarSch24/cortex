#!/usr/bin/env python3
"""Öffnet die Fenster-Titelleiste für Beiträge aus Erweiterungen.

Code-OSS zeichnet die Titelleiste über die volle Fensterbreite — über allen
Editor-Gruppen, also auch über Chat und Terminal nebeneinander. Sie rendert
bereits Einträge aus `MenuId.TitleBar`; der integrierte Browser nutzt das.
Erweiterungen dürfen nur nicht hinein: In der Tabelle der Beitragspunkte
(`commandPalette`, `editor/title`, `explorer/context` …) fehlt der Schlüssel.

Das ist die einzige Stelle im Fenster, an der eine Leiste wirklich bis zum
rechten Rand durchläuft. Eine Webview endet immer an ihrer Editor-Gruppe.
"""
import base64, hashlib, json, pathlib, sys

root = pathlib.Path(sys.argv[1]) / 'Contents/Resources/app'
out = root / 'out'
product_path = root / 'product.json'
product = json.loads(product_path.read_text())
checksums = product.get('checksums', {})

script = 'vs/workbench/workbench.desktop.main.js'
style = 'vs/workbench/workbench.desktop.main.css'
marker = '/* cortex-titlebar-menu */'
anchor = '[{key:"commandPalette",id:D.CommandPalette,'
entry = '[' + marker + '{key:"titleBar",id:D.TitleBar,description:"Die Fensterleiste über allen Editor-Gruppen."},{key:"commandPalette",id:D.CommandPalette,'

# Die Fenstertitelzeile rückt nach rechts.
#
# Code-OSS legt sie als eigenen Teil über alle Editor-Gruppen und gibt ihr im
# Raster eine Höhe — dadurch beginnt alles darunter, und die Seitenleiste der
# Webview ist oben genau um diese Höhe gekürzt. Eine Webview kann nie über ihren
# Teil hinaus, also hilft kein Einfärben: die Zeile selbst muss weg.
#
# Sie meldet dem Raster deshalb die Höhe 0. Der Editorbereich beginnt damit an
# der Fensteroberkante und die Seitenleiste läuft als eine Spalte von ganz oben
# bis ganz unten. Die Zeile wird per CSS wieder eingeblendet — absolut über dem
# Editorbereich, aber erst ab dem rechten Rand der Seitenleiste.
#
# Nichts an ihrem Innenleben wird angefasst: Höhe und Innenabstände bleiben, wie
# die Workbench sie rechnet. Ein früherer Versuch hat dem Container eine eigene
# Höhe aufgezwungen und ihn dadurch oben abgeschnitten.
#
# Die Ampelknöpfe zeichnet Electron unverändert in die obere linke Fensterecke —
# also in die Seitenleiste. Sie hält ihnen in cortex.css die Ecke frei.
#
# RAIL steht auch in media/cortex.css (Breite von .cx-sidebar) und TITLE dort als
# Freiraum oben in der Leiste. Ändert sich eine Zahl, müssen die anderen mit.
RAIL = 250
TITLE = 44
# Höhe der Ziehfläche fürs Fenster. Muss unter `top` von `.cx-history` (12 px)
# in media/cortex.css bleiben, sonst sind die Pfeile wieder nicht klickbar.
DRAG = 10

height_anchor = 'get minimumHeight(){return ot?(this.isCommandCenterVisible?Tye:this.macTitlebarSize)/(this.preventZoom?Dv(Te(this.element)):1):super.minimumHeight}'
height_entry = 'get minimumHeight(){return 0}'

# Die Ampelknöpfe sitzen sonst über der Fensterkante.
#
# Der Hauptprozess mittet sie in die gemeldete Leistenhöhe:
# `r = floor((height - 16) / 2)`. Meldet die Leiste 0, wird r negativ und die
# Knöpfe rutschen halb aus dem Fenster — genau das war zu sehen. Fällt die Höhe
# aus, rechnet er jetzt mit der Höhe der obersten Zeile der Seitenleiste
# (`.cx-rail-top`), in der die Knöpfe seither liegen.
buttons_anchor = 'const s=dv(s2())?14:16,r=Math.floor((e.height-s)/2);'
buttons_entry = 'const s=dv(s2())?14:16,r=Math.floor(((e.height>0?e.height:44)-s)/2);'

# Native macOS menus cannot use the Cortex palette. Keep the existing DOM menu
# implementation and command actions, but inject it only for our titlebar
# submenu. Editor, terminal and third-party context menus keep their service.
brand_marker = '/* cortex-branded-titlebar-menu */'
brand_end = '/* end cortex-branded-titlebar-menu */'
brand_anchor = 'return zc(this.instantiationService,e,{...t,menuAsChild:!1})'
brand_entry = brand_marker + (
    'if(e.id==="submenuitem.api:cortex.chatMenu"){'
    'if(!this.cortexMenuInstantiation){'
    'const cxMenu=this._register(this.instantiationService.createInstance(v$t));'
    'const cxProvider={showContextMenu:d=>cxMenu.showContextMenu({...d,getMenuClassName:()=>"cortex-context-menu"}),'
    'onDidShowContextMenu:cxMenu.onDidShowContextMenu,onDidHideContextMenu:cxMenu.onDidHideContextMenu};'
    'this.cortexMenuInstantiation=this._register(this.instantiationService.createChild(new yn([gt,cxProvider])))}'
    'return zc(this.cortexMenuInstantiation,e,{...t,menuAsChild:!1})}'
) + brand_anchor
brand_rules = (pathlib.Path(__file__).resolve().parents[1] / 'engine/packages/vscode/media/cortex-menus.css').read_text(encoding='utf-8')


rules = (
    # Die Zeile selbst verschwindet: keine Fläche, keine Kante, kein Balken.
    # Übrig bleiben die Werkzeug-Icons, die frei in der oberen rechten Ecke über
    # dem Chat liegen. Sie fängt keine Klicks ab — sonst wären die obersten
    # Pixel des Chats tot —, nur die Icons selbst nehmen wieder welche an.
    f'.part.titlebar{{position:absolute!important;top:0!important;left:{RAIL}px!important;'
    f'width:calc(100% - {RAIL}px)!important;height:{TITLE}px!important;z-index:6;'
    'background:transparent!important;box-shadow:none!important;border:0!important;'
    'pointer-events:none}'
    # Fenstertitel und Command Center entfallen ganz — gesucht wird mit ⌘K.
    '.part.titlebar>.titlebar-container>.titlebar-center{display:none!important}'
    '.part.titlebar>.titlebar-container>.titlebar-left{pointer-events:none}'
    # Nur die Knöpfe selbst nehmen Klicks an, nicht die ganze rechte Hälfte:
    # `.titlebar-right` wächst mit `has-center` auf die halbe Fensterbreite und
    # lag damit unsichtbar über der Reiterzeile des Browsers — Reiter, × und
    # Plus darunter bekamen weder Hover noch Klick.
    '.part.titlebar>.titlebar-container>.titlebar-right{pointer-events:none}'
    '.part.titlebar>.titlebar-container>.titlebar-right>.action-toolbar-container,'
    '.part.titlebar>.titlebar-container>.titlebar-right>.center-adjacent-toolbar-container{pointer-events:auto}'
    f'.part.titlebar>.titlebar-container{{height:{TITLE}px}}'
    # Die Ziehfläche fürs Fenster (`-webkit-app-region: drag`) wertet
    # `pointer-events` nicht aus: macOS nimmt Klicks darin als Fensterziehen,
    # bevor die Webview sie sieht. Über volle 44 px lagen darunter Vor/Zurück
    # (`.cx-history`, ab 12 px) und die Brotkrume der Plugins (ab 22 px) — beide
    # waren in der App tot, im Test ohne Fenster aber heil. Gezogen wird deshalb
    # nur noch am oberen Rand, über dem ersten Bedienelement.
    f'.part.titlebar>.titlebar-container>.titlebar-drag-region{{height:{DRAG}px!important}}'
)


def digest(data):
    return base64.b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')


for name in (script, style):
    if name not in checksums:
        raise SystemExit(f'Workbench checksum missing: {name}')

# Der Build muss zu product.json passen — frühere Patches tragen ihre Prüfsumme
# selbst nach. Nie eine Änderung absegnen, die dieses Skript nicht gemacht hat.
for name, expected in checksums.items():
    if digest((out / name).read_bytes()) != expected:
        raise SystemExit(f'Unexpected integrity mismatch: {name}')

# Die Ampelknöpfe leben im Hauptprozess, nicht in der Workbench.
main_path = root / 'out/main.js'
main_source = main_path.read_text(encoding='utf-8')
if buttons_entry not in main_source:
    if main_source.count(buttons_anchor) != 1:
        raise SystemExit('Ampelposition nicht erkannt; nichts gepatcht')
    main_source = main_source.replace(buttons_anchor, buttons_entry)

path = out / script
source = path.read_text(encoding='utf-8')
if marker not in source:
    if source.count(anchor) != 1:
        raise SystemExit('Menü-Beitragstabelle nicht erkannt; nichts gepatcht')
    if source.count(height_anchor) != 1:
        raise SystemExit('Höhe der Titelleiste nicht erkannt; nichts gepatcht')
    source = source.replace(anchor, entry).replace(height_anchor, height_entry)

if brand_marker not in source:
    if source.count(brand_anchor) != 1:
        raise SystemExit('Titelleisten-Menüservice nicht erkannt; nichts gepatcht')
    # These decorated services belong to the pinned Code-OSS build. Fail before
    # any file write when an upstream update changes their identifiers.
    for service in ('v$t=class extends M', 'v$t=__decorate(', 'yn=class{constructor(', 'NP=__decorate('):
        if service not in source:
            raise SystemExit(f'Titelleisten-Menüservice geändert ({service}); nichts gepatcht')
    source = source.replace(brand_anchor, brand_entry)

sheet_path = out / style
sheet = sheet_path.read_text(encoding='utf-8')
if marker not in sheet:
    sheet += '\n' + marker + rules + '\n'
if brand_marker in sheet:
    before, _, tail = sheet.partition(brand_marker)
    if brand_end not in tail:
        raise SystemExit('Unvollständiger Cortex-Menü-CSS-Block; nichts gepatcht')
    _, _, after = tail.partition(brand_end)
    sheet = before + brand_marker + '\n' + brand_rules + '\n' + brand_end + after
else:
    sheet += '\n' + brand_marker + '\n' + brand_rules + '\n' + brand_end + '\n'

# Validate all anchors first. Never leave main.js partially patched on a
# mismatched upstream build.
main_path.write_text(main_source, encoding='utf-8')
path.write_text(source, encoding='utf-8')
sheet_path.write_text(sheet, encoding='utf-8')

for name in (script, style):
    checksums[name] = digest((out / name).read_bytes())
product_path.write_text(json.dumps(product, indent=2) + '\n')
print('Titelleiste für Erweiterungen geöffnet und Prüfsummen bestätigt.')
