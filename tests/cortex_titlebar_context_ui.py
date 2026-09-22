"""Page changes report the titlebar context through the real webview bridge.

Only the local fake host and chromium-headless-shell are used. Native window
visibility and the titleBar contribution guards are covered by host unit tests.
"""
import re
from playwright.sync_api import expect
from headless_browser import headless_browser

PORT = 4201
BASE = f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&teams=empty'
SURFACES = {
    'chat': '.cx-workspace',
    'agents': '.cx-teams',
    'automations': '.cx-automations-page',
    'plugins': '.cx-plugins',
    'accounts': '.cx-connections',
    'exokortex': '.cx-exo',
    'settings': '.cxs-nav',
}


def notifications(page):
    return page.evaluate("() => (window.__hostMessages || []).filter(m => m.kind === 'pageChanged').map(m => m.page)")


def expect_page(page, name, sequence):
    expect(page.locator(SURFACES[name])).to_be_visible()
    page.wait_for_function("expected => { const messages = (window.__hostMessages || []).filter(m => m.kind === 'pageChanged'); return messages.at(-1)?.page === expected; }", arg=name)
    assert notifications(page) == sequence, notifications(page)
    # Settings returns a different top-level tree; the page report must still
    # happen even though the app navigation/history controls are unmounted.
    if name == 'settings':
        expect(page.locator('.cx-history')).to_have_count(0)


def prepare(browser, errors):
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    expect_page(page, 'chat', ['chat'])
    return page


def back(page):
    if page.locator('.cxs-back').count():
        page.get_by_role('button', name='Zurück zur App', exact=True).click()
    else:
        page.locator('.cx-history').get_by_role('button', name='Zurück', exact=True).click()


def host_page(page, name):
    page.evaluate("name => window.dispatchEvent(new MessageEvent('message', { data: { kind: 'showPage', page: name } }))", name)


with headless_browser(port=PORT) as browser:
    errors = []
    page = prepare(browser, errors)
    sequence = ['chat']
    routes = [
        ('agents', lambda: page.locator('.cx-rail-nav').get_by_role('button', name=re.compile(r'^Aktive Agenten')).click()),
        ('automations', lambda: page.locator('.cx-rail-nav').get_by_role('button', name='Geplante Aktionen', exact=True).click()),
        ('plugins', lambda: page.locator('.cx-rail-nav').get_by_role('button', name='Plugins', exact=True).click()),
        ('accounts', lambda: page.get_by_role('button', name='Konten und Limits', exact=True).click()),
        ('exokortex', lambda: page.locator('.cx-rail-nav').get_by_role('button', name='Exokortex', exact=True).click()),
        ('settings', lambda: page.locator('.cx-rail-nav').get_by_role('button', name='Einstellungen', exact=True).click()),
    ]
    for name, navigate in routes:
        navigate()
        sequence.append(name)
        expect_page(page, name, sequence)

    # History uses its own cursor changes instead of calling setPage directly.
    # Both directions must update the native toolbar's context as well.
    for name in ['exokortex', 'accounts', 'plugins', 'automations', 'agents', 'chat']:
        back(page)
        sequence.append(name)
        expect_page(page, name, sequence)
    expect(page.locator('.cx-history').get_by_role('button', name='Zurück', exact=True)).to_be_disabled()
    for name, _ in routes:
        page.locator('.cx-history').get_by_role('button', name='Vorwärts', exact=True).click()
        sequence.append(name)
        expect_page(page, name, sequence)
    page.close()

    # The host listener is registered once. It must use current navigation
    # state, rather than the first render's page='chat' and history cursor=0.
    page = prepare(browser, errors)
    sequence = ['chat']
    for name in ['agents', 'automations', 'accounts', 'plugins', 'settings', 'exokortex']:
        host_page(page, name)
        sequence.append(name)
        expect_page(page, name, sequence)
        host_page(page, 'chat')
        sequence.append('chat')
        expect_page(page, 'chat', sequence)
        # Going back must find the immediately preceding page, not an older
        # route caused by truncating history with the stale initial cursor.
        back(page)
        sequence.append(name)
        expect_page(page, name, sequence)
        back(page)
        sequence.append('chat')
        expect_page(page, 'chat', sequence)
    assert set(sequence) == set(SURFACES), sequence
    assert page.evaluate("() => (window.__hostMessages || []).filter(m => m.kind === 'send' || m.kind === 'startTeam')") == []
    assert not errors, errors
    page.close()
    print('Titlebar page context: all seven pages, settings return tree, back/forward, host navigation and chat return passed.')
