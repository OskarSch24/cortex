"""Reasoning effort is a saved, independent agent setting in the real editor.

The preview host persists definitions for reloads; no paid provider is invoked.
"""
from pathlib import Path
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview
from cortex_control_styles import assert_controls_styled

ROOT = Path(__file__).resolve().parents[1]
PORT = 4208
REASONING = 'Reasoning-Stärke des Agenten'

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=2)
    errors, failed_styles = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed_styles.append((request.url, request.failure)) if request.resource_type == 'stylesheet' else None)
    page.on('response', lambda response: failed_styles.append((response.url, response.status)) if response.request.resource_type == 'stylesheet' and response.status >= 400 else None)

    def load():
        page.wait_for_load_state('networkidle')
        page.locator('#harness').evaluate('(element) => element.remove()')
        expect(page.get_by_role('button', name='Agent erstellen', exact=True)).to_be_visible()

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=option, exact=True).click()

    def profile(name):
        return page.evaluate('(name) => window.__cortexTeams.state.teams.find(team => team.name === name)', name)

    def emit_accounts(accounts):
        page.evaluate('(accounts) => window.dispatchEvent(new MessageEvent("message", {data: {kind: "accounts", accounts}}))', accounts)

    def save(kind='Agent'):
        page.get_by_role('button', name=f'{kind} speichern', exact=True).click()
        expect(page.get_by_role('status')).to_contain_text(f'{kind} gespeichert.')

    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&automation-test=1')
    load()
    assert_controls_styled(page)
    effort = page.get_by_role('button', name=REASONING, exact=True)

    # Profiles saved before this feature retain the selected model's default.
    to_overview(page)
    page.get_by_role('region', name='Teams', exact=True).get_by_role('button').click()
    expect(effort).to_contain_text('Modellvorgabe (Hoch)')
    effort.click()
    options = page.get_by_role('option').all_text_contents()
    for label in ['Modellvorgabe (Hoch)', 'Niedrig', 'Mittel', 'Hoch', 'Sehr hoch', 'Maximal']:
        assert label in options, options
    assert 'Ultra' not in options and 'Minimal' not in options, options
    page.keyboard.press('Escape')
    page.get_by_label('Beschreibung', exact=True).fill('Bestehendes Profil mit Modellvorgabe')
    save('Team')
    assert all('effort' not in agent for agent in profile('Recherche und Redaktion')['agents'])

    to_overview(page)

    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    page.get_by_label('Agentenname', exact=True).fill('Gründlicher Prüfer')
    select('Konto des Agenten', 'ChatGPT · privat')
    select('Modell des Agenten', 'GPT-6 Astra')
    expect(effort).to_contain_text('Modellvorgabe (Mittel)')
    select(REASONING, 'Ultra')
    select('Modell des Agenten', 'GPT-6 Astra')
    expect(effort).to_contain_text('Ultra')
    select('Konto des Agenten', 'ChatGPT · privat')
    expect(effort).to_contain_text('Ultra')
    save()
    solo = profile('Gründlicher Prüfer')
    assert solo['agents'][0]['effort'] == 'ultra'
    assert 'effort' not in solo['agents'][0]['target']

    # Both route navigation and a fresh document reconstruct the saved setting.
    page.get_by_role('button', name='Konten verwalten', exact=True).click()
    page.get_by_role('button', name=re.compile('^Aktive Agenten')).click()
    expect(effort).to_contain_text('Ultra')
    page.reload()
    load()
    to_overview(page)
    page.get_by_role('region', name='Agenten', exact=True).get_by_role('button').click()
    expect(effort).to_contain_text('Ultra')
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('GPT-6 Astra')

    # Live account refreshes never overwrite an explicit choice in an open draft.
    accounts = page.evaluate('structuredClone(profiles)')
    fresh_account = {
        'id': 'claude-fresh', 'provider': 'claude', 'label': 'frisch',
        'authMode': 'managed-home', 'authState': 'ok', 'available': True,
        'models': [{'id': 'custom-model', 'label': 'Eigenes Modell'}],
    }
    page.get_by_label(re.compile('^Anweisungen für diesen Agenten')).fill('# Prüfen\nDiesen Entwurf behalten.')
    emit_accounts([fresh_account] + accounts)
    expect(effort).to_contain_text('Ultra')
    expect(page.get_by_label(re.compile('^Anweisungen für diesen Agenten'))).to_have_value('# Prüfen\nDiesen Entwurf behalten.')
    save()
    assert profile('Gründlicher Prüfer')['agents'][0]['effort'] == 'ultra'

    # A copied solo agent carries its effort into a team, independently of peers.
    to_overview(page)
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    page.get_by_label('Teamname', exact=True).fill('Prüfung mit getrennten Stärken')
    select('Konto des Agenten', 'Claude · privat')
    select('Modell des Agenten', 'Sonnet 5')
    select(REASONING, 'Niedrig')
    page.get_by_role('button', name='Gespeicherten Agenten hinzufügen', exact=True).click()
    page.get_by_role('option', name='Gründlicher Prüfer', exact=True).click()
    expect(effort).to_contain_text('Ultra')
    expect(page.get_by_role('tab')).to_have_count(2)
    page.get_by_role('tab').first.click()
    expect(effort).to_contain_text('Niedrig')
    page.get_by_role('tab').nth(1).click()
    expect(effort).to_contain_text('Ultra')
    save('Team')
    team = profile('Prüfung mit getrennten Stärken')
    assert [agent['effort'] for agent in team['agents']] == ['low', 'ultra']
    assert profile('Gründlicher Prüfer')['agents'][0]['effort'] == 'ultra'

    # Choosing a different model discards the previous model's explicit setting.
    select('Modell des Agenten', 'GPT-5.6 Sol')
    expect(effort).to_contain_text('Modellvorgabe (Niedrig)')
    select(REASONING, 'Ultra')
    select('Konto des Agenten', 'Claude · privat')
    expect(effort).to_contain_text('Modellvorgabe (Hoch)')
    effort.click()
    expect(page.get_by_role('option', name='Ultra', exact=True)).to_have_count(0)
    page.keyboard.press('Escape')
    save('Team')
    team = profile('Prüfung mit getrennten Stärken')
    assert team['agents'][0]['effort'] == 'low' and 'effort' not in team['agents'][1]
    assert profile('Gründlicher Prüfer')['agents'][0]['effort'] == 'ultra'

    # Unknown models and providers without supported effort cannot select one.
    emit_accounts([fresh_account] + accounts)
    select('Konto des Agenten', 'Claude · frisch')
    select('Modell des Agenten', 'Eigenes Modell')
    expect(effort).to_be_disabled()
    expect(effort).to_contain_text('Nicht verfügbar')
    copilot = {
        'id': 'copilot-test', 'provider': 'copilot', 'label': 'Test',
        'authMode': 'managed-home', 'authState': 'ok', 'available': True,
        'models': [{'id': 'copilot-auto', 'label': 'Copilot automatisch'}],
    }
    emit_accounts([copilot, fresh_account] + accounts)
    select('Konto des Agenten', 'GitHub Copilot · Test')
    expect(effort).to_be_disabled()
    expect(effort).to_contain_text('Nicht verfügbar')
    save('Team')
    assert 'effort' not in profile('Prüfung mit getrennten Stärken')['agents'][1]

    # Explicitly returning to the model default removes the saved override.
    select('Konto des Agenten', 'ChatGPT · privat')
    select('Modell des Agenten', 'GPT-6 Astra')
    select(REASONING, 'Sehr hoch')
    select(REASONING, 'Modellvorgabe (Mittel)')
    save('Team')
    assert 'effort' not in profile('Prüfung mit getrennten Stärken')['agents'][1]
    select(REASONING, 'Sehr hoch')
    save('Team')
    assert profile('Prüfung mit getrennten Stärken')['agents'][1]['effort'] == 'xhigh'
    assert_controls_styled(page)
    page.set_viewport_size({'width': 760, 'height': 1000})
    assert page.locator('.cx-teams').evaluate('(element) => element.scrollWidth <= element.clientWidth + 1')
    effort.click()
    menu = page.get_by_role('listbox', name=REASONING, exact=True)
    expect(menu).to_be_visible()
    assert menu.evaluate('(element) => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight; }')
    page.keyboard.press('Escape')
    page.set_viewport_size({'width': 1440, 'height': 1100})
    page.locator('.cx-team-agent-editor').scroll_into_view_if_needed()
    effort.click()
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'docs/screenshots/agent-reasoning.png'))
    page.keyboard.press('Escape')
    assert not page.evaluate('(window.__hostMessages || []).some(message => ["startTeam", "send"].includes(message.kind))')
    assert not failed_styles, failed_styles
    assert not errors, errors
    print('Agent reasoning: legacy defaults, model-specific choices, persistent standalone effort, live catalog stability, independent copied team roles, model/provider resets, unsupported models, explicit default clearing and responsive branded controls passed.')
