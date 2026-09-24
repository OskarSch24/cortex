"""Websuche je Agent im echten Editor: Standard des Modells, Exa Instant, Aus.

Standard wird nicht gespeichert (alte Profile bleiben gleich), Exa Instant
braucht ein OpenRouter-Konto, Copilot hat keinen Schalter. Die Vorschau
speichert nur; kein Anbieter und keine Suche wird aufgerufen.
"""
from pathlib import Path
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview
from cortex_control_styles import assert_controls_styled

ROOT = Path(__file__).resolve().parents[1]
PORT = 4219
SEARCH = 'Websuche des Agenten'

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))

    def load(query=''):
        page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&automation-test=1{query}')
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(element) => element.remove()')
        expect(page.get_by_role('button', name='Agent erstellen', exact=True)).to_be_visible()

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=re.compile('^' + re.escape(option))).click()

    def profile(name):
        return page.evaluate('(name) => window.__cortexTeams.state.teams.find(team => team.name === name)', name)

    def save():
        page.get_by_role('button', name='Agent speichern', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')

    def new_agent(name, account):
        to_overview(page)
        page.get_by_role('button', name='Agent erstellen', exact=True).click()
        page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
        page.get_by_label('Agentenname', exact=True).fill(name)
        select('Konto des Agenten', account)

    search = page.get_by_role('button', name=SEARCH, exact=True)
    row = page.locator('.cx-team-row').filter(has=search)

    # Ohne OpenRouter-Konto: Standard ist die Claude-Suche, Exa ist gesperrt und sagt warum.
    load()
    assert_controls_styled(page)
    new_agent('Sucher ohne OpenRouter', 'Claude · privat')
    expect(search).to_contain_text('Standard des Modells')
    expect(row).to_contain_text('Claude-eigene Suche')
    search.click()
    exa = page.get_by_role('option', name=re.compile('^Exa Instant'))
    expect(exa).to_be_disabled()
    expect(exa).to_contain_text('Braucht ein OpenRouter-Konto')
    page.get_by_role('option', name=re.compile('^Aus')).click()
    expect(row).to_contain_text('Der Agent sucht nicht im Web')
    save()
    assert profile('Sucher ohne OpenRouter')['agents'][0]['webSearch'] == 'off'

    # Mit OpenRouter-Konto: Exa Instant wählbar, gespeichert und nach dem Neuladen wieder da.
    load('&openrouter=1')
    new_agent('Schneller Sucher', 'Claude · privat')
    select(SEARCH, 'Exa Instant')
    expect(row).to_contain_text('Exa Instant über OpenRouter')
    save()
    assert profile('Schneller Sucher')['agents'][0]['webSearch'] == 'exa-instant'

    # Zurück auf Standard entfernt das Feld: alte und neue Profile sehen gleich aus.
    select(SEARCH, 'Standard des Modells')
    save()
    assert 'webSearch' not in profile('Schneller Sucher')['agents'][0]

    # Ein OpenRouter-Agent lässt sich speichern; Standard nennt die Suche, die wirklich läuft.
    new_agent('DeepSeek-Sucher', 'OpenRouter · privat')
    expect(row).to_contain_text('Eigene Suche des Modells')  # Standardmodell der Vorschau: Claude Opus 5
    select(SEARCH, 'Exa Instant')
    save()
    saved = profile('DeepSeek-Sucher')['agents'][0]
    assert saved['target']['provider'] == 'openrouter' and saved['webSearch'] == 'exa-instant', saved

    # Copilot hat keinen Schalter: die Wahl fällt beim Kontowechsel weg.
    copilot = {
        'id': 'copilot-test', 'provider': 'copilot', 'label': 'Test',
        'authMode': 'managed-home', 'authState': 'ok', 'available': True,
        'models': [{'id': 'copilot-auto', 'label': 'Copilot automatisch'}],
    }
    accounts = page.evaluate('structuredClone(profiles)')
    page.evaluate('(accounts) => window.dispatchEvent(new MessageEvent("message", {data: {kind: "accounts", accounts}}))', [copilot] + accounts)
    select('Konto des Agenten', 'GitHub Copilot · Test')
    expect(search).to_be_disabled()
    expect(row).to_contain_text('Bei diesem Anbieter nicht umstellbar')
    save()
    assert 'webSearch' not in profile('DeepSeek-Sucher')['agents'][0]

    # Screenshot für die Doku: das offene Menü an einem Claude-Agenten.
    select('Konto des Agenten', 'Claude · privat')
    row.scroll_into_view_if_needed()
    search.click()
    expect(page.get_by_role('listbox', name=SEARCH, exact=True)).to_be_visible()
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'docs/screenshots/agent-websearch.png'))
    page.keyboard.press('Escape')
    assert_controls_styled(page)
    assert not page.evaluate('(window.__hostMessages || []).some(message => ["startTeam", "send"].includes(message.kind))')
    assert not errors, errors
    print('Agent websearch: standard label per provider, Exa gated on OpenRouter, off/exa persisted, standard not stored, OpenRouter agents saveable, Copilot locked.')
