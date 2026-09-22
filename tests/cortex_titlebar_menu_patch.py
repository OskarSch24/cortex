"""Validate the scoped titlebar patch against a disposable installed-bundle copy.

Never starts or edits Cortex. The actual bundled JavaScript is syntax checked;
the injected adapter is exercised with service doubles to verify its scope.
"""
from pathlib import Path
import hashlib
import json
import os
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/patch-titlebar-menu.py'
SOURCE = Path(os.environ.get('CORTEX_TEST_APP', '/Applications/Cortex.app')) / 'Contents/Resources/app'

with tempfile.TemporaryDirectory(prefix='cortex-menu-patch-') as directory:
    app = Path(directory) / 'Cortex.app'
    target = app / 'Contents/Resources/app'
    product = json.loads((SOURCE / 'product.json').read_text())
    names = ['product.json', 'out/main.js', *('out/' + name for name in product['checksums'])]
    for name in names:
        destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SOURCE / name, destination)
    installed_hashes = {name: hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() for name in names}

    old_argv = sys.argv
    try:
        sys.argv = [str(SCRIPT), str(app)]
        patch = runpy.run_path(str(SCRIPT))
    finally:
        sys.argv = old_argv
    source_path = target / 'out' / patch['script']
    css_path = target / 'out' / patch['style']
    source = source_path.read_text()
    css = css_path.read_text()
    assert source.count(patch['brand_marker']) == 1
    assert source.count(patch['brand_entry']) == 1
    assert css.count(patch['brand_marker']) == css.count(patch['brand_end']) == 1
    assert patch['brand_rules'] in css
    assert 'showContextMenu(e){this.impl.showContextMenu(e)}' in source, 'Global native menu service changed'
    subprocess.run(['node', '--check', str(source_path)], check=True, capture_output=True)

    first = {name: (target / name).read_bytes() for name in names}
    subprocess.run([sys.executable, str(SCRIPT), str(app)], check=True, capture_output=True)
    assert all((target / name).read_bytes() == data for name, data in first.items()), 'Patch is not idempotent'

    adapter = Path(directory) / 'adapter.mjs'
    adapter.write_text('''import assert from 'node:assert/strict';
const calls = [], registrations = [];
const gt = Symbol('contextMenu');
class v$t {
  onDidShowContextMenu = () => {};
  onDidHideContextMenu = () => {};
  showContextMenu(delegate) { calls.push(delegate); }
}
class yn { constructor(...entries) { this.entries = new Map(entries); } }
const service = { createInstance: Type => new Type(), createChild: collection => ({ provider: collection.entries.get(gt) }) };
const zc = (instantiation, action, options) => ({ instantiation, action, options });
const owner = { instantiationService: service, _register(value) { registrations.push(value); return value; } };
const route = function(e,t) { ''' + patch['brand_entry'] + ''' };
const originalOptions = { keybindingProvider: () => '⌘K' };
const foreign = route.call(owner, { id: 'submenuitem.api.other.menu' }, originalOptions);
assert.equal(foreign.instantiation, service);
assert.equal(registrations.length, 0);
const action = { id: 'submenuitem.api:cortex.chatMenu' };
const cortex = route.call(owner, action, originalOptions);
assert.notEqual(cortex.instantiation, service);
assert.equal(cortex.action, action);
assert.equal(cortex.options.keybindingProvider, originalOptions.keybindingProvider);
assert.equal(cortex.options.menuAsChild, false);
const delegates = { getActions: () => [{ id: 'cortex.archiveChat', enabled: false }], getAnchor: () => 'anchor', onHide: () => {}, actionRunner: {} };
cortex.instantiation.provider.showContextMenu(delegates);
assert.equal(calls[0].getMenuClassName(), 'cortex-context-menu');
for (const key of Object.keys(delegates)) assert.equal(calls[0][key], delegates[key]);
assert.equal(route.call(owner, action, originalOptions).instantiation, cortex.instantiation);
assert.equal(registrations.length, 2, 'DOM service and scope should be allocated once');
assert.equal(route.call(owner, { id: 'editor.action.menu' }, originalOptions).instantiation, service);
console.log('Titlebar adapter: scoped Cortex menu, unchanged commands/delegates, cached service passed.');
''')
    subprocess.run(['node', str(adapter)], check=True)

    # A changed upstream anchor fails before main.js, CSS, or product.json can
    # be partially written. Reconstruct just the relevant unpatched anchors.
    source = source.replace(patch['brand_entry'], patch['brand_anchor'])
    source = source.replace(patch['brand_anchor'], 'return upstreamMenuServiceChanged()')
    source_path.write_text(source)
    main = target / 'out/main.js'
    main.write_text(main.read_text().replace(patch['buttons_entry'], patch['buttons_anchor']))
    product = json.loads((target / 'product.json').read_text())
    product['checksums'][patch['script']] = patch['digest'](source_path.read_bytes())
    (target / 'product.json').write_text(json.dumps(product))
    before_failure = {name: (target / name).read_bytes() for name in names}
    result = subprocess.run([sys.executable, str(SCRIPT), str(app)], capture_output=True, text=True)
    assert result.returncode and 'Titelleisten-Menüservice nicht erkannt' in result.stderr, result.stderr
    assert all((target / name).read_bytes() == data for name, data in before_failure.items()), 'Failed patch modified bundle'
    assert all(hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == digest for name, digest in installed_hashes.items()), 'Installed app was modified'
    print('Titlebar patch: actual bundle syntax, checksum update, idempotence and no writes on mismatched anchors passed.')
