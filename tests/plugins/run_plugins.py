import os
"""Jede Funktion jedes Plugins einmal aufrufen und das Ergebnis festhalten — nichts reparieren.

Regeln:
- Lesende Funktionen laufen gegen die echten Daten.
- Verändernde Funktionen laufen nur dort, wo nichts Echtes berührt wird (Sandbox:
  Gedächtnis in einer Temp-Datei, Browser headless und isoliert). Alles, was
  Projekte, Konten, Clouds oder das Fenster des Nutzers verändert, wird mit Grund
  übersprungen.
- Browser-Server starten mit --headless --isolated (AGENTS.md).

Ergebnis: tests/plugins/results.json
Aufruf: python3 run_plugins.py [plugin ...]
"""
import json
import re
import sys
import tempfile
import time
from pathlib import Path

from mcp_client import StdioServer

HERE = Path(__file__).parent
INV = json.loads((HERE / 'inventory.json').read_text())
PROFILE = Path.home() / '.cortex/profiles/claude-p7ste5uu-qpokah5q/.claude.json'
CATALOG = HERE.parent.parent / 'engine/packages/vscode/media/plugins/catalog.json'
connected = json.loads(PROFILE.read_text()).get('mcpServers', {})
catalog = {e['id']: e for e in json.loads(CATALOG.read_text())['entries']}
TMP = Path(tempfile.mkdtemp(prefix='cortex-plugintest-'))

TEST_PAGE = ('data:text/html,<title>Cortex Test</title><h1>Cortex</h1>'
             '<button id="b" onclick="document.title=\'geklickt\';console.log(\'klick\')">Knopf</button>'
             '<input id="i" aria-label="Feld"><select id="s" aria-label="Wahl"><option>a</option><option>b</option></select>'
             '<input type="file" id="f" aria-label="Datei"><div id="d" draggable="true">Ziehen</div>'
             '<div id="z" role="region" aria-label="Ablage" ondragover="event.preventDefault()" ondrop="event.preventDefault();this.textContent=\'abgelegt\'">Ablage</div>')

SKIP = 'skip'


def definition(name):
    d = dict(connected.get(name) or catalog[name]['definition'])
    if name in ('chrome-devtools', 'playwright'):
        d['args'] = [*d.get('args', []), '--headless', '--isolated']
    if name == 'memory':
        d['env'] = {**d.get('env', {}), 'MEMORY_FILE_PATH': str(TMP / 'memory.jsonl')}
    return d


def sandbox_sqlite():
    import sqlite3
    path = TMP / 'cortex-test.sqlite'
    con = sqlite3.connect(path)
    con.executescript("CREATE TABLE IF NOT EXISTS widgets (id INTEGER PRIMARY KEY, name TEXT, gruppe TEXT);"
                      "DELETE FROM widgets; INSERT INTO widgets (name, gruppe) VALUES ('Wetter','Alltag'),('Timer','Alltag'),('Server','Arbeit');")
    con.commit(); con.close()
    return str(path)


def sandbox_rdb():
    """Ein kleiner Redis-Snapshot in der Sandbox — Vektor öffnet Redis nur als .rdb, und die API hat dafür keinen Befehl."""
    import subprocess
    rdb = TMP / 'cortex-test.rdb'
    port = '6399'
    subprocess.run(['redis-server', '--port', port, '--bind', '127.0.0.1', '--dir', str(TMP), '--dbfilename', rdb.name,
                    '--save', '', '--appendonly', 'no', '--daemonize', 'yes'], check=True, capture_output=True)
    time.sleep(1)
    cli = lambda *a: subprocess.run(['redis-cli', '-p', port, *a], capture_output=True)
    cli('MSET', 'cortex:widget:wetter', 'Frankfurt', 'cortex:widget:timer', '25')
    cli('HSET', 'px:test:node:root', 'id', 'root', 'label', 'Wurzel')
    cli('HSET', 'px:test:node:kind1', 'id', 'kind1', 'label', 'Kind', 'parent', 'root')
    cli('RPUSH', 'cortex:liste', 'a', 'b', 'c')
    cli('SAVE')
    cli('SHUTDOWN', 'NOSAVE')
    subprocess.run(['open', '-g', '-a', '/Applications/Vektor.app', str(rdb)], check=True)
    time.sleep(4)


def sandbox_chart():
    """Ein Helm-Chart aus `helm create` in der Sandbox — kein Repository nötig."""
    import subprocess
    chart = TMP / 'cortex-chart'
    if not chart.exists():
        subprocess.run(['helm', 'create', str(chart)], check=True, capture_output=True)
    return str(chart)


def sandbox_graph():
    import shutil
    source = Path.home() / 'dev/Database System/database-studio/tools/codewiki/out/codewiki.graph'
    target = TMP / 'cortex-test.graph'
    shutil.copyfile(source, target)
    return str(target)


def find(pattern, text, default=None):
    m = re.search(pattern, text or '')
    return m.group(1) if m else default


def sample(schema, name=''):
    """Minimale gültige Werte aus einem JSON-Schema — für Werkzeuge ohne eigenen Fall."""
    if not isinstance(schema, dict):
        return 'Test'
    if 'enum' in schema:
        return schema['enum'][0]
    if 'const' in schema:
        return schema['const']
    for key in ('anyOf', 'oneOf'):
        if key in schema:
            return sample(schema[key][0], name)
    t = schema.get('type')
    if isinstance(t, list):
        t = t[0]
    if t == 'object' or 'properties' in schema:
        props = schema.get('properties', {})
        req = schema.get('required', list(props)[:2])
        return {k: sample(props[k], k) for k in req if k in props}
    if t == 'array':
        n = max(schema.get('minItems', 0), 3)
        return [sample(schema.get('items', {}), name) for _ in range(n)]
    if t in ('number', 'integer'):
        lo = schema.get('minimum', 1)
        hi = schema.get('maximum', lo + 10)
        return min(max(lo, 3), hi) if t == 'integer' else min(max(lo, 3.5), hi)
    if t == 'boolean':
        return False
    if 'date' in name.lower():
        return '2026-09-01'
    return f'{name or "Wert"} A'


def schema_of(plugin, tool):
    return next((t.get('input') or {} for t in INV[plugin]['tools'] if t['name'] == tool), {})


# Jeder Fall: (Werkzeug, Argumente | Funktion(ctx) -> Argumente | (SKIP, Grund))
def cases(plugin):
    today = time.strftime('%Y-%m-%d')
    start = time.strftime('%Y-%m-%d', time.localtime(time.time() - 28 * 86400))
    if plugin == 'database-studio':
        return [
            ('studios_status', {}),
            # Vektor läuft im Hintergrund ohne Fenster: Testdateien aus der Sandbox öffnen, nie echte Daten.
            ('sqlite_open', lambda c: {'path': sandbox_sqlite()}),
            ('graph_open', lambda c: {'path': sandbox_graph()}),
            ('sqlite_tables', {}), ('sqlite_schema', {}),
            ('sqlite_rows', lambda c: {'table': c.get('table') or 'sqlite_master', 'limit': 3}),
            ('sqlite_query', {'sql': 'SELECT 1 AS eins', 'limit': 1}),
            ('sqlite_integrity', {}), ('graph_schema', {}),
            ('graph_query', {'query': 'MATCH (n) RETURN n LIMIT 3'}),
            ('graph_nodes', {'limit': 3}),
            ('graph_node', lambda c: {'id': c.get('node') or 'person_alex', 'withNeighbours': True}),
            ('graph_edges', {'limit': 3}),
            ('graph_upsert_node', {'id': 'cortex-plugintest-loeschen', 'labels': ['CortexTest'], 'properties': {'zweck': 'Schreibschutz-Test'}}),
            ('graph_set_node_properties', {'id': 'cortex-plugintest-loeschen', 'properties': {'zweck': 'Schreibschutz-Test'}}),
            ('graph_upsert_edge', {'type': 'CORTEX_TEST', 'from': 'cortex-plugintest-loeschen', 'to': 'cortex-plugintest-loeschen'}),
            ('graph_delete_edge', lambda c: {'id': c.get('edge') or 'cortex-plugintest-kante'}),
            ('graph_delete_node', {'id': 'cortex-plugintest-loeschen'}),
            ('graph_sources', {}), ('graph_export', {}),
            ('vault_server', {}), ('vault_keys', {'count': 20}),
            ('vault_value', lambda c: {'key': c.get('key') or 'cortex:test', 'limit': 5}),
            ('vault_command', {'args': ['PING']}),
            ('vault_phasex_survey', {}),
            ('vault_phasex_roots', lambda c: {'space': c.get('space') or 'test'}),
            ('vault_phasex_node', lambda c: {'space': c.get('space') or 'test', 'id': c.get('root') or '0'}),
            ('vault_phasex_children', lambda c: {'space': c.get('space') or 'test', 'id': c.get('root') or '0'}),
            ('vault_phasex_edges', lambda c: {'space': c.get('space') or 'test', 'id': c.get('root') or '0'}),
        ]
    if plugin == 'exokortex':
        return [
            ('bestand', {}), ('suche', {'frage': 'Methylenblau', 'n': 3}),
            ('dokument', lambda c: {'id': c.get('doc') or '1'}),
            ('knoten', {'name': 'Alex Beispiel', 'n': 3}),
            ('nachbarn', lambda c: {'id': c.get('knoten') or 'person_alex', 'n': 5}),
        ]
    if plugin == 'xcode':
        # Alles am Wegwerfprojekt ~/Developer/CortexXcodeTest — nie an einem echten Projekt.
        proj = os.path.expanduser('~/Developer/CortexXcodeTest/CortexXcodeTest.xcodeproj')
        base = 'CortexXcodeTest/CortexXcodeTest'
        ws = lambda c, **kw: {**({'workspaceIdentifier': c['ws']} if c.get('ws') else {}), **kw}
        catalog_json = '{"sourceLanguage":"en","strings":{"Hallo":{"localizations":{"en":{"stringUnit":{"state":"translated","value":"Hello"}}}}},"version":"1.0"}'
        return [
            ('XcodeOpenWorkspace', {'path': proj}),
            ('XcodeListWorkspaces', {}),
            ('XcodeListSchemes', lambda c: ws(c)), ('XcodeListTargets', lambda c: ws(c)),
            ('XcodeListTestPlans', lambda c: ws(c)), ('XcodeListRunDestinations', lambda c: ws(c)),
            ('XcodeListTemplates', {'kind': 'target', 'nameFilter': 'Framework', 'platformFilter': ['macOS']}),
            ('XcodeSwitchScheme', lambda c: ws(c, schemeName='CortexXcodeTest')),
            ('XcodeSwitchRunDestination', lambda c: ws(c, displayTitle='My Mac')),
            ('XcodeSwitchTestPlan', lambda c: ws(c, testPlanName='CortexXcodeTest')),
            ('XcodeLS', lambda c: ws(c, path='/', recursive=True)),
            ('XcodeGlob', lambda c: ws(c, pattern='**/*.swift')),
            ('XcodeGrep', lambda c: ws(c, pattern='import', headLimit=5)),
            ('XcodeRead', lambda c: ws(c, filePath=f'{base}/ContentView.swift', limit=40)),
            ('XcodeMakeDir', lambda c: ws(c, directoryPath=f'{base}/CortexTest')),
            ('XcodeWrite', lambda c: ws(c, filePath=f'{base}/CortexTest/Hallo.swift', content='import Foundation\n\nenum Hallo {\n    static let text = "Hallo Cortex"\n}\n')),
            ('XcodeUpdate', lambda c: ws(c, filePath=f'{base}/CortexTest/Hallo.swift', oldString='Hallo Cortex', newString='Hallo aus dem Plugin-Test')),
            ('XcodeMV', lambda c: ws(c, sourcePath=f'{base}/CortexTest/Hallo.swift', destinationPath=f'{base}/CortexTest/Gruss.swift', operation='move')),
            ('XcodeWrite', lambda c: ws(c, filePath=f'{base}/Localizable.xcstrings', content=catalog_json)),
            ('LocalizationPlanner', lambda c: ws(c, targetLocaleIdentifier='de')),
            ('StringCatalogRead', lambda c: ws(c, filePath=f'{base}/Localizable.xcstrings', targetLocaleIdentifier='de')),
            ('StringCatalogContext', lambda c: ws(c, filePath=f'{base}/Localizable.xcstrings', stringKey='Hallo', targetLocaleIdentifier='de')),
            ('StringCatalogEdit', lambda c: ws(c, filePath=f'{base}/Localizable.xcstrings', stringKey='Hallo', targetLocaleIdentifier='de', translation='Hallo')),
            ('GetTargetBuildSettings', lambda c: ws(c, targetName='CortexXcodeTest')),
            ('UpdateTargetBuildSetting', lambda c: ws(c, targetName='CortexXcodeTest', buildSettingName='MARKETING_VERSION', buildSettingValue='1.0.1')),
            ('GetFileCompilerFlags', lambda c: ws(c, targetName='CortexXcodeTest', filePath=f'{base}/ContentView.swift')),
            ('UpdateFileCompilerFlags', lambda c: ws(c, targetName='CortexXcodeTest', filePath=f'{base}/ContentView.swift', compilerFlags='-DCORTEX_TEST')),
            ('AddInfoPlist', lambda c: ws(c, targetName='CortexXcodeTest', infoPlistKey='CortexPluginTest', infoPlistValueType='bool', infoPlistValue='true')),
            ('AddEntitlement', lambda c: ws(c, targetName='CortexXcodeTest', entitlementKey='com.apple.security.network.client', entitlementValueType='bool', entitlementValue='true')),
            ('XcodeNewTarget', lambda c: ws(c, templateIdentifier='com.apple.dt.unit.multiPlatform.framework', productName='CortexTestKit', organizationIdentifier='dev.oskarschiermeister')),
            ('BuildProject', lambda c: ws(c)),
            ('GetBuildLog', lambda c: ws(c, severity='warning')),
            ('XcodeRefreshCodeIssuesInFile', lambda c: ws(c, filePath=f'{base}/ContentView.swift')),
            ('RenderPreview', lambda c: ws(c, sourceFilePath=f'{base}/ContentView.swift', timeout=420)),
            ('RunCodeSnippet', lambda c: ws(c, codeSnippet='print(Hallo.text)', sourceFilePath=f'{base}/CortexTest/Gruss.swift', purpose='Plugin-Test: Snippet ausführen', timeout=180)),
            ('GetTestList', lambda c: ws(c)),
            ('RunSomeTests', lambda c: ws(c, tests=[{'targetName': 'CortexXcodeTestTests', 'testIdentifier': 'CortexXcodeTestTests/example()'}])),
            ('RunAllTests', lambda c: ws(c)),
            ('RunProject', lambda c: ws(c, attachDebugger=True)),
            ('GetConsoleOutput', lambda c: ws(c, tailLimit=20)),
            ('InvokeDebuggerCommand', lambda c: ws(c, command='process status', timeout=30)),
            ('StopProject', lambda c: ws(c)),
            ('XcodeSwitchRunDestination', lambda c: ws(c, displayTitle='iPhone 17')),
            ('DeviceInteractionStartWorkspaceSession', lambda c: ws(c, sessionIdentifier='cortex-test', deviceIdentifier='C18EFC0D-3C27-43AE-8108-A062A07DB99E')),
            ('DeviceInteractionInstallAndRun', lambda c: ws(c, interactionSessionKey=c.get('session', 'cortex-test'))),
            ('DeviceInteractionSynthesize', lambda c: {'interactSessionKey': c.get('session', 'cortex-test'), 'interactionCommand': 't 100 200'}),
            ('DeviceInteractionEndSession', lambda c: {'interactionSessionKey': c.get('session', 'cortex-test')}),
            ('DeviceInteractionStartSession', lambda c: {'deviceIdentifier': 'C18EFC0D-3C27-43AE-8108-A062A07DB99E', 'sessionIdentifier': 'cortex-test-2'}),
            ('XcodeSwitchRunDestination', lambda c: ws(c, displayTitle='My Mac')),
            ('DeviceInteractionEndSession', lambda c: {'interactionSessionKey': c.get('session2', 'cortex-test-2')}),
            ('GetTopCrashIssues', lambda c: ws(c, count=3)),
            ('GetCrashIssueLogs', lambda c: ws(c, signature_name='Test')),
            ('GetTopFieldPerformanceIssues', lambda c: ws(c, diagnostic_type='hang')),
            ('GetFieldPerformanceIssueLogs', lambda c: ws(c, app_version='1.0', signature_name='Test', diagnostic_type='hang')),
            ('XcodeRM', lambda c: ws(c, path=f'{base}/CortexTest', recursive=True, deleteFiles=True)),
            ('XcodeNewProject', {'templateIdentifier': 'com.apple.dt.unit.multiPlatform.app', 'productName': 'CortexXcodeTest2', 'destinationPath': os.path.expanduser('~/Developer')}),
            ('XcodeCloseWorkspace', lambda c: ws(c)),
        ]
    if plugin == 'chrome-devtools':
        p = lambda c, **kw: {'pageId': c.get('page', 1), **kw}
        return [
            ('list_pages', {}), ('new_page', {'url': TEST_PAGE}),
            ('select_page', lambda c: p(c)), ('take_snapshot', lambda c: p(c)),
            ('click', lambda c: p(c, uid=c.get('uid_button', '1_1'))), ('hover', lambda c: p(c, uid=c.get('uid_button', '1_1'))),
            ('fill', lambda c: p(c, uid=c.get('uid_input', '1_2'), value='Hallo')),
            ('fill_form', lambda c: p(c, elements=[{'uid': c.get('uid_input', '1_2'), 'value': 'Formular'}])),
            ('type_text', lambda c: p(c, text=' mehr')), ('press_key', lambda c: p(c, key='Tab')),
            ('drag', lambda c: p(c, from_uid=c.get('uid_drag', '1_4'), to_uid=c.get('uid_input', '1_2'))),
            ('upload_file', lambda c: p(c, uid=c.get('uid_file', '1_3'), filePaths=[str(TMP / 'upload.txt')])),
            ('evaluate_script', lambda c: p(c, function="() => { console.log('cortex-test'); return document.title; }")),
            ('list_console_messages', lambda c: p(c)), ('get_console_message', lambda c: p(c, msgid=int(c.get('msgid', 1)))),
            ('wait_for', lambda c: p(c, text=['Cortex'], timeout=5000)),
            ('emulate', lambda c: p(c, colorScheme='dark')), ('resize_page', lambda c: p(c, width=800, height=600)),
            ('take_screenshot', lambda c: p(c, filePath=str(TMP / 'shot.png'))),
            ('navigate_page', lambda c: p(c, type='url', url='https://example.com', timeout=20000)),
            ('list_network_requests', lambda c: p(c)), ('get_network_request', lambda c: p(c, reqid=int(c.get('reqid', 1)))),
            ('evaluate_script', lambda c: p(c, function="() => { setTimeout(() => alert('hallo'), 50); return 'ok'; }")),
            ('handle_dialog', lambda c: p(c, action='accept')),
            ('performance_start_trace', lambda c: p(c, reload=True, autoStop=False)),
            ('performance_stop_trace', lambda c: p(c)),
            ('performance_analyze_insight', lambda c: p(c, insightSetId=c.get('insightSet', 'NAVIGATION_0'), insightName=c.get('insight', 'LCPBreakdown'))),
            ('lighthouse_audit', lambda c: p(c, mode='snapshot', device='desktop', outputDirPath=str(TMP))),
            ('take_heapsnapshot', lambda c: p(c, filePath=str(TMP / 'heap.heapsnapshot'))),
            ('close_page', lambda c: p(c)),
        ]
    if plugin == 'playwright':
        return [
            ('browser_navigate', {'url': TEST_PAGE}), ('browser_snapshot', {}),
            ('browser_find', {'text': 'Knopf'}),
            ('browser_click', lambda c: {'target': c.get('ref_button', 'e3'), 'element': 'Knopf'}),
            ('browser_hover', lambda c: {'target': c.get('ref_button', 'e3'), 'element': 'Knopf'}),
            ('browser_type', lambda c: {'target': c.get('ref_input', 'e4'), 'element': 'Feld', 'text': 'Hallo'}),
            ('browser_fill_form', lambda c: {'fields': [{'target': c.get('ref_input', 'e4'), 'name': 'Feld', 'type': 'textbox', 'value': 'Formular'}]}),
            ('browser_select_option', lambda c: {'target': c.get('ref_select', 'e5'), 'element': 'Wahl', 'values': ['b']}),
            ('browser_press_key', {'key': 'Tab'}),
            ('browser_drag', lambda c: {'startTarget': c.get('ref_drag', 'e7'), 'startElement': 'Ziehen', 'endTarget': c.get('ref_input', 'e4'), 'endElement': 'Feld'}),
            ('browser_file_upload', (SKIP, 'braucht einen offenen Dateiauswahl-Dialog — wird über browser_click auf das Dateifeld ausgelöst')),
            ('browser_drop', lambda c: {'target': c.get('ref_drop', 'e8'), 'element': 'Ablage', 'paths': [str(HERE / '.playwright-mcp' / 'upload.txt')]}),
            ('browser_evaluate', {'function': "() => { console.log('cortex-test'); return document.title; }"}),
            ('browser_console_messages', {'level': 'info'}),
            ('browser_run_code_unsafe', {'code': 'async (page) => await page.title()'}),
            ('browser_resize', {'width': 800, 'height': 600}),
            ('browser_take_screenshot', {'scale': 'css', 'type': 'png', 'filename': 'pw-test.png'}),
            ('browser_tabs', {'action': 'list'}),
            ('browser_navigate', {'url': 'https://example.com'}),
            ('browser_network_requests', {'static': False}), ('browser_network_request', {'index': 1, 'part': 'response-headers'}),
            ('browser_navigate_back', {}), ('browser_wait_for', {'text': 'Cortex'}),
            ('browser_evaluate', {'function': "() => { setTimeout(() => alert('hallo'), 50); return 'ok'; }"}),
            ('browser_handle_dialog', {'accept': True}),
            ('browser_close', {}),
        ]
    if plugin == 'youtube-kanal':
        dates = {'startDate': start, 'endDate': today}
        vid = lambda c, **kw: {'videoId': c.get('video') or 'dQw4w9WgXcQ', **kw}
        return [
            ('check_auth_status', {}), ('get_server_info', {}), ('list_channels', {}), ('get_channel_info', {}),
            ('get_channel_videos', {}), ('get_video_details', lambda c: vid(c)),
            *[(t, dates) for t in ['get_channel_overview', 'get_average_view_percentage', 'get_watch_time_metrics', 'get_revenue_metrics',
                                   'get_top_videos', 'get_video_demographics', 'get_geographic_distribution', 'get_subscriber_analytics',
                                   'get_device_analytics', 'get_optimal_posting_time', 'get_traffic_sources', 'get_playlist_performance',
                                   'get_engagement_metrics', 'get_sharing_analytics']],
            ('get_comparison_metrics', {'metrics': ['views'], 'period1Start': start, 'period1End': today,
                                        'period2Start': time.strftime('%Y-%m-%d', time.localtime(time.time() - 56 * 86400)), 'period2End': start}),
            *[(t, lambda c: vid(c, **dates)) for t in ['get_search_terms', 'get_audience_retention', 'get_retention_dropoff_points',
                                                         'get_card_endscreen_performance', 'get_video_performance_over_time']],
            ('revoke_auth', (SKIP, 'meldet das YouTube-Konto ab')),
        ]
    if plugin == 'memory':
        return [
            ('create_entities', {'entities': [{'name': 'Cortex', 'entityType': 'App', 'observations': ['IDE']}, {'name': 'Alex', 'entityType': 'Person', 'observations': ['Frankfurt']}]}),
            ('create_relations', {'relations': [{'from': 'Alex', 'to': 'Cortex', 'relationType': 'baut'}]}),
            ('add_observations', {'observations': [{'entityName': 'Cortex', 'contents': ['Widgets im Chat']}]}),
            ('read_graph', {}), ('search_nodes', {'query': 'Cortex'}), ('open_nodes', {'names': ['Cortex']}),
            ('delete_observations', {'deletions': [{'entityName': 'Cortex', 'observations': ['Widgets im Chat']}]}),
            ('delete_relations', {'relations': [{'from': 'Alex', 'to': 'Cortex', 'relationType': 'baut'}]}),
            ('delete_entities', {'entityNames': ['Cortex', 'Alex']}),
        ]
    if plugin == 'sequential-thinking':
        return [('sequentialthinking', {'thought': 'Erster Gedanke: Plugin-Test.', 'nextThoughtNeeded': False, 'thoughtNumber': 1, 'totalThoughts': 1})]
    if plugin == 'shopify':
        return [
            ('learn_shopify_api', {'api': 'admin'}),
            ('search_docs_chunks', lambda c: {'conversationId': c.get('conv', 'cortex-test'), 'prompt': 'product variants', 'max_num_results': 2}),
            ('validate_graphql_codeblocks', lambda c: {'conversationId': c.get('conv', 'cortex-test'), 'api': 'admin', 'codeblocks': [{'content': 'query { shop { name } }', 'artifactId': 'cortex-test', 'revision': 1}]}),
            ('validate_component_codeblocks', lambda c: {'conversationId': c.get('conv', 'cortex-test'), 'api': 'polaris-app-home', 'code': [{'content': '```html\n<s-page><s-text>Hallo</s-text></s-page>\n```', 'artifactId': 'cortex-test-ui', 'revision': 1}]}),
            ('validate_theme', (SKIP, 'braucht ein Shopify-Theme auf der Platte')),
            ('feedback', (SKIP, 'schickt Rückmeldung an Shopify')),
        ]
    if plugin == 'firebase':
        cloud = 'legt an, verändert oder veröffentlicht in einem Firebase-Konto'
        return [
            ('firebase_get_environment', {}), ('firebase_list_projects', {'page_size': 3}), ('firebase_get_project', {}),
            ('firebase_list_apps', {'platform': 'all'}), ('firebase_get_sdk_config', {'platform': 'web'}),
            ('firebase_get_security_rules', {'type': 'firestore'}), ('firebase_read_resources', {'uris': []}),
            ('developerknowledge_search_documents', {'query': 'Firestore Sicherheitsregeln'}),
            ('developerknowledge_answer_query', {'query': 'Wie lese ich ein Dokument aus Firestore?'}),
            ('developerknowledge_get_documents', lambda c: {'names': [c.get('fbdoc') or 'documents/firebase.google.com/docs/firestore']}),
            ('firebase_deploy_status', (SKIP, 'braucht eine laufende Veröffentlichung')),
            *[(t, (SKIP, cloud)) for t in ['firebase_create_project', 'firebase_create_app', 'firebase_create_android_sha', 'firebase_init',
                                           'firebase_deploy', 'firebase_update_environment']],
            ('firebase_login', (SKIP, 'öffnet eine Google-Anmeldung')), ('firebase_logout', (SKIP, 'meldet ein Konto ab')),
        ]
    if plugin == 'kubernetes':
        # Nur im lokalen Test-Cluster (Colima/k3s), alles im Namespace cortex-test, am Ende gelöscht.
        ns = 'cortex-test'
        deployment = ('apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: cortex-web\n  namespace: cortex-test\nspec:\n  replicas: 1\n'
                      '  selector:\n    matchLabels: {app: cortex-web}\n  template:\n    metadata:\n      labels: {app: cortex-web}\n'
                      '    spec:\n      containers:\n      - name: web\n        image: nginx:alpine\n        ports:\n        - containerPort: 80\n')
        return [
            ('ping', {}), ('kubectl_reconnect', {}), ('kubectl_context', {'operation': 'list'}), ('list_api_resources', {}),
            ('explain_resource', {'resource': 'pods'}),
            ('kubectl_create', {'resourceType': 'namespace', 'name': ns}),
            ('kubectl_apply', {'manifest': deployment, 'namespace': ns}),
            ('kubectl_rollout', {'subCommand': 'status', 'resourceType': 'deployment', 'name': 'cortex-web', 'namespace': ns, 'timeout': '180s'}),
            ('kubectl_get', {'resourceType': 'pods', 'namespace': ns, 'output': 'name'}),
            ('kubectl_describe', {'resourceType': 'deployment', 'name': 'cortex-web', 'namespace': ns}),
            ('kubectl_scale', {'name': 'cortex-web', 'namespace': ns, 'replicas': 2, 'resourceType': 'deployment'}),
            ('kubectl_patch', {'resourceType': 'deployment', 'name': 'cortex-web', 'namespace': ns, 'patchType': 'merge', 'patchData': {'metadata': {'labels': {'cortex': 'test'}}}}),
            ('kubectl_logs', lambda c: {'resourceType': 'pod', 'name': c.get('pod', 'cortex-web'), 'namespace': ns, 'tail': 5}),
            ('exec_in_pod', lambda c: {'name': c.get('pod', 'cortex-web'), 'namespace': ns, 'command': ['nginx', '-v']}),
            ('port_forward', lambda c: {'resourceType': 'pod', 'resourceName': c.get('pod', 'cortex-web'), 'localPort': 18080, 'targetPort': 80, 'namespace': ns}),
            ('stop_port_forward', lambda c: {'id': c.get('pf') or f"pod-{c.get('pod', 'cortex-web')}-18080"}),
            ('kubectl_generic', {'command': 'get', 'resourceType': 'deployments', 'namespace': ns, 'outputFormat': 'wide'}),
            ('node_management', {'operation': 'cordon', 'nodeName': 'colima'}),
            ('node_management', {'operation': 'uncordon', 'nodeName': 'colima'}),
            ('node_management', {'operation': 'drain', 'nodeName': 'colima', 'dryRun': True, 'ignoreDaemonsets': True, 'deleteLocalData': True}),
            ('node_management', {'operation': 'drain', 'nodeName': 'colima', 'dryRun': True, 'ignoreDaemonsets': True}),
            ('install_helm_chart', lambda c: {'name': 'cortex-chart', 'chart': sandbox_chart(), 'namespace': ns, 'values': {'replicaCount': 1}}),
            ('upgrade_helm_chart', lambda c: {'name': 'cortex-chart', 'chart': sandbox_chart(), 'namespace': ns, 'values': {'replicaCount': 1, 'podLabels': {'cortex': 'upgrade'}}}),
            ('uninstall_helm_chart', {'name': 'cortex-chart', 'namespace': ns}),
            ('kubectl_rollout', {'subCommand': 'history', 'resourceType': 'deployment', 'name': 'cortex-web', 'namespace': ns}),
            ('kubectl_delete', {'resourceType': 'namespace', 'name': ns}),
            ('cleanup', {}),
        ]
    if plugin == 'antv-chart':
        special = {
            'generate_dual_axes_chart': {'categories': ['2024', '2025', '2026'], 'series': [{'type': 'column', 'data': [10, 20, 30], 'axisYTitle': 'Umsatz'}, {'type': 'line', 'data': [1, 2, 3], 'axisYTitle': 'Wachstum'}]},
            'generate_fishbone_diagram': {'data': {'name': 'Absprung', 'children': [{'name': 'Preis', 'children': [{'name': 'zu hoch'}]}, {'name': 'Versand', 'children': [{'name': 'zu langsam'}]}]}},
            'generate_flow_diagram': {'data': {'nodes': [{'name': 'Lead'}, {'name': 'Scrape'}, {'name': 'Speichern'}], 'edges': [{'source': 'Lead', 'target': 'Scrape'}, {'source': 'Scrape', 'target': 'Speichern'}]}},
            'generate_network_graph': {'data': {'nodes': [{'name': 'Alex'}, {'name': 'Cortex'}, {'name': 'Exokortex'}], 'edges': [{'source': 'Alex', 'target': 'Cortex'}, {'source': 'Cortex', 'target': 'Exokortex'}]}},
            'generate_venn_chart': {'data': [{'label': 'A', 'value': 10, 'sets': ['A']}, {'label': 'B', 'value': 8, 'sets': ['B']}, {'label': 'AB', 'value': 3, 'sets': ['A', 'B']}]},
            'generate_violin_chart': {'data': [{'category': 'A', 'value': v} for v in (1, 2, 3, 4, 5)] + [{'category': 'B', 'value': v} for v in (2, 3, 5, 8, 9)]},
        }
        return [(t['name'], special.get(t['name']) or sample(t.get('input') or {})) for t in INV['antv-chart']['tools']]
    return []


def learn(plugin, tool, text, ctx):
    """Kennungen aus Antworten für die nächsten Aufrufe merken."""
    if tool == 'sqlite_tables':
        ctx['table'] = find(r'"(?:name|table)"\s*:\s*"([^"]+)"', text) or find(r'^\W*(\w+)', text)
    if tool == 'graph_upsert_edge':
        ctx['edge'] = find(r'"id"\s*:\s*"([^"]+)"', text)
    if tool == 'graph_nodes':
        ctx['node'] = find(r'"id"\s*:\s*"([^"]+)"', text)
    if tool == 'vault_keys':
        ctx['key'] = find(r'"key"\s*:\s*"([^"]+)"', text)
    if tool == 'vault_phasex_survey':
        ctx['space'] = find(r'"(?:space|raum)"\s*:\s*"([^"]+)"', text) or find(r'px:([^:\s"]+):node', text)
    if tool == 'vault_phasex_roots':
        ctx['root'] = find(r'"id"\s*:\s*"([^"]+)"', text)
    if tool == 'suche':
        ctx['doc'] = find(r'id[:=]\s*([\w:./#-]+)', text) or find(r'\[([\w:./#-]+)\]', text)
    if tool == 'knoten':
        ctx['knoten'] = find(r'id:\s*([\w:./-]+)', text)
    if tool == 'XcodeOpenWorkspace':
        ctx['ws'] = find(r'"workspaceIdentifier"\s*:\s*"([^"]+)"', text)
    if tool in ('DeviceInteractionStartWorkspaceSession', 'DeviceInteractionStartSession'):
        key = find(r'"interactionSessionKey"\s*:\s*"([^"]+)"', text) or find(r'[Ss]ession[ _-]?[Kk]ey\W+([\w-]+)', text)
        if key:
            ctx['session' if tool.endswith('WorkspaceSession') else 'session2'] = key
    if tool == 'XcodeListRunDestinations':
        ctx['sim'] = find(r'"displayTitle":"(iPhone[^"]*)"', text)
    if tool == 'XcodeListWorkspaces' and not ctx.get('ws'):
        ctx['ws'] = find(r'"workspaceIdentifier"\s*:\s*"([^"]+)"', text) or find(r'workspaceIdentifier\W+([\w-]+)', text)
    if tool == 'XcodeListTargets':
        ctx['target'] = find(r'"name"\s*:\s*"([^"]+)"', text)
    if tool == 'XcodeGlob':
        ctx['swift'] = find(r'([\w./ -]+\.swift)', text)
    if tool in ('new_page', 'list_pages'):
        ctx['page'] = int(find(r'(\d+):[^\n]*\[selected\]', text) or find(r'^(\d+):', text) or ctx.get('page', 1))
    if tool == 'take_snapshot':
        ctx['uid_button'] = find(r'uid=(\S+) button', text)
        ctx['uid_input'] = find(r'uid=(\S+) textbox', text)
        ctx['uid_file'] = find(r'uid=(\S+) button "Datei', text) or find(r'uid=(\S+)[^\n]*Datei', text)
        ctx['uid_drag'] = find(r'uid=(\S+) StaticText "Ziehen"', text)
    if tool == 'list_console_messages':
        ctx['msgid'] = find(r'msgid=(\d+)', text)
    if tool == 'list_network_requests':
        ctx['reqid'] = find(r'reqid=(\d+)', text)
    if tool == 'performance_stop_trace':
        (HERE / 'trace-answer.txt').write_text(text)
        ctx['insightSet'] = find(r'(?m)^##\s*insight set id:\s*(\S+)', text) or find(r'\bid:\s*(NAVIGATION_\d+|NO_NAVIGATION)', text) or 'NO_NAVIGATION'
        ctx['insight'] = find(r'(?m)^\s*-\s*insight name:\s*(\w+)', text) or find(r'(?i)insight name\W+(\w+)', text) or 'LCPBreakdown'
    if tool == 'browser_snapshot':
        ctx['ref_button'] = find(r'button "Knopf" \[ref=(\w+)\]', text)
        ctx['ref_input'] = find(r'textbox "Feld" \[ref=(\w+)\]', text)
        ctx['ref_select'] = find(r'combobox "Wahl" \[ref=(\w+)\]', text)
        ctx['ref_drop'] = find(r'region "Ablage" \[ref=(\w+)\]', text)
        ctx['ref_drag'] = find(r'generic \[ref=(\w+)\]: Ziehen', text) or find(r'"Ziehen" \[ref=(\w+)\]', text)
    if tool == 'kubectl_get' and plugin == 'kubernetes':
        ctx['pod'] = find(r'pod/([\w.-]+)', text) or ctx.get('pod')
    if tool == 'port_forward':
        ctx['pf'] = find(r'"id"\s*:\s*"([^"]+)"', text)
    if tool == 'get_channel_videos':
        ctx['video'] = find(r'youtu\.be/([\w-]{11})', text) or find(r'"(?:videoId|id)"\s*:\s*"([\w-]{11})"', text)
    if tool == 'learn_shopify_api':
        ctx['conv'] = find(r'CONVERSATION ID:\*\*\s*([\w-]{8,})', text) or find(r'conversationId\W+([\w-]{8,})', text)
    if tool == 'developerknowledge_search_documents':
        ctx['fbdoc'] = find(r'"(documents/[^"]+)"', text) or find(r'(documents/\S+)', text)


def run(plugin):
    (TMP / 'upload.txt').write_text('Cortex Test')
    (HERE / '.playwright-mcp').mkdir(exist_ok=True)
    (HERE / '.playwright-mcp' / 'upload.txt').write_text('Cortex Test')
    results = []
    d = definition(plugin)
    if plugin == 'database-studio':
        sandbox_rdb()
    t0 = time.time()
    try:
        server = StdioServer(d['command'], d.get('args', []), d.get('env'), start_timeout=240)
    except Exception as e:
        return {'ok': False, 'error': str(e)[:600], 'results': []}
    ctx = {}
    try:
        for tool, spec in cases(plugin):
            if isinstance(spec, tuple) and spec[0] == SKIP:
                results.append({'tool': tool, 'status': 'übersprungen', 'note': spec[1]})
                continue
            args = spec(ctx) if callable(spec) else spec
            started = time.time()
            try:
                res = server.call(tool, args, timeout=600 if plugin == 'xcode' else 150)
                text = res['text']
                learn(plugin, tool, text, ctx)
                if tool == 'RunProject':
                    time.sleep(10)
                status = 'fehler' if res['isError'] else ('leer' if not text.strip() and not res['raw'].get('content') else 'ok')
                results.append({'tool': tool, 'status': status, 'ms': int((time.time() - started) * 1000), 'args': args, 'answer': text[:700]})
            except Exception as e:
                results.append({'tool': tool, 'status': 'ausnahme', 'ms': int((time.time() - started) * 1000), 'args': args, 'answer': str(e)[:700]})
                if server.proc.poll() is not None:
                    server = StdioServer(d['command'], d.get('args', []), d.get('env'), start_timeout=240)
            print(f'  {plugin}.{tool}: {results[-1]["status"]}', flush=True)
    finally:
        stderr = server.stderr[-1500:].decode(errors='replace')
        server.close()
    return {'ok': True, 'ms': int((time.time() - t0) * 1000), 'results': results, 'stderr': stderr}


if __name__ == '__main__':
    names = sys.argv[1:] or ['exokortex', 'database-studio', 'xcode', 'chrome-devtools', 'youtube-kanal', 'playwright', 'memory',
                             'sequential-thinking', 'antv-chart', 'shopify', 'firebase', 'kubernetes']
    path = HERE / 'results.json'
    all_results = json.loads(path.read_text()) if path.exists() else {}
    for name in names:
        print(name, flush=True)
        all_results[name] = run(name)
        path.write_text(json.dumps(all_results, ensure_ascii=False, indent=1))
    print('Sandbox:', TMP)
