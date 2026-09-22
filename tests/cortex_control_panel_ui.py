"""Chatwechsel und Ausgaben-Panel: echte Oberfläche, gefälschter Host.

Zwei Zusagen werden geprüft:

1. Ein Klick auf einen Chat markiert ihn sofort — auch wenn der Host den
   Wechsel noch nicht beantwortet hat.
2. Ein langer Chat wird in einem Zug gezeichnet, nicht einmal pro gespeichertem
   Eintrag. Vorher stand das Fenster dabei sekundenlang.

Außerdem: Das Panel bleibt im Fenster und faltet lange Listen zusammen, damit
„Hintergrundprozesse" und „Quellen" sichtbar bleiben.
"""
import time
from playwright.sync_api import expect
from headless_browser import headless_browser

BASE = 'http://127.0.0.1:4173/dev/preview.html?mode=agent'

with headless_browser() as browser:
    page = browser.new_page(viewport={'width': 1440, 'height': 950})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    page.locator('#harness').evaluate('(el) => el.remove()')

    def post(message):
        page.evaluate('m => window.postMessage(m, "*")', message)

    def row(title):
        return page.locator('.cx-tree-task', has=page.get_by_role('button', name=title, exact=True))

    # 1. Die Markierung wartet nicht auf den Host. Dessen Antwort wird dafür
    # unterbrochen: ein langsamer Host darf den Klick nicht verschlucken.
    page.evaluate('''() => {
      const real = window.dispatchEvent.bind(window);
      window.__blockHost = true;
      window.dispatchEvent = event => (window.__blockHost && event.type === 'preview:host') ? true : real(event);
    }''')
    target = row('Neue Startseite entwickeln')
    target.get_by_role('button', name='Neue Startseite entwickeln', exact=True).click()
    # Der Host antwortet hier nie: die Markierung muss trotzdem stehen.
    expect(target).to_have_class(__import__('re').compile(r'\bactive\b'), timeout=2000)
    assert page.evaluate('''() => (window.__hostMessages || []).some(m => m.kind === 'openConversation' && m.id === 'site')''')
    assert page.locator('.cx-tree-task.active').count() == 1

    # Antwortet der Host, bleibt der gewählte Chat markiert.
    page.evaluate('() => { window.__blockHost = false; }')
    target.get_by_role('button', name='Neue Startseite entwickeln', exact=True).click()
    expect(target).to_have_class(__import__('re').compile(r'\bactive\b'))
    page.wait_for_timeout(300)

    # 2. Ein langer Chat: 3000 gespeicherte Einträge, wie ihn der Host abspielt.
    log = [{'kind': 'userEcho', 'text': 'Grosser Chat'}]
    for turn in range(150):
        mid = f'msg-{turn}'
        log.append({'kind': 'delta', 'messageId': mid, 'text': 'Ich pruefe die Daten. '})
        for step in range(18):
            log.append({'kind': 'toolUse', 'messageId': mid, 'name': 'Read', 'path': f'/p/t{turn}-{step}.txt', 'action': 'read'})
        log.append({'kind': 'done', 'messageId': mid})
    page.evaluate('entries => { window.__log = entries; }', log)

    # Gezählt wird, wie oft der Verlauf während des Nachladens umgebaut wird.
    page.evaluate('''() => {
      window.__redraws = 0;
      const scroll = document.querySelector('.cx-transcript-scroll') || document.querySelector('.cx-conversation');
      window.__observer = new MutationObserver(records => { window.__redraws += records.length; });
      window.__observer.observe(scroll, { childList: true, subtree: true });
    }''')
    started = time.time()
    page.evaluate('''() => {
      window.postMessage({kind: 'conversationReset'}, '*');
      for (const entry of window.__log) window.postMessage(entry, '*');
      window.postMessage({kind: 'conversationReady'}, '*');
    }''')
    page.wait_for_function('document.querySelectorAll(".cx-transcript-scroll .cx-c-prose").length >= 150', timeout=120000)
    elapsed = time.time() - started
    redraws = page.evaluate('() => { window.__observer.disconnect(); return window.__redraws; }')
    # Einzeln angewandt waren es über 8 Sekunden und Tausende Umbauten.
    assert elapsed < 3, f'Chatwechsel dauerte {elapsed:.2f}s'
    assert redraws < 400, f'{redraws} Umbauten beim Nachladen'
    print(f'Chatwechsel: {elapsed:.2f}s, {redraws} Umbauten fuer {len(log)} Eintraege')

    # 3. Das Panel: viele geschriebene und gelesene Dateien.
    post({'kind': 'conversationReset'})
    post({'kind': 'userEcho', 'text': 'Bau mir das bitte.'})
    for i in range(24):
        post({'kind': 'toolUse', 'messageId': 'panel', 'name': 'Write', 'path': f'/p/ausgabe-{i}.py', 'action': 'write'})
        post({'kind': 'toolUse', 'messageId': 'panel', 'name': 'Read', 'path': f'/p/quelle-{i}.txt', 'action': 'read'})
    post({'kind': 'done', 'messageId': 'panel'})
    post({'kind': 'conversationReady'})
    panel = page.locator('.cx-control-panel')
    expect(panel).to_be_visible()

    # Höchstens fünf Zeilen je Liste, und beide Abschnitte bleiben erreichbar.
    expect(panel.get_by_role('button', name='Alle anzeigen (24)')).to_have_count(2)
    assert panel.locator('.cx-control-row:not(.cx-control-more)').count() == 10
    expect(panel.get_by_text('Hintergrundprozesse', exact=True)).to_be_visible()
    expect(panel.get_by_text('Quellen', exact=True)).to_be_visible()

    def geometry():
        return page.evaluate('''() => {
          const panel = document.querySelector('.cx-control-panel');
          const box = panel.getBoundingClientRect();
          return {bottom: box.bottom, top: box.top, viewport: innerHeight,
                  scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
                  overflow: getComputedStyle(panel).overflowY};
        }''')

    folded = geometry()
    assert folded['top'] > 0 and folded['bottom'] <= folded['viewport'], folded
    assert folded['scrollHeight'] <= folded['clientHeight'] + 1, folded

    # Ausgeklappt wächst die Liste im Panel, nicht aus dem Fenster heraus.
    panel.get_by_role('button', name='Alle anzeigen (24)').first.click()
    expect(panel.get_by_role('button', name='Weniger anzeigen')).to_be_visible()
    opened = geometry()
    assert opened['bottom'] <= opened['viewport'], opened
    assert opened['overflow'] == 'auto' and opened['scrollHeight'] > opened['clientHeight'], opened
    panel.get_by_role('button', name='Weniger anzeigen').click()
    expect(panel.get_by_role('button', name='Alle anzeigen (24)')).to_have_count(2)

    page.screenshot(path='docs/screenshots/control-panel.png')
    assert not errors, errors
    print('PASS: sofortige Chatmarkierung, gebuendeltes Nachladen, gefaltetes Ausgaben-Panel')
