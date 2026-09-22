"""Document slash commands open real Office templates without starting an agent.

Uses the built webview and browser-only fixture host on its own headless port.
No real provider calls, native browser windows, or host actions are performed.
"""
from pathlib import Path
import json
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(exist_ok=True)
PORT = 4186

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 980}, device_scale_factor=2)
    errors = []
    request_failures = []
    pending_requests = set()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: pending_requests.add(request.url))
    page.on('requestfinished', lambda request: pending_requests.discard(request.url))
    page.on('requestfailed', lambda request: (pending_requests.discard(request.url), request_failures.append({'url': request.url, 'failure': request.failure})))
    page.add_init_script('''window.addEventListener('message', event => {
      if (event.data?.kind === 'templates') {
        window.__lastTemplateFixture = event.data.items;
        (window.__templateResponses ||= []).push({ count: event.data.items.length, time: performance.now() });
      }
    });''')

    def fresh():
        page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&scenario=conversation')
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(element) => element.remove()')
        expect(page.locator('.composer > textarea')).to_be_visible()
        return page.locator('.composer > textarea')

    def emit(message):
        page.evaluate('data => window.dispatchEvent(new MessageEvent("message", { data }))', message)

    def sent():
        return page.evaluate('(window.__hostMessages || []).filter(message => message.kind === "send")')

    def option(label):
        return page.get_by_role('option').filter(has=page.get_by_text(label, exact=True))

    def gallery(count, first_name, landscape=False):
        expect(page.locator('.cx-templates')).to_be_visible()
        try:
            expect(page.locator('.cx-template')).to_have_count(count, timeout=20000)
        except AssertionError:
            state = page.evaluate('''() => ({
              input: document.querySelector('.composer > textarea')?.value,
              gallery: document.querySelector('.cx-templates')?.innerText,
              requests: (window.__hostMessages || []).filter(message => message.kind === 'getTemplates'),
              responses: window.__templateResponses || [],
              lastCatalogCount: window.__lastTemplateFixture?.length,
              hostMessages: (window.__hostMessages || []).slice(-12)
            })''')
            print('Template gallery failure:', json.dumps({**state, 'pageErrors': errors,
                  'requestFailures': request_failures, 'pendingRequests': sorted(pending_requests)}, ensure_ascii=False), flush=True)
            raise
        expect(page.locator('.cx-template-name').first).to_have_text(first_name)
        expect(page.locator('.cx-templates.landscape' if landscape else '.cx-templates.portrait')).to_be_visible()
        assert sent() == []

    # Exact commands switch to the intended template category while typing.
    text = fresh()
    text.fill('/docs')
    gallery(7, 'Design Report')
    expect(text).to_have_value('/docs')
    page.wait_for_function('Array.from(document.querySelectorAll(".cx-template-sheet img")).every(image => image.complete && image.naturalWidth > 0)')
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'docs-command-templates.png'))
    text.fill('Jetzt etwas anderes besprechen.')
    expect(page.locator('.cx-templates')).to_have_count(0)
    assert sent() == []
    text.fill('/slides')
    gallery(7, 'Business Review', landscape=True)
    text.fill('/sheets')
    gallery(6, 'Analytics Dashboard', landscape=True)
    text.fill('/docs')
    gallery(7, 'Design Report')
    text.fill('')
    expect(page.locator('.cx-templates')).to_have_count(0)

    # Enter accepts the exact command as a persistent gallery, without a run.
    text.fill('/docs')
    gallery(7, 'Design Report')
    # Manually browsing another category must not override the next explicit
    # /docs action when the typed command itself has not changed.
    page.get_by_role('button', name='Vorlagenart auswählen', exact=True).click()
    page.get_by_role('menuitemradio', name='Tabellen', exact=True).click()
    gallery(6, 'Analytics Dashboard', landscape=True)
    expect(text).to_have_value('/docs')
    text.press('Enter')
    expect(text).to_have_value('')
    gallery(7, 'Design Report')
    text.fill('Ein Dokument über unser Projekt.')
    gallery(7, 'Design Report')
    page.get_by_role('button', name='Vorlagen schließen').click()
    expect(page.locator('.cx-templates')).to_have_count(0)
    assert sent() == []

    # A short prefix remains a command picker; mouse, Tab and Enter each open
    # the document gallery instead of routing an AI prompt.
    for activation in ('mouse', 'Tab', 'Enter'):
        text = fresh()
        text.fill('/doc')
        expect(page.get_by_role('listbox', name='Slash-Befehle')).to_be_visible()
        expect(option('Dokumente')).to_be_visible()
        expect(page.locator('.cx-templates')).to_have_count(0)
        if activation == 'mouse':
            option('Dokumente').click()
        else:
            # Select the intended row even when another command shares /doc.
            choices = page.locator('.suggest-row .suggest-label').all_text_contents()
            for _ in range(choices.index('Dokumente')):
                text.press('ArrowDown')
            text.press(activation)
        gallery(7, 'Design Report')
        assert sent() == []

    # Choosing an actual document attaches its Office source and instructions.
    page.get_by_role('button', name='Design Report', exact=True).click()
    expect(page.locator('.cx-templates')).to_have_count(0)
    expect(text).to_have_value('Erstelle ein neues Dokument mit der Vorlage „Design Report“. Frage mich zuerst, worum es darin gehen soll.')
    expect(page.locator('.attachment-row')).to_have_count(2)
    paths = page.locator('.attachment-row').evaluate_all('elements => elements.map(element => element.title)')
    assert any(path.endswith('/reference.docx') for path in paths), paths
    assert any(path.endswith('/USAGE.md') for path in paths), paths
    assert sent() == []
    page.locator('.send').click()
    page.wait_for_function('(window.__hostMessages || []).some(message => message.kind === "send")')
    assert len(sent()) == 1 and sent()[0]['attachments'] == paths, sent()

    # A document selected after entering image mode must route a normal Office
    # task. Exercise both immediate preview selection and accepting /doc by Tab.
    for activation in ('preview', 'Tab'):
        text = fresh()
        text.fill('/image')
        text.press('Enter')
        expect(page.locator('.composer.is-image')).to_be_visible()
        assert sent() == []
        if activation == 'preview':
            text.fill('/docs')
        else:
            text.fill('/doc')
            expect(option('Dokumente')).to_be_visible()
            choices = page.locator('.suggest-row .suggest-label').all_text_contents()
            for _ in range(choices.index('Dokumente')):
                text.press('ArrowDown')
            text.press('Tab')
            expect(page.locator('.composer.is-image')).to_have_count(0)
        gallery(7, 'Design Report')
        page.get_by_role('button', name='Design Report', exact=True).click()
        expect(page.locator('.composer.is-image')).to_have_count(0)
        expect(page.locator('.attachment-row')).to_have_count(2)
        office_paths = page.locator('.attachment-row').evaluate_all('elements => elements.map(element => element.title)')
        assert any(path.endswith('/reference.docx') for path in office_paths), office_paths
        assert any(path.endswith('/USAGE.md') for path in office_paths), office_paths
        assert sent() == []
        page.locator('.send').click()
        page.wait_for_function('(window.__hostMessages || []).some(message => message.kind === "send")')
        assert len(sent()) == 1 and sent()[0]['attachments'] == office_paths, sent()
        assert 'image' not in sent()[0] and 'imageProvider' not in sent()[0], sent()

    # Empty host catalogs remain operable and recover when templates arrive.
    text = fresh()
    text.fill('/docs')
    gallery(7, 'Design Report')
    original_items = page.evaluate('window.__lastTemplateFixture')
    assert len(original_items) == 20
    emit({'kind': 'templates', 'items': []})
    expect(page.locator('.cx-template')).to_have_count(0)
    expect(page.get_by_text('Keine Vorlagen verfügbar.', exact=True)).to_be_visible()
    emit({'kind': 'templates', 'items': original_items})
    gallery(7, 'Design Report')
    text.fill('/kein-passender-befehl')
    expect(page.locator('.cx-templates')).to_have_count(0)
    expect(page.get_by_role('listbox', name='Slash-Befehle')).to_have_count(0)
    text.press('ArrowDown')
    text.press('ArrowUp')
    expect(text).to_have_value('/kein-passender-befehl')
    assert sent() == []
    text.fill('/d')
    expect(option('Dokumente')).to_be_visible()
    expect(page.locator('.cx-templates')).to_have_count(0)
    text.fill('/docs')
    gallery(7, 'Design Report')
    text.fill('')
    expect(page.locator('.cx-templates')).to_have_count(0)

    # Explicit project commands shadow the built-in /docs entry everywhere.
    text = fresh()
    emit({'kind': 'rules', 'rules': {'version': 1, 'rules': []}, 'path': '/demo/rules.json', 'exists': True,
          'customCommands': [{'name': 'docs', 'label': 'Eigene Dokumentation', 'kind': 'prompt',
                              'description': 'Das benutzerdefinierte Dokumentationskommando',
                              'usage': '/docs <Thema>', 'template': 'Dokumentiere {args} nach unseren Projektregeln.'}]})
    text.fill('/docs')
    expect(option('Eigene Dokumentation')).to_be_visible()
    expect(option('Dokumente')).to_have_count(0)
    expect(page.locator('.cx-templates')).to_have_count(0)
    text.press('Tab')
    expect(text).to_have_value('/docs ')
    expect(page.locator('.cx-templates')).to_have_count(0)
    assert sent() == []
    text.fill('/docs API')
    page.locator('.send').click()
    page.wait_for_function('(window.__hostMessages || []).some(message => message.kind === "send")')
    assert len(sent()) == 1 and sent()[0]['text'] == '/docs API', sent()
    expect(page.locator('.cx-templates')).to_have_count(0)
    assert not errors, errors
    print('Document commands: automatic docs/slides/sheets categories, editing/short prefixes, mouse/Tab/Enter activation, explicit category reset, image-mode exit, Office+USAGE attachments, empty catalog recovery and custom /docs override passed.')
