"""Chat öffnen: Verlauf steht unten, ohne Streifenleiste."""
import re
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation'
HOST = Path(__file__).resolve().parents[1] / 'engine/packages/vscode/src/panel/chatViewProvider.ts'

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: (errors.append(str(e)), print('Browser error:', e, flush=True)))
    policy = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', HOST.read_text()).group(1)
    policy = policy.replace('${webview.cspSource}', 'http://127.0.0.1:4173').replace('${nonce}', 'cortex-ui-test')

    def apply_host_policy(route):
        response = route.fetch()
        html = response.text().replace('<head>', '<head>\n<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
        html = re.sub(r'<script(?=[\s>])', '<script nonce="cortex-ui-test"', html)
        route.fulfill(response=response, body=html)

    page.route('**/dev/preview.html?*', apply_host_policy)
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')

    expect(page.locator('.cx-transcript-scroll')).to_be_visible()
    expect(page.get_by_text('Die Startseite ist überarbeitet', exact=False)).to_be_visible()

    at_bottom = page.evaluate('''() => {
      const el = document.querySelector('.cx-transcript-scroll');
      if (!el) return false;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    }''')
    assert at_bottom, 'Chat öffnete nicht bei der neuesten Nachricht'

    expect(page.locator('.cx-c-rail')).to_have_count(0)

    open_project = page.get_by_role('button', name='Studio Website', exact=True)
    if open_project.get_attribute('aria-expanded') == 'false':
        open_project.click()
        page.wait_for_timeout(260)
    page.get_by_role('button', name='Mobile Navigation verbessern', exact=True).click()
    page.wait_for_timeout(80)
    page.get_by_role('button', name='Neue Startseite entwickeln', exact=True).click()
    expect(page.get_by_text('Die Startseite ist überarbeitet', exact=False)).to_be_visible()
    at_bottom_again = page.evaluate('''() => {
      const el = document.querySelector('.cx-transcript-scroll');
      if (!el) return false;
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    }''')
    assert at_bottom_again, 'Zweiter Chat-Öffner landete nicht unten'

    assert errors == [], errors
    print('Cortex Chat: Verlauf unten, keine Streifenleiste.')
    page.close()
