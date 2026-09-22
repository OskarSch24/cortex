"""Queue controls use fake host messages; no actual provider calls."""
from playwright.sync_api import expect
from headless_browser import headless_browser

def open_project(page, name):
    """Projektgruppen sind zu, bis man sie aufklappt — nur das Projekt der
    aktiven Aufgabe steht von selbst offen. Aufgaben in anderen Projekten sind
    also erst nach einem Klick auf den Ordner erreichbar."""
    row = page.get_by_role('button', name=name, exact=True)
    if row.get_attribute('aria-expanded') == 'false':
        row.click()
        page.wait_for_timeout(260)

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=queue')
    page.wait_for_load_state('networkidle'); page.locator('#harness').evaluate('(e)=>e.remove()')
    queue = page.get_by_role('region', name='Nachrichten-Warteschlange')
    expect(queue.get_by_role('listitem')).to_have_count(4)
    expect(queue.locator('img')).to_have_count(2)
    assert queue.locator('img').first.evaluate('e=>e.complete&&e.naturalWidth>0')
    textarea = page.locator('.composer textarea'); textarea.fill('Mein ungesendeter Entwurf')
    row = queue.get_by_role('listitem').nth(1)
    row.get_by_role('button', name='Weitere Nachrichtenaktionen').click()
    page.screenshot(path='docs/screenshots/queue-actions.png')
    page.get_by_role('menuitem', name='Bearbeiten').click()
    page.get_by_role('textbox', name='Wartende Nachricht bearbeiten').fill('Geänderte zweite Nachricht #ui')
    page.get_by_role('button', name='Speichern', exact=True).click()
    expect(row).to_contain_text('Geänderte zweite Nachricht #ui')
    expect(textarea).to_have_value('Mein ungesendeter Entwurf')
    row.get_by_role('button', name='Weitere Nachrichtenaktionen').click()
    page.get_by_role('menuitem', name='Nach oben', exact=True).click()
    expect(queue.get_by_role('listitem').first).to_contain_text('Geänderte zweite Nachricht #ui')
    queue.get_by_role('listitem').nth(2).get_by_role('button', name='Nachricht entfernen').click()
    expect(queue.get_by_role('listitem')).to_have_count(3)
    queue.get_by_role('listitem').first.get_by_role('button', name='Steuern', exact=True).click()
    expect(queue.get_by_role('listitem')).to_have_count(2)
    page.get_by_role('button', name='In Warteschlange', exact=True).click()
    expect(queue.get_by_role('listitem')).to_have_count(3)
    expect(queue.get_by_role('listitem').last).to_contain_text('Mein ungesendeter Entwurf')
    page.get_by_title('Stop (Esc)').click()
    expect(queue.get_by_role('button', name='Warteschlange fortsetzen')).to_be_visible()
    page.screenshot(path='docs/screenshots/message-queue.png')
    open_project(page, 'Design System')
    page.get_by_role('button', name='Farben und Typografie abstimmen', exact=True).click()
    expect(queue).to_have_count(0)
    open_project(page, 'Studio Website')
    page.get_by_role('button', name='Neue Startseite entwickeln', exact=True).click()
    expect(queue.get_by_role('listitem')).to_have_count(3)
    expect(queue.get_by_role('button', name='Warteschlange fortsetzen')).to_be_visible()
    queue.get_by_role('button', name='Warteschlange fortsetzen').click()
    expect(queue.get_by_role('button', name='Warteschlange fortsetzen')).to_have_count(0)
    # Eine Nachricht, die nicht in den laufenden Auftrag darf: die Schaltfläche
    # ist aus und nennt den Grund. Ohne ihn wirkt sie kaputt.
    gesperrt = queue.get_by_role('listitem').filter(has_text='Alle Felder mit einem Klick').get_by_role('button', name='Steuern')
    expect(gesperrt).to_be_disabled()
    assert 'Reasoning-Stärke' in (gesperrt.get_attribute('title') or ''), gesperrt.get_attribute('title')
    assert 'automatisch raus' in (gesperrt.get_attribute('title') or '')
    offen = queue.get_by_role('listitem').first.get_by_role('button', name='Steuern')
    expect(offen).to_be_enabled()
    assert offen.get_attribute('title') == 'Jetzt an den laufenden Agenten senden'
    for width in [1152, 960, 760]:
        page.set_viewport_size({'width': width, 'height': 768})
        assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
        expect(queue).to_be_visible()
        page.screenshot(path=f'docs/screenshots/message-queue-{width}.png')
    assert errors == [], errors
    print('Queue UI: previews, edit, reorder, delete, steer, submit, pause, task switching and responsive sizes passed.')
    page.close()
