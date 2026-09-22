"""Die Reiter im Dock gehören dem Chat, nicht dem Fenster.

Gemeldet am 20.09.2026: eine in einem Chat geöffnete Zeichenfläche stand
anschließend in jedem anderen Chat offen, obwohl ihr Inhalt chatgebunden ist.
Der Vorschau-Server auf 4173 startet von selbst (headless_browser.preview_server).
"""
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=canvas'
ERSTER = 'Überarbeite Cortex App Icon'
ZWEITER = 'Cortex IDE-Design modernisieren'


def chat_oeffnen(page, titel):
    # Der Sitzname der Chatzeile trägt noch Zusätze; die Klasse ist eindeutig.
    # Im Seitenbaum überlagern sich Zeilen beim Scrollen; geprüft wird hier das
    # Dock, nicht die Trefferfläche — deshalb das Ereignis direkt an die Zeile.
    page.locator('button.cx-tree-task-open', has_text=titel).first.dispatch_event('click')
    page.wait_for_timeout(700)


def zeichenflaeche(page):
    return page.locator('.cx-dock').get_by_text('Excalidraw').first


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1500, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')

    # Im ersten Chat die Fläche aufmachen.
    chat_oeffnen(page, ERSTER)
    box = page.locator('.cx-composer textarea, .composer textarea, textarea').first
    box.click()
    box.fill('/excalidraw')
    # Die Befehlsliste unter dem Slash würde Enter für sich nehmen.
    page.keyboard.press('Escape')
    box.press('Enter')
    page.wait_for_timeout(2500)
    expect(page.locator('.cx-dock')).to_be_visible()
    expect(zeichenflaeche(page)).to_be_visible()

    # Der zweite Chat hat sie nie geöffnet — er darf sie nicht erben.
    chat_oeffnen(page, ZWEITER)
    expect(page.locator('.cx-dock')).to_have_count(0)

    # Zurück im ersten steht sie wieder da.
    chat_oeffnen(page, ERSTER)
    expect(page.locator('.cx-dock')).to_be_visible()
    expect(zeichenflaeche(page)).to_be_visible()

    # Und der zweite bleibt auch beim zweiten Besuch zu.
    chat_oeffnen(page, ZWEITER)
    expect(page.locator('.cx-dock')).to_have_count(0)

    bad = [e for e in errors if 'favicon' not in e and 'falling back to the main thread' not in e]
    assert not bad, bad
    print('Dock je Chat: Zeichenfläche bleibt im Chat, in dem sie geöffnet wurde, und kommt dort wieder.')
