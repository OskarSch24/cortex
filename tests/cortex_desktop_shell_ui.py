"""The real Cortex renderer with its own desktop shell, no desktop browser.

The IPC host is simulated. Monaco and xterm are real compiled dependencies;
this checks their UI, message contract and layout without spawning a shell,
connecting an account or invoking a provider. Build the desktop package first
or set CORTEX_SHELL_TEST_ASSETS to a local shell/worker output directory.
"""
import functools
import http.server
import os
from pathlib import Path
import threading

from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
ASSETS = Path(os.environ.get('CORTEX_SHELL_TEST_ASSETS', ROOT / 'engine/packages/desktop/dist/renderer'))
assert (ASSETS / 'shell.js').exists(), f'Build shell.js first: {ASSETS}'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
port = server.server_address[1]
origin = f'http://127.0.0.1:{port}'
relative_assets = ASSETS.relative_to(ROOT).as_posix()

try:
    with headless_browser(port=port) as browser:
        page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'{origin}/engine/packages/vscode/dev/preview.html?mode=agent')
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(node) => node.remove()')
        page.evaluate('''() => {
          window.__shellMessages = [];
          window.cortexDesktop = {
            send: message => window.__shellMessages.push(message),
            subscribe: listener => { window.__emitShell = listener; },
            getFilePath: () => ''
          };
        }''')
        page.add_style_tag(url=f'{origin}/{relative_assets}/shell.css')
        page.add_script_tag(url=f'{origin}/{relative_assets}/shell.js')
        page.wait_for_function('window.__shellMessages.some(message => message.type === "shell-ready")')

        def emit(type_name, **values):
            page.evaluate('message => window.__emitShell(message)', {'type': type_name, **values})

        def last_message(type_name):
            return page.evaluate('type => window.__shellMessages.filter(message => message.type === type).at(-1)', type_name)

        def wait_message(type_name, field=None, value=None):
            page.wait_for_function('([type, key, value]) => window.__shellMessages.some(message => message.type === type && (!key || message[key] === value))', arg=[type_name, field, value])

        toolbar = page.get_by_role('toolbar', name='Chat-Werkzeuge')
        expect(toolbar).to_be_visible()
        expect(page.locator('.cx-shell')).to_be_visible()
        emit('window-state', fullscreen=False)
        assert page.locator('.cx-rail-brand').bounding_box()['y'] >= 44
        emit('window-state', fullscreen=True)
        assert page.locator('.cx-rail-brand').bounding_box()['y'] < 44
        # Der Ziehstreifen des Fensters darf keine Bedienelemente überdecken:
        # Electron sammelt die Ziehflächen in Dokumentreihenfolge, die letzte
        # gewinnt. Steht er hinter der Oberfläche, nehmen Suche, Seitenleisten-
        # umschalter und die Verlaufspfeile in den obersten 44 Pixeln keine
        # Klicks mehr an. Im Vollbild rückt die Kopfzeile dort hinein.
        strip = page.evaluate('''() => {
          const bar = document.querySelector('.cxd-dragbar');
          const versteckt = getComputedStyle(bar).display === 'none';
          const hoehe = versteckt ? 0 : bar.getBoundingClientRect().height;
          const verdeckt = [...document.querySelectorAll('#root button, #root input, #root textarea')]
            .filter(node => { const r = node.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.top < hoehe; })
            .map(node => node.getAttribute('aria-label') || node.className);
          return {ersterKnoten: document.body.firstElementChild?.className,
                  versteckt, hoehe, verdeckt};
        }''')
        assert strip['ersterKnoten'] == 'cxd-dragbar', strip
        assert strip['versteckt'], strip
        assert not strip['verdeckt'], strip
        emit('window-state', fullscreen=False)
        # Im Fenstermodus liegen die Verlaufspfeile absichtlich im Streifen.
        # Sie dürfen das nur, weil sie ausdrücklich ausgenommen sind — und die
        # Ausnahme zählt nur, wenn der Streifen vor ihnen im Dokument steht.
        fenster = page.evaluate('''() => {
          const ausnahme = '.cortex-desktop-shell .cx-history, .cortex-desktop-shell .cx-history *, .cortex-desktop-shell button, .cortex-desktop-shell input, .cortex-desktop-shell textarea, .cortex-desktop-shell select';
          const bar = document.querySelector('.cxd-dragbar');
          const hoehe = getComputedStyle(bar).display === 'none' ? 0 : bar.getBoundingClientRect().height;
          return {hoehe, ersterKnoten: document.body.firstElementChild?.className,
            ohneAusnahme: [...document.querySelectorAll('#root button, #root input, #root textarea, #root select')]
              .filter(node => { const r = node.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && r.top < hoehe && !node.matches(ausnahme); })
              .map(node => node.getAttribute('aria-label') || node.className)};
        }''')
        assert fenster['hoehe'] == 44, fenster
        assert fenster['ersterKnoten'] == 'cxd-dragbar', fenster
        assert not fenster['ohneAusnahme'], fenster
        assert page.evaluate('getComputedStyle(document.body).fontFamily').startswith('-apple-system')
        page.evaluate('window.dispatchEvent(new MessageEvent("message", {data:{kind:"desktop-host-ping",token:"smoke-token"}}))')
        assert last_message('host-roundtrip')['token'] == 'smoke-token'
        emit('context', key='cortex.chatToolsVisible', value=False)
        expect(toolbar).to_be_hidden()
        emit('context', key='cortex.chatToolsVisible', value=True)
        toolbar.get_by_role('button', name='Dateien', exact=True).click()
        assert last_message('command')['command'] == 'cortex.showFiles'
        emit('context', key='cortex.filesOpen', value=True)
        toolbar.get_by_role('button', name='Dateien', exact=True).click()
        assert last_message('command')['command'] == 'cortex.hideFiles'

        emit('browser-state', visible=True, url='https://example.com/', title='Beispiel', canBack=True, canForward=False)
        expect(page.get_by_role('tab', name='Beispiel')).to_be_visible()
        page.wait_for_function('window.__shellMessages.filter(m => m.type === "browser-bounds").at(-1)?.visible === true')
        bounds = last_message('browser-bounds')
        assert bounds['x'] > 500 and bounds['y'] > 80 and bounds['width'] > 300 and bounds['height'] > 600, bounds
        page.get_by_label('Browser-Adresse').fill('http://localhost:3000')
        page.get_by_label('Browser-Adresse').press('Enter')
        assert last_message('browser-navigate')['url'] == 'http://localhost:3000'
        expect(page.get_by_label('Im Browser zurück')).to_be_enabled()
        expect(page.get_by_label('Im Browser vorwärts')).to_be_disabled()

        # Menus and modal prompts must hide native WebContentsView surfaces;
        # otherwise their native content sits above the HTML dialog.
        toolbar.get_by_role('button', name='Chat-Aktionen').click()
        expect(page.get_by_role('menu', name='Chat-Aktionen')).to_be_visible()
        page.wait_for_function('window.__shellMessages.filter(m => m.type === "browser-bounds").at(-1)?.visible === false')
        page.keyboard.press('Escape')
        page.wait_for_function('window.__shellMessages.filter(m => m.type === "browser-bounds").at(-1)?.visible === true')
        emit('prompt', id='password', kind='input', title='Zugriffsschlüssel', password=True, placeholder='Schlüssel')
        expect(page.get_by_role('dialog')).to_be_visible()
        expect(page.get_by_label('Schlüssel', exact=True)).to_have_attribute('type', 'password')
        page.get_by_label('Schlüssel', exact=True).fill('test-key')
        page.get_by_role('button', name='Bestätigen').click()
        assert last_message('prompt-result') == {'type': 'prompt-result', 'id': 'password', 'value': 'test-key'}
        emit('prompt', id='pick', kind='pick', title='Projekt wählen', items=[{'label': 'Cortex', 'value': 0}, {'label': 'Vektor', 'value': 1}])
        page.get_by_role('dialog').get_by_role('textbox').fill('Vek')
        page.get_by_role('option', name='Vektor').click()
        assert last_message('prompt-result')['value'] == 1
        emit('prompt', id='cancel', kind='input', title='Abbrechen prüfen')
        page.keyboard.press('Escape')
        assert last_message('prompt-result') == {'type': 'prompt-result', 'id': 'cancel'}

        # Monaco edits are sent immediately; save acknowledgements must not
        # mark text typed while the disk write is pending as saved.
        emit('editor-open', id='file-1', path='/test/example.ts', language='typescript', text='const before = 1;\n')
        expect(page.get_by_role('tab', name='example.ts')).to_be_visible()
        page.locator('.cxd-editor-surface:not([hidden]) .monaco-editor').wait_for()
        editor_input = page.locator('.cxd-editor-surface:not([hidden]) .inputarea, .cxd-editor-surface:not([hidden]) .native-edit-context')
        editor_input.focus()
        page.keyboard.press('Meta+A')
        page.keyboard.insert_text('const after = 2;\n')
        wait_message('editor-change', 'text', 'const after = 2;\n')
        expect(page.get_by_label('Datei speichern', exact=True)).to_be_enabled()
        page.get_by_label('Datei speichern', exact=True).click()
        saved_text = last_message('editor-save')['text']
        assert saved_text == 'const after = 2;\n'
        editor_input.focus()
        page.keyboard.press('Meta+End')
        page.keyboard.insert_text('// pending\n')
        emit('editor-saved', id='file-1', text=saved_text)
        expect(page.locator('.cxd-editor-status')).to_have_text('Nicht gespeichert')
        page.get_by_label('example.ts schließen').click()
        assert last_message('editor-close')['id'] == 'file-1'
        expect(page.get_by_role('tab', name='example.ts')).to_be_visible()
        emit('editor-closed', id='file-1')
        expect(page.get_by_role('tab', name='example.ts')).to_have_count(0)

        emit('terminal-open', id='term-1', name='Cortex', cwd='/test')
        expect(page.locator('.cxd-terminal')).to_be_visible()
        page.locator('.cxd-terminal .xterm-helper-textarea').focus()
        page.keyboard.type('echo hello')
        typed = page.evaluate('window.__shellMessages.filter(m => m.type === "terminal-input").map(m => m.data).join("")')
        assert typed == 'echo hello', typed
        emit('terminal-data', id='term-1', data='Cortex shell ready\r\n')
        page.wait_for_function('window.__shellMessages.some(m => m.type === "terminal-resize" && m.cols > 20 && m.rows > 3)')
        page.get_by_label('Terminal ausblenden', exact=True).click()
        expect(page.locator('.cxd-terminal')).to_be_hidden()
        assert last_message('terminal-hide')
        emit('terminal-show', id='term-1')
        expect(page.locator('.cxd-terminal')).to_be_visible()
        assert page.locator('.cxd-terminal-session').count() == 1
        emit('terminal-open', id='term-2', name='Vektor', cwd='/other')
        assert page.locator('.cxd-terminal-session').count() == 2
        emit('terminal-exit', id='term-2', code=0)
        expect(page.get_by_role('tab', name='Vektor · beendet')).to_be_visible()

        # Existing Cortex navigation and settings retain their fonts/layout.
        emit('context', key='cortex.chatToolsVisible', value=False)
        expect(page.locator('.cxd-side')).to_be_hidden()
        expect(page.locator('.cxd-terminal')).to_be_hidden()
        assert page.locator('#root').bounding_box()['width'] == 1440
        emit('editor-open', id='settings-file', path='/test/settings.json', language='json', text='{"works":true}')
        expect(page.locator('.cxd-side')).to_be_visible()
        expect(toolbar).to_be_hidden()
        emit('config', values={'editor.fontSize': 18, 'editor.tabSize': 2})
        expect(page.locator('.cxd-editor-surface:not([hidden]) .view-lines')).to_have_css('font-size', '18px')
        # A real JSON language worker formats through Monaco's action API.
        page.wait_for_function('performance.getEntriesByType("resource").some(entry => entry.name.includes("json.worker.js"))')
        emit('editor-format')
        page.wait_for_function('window.__shellMessages.some(m => m.type === "editor-change" && m.id === "settings-file" && m.text.includes("\\n"))')
        emit('editor-closed', id='settings-file')
        emit('context', key='cortex.chatToolsVisible', value=True)
        emit('editor-diff', id='diff-1', path='/test/change.ts', language='typescript', original='const x = 1;\n', modified='const x = 2;\n', readonly=True)
        expect(page.locator('.cxd-editor-status')).to_have_text('Schreibgeschützt')
        expect(page.get_by_label('Datei speichern', exact=True)).to_be_disabled()
        page.locator('.monaco-diff-editor').wait_for()
        screenshot = ROOT / 'docs/screenshots/cortex-desktop-shell.png'
        screenshot.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(screenshot))
        page.set_viewport_size({'width': 760, 'height': 560})
        page.wait_for_function('innerWidth === 760')
        page.wait_for_function('document.querySelector(".cx-main").getBoundingClientRect().x < 1')
        composer_bounds = page.locator('.composer').bounding_box()
        message_bounds = page.get_by_label('Nachricht', exact=True).bounding_box()
        main_bounds = page.locator('.cx-main').bounding_box()
        assert message_bounds['width'] >= 240, message_bounds
        assert composer_bounds['y'] >= 44 and composer_bounds['y'] + composer_bounds['height'] <= main_bounds['height'], (composer_bounds, main_bounds)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.get_by_label('Nachricht', exact=True).fill('Schmaler Arbeitsbereich bleibt bedienbar.')
        expect(page.get_by_label('Nachricht', exact=True)).to_have_value('Schmaler Arbeitsbereich bleibt bedienbar.')
        page.screenshot(path=str(ROOT / 'docs/screenshots/cortex-desktop-shell-narrow.png'))
        emit('editor-closed', id='diff-1')
        emit('browser-state', visible=False)
        page.wait_for_function('document.querySelector(".cx-main").getBoundingClientRect().x >= 179')
        assert not page.locator('body').evaluate('node => node.classList.contains("cxd-auto-sidebar")')
        assert not errors, errors
        print('PASS: own desktop toolbar, browser bounds, prompts, Monaco save race/diff, xterm tabs, context visibility, existing Cortex renderer')
finally:
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)
