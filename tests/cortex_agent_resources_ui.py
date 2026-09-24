"""Live host catalog updates reach open agent/team editors without losing drafts.

The account/project messages use the production bridge and components. The
preview host simulates catalog changes; no login or model request is performed.
"""
import re
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview
from cortex_control_styles import assert_controls_styled

PORT = 4204

with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)

    def emit(kind, value):
        page.evaluate('([kind, value]) => window.dispatchEvent(new MessageEvent("message", {data: {kind, [kind]: value}}))', [kind, value])

    def select(label, option):
        page.get_by_role('button', name=label, exact=True).click()
        page.get_by_role('option', name=option, exact=True).click()

    def assert_draft():
        expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Unveröffentlichte Recherche')
        expect(page.get_by_label(re.compile('^Anweisungen für diesen Agenten'))).to_have_value('# Auftrag\nDiesen Entwurf behalten.')

    initial_accounts = page.evaluate('structuredClone(profiles)')
    initial_projects = page.evaluate('structuredClone(projects)')
    new_account = {
        'id': 'claude-neu', 'provider': 'claude', 'label': 'neu',
        'authMode': 'managed-home', 'authState': 'ok', 'available': True,
        'models': [{'id': 'new-model', 'label': 'Neues Modell'}],
    }
    new_project = {'name': 'Neues Projekt', 'path': '/demo/new-project', 'missing': False}
    accounts = initial_accounts + [new_account]
    projects_now = initial_projects + [new_project]

    to_overview(page)

    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    page.get_by_label('Agentenname', exact=True).fill('Unveröffentlichte Recherche')
    page.get_by_label(re.compile('^Anweisungen für diesen Agenten')).fill('# Auftrag\nDiesen Entwurf behalten.')
    select('Konto des Agenten', 'Claude · privat')
    select('Modell des Agenten', 'Sonnet 5')
    select('Projekt des Agenten', 'Cortex')

    # Fresh entries appear even while the corresponding dropdown stays open.
    page.get_by_role('button', name='Projekt des Agenten', exact=True).click()
    emit('projects', projects_now)
    expect(page.get_by_role('option', name='Neues Projekt', exact=True)).to_be_visible()
    expect(page.get_by_role('option', name='Cortex', exact=True)).to_have_attribute('aria-selected', 'true')
    page.get_by_role('option', name='Neues Projekt', exact=True).click()
    page.get_by_role('button', name='Konto des Agenten', exact=True).click()
    emit('accounts', accounts)
    expect(page.get_by_role('option', name='Claude · neu', exact=True)).to_be_visible()
    expect(page.get_by_role('option', name='Claude · privat', exact=True)).to_have_attribute('aria-selected', 'true')
    page.get_by_role('option', name='Claude · neu', exact=True).click()
    select('Modell des Agenten', 'Neues Modell')
    assert_draft()

    # The selected account's model catalog can change without closing its menu.
    page.get_by_role('button', name='Modell des Agenten', exact=True).click()
    new_account = {**new_account, 'models': new_account['models'] + [{'id': 'later-model', 'label': 'Später ergänztes Modell'}]}
    accounts = initial_accounts + [new_account]
    emit('accounts', accounts)
    expect(page.get_by_role('option', name='Später ergänztes Modell', exact=True)).to_be_visible()
    expect(page.get_by_role('option', name='Neues Modell', exact=True)).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Escape')

    # Renaming a project changes its label, not its saved folder identity.
    new_project = {**new_project, 'name': 'Umbenanntes Projekt'}
    projects_now = initial_projects + [new_project]
    emit('projects', projects_now)
    expect(page.get_by_role('button', name='Projekt des Agenten', exact=True)).to_contain_text('Umbenanntes Projekt')
    assert_draft()

    # An absent model remains explicit; no silent switch to another model.
    emit('accounts', initial_accounts + [{**new_account, 'models': [{'id': 'later-model', 'label': 'Später ergänztes Modell'}]}])
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('new-model')
    emit('accounts', accounts)
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('Neues Modell')
    assert_draft()
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    saved = page.evaluate('(window.__hostMessages || []).filter(message => message.kind === "saveTeam").at(-1).team')
    assert saved['projectPath'] == '/demo/new-project'
    assert saved['agents'][0]['target'] == {'provider': 'claude', 'account': 'neu', 'model': 'new-model'}
    page.get_by_label('Auftrag für den Agenten', exact=True).fill('Prüfe die Quellen')
    start = page.get_by_role('button', name='Agent starten', exact=True)
    expect(start).to_be_enabled()

    # Removed/renamed/disconnected accounts must not silently execute elsewhere.
    emit('accounts', initial_accounts)
    expect(start).to_be_disabled()
    expect(page.get_by_role('button', name='Konto des Agenten', exact=True)).to_contain_text('Claude · neu')
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_be_disabled()
    renamed_account = {**new_account, 'label': 'umbenannt'}
    emit('accounts', initial_accounts + [renamed_account])
    expect(start).to_be_disabled()
    page.get_by_role('button', name='Konto des Agenten', exact=True).click()
    expect(page.get_by_role('option', name=re.compile('^Claude · neu'))).to_have_attribute('aria-selected', 'true')
    expect(page.get_by_role('option', name='Claude · umbenannt', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    emit('accounts', initial_accounts + [{**new_account, 'available': False}])
    expect(start).to_be_disabled()
    emit('accounts', initial_accounts + [{**new_account, 'authState': 'expired'}])
    expect(start).to_be_disabled()
    emit('accounts', accounts)
    expect(start).to_be_enabled()
    assert_draft()

    # Removing a chosen project retains its path for an explicit user decision.
    emit('projects', initial_projects)
    expect(page.get_by_role('button', name='Projekt des Agenten', exact=True)).to_contain_text('/demo/new-project')
    emit('projects', projects_now)
    expect(page.get_by_role('button', name='Projekt des Agenten', exact=True)).to_contain_text('Umbenanntes Projekt')

    # Navigating through account management retains the editor and live catalog.
    page.get_by_label('Agentenname', exact=True).fill('Unveröffentlichte Recherche')
    page.get_by_label(re.compile('^Anweisungen für diesen Agenten')).fill('# Auftrag\nDiesen Entwurf behalten.')
    page.get_by_role('button', name='Konten verwalten', exact=True).click()
    page.get_by_role('button', name=re.compile('^Aktive Agenten')).click()
    assert_draft()
    expect(page.get_by_role('button', name='Projekt des Agenten', exact=True)).to_contain_text('Umbenanntes Projekt')
    expect(page.get_by_role('button', name='Konto des Agenten', exact=True)).to_contain_text('Claude · neu')
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('Neues Modell')
    page.get_by_role('button', name='Agent speichern', exact=True).click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')

    # Teams consume the same live catalogs; unrelated updates keep the chosen role.
    to_overview(page)
    page.get_by_role('button', name='Team erstellen', exact=True).click()
    page.get_by_label('Teamname', exact=True).fill('Live synchronisiertes Team')
    select('Konto des Agenten', 'Claude · neu')
    select('Modell des Agenten', 'Neues Modell')
    select('Projekt des Teams', 'Umbenanntes Projekt')
    page.get_by_role('button', name='Konto des Agenten', exact=True).click()
    emit('accounts', [{**new_account, 'id': 'first-account', 'label': 'weiteres'}] + accounts)
    expect(page.get_by_role('option', name='Claude · weiteres', exact=True)).to_be_visible()
    expect(page.get_by_role('option', name='Claude · neu', exact=True)).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Escape')
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_contain_text('Neues Modell')
    page.get_by_role('button', name='Projekt des Teams', exact=True).click()
    emit('projects', [{'name': 'Weiteres Projekt', 'path': '/demo/another'}] + projects_now)
    expect(page.get_by_role('option', name='Weiteres Projekt', exact=True)).to_be_visible()
    expect(page.get_by_role('option', name='Umbenanntes Projekt', exact=True)).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Escape')
    expect(page.get_by_label('Teamname', exact=True)).to_have_value('Live synchronisiertes Team')
    assert not page.evaluate('(window.__hostMessages || []).some(message => ["startTeam", "send"].includes(message.kind))')
    assert not errors, errors

    # The first connected account also appears in a draft created without one.
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty&accounts=empty')
    page.wait_for_load_state('networkidle')
    to_overview(page)
    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    page.get_by_label('Agentenname', exact=True).fill('Entwurf vor der Anmeldung')
    expect(page.get_by_role('button', name='Konto des Agenten', exact=True)).to_be_disabled()
    emit('accounts', [new_account])
    expect(page.get_by_role('button', name='Konto des Agenten', exact=True)).to_be_enabled()
    # Adding an account makes it selectable; it never authorizes a choice itself.
    expect(page.get_by_role('button', name='Modell des Agenten', exact=True)).to_be_disabled()
    select('Konto des Agenten', 'Claude · neu')
    select('Modell des Agenten', 'Neues Modell')
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Entwurf vor der Anmeldung')
    expect(page.get_by_role('button', name='Agent speichern', exact=True)).to_be_enabled()
    assert not errors, errors
    print('Live agent/team resources: account/project/model additions in open menus, renames, missing selections, account availability, retained drafts and independent role selection passed.')
