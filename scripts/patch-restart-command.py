#!/usr/bin/env python3
"""Expose native restart and record the resulting Cortex build checksum."""
import base64, hashlib, json, pathlib, re, sys

root = pathlib.Path(sys.argv[1]) / 'Contents/Resources/app'
relative = 'vs/workbench/workbench.desktop.main.js'
path = root / 'out' / relative
product_path = root / 'product.json'
product = json.loads(product_path.read_text())
source = path.read_text()
marker = '/* cortex-native-restart */'
pattern = re.compile(re.escape(marker) + r'[\w$]+\.registerCommand\(\{id:"_cortex\.restartApplication",handler:accessor=>accessor\.get\([\w$]+\)\.restart\(\)\}\);')
original = pattern.sub('', source)
if marker in original:
    raise SystemExit('Unrecognized Cortex restart patch; refusing to update integrity metadata')

def digest(data):
    return base64.b64encode(hashlib.sha256(data).digest()).decode().rstrip('=')

# Verify the upstream file (or our exact existing patch) before updating metadata.
# Never bless unrelated changes or turn off the workbench integrity check.
checksums = product.get('checksums', {})
if relative not in checksums:
    raise SystemExit('Workbench checksum missing')
for name, expected in checksums.items():
    data = (root / 'out' / name).read_bytes()
    acceptable = {digest(data)}
    if name == relative:
        acceptable.add(digest(original.encode()))
    if expected not in acceptable:
        raise SystemExit(f'Unexpected integrity mismatch: {name}')

if marker not in source:
    hosts = set(re.findall(r'\.get\(([\w$]+)\)\.restart\(\)', source))
    registries = set(re.findall(r'([\w$]+)\.registerCommand\(\{id:[^,]+,handler:async\(', source))
    if len(hosts) != 1 or len(registries) != 1:
        raise SystemExit(f'Cannot identify native restart services: {len(hosts)} hosts, {len(registries)} registries')
    anchor = re.search(r'export\{[\w$]+ as main\}', source)
    if not anchor:
        raise SystemExit('Workbench export not found')
    command = marker + next(iter(registries)) + '.registerCommand({id:"_cortex.restartApplication",handler:accessor=>accessor.get(' + next(iter(hosts)) + ').restart()});'
    source = source[:anchor.start()] + command + source[anchor.start():]
    path.write_text(source)
checksums[relative] = digest(path.read_bytes())
product_path.write_text(json.dumps(product, indent=2) + '\n')
print('Native Cortex restart command and build checksum verified.')
