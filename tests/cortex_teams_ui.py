"""Real team editor and run UI against a browser-only host fixture."""
from pathlib import Path
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_control_styles import assert_controls_styled

ROOT = Path(__file__).resolve().parents[1]
PORT = 4188

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1080}, device_scale_factor=2)
    errors = []
    failed_styles = []
    page.on('requestfailed', lambda request: failed_styles.append((request.url, request.failure)) if request.resource_type == 'stylesheet' else None)
    page.on('response', lambda response: failed_styles.append((response.url, response.status)) if response.request.resource_type == 'stylesheet' and response.status >= 400 else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)
    expect(page.get_by_role('heading', name='Aktive Agenten', exact=True)).to_be_visible()
    expect(page.get_by_text('Kein Auftrag aktiv', exact=True)).to_be_visible()
    expect(page.get_by_text('Noch kein Auftrag gestartet.', exact=True)).to_be_visible()

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=option, exact=True).click()

    def messages(kind):
        return page.evaluate('(kind) => (window.__hostMessages || []).filter(message => message.kind === kind)', kind)

    def agent_tab(name):
        return page.get_by_role('tab', name=re.compile(name))

    # This account is fixture data, not a real login or provider call.
    page.evaluate('''() => window.dispatchEvent(new MessageEvent('message', {data: {
      kind: 'accounts', accounts: profiles.map(account => account.provider === 'grok'
        ? {...account, available: true, authState: 'ok'} : account)
    }}))''')
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    page.get_by_label('Teamname', exact=True).fill('Redaktionsteam')
    page.get_by_label('Beschreibung', exact=True).fill('Recherche, Prüfung und verständliche Ergebnisse.')
    page.get_by_label(re.compile('^Gemeinsame Anweisungen')).fill('# Gemeinsam\nArbeite mit nachvollziehbaren Belegen.')
    select('Projekt des Teams', 'Cortex')
    page.get_by_label('Agentenname', exact=True).fill('Analyst')
    page.get_by_label('Rolle', exact=True).fill('Quellen prüfen')
    select('Konto des Agenten', 'Grok · studio')
    expect(page.get_by_role('button', name='MCP-Auswahl des Agenten')).to_have_count(0)
    expect(page.get_by_text('Dieser Anbieter übernimmt seine MCPs aus dem Kontoprofil.')).to_be_visible()
    select('Modell des Agenten', 'Grok')
    select('Konto des Agenten', 'Claude · privat')
    select('Modell des Agenten', 'Sonnet 5')
    select('Zugriff des Agenten', 'Nur lesen')
    select('MCP-Auswahl des Agenten', 'Keine')
    checks = page.locator('.cx-team-checks[aria-label="MCP-Konnektoren"]')
    checks.get_by_role('checkbox', name='Context7', exact=True).check()
    page.locator('.cx-team-checks[aria-label="Skills des Agenten"]').get_by_role('checkbox', name='Recherche', exact=True).check()
    page.get_by_role('button', name='Markdown importieren', exact=True).click()
    instructions = page.get_by_label(re.compile('^Anweisungen für diesen Agenten'))
    expect(instructions).to_have_value('# Importierte Rolle\nPrüfe das Ergebnis und dokumentiere offene Punkte.')
    page.get_by_role('button', name='Markdown exportieren', exact=True).click()
    assert page.evaluate('window.__cortexTeams.exports[0]') == {'name': 'Analyst', 'text': instructions.input_value()}

    page.get_by_role('button', name='Agent hinzufügen', exact=True).click()
    page.get_by_label('Agentenname', exact=True).fill('Redaktion')
    page.get_by_label('Rolle', exact=True).fill('Ergebnis schreiben')
    select('Konto des Agenten', 'ChatGPT · privat')
    select('Modell des Agenten', 'GPT-6 Astra')
    select('Zugriff des Agenten', 'Änderungen erlauben')
    page.locator('.cx-team-checks[aria-label="Übergaben an den Agenten"]').get_by_role('checkbox', name='Analyst').check()
    expect(page.get_by_role('button', name='MCP-Auswahl des Agenten')).to_have_count(0)
    agent_tab('Analyst').click()
    expect(page.locator('.cx-team-checks[aria-label="Übergaben an den Agenten"]').get_by_role('checkbox', name='Redaktion')).to_be_disabled()

    # A host refresh must never replace unsaved editor text.
    page.evaluate("window.dispatchEvent(new MessageEvent('message', {data: {kind: 'teamsState', state: structuredClone(window.__cortexTeams.state)}}))")
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Redaktionsteam')
    page.evaluate('window.__cortexTeams.failNextSave = true')
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('alert')).to_contain_text('Bitte erneut versuchen.')
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Redaktionsteam')
    page.get_by_role('button', name='Konten verwalten', exact=True).click()
    expect(page.locator('.cx-teams')).to_have_count(0)
    page.get_by_role('button', name=re.compile('^Aktive Agenten')).click()
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Redaktionsteam')
    expect(instructions).to_have_value('# Importierte Rolle\nPrüfe das Ergebnis und dokumentiere offene Punkte.')
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Team gespeichert.')
    expect(page.get_by_role('button', name='Team speichern', exact=True)).to_be_disabled()
    saved = messages('saveTeam')[-1]['team']
    assert len(saved['agents']) == 2
    assert saved['projectPath'] == '/demo/cortex'
    assert saved['agents'][0]['target'] == {'provider': 'claude', 'account': 'privat', 'model': 'claude-sonnet-5'}
    assert saved['agents'][0]['mcpServers'] == ['context7']
    assert saved['agents'][0]['skillPaths'] == ['/demo/skills/research/SKILL.md']
    assert saved['agents'][1].get('mcpServers') is None
    assert page.evaluate('(window.__hostMessages || []).filter(m => m.kind === "saveTeam").at(-1).team.agents[1].mcpServers === undefined')
    assert saved['agents'][1]['dependsOn'] == [saved['agents'][0]['id']]

    # Starting uses the saved team and only real host state creates a run.
    page.get_by_label('Auftrag für das Team').fill('Prüfe das Konzept und schreibe eine Empfehlung.')
    page.get_by_role('button', name='Team starten', exact=True).click()
    expect(page.locator('.cx-team-run')).to_have_count(1)
    run = page.evaluate('window.__cortexTeams.state.runs[0]')
    assert messages('startTeam')[-1] == {'kind': 'startTeam', 'teamId': saved['id'], 'task': 'Prüfe das Konzept und schreibe eine Empfehlung.'}
    expect(page.locator('.cx-team-jobs > li.running')).to_contain_text('Analyst')
    expect(page.locator('.cx-team-jobs > li.waiting')).to_contain_text('Redaktion')
    page.evaluate('({id, text}) => window.__cortexTeams.completeCurrent(id, text)', {'id': run['id'], 'text': '## Recherche\nDie **Quelle** ist geprüft.\n\n```js\nconst verified = true;\n```'})
    expect(page.locator('.cx-team-jobs > li.running')).to_contain_text('Redaktion')
    expect(page.locator('.cx-team-jobs > li.running')).to_contain_text('Übergabe von Analyst')
    page.get_by_text('Ergebnis ansehen', exact=True).first.click()
    expect(page.locator('.cx-team-result strong')).to_have_text('Quelle')
    expect(page.locator('.cx-team-result code')).to_contain_text('verified')
    assert page.evaluate('window.__cortexTeams.handoffs.at(-1).results[0]').startswith('## Recherche')
    page.evaluate('(id) => window.__cortexTeams.completeCurrent(id, "Empfehlung mit Quellen und offenen Punkten.")', run['id'])
    expect(page.locator('.cx-team-run > header .cx-team-status')).to_have_text('Abgeschlossen')

    page.get_by_label('Auftrag für das Team').fill('Zweiter Auftrag zum Stoppen.')
    page.get_by_role('button', name='Team starten', exact=True).click()
    page.get_by_role('button', name='Team stoppen', exact=True).click()
    expect(page.locator('.cx-team-run').first.locator('.cx-team-status')).to_have_text('Gestoppt')
    assert len(messages('stopTeam')) == 1

    # Capture the real page, not a manually recreated mock layout.
    page.locator('.cx-teams').evaluate('(element) => { element.scrollTop = 0; }')
    (ROOT / 'docs/screenshots').mkdir(exist_ok=True)
    assert_controls_styled(page)
    page.screenshot(path=str(ROOT / 'docs/screenshots/agent-teams.png'))
    page.set_viewport_size({'width': 850, 'height': 900})
    assert page.locator('.cx-teams').evaluate('e => e.scrollWidth <= e.clientWidth + 1')
    page.set_viewport_size({'width': 1440, 'height': 1080})

    # A provider switch cannot retain a Claude-only MCP restriction.
    select('Konto des Agenten', 'Grok · studio')
    expect(page.get_by_role('button', name='MCP-Auswahl des Agenten')).to_have_count(0)
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('button', name='Team speichern', exact=True)).to_be_disabled()
    assert messages('saveTeam')[-1]['team']['agents'][0].get('mcpServers') is None

    # Removing a colleague also removes its handoff references.
    page.get_by_role('button', name='Agent entfernen', exact=True).click()
    expect(page.get_by_role('tab')).to_have_count(1)
    page.get_by_role('button', name='Team speichern', exact=True).click()
    expect(page.get_by_role('button', name='Team speichern', exact=True)).to_be_disabled()
    assert messages('saveTeam')[-1]['team']['agents'][0]['dependsOn'] == []
    expect(page.get_by_role('button', name='Agent entfernen', exact=True)).to_be_disabled()

    page.get_by_role('button', name='Löschen', exact=True).click()
    page.get_by_role('button', name='Team löschen', exact=True).click()
    expect(page.locator('.cx-team-editor')).to_have_count(0)
    assert len(messages('deleteTeam')) == 1
    assert len(page.evaluate('window.__cortexTeams.state.runs')) == 2, 'Deleting a team lost run history'
    assert messages('send') == [], 'Team controls must never submit ordinary chat prompts'

    page.get_by_role('button', name='Team erstellen', exact=True).click()
    # MAX_TEAM_AGENTS in src/teams/types.ts — die Grenze steht an einer Stelle.
    for _ in range(19):
        page.get_by_role('button', name='Agent hinzufügen', exact=True).click()
    expect(page.get_by_role('tab')).to_have_count(20)
    expect(page.get_by_role('button', name='Agent hinzufügen', exact=True)).to_be_disabled()
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty&accounts=empty')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    expect(page.get_by_role('button', name='Konto des Agenten', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Team speichern', exact=True)).to_be_disabled()
    expect(page.get_by_role('button', name='Team starten', exact=True)).to_be_disabled()
    expect(page.get_by_text('Verbinde ein Konto, um Agenten einzurichten.', exact=False)).to_be_visible()
    assert not failed_styles, failed_styles
    assert not errors, errors
    print('Agent teams: roles/accounts/models, Markdown IO, MCP provider limits, skills, acyclic handoffs, acknowledged save/error recovery, real run progress/results, start/stop, deletion and narrow layout passed.')
