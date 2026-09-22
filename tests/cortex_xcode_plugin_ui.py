"""Xcode als Plugin: Katalogeintrag, echte Serverdefinition und ehrlicher Einrichtungszustand."""
import re
import sys
from playwright.sync_api import expect
from headless_browser import headless_browser

SHOTS = sys.argv[1] if len(sys.argv) > 1 else None

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')
    page.get_by_role('button', name='Plugins', exact=True).click()

    page.locator('.cx-plugin-search input').fill('xcode')
    row = page.get_by_role('button', name=re.compile(r'^Xcode'))
    expect(row.first).to_be_visible()
    expect(page.locator('.cx-plugin-row', has_text='Xcode').locator('img')).to_have_count(1)
    row.first.click()
    expect(page.get_by_role('heading', name='Xcode', exact=True)).to_be_visible()
    expect(page.locator('.cx-plugin-detail')).to_contain_text('xcrun mcpbridge')
    # Schon vor dem Installieren sagt die Seite, was an Xcode fehlt — mit Schild, nicht mit Haken.
    expect(page.locator('.cx-plugin-note')).to_contain_text('Downloads')
    expect(page.locator('.cx-plugin-note')).not_to_have_class(re.compile(r'\bok\b'))
    page.get_by_role('button', name='Plugin installieren').click()
    sent = page.evaluate("(window.__hostMessages || []).filter(m => m.kind === 'installPlugin').at(-1)")
    assert sent['id'] == 'xcode', sent
    note = page.locator('.cx-plugin-note')
    expect(note).to_contain_text('Downloads')
    expect(note).to_contain_text('Intelligence')
    if SHOTS: page.screenshot(path=f'{SHOTS}/xcode-detail.png')
    page.get_by_role('button', name='Zurück zur Übersicht').click()
    page.locator('.cx-plugin-search input').fill('')
    expect(page.get_by_role('heading', name='Einrichtung offen')).to_be_visible()
    open_setup = page.locator('.cx-plugin-section', has=page.get_by_role('heading', name='Einrichtung offen'))
    expect(open_setup).to_contain_text('Xcode')
    assert not errors, errors
    print('cortex_xcode_plugin_ui: ok')
