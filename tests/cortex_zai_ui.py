"""Z.ai: Anbieter mit API-Schlüssel in Einstellungen → Konto.

Prüft in der Vorschau (Host-Attrappe in dev/cortex-fixture.js), dass Z.ai als
Anbieter erscheint, der Dialog nach einem Schlüssel fragt (mit Z.ai-Hinweisen)
und beim Absenden `addApiKeyAccount` mit `provider: 'zai'` schickt.

Voraussetzung:
  python3 -m http.server 4173 --bind 127.0.0.1 --directory engine/packages/vscode

Kein Desktop-Browser: ausschließlich chromium-headless-shell über
`tests/headless_browser.py`, wie in AGENTS.md festgelegt.
"""
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    page.locator('.cx-settings-btn').click()
    page.locator('.cxs-nav').get_by_role('button', name='Konto', exact=True).click()

    card = page.locator('.cx-provider-card', has_text='Z.ai')
    expect(card).to_be_visible()
    expect(card.locator('path[d^="M12.105 2L9.927"]')).to_have_count(1)  # Z.ai-Logo
    card.get_by_role('button').click()

    dialog = page.locator('.cx-connect-dialog')
    expect(dialog).to_contain_text('Z.ai-Schlüssel')
    expect(dialog.locator('select')).to_have_value('zai')
    expect(dialog.locator('a[href="https://z.ai/manage-apikey/apikey-list"]')).to_be_visible()
    expect(dialog.locator('input[type="email"]')).to_have_count(0)
    dialog.locator('input[type="password"]').fill('0123456789abcdef0123456789abcdef.ABCDEFGHIJ')
    dialog.get_by_role('button', name='Schlüssel prüfen und speichern').click()

    sent = page.evaluate("(window.__hostMessages || []).filter(m => m.kind === 'addApiKeyAccount')")
    assert sent and sent[-1]['provider'] == 'zai', sent
    assert not errors, errors
    print('Z.ai-Dialog: ok')
