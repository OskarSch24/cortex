"""Automation forms and navigation use the real UI; triggers use an isolated mock host."""
from pathlib import Path
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview
from cortex_control_styles import assert_controls_styled

ROOT = Path(__file__).resolve().parents[1]
PORT = 4205

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1100}, device_scale_factor=2)
    errors, failed_styles = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: failed_styles.append((request.url, request.failure)) if request.resource_type == 'stylesheet' else None)
    page.on('response', lambda response: failed_styles.append((response.url, response.status)) if response.request.resource_type == 'stylesheet' and response.status >= 400 else None)
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty&automation-test=1')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=option, exact=True).click()

    def profile(name):
        return page.evaluate('(name) => window.__cortexTeams.state.teams.find(team => team.name === name)', name)

    def overview():
        page.get_by_role('button', name='Geplante Aktionen', exact=True).click()
        expect(page.get_by_role('main', name='Geplante Aktionen')).to_be_visible()

    overview()
    expect(page.get_by_text('Deine nächste Aktion, automatisch', exact=True)).to_be_visible()
    page.get_by_role('button', name='Agenten und Teams öffnen', exact=True).click()
    to_overview(page)
    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    page.get_by_label('Agentenname', exact=True).fill('Morgenbriefing')
    automation = page.get_by_role('region', name='Automatisierung', exact=True)
    expect(automation).to_contain_text('Cortex auf diesem Mac geöffnet')
    page.get_by_label('Auftrag für den Agenten', exact=True).fill('Einmaliger manueller Auftrag')
    automation.get_by_role('switch', name='Zeitplan aktivieren').click()
    expect(page.get_by_role('button', name='Agent speichern', exact=True)).to_be_disabled()
    expect(automation.get_by_role('alert')).to_contain_text('Auftrag für die Automatisierung')
    automation.get_by_label('Auftrag für die Automatisierung', exact=True).fill('Prüfe täglich die neuen Projektänderungen und fasse offene Punkte zusammen.')
    select('Wiederholung der Automatisierung', 'Stündlich')
    automation.get_by_label('Minute der Automatisierung').fill('12')
    select('Wiederholung der Automatisierung', 'Täglich')
    automation.get_by_label('Uhrzeit der Automatisierung').fill('08:15')
    select('Wiederholung der Automatisierung', 'Werktags')
    expect(automation.get_by_label('Uhrzeit der Automatisierung')).to_have_value('08:15')
    select('Wiederholung der Automatisierung', 'Wöchentlich')
    select('Wochentag der Automatisierung', 'Mittwoch')
    automation.get_by_label('Uhrzeit der Automatisierung').fill('07:30')
    automation.get_by_label('Zeitzone der Automatisierung').fill('Europe/Berlin')
    automation.get_by_role('switch', name='Webhook aktivieren').click()
    expect(automation.get_by_role('button', name='Webhook-Aufruf kopieren')).to_be_disabled()
    expect(automation.locator('.cx-automation-state')).to_have_text('Pausiert')
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    saved = profile('Morgenbriefing')
    agent_id = saved['id']
    assert saved['automation']['schedule'] == {'enabled': True, 'cron': '30 7 * * 3', 'timeZone': 'Europe/Berlin'}
    assert 'manueller' not in saved['automation']['task']
    expect(automation.locator('.cx-automation-state')).to_have_text('Gespeichert aktiv')
    expect(automation).to_contain_text('Nächste Ausführung:')
    expect(automation.get_by_label('Lokale Webhook-Adresse')).to_have_value(f'http://127.0.0.1:47831/hooks/{agent_id}')
    automation.get_by_role('button', name='Webhook-Aufruf kopieren').click()
    expect(page.get_by_role('status')).to_contain_text('Webhook-Aufruf kopiert.')
    assert page.evaluate('window.__cortexTeams.copiedWebhooks') == [agent_id]
    assert not re.search(r'Bearer|token|secret', page.evaluate('JSON.stringify(window.__cortexTeams.state)'), re.I)
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    automation.screenshot(path=str(ROOT / 'docs/screenshots/agent-automation-editor.png'))

    # A fresh document reads persisted definitions and reconstructs both trigger types.
    page.reload()
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    to_overview(page)
    page.get_by_role('region', name='Agenten', exact=True).get_by_role('button').click()
    expect(automation.get_by_role('switch', name='Zeitplan aktivieren')).to_be_checked()
    expect(automation.get_by_role('switch', name='Webhook aktivieren')).to_be_checked()
    expect(automation.get_by_label('Uhrzeit der Automatisierung')).to_have_value('07:30')
    select('Wiederholung der Automatisierung', 'Eigener Cron-Ausdruck')
    cron = automation.get_by_label('Cron-Ausdruck', exact=True)
    cron.fill('* *')
    expect(page.get_by_role('button', name='Agent speichern', exact=True)).to_be_disabled()
    cron.fill('15 7 * * 1-5')
    expect(cron).to_be_visible()  # Numeric expressions must not collapse the custom editor.
    automation.get_by_label('Zeitzone der Automatisierung').fill('Mars/Olympus')
    expect(page.get_by_role('button', name='Agent speichern', exact=True)).to_be_disabled()
    automation.get_by_label('Zeitzone der Automatisierung').fill('Europe/Berlin')
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    assert profile('Morgenbriefing')['automation']['schedule']['cron'] == '15 7 * * 1-5'
    page.evaluate('(id) => window.__cortexTeams.triggerAutomation(id, "schedule")', agent_id)
    expect(page.locator('.cx-team-run-source')).to_have_text('Zeitplan')
    run = page.evaluate('window.__cortexTeams.state.runs.at(-1)')
    assert run['task'] == saved['automation']['task'] and run['source']['kind'] == 'schedule'
    page.evaluate('(id) => window.__cortexTeams.completeCurrent(id)', run['id'])

    automation.get_by_role('switch', name='Zeitplan aktivieren').click()
    # Draft toggles cannot claim the running, saved schedule has already paused.
    expect(automation.locator('.cx-automation-saved-status')).to_contain_text('Nächste Ausführung')
    expect(automation).to_contain_text('Bis dahin gilt die gespeicherte Automatisierung.')
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(automation.locator('.cx-automation-saved-status')).to_contain_text('Pausiert')
    automation.get_by_role('switch', name='Webhook aktivieren').click()
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(automation.locator('.cx-automation-state')).to_have_text('Pausiert')

    # Team automation invokes the saved common task for all its roles.
    to_overview(page)
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    page.get_by_label('Teamname', exact=True).fill('Quellenrunde')
    page.get_by_role('button', name='Agent hinzufügen', exact=True).click()
    automation.get_by_label('Auftrag für die Automatisierung', exact=True).fill('Recherchiert die Quellen und prüft gemeinsam das Ergebnis.')
    automation.get_by_role('switch', name='Webhook aktivieren').click()
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Team gespeichert.')
    team = profile('Quellenrunde')
    assert team['kind'] == 'team' and len(team['agents']) == 2
    page.evaluate('(id) => window.__cortexTeams.triggerAutomation(id, "webhook")', team['id'])
    expect(page.locator('.cx-team-run-source').first).to_have_text('Webhook')
    team_run = page.evaluate('window.__cortexTeams.state.runs.at(-1)')
    assert team_run['task'] == team['automation']['task'] and len(team_run['jobs']) == 2
    page.evaluate('(id) => window.__cortexTeams.completeCurrent(id)', team_run['id'])
    page.evaluate('(id) => window.__cortexTeams.completeCurrent(id)', team_run['id'])
    overview()
    expect(page.locator('.cx-automation-card')).to_have_count(2)
    expect(page.get_by_role('article', name='Automatisierung Morgenbriefing')).to_contain_text('Pausiert')
    team_card = page.get_by_role('article', name='Automatisierung Quellenrunde')
    expect(team_card).to_contain_text('Lokal erreichbar')
    expect(team_card).to_contain_text('Webhook · Abgeschlossen')
    page.set_viewport_size({'width': 760, 'height': 1000})
    assert page.locator('.cx-teams').evaluate('(element) => element.scrollWidth <= element.clientWidth + 1')
    page.set_viewport_size({'width': 1440, 'height': 1100})
    assert_controls_styled(page)
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    page.screenshot(path=str(ROOT / 'docs/screenshots/agent-automations.png'))
    team_card.get_by_role('button', name='Bearbeiten', exact=True).click()
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Quellenrunde')
    page.get_by_label('Teamname', exact=True).fill('Ungespeicherter Teamname')
    overview()
    page.get_by_role('article', name='Automatisierung Morgenbriefing').get_by_role('button', name='Bearbeiten', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('ungespeicherte Änderungen')
    page.get_by_role('button', name='Weiter bearbeiten', exact=True).click()
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Ungespeicherter Teamname')
    assert not failed_styles, failed_styles
    assert not errors, errors
    print('Agent and team automations: schedule presets/custom cron/time zones, saved-versus-draft state, webhook-copy action, pause, persistence/reload, trigger sources, global overview, responsive layout and dirty navigation passed.')
