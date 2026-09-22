#!/usr/bin/env python3
"""Nimmt dem leeren Editorbereich das Wasserzeichen und verbucht die Prüfsummen.

Beim Start ist die Editorfläche für einen Moment leer: die Workbench ist da,
die Erweiterung aber noch nicht aktiviert, und erst sie macht den Chat auf. In
diesem Moment zeigt Code-OSS sein Wasserzeichen — das große Produktlogo und
darunter eine Liste von Tastenkürzeln.

`workbench.tips.enabled: false` nimmt nur die Kürzelliste; das Logo bleibt,
weil es als Hintergrundbild an `.editor-group-watermark .letterpress` hängt.
Für Cortex ist beides eine Zwischenansicht, die niemand angefordert hat: die
Software soll direkt dastehen.

Eine Einstellung dafür gibt es nicht, deshalb eine Regel im Stylesheet — nach
demselben Muster wie die übrigen `patch-*.py`, samt Prüfsummen in product.json,
sonst hielte Code-OSS die Datei für beschädigt.
"""
import base64, hashlib, json, pathlib, sys

root = pathlib.Path(sys.argv[1]) / 'Contents/Resources/app'
out = root / 'out'
product_path = root / 'product.json'
product = json.loads(product_path.read_text())
checksums = product.get('checksums', {})

marker = '/* cortex-empty-editor v2 */'
# Frühere Fassung: sie verlangte das Wasserzeichen als direktes Kind des
# Containers. Seit VSCodium 1.12x steckt es in `.editor-group-watermark-wrapper`
# — die Regel griff ins Leere, und beim Start stand wieder das Logo da.
old_marker = '/* cortex-empty-editor */'
# Das Wasserzeichen als Ganzes, gleich wie tief es verschachtelt ist: Logo und
# Kürzelliste sitzen darin.
rules = (
    '.monaco-workbench .part.editor>.content .editor-group-container .editor-group-watermark-wrapper,'
    '.monaco-workbench .part.editor>.content .editor-group-container .editor-group-watermark{display:none!important}'
)

# Die Sessions-Oberfläche bringt dieselbe Regel noch einmal mit; welche
# Stylesheets ein Build hat, hängt von der VSCodium-Version ab.
candidates = [
    'vs/workbench/workbench.desktop.main.css',
    'vs/sessions/sessions.desktop.main.css',
]


def digest(data):
    return base64.b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')


sheets = [name for name in candidates if (out / name).exists()]
if not sheets:
    raise SystemExit('Kein Workbench-Stylesheet gefunden; Patch abgebrochen')

# Der Build muss schon zu product.json passen — frühere Patches verbuchen ihre
# eigene Prüfsumme. Was dieses Skript nicht geändert hat, wird nicht abgesegnet.
for name, expected in checksums.items():
    if digest((out / name).read_bytes()) != expected:
        raise SystemExit(f'Unerwartete Abweichung der Prüfsumme: {name}')

touched = []
for name in sheets:
    path = out / name
    sheet = path.read_text(encoding='utf-8')
    if marker in sheet:
        continue
    # Eine alte Regel wird ersetzt, nicht übersprungen.
    sheet = '\n'.join(line for line in sheet.split('\n') if not line.startswith(old_marker))
    if 'editor-group-watermark' not in sheet:
        # Heißt die Klasse in dieser Version anders, wird lieber nichts
        # geschrieben als eine Regel, die ins Leere greift.
        continue
    path.write_text(sheet + '\n' + marker + rules + '\n', encoding='utf-8')
    touched.append(name)

for name in sheets:
    if name in checksums or name in touched:
        checksums[name] = digest((out / name).read_bytes())

product['checksums'] = checksums
product_path.write_text(json.dumps(product, indent=2) + '\n')
print(f'Leerer Editorbereich ohne Wasserzeichen ({len(touched)} Stylesheet(s) angepasst).')
