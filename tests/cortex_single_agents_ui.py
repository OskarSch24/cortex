"""Standalone profiles use the real editor and host messages, with no paid provider run."""
from pathlib import Path
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_control_styles import assert_controls_styled

ROOT = Path(__file__).resolve().parents[1]
PORT = 4199

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1080}, device_scale_factor=2)
    errors = []
    failed_styles = []
    page.on('requestfailed', lambda request: failed_styles.append((request.url, request.failure)) if request.resource_type == 'stylesheet' else None)
    page.on('response', lambda response: failed_styles.append((response.url, response.status)) if response.request.resource_type == 'stylesheet' and response.status >= 400 else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=option, exact=True).click()

    def messages(kind):
        return page.evaluate('(kind) => (window.__hostMessages || []).filter(message => message.kind === kind)', kind)

    expect(page.get_by_role('button', name='Agent erstellen', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Team erstellen', exact=True)).to_be_visible()
    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    gallery = page.get_by_role('region', name='Agentenvorlagen', exact=True)
    expect(gallery).to_be_visible()
    expect(gallery.locator('.cx-agent-starter')).to_have_count(7)
    expect(gallery.locator('.cx-agent-starter-link')).to_have_count(6)
    expect(gallery.get_by_text(re.compile('Eigene Cortex-Vorlagen'))).to_be_visible()
    # Read-only source actions merely request the official URL, never open a browser in this test.
    gallery.get_by_role('button', name='Grok-Beispiel für Code-Review', exact=True).click()
    assert messages('openExternal')[-1]['url'] == 'https://x.ai/bot/guides/grok-bot-for-engineering'
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    assert_controls_styled(page)
    page.screenshot(path=str(ROOT / 'docs/screenshots/agent-starters.png'))
    gallery.locator('.cx-agent-starter').filter(has=page.get_by_text('Code-Review', exact=True)).click()
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Code-Review')
    instructions = page.get_by_label(re.compile('^Anweisungen für diesen Agenten'))
    assert '## Ergebnis' in instructions.input_value()
    assert page.get_by_role('button', name='Agent hinzufügen', exact=True).count() == 0
    assert page.get_by_role('tab').count() == 0
    assert page.get_by_label('Teamname', exact=True).count() == 0
    assert page.get_by_text('Ergebnisse übernehmen von', exact=True).count() == 0
    assert page.get_by_role('button', name='Team starten', exact=True).count() == 0

    page.get_by_label('Agentenname', exact=True).fill('Mein Reviewer')
    select('Projekt des Agenten', 'Cortex')
    select('Konto des Agenten', 'Claude · privat')
    select('Modell des Agenten', 'Sonnet 5')
    select('MCP-Auswahl des Agenten', 'Keine')
    page.locator('.cx-team-checks[aria-label="Skills des Agenten"]').get_by_role('checkbox', name='Recherche', exact=True).check()
    instructions.fill('# Eigene Prüfung\nPrüfe zuerst die Anforderungen und anschließend die Fehlerpfade.')
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('ungespeicherte Änderungen')
    page.get_by_role('button', name='Weiter bearbeiten', exact=True).click()
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Mein Reviewer')
    page.get_by_role('button', name='Konten verwalten', exact=True).click()
    page.get_by_role('button', name=re.compile('^Aktive Agenten')).click()
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Mein Reviewer')
    assert instructions.input_value().startswith('# Eigene Prüfung')
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    solo = messages('saveTeam')[-1]['team']
    assert solo['kind'] == 'agent' and len(solo['agents']) == 1
    agent = solo['agents'][0]
    assert solo['name'] == agent['name'] == 'Mein Reviewer'
    assert agent['dependsOn'] == [] and agent['mcpServers'] == []
    assert agent['skillPaths'] == ['/demo/skills/research/SKILL.md']
    assert solo['projectPath'] == '/demo/cortex'
    expect(page.get_by_role('region', name='Agenten', exact=True).get_by_role('button')).to_contain_text('Mein Reviewer')
    expect(page.get_by_role('region', name='Teams', exact=True).get_by_text('Noch keine Teams.', exact=True)).to_be_visible()
    page.locator('.cx-teams').evaluate('(element) => { element.scrollTop = 0; }')
    assert_controls_styled(page)
    page.screenshot(path=str(ROOT / 'docs/screenshots/single-agent.png'))
    page.set_viewport_size({'width': 760, 'height': 950})
    assert page.locator('.cx-teams').evaluate('e => e.scrollWidth <= e.clientWidth + 1')
    page.set_viewport_size({'width': 1440, 'height': 1080})

    page.get_by_label('Auftrag für den Agenten', exact=True).fill('Prüfe die Anmeldung.')
    page.get_by_role('button', name='Agent starten', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gestartet.')
    run = page.evaluate('window.__cortexTeams.state.runs[0]')
    assert run['kind'] == 'agent' and len(run['jobs']) == 1
    expect(page.get_by_role('button', name='Agent stoppen', exact=True)).to_be_visible()
    page.get_by_role('button', name='Agent stoppen', exact=True).click()
    expect(page.locator('.cx-team-run .cx-team-status')).to_have_text('Gestoppt')
    page.get_by_label('Auftrag für den Agenten', exact=True).fill('Prüfe die Fehlerbehandlung.')
    page.get_by_role('button', name='Agent starten', exact=True).click()
    run = page.evaluate('window.__cortexTeams.state.runs.at(-1)')
    page.evaluate('({id, text}) => window.__cortexTeams.completeCurrent(id, text)', {'id': run['id'], 'text': '## Ergebnis\nDie **Fehlerpfade** sind geprüft.'})
    expect(page.locator('.cx-team-run').first.locator('.cx-team-status')).to_have_text('Abgeschlossen')
    page.get_by_text('Ergebnis ansehen', exact=True).click()
    expect(page.locator('.cx-team-result strong')).to_have_text('Fehlerpfade')

    # Adding a saved agent is a snapshot: IDs and handoffs belong to the new team.
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    page.get_by_label('Teamname', exact=True).fill('Prüfteam')
    page.get_by_role('button', name='Gespeicherten Agenten hinzufügen', exact=True).click()
    page.get_by_role('option', name=re.compile('^Mein Reviewer')).click()
    expect(page.get_by_role('tab')).to_have_count(2)
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Mein Reviewer')
    expect(instructions).to_have_value(agent['instructions'])
    instructions.fill('# Abgewandelte Teamrolle')
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Team gespeichert.')
    team = messages('saveTeam')[-1]['team']
    copied = team['agents'][1]
    assert team['kind'] == 'team'
    assert copied['id'] != agent['id'] and copied['dependsOn'] == []
    assert copied['target'] == agent['target'] and copied['mcpServers'] == []
    assert copied['skillPaths'] == agent['skillPaths']
    page.get_by_role('region', name='Agenten', exact=True).get_by_role('button').click()
    expect(instructions).to_have_value(agent['instructions'])
    page.get_by_role('button', name='Löschen', exact=True).click()
    page.get_by_role('button', name='Agent löschen', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gelöscht.')
    assert len(page.evaluate('window.__cortexTeams.state.runs')) == 2
    assert page.evaluate('window.__cortexTeams.state.teams[0].kind') == 'team'
    page.get_by_role('region', name='Teams', exact=True).get_by_role('button').click()
    expect(page.get_by_role('tab')).to_have_count(2)
    page.get_by_role('tab', name=re.compile('Mein Reviewer')).click()
    expect(instructions).to_have_value('# Abgewandelte Teamrolle')

    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Neuer Agent')
    expect(instructions).to_have_value('')
    assert messages('send') == [], 'Profile controls must not submit ordinary chat messages'
    assert not failed_styles, failed_styles
    assert not errors, errors
    print('Standalone agents: sourced starters, blank profile, separate rosters, agent-centric controls, draft preservation, scope/skills/model, save/start/stop/result, independent team copies, delete with history and responsive layout passed.')
