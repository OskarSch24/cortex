"""Activity detail levels render the real bundle and save through the native-settings bridge."""
from playwright.sync_api import expect
from headless_browser import headless_browser


def post(page, *messages):
    page.evaluate("messages => messages.forEach(message => window.postMessage(message, '*'))", messages)


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1100, 'height': 950})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:4173/dev/preview.html?mode=agent&scenario=conversation')
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    post(page, {'kind': 'conversationReset'}, {'kind': 'conversationReady'},
         {'kind': 'userEcho', 'text': 'Prüfe das Projekt'}, {'kind': 'busy', 'running': True},
         {'kind': 'routing', 'messageId': 'activity', 'target': {'provider': 'claude', 'account': 'work'}, 'reason': ''},
         {'kind': 'toolUse', 'messageId': 'activity', 'name': 'Bash', 'action': 'run', 'detail': 'python3 -m pytest /full/project/tests'},
         {'kind': 'toolUse', 'messageId': 'activity', 'name': 'Read', 'action': 'read', 'path': '/full/project/src/index.ts'},
         {'kind': 'toolUse', 'messageId': 'activity', 'name': 'Read', 'action': 'read', 'path': '/full/project/src/other.ts'},
         {'kind': 'toolUse', 'messageId': 'activity', 'name': 'mcp__internal_tool', 'action': 'other', 'detail': '{"secretSyntax":"visible on request"}'})
    group = page.locator('.cx-c-group')
    expect(group).to_contain_text('hat 2 Dateien gelesen')
    expect(page.locator('.cx-c-command-body')).to_have_count(0)
    group.locator(':scope > .cx-c-line').click()
    expect(page.locator('.cx-c-group-items')).to_contain_text('Tests ausgeführt')
    expect(page.locator('.cx-c-group-items')).to_contain_text('Werkzeug verwendet')
    expect(page.locator('.cx-c-raw-detail')).to_have_count(0)
    expect(page.locator('.cx-c-filelink').first).to_have_text('index.ts')
    page.locator('.cx-c-step .cx-c-line').first.click()
    expect(page.locator('.cx-c-command-body')).to_have_text('python3 -m pytest /full/project/tests')

    def setting(label, value):
        page.locator('.cx-settings-btn').click()
        page.get_by_role('button', name='Details der Tätigkeiten', exact=True).click()
        page.get_by_role('option', name=label).click()
        assert page.evaluate("value => window.__hostMessages.some(m => m.kind === 'setNativeSetting' && m.key === 'cortex.activityVerbosity' && m.value === value && m.requestId)", value)
        page.get_by_role('button', name='Zurück zur App').click()

    setting('Ausführlich', 'detailed')
    expect(page.locator('.cx-c-command-body')).to_have_text('python3 -m pytest /full/project/tests')
    expect(page.locator('.cx-c-raw-detail').first).to_contain_text('/full/project/src/index.ts')
    expect(page.locator('.cx-c-raw-detail').last).to_contain_text('mcp__internal_tool')
    expect(page.locator('.cx-c-raw-detail').last).to_contain_text('secretSyntax')
    setting('Minimal', 'minimal')
    expect(page.locator('.cx-c-activity-minimal')).to_contain_text('hat 2 Dateien gelesen')
    expect(page.locator('.cx-c-step')).to_have_count(0)
    expect(page.locator('.cx-c-command-body')).to_have_count(0)
    setting('Kompakt', 'compact')
    expect(page.locator('.cx-c-group > .cx-c-line')).to_have_attribute('aria-expanded', 'false')
    expect(page.locator('.cx-c-command-body')).to_have_count(0)
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    assert not errors, errors
    print('Activity UI: compact semantic labels/counts, inspectable full commands, detailed paths/tool arguments, minimal summaries, and persisted setting messages passed.')
