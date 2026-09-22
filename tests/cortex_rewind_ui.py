"""Bearbeiten, Zurückgehen und Abzweigen an deinen Nachrichten — im echten Webview-Bundle, ohne Anbieter.

Die Kürzung des Verlaufs und des Modellkontexts prüfen die Unit-Tests
(engine/packages/vscode/test/unit/rewind.test.ts, core/test/rewind.test.ts);
hier geht es darum, dass die Knöpfe da sind und das Richtige an den Host schicken.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'docs/screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)

def posted(page, kind):
    return page.evaluate('k => (window.__hostMessages || []).filter(m => m.kind === k)', kind)

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')

    users = page.locator('.cx-c-user')
    expect(users).to_have_count(2)
    second = users.nth(1)
    second.hover()
    for name in ('Zu dieser Nachricht zurückgehen', 'Ab hier abzweigen', 'Nachricht bearbeiten', 'Nachricht kopieren'):
        expect(second.get_by_role('button', name=name)).to_be_visible()
    second.screenshot(path=str(SHOTS / 'rewind-actions.png'))

    # Bearbeiten: die Blase wird zum Feld; Escape bricht ab, ohne etwas zu senden.
    second.get_by_role('button', name='Nachricht bearbeiten').click()
    field = second.get_by_role('textbox', name='Nachricht bearbeiten')
    expect(field).to_be_focused()
    expect(field).to_have_value('Das sieht gut aus. Mach die Projektkarten bitte etwas ruhiger und prüfe die Darstellung auf dem Smartphone.')
    expect(second.get_by_role('button', name='Senden')).to_be_disabled()
    page.keyboard.press('Escape')
    expect(field).to_have_count(0)
    assert posted(page, 'editMessage') == []

    second.hover()
    second.get_by_role('button', name='Nachricht bearbeiten').click()
    field.fill('Mach die Projektkarten ruhiger. #ui')
    second.screenshot(path=str(SHOTS / 'rewind-edit.png'))
    field.press('Enter')
    sent = posted(page, 'editMessage')
    assert len(sent) == 1 and sent[0]['index'] == 1, sent
    assert sent[0]['send']['kind'] == 'send' and sent[0]['send']['text'] == 'Mach die Projektkarten ruhiger. #ui', sent
    assert sent[0]['send']['tags'] == ['ui'], sent

    # Zurückgehen legt den Text (ohne Dateiliste) samt Anhang zurück ins Eingabefeld.
    first = users.nth(0)
    first.hover()
    first.get_by_role('button', name='Zu dieser Nachricht zurückgehen').click()
    assert posted(page, 'rewindTo') == [{'kind': 'rewindTo', 'index': 0}]
    expect(page.locator('.composer textarea')).to_have_value(__import__('re').compile(r'^Ich bin gerade dabei'))

    second.hover()
    second.get_by_role('button', name='Ab hier abzweigen').click()
    assert posted(page, 'forkFrom') == [{'kind': 'forkFrom', 'index': 1}]
    expect(page.locator('.composer textarea')).to_have_value(__import__('re').compile(r'^Das sieht gut aus'))

    assert errors == [], errors
    print('rewind ui ok')
