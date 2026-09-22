"""Composer popups dismiss consistently without losing settings or input."""
from playwright.sync_api import expect
from headless_browser import headless_browser

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(e) => e.remove()')
    model = page.get_by_title('Modell und Reasoning', exact=True)
    model.click()
    page.get_by_title('Modell wechseln', exact=True).click()
    page.get_by_role('menuitemradio', name='Sonnet 5', exact=True).first.click()
    page.keyboard.press('Escape')
    cases = [
        ('Modell und Reasoning', '.reasoning-popup', '.cx-rz-head'),
        ('Berechtigungen für diese Aufgabe wählen', '.permission-popup', '.menu-label'),
    ]
    for title, selector, inside in cases:
        trigger = page.get_by_title(title, exact=True)
        popup = page.locator(selector)
        trigger.click()
        expect(popup).to_be_visible()
        popup.locator(inside).first.click(position={'x': 3, 'y': 3})
        expect(popup).to_be_visible()
        page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
        expect(popup).to_have_count(0)
        trigger.click()
        point = page.locator('.composer textarea').evaluate("""e => {
          const r = e.getBoundingClientRect();
          for (const x of [r.left + 5, r.right - 5, r.left + r.width / 2]) {
            const y = r.top + 5;
            if (document.elementFromPoint(x, y) === e) return {x, y};
          }
          throw new Error('No exposed textarea point');
        }""")
        page.mouse.click(point['x'], point['y'])
        expect(popup).to_have_count(0)
        trigger.click()
        page.keyboard.press('Escape')
        expect(popup).to_have_count(0)
        trigger.click()
        page.get_by_title('Hinzufügen', exact=True).click()
        expect(popup).to_have_count(0)
        expect(page.locator('.add-popup')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('.add-popup')).to_have_count(0)
    model.click()
    page.get_by_title('Modell wechseln', exact=True).click()
    expect(page.get_by_role('menu', name='Modell auswählen')).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.get_by_role('menu', name='Modell auswählen')).to_have_count(0)
    expect(page.get_by_role('slider', name='Reasoning', exact=True)).to_be_visible()
    page.get_by_title(cases[1][0], exact=True).click()
    expect(page.locator('.reasoning-popup')).to_have_count(0)
    expect(page.locator('.permission-popup')).to_be_visible()
    model.click()
    expect(page.locator('.permission-popup')).to_have_count(0)
    slider = page.get_by_role('slider', name='Reasoning', exact=True)
    slider.fill('3')
    expect(page.locator('.reasoning-popup')).to_be_visible()
    page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
    model.click()
    expect(slider).to_have_value('3')
    page.keyboard.press('Escape')
    text = page.locator('.composer textarea')
    text.fill('/'); expect(page.locator('.suggest-popup')).to_be_visible()
    page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
    expect(page.locator('.suggest-popup')).to_have_count(0)
    expect(text).to_have_value('/')
    text.fill('/r'); expect(page.locator('.suggest-popup')).to_be_visible()
    page.locator('.suggest-row').first.click()
    expect(page.locator('.suggest-popup')).to_have_count(0)
    print('Composer popups: outside clicks, switching, inside interaction, nested Escape, reasoning persistence and suggestions passed.')
    page.close()
