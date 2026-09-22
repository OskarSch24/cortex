#!/usr/bin/env python3
"""Gibt dem integrierten Browser das Cortex-Design und bestätigt die Prüfsummen.

Code-OSS zeichnet den Browser als eine einzige Leiste: Navigation, ein
umrandetes URL-Feld und eine Aktionsleiste mit „…“. Ein Klick ins URL-Feld
öffnet einen Quick-Pick der IDE statt einfach Tippen zu lassen. Cortex will
stattdessen zwei Zeilen:

  1. Reiter — Globus, Titel, ×, dahinter ein Plus. Rechts bleibt Platz für die
     Cortex-Knöpfe, die frei über der oberen rechten Fensterecke liegen.
  2. Navigation — Zurück, Vor, Neu laden links, die Adresse randlos in der
     Mitte, Downloads und ⋮ rechts. Darunter eine Haarlinie.

Die Adresse ist ein gewöhnliches Eingabefeld: Klick markiert alles, Tippen
tippt, Enter lädt, Esc verwirft. Der leere Zustand heißt „Lossurfen“.

Maße aus der Vorlage (in CSS-Pixeln): Reiterzeile 45, Reiter 142 × 26 mit
Radius 8 und 10 Abstand zum Rand, Navigationszeile 36, Knopfmitten bei 22,
49 und 76 von links sowie 20 und 52 von rechts.
"""
import base64, hashlib, json, pathlib, sys
from urllib.parse import quote

root = pathlib.Path(sys.argv[1]) / 'Contents/Resources/app'
out = root / 'out'
product_path = root / 'product.json'
product = json.loads(product_path.read_text())
checksums = product.get('checksums', {})

script = 'vs/workbench/workbench.desktop.main.js'
style = 'vs/workbench/workbench.desktop.main.css'
marker = '/* cortex-browser-design */'

# Die Cortex-Knöpfe (Browser, Dateien, Terminal, Menü) schweben frei über der
# oberen rechten Fensterecke — auf Höhe der Reiterzeile. TITLE_RESERVE muss
# mitwachsen, wenn in package.json unter menus.titleBar ein Knopf dazukommt.
TITLE_RESERVE = 150

# Ende des Konstruktors der Navigationsleiste: `i` ist der Browser-Editor,
# `e` der Instantiation-Service, `a` die Navigation, `h` die Aktionsleiste.
navbar_anchor = 'this.element.appendChild(a),this.element.appendChild(this._urlBar.element),this.element.appendChild(h)'
navbar_entry = marker + (
    '(()=>{const cmd=c=>e.invokeFunction(x=>x.get(ke).executeCommand(c)),'
    'btn=(cls,label,run)=>{const b=k("button.cx-ico."+cls);b.title=label,b.setAttribute("aria-label",label),'
    'b.addEventListener("click",ev=>{ev.stopPropagation(),run()});return b};'
    'const tabs=k(".cx-browser-tabs"),strip=k(".cx-browser-tablist");'
    'tabs.append(strip,btn("cx-ico-plus.cx-browser-newtab","Neuer Tab",()=>cmd("workbench.action.browser.newTab")));'
    'const row=k(".cx-browser-row");'
    'row.append(a,this._urlBar.element,btn("cx-ico-download.cx-browser-downloads","Downloads",()=>cmd("cortex.showDownloads")),h);'
    'this.element.append(tabs,row);'
    'let subs=[],groupSubs=[],queued=!1;'
    'const drop=l=>{for(const d of l.splice(0))d.dispose()},'
    'schedule=()=>{queued||(queued=!0,queueMicrotask(()=>{queued=!1,render()}))},'
    'render=()=>{drop(subs),strip.textContent="";const g=i.group;if(!g)return;'
    'for(const x of g.editors.filter(y=>y instanceof ku)){'
    'const url=x.url,t=k(".cx-browser-tab"+(x===g.activeEditor?".active":"")),lb=k("span.cx-browser-tab-label");'
    'lb.textContent=url?x.getName()||url:"Neuer Tab",t.title=url||"Neuer Tab",'
    't.addEventListener("click",()=>g.openEditor(x)),'
    't.append(k("span.cx-ico.cx-ico-globe"),lb,btn("cx-ico-x.cx-browser-tab-close","Tab schließen",()=>g.closeEditor(x))),'
    'strip.append(t),x.onDidChangeLabel&&subs.push(x.onDidChangeLabel(schedule))}},'
    'bind=()=>{const g=i.group;if(!g){setTimeout(bind,150);return}'
    'groupSubs.push(g.onDidModelChange(schedule),g.onDidActiveEditorChange(schedule)),render()};'
    'bind(),this._register({dispose:()=>{drop(subs),drop(groupSubs)}})})()'
)

# Das URL-Feld öffnet keinen Quick-Pick mehr. Der Tastendruck-Handler im
# Original erledigt Enter (laden) und Esc (verwerfen) schon selbst.
url_edits = [
    ('e||this._openPicker()', 'void 0'),
    ('this._register(q(this._urlDisplay,ie.CLICK,()=>{e=!1;',
     'this._register(q(this._urlDisplay,ie.CLICK,()=>{const cxFirst=e;e=!1;if(cxFirst){this._selectAll();return}'),
    ('this._openPicker({value:s,selection:[0,s.length]})', 'void 0'),
    ('const t=this._urlDisplay.textContent??"",s=this._getCaretOffset();this._openPicker({value:t,selection:[s,s]})', 'void 0'),
    ('openUrlPicker(){this._openPicker()}', 'openUrlPicker(){this._urlDisplay.focus(),this._selectAll()}'),
    ('getPlaceholder:()=>this._searchEngine?d(6665,null):d(6666,null)', 'getPlaceholder:()=>"Suchen oder URL eingeben"'),
    ('o.textContent=d(6714,null)', 'o.textContent="Lossurfen"'),
    ('r.textContent=d(a?6715:6716,null)', 'r.textContent="Gib eine URL ein, um eine Seite zu öffnen"'),
]


def icon(*paths, width='1.6'):
    body = ''.join(f"<path d='{d}'/>" for d in paths)
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' "
           f"stroke-width='{width}' stroke-linecap='round' stroke-linejoin='round'>" + body + '</svg>')
    return 'url("data:image/svg+xml;utf8,' + quote(svg, safe=" '=/:<>.-,") + '")'


ICONS = {
    'globe': icon('M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20', 'M2 12h20'),
    'x': icon('M18 6 6 18', 'm6 6 12 12'),
    'plus': icon('M5 12h14', 'M12 5v14'),
    'back': icon('m12 19-7-7 7-7', 'M19 12H5'),
    'forward': icon('M5 12h14', 'm12 5 7 7-7 7'),
    'reload': icon('M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5',
                   'M21 12a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'),
    'download': icon('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'),
    'more': icon('M12 5h.01', 'M12 12h.01', 'M12 19h.01', width='2.6'),
}

FG = '#ececec'
ICON = 'rgba(255,255,255,.62)'
MUTED = 'rgba(255,255,255,.5)'
HOVER = 'rgba(255,255,255,.07)'
LINE = 'rgba(255,255,255,.08)'

mask = ('content:""!important;display:block;width:16px;height:16px;background-color:currentColor;'
        '-webkit-mask:var(--cx-i) center/16px 16px no-repeat;mask:var(--cx-i) center/16px 16px no-repeat;')
button = ('display:flex;align-items:center;justify-content:center;flex:0 0 auto;width:22px;height:22px;'
          f'padding:0;border:0;border-radius:6px;background:transparent;color:{ICON};cursor:pointer')

rules = ''.join([
    # Symbole: eigene Masken statt Codicons, damit Strichstärke und Größe sitzen.
    ''.join(f'.cx-ico-{name}{{--cx-i:{svg}}}' for name, svg in ICONS.items()),
    f'.cx-ico::before{{{mask}}}',
    f'button.cx-ico{{{button}}}',
    f'button.cx-ico:hover{{background-color:{HOVER};color:{FG}}}',
    'button.cx-ico:focus-visible{outline:1px solid var(--vscode-focusBorder);outline-offset:-1px}',

    # Zwei Zeilen statt einer.
    '.browser-navbar{flex-direction:column!important;align-items:stretch!important;padding:0!important;gap:0!important;'
    'background-color:var(--vscode-editor-background)}',

    # Zeile 1: Reiter.
    f'.cx-browser-tabs{{display:flex;align-items:center;height:45px;box-sizing:border-box;padding:2px {TITLE_RESERVE}px 0 10px;min-width:0}}',
    '.cx-browser-tablist{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden}',
    '.cx-browser-tab{display:flex;align-items:center;flex:0 1 142px;width:142px;min-width:72px;height:26px;box-sizing:border-box;'
    f'padding:0 3px 0 6px;border-radius:8px;color:{MUTED};cursor:default;user-select:none}}',
    f'.cx-browser-tab:hover{{background-color:{HOVER}}}',
    f'.cx-browser-tab.active{{background-color:{HOVER};color:{FG}}}',
    '.cx-browser-tab>.cx-ico-globe{flex:0 0 auto;width:16px;height:16px;margin-right:7px}',
    '.cx-browser-tab>.cx-ico-globe::before{width:14px;height:14px;margin:1px;-webkit-mask-size:14px 14px;mask-size:14px 14px}',
    '.cx-browser-tab-label{flex:1 1 auto;min-width:0;font-size:13px;line-height:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.cx-browser-tab>.cx-browser-tab-close{width:18px;height:18px;border-radius:5px}',
    '.cx-browser-tab>.cx-browser-tab-close::before{width:12px;height:12px;-webkit-mask-size:12px 12px;mask-size:12px 12px}',
    '.cx-browser-newtab{margin-left:7px}',

    # Zeile 2: Navigation, Adresse, Downloads, ⋮.
    f'.cx-browser-row{{display:flex;align-items:center;height:36px;box-sizing:border-box;padding:0 9px 0 11px;border-bottom:1px solid {LINE};gap:0}}',
    '.cx-browser-row .browser-nav-toolbar .actions-container{gap:5px}',
    f'.cx-browser-row .browser-nav-toolbar .action-label{{width:22px;height:22px;padding:3px;box-sizing:border-box;color:{ICON}!important;border-radius:6px}}',
    f'.cx-browser-row .browser-nav-toolbar .codicon::before,.cx-browser-row .browser-actions-toolbar .codicon-toolbar-more::before{{{mask}}}',
    f'.cx-browser-row .codicon-arrow-left{{--cx-i:{ICONS["back"]}}}',
    f'.cx-browser-row .codicon-arrow-right{{--cx-i:{ICONS["forward"]}}}',
    f'.cx-browser-row .codicon-refresh{{--cx-i:{ICONS["reload"]}}}',
    f'.cx-browser-row .codicon-toolbar-more{{--cx-i:{ICONS["more"]}}}',
    '.cx-browser-row .browser-actions-toolbar{margin:0 0 0 10px!important}',
    '.cx-browser-row .browser-actions-toolbar .action-item:not(:has(.codicon-toolbar-more)){display:none!important}',
    f'.cx-browser-row .browser-actions-toolbar .action-label{{width:22px;height:22px;padding:3px;box-sizing:border-box;color:{ICON}!important;border-radius:6px}}',
    '.cx-browser-row .browser-url-container{background:transparent!important;border:0!important;border-radius:0!important;margin:0 12px}',
    f'.cx-browser-row .browser-url-display{{text-align:center;font-size:13px;padding:4px 6px;color:{FG}}}',
    '.cx-browser-row .browser-url-display:focus{text-align:left}',
    f'.cx-browser-row .browser-url-display:empty::before{{color:{MUTED}!important}}',

    # Leerer Zustand.
    '.browser-welcome-icon{min-height:0!important}',
    f'.browser-welcome-icon .codicon{{font-size:24px!important;margin-bottom:16px!important;color:{ICON}!important}}',
    f'.browser-welcome-title{{font-size:15px!important;font-weight:500!important;margin-top:0!important;color:{FG}!important}}',
    f'.browser-welcome-subtitle{{font-size:13px!important;max-width:none!important;margin-top:10px!important;color:{MUTED}!important}}',
])


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

script_path, style_path = out / script, out / style
source = script_path.read_text(encoding='utf-8')
if marker not in source:
    for old, _ in [(navbar_anchor, None), *url_edits]:
        if source.count(old) != 1:
            raise SystemExit(f'Browser nicht erkannt ({old[:48]}…); Patch abgebrochen')
    source = source.replace(navbar_anchor, navbar_entry)
    for old, new in url_edits:
        source = source.replace(old, new)
    script_path.write_text(source, encoding='utf-8')

sheet = style_path.read_text(encoding='utf-8')
if marker not in sheet:
    style_path.write_text(sheet + '\n' + marker + rules + '\n', encoding='utf-8')

for name in (script, style):
    checksums[name] = digest((out / name).read_bytes())
product_path.write_text(json.dumps(product, indent=2) + '\n')
print('Browser-Design angewendet und Prüfsummen bestätigt.')
