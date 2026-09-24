"""Local-only Computerverlauf settings: real host protocol, opt-in and isolation.

The host is mocked with synthetic activity; no real app text or desktop browser
is touched. Run after the webview build. Only tests/headless_browser.py launches
Playwright's separate chromium-headless-shell.
"""
from pathlib import Path
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'
OUT = Path(__file__).resolve().parents[1] / 'docs/screenshots'
OUT.mkdir(parents=True, exist_ok=True)

HOST = r"""(() => {
  const today = new Date(); today.setHours(10, 15, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  window.__historyMessages = [];
  window.__historyPending = null;
  window.__historyState = {
    settings: { enabled: false, allowedApps: [], retentionDays: 7 },
    permission: false, model: 'available', running: false,
    status: 'Die Erfassung ist pausiert.',
    apps: [
      { id: 'com.apple.TextEdit', name: 'TextEdit', supported: true },
      { id: 'com.apple.Notes', name: 'Notizen', supported: true },
      { id: 'com.apple.Safari', name: 'Safari', supported: false, reason: 'Browser sind ausgeschlossen, weil private Fenster nicht zuverlässig erkannt werden.' }
    ],
    entries: [
      { id: 'fixture-today', startedAt: today.getTime(), endedAt: today.getTime()+120000,
        appId: 'com.apple.TextEdit', appName: 'TextEdit', title: 'Projektplan',
        text: 'Testquelle: Den Entwurf bis Freitag überarbeiten.', summary: 'Den Projektplan und die nächsten Schritte überarbeitet.' },
      { id: 'fixture-yesterday', startedAt: yesterday.getTime(), endedAt: yesterday.getTime()+600000,
        appId: 'com.apple.Notes', appName: 'Notizen', title: 'Ideensammlung',
        text: 'Testquelle: Ideen für die nächste Woche.', summary: 'Ideen für die nächste Woche gesammelt.' }
    ], total: 2
  };
  window.__historyFilter = {};
  window.__historyEmit = () => {
    const state = structuredClone(window.__historyState), filter = window.__historyFilter;
    state.entries = state.entries.filter(e => (!filter.from || e.startedAt >= filter.from)
      && (!filter.to || e.startedAt <= filter.to)
      && (!filter.query || [e.title,e.text,e.summary,e.appName].join(' ').toLowerCase().includes(filter.query.toLowerCase())));
    window.postMessage({kind:'computerHistoryState',state}, '*');
  };
  window.__historyAnswer = request => window.postMessage({kind:'computerHistoryAnswer',requestId:request.requestId,result:{
    question:request.question,answer:'Du hast den Projektplan überarbeitet. [1]',
    sources:[{id:'fixture-today',startedAt:today.getTime(),appName:'TextEdit',title:'Projektplan'}]
  }}, '*');
  window.addEventListener('preview:host', event => {
    const message = event.detail;
    window.__historyMessages.push(message);
    if (message.kind !== 'computerHistory') return;
    const state = window.__historyState;
    switch (message.action) {
      case 'state': window.__historyFilter = message; break;
      case 'configure': Object.assign(state.settings,message.settings);
        state.running = state.settings.enabled && state.permission;
        state.status = state.running ? 'Freigegebene App wird erfasst.' : 'Die Erfassung ist pausiert.'; break;
      case 'permission': state.permission = true; break;
      case 'delete': state.entries = state.entries.filter(e=>e.id!==message.id); state.total=state.entries.length; break;
      case 'clear': state.entries=[]; state.total=0; state.settings.enabled=false; state.running=false; break;
      case 'ask': window.__historyPending = message; return;
      case 'unsubscribe': return;
      default: throw new Error('Unexpected history operation');
    }
    setTimeout(window.__historyEmit, 5);
  });
})();"""


def sent(page, action, **fields):
    return any(m.get('kind') == 'computerHistory' and m.get('action') == action
               and all(m.get(k) == v for k, v in fields.items())
               for m in page.evaluate('window.__historyMessages'))


with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1360, 'height': 1000}, device_scale_factor=1)
    page.add_init_script(HOST)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(element) => element.remove()')
    page.locator('.cx-settings-btn').click()
    page.locator('.cxs-nav').get_by_role('button', name='Computerverlauf', exact=True).click()
    expect(page.locator('.cxs-page-head h1')).to_have_text('Computerverlauf')
    expect(page.locator('.cxs-history-local')).to_contain_text('Keine Verbindung zu ChatGPT')
    expect(page.locator('.cxs-preview')).to_have_count(0)
    toggle = page.get_by_role('switch', name='Computerverlauf erfassen', exact=True)
    expect(toggle).to_have_attribute('aria-checked', 'false')
    expect(toggle).to_be_disabled()
    assert not sent(page, 'configure'), 'Opening the page must never opt in.'

    # App choice and macOS consent are both required; browsers cannot be enabled.
    browser_toggle = page.get_by_role('switch', name='Safari in Verlauf einbeziehen')
    expect(browser_toggle).to_be_disabled()
    expect(browser_toggle).to_have_attribute('aria-checked', 'false')
    page.get_by_role('switch', name='TextEdit in Verlauf einbeziehen').click()
    expect(page.get_by_role('switch', name='TextEdit in Verlauf einbeziehen')).to_have_attribute('aria-checked', 'true')
    expect(toggle).to_be_disabled()
    assert sent(page, 'configure', settings={'allowedApps': ['com.apple.TextEdit']})
    page.get_by_role('button', name='Zugriff erlauben', exact=True).click()
    expect(toggle).to_be_enabled()
    assert sent(page, 'permission')
    expect(toggle).to_have_attribute('aria-checked', 'false')
    toggle.click()
    expect(toggle).to_have_attribute('aria-checked', 'true')
    expect(page.locator('.cxs-history-status')).to_have_text('Aktiv')
    assert sent(page, 'configure', settings={'enabled': True})

    # Retention changes use the history channel, never generic app settings.
    page.get_by_role('button', name='Aufbewahrungsdauer').click()
    page.get_by_role('option', name='Nach 30 Tagen', exact=True).click()
    expect(page.get_by_role('button', name='Aufbewahrungsdauer')).to_have_text('Nach 30 Tagen')
    assert sent(page, 'configure', settings={'retentionDays': 30})

    expect(page.locator('.cxs-history-entry')).to_have_count(2)
    page.get_by_label('Verlauf durchsuchen', exact=True).fill('Projektplan')
    expect(page.locator('.cxs-history-entry')).to_have_count(1)
    expect(page.locator('.cxs-history-entry h4')).to_have_text('Projektplan')
    page.get_by_label('Verlauf durchsuchen', exact=True).fill('')
    expect(page.locator('.cxs-history-entry')).to_have_count(2)
    page.get_by_role('button', name='Zeitraum', exact=True).click()
    page.get_by_role('option', name='Gestern', exact=True).click()
    expect(page.locator('.cxs-history-entry')).to_have_count(1)
    expect(page.locator('.cxs-history-entry h4')).to_have_text('Ideensammlung')
    page.get_by_role('button', name='Zeitraum', exact=True).click()
    page.get_by_role('option', name='Alle Tage', exact=True).click()
    expect(page.locator('.cxs-history-entry')).to_have_count(2)
    page.locator('.cxs-history-entry').first.locator('summary').click()
    expect(page.locator('.cxs-history-entry').first.locator('pre')).to_have_text('Testquelle: Den Entwurf bis Freitag überarbeiten.')

    # Questions are scoped to this page and replies use a request id.
    page.get_by_label('Frag deinen lokalen Verlauf', exact=True).fill('Woran habe ich gearbeitet?')
    page.get_by_role('button', name='Lokal fragen', exact=True).click()
    expect(page.get_by_role('button', name='Denkt lokal …')).to_be_disabled()
    page.evaluate('window.__historyAnswer(window.__historyPending)')
    expect(page.locator('.cxs-history-answer')).to_contain_text('Du hast den Projektplan überarbeitet.')
    expect(page.get_by_role('list', name='Quellen der Antwort')).to_contain_text('TextEdit')
    page.locator('.cxs-history-question').evaluate('(element) => element.scrollIntoView({block: "start"})')
    page.screenshot(path=str(OUT / 'settings-computerverlauf-answer.png'))
    toggle.click()
    expect(toggle).to_have_attribute('aria-checked', 'false')
    expect(page.locator('.cxs-history-answer')).to_have_count(0)

    # A late model response after deletion must never restore removed context.
    page.get_by_role('button', name='Lokal fragen', exact=True).click()
    page.locator('.cxs-history-entry').first.get_by_role('button').click()
    expect(page.locator('.cxs-history-entry')).to_have_count(1)
    page.evaluate('window.__historyAnswer(window.__historyPending)')
    expect(page.locator('.cxs-history-answer')).to_have_count(0)

    # Destructive bulk action is concrete and dismissible by Escape or outside.
    page.get_by_role('button', name='Alles löschen', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('button', name='Abbrechen', exact=True)).to_be_focused()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert not sent(page, 'clear')
    page.get_by_role('button', name='Alles löschen', exact=True).click()
    page.locator('.cxs-history-backdrop').click(position={'x': 10, 'y': 10})
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert not sent(page, 'clear')

    # Layout at normal desktop and narrow app-window widths.
    for width in [1360, 820, 620]:
        page.set_viewport_size({'width': width, 'height': 1000})
        page.locator('.cxs-scroll').evaluate('(element) => element.scrollTop = 0')
        assert page.locator('.cxs-history').evaluate('(element) => element.scrollWidth <= element.clientWidth + 1'), f'History overflows at {width}px'
        assert page.locator('.cxs-main').evaluate('(element) => element.scrollWidth <= element.clientWidth + 1'), f'Main panel overflows at {width}px'
        page.screenshot(path=str(OUT / f'settings-computerverlauf-{width}.png'))
        page.locator('.cxs-history-question').evaluate('(element) => element.scrollIntoView({block: "start"})')
        page.screenshot(path=str(OUT / f'settings-computerverlauf-timeline-{width}.png'))

    page.get_by_role('button', name='Alles löschen', exact=True).click()
    page.get_by_role('button', name='Verlauf endgültig löschen', exact=True).click()
    expect(page.locator('.cxs-history-entry')).to_have_count(0)
    expect(page.get_by_role('button', name='Alles löschen', exact=True)).to_be_disabled()
    assert sent(page, 'clear')
    expect(toggle).to_have_attribute('aria-checked', 'false')

    # An unavailable native model stays visibly unavailable and never falls back.
    page.evaluate('''() => {
      window.__historyState.model = 'unavailable';
      window.__historyState.modelReason = 'Apple Intelligence ist nicht aktiviert.';
      window.__historyState.error = 'Die lokale Komponente ist gerade nicht verfügbar.';
      window.__historyEmit();
    }''')
    expect(toggle).to_be_disabled()
    expect(page.get_by_label('Frag deinen lokalen Verlauf', exact=True)).to_be_disabled()
    expect(page.locator('.cxs-history-error')).to_contain_text('Die lokale Komponente ist gerade nicht verfügbar.')
    expect(page.locator('.cxs-history-status')).to_have_text('Pausiert')

    page.locator('.cxs-nav').get_by_role('button', name='Allgemein', exact=True).click()
    assert sent(page, 'unsubscribe'), 'Leaving the page must end the history subscription.'
    history_messages = page.evaluate('window.__historyMessages')
    assert not any(message.get('kind') in ('send', 'setAppSetting') for message in history_messages), 'History leaked to chat or generic settings.'
    assert not errors, errors
    page.close()
    print('Computerverlauf: opt-in, local-only messages, filters, sources, pause, deletion, responsive layout and cleanup passed.')
