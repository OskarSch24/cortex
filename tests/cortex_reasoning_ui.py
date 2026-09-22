"""Reasoning-Regler und Modellmenü nach Codex — Maße gegen die Bildschirmaufnahme vom 17.09.2026.

Vermessen in den 2×-Frames der Aufnahme, hier in CSS-px (±1): Popover 254 × 96,
Spur 230 × 24 mit 12 px Abstand zum Rand, Knopf 28 px, Punkte 4 px und 13 px vor
den Spurenden, Stufe 20 px und Modell 38 px unter der Oberkante (Mitte).
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'docs/screenshots'
SHOTS.mkdir(parents=True, exist_ok=True)

def near(actual, expected, what, tol=1.0):
    assert abs(actual - expected) <= tol, f'{what}: {actual} statt {expected}'

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e)=>e.remove()')

    page.locator('.model-btn').click()
    pop = page.locator('.reasoning-popup')
    expect(pop).to_be_visible()
    page.wait_for_timeout(350)
    box = pop.bounding_box()
    near(box['width'], 254, 'Popover-Breite'); near(box['height'], 96, 'Popover-Höhe')
    track = page.locator('.cx-rz-track').bounding_box()
    near(track['width'], 230, 'Spur-Breite'); near(track['height'], 24, 'Spur-Höhe')
    near(track['x'] - box['x'], 12, 'Spur links'); near(box['y'] + box['height'] - track['y'] - track['height'], 12, 'Spur unten')
    knob = page.locator('.cx-rz-knob').bounding_box()
    near(knob['width'], 28, 'Knopf'); near(knob['y'] + 14, track['y'] + 12, 'Knopf mittig')
    dots = page.locator('.cx-rz-dot')
    first, last = dots.first.bounding_box(), dots.last.bounding_box()
    near(first['width'], 4, 'Punkt')
    near(first['x'] + 2 - track['x'], 13, 'erster Punkt'); near(track['x'] + track['width'] - last['x'] - 2, 13, 'letzter Punkt')
    effort = page.locator('.cx-rz-effort').bounding_box(); model = page.locator('.cx-rz-model').bounding_box()
    near(effort['y'] + effort['height'] / 2 - box['y'], 20, 'Stufe'); near(model['y'] + model['height'] / 2 - box['y'], 38, 'Modellname')
    near(effort['x'] + effort['width'] / 2, box['x'] + box['width'] / 2, 'Stufe mittig', 8)

    # Claude: fünf Stufen, Vorgabe Hoch; ↺ ist aus, solange die Vorgabe gilt.
    expect(dots).to_have_count(5)
    expect(page.locator('.cx-rz-effort')).to_contain_text('Hoch')
    expect(page.get_by_role('button', name='Reasoning zurücksetzen')).to_be_disabled()
    page.keyboard.press('Tab')  # nichts darf dabei aufgehen
    page.locator('.cx-rz-slider input').focus(); page.keyboard.press('ArrowRight')
    expect(page.locator('.cx-rz-effort')).to_contain_text('Sehr hoch')
    page.get_by_role('button', name='Reasoning zurücksetzen').click()
    expect(page.locator('.cx-rz-effort')).to_contain_text('Hoch')

    # Das Modellmenü ersetzt das Popover und listet alle Konten.
    page.locator('.cx-rz-title').click()
    menu = page.get_by_role('menu', name='Modell auswählen')
    expect(menu).to_be_visible()
    expect(page.locator('.cx-rz-slider')).to_have_count(0)
    near(pop.bounding_box()['width'], 254, 'Menü-Breite')
    for group in ('Claude · privat', 'Claude · studio', 'Codex · privat', 'Codex · geschäftlich'):
        expect(menu.get_by_role('group', name=group)).to_have_count(1)
    expect(menu.get_by_role('menuitemradio', name='Standard Empfohlene Modellauswahl')).to_be_visible()
    rows = menu.locator('.cx-rz-row:not(.cx-rz-row-std)')
    near(rows.first.bounding_box()['height'], 28.5, 'Zeilenhöhe', 0.6)
    page.keyboard.press('Escape')
    expect(page.locator('.cx-rz-slider')).to_have_count(1)

    # Codex-Modell: sechs Stufen, ganz rechts Ultra mit Verlauf.
    page.locator('.cx-rz-title').click()
    menu.get_by_role('group', name='Codex · privat').get_by_role('menuitemradio', name='GPT-6 Astra').click()
    expect(page.locator('.cx-rz-model')).to_have_text('GPT-6 Astra')
    expect(dots).to_have_count(6)
    t = page.locator('.cx-rz-track').bounding_box()
    page.mouse.click(t['x'] + t['width'] - 13, t['y'] + 12)
    expect(page.locator('.cx-rz-effort')).to_contain_text('Ultra')
    expect(page.locator('.cx-rz-slider.ultra .cx-rz-stars')).to_have_count(1)
    color = page.locator('.cx-rz-effort').evaluate('e => getComputedStyle(e).color')
    assert color == 'rgb(164, 111, 250)', color
    # Die Partikel ziehen als Strom nach rechts, beide Ebenen.
    stream = "e => ['::before', '::after'].map(p => parseFloat(getComputedStyle(e, p).backgroundPositionX))"
    stars = page.locator('.cx-rz-stars')
    first = stars.evaluate(stream)
    page.wait_for_timeout(600)
    later = stars.evaluate(stream)
    assert all(b != a for a, b in zip(first, later)), (first, later)
    page.wait_for_timeout(300)
    b = pop.bounding_box()
    page.screenshot(path=str(SHOTS / 'reasoning-ultra.png'), clip={'x': b['x'] - 20, 'y': b['y'] - 20, 'width': b['width'] + 40, 'height': b['height'] + 40})

    assert errors == [], errors
    print('reasoning ui ok')
