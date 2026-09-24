"""Slash picker regression checks against the actual bundle and fixture host.

Runs only chromium-headless-shell; host messages are recorded by the preview
fixture, so archive/export/feedback never touch real chats or external services.
"""
from pathlib import Path
import base64
import re
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(exist_ok=True)
PORT = 4185

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1040}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def fresh():
        page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&scenario=conversation')
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(element) => element.remove()')
        expect(page.locator('.composer > textarea')).to_be_visible()
        return page.locator('.composer > textarea')

    def emit(message):
        page.evaluate('data => window.dispatchEvent(new MessageEvent("message", { data }))', message)

    def messages(kind):
        return page.evaluate('(kind) => (window.__hostMessages || []).filter(message => message.kind === kind)', kind)

    def option(label):
        return page.get_by_role('option').filter(has=page.get_by_text(label, exact=True))

    def command(text, key='Enter', label=None):
        field = page.locator('.composer > textarea')
        field.fill(text)
        expect(page.get_by_role('listbox', name='Slash-Befehle')).to_be_visible()
        if label:
            option(label).click()
        else:
            field.press(key)

    def back():
        page.get_by_role('button', name='Zurück zur App', exact=True).click()
        expect(page.locator('.composer > textarea')).to_be_visible()

    def visible_with_diagnostics(locator):
        try:
            expect(locator).to_be_visible()
        except AssertionError:
            field = page.locator('.composer > textarea')
            print('Slash navigation failure:', {
                'draft': field.input_value() if field.count() else None,
                'suggestions': page.locator('.suggest-options').all_text_contents(),
                'recentMessages': page.evaluate('(window.__hostMessages || []).slice(-10)'),
                'visibleText': page.locator('body').inner_text()[-1600:],
            })
            raise

    text = fresh()
    text.fill('/')
    popup = page.locator('.suggest-popup')
    rows = page.locator('.suggest-row')
    expect(page.get_by_role('listbox', name='Slash-Befehle')).to_be_visible()
    assert rows.count() > 8, rows.count()
    assert page.locator('.suggest-icon svg').count() == rows.count()
    assert popup.bounding_box()['width'] == 736
    assert popup.bounding_box()['height'] <= 320
    assert popup.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(29, 32, 36)'  # --cx-popover
    assert rows.first.evaluate('e => getComputedStyle(e).fontSize') == '13px'
    assert 'mono' not in page.locator('.suggest-label').first.evaluate('e => getComputedStyle(e).fontFamily').lower()
    expect(page.locator('.suggest-hint')).not_to_be_visible()
    expect(rows.first).to_have_attribute('aria-selected', 'true')
    for _ in range(15):
        text.press('ArrowDown')
    page.wait_for_function('document.querySelector(".suggest-options").scrollTop > 0')
    active = page.locator('.suggest-row[aria-selected="true"]')
    previous = active.get_attribute('id')
    text.press('ArrowUp')
    assert active.get_attribute('id') != previous
    active_box = active.bounding_box()
    list_box = page.locator('.suggest-options').bounding_box()
    assert active_box['y'] >= list_box['y'] - 1
    assert active_box['y'] + active_box['height'] <= list_box['y'] + list_box['height'] + 1
    text.press('Escape')
    expect(popup).to_have_count(0)
    expect(text).to_have_value('/')
    assert messages('send') == [] and messages('chatCommand') == []

    # Shift+Tab and composition Enter must not activate the selected command.
    text.fill('/pin')
    text.press('Shift+Tab')
    expect(text).to_have_value('/pin')
    assert messages('chatCommand') == []
    text.focus()
    text.fill('/pin')
    text.dispatch_event('keydown', {'key': 'Enter', 'isComposing': True})
    expect(text).to_have_value('/pin')
    assert messages('send') == [] and messages('chatCommand') == []
    text.press('Escape')
    text.fill('/review')
    for _ in range(3):
        text.press('ArrowLeft')
    text.press('Tab')
    expect(text).to_have_value('/review ')
    assert messages('send') == []

    # Search covers German labels and umlaut-insensitive keywords.
    text.fill('/anheften')
    expect(rows).to_have_count(1)
    expect(option('Chat anpinnen')).to_be_visible()
    text.fill('/gedachtnis')
    expect(rows).to_have_count(1)
    expect(option('Erinnerungen')).to_be_visible()
    text.press('Escape')

    # Host commands dispatch exactly once and are never sent as AI prompts.
    for slash, action, label in [
        ('pin', 'pin', 'Chat anpinnen'),
        ('archive', 'archive', 'Archivieren'),
        ('fork', 'fork', 'Chat forken'),
        ('export', 'export', 'Chat exportieren'),
        ('compact', 'compact', 'Kompakt'),
        ('feedback', 'feedback', 'Feedback'),
    ]:
        previous_count = len(messages('chatCommand'))
        command('/' + slash, label=label if action in ('archive', 'export', 'feedback') else None)
        page.wait_for_function('(count) => (window.__hostMessages || []).filter(m => m.kind === "chatCommand").length > count', arg=previous_count)
        actual = messages('chatCommand')
        assert len(actual) == previous_count + 1 and actual[-1]['action'] == action, actual
        assert messages('send') == []
    # The send button takes the same local route after dismissing suggestions.
    text.fill('/pin')
    text.press('Escape')
    previous_count = len(messages('chatCommand'))
    page.locator('.send').click()
    page.wait_for_function('(count) => (window.__hostMessages || []).filter(m => m.kind === "chatCommand").length > count', arg=previous_count)
    assert len(messages('chatCommand')) == previous_count + 1
    assert messages('send') == []

    text = fresh()
    command('/model')
    expect(page.get_by_role('menu', name='Modell auswählen')).to_be_visible()
    expect(page.get_by_role('menuitemradio', name='GPT-6 Astra', exact=True).first).to_be_visible()
    assert messages('send') == []
    page.keyboard.press('Escape')
    page.keyboard.press('Escape')

    command('/mcp', label='MCP')
    expect(page.get_by_role('heading', name='Plugins', exact=True)).to_be_visible()
    expect(page.get_by_placeholder('MCP-Server durchsuchen')).to_be_visible()
    expect(page.get_by_role('tab', name=re.compile('^MCPs'))).to_have_attribute('aria-selected', 'true')
    back()
    command('/memory', key='Tab')
    expect(page.get_by_role('heading', name=re.compile('^Personalisierung'))).to_be_visible()
    back()
    command('/usage')
    visible_with_diagnostics(page.get_by_role('heading', name=re.compile('^Nutzung')))
    assert len(messages('refreshUsage')) >= 1
    back()
    command('/templates', label='Vorlagen')
    visible_with_diagnostics(page.locator('.cx-templates'))
    page.get_by_role('button', name='Vorlagen schließen').click()
    command('/search')
    expect(page.get_by_role('dialog', name='Aufgaben suchen')).to_be_visible()
    page.get_by_role('button', name='Suche schließen').click()
    command('/image')
    expect(page.locator('.composer.is-image')).to_be_visible()
    assert messages('send') == []
    text.focus()
    text.press('Escape')
    expect(page.locator('.composer.is-image')).to_have_count(0)

    # Plus > commands retains existing prose, pasted text, and a real image.
    text = fresh()
    draft = 'Bitte behalte diesen Entwurf.'
    pasted = '\n'.join(f'Quellzeile {index:02d}: relevanter Inhalt.' for index in range(30))
    text.fill(draft)
    text.evaluate('''(element, value) => { const data = new DataTransfer(); data.setData('text/plain', value); element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); }''', pasted)
    expect(page.locator('.cx-paste-edit')).to_have_value(pasted)
    image_path = '/demo/menue-referenz.png'
    emit({'kind': 'attachments', 'paths': [image_path]})
    page.wait_for_function('(path) => (window.__hostMessages || []).some(m => m.kind === "attachmentPreview" && m.path === path)', arg=image_path)
    reference = Path('/var/folders/_l/ydn3hpc96cn_k5cm3rjkkkr40000gn/T/TemporaryItems/NSIRD_screencaptureui_VW9K8C/Bildschirmfoto 2026-09-19 um 15.20.27.png')
    source = '/media/icon.svg'
    if reference.is_file():
        source = 'data:image/png;base64,' + base64.b64encode(reference.read_bytes()).decode('ascii')
    emit({'kind': 'attachmentPreview', 'path': image_path, 'src': source})
    expect(page.locator('.attachment-row.has-preview img')).to_have_count(1)
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Slash-Befehle', exact=True).click()
    expect(text).to_have_value('/ ' + draft)
    expect(page.get_by_role('listbox', name='Slash-Befehle')).to_be_visible()
    option('MCP').click()
    expect(page.get_by_placeholder('MCP-Server durchsuchen')).to_be_visible()
    back()
    expect(text).to_have_value(draft + '\n\n' + pasted)
    expect(page.locator('.attachment-row')).to_have_count(1)
    assert messages('send') == []
    # Restored paste content appears exactly once when eventually sent.
    page.locator('.send').click()
    page.wait_for_function('(window.__hostMessages || []).some(m => m.kind === "send")')
    sent = messages('send')
    assert len(sent) == 1 and sent[0]['text'] == draft + '\n\n' + pasted, sent
    assert sent[0]['attachments'] == [image_path]

    # Pins stay visible outside projects; archived chats can actually be restored.
    text = fresh()
    emit({'kind': 'conversations',
          'list': [{'id': 'pinned-test', 'title': 'Angehefteter Chat', 'updatedAt': 1, 'pinned': True}],
          'archivedList': [{'id': 'archived-test', 'title': 'Archivierter Chat', 'updatedAt': 1, 'archived': True}],
          'activeId': 'pinned-test'})
    expect(page.get_by_role('region', name='Angeheftete Chats')).to_be_visible()
    expect(page.get_by_role('region', name='Angeheftete Chats').get_by_text('Angehefteter Chat', exact=True)).to_be_visible()
    text.fill('/pin')
    expect(option('Chat lösen')).to_be_visible()
    text.press('Escape')
    command('/settings')
    page.get_by_role('button', name='Archivierte Chats und Projekte', exact=True).click()
    expect(page.get_by_role('heading', name='Archivierte Chats und Projekte', exact=True)).to_be_visible()
    expect(page.get_by_text('Archivierter Chat', exact=True)).to_be_visible()
    page.get_by_role('button', name='Chat wiederherstellen', exact=True).click()
    assert messages('restoreConversation')[-1]['id'] == 'archived-test'
    assert messages('send') == []
    back()
    # Local commands also work before an AI account is connected.
    emit({'kind': 'accounts', 'accounts': []})
    text.fill('/settings')
    text.press('Escape')
    expect(page.locator('.send')).to_be_enabled()
    page.locator('.send').click()
    expect(page.get_by_role('heading', name='Allgemein', exact=True, level=1)).to_be_visible()
    assert messages('send') == []
    back()

    # Screenshot of the real picker, with the supplied image attached.
    text = fresh()
    emit({'kind': 'modes', 'permissionMode': 'full', 'askPermission': False, 'routingMode': 'auto'})
    emit({'kind': 'pinnedTarget', 'target': {'provider': 'codex', 'account': 'privat', 'model': 'gpt-6-astra'}, 'standard': False})
    emit({'kind': 'attachments', 'paths': [image_path]})
    page.wait_for_function('(path) => (window.__hostMessages || []).some(m => m.kind === "attachmentPreview" && m.path === path)', arg=image_path)
    emit({'kind': 'attachmentPreview', 'path': image_path, 'src': source})
    text.fill('/')
    expect(page.get_by_role('listbox', name='Slash-Befehle')).to_be_visible()
    panel_box = page.locator('.suggest-popup').bounding_box()
    composer_box = page.locator('.composer').bounding_box()
    page.screenshot(path=str(OUT / 'slash-commands.png'), clip={
        'x': composer_box['x'] - 12, 'y': panel_box['y'] - 12,
        'width': composer_box['width'] + 24,
        'height': composer_box['y'] + composer_box['height'] - panel_box['y'] + 24,
    })
    assert not errors, errors
    print('Slash commands: full catalog, geometry, icons, scrolling, German filtering, keyboard/mouse, IME, local routing, all panels, draft/image/paste preservation, pins/archive restore, account-free local actions and one eventual send passed.')
