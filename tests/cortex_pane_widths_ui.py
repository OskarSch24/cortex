"""Drag the actual pane boundaries; check persistence, bounds and live content."""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

def width(locator):
    return locator.bounding_box()['width']

def drag(page, handle, dx):
    box = handle.bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + min(240, box['height'] / 2)
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + dx, y, steps=12)
    page.mouse.up()
    assert not page.locator('body.cx-resizing-pane').count()

def files(page):
    page.evaluate("() => window.dispatchEvent(new MessageEvent('message', {data:{kind:'toolbar', action:'files'}}))")
    expect(page.get_by_role('tab', name='Datei öffnen')).to_be_visible()
    # Das Dock fährt herein (0,40 s); gemessen wird erst, wenn es steht.
    page.wait_for_function("() => { const d = document.querySelector('.cx-dock'); return d && !d.classList.contains('enter') && d.getBoundingClientRect().width >= 319; }")
    page.wait_for_timeout(450)

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1710, 'height': 1074})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(node) => node.remove()')
    files(page)
    dock = page.get_by_role('complementary', name='Arbeitsbereich')
    sidebar = page.locator('.cx-sidebar')
    tree = page.locator('.cx-dock-tree')
    page.get_by_role('button', name='README.md', exact=True).click()
    expect(dock.locator('.cx-dock-file.rendered')).to_be_visible()
    draft = page.locator('.composer textarea')
    draft.fill('Ungesendeter Entwurf bleibt erhalten.')
    old_dock = width(dock)
    drag(page, page.get_by_role('separator', name='Dock verbreitern'), -140)
    assert abs(width(dock) - old_dock - 140) < 2
    old_tree = width(tree)
    drag(page, page.get_by_role('separator', name='Dateibaumbreite'), 55)
    assert abs(width(tree) - old_tree + 55) < 2
    old_sidebar = width(sidebar)
    drag(page, page.get_by_role('separator', name='Seitenleistenbreite'), 70)
    assert abs(width(sidebar) - old_sidebar - 70) < 2
    expect(draft).to_have_value('Ungesendeter Entwurf bleibt erhalten.')
    assert width(page.locator('.cx-conversation')) >= 299
    assert width(page.locator('.cx-dock-main')) >= 219

    # Keyboard and reset act on the same measured width without scrolling.
    handle = page.get_by_role('separator', name='Dateibaumbreite')
    handle.focus()
    before = width(tree)
    handle.press('ArrowLeft')
    assert abs(width(tree) - before - 16) < 2
    handle.dblclick()
    assert abs(width(tree) - 230) < 2
    drag(page, handle, -30)
    remembered = [width(sidebar), width(dock), width(tree)]
    page.get_by_role('button', name='Seitenleiste ausblenden', exact=True).click()
    # Eingeklappt fährt die Leiste hinter die schmale Icon-Leiste; von ihr bleibt nichts zu sehen.
    page.wait_for_function("() => { const rail = document.querySelector('.cx-mini-rail'); return rail && document.querySelector('.cx-sidebar').getBoundingClientRect().right <= rail.getBoundingClientRect().right + 1; }")
    page.evaluate("() => window.dispatchEvent(new MessageEvent('message', {data:{kind:'toolbar', action:'sidebar'}}))")
    page.wait_for_function("() => document.querySelector('.cx-sidebar').getBoundingClientRect().left > -1")
    assert abs(width(sidebar) - remembered[0]) < 2
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(node) => node.remove()')
    files(page)
    for actual, saved in zip([width(sidebar), width(dock), width(tree)], remembered):
        assert abs(actual - saved) < 2, (actual, saved)

    # Über die Grenzen hinaus rastet das Dock ein wie bei Codex: zu breit geht
    # es ins Vollbild, zu schmal klappt es zu. Beim Verlassen des Vollbilds
    # behält der Chat seine Mindestbreite; der Baum kommt mit dem Platz zurück.
    drag(page, page.get_by_role('separator', name='Dock verbreitern'), -1000)
    page.get_by_role('button', name='Vollbildmodus beenden').click()
    page.wait_for_timeout(350)  # der Chat wächst weich zurück
    assert width(page.locator('.cx-conversation')) >= 299
    assert dock.bounding_box()['x'] + width(dock) <= 1711
    drag(page, page.get_by_role('separator', name='Dock verbreitern'), 1000)
    page.wait_for_function("() => !document.querySelector('.cx-dock')")
    page.evaluate("() => window.dispatchEvent(new MessageEvent('message', {data:{kind:'toolbar', action:'dock'}}))")
    page.wait_for_timeout(450)
    assert abs(width(dock) - 320) < 2
    expect(tree).to_be_hidden()
    page.get_by_role('separator', name='Dock verbreitern').dblclick()
    expect(tree).to_be_visible()
    page.get_by_role('button', name='README.md', exact=True).click()
    page.get_by_role('button', name='Vollbildmodus aktivieren').click()
    expect(page.get_by_role('separator', name='Dock verbreitern')).to_have_count(0)
    assert width(dock) > 1000
    page.get_by_role('button', name='Vollbildmodus beenden').click()
    expect(page.get_by_role('separator', name='Dock verbreitern')).to_be_visible()
    page.set_viewport_size({'width': 960, 'height': 800})
    page.wait_for_function("() => document.querySelector('.cx-dock').getBoundingClientRect().right <= innerWidth + 1")
    drag(page, page.get_by_role('separator', name='Dock verbreitern'), 90)
    assert dock.bounding_box()['x'] >= 0
    page.set_viewport_size({'width': 1710, 'height': 1074})
    page.get_by_role('separator', name='Dock verbreitern').dblclick()
    Path('/tmp/cortex-pane-widths').mkdir(exist_ok=True)
    page.screenshot(path='/tmp/cortex-pane-widths/widths.png')
    assert not errors, errors
    print('cortex_pane_widths_ui: ok')
