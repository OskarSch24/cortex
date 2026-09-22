"""Issue #26–42 rendering against the real bundle, with fake host events only."""
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
    post(page, {'kind': 'conversationReset'}, {'kind': 'conversationReady'})
    code = '```typescript\n' + '\n'.join(f'field{i}: string;' for i in range(25)) + '\n```'
    post(page, {'kind': 'userEcho', 'text': code, 'at': 1000}, {'kind': 'busy', 'running': True},
         {'kind': 'routing', 'messageId': 'issues', 'target': {'provider': 'claude', 'account': 'work'}, 'reason': ''},
         {'kind': 'toolUse', 'messageId': 'issues', 'name': 'Read', 'action': 'read', 'path': 'package.json', 'added': 0, 'removed': 0},
         {'kind': 'runClock', 'elapsedMs': 5000})
    expect(page.locator('.cx-c-bubble-text')).to_contain_text('field24')
    assert 'clamp' not in page.locator('.cx-c-bubble-text').get_attribute('class')
    expect(page.locator('.run-state')).to_be_visible()
    expect(page.locator('.cx-c-counts')).to_have_count(0)
    post(page, {'kind': 'toolUse', 'messageId': 'issues', 'name': 'Edit', 'action': 'edit', 'path': 'App.tsx', 'added': 2, 'removed': 1},
         {'kind': 'delta', 'messageId': 'issues', 'text': '```python\nprint(1)\nprint(2)\n```\nFrontend http://localhost:5173/#/app?theme=dark. Backend http://localhost:8000/api.'},
         {'kind': 'done', 'messageId': 'issues', 'durationMs': 5000}, {'kind': 'busy', 'running': False})
    expect(page.locator('.md-codeblock pre')).to_contain_text('print(2)')
    expect(page.locator('.cx-c-web')).to_have_count(2)
    expect(page.locator('.cx-c-web').first).to_contain_text('localhost:5173')
    undo = page.locator('.cx-c-changes button').filter(has_text='Rückgängig machen')
    expect(undo).to_be_disabled()
    post(page, {'kind': 'revertState', 'messageId': 'issues', 'available': True})
    expect(undo).to_be_enabled()
    post(page, {'kind': 'revertState', 'messageId': 'issues', 'available': False, 'reason': 'Stand ersetzt'})
    expect(undo).to_be_disabled()
    expect(undo).to_have_attribute('aria-label', 'Rückgängig nicht verfügbar: Stand ersetzt')
    post(page, {'kind': 'rated', 'messageId': 'issues', 'poor': True})
    expect(page.locator('.answer-rating-status')).to_contain_text('Bewertung gespeichert')
    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth')
    page.close()
    tab = browser.new_page(viewport={'width': 900, 'height': 800})
    tab.goto('http://127.0.0.1:4173/dev/preview.html?mode=chat&scenario=empty')
    tab.wait_for_load_state('networkidle')
    post(tab, {'kind': 'conversationReset'}, {'kind': 'delta', 'messageId': 'code', 'text': '```python\n' + 'print(1)\n' * 9 + '```'}, {'kind': 'done', 'messageId': 'code'})
    tab.locator('.cx-code-card').get_by_role('button', name='Ansehen').click()
    assert tab.evaluate("window.__hostMessages.some(message => message.kind === 'openCode' && message.language === 'python' && message.text.includes('print(1)'))")
    tab.close()
    assert errors == [], errors
    print('Issue chat UI: complete fenced prompt, live tools, snippets, multiple previews, disabled undo, rating feedback and editor code opening passed.')
