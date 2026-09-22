#!/usr/bin/env python3
"""Lässt Dateien aus dem Finder in die Cortex-Oberfläche ziehen.

Eine Webview bekommt beim Drop nur `File`-Objekte ohne Pfad — Electron hat
`File.path` gestrichen, und `webUtils.getPathForFile` gibt es nur in der
Workbench, nicht im Webview-iframe. Einen Inhalt über `postMessage` zu
schaufeln, scheidet für Videos von mehreren GB aus. Code-OSS schaltet das
iframe während eines Datei-Drags ohnehin auf `pointer-events: none`, damit die
Workbench den Drop bekommt — genau dort wird er jetzt abgefangen.

Liegt der Zeiger über einer Webview der Cortex-Erweiterung, liest die
Workbench die echten Pfade aus und schickt sie als `{kind:'attachments'}` —
dieselbe Nachricht wie nach „Dateien oder Fotos hinzufügen“. Übergeben wird
nur der Pfad, nie der Inhalt: die Dateigröße spielt keine Rolle. Während des
Ziehens meldet `{kind:'dropHover'}`, ob gerade abgelegt werden kann.

Ein Bild ohne Pfad — ein Bildschirmfoto aus der schwebenden Vorschau von
macOS, ein Bild aus einer App — geht als Inhalt (`attachmentData`, höchstens
40 MB) mit; der Host legt es als Datei ab. Wird aus einem Ablegen gar nichts,
kommt `attachmentDropFailed` statt Stille.
"""
import base64, hashlib, json, pathlib, sys

root = pathlib.Path(sys.argv[1]) / 'Contents/Resources/app'
out = root / 'out'
product_path = root / 'product.json'
product = json.loads(product_path.read_text())
checksums = product.get('checksums', {})

script = 'vs/workbench/workbench.desktop.main.js'
marker = '/* cortex-webview-drop v2 */'
OLD_MARKER = '/* cortex-webview-drop */'
# Konstruktor der WebviewElement-Klasse: hier ist `this` die Webview selbst,
# mit `element` (iframe), `extension` und `postMessage`.
anchor = 'this._register(this.on("drag-start",()=>{this._startBlockingIframeDragEvents()}))'
EXTENSION = 'oskarschiermeister.cortex'
hook = (
    '(()=>{const x=this.extension?.id;if(String(x?.value??x??"").toLowerCase()!=="' + EXTENSION + '")return;'
    'const w=this.window??window;let on=!1;'
    'const hover=v=>{v!==on&&(on=v,this.postMessage({kind:"dropHover",active:v},[]))};'
    'const files=e=>!!e.dataTransfer&&Array.prototype.includes.call(e.dataTransfer.types||[],"Files");'
    'const inside=e=>{const el=this.element;if(!el)return!1;const r=el.getBoundingClientRect();'
    'return r.width>0&&r.height>0&&e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom};'
    'const over=e=>{if(!files(e))return;if(!inside(e))return hover(!1);'
    'e.preventDefault(),e.stopImmediatePropagation(),e.dataTransfer.dropEffect="copy",hover(!0)};'
    'const leave=e=>{(e.type!=="dragleave"||!inside(e))&&hover(!1)};'
    'const drop=e=>{if(!files(e)||!inside(e))return;e.preventDefault(),e.stopImmediatePropagation(),'
    'hover(!1),this._stopBlockingIframeDragEvents();const g=globalThis.vscode?.webUtils?.getPathForFile;'
    'const list=Array.from(e.dataTransfer.files),paths=[],loose=[];'
    'for(const f of list){let p="";try{p=g?g(f):""}catch{}p?paths.push(p):loose.push(f)}'
    'paths.length&&this.postMessage({kind:"attachments",paths},[]);'
    # Ohne Pfad (Screenshot-Vorschau, Bild aus einer App): den Inhalt schicken — nur Bilder, höchstens 40 MB.
    'for(const f of loose){if(!/^image\\//.test(f.type||"")||f.size>41943040){this.postMessage({kind:"attachmentDropFailed",reason:"unreadable"},[]);continue}'
    'const r=new FileReader();r.onload=()=>typeof r.result=="string"&&this.postMessage({kind:"attachmentData",name:f.name||"Bild.png",dataUrl:r.result},[]);'
    'r.onerror=()=>this.postMessage({kind:"attachmentDropFailed",reason:"unreadable"},[]);r.readAsDataURL(f)}'
    # Gar keine Datei, obwohl „Files“ gezogen wurde: ein Dateiversprechen, das noch nicht eingelöst ist.
    '!list.length&&this.postMessage({kind:"attachmentDropFailed",reason:"promise"},[])};'
    'const on_=[["dragenter",over],["dragover",over],["dragleave",leave],["dragend",leave],["drop",drop]];'
    'for(const[t,h]of on_)w.addEventListener(t,h,!0);'
    'this._register({dispose:()=>{for(const[t,h]of on_)w.removeEventListener(t,h,!0)}})})()'
)


def digest(data):
    return base64.b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')


if script not in checksums:
    raise SystemExit(f'Workbench checksum missing: {script}')

# Der Build muss product.json schon entsprechen — frühere Patches tragen ihre
# eigene Prüfsumme ein. Nie eine Änderung absegnen, die nicht von hier stammt.
for name, expected in checksums.items():
    if digest((out / name).read_bytes()) != expected:
        raise SystemExit(f'Unexpected integrity mismatch: {name}')

script_path = out / script
source = script_path.read_text(encoding='utf-8')
if OLD_MARKER in source and marker not in source:
    # Die erste Fassung verwarf Dateien ohne Pfad still; sie wird durch diese ersetzt.
    start = source.index(OLD_MARKER)
    end = source.index('})()', start) + len('})()')
    source = source[:start - 1] + source[end:]
if marker not in source:
    if source.count(anchor) != 1:
        raise SystemExit('Webview-Konstruktor nicht erkannt; Patch abgebrochen')
    source = source.replace(anchor, anchor + ',' + marker + hook)
    script_path.write_text(source, encoding='utf-8')

checksums[script] = digest(script_path.read_bytes())
product_path.write_text(json.dumps(product, indent=2) + '\n')
print('Datei-Drop in Cortex-Webviews aktiviert und Prüfsummen bestätigt.')
