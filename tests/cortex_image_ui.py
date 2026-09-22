"""Bild erstellen: Plus-Menü, Felder des Bildmodus, Senden, Bildkarte und ihre Aktionen."""
import re
import sys
from playwright.sync_api import expect
from headless_browser import headless_browser

SHOTS = sys.argv[1] if len(sys.argv) > 1 else None

def last(page, kind):
    return page.evaluate(f"(window.__hostMessages || []).filter(m => m.kind === '{kind}').at(-1)")

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1280, 'height': 900}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    composer = page.locator('.composer')

    # 1. Plus-Menü → Bild erstellen
    page.get_by_title('Hinzufügen', exact=True).click()
    row = page.locator('.add-popup').get_by_role('menuitem', name='Bild erstellen')
    expect(row).to_be_visible()
    expect(page.locator('.add-popup-rule')).to_have_count(1)
    if SHOTS: page.screenshot(path=f'{SHOTS}/ui-1-menu.png', clip={'x': 250, 'y': 520, 'width': 1000, 'height': 380})
    row.click()
    expect(page.locator('.add-popup')).to_have_count(0)
    expect(composer).to_have_class(re.compile(r'\bis-image\b'))
    expect(page.locator('.cx-img-chip')).to_be_visible()
    expect(page.locator('.composer textarea')).to_have_attribute('placeholder', 'Beschreibe das Bild …')
    expect(page.get_by_title('Berechtigungen für diese Aufgabe wählen')).to_have_count(0)
    expect(page.get_by_title('Konto und Modell für diese Aufgabe wählen')).to_have_count(0)

    # 2. Felder
    page.get_by_title('Seitenverhältnis').click()
    popup = page.locator('.cx-img-popup')
    expect(popup.locator('.cx-img-ratio-cell')).to_have_count(8)
    if SHOTS: page.screenshot(path=f'{SHOTS}/ui-2-ratio.png', clip={'x': 250, 'y': 560, 'width': 1000, 'height': 340})
    popup.get_by_role('menuitemradio', name='16:9').click()
    expect(page.get_by_title('Seitenverhältnis')).to_contain_text('16:9')
    page.get_by_title('Anzahl der Bilder').click()
    page.locator('.cx-img-count').get_by_role('menuitemradio', name='2').click()
    expect(page.get_by_title('Anzahl der Bilder')).to_contain_text('2')
    # Popups schließen sich gegenseitig und mit Esc — ohne den Bildmodus zu verlassen.
    page.get_by_title('Seitenverhältnis').click()
    page.keyboard.press('Escape')
    expect(page.locator('.cx-img-popup')).to_have_count(0)
    expect(page.locator('.cx-img-chip')).to_be_visible()

    # Stil und Transparent gibt es nicht mehr.
    expect(page.get_by_title('Stil', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Transparent')).to_have_count(0)

    # 3. Bildmodell: eine Zeile je Anbieter; Grok ist in der Vorschau abgelaufen.
    model = page.get_by_title('Bildmodell wählen')
    expect(model).to_contain_text('ChatGPT · GPT Image')
    model.click()
    mp = page.locator('.cx-img-model-popup')
    expect(mp.get_by_role('menuitemradio')).to_have_count(1)
    row = mp.locator('.cx-img-model-row')
    assert row.bounding_box()['height'] <= 40, row.bounding_box()
    expect(row.locator('.cx-img-model-order')).to_have_text('geschäftlich › privat')
    if SHOTS: page.screenshot(path=f'{SHOTS}/ui-3-model.png', clip={'x': 250, 'y': 620, 'width': 1000, 'height': 280})
    row.get_by_role('button', name=re.compile('Reihenfolge')).click()
    order = last(page, 'setImageAccountOrder')
    assert order == {'kind': 'setImageAccountOrder', 'provider': 'codex', 'accounts': ['privat', 'geschäftlich']}, order
    expect(row.locator('.cx-img-model-order')).to_have_text('privat › geschäftlich')
    row.get_by_role('button', name=re.compile('Reihenfolge')).click()
    expect(row.locator('.cx-img-model-order')).to_have_text('geschäftlich › privat')
    mp.get_by_role('menuitemradio').click()
    expect(mp).to_have_count(0)

    # 4. Senden
    page.locator('.composer textarea').fill('Ein ruhiger Arbeitsplatz am Fenster, Morgenlicht')
    if SHOTS: page.screenshot(path=f'{SHOTS}/ui-4-filled.png', clip={'x': 250, 'y': 700, 'width': 1000, 'height': 200})
    page.keyboard.press('Enter')
    sent = last(page, 'send')
    assert sent['image'] == {'ratio': '16:9', 'count': 2}, sent
    assert sent['imageProvider'] == 'codex' and 'target' not in sent, sent
    assert sent['permissionMode'] == 'safe' and sent['tags'] == [], sent

    # 5. Karte
    card = page.locator('.cx-img-card')
    expect(card).to_have_attribute('aria-label', '2 generierte Bilder')
    imgs = card.locator('img')
    expect(imgs).to_have_count(2)
    page.wait_for_function("[...document.querySelectorAll('.cx-img-card img')].every(i => i.complete && i.naturalWidth > 0)")
    expect(page.locator('.cx-c-user-image')).to_have_text(re.compile(r'Bild · 16:9 · 2 Bilder$'))
    card.scroll_into_view_if_needed()
    tile = card.locator('.cx-img-tile').first
    tile.hover()
    expect(tile.locator('.cx-img-tile-acts')).to_have_css('opacity', '1')
    if SHOTS:
        bb = card.bounding_box()
        page.screenshot(path=f'{SHOTS}/ui-5-card.png', clip={'x': bb['x'] - 30, 'y': max(0, bb['y'] - 120), 'width': bb['width'] + 60, 'height': bb['height'] + 140})
    tile.get_by_role('button', name='Bild bearbeiten', exact=True).click()
    editor = page.get_by_role('region', name='Bildbearbeitung', exact=True)
    expect(editor).to_be_visible()
    expect(editor.get_by_role('button', name='Bild 1 anzeigen')).to_have_attribute('aria-current', 'true')
    page.get_by_role('button', name='Bild 1 anzeigen').focus()
    page.keyboard.press('ArrowRight')
    expect(editor.get_by_role('button', name='Bild 2 anzeigen')).to_have_attribute('aria-current', 'true')
    page.keyboard.press('Escape')
    expect(editor).to_have_count(0)

    # 6. Aktionen
    card.get_by_role('button', name='Weitere Aktionen').click()
    card.get_by_role('menuitem', name='Im Projekt speichern …').click()
    act = last(page, 'imageAction')
    assert act['action'] == 'saveAll' and len(act['paths']) == 2, act
    tile.hover()
    tile.get_by_role('button', name='Speichern').click()
    act = last(page, 'imageAction')
    assert act['action'] == 'save' and act['path'].endswith('/1.jpg'), act
    card.get_by_role('button', name='Weitere Aktionen').click()
    card.get_by_role('menuitem', name='Im Finder zeigen').click()
    assert last(page, 'imageAction')['action'] == 'reveal'
    card.get_by_role('button', name='Weitere Aktionen').click()
    expect(card.locator('.cx-c-menu')).to_contain_text('Prompt kopieren')
    page.keyboard.press('Escape')
    card.get_by_role('button', name='Weitere Aktionen').click()
    card.get_by_role('menuitem', name='Variante erstellen').click()
    expect(page.locator('.cx-img-chip')).to_be_visible()
    expect(page.locator('.attachment-row')).to_have_count(2)
    expect(page.get_by_title('Anzahl der Bilder')).to_contain_text('1')
    expect(page.get_by_title('Seitenverhältnis')).to_contain_text('16:9')

    # 7. ⌘I und Esc verlassen den Bildmodus
    page.locator('.composer textarea').focus()
    page.keyboard.press('Meta+i')
    expect(page.locator('.cx-img-chip')).to_have_count(0)
    expect(page.get_by_title('Modell und Reasoning', exact=True)).to_be_visible()
    page.keyboard.press('Meta+i')
    expect(page.locator('.cx-img-chip')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('.cx-img-chip')).to_have_count(0)

    assert not errors, errors
    print('cortex_image_ui: ok')
