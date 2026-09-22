"""Welche Werkzeuge hat jedes Plugin wirklich? Startet jeden Server und liest tools/list.

Verbunden = was Cortex in das Claude-Profil gespiegelt hat (dieselbe Liste geht an Codex und Grok).
Schlüssellos = Katalogeinträge ohne Schlüssel oder Anmeldung.
Ergebnis: tests/plugins/inventory.json
"""
import json, os, sys, time
from pathlib import Path
from mcp_client import StdioServer, McpError

HERE = Path(__file__).parent
PROFILE = Path.home() / '.cortex/profiles/claude-p7ste5uu-qpokah5q/.claude.json'
CATALOG = HERE.parent.parent / 'engine/packages/vscode/media/plugins/catalog.json'
HEADLESS = {'chrome-devtools': ['--headless', '--isolated'], 'playwright': ['--headless', '--isolated']}

connected = json.loads(PROFILE.read_text()).get('mcpServers', {})
catalog = {e['id']: e for e in json.loads(CATALOG.read_text())['entries']}
keyless = [i for i, e in catalog.items() if not e.get('requires') and 'command' in e.get('definition', {})]

targets = [(name, d, 'verbunden') for name, d in connected.items()]
targets += [(i, catalog[i]['definition'], 'schlüssellos') for i in keyless if i not in connected]
only = set(sys.argv[1:])
out = {}
for name, d, kind in targets:
    if only and name not in only:
        continue
    entry = {'kind': kind, 'transport': 'http' if 'url' in d else 'stdio'}
    if 'url' in d:
        entry.update(ok=False, error='Entfernter Server — Anmeldung liegt beim Anbieter-Client, hier nicht prüfbar')
        out[name] = entry; print(name, 'übersprungen (URL)'); continue
    t0 = time.time()
    server = None
    try:
        server = StdioServer(d['command'], [*d.get('args', []), *HEADLESS.get(name, [])], d.get('env'), start_timeout=240)
        tools = server.tools()
        entry.update(ok=True, ms=int((time.time() - t0) * 1000), server=server.info.get('serverInfo'),
                     tools=[{'name': t['name'], 'description': (t.get('description') or '')[:300], 'input': t.get('inputSchema'),
                             'annotations': t.get('annotations')} for t in tools])
        print(name, len(tools), 'Werkzeuge')
    except Exception as e:
        entry.update(ok=False, error=str(e)[:800], stderr=(server.stderr[-800:].decode(errors='replace') if server else ''))
        print(name, 'FEHLER', str(e)[:200])
    finally:
        if server: server.close()
    out[name] = entry
prev = json.loads((HERE / 'inventory.json').read_text()) if (HERE / 'inventory.json').exists() and only else {}
prev.update(out)
(HERE / 'inventory.json').write_text(json.dumps(prev, ensure_ascii=False, indent=1))
