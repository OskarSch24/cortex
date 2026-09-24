"""Exercise the real Office template gallery and screenshot-matched composer."""
from pathlib import Path
import json
import re
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/screenshots'
OUT.mkdir(exist_ok=True)

with headless_browser(port=4174) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4174/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    def emit(message):
        page.evaluate('data => window.dispatchEvent(new MessageEvent("message", { data }))', message)
    emit({'kind': 'modes', 'permissionMode': 'full', 'askPermission': False, 'routingMode': 'auto'})
    emit({'kind': 'pinnedTarget', 'target': {'provider': 'codex', 'account': 'privat', 'model': 'gpt-6-astra'}, 'standard': False})
    composer = page.locator('.composer')
    text = page.locator('.composer > textarea')
    assert composer.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(27, 30, 34)'  # --cx-composer
    assert abs(composer.bounding_box()['height'] - 98) <= 1, composer.bounding_box()
    assert composer.bounding_box()['width'] == 736
    composer.screenshot(path=str(OUT / 'codex-composer-empty.png'))
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Vorlagen', exact=True).click()
    gallery = page.locator('.cx-templates')
    expect(page.locator('.cx-template')).to_have_count(7, timeout=20000)
    page.wait_for_function('Array.from(document.querySelectorAll(".cx-template-sheet img")).every(i => i.complete && i.naturalWidth > 0)')
    assert gallery.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(31, 34, 39)'  # --cx-template-panel
    first = page.locator('.cx-template-sheet').first.bounding_box()
    assert first['width'] == 138 and first['height'] == 174, first
    expect(page.get_by_role('button', name='Vorherige Vorlagen')).to_be_disabled()
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'codex-templates-documents.png'))
    page.get_by_role('button', name='Weitere Vorlagen').click()
    expect(page.get_by_role('button', name='Vorherige Vorlagen')).to_be_enabled()
    page.get_by_role('button', name='Vorlagenart auswählen').click()
    page.get_by_role('menuitemradio', name='Präsentationen', exact=True).click()
    expect(page.locator('.cx-template')).to_have_count(7, timeout=20000)
    expect(page.locator('.cx-template-name').first).to_have_text('Business Review')
    page.wait_for_function('Array.from(document.querySelectorAll(".cx-template-sheet img")).every(i => i.complete && i.naturalWidth > 0)')
    first = page.locator('.cx-template-sheet').first.bounding_box()
    assert abs(first['width'] / first['height'] - 16/9) < 0.01, first
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'codex-templates-presentations.png'))
    page.get_by_role('button', name='Vorlagenart auswählen').click()
    page.get_by_role('menuitemradio', name='Tabellen', exact=True).click()
    expect(page.locator('.cx-template')).to_have_count(6)
    expect(page.locator('.cx-template-name').first).to_have_text('Analytics Dashboard')
    page.wait_for_function('Array.from(document.querySelectorAll(".cx-template-sheet img")).every(i => i.complete && i.naturalWidth > 0)')
    page.locator('.cx-compose-area').screenshot(path=str(OUT / 'codex-templates-spreadsheets.png'))
    page.get_by_role('button', name='Financial Budget', exact=True).click()
    expect(gallery).to_have_count(0)
    expect(text).to_have_value('Erstelle eine neue Tabelle mit der Vorlage „Financial Budget“. Frage mich zuerst, worum es darin gehen soll.')
    expect(page.locator('.attachment-row')).to_have_count(2)
    paths = page.locator('.attachment-row').evaluate_all('es => es.map(e => e.title)')
    assert any(path.endswith('/reference.xlsx') for path in paths), paths
    assert any(path.endswith('/USAGE.md') for path in paths), paths
    # Choosing a second template replaces the first pair, preserving ordinary files.
    emit({'kind': 'attachments', 'paths': paths + ['/demo/brief.txt']})
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Vorlagen', exact=True).click()
    page.get_by_role('button', name='Experiment Analysis', exact=True).click()
    current = page.locator('.attachment-row').evaluate_all('es => es.map(e => e.title)')
    assert len(current) == 3 and '/demo/brief.txt' in current, current
    assert not any('financial-budget' in path for path in current), current
    assert any('experiment-analysis/assets/reference.docx' in path for path in current), current
    page.get_by_role('button', name='Hinzufügen', exact=True).click()
    page.get_by_role('menuitem', name='Vorlagen', exact=True).click()
    page.get_by_role('button', name='Vorlagenart auswählen').click()
    page.get_by_role('menuitemradio', name='Tabellen', exact=True).click()
    page.get_by_role('button', name='Financial Budget', exact=True).click()
    # Remove the unrelated brief to retain the two-file send assertion below.
    page.locator('.attachment-row').filter(has_text='brief.txt').locator('.attachment-x').click()
    # Draft, attachments and real send action survive the speech setup entry.
    page.get_by_role('button', name='Diktat einrichten').click()
    expect(page.get_by_role('heading', name=re.compile('^Stimme'))).to_be_visible()
    page.get_by_role('button', name='Zurück zur App', exact=True).click()
    expect(text).to_have_value('Erstelle eine neue Tabelle mit der Vorlage „Financial Budget“. Frage mich zuerst, worum es darin gehen soll.')
    expect(page.locator('.attachment-row')).to_have_count(2)
    page.locator('.send').click()
    page.wait_for_function('(window.__hostMessages || []).some(m => m.kind === "send")')
    sent = page.evaluate('(window.__hostMessages || []).filter(m => m.kind === "send").at(-1)')
    assert sent['attachments'] == paths, sent
    for width in (960, 760, 560):
        page.set_viewport_size({'width': width, 'height': 900})
        assert page.locator('body').evaluate('e => e.scrollWidth <= window.innerWidth')
        box = composer.bounding_box()
        assert box['x'] >= 0 and box['x'] + box['width'] <= width + 1, (width, box)
    assert not errors, errors
    print('Original templates: 20 real assets, 3 categories, previews, carousel, selection, attachment/send, speech settings draft preservation and responsive composer passed.')
