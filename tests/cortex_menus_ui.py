"""Cortex menu palette and keyboard behavior, using only the headless runtime."""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

ROOT = Path(__file__).resolve().parents[1]
PORT = 4187

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 980}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script('''window.__menuTemplateResponses = [];
      window.addEventListener('message', event => {
        if (event.data?.kind === 'templates') window.__menuTemplateResponses.push(event.data.items.length);
      });''')
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    text = page.locator('.composer > textarea')
    text.fill('Mein Entwurf bleibt erhalten.')

    def branded(menu):
        expect(menu).to_be_visible()
        values = menu.evaluate('''element => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, border: style.borderTopColor,
                   blur: style.backdropFilter, font: style.fontFamily, corner: style.borderRadius };
        }''')
        # Cortex-Popover: eigene Fläche (--cx-popover), feine Linie, Manrope, Inselradius.
        assert values['background'] == 'rgb(29, 32, 36)', values
        assert values['border'] == 'rgba(236, 237, 239, 0.09)', values
        assert values['blur'] == 'none' and values['font'].startswith('Manrope'), values
        assert values['corner'] == '14px', values

    # The plus popup keeps real actions and supports keyboard navigation.
    plus = page.get_by_role('button', name='Hinzufügen', exact=True)
    plus.click()
    menu = page.get_by_role('menu', name='Hinzufügen', exact=True)
    branded(menu)
    plus.press('ArrowDown')
    expect(menu.get_by_role('menuitem').first).to_be_focused()
    page.keyboard.press('End')
    expect(menu.get_by_role('menuitem', name='Vorlagen', exact=True)).to_be_focused()
    page.keyboard.press('Home')
    expect(menu.get_by_role('menuitem').first).to_be_focused()
    page.keyboard.press('Escape')
    expect(menu).to_have_count(0)
    expect(plus).to_be_focused()
    expect(text).to_have_value('Mein Entwurf bleibt erhalten.')

    # Permission options share colors and keep their checked state and action.
    permission = page.get_by_title('Berechtigungen für diese Aufgabe wählen')
    permission.click()
    permissions = page.get_by_role('menu', name='Berechtigungen', exact=True)
    branded(permissions)
    permission.press('ArrowDown')
    expect(permissions.get_by_role('menuitemradio').first).to_be_focused()
    page.keyboard.press('End')
    expect(permissions.get_by_role('menuitemradio').last).to_be_focused()
    page.keyboard.press('Escape')
    expect(permission).to_be_focused()

    # Model list keeps its separate slider view; arrow keys on the range input
    # change effort rather than being hijacked by menu navigation.
    page.locator('.model-btn').click()
    branded(page.locator('.reasoning-popup'))
    slider = page.locator('.cx-rz-slider input')
    previous = slider.input_value()
    slider.focus()
    slider.press('ArrowLeft')
    assert slider.input_value() != previous
    page.locator('.cx-rz-title').click()
    models = page.get_by_role('menu', name='Modell auswählen')
    expect(models).to_be_visible()
    # The model picker intentionally focuses the currently selected model.
    # Navigate from there, rather than assuming opening leaves no focused row.
    expect(models.locator('[aria-checked="true"]')).to_be_focused()
    page.keyboard.press('Home')
    expect(models.get_by_role('menuitemradio').first).to_be_focused()
    page.keyboard.press('ArrowDown')
    expect(models.get_by_role('menuitemradio').nth(1)).to_be_focused()
    page.keyboard.press('Escape')
    expect(slider).to_be_visible()
    page.keyboard.press('Escape')
    expect(page.locator('.reasoning-popup')).to_have_count(0)

    text.fill('/docs')
    try:
        expect(page.locator('.cx-template')).to_have_count(7, timeout=20000)
    except AssertionError:
        print('Template loading diagnostics:', page.evaluate('''({
          text: document.querySelector('.composer > textarea')?.value,
          gallery: document.querySelector('.cx-templates')?.innerText,
          host: (window.__hostMessages || []).slice(-12),
          responses: window.__menuTemplateResponses
        })'''), errors, flush=True)
        raise
    category = page.get_by_role('button', name='Vorlagenart auswählen')
    category.click()
    categories = page.get_by_role('menu', name='Vorlagenart')
    branded(categories)
    category.press('ArrowDown')
    expect(categories.get_by_role('menuitemradio', name='Dokumente')).to_be_focused()
    page.keyboard.press('ArrowDown')
    page.keyboard.press('Enter')
    expect(categories).to_have_count(0)
    expect(page.locator('.cx-template-name').first).to_have_text('Business Review')
    category.click()
    page.locator('.cx-conversation').click(position={'x': 40, 'y': 40})
    expect(categories).to_have_count(0)

    # Variables propagate to all explicitly scoped menu surfaces in light/custom
    # themes; no hardcoded dark panel remains in the webview.
    text.fill('Mein Entwurf bleibt erhalten.')
    page.evaluate('''() => {
      const root = document.documentElement;
      root.setAttribute('data-cx-theme', 'hell');
      root.style.setProperty('--cx-template-panel', '#ffffff');
      root.style.setProperty('--cx-text', '#202020');
      root.style.setProperty('--cx-strong-line', '#d5d5d5');
    }''')
    plus.click()
    expect(menu).to_be_visible()
    assert menu.evaluate('e => getComputedStyle(e).backgroundColor') == 'rgb(255, 255, 255)'
    assert menu.evaluate('e => getComputedStyle(e).color') == 'rgb(32, 32, 32)'
    page.keyboard.press('Escape')
    page.evaluate('''() => {
      const root = document.documentElement;
      root.removeAttribute('data-cx-theme');
      ['--cx-template-panel', '--cx-text', '--cx-strong-line'].forEach(name => root.style.removeProperty(name));
    }''')
    plus.click()
    branded(menu)
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'docs/screenshots/cortex-menus.png'))
    assert page.evaluate('(window.__hostMessages || []).filter(message => message.kind === "send")') == []
    assert not errors, errors
    print('Cortex menus: neutral palette, no transparency, real actions, arrow/Home/End/Escape, focus return, slider and light-theme behavior passed.')
