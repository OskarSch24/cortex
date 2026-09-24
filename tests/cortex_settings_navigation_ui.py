"""Settings routes and real dropdown interactions, using only the fake host.

Set CORTEX_AUDIT_BUNDLE to an isolated esbuild output to test changed source
without replacing the app's shipped bundle. No provider or account operations.
"""
import os
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

PORT = int(os.environ.get('CORTEX_TEST_PORT', '4191'))
BUNDLE = os.environ.get('CORTEX_AUDIT_BUNDLE')
BASE = f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent'


def prepare(page):
    if BUNDLE:
        page.route('**/media/webview.js*', lambda route: route.fulfill(path=BUNDLE, content_type='application/javascript'))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')
    page.locator('.cx-settings-btn').click()
    expect(page.locator('.cxs-nav')).to_be_visible()


def in_viewport(page, menu):
    rect = menu.bounding_box()
    viewport = page.viewport_size
    assert rect['x'] >= 7 and rect['y'] >= 7, rect
    assert rect['x'] + rect['width'] <= viewport['width'] - 7, rect
    assert rect['y'] + rect['height'] <= viewport['height'] - 7, rect
    for option in menu.get_by_role('option').all():
        option.scroll_into_view_if_needed()
        assert option.evaluate('''el => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }'''), option.inner_text()


with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    prepare(page)
    nav = page.locator('.cxs-nav')
    pages = nav.locator('.cxs-nav-item').all_inner_texts()
    assert len(pages) == 22, pages
    dropdowns = 0
    for name in pages:
        nav.get_by_role('button', name=name, exact=True).click()
        expect(page.locator('.cxs-main h1').first).to_be_visible()
        assert len(page.locator('.cxs-scroll').inner_text()) > 10, name
        for trigger in page.locator('.cxs-select-button:not(:disabled)').all():
            trigger.click()
            menu = page.get_by_role('listbox')
            expect(menu).to_be_visible()
            in_viewport(page, menu)
            page.keyboard.press('Escape')
            expect(menu).to_have_count(0)
            expect(trigger).to_be_focused()
            dropdowns += 1

    # The permissions table used to clip every menu despite ample viewport space.
    nav.get_by_role('button', name='Browser', exact=True).click()
    downloads = page.get_by_role('button', name='Downloads', exact=True)
    uploads = page.get_by_role('button', name='Uploads', exact=True)
    downloads.focus()
    downloads.press('ArrowDown')
    expect(page.get_by_role('listbox', name='Downloads')).to_be_visible()
    page.keyboard.press('End')
    expect(page.get_by_role('option', name='Blockiert', exact=True)).to_be_focused()
    page.keyboard.press('Enter')
    expect(downloads).to_be_focused()
    expect(downloads).to_contain_text('Blockiert')
    page.wait_for_function("() => window.__hostMessages.some(m => m.kind === 'setAppSetting' && m.key === 'browser.agentDownloads' && m.value === 'blockiert')")
    downloads.press('ArrowUp')
    expect(page.get_by_role('listbox', name='Downloads')).to_be_visible()
    expect(page.get_by_role('option', name='Blockiert', exact=True)).to_be_focused()
    page.keyboard.press('Home')
    expect(page.get_by_role('option', name='Genehmigung erforderlich', exact=True)).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_role('listbox')).to_have_count(0)
    expect(uploads).to_be_focused()

    # Responsive positioning, live viewport changes and outside pointer dismissal.
    for width, height in [(960, 700), (760, 600)]:
        page.set_viewport_size({'width': width, 'height': height})
        downloads.click()
        menu = page.get_by_role('listbox', name='Downloads')
        expect(menu).to_be_visible()
        in_viewport(page, menu)
        page.get_by_role('textbox', name='Einstellungen durchsuchen').click()
        expect(menu).to_have_count(0)
        expect(page.get_by_role('textbox', name='Einstellungen durchsuchen')).to_be_focused()

    # MultiSelect remains open for more than one choice; Escape restores its anchor.
    nav.get_by_role('button', name='Konfiguration', exact=True).click()
    projects = page.get_by_role('button', name='Reasoning-Stufen', exact=True)
    projects.click()
    menu = page.get_by_role('listbox', name='Reasoning-Stufen')
    expect(menu).to_have_attribute('aria-multiselectable', 'true')
    option = menu.get_by_role('option').first
    before = option.get_attribute('aria-selected')
    option.click()
    expect(option).to_have_attribute('aria-selected', 'false' if before == 'true' else 'true')
    expect(menu).to_be_visible()
    page.keyboard.press('Escape')
    expect(projects).to_be_focused()
    assert not errors, errors
    page.close()

    # Touch uses pointer events too; it must not dismiss before an option is chosen.
    touch = browser.new_context(viewport={'width': 760, 'height': 900}, has_touch=True)
    try:
        page = touch.new_page()
        prepare(page)
        page.locator('.cxs-nav').get_by_role('button', name='Browser', exact=True).tap()
        downloads = page.get_by_role('button', name='Downloads', exact=True)
        downloads.tap()
        page.get_by_role('option', name='Blockiert', exact=True).tap()
        expect(downloads).to_contain_text('Blockiert')
        expect(page.get_by_role('listbox')).to_have_count(0)
    finally:
        touch.close()
    print(f'Settings navigation: {len(pages)} routes, {dropdowns} dropdowns, keyboard, focus, responsive positioning, multi-select and touch passed.')
