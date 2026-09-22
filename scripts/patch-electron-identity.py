"""Set Electron's app identity before any Keychain/network initialization.
Keep compiled helper bundle names intact: they are binary lookup paths.
"""
import json, sys
from pathlib import Path
app, config = Path(sys.argv[1]), json.loads(Path(sys.argv[2]).read_text())
resources = app / 'Contents/Resources/app'
p = resources / 'package.json'
package = json.loads(p.read_text())
package['name'] = config['nameShort']
package['productName'] = config['nameLong']
package['main'] = './cortex-main.cjs'
p.write_text(json.dumps(package, indent=2) + '\n')
# CJS avoids ESM's eager evaluation of all Electron getters before setName.
(resources / 'cortex-main.cjs').write_text(
    "const electron = require('electron');\n"
    f"electron.app.setName({json.dumps(config['nameShort'])});\n"
    "import('./out/main.js').catch(error => { console.error(error); electron.app.exit(1); });\n"
)
print('Electron identity: ' + config['nameShort'] + ' / dedicated Safe Storage')
