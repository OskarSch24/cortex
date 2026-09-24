"""A dirty profile must never resurrect a concurrently paused automation."""
from playwright.sync_api import expect
from headless_browser import headless_browser
from cortex_agents_nav import to_overview
from cortex_control_styles import assert_controls_styled
import re

PORT = 4206
with headless_browser(port=PORT) as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 1080})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(f'http://127.0.0.1:{PORT}/dev/preview.html?mode=agent&page=agents&teams=empty')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    assert_controls_styled(page)

    def messages():
        return page.evaluate('window.__hostMessages.filter(message => message.kind === "saveTeam")')

    def saved():
        return page.evaluate('window.__cortexTeams.state.teams[0]')

    to_overview(page)

    page.get_by_role('button', name='Agent erstellen', exact=True).click()
    page.get_by_role('button', name=re.compile('^Ohne Vorlage')).click()
    page.get_by_label('Agentenname', exact=True).fill('  Automatik-Prüfer  ')
    auto = page.get_by_role('region', name='Automatisierung', exact=True)
    auto.get_by_label('Auftrag für die Automatisierung').fill('  Prüfe die neuen Änderungen.  ')
    auto.get_by_role('switch', name='Zeitplan aktivieren').click()
    save = page.get_by_role('button', name='Agent speichern', exact=True)
    save.click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    assert 'baseSignature' not in messages()[-1]
    assert saved()['name'] == 'Automatik-Prüfer'
    expect(page.get_by_label('Agentenname', exact=True)).to_have_value('Automatik-Prüfer')
    expect(auto.get_by_label('Auftrag für die Automatisierung')).to_have_value('Prüfe die neuen Änderungen.')
    baseline = page.evaluate('window.__cortexTeams.profileSignature(window.__cortexTeams.state.teams[0])')

    # The editor retains its baseline while another window pauses the profile.
    name = page.get_by_label('Agentenname', exact=True)
    name.fill('Mein ungespeicherter Prüfer')
    page.evaluate('''() => {
      const profile = window.__cortexTeams.state.teams[0];
      window.__cortexTeams.updateProfile(profile.id, {automation: {...profile.automation, schedule: {...profile.automation.schedule, enabled: false}}});
    }''')
    expect(page.get_by_role('button', name='Gespeicherten Stand laden', exact=True)).to_be_visible()
    expect(name).to_have_value('Mein ungespeicherter Prüfer')
    save.click()
    assert messages()[-1]['baseSignature'] == baseline
    assert messages()[-1]['revision'] == page.evaluate('window.__cortexTeams.state.revision')
    assert saved()['name'] == 'Automatik-Prüfer' and saved()['automation']['schedule']['enabled'] is False
    expect(page.locator('.cx-team-notice.error')).to_contain_text('an anderer Stelle geändert')
    expect(name).to_have_value('Mein ungespeicherter Prüfer')

    # Navigating away and back must not rebase the stale draft onto the new revision.
    page.get_by_role('button', name='Geplante Aktionen', exact=True).click()
    page.get_by_role('button', name='Bearbeiten', exact=True).click()
    expect(name).to_have_value('Mein ungespeicherter Prüfer')
    save.click()
    assert messages()[-1]['baseSignature'] == baseline
    assert saved()['automation']['schedule']['enabled'] is False
    expect(name).to_have_value('Mein ungespeicherter Prüfer')
    page.get_by_role('button', name='Gespeicherten Stand laden', exact=True).click()
    expect(page.get_by_role('button', name='Änderungen verwerfen', exact=True)).to_be_visible()
    page.get_by_role('button', name='Weiter bearbeiten', exact=True).click()
    expect(name).to_have_value('Mein ungespeicherter Prüfer')
    page.get_by_role('button', name='Gespeicherten Stand laden', exact=True).click()
    page.get_by_role('button', name='Änderungen verwerfen', exact=True).click()
    expect(name).to_have_value('Automatik-Prüfer')
    expect(auto.get_by_role('switch', name='Zeitplan aktivieren')).not_to_be_checked()

    # A clean foreign update is adopted and becomes the next edit's baseline.
    page.evaluate('''() => {
      const profile = window.__cortexTeams.state.teams[0];
      window.__cortexTeams.updateProfile(profile.id, {name: 'Extern umbenannt', agents: profile.agents.map(agent => ({...agent, name: 'Extern umbenannt'}))});
    }''')
    expect(name).to_have_value('Extern umbenannt')
    clean_baseline = page.evaluate('window.__cortexTeams.profileSignature(window.__cortexTeams.state.teams[0])')
    name.fill('Gemeinsam weiterbearbeitet')
    save.click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    assert messages()[-1]['baseSignature'] == clean_baseline
    assert saved()['automation']['schedule']['enabled'] is False

    # Editing during a delayed acknowledgement keeps the new input dirty, but
    # advances the baseline to precisely the successful normalized save.
    page.evaluate('window.__cortexTeams.deferSaveAck = true')
    name.fill('Gesendeter Stand')
    save.click()
    expect(page.get_by_role('button', name='Speichert …', exact=True)).to_be_visible()
    name.fill('Während des Speicherns weitergetippt')
    acknowledged_baseline = page.evaluate('window.__cortexTeams.profileSignature(window.__cortexTeams.state.teams[0])')
    page.evaluate('window.__cortexTeams.acknowledgeSaves()')
    expect(name).to_have_value('Während des Speicherns weitergetippt')
    expect(save).to_be_enabled()
    page.evaluate('window.__cortexTeams.deferSaveAck = false')
    save.click()
    expect(page.get_by_role('status')).to_contain_text('Agent gespeichert.')
    assert messages()[-1]['baseSignature'] == acknowledged_baseline
    assert saved()['name'] == 'Während des Speicherns weitergetippt'
    assert saved()['automation']['schedule']['enabled'] is False
    assert not errors, errors
    print('Profile conflict safety: normalized acknowledgements, dirty baseline retention, concurrent pause preserved, navigation retention, explicit discard/reload, clean synchronization and edits during pending saves passed.')
